// Which AI provider the assistant uses and how to reach it. Preferences live in Settings; API keys are
// kept apart (keys.json in the Curie folder, or this browser's storage) and never exported.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { readData, writeData } from "../lib/appdata";
import { useSettings } from "../lib/settings";
import { CLAUDE_MODELS, DEFAULT_CLAUDE_MODEL, type AiSettings } from "./models";
import type { ModelProvider, ProviderKind } from "./types";

export type { AiSettings } from "./models";

export type AiKeys = Partial<Record<ProviderKind, string>>;

/** A provider whose code (and SDK) loads the first time it's used. */
function lazy(kind: ProviderKind, model: string, load: () => Promise<ModelProvider>): ModelProvider {
  let instance: Promise<ModelProvider> | undefined;
  const get = () => instance ??= load();
  return {
    kind, model,
    turn: async (request) => (await get()).turn(request),
    complete: async (request) => (await get()).complete(request),
    listModels: async () => (await get()).listModels(),
  };
}

/** Builds a provider from settings and keys, or explains what's missing. */
export function createProvider(settings: AiSettings, keys: AiKeys, kind = settings.provider): { provider?: ModelProvider; missing?: string } {
  switch (kind) {
    case "anthropic":
      if (!keys.anthropic) return { missing: "Add your Anthropic API key." };
    {
      const apiKey = keys.anthropic;
      const model = settings.claudeModel || DEFAULT_CLAUDE_MODEL;
      return { provider: lazy("anthropic", model, async () => (await import("./providers/anthropic")).claudeProvider({ apiKey, model, effort: settings.effort })) };
    }
    case "openai":
      if (!settings.openaiBaseUrl.trim()) return { missing: "Enter the endpoint's base URL." };
      if (!settings.openaiModel.trim()) return { missing: "Choose a model." };
      return { provider: lazy("openai", settings.openaiModel.trim(), async () => (await import("./providers/openai")).openAiProvider({ baseUrl: settings.openaiBaseUrl, apiKey: keys.openai, model: settings.openaiModel.trim() })) };
    case "ollama":
      if (!settings.ollamaModel.trim()) return { missing: "Choose an Ollama model." };
      return { provider: lazy("ollama", settings.ollamaModel.trim(), async () => (await import("./providers/ollama")).ollamaProvider({ host: settings.ollamaHost, model: settings.ollamaModel.trim(), apiKey: keys.ollama, contextWindow: settings.ollamaContext })) };
  }
}

/** Lists the models a provider offers, before a model has been chosen. */
export async function listModelsFor(settings: AiSettings, keys: AiKeys, kind: ProviderKind): Promise<string[]> {
  const draft = { ...settings, openaiModel: settings.openaiModel || "-", ollamaModel: settings.ollamaModel || "-" };
  const { provider, missing } = createProvider(draft, keys, kind);
  if (!provider) throw new Error(missing);
  return provider.listModels();
}

export function modelLabel(settings: AiSettings): string {
  switch (settings.provider) {
    case "anthropic": return CLAUDE_MODELS.find((model) => model.id === settings.claudeModel)?.label ?? settings.claudeModel;
    case "openai": return settings.openaiModel || "OpenAI-compatible";
    case "ollama": return settings.ollamaModel ? `${settings.ollamaModel} (Ollama)` : "Ollama";
  }
}

type AiConfigValue = {
  ai: AiSettings;
  update: (patch: Partial<AiSettings>) => void;
  keys: AiKeys;
  setKey: (kind: ProviderKind, key: string) => void;
  /** The active provider, when it's configured. */
  provider?: ModelProvider;
  missing?: string;
  label: string;
};

const AiConfigContext = createContext<AiConfigValue | null>(null);

export function AiConfigProvider({ children }: { children: ReactNode }) {
  const { settings, update: updateSettings } = useSettings();
  const ai = settings.ai;
  const [keys, setKeys] = useState<AiKeys>({});

  useEffect(() => { void readData<AiKeys>("keys", {}).then(setKeys); }, []);

  // Built from the latest settings, so quick successive changes can't overwrite each other.
  const update = useCallback((patch: Partial<AiSettings>) => updateSettings((current) => ({ ai: { ...current.ai, ...patch } })), [updateSettings]);
  const setKey = useCallback((kind: ProviderKind, key: string) => setKeys((current) => {
    const next = { ...current, [kind]: key.trim() || undefined };
    void writeData("keys", next);
    return next;
  }), []);

  const { provider, missing } = useMemo(() => createProvider(ai, keys), [ai, keys]);
  const value = useMemo(() => ({ ai, update, keys, setKey, provider, missing, label: modelLabel(ai) }), [ai, update, keys, setKey, provider, missing]);
  return <AiConfigContext.Provider value={value}>{children}</AiConfigContext.Provider>;
}

export function useAiConfig() {
  const value = useContext(AiConfigContext);
  if (!value) throw new Error("useAiConfig must be used inside AiConfigProvider");
  return value;
}
