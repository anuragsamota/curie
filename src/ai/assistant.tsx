// The study assistant's conversation. It lives at the app level so an answer keeps streaming while
// the student moves around the app, and it is saved so the chat survives restarts.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { readData, writeData } from "../lib/appdata";
import { useLibrary } from "../lib/library";
import { progressReport, summarize, useProgress } from "../lib/progress";
import { navigate, paths } from "../lib/router";
import { useNotes } from "../rag/notes";
import { closeDanglingToolCalls, runAgent, type AgentEvent } from "./agent";
import { useAiConfig } from "./config";
import { excerptContext, systemPrompt } from "./prompts";
import { studyTools } from "./tools";
import { ProviderError, type ChatTurn, type ProviderErrorKind } from "./types";

/** How a tool call is shown in the chat, kept after the run. */
export type Activity = { label: string; summary?: string; running?: boolean; error?: boolean; lessonKey?: string; lessonTitle?: string };
type Saved = { version: 1; turns: ChatTurn[]; activity: Record<string, Activity> };

type AssistantValue = {
  turns: ChatTurn[];
  activity: Record<string, Activity>;
  running: boolean;
  /** The answer being streamed right now. */
  live?: { text: string; thinking: string };
  notice?: string;
  error?: { message: string; kind: ProviderErrorKind };
  send: (text: string) => void;
  /** Opens the assistant and asks it something (used by quick actions elsewhere in the app). */
  ask: (text: string) => void;
  stop: () => void;
  reset: () => void;
};

const AssistantContext = createContext<AssistantValue | null>(null);
const EMPTY: Saved = { version: 1, turns: [], activity: {} };

/**
 * Note excerpts sent with a question: the best matches, keeping only those close to the top score
 * (BM25 scores aren't comparable across libraries, so the cut-off is relative).
 */
function relevantExcerpts<T extends { score: number }>(hits: T[]): T[] {
  const top = hits[0]?.score ?? 0;
  return hits.filter((hit) => hit.score > 0 && hit.score >= top * 0.4);
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const { provider, ai } = useAiConfig();
  const notes = useNotes();
  const library = useLibrary();
  const progress = useProgress();
  const [saved, setSaved] = useState<Saved>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState<{ text: string; thinking: string }>();
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<{ message: string; kind: ProviderErrorKind }>();
  const controller = useRef<AbortController | undefined>(undefined);
  const savedRef = useRef(saved);
  savedRef.current = saved;

  // Latest app state for tools, which run long after the agent started.
  const state = useRef({ notes, library, progress });
  state.current = { notes, library, progress };

  useEffect(() => {
    void readData<Saved>("assistant-chat", EMPTY).then((data) => {
      setSaved(data?.version === 1 ? { ...data, turns: closeDanglingToolCalls(data.turns) } : EMPTY);
      setLoaded(true);
    });
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => void writeData("assistant-chat", saved).catch(() => undefined), 500);
    return () => clearTimeout(timer);
  }, [saved, loaded]);

  const tools = useMemo(() => studyTools({
    notes: () => state.current.notes.notes,
    search: (query, limit) => state.current.notes.search(query, limit),
    readNote: (id) => state.current.notes.read(id),
    lessons: () => state.current.library.lessons,
    loadLesson: (key) => state.current.library.load(key),
    createLesson: (content) => state.current.library.addLesson(content),
    progress: () => progressReport(summarize(state.current.progress.data, state.current.library.lessons)),
  }), []);

  const send = useCallback((text: string) => {
    const question = text.trim();
    if (!question || running) return;
    if (!provider) {
      setError({ message: "Set up an AI provider in Settings → AI assistant first.", kind: "auth" });
      return;
    }
    const hits = ai.autoContext ? relevantExcerpts(state.current.notes.search(question, 4)) : [];
    const history: ChatTurn[] = [...savedRef.current.turns, { role: "user", text: question, context: excerptContext(hits) }];
    setSaved((current) => ({ ...current, turns: history }));
    setRunning(true);
    setNotice(undefined);
    setError(undefined);
    setLive({ text: "", thinking: "" });
    const abort = new AbortController();
    controller.current = abort;

    // Streamed text is batched into one update per frame so long answers stay smooth.
    let pending = { text: "", thinking: "" };
    let frame = 0;
    const flush = () => {
      frame = 0;
      const chunk = pending;
      pending = { text: "", thinking: "" };
      setLive((current) => ({ text: (current?.text ?? "") + chunk.text, thinking: (current?.thinking ?? "") + chunk.thinking }));
    };
    const queue = (key: "text" | "thinking", delta: string) => {
      pending[key] += delta;
      frame ||= requestAnimationFrame(flush);
    };
    const resetLive = () => { cancelAnimationFrame(frame); frame = 0; pending = { text: "", thinking: "" }; setLive({ text: "", thinking: "" }); };

    const onEvent = (event: AgentEvent) => {
      switch (event.type) {
        case "turn_start": case "turn_retry": resetLive(); break;
        case "text": queue("text", event.delta); break;
        case "thinking": queue("thinking", event.delta); break;
        case "turn_end": case "tool_turn": {
          const turn = event.turn;
          if (event.type === "turn_end") resetLive();
          setSaved((current) => ({ ...current, turns: [...current.turns, turn] }));
          break;
        }
        case "tool_start":
          setSaved((current) => ({ ...current, activity: { ...current.activity, [event.call.id]: { label: event.activity, running: true } } }));
          break;
        case "tool_end":
          setSaved((current) => ({
            ...current,
            activity: {
              ...current.activity,
              [event.call.id]: { label: current.activity[event.call.id]?.label ?? event.call.name, summary: event.outcome.summary, error: event.outcome.isError, lessonKey: event.outcome.data?.lessonKey, lessonTitle: event.outcome.data?.lessonTitle },
            },
          }));
          break;
        case "notice": setNotice(event.message); break;
      }
    };

    void runAgent({ provider, system: systemPrompt({ tools: ai.tools }), history, tools: ai.tools ? tools : [], signal: abort.signal, effort: ai.effort, onEvent })
      .catch((caught: unknown) => {
        const failure = caught instanceof ProviderError ? caught : new ProviderError(caught instanceof Error ? caught.message : "Something went wrong.");
        // Keep the conversation valid for the next request: unanswered tool calls get a result.
        setSaved((current) => ({ ...current, turns: closeDanglingToolCalls(current.turns, failure.kind === "aborted" ? "Not run: stopped by the student." : `Not run: ${failure.message}`) }));
        if (failure.kind !== "aborted") setError({ message: failure.message, kind: failure.kind });
      })
      .finally(() => {
        cancelAnimationFrame(frame);
        setLive(undefined);
        setRunning(false);
        controller.current = undefined;
      });
  }, [ai.autoContext, ai.effort, ai.tools, provider, running, tools]);

  const ask = useCallback((text: string) => {
    navigate(paths.study);
    send(text);
  }, [send]);

  const stop = useCallback(() => controller.current?.abort(), []);
  const reset = useCallback(() => {
    controller.current?.abort();
    setSaved(EMPTY);
    setNotice(undefined);
    setError(undefined);
  }, []);

  const value = useMemo(() => ({ turns: saved.turns, activity: saved.activity, running, live, notice, error, send, ask, stop, reset }),
    [saved, running, live, notice, error, send, ask, stop, reset]);
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant() {
  const value = useContext(AssistantContext);
  if (!value) throw new Error("useAssistant must be used inside AssistantProvider");
  return value;
}
