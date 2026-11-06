import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, Cloud, Eye, EyeOff, KeyRound, Lock, PlugZap, RefreshCw, Server, Sparkles } from "lucide-react";
import { listModelsFor, useAiConfig } from "../ai/config";
import { CLAUDE_MODELS, OPENAI_PRESETS, type OpenAiPreset } from "../ai/models";
import type { Effort, ProviderKind } from "../ai/types";
import { native } from "../lib/storage";
import { useSound } from "../lib/sound";
import { useToast } from "./Toasts";

const PROVIDERS: { id: ProviderKind; label: string; description: string; icon: typeof Cloud }[] = [
  { id: "anthropic", label: "Claude", description: "Anthropic's models, with your API key", icon: Sparkles },
  { id: "openai", label: "OpenAI-compatible", description: "OpenAI, OpenRouter, Groq, LM Studio…", icon: Cloud },
  { id: "ollama", label: "Ollama", description: "Local models on this computer or your network", icon: Server },
];

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  const id = useId();
  return <div role="group" aria-labelledby={id} className="flex flex-col gap-1.5">
    <p id={id} className="text-sm font-medium">{label}</p>
    {children}
    {hint && <p className="text-xs leading-5 text-base-content/50">{hint}</p>}
  </div>;
}

/** An API key field. Keys are saved after a short pause, never shown in full unless asked. */
function KeyInput({ kind, placeholder }: { kind: ProviderKind; placeholder: string }) {
  const { keys, setKey } = useAiConfig();
  const [value, setValue] = useState(keys[kind] ?? "");
  const [shown, setShown] = useState(false);
  useEffect(() => setValue(keys[kind] ?? ""), [keys, kind]);
  useEffect(() => {
    if (value === (keys[kind] ?? "")) return;
    const timer = setTimeout(() => setKey(kind, value), 500);
    return () => clearTimeout(timer);
  }, [value, kind, keys, setKey]);
  return <label className="input w-full">
    <KeyRound size={15} className="opacity-50" />
    <input type={shown ? "text" : "password"} value={value} placeholder={placeholder} autoComplete="off" spellCheck={false} className="font-mono text-sm"
      onChange={(event) => setValue(event.target.value)} onBlur={() => value !== (keys[kind] ?? "") && setKey(kind, value)} aria-label="API key" />
    <button type="button" className="btn btn-ghost btn-xs btn-square" aria-label={shown ? "Hide key" : "Show key"} onClick={() => setShown(!shown)}>{shown ? <EyeOff size={14} /> : <Eye size={14} />}</button>
  </label>;
}

function ModelPicker({ kind, value, onChange, placeholder }: { kind: ProviderKind; value: string; onChange: (model: string) => void; placeholder: string }) {
  const { ai, keys } = useAiConfig();
  const toast = useToast();
  const [models, setModels] = useState<string[]>();
  const [loading, setLoading] = useState(false);
  const list = useId();
  const load = async () => {
    setLoading(true);
    try {
      const found = await listModelsFor(ai, keys, kind);
      setModels(found);
      if (!found.length) toast.warning("The server didn't list any models.");
      else if (!value) onChange(found[0]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't load models.", { title: "Couldn't load models" });
    } finally {
      setLoading(false);
    }
  };
  return <div className="flex gap-2">
    {models?.length
      ? <select className="select flex-1" value={value} onChange={(event) => onChange(event.target.value)} aria-label="Model">
        {!models.includes(value) && value && <option value={value}>{value}</option>}
        {models.map((model) => <option key={model} value={model}>{model}</option>)}
      </select>
      : <><input className="input flex-1 font-mono text-sm" list={list} value={value} placeholder={placeholder} spellCheck={false} onChange={(event) => onChange(event.target.value.trim())} aria-label="Model" />
        <datalist id={list} /></>}
    <button type="button" className="btn btn-ghost border-base-300" aria-label="Load models" disabled={loading} onClick={() => void load()}>
      {loading ? <span className="loading loading-spinner loading-xs" /> : <RefreshCw size={15} />} <span className="hidden sm:inline">Load models</span>
    </button>
  </div>;
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex cursor-pointer items-start justify-between gap-4">
    <span><span className="block text-sm font-medium">{label}</span><span className="mt-0.5 block text-xs leading-5 text-base-content/50">{hint}</span></span>
    <input type="checkbox" className="toggle toggle-primary mt-0.5" checked={checked} onChange={(event) => onChange(event.target.checked)} />
  </label>;
}

export function AiSettings() {
  const { ai, update, provider, missing, label } = useAiConfig();
  const toast = useToast();
  const play = useSound();
  const [testing, setTesting] = useState(false);

  const test = async () => {
    if (!provider) return;
    setTesting(true);
    try {
      const reply = await provider.complete({ prompt: "Reply with the single word: ready", maxTokens: 64 });
      toast.success(`${label} replied “${reply.trim().slice(0, 40)}”.`, { title: "Connection works" });
      play("success");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The model didn't respond.", { title: "Connection failed" });
    } finally {
      setTesting(false);
    }
  };

  return <div className="flex flex-col gap-6 py-1">
    <div role="radiogroup" aria-label="AI provider" className="grid gap-2 sm:grid-cols-3">
      {PROVIDERS.map((option) => {
        const selected = ai.provider === option.id;
        return <button key={option.id} type="button" role="radio" aria-checked={selected} onClick={() => { update({ provider: option.id }); play("toggle"); }}
          className={`press flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors ${selected ? "border-primary bg-secondary/60" : "border-base-300 hover:border-base-content/25"}`}>
          <span className="flex items-center gap-2 text-sm font-semibold"><option.icon size={16} className={selected ? "text-primary" : "text-base-content/60"} /> {option.label}</span>
          <span className="text-xs leading-5 text-base-content/55">{option.description}</span>
        </button>;
      })}
    </div>

    {ai.provider === "anthropic" && <div className="flex flex-col gap-4">
      <Field label="Anthropic API key" hint={<>Create one at console.anthropic.com. It's stored only on this device{native ? " in Curie's folder" : " in this browser"}.</>}>
        <KeyInput kind="anthropic" placeholder="sk-ant-…" />
      </Field>
      <Field label="Model" hint={CLAUDE_MODELS.find((model) => model.id === ai.claudeModel)?.note}>
        <select className="select w-full" aria-label="Claude model" value={ai.claudeModel} onChange={(event) => update({ claudeModel: event.target.value })}>
          {CLAUDE_MODELS.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
        </select>
      </Field>
      <Field label="Thinking effort" hint="Higher effort gives more careful lessons and answers, but takes longer and costs more.">
        <div role="radiogroup" aria-label="Thinking effort" className="inline-flex w-fit rounded-xl bg-base-200 p-1">
          {(["low", "medium", "high"] as Effort[]).map((effort) => <button key={effort} type="button" role="radio" aria-checked={ai.effort === effort} onClick={() => update({ effort })}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium capitalize transition-all ${ai.effort === effort ? "bg-base-100 shadow-sm" : "text-base-content/60"}`}>{effort}</button>)}
        </div>
      </Field>
    </div>}

    {ai.provider === "openai" && <div className="flex flex-col gap-4">
      <Field label="Service">
        <div className="flex flex-wrap gap-1.5">
          {OPENAI_PRESETS.map((preset) => <button key={preset.id} type="button" onClick={() => update({ openaiPreset: preset.id as OpenAiPreset, ...(preset.baseUrl ? { openaiBaseUrl: preset.baseUrl } : {}) })}
            className={`btn btn-sm ${ai.openaiPreset === preset.id ? "btn-primary" : "btn-ghost border-base-300"}`}>{preset.label}</button>)}
        </div>
      </Field>
      <Field label="Base URL" hint="The address that ends before /chat/completions, e.g. https://api.openai.com/v1">
        <input className="input w-full font-mono text-sm" aria-label="Base URL" value={ai.openaiBaseUrl} placeholder="https://…/v1" spellCheck={false} onChange={(event) => update({ openaiBaseUrl: event.target.value, openaiPreset: "custom" })} />
      </Field>
      <Field label="API key" hint={OPENAI_PRESETS.find((preset) => preset.id === ai.openaiPreset)?.needsKey ? "Required by this service. Stored only on this device." : "Leave empty for local servers that don't need one."}>
        <KeyInput kind="openai" placeholder="sk-…" />
      </Field>
      <Field label="Model" hint="Pick a model that supports tool calling so the assistant can search notes and create lessons.">
        <ModelPicker kind="openai" value={ai.openaiModel} onChange={(openaiModel) => update({ openaiModel })} placeholder="Model id" />
      </Field>
    </div>}

    {ai.provider === "ollama" && <div className="flex flex-col gap-4">
      <Field label="Ollama address" hint={<>Use http://localhost:11434 on this computer. For another computer on your network, enter its address (e.g. http://192.168.1.20:11434) and start Ollama there with <code className="rounded bg-base-200 px-1">OLLAMA_HOST=0.0.0.0</code>.{native ? "" : <> In a browser, also set <code className="rounded bg-base-200 px-1">OLLAMA_ORIGINS</code> to allow this site.</>}</>}>
        <input className="input w-full font-mono text-sm" aria-label="Ollama address" value={ai.ollamaHost} placeholder="http://localhost:11434" spellCheck={false} onChange={(event) => update({ ollamaHost: event.target.value })} />
      </Field>
      <Field label="Model" hint={<>Models with tool support (such as Llama 3.1+, Qwen 2.5/3 or Mistral) can search your notes and create lessons. Download them with <code className="rounded bg-base-200 px-1">ollama pull</code>.</>}>
        <ModelPicker kind="ollama" value={ai.ollamaModel} onChange={(ollamaModel) => update({ ollamaModel })} placeholder="e.g. qwen3:8b" />
      </Field>
      <Field label="Context window" hint="How much text the model can consider at once. Larger windows fit more notes but need more memory.">
        <select className="select w-full" aria-label="Context window" value={ai.ollamaContext} onChange={(event) => update({ ollamaContext: Number(event.target.value) })}>
          {[8192, 16384, 32768, 65536].map((size) => <option key={size} value={size}>{size / 1024}K tokens</option>)}
        </select>
      </Field>
      <div className="contents"><KeyFieldForProxy /></div>
    </div>}

    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-base-200/70 p-3">
      {provider ? <CheckCircle2 size={18} className="text-success" /> : <PlugZap size={18} className="text-warning" />}
      <p className="min-w-0 flex-1 text-sm">{provider ? <>Ready: <span className="font-medium">{label}</span></> : missing}</p>
      <button type="button" className="btn btn-sm btn-ghost border-base-300" disabled={!provider || testing} onClick={() => void test()}>{testing && <span className="loading loading-spinner loading-xs" />} Test connection</button>
    </div>

    <div className="flex flex-col gap-4 border-t border-base-300 pt-5">
      <Toggle label="Let the assistant use tools" hint="It can search your notes, read lessons, check your progress and create lessons. Turn off for models without tool support." checked={ai.tools} onChange={(tools) => update({ tools })} />
      <Toggle label="Attach matching note excerpts" hint="Each question is sent with the passages from your notes that match it best." checked={ai.autoContext} onChange={(autoContext) => update({ autoContext })} />
    </div>
    <p className="flex items-start gap-2 text-xs leading-5 text-base-content/50"><Lock size={13} className="mt-0.5 shrink-0" />
      Your notes and progress stay on this device. When you use the assistant, your message, the conversation and the note passages it needs are sent to the provider above{ai.provider === "ollama" ? ", which runs on hardware you control" : " under its privacy terms"}.</p>
  </div>;
}

/** Ollama behind an authenticating proxy needs a key; most setups don't. */
function KeyFieldForProxy() {
  const [open, setOpen] = useState(false);
  const { keys } = useAiConfig();
  if (!open && !keys.ollama) return <button type="button" className="btn btn-link btn-xs w-fit px-0 text-base-content/55" onClick={() => setOpen(true)}>Ollama behind a proxy that needs a key?</button>;
  return <Field label="Proxy API key" hint="Sent as a Bearer token. Only needed when Ollama sits behind an authenticating proxy."><KeyInput kind="ollama" placeholder="Optional" /></Field>;
}
