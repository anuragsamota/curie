// Provider constants and AI defaults. Free of SDK imports so settings can use them without pulling
// any provider code into the main bundle.

import type { Effort, ProviderKind } from "./types";

export const CLAUDE_MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", note: "Most capable · $4 / $20 per million tokens", fallbacks: true },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", note: "Fast and capable · $2 / $10 per million tokens", fallbacks: true },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", note: "Fastest and cheapest · $0.10 / $0.50 per million tokens", fallbacks: false },
] as const;
export const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";

export const OPENAI_PRESETS = [
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", needsKey: true },
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", needsKey: true },
  { id: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1", needsKey: true },
  { id: "lmstudio", label: "LM Studio", baseUrl: "http://localhost:1234/v1", needsKey: false },
  { id: "custom", label: "Custom", baseUrl: "", needsKey: false },
] as const;
export type OpenAiPreset = (typeof OPENAI_PRESETS)[number]["id"];

export const DEFAULT_OLLAMA_HOST = "http://localhost:11434";
export const DEFAULT_OLLAMA_CONTEXT = 16384;

export type AiSettings = {
  provider: ProviderKind;
  claudeModel: string;
  effort: Effort;
  openaiPreset: OpenAiPreset;
  openaiBaseUrl: string;
  openaiModel: string;
  ollamaHost: string;
  ollamaModel: string;
  ollamaContext: number;
  /** Agent mode: the model can search notes, read lessons and create lessons. */
  tools: boolean;
  /** Attach matching note excerpts to each question automatically. */
  autoContext: boolean;
};

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: "anthropic",
  claudeModel: DEFAULT_CLAUDE_MODEL,
  effort: "medium",
  openaiPreset: "openai",
  openaiBaseUrl: "https://api.openai.com/v1",
  openaiModel: "",
  ollamaHost: DEFAULT_OLLAMA_HOST,
  ollamaModel: "",
  ollamaContext: DEFAULT_OLLAMA_CONTEXT,
  tools: true,
  autoContext: true,
};

export const PROVIDER_LABELS: Record<ProviderKind, string> = { anthropic: "Claude", openai: "OpenAI-compatible", ollama: "Ollama" };
