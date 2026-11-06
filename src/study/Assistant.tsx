import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import {
  AlertTriangle, ArrowUp, BookOpen, Brain, Check, ChevronDown, Compass, FileText, Lightbulb, MessageSquarePlus, Search,
  Settings2, Sparkles, Square, Target, TrendingUp,
} from "lucide-react";
import { useAssistant, type Activity } from "../ai/assistant";
import { useAiConfig } from "../ai/config";
import { CreateLessonInput, buildLesson } from "../ai/lessonTool";
import type { AssistantTurn, ChatTurn } from "../ai/types";
import { Markdown } from "../components/Markdown";
import { useLibrary } from "../lib/library";
import { navigate, paths } from "../lib/router";
import { useSound } from "../lib/sound";
import { useNotes } from "../rag/notes";
import { LogoMark } from "../ui/Logo";
import { useToast } from "../ui/Toasts";

const SUGGESTIONS = [
  { icon: FileText, label: "Summarise my notes", prompt: "Summarise my notes: the main ideas, key terms and anything I should memorise." },
  { icon: Sparkles, label: "Make a lesson from my notes", prompt: "Make an interactive lesson from my notes, with quick checks and flashcards." },
  { icon: Target, label: "Quiz me on my weak spots", prompt: "Make a practice quiz on the questions and topics I've been getting wrong." },
  { icon: TrendingUp, label: "How am I doing?", prompt: "Look at my progress and tell me how I'm doing: what's going well, what to review, and a plan for my next study session." },
  { icon: Lightbulb, label: "Explain something simply", prompt: "Explain a tricky idea from my notes as simply as you can, with an example." },
];

const isTouch = () => window.matchMedia("(pointer: coarse)").matches;

function ActivityChip({ activity }: { activity?: Activity }) {
  if (!activity) return null;
  const Icon = activity.running ? Search : activity.error ? AlertTriangle : activity.lessonKey ? Sparkles : Check;
  return <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${activity.error ? "border-warning/40 bg-warning/8" : "border-base-300 bg-base-200/60"}`}>
    {activity.running ? <span className="loading loading-spinner loading-xs text-primary" /> : <Icon size={15} className={activity.error ? "text-warning" : "text-primary"} />}
    <span className="min-w-0 flex-1 truncate text-base-content/75">{activity.running ? `${activity.label}…` : activity.summary ?? activity.label}</span>
    {activity.lessonKey && <button className="btn btn-primary btn-xs press" onClick={() => navigate(paths.lesson(activity.lessonKey!))}><BookOpen size={13} /> Open</button>}
  </div>;
}

function Thinking({ text, live }: { text: string; live?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!text.trim()) return null;
  return <div className="text-sm">
    <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-base-content/50 transition-colors hover:text-base-content/80" aria-expanded={open}>
      <Brain size={14} /> {live ? "Thinking…" : "Thought process"} <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <div className="animate-fade mt-2 whitespace-pre-wrap border-l-2 border-base-300 pl-3 text-[0.85rem] leading-6 text-base-content/55">{text.trim()}</div>}
  </div>;
}

/** A lesson the model wrote as a ```curie-lesson block (used when tools are off). */
function LessonDraft({ json }: { json: string }) {
  const library = useLibrary();
  const toast = useToast();
  const [saved, setSaved] = useState<string>();
  const result = useMemo(() => {
    try {
      const parsed = CreateLessonInput.safeParse(JSON.parse(json));
      return parsed.success ? buildLesson(parsed.data) : { ok: false as const, problems: parsed.error.issues.slice(0, 3).map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
    } catch {
      return { ok: false as const, problems: ["The lesson isn't valid JSON."] };
    }
  }, [json]);
  return <div className="flex items-center gap-3 rounded-xl border border-base-300 bg-base-100 p-3">
    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-content"><Sparkles size={17} /></span>
    <div className="min-w-0 flex-1 text-sm">
      {result.ok ? <><p className="truncate font-semibold">{result.content.manifest.title}</p><p className="text-base-content/55">A lesson draft from the assistant</p></>
        : <><p className="font-semibold">This lesson draft has problems</p><p className="truncate text-base-content/55">{result.problems.join("; ")}</p></>}
    </div>
    {result.ok && (saved
      ? <button className="btn btn-sm btn-ghost" onClick={() => navigate(paths.lesson(saved))}><BookOpen size={14} /> Open</button>
      : <button className="btn btn-sm btn-primary press" onClick={async () => {
        const record = await library.addLesson(result.content);
        setSaved(record.key);
        toast.success(`“${record.manifest.title}” was added to your library.`, { title: "Lesson saved" });
      }}>Save as lesson</button>)}
  </div>;
}

function AssistantText({ text, streaming }: { text: string; streaming?: boolean }) {
  const parts = text.split(/```curie-lesson\s*\n([\s\S]*?)(?:```|$)/);
  return <>{parts.map((part, index) => index % 2 === 1
    ? (streaming && index === parts.length - 2 && !text.trimEnd().endsWith("```") ? <p key={index} className="text-sm text-base-content/55">Writing a lesson…</p> : <LessonDraft key={index} json={part} />)
    : part.trim() ? <Markdown key={index} content={part} className="text-[0.97rem] [&_p]:my-2" /> : null)}</>;
}

function AssistantMessage({ turns, activity }: { turns: AssistantTurn[]; activity: Record<string, Activity> }) {
  const thinking = turns.map((turn) => turn.thinking ?? "").filter(Boolean).join("\n\n");
  return <div className="flex gap-3">
    <LogoMark size={26} className="mt-0.5 shrink-0" />
    <div className="flex min-w-0 flex-1 flex-col gap-2.5">
      <Thinking text={thinking} />
      {turns.map((turn, index) => <Fragment key={index}>
        {turn.text.trim() && <AssistantText text={turn.text} />}
        {turn.toolCalls.map((call) => <ActivityChip key={call.id} activity={activity[call.id]} />)}
      </Fragment>)}
    </div>
  </div>;
}

/** Groups the conversation into the bubbles shown on screen. */
function groups(turns: ChatTurn[]) {
  const result: ({ kind: "user"; text: string } | { kind: "assistant"; turns: AssistantTurn[] })[] = [];
  for (const turn of turns) {
    if (turn.role === "user") result.push({ kind: "user", text: turn.text });
    else if (turn.role === "assistant") {
      const last = result.at(-1);
      if (last?.kind === "assistant") last.turns.push(turn);
      else result.push({ kind: "assistant", turns: [turn] });
    }
  }
  return result;
}

function SetupCard() {
  return <div className="mx-auto mt-6 max-w-lg rounded-2xl border border-base-300 bg-base-100 p-5 text-left">
    <p className="font-display text-lg font-semibold">Connect an AI model</p>
    <p className="mt-1 text-sm leading-6 text-base-content/60">The assistant works with Claude, any OpenAI-compatible service, or Ollama running on this computer or your local network. Your notes stay on this device; only what you ask about is sent to the model you choose.</p>
    <button className="btn btn-primary mt-4 press" onClick={() => navigate(paths.settingsSection("ai"))}><Settings2 size={16} /> Set up the assistant</button>
  </div>;
}

export default function Assistant() {
  const { turns, activity, running, live, notice, error, send, stop, reset } = useAssistant();
  const { provider, label } = useAiConfig();
  const { notes } = useNotes();
  const play = useSound();
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => groups(turns), [turns]);

  // Follow the conversation as it grows, unless the student scrolled up to read.
  const following = useRef(true);
  useEffect(() => {
    const onScroll = () => { following.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160; };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => { if (following.current) end.current?.scrollIntoView({ block: "end" }); }, [shown.length, live?.text, live?.thinking, running]);

  const submit = (text = draft) => {
    if (!text.trim() || running) return;
    following.current = true;
    send(text);
    setDraft("");
    play("pop");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !isTouch()) { event.preventDefault(); submit(); }
  };

  const empty = shown.length === 0 && !running;

  return <div className="flex min-h-[calc(100dvh-11rem)] flex-col lg:min-h-[calc(100dvh-9rem)]">
    <div className="flex-1">
      {empty ? <div className="flex flex-col items-center px-2 pt-8 text-center sm:pt-14">
        <LogoMark size={44} />
        <h2 className="font-display mt-5 text-2xl font-semibold sm:text-3xl">What do you want to learn?</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-base-content/60">
          {notes.length ? `Ask about your ${notes.length} ${notes.length === 1 ? "note" : "notes"}, turn them into lessons and quizzes, or get guidance on what to study next.` : "Add your notes on the Notes tab, then ask questions, turn them into lessons and quizzes, or get guidance on what to study next."}
        </p>
        {provider ? <div className="mt-7 grid w-full max-w-xl gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map((suggestion) => <button key={suggestion.label} onClick={() => submit(suggestion.prompt)}
            className="press flex items-center gap-3 rounded-xl border border-base-300 bg-base-100 px-3.5 py-3 text-left text-sm font-medium transition-colors hover:border-base-content/20 hover:bg-base-200/50">
            <suggestion.icon size={17} className="shrink-0 text-primary" /> {suggestion.label}
          </button>)}
          {!notes.length && <button onClick={() => navigate(paths.notes)} className="press flex items-center gap-3 rounded-xl border border-dashed border-base-300 px-3.5 py-3 text-left text-sm font-medium text-base-content/70 hover:bg-base-200/50"><Compass size={17} className="shrink-0" /> Add your notes first</button>}
        </div> : <SetupCard />}
      </div> : <div role="log" aria-label="Conversation with the study assistant" className="flex flex-col gap-6 pb-4 pt-2">
        {shown.map((group, index) => group.kind === "user"
          ? <div key={index} className="flex justify-end"><p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[0.95rem] text-primary-content">{group.text}</p></div>
          : <AssistantMessage key={index} turns={group.turns} activity={activity} />)}
        {running && live && <div className="flex gap-3">
          <LogoMark size={26} animated className="mt-0.5 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            {live.thinking && <Thinking text={live.thinking} live={!live.text} />}
            {live.text ? <AssistantText text={live.text} streaming /> : !live.thinking && <span className="mt-1 flex gap-1" aria-label="Working"><span className="size-1.5 animate-pulse rounded-full bg-base-content/40" /><span className="size-1.5 animate-pulse rounded-full bg-base-content/40 [animation-delay:150ms]" /><span className="size-1.5 animate-pulse rounded-full bg-base-content/40 [animation-delay:300ms]" /></span>}
          </div>
        </div>}
        {notice && <p className="rounded-lg bg-base-200 px-3 py-2 text-sm text-base-content/70">{notice}</p>}
        {error && <div role="alert" className="flex items-start gap-3 rounded-xl border border-error/30 bg-error/8 p-3 text-sm">
          <AlertTriangle size={17} className="mt-0.5 shrink-0 text-error" />
          <p className="flex-1">{error.message}</p>
          {(error.kind === "auth" || error.kind === "model" || error.kind === "tools") && <button className="btn btn-xs btn-ghost" onClick={() => navigate(paths.settingsSection("ai"))}>Settings</button>}
        </div>}
      </div>}
      <div ref={end} />
    </div>

    <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 -mx-1 bg-base-100 px-1 pb-2 pt-3 lg:bottom-0 lg:pb-5">
      <div className="surface flex items-end gap-2 rounded-2xl p-2 focus-within:border-primary/50">
        <textarea ref={input} rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown}
          placeholder={provider ? "Ask about your notes, or ask for a lesson or quiz…" : "Set up an AI model in Settings to start"}
          disabled={!provider} aria-label="Message the study assistant"
          className="max-h-48 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[0.95rem] leading-6 outline-none [field-sizing:content] placeholder:text-base-content/40" />
        {running
          ? <button className="btn btn-square btn-sm rounded-xl press" aria-label="Stop" onClick={stop}><Square size={14} fill="currentColor" /></button>
          : <button className="btn btn-primary btn-square btn-sm rounded-xl press" aria-label="Send" disabled={!draft.trim() || !provider} onClick={() => submit()}><ArrowUp size={18} /></button>}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 px-1 text-xs text-base-content/45">
        <button className="truncate hover:text-base-content/70" onClick={() => navigate(paths.settingsSection("ai"))} title="Change the model">{provider ? label : "No model set up"}</button>
        {turns.length > 0 && <button className="flex shrink-0 items-center gap-1 hover:text-base-content/70" onClick={() => { reset(); play("tap"); }}><MessageSquarePlus size={13} /> New chat</button>}
      </div>
    </div>
  </div>;
}
