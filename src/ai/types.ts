// The provider-neutral conversation model. Each provider adapter translates it to its own API, so
// the agent loop, tools and chat UI work the same with Claude, OpenAI-compatible endpoints and Ollama.

export type ProviderKind = "anthropic" | "openai" | "ollama";

export type ToolCall = { id: string; name: string; input: unknown };
export type ToolResult = { id: string; name: string; content: string; isError?: boolean };

export type UserTurn = {
  role: "user";
  text: string;
  /** Note excerpts sent along with the message but not shown in the chat. */
  context?: string;
};
export type AssistantTurn = {
  role: "assistant";
  text: string;
  /** A readable summary of the model's reasoning, when the provider returns one. */
  thinking?: string;
  toolCalls: ToolCall[];
  /** The provider's own content, replayed unchanged on later requests to the same provider. */
  native?: { provider: ProviderKind; content: unknown };
};
export type ToolTurn = { role: "tool"; results: ToolResult[] };
export type ChatTurn = UserTurn | AssistantTurn | ToolTurn;

export type ToolSpec = { name: string; description: string; inputSchema: Record<string, unknown> };

export type StopReason = "end" | "tool_use" | "max_tokens" | "refusal" | "pause";
export type Effort = "low" | "medium" | "high";

export type TurnRequest = {
  system: string;
  history: ChatTurn[];
  tools: ToolSpec[];
  signal?: AbortSignal;
  effort?: Effort;
  maxTokens?: number;
  onText: (delta: string) => void;
  onThinking?: (delta: string) => void;
};
export type TurnResult = { turn: AssistantTurn; stop: StopReason; model?: string };

export type CompletionRequest = {
  system?: string;
  prompt: string;
  /** Base64 images (without the data: prefix). */
  images?: { mediaType: string; data: string }[];
  signal?: AbortSignal;
  maxTokens?: number;
};

export interface ModelProvider {
  kind: ProviderKind;
  model: string;
  /** One model turn: streams text through the callbacks and returns the finished turn. */
  turn(request: TurnRequest): Promise<TurnResult>;
  /** A single prompt with an optional image, used for transcribing photos of notes. */
  complete(request: CompletionRequest): Promise<string>;
  listModels(): Promise<string[]>;
}

export type ProviderErrorKind = "auth" | "rate" | "network" | "model" | "tools" | "tool-json" | "aborted" | "other";

/** A failure explained in words a student can act on. */
export class ProviderError extends Error {
  constructor(message: string, readonly kind: ProviderErrorKind = "other") {
    super(message);
  }
}
