// Claude through the official Anthropic SDK. Runs in the app itself with the student's own API key.

import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODELS } from "../models";
import { appFetch } from "../net";
import {
  ProviderError, type AssistantTurn, type ChatTurn, type CompletionRequest, type Effort, type ModelProvider,
  type StopReason, type ToolCall, type ToolSpec, type TurnRequest,
} from "../types";

type BetaBlock = Anthropic.Beta.BetaContentBlock;
type BetaBlockParam = Anthropic.Beta.BetaContentBlockParam;
type BetaMessageParam = Anthropic.Beta.BetaMessageParam;

/**
 * Opus and Sonnet can decline a request through their safety classifiers (biology notes can trip
 * them by mistake). `fallbacks: "default"` re-runs a declined request on Anthropic's recommended
 * fallback model inside the same call. Haiku has no server-side fallback.
 */
const supportsFallbacks = (model: string) => CLAUDE_MODELS.find((entry) => entry.id === model)?.fallbacks ?? false;

/**
 * Content to send back on the next request. After a fallback mid-answer, only text from before the
 * last `fallback` boundary is echoed (the declined model's thinking and tool calls are dropped), and
 * the boundary marker itself is left out.
 */
export function echoContent(content: BetaBlock[]): BetaBlockParam[] {
  const boundary = content.map((block) => block.type).lastIndexOf("fallback");
  return content.filter((block, index) => block.type !== "fallback" && (index > boundary || block.type === "text")) as BetaBlockParam[];
}

/** Tool calls that should run: those after the last fallback boundary. */
export function runnableToolCalls(content: BetaBlock[]): ToolCall[] {
  const boundary = content.map((block) => block.type).lastIndexOf("fallback");
  return content.slice(boundary + 1).flatMap((block) => block.type === "tool_use" ? [{ id: block.id, name: block.name, input: block.input }] : []);
}

export function toAnthropicMessages(history: ChatTurn[]): BetaMessageParam[] {
  const messages: BetaMessageParam[] = [];
  for (const turn of history) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.context ? [{ type: "text", text: turn.context }, { type: "text", text: turn.text }] : turn.text });
    } else if (turn.role === "assistant") {
      // Claude's own content (including thinking blocks) goes back unchanged; other providers' turns are rebuilt.
      const content: BetaBlockParam[] = turn.native?.provider === "anthropic"
        ? echoContent(turn.native.content as BetaBlock[])
        : [...(turn.text ? [{ type: "text" as const, text: turn.text }] : []), ...turn.toolCalls.map((call) => ({ type: "tool_use" as const, id: call.id, name: call.name, input: call.input }))];
      if (content.length) messages.push({ role: "assistant", content });
    } else {
      messages.push({ role: "user", content: turn.results.map((result) => ({ type: "tool_result" as const, tool_use_id: result.id, content: result.content, is_error: result.isError || undefined })) });
    }
  }
  return messages;
}

const STOP: Record<string, StopReason> = { end_turn: "end", stop_sequence: "end", tool_use: "tool_use", max_tokens: "max_tokens", refusal: "refusal", pause_turn: "pause" };

/** Turns SDK errors into messages a student can act on. Most specific classes first. */
export function describeClaudeError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof Anthropic.APIUserAbortError) return new ProviderError("Stopped.", "aborted");
  if (error instanceof Anthropic.APIConnectionError) return new ProviderError("Couldn't reach the Claude API. Check your internet connection.", "network");
  if (error instanceof Anthropic.AuthenticationError) return new ProviderError("Claude rejected the API key. Check it in Settings → AI assistant.", "auth");
  if (error instanceof Anthropic.PermissionDeniedError) return new ProviderError("This API key isn't allowed to use that model or feature.", "auth");
  if (error instanceof Anthropic.NotFoundError) return new ProviderError("That Claude model wasn't found. Pick another model in Settings.", "model");
  if (error instanceof Anthropic.RateLimitError) return new ProviderError("Claude's rate limit was reached. Wait a moment and try again.", "rate");
  if (error instanceof Anthropic.BadRequestError) return new ProviderError(`Claude couldn't process this request: ${error.message}`, "other");
  if (error instanceof Anthropic.InternalServerError) return new ProviderError("Claude is busy or had a temporary error. Try again shortly.", "other");
  if (error instanceof Anthropic.APIError) return new ProviderError(`Claude API error${error.status ? ` (${error.status})` : ""}: ${error.message}`, "other");
  // With eager input streaming the SDK raises a non-API error when a tool input isn't valid JSON;
  // the agent re-issues the turn.
  if (error instanceof Anthropic.AnthropicError) return new ProviderError("The model sent a malformed tool call.", "tool-json");
  return new ProviderError(error instanceof Error ? error.message : "Unexpected error.", "other");
}

function toolParams(tools: ToolSpec[]) {
  // Inputs (like a whole lesson) stream as they are generated; the agent validates them before running.
  return tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.inputSchema as Anthropic.Beta.BetaTool.InputSchema, eager_input_streaming: true }));
}

export function claudeProvider({ apiKey, model, effort: defaultEffort = "medium" }: { apiKey: string; model: string; effort?: Effort }): ModelProvider {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, fetch: appFetch, maxRetries: 2 });
  const fallbackParams = supportsFallbacks(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {};

  return {
    kind: "anthropic",
    model,
    async turn({ system, history, tools, signal, effort, maxTokens, onText, onThinking }: TurnRequest) {
      try {
        const stream = client.beta.messages.stream({
          model,
          max_tokens: maxTokens ?? 32000,
          system: [{ type: "text", text: system }],
          messages: toAnthropicMessages(history),
          tools: tools.length ? toolParams(tools) : undefined,
          // Thinking is always on for these models; show its summary so long answers don't look stuck.
          thinking: { type: "adaptive", display: "summarized" },
          output_config: { effort: effort ?? defaultEffort },
          // Caches the system prompt, tools and conversation so follow-up turns are cheaper.
          cache_control: { type: "ephemeral" },
          ...fallbackParams,
        }, { signal });
        for await (const event of stream) {
          if (event.type !== "content_block_delta") continue;
          if (event.delta.type === "text_delta") onText(event.delta.text);
          else if (event.delta.type === "thinking_delta") onThinking?.(event.delta.thinking);
        }
        const message = await stream.finalMessage();
        const content = message.content;
        const turn: AssistantTurn = {
          role: "assistant",
          text: content.flatMap((block) => block.type === "text" ? [block.text] : []).join(""),
          thinking: content.flatMap((block) => block.type === "thinking" && block.thinking ? [block.thinking] : []).join("\n\n") || undefined,
          toolCalls: runnableToolCalls(content),
          native: { provider: "anthropic", content },
        };
        return { turn, stop: STOP[message.stop_reason ?? "end_turn"] ?? "end", model: message.model };
      } catch (error) {
        throw describeClaudeError(error);
      }
    },
    async complete({ system, prompt, images = [], signal, maxTokens }: CompletionRequest) {
      try {
        const stream = client.beta.messages.stream({
          model,
          max_tokens: maxTokens ?? 16000,
          ...(system ? { system } : {}),
          messages: [{
            role: "user",
            content: [
              ...images.map((image) => ({ type: "image" as const, source: { type: "base64" as const, media_type: image.mediaType as "image/png", data: image.data } })),
              { type: "text" as const, text: prompt },
            ],
          }],
          output_config: { effort: "low" },
          ...fallbackParams,
        }, { signal });
        const message = await stream.finalMessage();
        if (message.stop_reason === "refusal") throw new ProviderError("Claude declined to read this content.", "other");
        return message.content.flatMap((block) => block.type === "text" ? [block.text] : []).join("");
      } catch (error) {
        throw describeClaudeError(error);
      }
    },
    async listModels() {
      try {
        const ids: string[] = [];
        for await (const entry of client.models.list()) ids.push(entry.id);
        return ids;
      } catch (error) {
        throw describeClaudeError(error);
      }
    },
  };
}
