// Helpers shared by the OpenAI-compatible and Ollama adapters (both plain HTTP + JSON).

import { appFetch } from "../net";
import { ProviderError } from "../types";

export const trimSlash = (url: string) => url.trim().replace(/\/+$/, "");

export const newCallId = () => `call_${Math.random().toString(36).slice(2, 12)}`;

/** Parses a tool call's arguments, which servers send as a JSON string or an object. */
export function parseArguments(raw: unknown): unknown {
  if (typeof raw !== "string") return raw ?? {};
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch { return { INVALID_JSON: raw }; }
}

/**
 * Splits streamed text into answer and reasoning for models that wrap their reasoning in
 * <think>…</think> (DeepSeek-R1, Qwen 3 and others served by Ollama or vLLM).
 */
export class ThinkSplitter {
  private buffer = "";
  private inside = false;
  constructor(private onText: (text: string) => void, private onThinking: (text: string) => void) {}

  push(chunk: string) {
    this.buffer += chunk;
    for (;;) {
      const tag = this.inside ? "</think>" : "<think>";
      const at = this.buffer.indexOf(tag);
      if (at === -1) {
        // Hold back a possible partial tag at the end until the next chunk arrives.
        const keep = partialSuffix(this.buffer, tag);
        this.emit(this.buffer.slice(0, this.buffer.length - keep));
        this.buffer = this.buffer.slice(this.buffer.length - keep);
        return;
      }
      this.emit(this.buffer.slice(0, at));
      this.buffer = this.buffer.slice(at + tag.length);
      this.inside = !this.inside;
    }
  }

  flush() {
    this.emit(this.buffer);
    this.buffer = "";
  }

  private emit(text: string) {
    if (!text) return;
    if (this.inside) this.onThinking(text);
    else this.onText(text);
  }
}

function partialSuffix(text: string, tag: string) {
  for (let length = Math.min(tag.length - 1, text.length); length > 0; length--) {
    if (text.endsWith(tag.slice(0, length))) return length;
  }
  return 0;
}

/** Calls `onLine` for each line of a streamed response body. */
export async function readLines(body: ReadableStream<Uint8Array>, onLine: (line: string) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = pending.indexOf("\n")) !== -1) {
      onLine(pending.slice(0, newline).replace(/\r$/, ""));
      pending = pending.slice(newline + 1);
    }
  }
  pending += decoder.decode();
  if (pending.trim()) onLine(pending);
}

/** A readable error for a non-2xx response. */
export async function httpFailure(response: Response, service: string): Promise<ProviderError> {
  let detail = "";
  try {
    const body = await response.text();
    try {
      const json = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
      detail = (typeof json.error === "string" ? json.error : json.error?.message) ?? json.message ?? body;
    } catch {
      detail = body;
    }
  } catch { /* no body */ }
  detail = detail.trim().slice(0, 300);
  const status = response.status;
  const suffix = detail ? ` ${detail}` : "";
  // Ollama has no keys: a 403 means it refused this app's origin, not a key.
  if (service === "Ollama" && (status === 401 || status === 403)) {
    return new ProviderError(`Ollama refused the connection (${status}). Restart Ollama with OLLAMA_ORIGINS="*" to allow Curie, or check the proxy in front of it.${suffix}`, "auth");
  }
  if (status === 401 || status === 403) return new ProviderError(`${service} rejected the API key (${status}). Check the key in Settings, or clear it if this server doesn't need one.${suffix}`, "auth");
  if (/(tool|function).{0,40}(not supported|support)|does not support tools/i.test(detail)) {
    return new ProviderError(`This model doesn't support tool calling, which the assistant needs to search notes and create lessons. Choose a model with tool support, or turn off "Let the assistant use tools" in Settings.`, "tools");
  }
  if (status === 404) return new ProviderError(`${service} returned 404: check the address and the model name.${suffix}`, "model");
  if (status === 429) return new ProviderError(`${service}'s rate limit was reached. Wait a moment and try again.${suffix}`, "rate");
  return new ProviderError(`${service} returned an error (${status}).${suffix}`, "other");
}

/** fetch that reports aborts and unreachable servers as ProviderErrors. */
export async function request(url: string, init: RequestInit, service: string): Promise<Response> {
  try {
    return await appFetch(url, init);
  } catch (error) {
    if (init.signal?.aborted) throw new ProviderError("Stopped.", "aborted");
    throw new ProviderError(`Couldn't reach ${service} at ${new URL(url).origin}. Check that it's running and reachable from this device. ${error instanceof Error ? error.message : ""}`.trim(), "network");
  }
}
