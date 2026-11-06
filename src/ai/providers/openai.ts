// OpenAI-compatible Chat Completions over plain HTTP: OpenAI, OpenRouter, Groq, LM Studio, vLLM and
// any other server that speaks the same API.

import {
  ProviderError, type AssistantTurn, type ChatTurn, type CompletionRequest, type ModelProvider, type StopReason,
  type ToolSpec, type TurnRequest,
} from "../types";
import { ThinkSplitter, httpFailure, newCallId, parseArguments, readLines, request, trimSlash } from "./shared";

type Message =
  | { role: "system" | "user"; content: string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[] }
  | { role: "assistant"; content: string; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

export function toOpenAiMessages(system: string, history: ChatTurn[]): Message[] {
  const messages: Message[] = [{ role: "system", content: system }];
  for (const turn of history) {
    if (turn.role === "user") messages.push({ role: "user", content: turn.context ? `${turn.context}\n\n${turn.text}` : turn.text });
    else if (turn.role === "assistant") {
      messages.push({
        role: "assistant", content: turn.text,
        ...(turn.toolCalls.length ? { tool_calls: turn.toolCalls.map((call) => ({ id: call.id, type: "function" as const, function: { name: call.name, arguments: JSON.stringify(call.input ?? {}) } })) } : {}),
      });
    } else {
      for (const result of turn.results) messages.push({ role: "tool", tool_call_id: result.id, content: result.isError ? `Error: ${result.content}` : result.content });
    }
  }
  return messages;
}

const toolParams = (tools: ToolSpec[]) => tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } }));

type StreamChunk = {
  error?: { message?: string } | string;
  choices?: {
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      reasoning?: string | null;
      tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string | object } }[];
    };
    finish_reason?: string | null;
  }[];
  model?: string;
};

const STOP: Record<string, StopReason> = { stop: "end", tool_calls: "tool_use", function_call: "tool_use", length: "max_tokens", content_filter: "refusal" };

/** Folds a stream of Chat Completions chunks into one assistant turn. Exported for tests. */
export function chatCompletionsAccumulator(onText: (text: string) => void, onThinking: (text: string) => void) {
  let text = "";
  let thinking = "";
  let finish: string | undefined;
  let model: string | undefined;
  const calls: { id?: string; name: string; args: string }[] = [];
  const splitter = new ThinkSplitter((chunk) => { text += chunk; onText(chunk); }, (chunk) => { thinking += chunk; onThinking(chunk); });
  return {
    push(chunk: StreamChunk) {
      if (chunk.error) throw new ProviderError(typeof chunk.error === "string" ? chunk.error : chunk.error.message ?? "The server reported an error.", "other");
      model ??= chunk.model;
      const choice = chunk.choices?.[0];
      if (!choice) return;
      const delta = choice.delta ?? {};
      const reasoning = delta.reasoning_content ?? delta.reasoning;
      if (reasoning) { thinking += reasoning; onThinking(reasoning); }
      if (delta.content) splitter.push(delta.content);
      for (const call of delta.tool_calls ?? []) {
        const slot = calls[call.index ?? calls.length] ??= { name: "", args: "" };
        if (call.id) slot.id = call.id;
        if (call.function?.name) slot.name += call.function.name;
        const args = call.function?.arguments;
        if (args !== undefined) slot.args += typeof args === "string" ? args : JSON.stringify(args);
      }
      if (choice.finish_reason) finish = choice.finish_reason;
    },
    finish(): { turn: AssistantTurn; stop: StopReason; model?: string } {
      splitter.flush();
      const toolCalls = calls.filter(Boolean).map((call) => ({ id: call.id ?? newCallId(), name: call.name, input: parseArguments(call.args) }));
      const stop = toolCalls.length ? "tool_use" : STOP[finish ?? "stop"] ?? "end";
      return { turn: { role: "assistant", text, thinking: thinking || undefined, toolCalls }, stop, model };
    },
  };
}

export function openAiProvider({ baseUrl, apiKey, model }: { baseUrl: string; apiKey?: string; model: string }): ModelProvider {
  const root = trimSlash(baseUrl);
  const service = (() => { try { return new URL(root).host; } catch { return "the endpoint"; } })();
  const headers = { "Content-Type": "application/json", ...(apiKey?.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {}) };
  const post = async (body: object, signal?: AbortSignal) => {
    const response = await request(`${root}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body), signal }, service);
    if (!response.ok) throw await httpFailure(response, service);
    return response;
  };

  return {
    kind: "openai",
    model,
    async turn({ system, history, tools, signal, onText, onThinking }: TurnRequest) {
      const response = await post({
        model, stream: true, messages: toOpenAiMessages(system, history),
        ...(tools.length ? { tools: toolParams(tools) } : {}),
      }, signal);
      if (!response.body) throw new ProviderError("The endpoint sent no response body.", "other");
      const accumulator = chatCompletionsAccumulator(onText, onThinking ?? (() => undefined));
      try {
        await readLines(response.body, (line) => {
          if (!line.startsWith("data:")) return;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") return;
          accumulator.push(JSON.parse(data) as StreamChunk);
        });
      } catch (error) {
        if (signal?.aborted) throw new ProviderError("Stopped.", "aborted");
        throw error instanceof ProviderError ? error : new ProviderError(`The response stream broke off: ${error instanceof Error ? error.message : error}`, "network");
      }
      return accumulator.finish();
    },
    async complete({ system, prompt, images = [], signal }: CompletionRequest) {
      const content = images.length
        ? [{ type: "text" as const, text: prompt }, ...images.map((image) => ({ type: "image_url" as const, image_url: { url: `data:${image.mediaType};base64,${image.data}` } }))]
        : prompt;
      const response = await post({ model, stream: false, messages: [...(system ? [{ role: "system", content: system }] : []), { role: "user", content }] }, signal);
      const json = await response.json() as { choices?: { message?: { content?: string } }[] };
      return (json.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    },
    async listModels() {
      const response = await request(`${root}/models`, { headers }, service);
      if (!response.ok) throw await httpFailure(response, service);
      const json = await response.json() as { data?: { id: string }[] };
      return (json.data ?? []).map((entry) => entry.id).sort();
    },
  };
}
