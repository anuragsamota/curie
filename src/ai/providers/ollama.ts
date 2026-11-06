// Ollama's native chat API, on this device or another computer on the network. The native API (not
// Ollama's OpenAI-compatible one) lets us raise the context window, which defaults to only a few
// thousand tokens and would otherwise cut off the system prompt and note excerpts.

import {
  ProviderError, type AssistantTurn, type ChatTurn, type CompletionRequest, type ModelProvider, type StopReason,
  type ToolSpec, type TurnRequest,
} from "../types";
import { DEFAULT_OLLAMA_CONTEXT, DEFAULT_OLLAMA_HOST } from "../models";
import { ThinkSplitter, httpFailure, newCallId, readLines, request, trimSlash } from "./shared";


type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  images?: string[];
  tool_calls?: { function: { name: string; arguments: unknown } }[];
  tool_name?: string;
};

export function toOllamaMessages(system: string, history: ChatTurn[]): Message[] {
  const messages: Message[] = [{ role: "system", content: system }];
  for (const turn of history) {
    if (turn.role === "user") messages.push({ role: "user", content: turn.context ? `${turn.context}\n\n${turn.text}` : turn.text });
    else if (turn.role === "assistant") {
      messages.push({ role: "assistant", content: turn.text, ...(turn.toolCalls.length ? { tool_calls: turn.toolCalls.map((call) => ({ function: { name: call.name, arguments: call.input ?? {} } })) } : {}) });
    } else {
      for (const result of turn.results) messages.push({ role: "tool", tool_name: result.name, content: result.isError ? `Error: ${result.content}` : result.content });
    }
  }
  return messages;
}

type Chunk = {
  error?: string;
  model?: string;
  message?: { content?: string; thinking?: string; tool_calls?: { function?: { name?: string; arguments?: unknown } }[] };
  done?: boolean;
  done_reason?: string;
};

const STOP: Record<string, StopReason> = { stop: "end", length: "max_tokens" };

/** Folds Ollama's streamed chat lines into one assistant turn. Exported for tests. */
export function ollamaAccumulator(onText: (text: string) => void, onThinking: (text: string) => void) {
  let text = "";
  let thinking = "";
  let reason: string | undefined;
  let model: string | undefined;
  const toolCalls: AssistantTurn["toolCalls"] = [];
  const splitter = new ThinkSplitter((chunk) => { text += chunk; onText(chunk); }, (chunk) => { thinking += chunk; onThinking(chunk); });
  return {
    push(chunk: Chunk) {
      if (chunk.error) throw new ProviderError(`Ollama: ${chunk.error}`, /support/i.test(chunk.error) && /tool/i.test(chunk.error) ? "tools" : "other");
      model ??= chunk.model;
      if (chunk.message?.thinking) { thinking += chunk.message.thinking; onThinking(chunk.message.thinking); }
      if (chunk.message?.content) splitter.push(chunk.message.content);
      for (const call of chunk.message?.tool_calls ?? []) {
        if (call.function?.name) toolCalls.push({ id: newCallId(), name: call.function.name, input: call.function.arguments ?? {} });
      }
      if (chunk.done) reason = chunk.done_reason;
    },
    finish(): { turn: AssistantTurn; stop: StopReason; model?: string } {
      splitter.flush();
      return { turn: { role: "assistant", text, thinking: thinking || undefined, toolCalls }, stop: toolCalls.length ? "tool_use" : STOP[reason ?? "stop"] ?? "end", model };
    },
  };
}

export function ollamaProvider({ host, model, apiKey, contextWindow = DEFAULT_OLLAMA_CONTEXT }: { host: string; model: string; apiKey?: string; contextWindow?: number }): ModelProvider {
  const root = trimSlash(host || DEFAULT_OLLAMA_HOST);
  const service = "Ollama";
  // A key is only needed when Ollama sits behind an authenticating proxy.
  const headers = { "Content-Type": "application/json", ...(apiKey?.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {}) };
  const tools = (specs: ToolSpec[]) => specs.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } }));

  return {
    kind: "ollama",
    model,
    async turn({ system, history, tools: specs, signal, onText, onThinking }: TurnRequest) {
      const response = await request(`${root}/api/chat`, {
        method: "POST", headers, signal,
        body: JSON.stringify({ model, stream: true, messages: toOllamaMessages(system, history), ...(specs.length ? { tools: tools(specs) } : {}), options: { num_ctx: contextWindow } }),
      }, service);
      if (!response.ok) throw await httpFailure(response, service);
      if (!response.body) throw new ProviderError("Ollama sent no response body.", "other");
      const accumulator = ollamaAccumulator(onText, onThinking ?? (() => undefined));
      try {
        await readLines(response.body, (line) => { if (line.trim()) accumulator.push(JSON.parse(line) as Chunk); });
      } catch (error) {
        if (signal?.aborted) throw new ProviderError("Stopped.", "aborted");
        throw error instanceof ProviderError ? error : new ProviderError(`The response from Ollama broke off: ${error instanceof Error ? error.message : error}`, "network");
      }
      return accumulator.finish();
    },
    async complete({ system, prompt, images = [], signal }: CompletionRequest) {
      const response = await request(`${root}/api/chat`, {
        method: "POST", headers, signal,
        body: JSON.stringify({
          model, stream: false, options: { num_ctx: contextWindow },
          messages: [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: prompt, ...(images.length ? { images: images.map((image) => image.data) } : {}) }],
        }),
      }, service);
      if (!response.ok) throw await httpFailure(response, service);
      const json = await response.json() as Chunk;
      return (json.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    },
    async listModels() {
      const response = await request(`${root}/api/tags`, { headers }, service);
      if (!response.ok) throw await httpFailure(response, service);
      const json = await response.json() as { models?: { name: string }[] };
      return (json.models ?? []).map((entry) => entry.name).sort();
    },
  };
}
