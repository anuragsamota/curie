import { Component, createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import Lottie from "lottie-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertTriangle, Check, ChevronDown, CircleCheck, EyeOff, Info, Lightbulb, RotateCcw, Sparkles, X } from "lucide-react";
import { isExternalSource, isPackageAssetPath } from "../curie/assets";
import { fillTemplate, formatValue, tryEvaluate } from "../curie/expr";
import { isBlockedProperty, sanitizeSvg } from "../curie/svg";
import type { AssetMap } from "../curie/package";
import type { CurieNode } from "../curie/types";
import { useSettings } from "../lib/settings";
import { useSound } from "../lib/sound";
import { useVariables } from "./variables";

/** Lesson-level hooks for interactive blocks; optional so blocks also render in the editor. */
export type LessonRuntime = { onQuizAnswered?: (id: string, correct: boolean) => void };
const RuntimeContext = createContext<LessonRuntime>({});
export const LessonRuntimeProvider = RuntimeContext.Provider;

type Props = {
  node: CurieNode;
  assets?: AssetMap;
  onError: (message: string) => void;
  /** Wraps every block (including nested ones), e.g. to make blocks selectable in the editor. */
  frame?: (node: CurieNode, content: ReactNode) => ReactNode;
};

/** Fills `{{ expression }}` placeholders with the lesson's current variable values. */
function useFill() {
  const { scope } = useVariables();
  return (text: string) => fillTemplate(text, scope);
}

function MarkdownBlock({ content }: { content: string }) {
  const filled = useFill()(content);
  // Re-render Markdown and math only when the filled text actually changes (e.g. while dragging a slider).
  return useMemo(() => <div className="prose max-w-none curie-prose">
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}
      components={{ a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}
    >{filled}</ReactMarkdown>
  </div>, [filled]);
}

type AssetState = { url?: string; failed: boolean };

function useAsset(src: string, assets?: AssetMap, onError?: (message: string) => void): AssetState {
  const [state, setState] = useState<AssetState>({ failed: false });
  const blob = assets?.[src];
  useEffect(() => {
    if (!src) {
      setState({ failed: true });
      return;
    }
    if (isExternalSource(src)) {
      setState({ url: src, failed: false });
      return;
    }
    if (!isPackageAssetPath(src) || !blob) {
      setState({ failed: true });
      onError?.(!isPackageAssetPath(src) ? `Asset path is not available: ${src}` : `Missing asset in lesson package: ${src}`);
      return;
    }
    const url = URL.createObjectURL(blob);
    setState({ url, failed: false });
    return () => URL.revokeObjectURL(url);
  }, [src, blob, onError]);
  return state;
}

function MediaFallback({ label, src, className = "min-h-44" }: { label: string; src?: string; className?: string }) {
  return <div role="note" className={`flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-base-300 bg-base-200/50 p-6 text-center text-sm text-base-content/60 ${className}`}>
    <AlertTriangle size={22} className="text-warning" aria-hidden="true" /><span className="font-medium">{label}</span>{src && <span className="break-all font-mono text-xs opacity-70">{src}</span>}
  </div>;
}

function Caption({ children }: { children?: string }) {
  return children ? <figcaption className="mt-3 text-center text-sm text-base-content/60">{children}</figcaption> : null;
}

function ImageBlock({ node, assets, onError }: { node: Extract<CurieNode, { type: "image" }>; assets?: AssetMap; onError: Props["onError"] }) {
  const asset = useAsset(node.src, assets, onError);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setFailed(false); setLoaded(false); }, [asset.url]);
  return <figure className="my-2">
    {failed || asset.failed ? <MediaFallback label={node.src ? "Image failed to load" : "No image chosen yet"} src={node.src} />
      : asset.url ? <img src={asset.url} alt={node.alt} loading="lazy"
        className={`mx-auto max-h-[34rem] w-auto max-w-full rounded-2xl object-contain transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setLoaded(true)} onError={() => { setFailed(true); onError(`Image could not be displayed: ${node.src}`); }} />
      : <div className="skeleton h-56 w-full rounded-2xl" />}
    <Caption>{node.caption}</Caption>
  </figure>;
}

function VideoBlock({ node, assets, onError }: { node: Extract<CurieNode, { type: "video" }>; assets?: AssetMap; onError: Props["onError"] }) {
  const asset = useAsset(node.src, assets, onError);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [asset.url]);
  return <figure className="my-2">
    {node.title && <h3 className="font-display mb-3 text-lg font-semibold">{node.title}</h3>}
    {failed || asset.failed ? <MediaFallback label={node.src ? "Video could not be played" : "No video chosen yet"} src={node.src} className="aspect-video" />
      : asset.url ? <video className="w-full rounded-2xl bg-black shadow-sm" controls preload="metadata" src={asset.url} aria-label={node.title} onError={() => { setFailed(true); onError(`Video could not be played: ${node.src}`); }}>Your browser does not support embedded video.</video>
      : <div className="skeleton aspect-video w-full rounded-2xl" />}
    <Caption>{node.caption}</Caption>
  </figure>;
}

function LottieBlock({ node, assets, onError }: { node: Extract<CurieNode, { type: "lottie" }>; assets?: AssetMap; onError: Props["onError"] }) {
  const { url: src, failed } = useAsset(node.src, assets, onError);
  const { reducedMotion } = useSettings();
  const [animationData, setAnimationData] = useState<unknown>();
  const [parseFailed, setParseFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setAnimationData(undefined);
    setParseFailed(false);
    if (!src) return;
    fetch(src).then((response) => {
      if (!response.ok) throw new Error(`Lottie fetch failed (${response.status})`);
      return response.json();
    }).then((data: unknown) => { if (active) setAnimationData(data); })
      .catch((error: unknown) => {
        if (!active) return;
        setParseFailed(true);
        onError(error instanceof Error ? error.message : "Could not load Lottie animation.");
      });
    return () => { active = false; };
  }, [src, onError]);
  return <figure className="my-2 rounded-3xl border border-base-300 bg-base-200/40 p-4 sm:p-6">
    {node.title && <h3 className="font-display mb-3 text-center text-lg font-semibold">{node.title}</h3>}
    {failed || parseFailed ? <MediaFallback label={node.src ? "Animation could not be loaded" : "No animation chosen yet"} src={node.src} />
      : animationData ? <div className="mx-auto max-h-80 max-w-md"><Lottie animationData={animationData} loop={node.loop ?? true} autoplay={(node.autoplay ?? true) && !reducedMotion} aria-label={node.title ?? node.caption ?? "Animation"} /></div>
      : <div className="skeleton mx-auto h-48 w-full max-w-md rounded-xl" />}
    <Caption>{node.caption}</Caption>
  </figure>;
}

/** Resolves a theme CSS variable to a concrete colour for SVG charts; re-reads when the theme changes. */
function useThemeColor(variable: string) {
  const { mode } = useSettings();
  return useMemo(() => getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || "#5b4bd5", [variable, mode]);
}

function GraphBlock({ node }: { node: Extract<CurieNode, { type: "graph" }> }) {
  const color = useThemeColor("--color-primary");
  const chart = useMemo(() => {
    const common = { data: node.data, margin: { top: 12, right: 16, bottom: node.xLabel ? 18 : 4, left: node.yLabel ? 8 : 0 } };
    // Recharts only finds direct children, so these must be an array rather than a Fragment.
    const axis = [
      <CartesianGrid key="grid" strokeDasharray="3 4" stroke="currentColor" opacity={0.12} vertical={false} />,
      <XAxis key="x" dataKey="x" tick={{ fill: "currentColor", fontSize: 12, opacity: 0.7 }} tickLine={false} axisLine={{ stroke: "currentColor", opacity: 0.2 }}
        label={node.xLabel ? { value: node.xLabel, position: "insideBottom", offset: -12, fill: "currentColor", fontSize: 12, opacity: 0.6 } : undefined} />,
      <YAxis key="y" tick={{ fill: "currentColor", fontSize: 12, opacity: 0.7 }} tickLine={false} axisLine={false} width={44}
        label={node.yLabel ? { value: node.yLabel, angle: -90, position: "insideLeft", fill: "currentColor", fontSize: 12, opacity: 0.6, style: { textAnchor: "middle" } } : undefined} />,
      <Tooltip key="tooltip" cursor={{ stroke: "currentColor", strokeOpacity: 0.2 }} contentStyle={{ borderRadius: 12, border: "1px solid var(--color-base-300)", background: "var(--color-base-100)", color: "var(--color-base-content)", boxShadow: "0 10px 30px -15px rgb(0 0 0 / .4)" }} />,
    ];
    if (node.kind === "bar") return <BarChart {...common}>{axis}<Bar dataKey="y" fill={color} radius={[6, 6, 0, 0]} /></BarChart>;
    if (node.kind === "area") return <AreaChart {...common}>{axis}<Area type="monotone" dataKey="y" stroke={color} fill={color} fillOpacity={0.16} strokeWidth={3} /></AreaChart>;
    return <LineChart {...common}>{axis}<Line type="monotone" dataKey="y" stroke={color} strokeWidth={3} dot={{ r: 4, fill: color, strokeWidth: 0 }} activeDot={{ r: 7 }} /></LineChart>;
  }, [node, color]);
  return <section className="my-2 rounded-3xl border border-base-300 bg-base-100 p-4 sm:p-6">
    {node.title && <h3 className="font-display mb-4 text-lg font-semibold">{node.title}</h3>}
    <div className="h-72 w-full text-base-content"><ResponsiveContainer width="100%" height="100%">{chart}</ResponsiveContainer></div>
  </section>;
}

const CALLOUTS = {
  info: { icon: Info, box: "border-info/30 bg-info/8", tone: "text-info" },
  tip: { icon: Lightbulb, box: "border-secondary/60 bg-secondary/15", tone: "text-secondary-content dark:text-secondary" },
  warning: { icon: AlertTriangle, box: "border-warning/40 bg-warning/10", tone: "text-warning" },
  success: { icon: CircleCheck, box: "border-success/30 bg-success/8", tone: "text-success" },
};

function CalloutBlock({ node }: { node: Extract<CurieNode, { type: "callout" }> }) {
  const { icon: Icon, box, tone } = CALLOUTS[node.variant];
  const fill = useFill();
  return <aside className={`my-2 flex gap-3 rounded-2xl border p-4 sm:p-5 ${box}`}>
    <Icon size={20} className={`mt-1 shrink-0 ${tone}`} aria-hidden="true" />
    <div className="min-w-0 flex-1">
      {node.title && <h3 className="font-display mb-0.5 font-bold">{fill(node.title)}</h3>}
      <div className="[&_.curie-prose]:text-[0.97rem] [&_.curie-prose_p]:my-1"><MarkdownBlock content={node.content} /></div>
    </div>
  </aside>;
}

function RevealBlock({ node }: { node: Extract<CurieNode, { type: "reveal" }> }) {
  const [open, setOpen] = useState(node.initiallyOpen ?? false);
  const play = useSound();
  const fill = useFill();
  return <div className="my-2 rounded-2xl border border-base-300 bg-base-100">
    <button type="button" aria-expanded={open} className="flex w-full items-center gap-3 rounded-2xl p-4 text-left font-semibold transition-colors hover:bg-base-200/60"
      onClick={() => { setOpen(!open); play(open ? "tap" : "open"); }}>
      <Sparkles size={18} className="text-accent" aria-hidden="true" />
      <span className="flex-1">{fill(node.title)}</span>
      <ChevronDown size={18} className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
    </button>
    <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
      <div className="overflow-hidden" inert={!open}><div className="px-4 pb-4 pl-12"><MarkdownBlock content={node.content} /></div></div>
    </div>
  </div>;
}

function QuizBlock({ node }: { node: Extract<CurieNode, { type: "quiz" }> }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { onQuizAnswered } = useContext(RuntimeContext);
  const play = useSound();
  const solved = result === "correct";

  const check = () => {
    if (selected === null) return;
    const correct = selected === node.correctIndex;
    setResult(correct ? "correct" : "wrong");
    setAttempt((value) => value + 1);
    play(correct ? "success" : "error");
    onQuizAnswered?.(node.id, correct);
  };

  return <section className={`my-2 rounded-3xl border-2 bg-base-100 p-5 transition-colors sm:p-6 ${solved ? "border-success/50" : "border-base-300"}`}>
    <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-primary"><Sparkles size={14} /> Quick check</div>
    <h3 className="font-display mb-4 text-lg font-bold leading-snug">{node.question}</h3>
    <div key={attempt} className={`space-y-2 ${result === "wrong" ? "animate-shake" : ""}`} role="radiogroup" aria-label={node.question}>
      {node.options.map((option, index) => {
        const isSelected = selected === index;
        const showCorrect = solved && index === node.correctIndex;
        const showWrong = result === "wrong" && isSelected;
        return <button
          key={`${node.id}-${index}`} type="button" role="radio" aria-checked={isSelected} disabled={solved}
          onClick={() => { setSelected(index); setResult(null); play("tap"); }}
          className={`press flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors disabled:cursor-default ${
            showCorrect ? "animate-pop border-success bg-success/10" : showWrong ? "border-error/60 bg-error/8" : isSelected ? "border-primary bg-primary/6" : "border-base-300 hover:border-base-content/25 hover:bg-base-200/50"}`}
        >
          <span className={`grid size-8 shrink-0 place-items-center rounded-xl text-sm font-bold ${showCorrect ? "bg-success text-success-content" : showWrong ? "bg-error text-error-content" : isSelected ? "bg-primary text-primary-content" : "bg-base-200 text-base-content/70"}`}>
            {showCorrect ? <Check size={16} /> : showWrong ? <X size={16} /> : String.fromCharCode(65 + index)}
          </span>
          <span className="flex-1">{option}</span>
        </button>;
      })}
    </div>
    {!solved && <div className="mt-4 flex items-center gap-3">
      <button className="btn btn-primary press" disabled={selected === null || result === "wrong"} onClick={check}>Check answer</button>
      {result === "wrong" && <span className="animate-fade text-sm font-medium text-error">Not quite. Pick another answer and try again.</span>}
    </div>}
    {solved && <div className="animate-rise mt-4 rounded-2xl bg-success/10 p-4 text-sm">
      <p className="flex items-center gap-2 font-bold text-success"><CircleCheck size={18} /> {attempt === 1 ? "Correct, first try!" : "Correct!"}</p>
      {node.explanation && <p className="mt-1 leading-6 text-base-content/80">{node.explanation}</p>}
      <button className="btn btn-ghost btn-xs mt-2 -ml-2" onClick={() => { setSelected(null); setResult(null); setAttempt(0); }}><RotateCcw size={13} /> Try again</button>
    </div>}
  </section>;
}

function SliderBlock({ node }: { node: Extract<CurieNode, { type: "slider" }> }) {
  const [local, setLocal] = useState(node.initial);
  useEffect(() => setLocal(node.initial), [node.initial]);
  // A slider with a variable shares its value with the rest of the lesson.
  const { scope, set } = useVariables();
  const shared = node.variable ? scope[node.variable] : undefined;
  const value = typeof shared === "number" ? shared : local;
  const setValue = (next: number) => node.variable && typeof shared === "number" ? set({ [node.variable]: next }) : setLocal(next);
  const decimals = Math.min(6, (String(node.step ?? 1).split(".")[1] || "").length);
  const unit = node.unit ? ` ${node.unit}` : "";
  const percent = node.max > node.min ? ((value - node.min) / (node.max - node.min)) * 100 : 0;
  return <section className="my-2 rounded-3xl border border-base-300 bg-base-100 p-5 sm:p-6">
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={`slider-${node.id}`} className="font-semibold">{node.label}</label>
      <output htmlFor={`slider-${node.id}`} className="min-w-20 rounded-xl bg-primary/10 px-3 py-1.5 text-center font-mono font-bold tabular-nums text-primary">{value.toFixed(decimals)}{unit}</output>
    </div>
    <input id={`slider-${node.id}`} type="range" className="range range-primary mt-5 w-full" min={node.min} max={node.max} step={node.step ?? 1} value={value}
      style={{ "--range-fill": `${percent}%` } as React.CSSProperties} onChange={(event) => setValue(Number(event.target.value))} />
    <div className="mt-1.5 flex justify-between text-xs text-base-content/50"><span>{node.min}{unit}</span><span>{node.max}{unit}</span></div>
  </section>;
}

function ToggleBlock({ node }: { node: Extract<CurieNode, { type: "toggle" }> }) {
  const { scope, set } = useVariables();
  const play = useSound();
  const checked = scope[node.variable] === true;
  return <label className="my-2 flex cursor-pointer items-center justify-between gap-4 rounded-3xl border border-base-300 bg-base-100 p-5 sm:px-6">
    <span className="font-semibold">{node.label}</span>
    <input type="checkbox" className="toggle toggle-primary" checked={checked} onChange={(event) => { set({ [node.variable]: event.target.checked }); play("toggle"); }} />
  </label>;
}

function ChoiceBlock({ node }: { node: Extract<CurieNode, { type: "choice" }> }) {
  const { scope, set } = useVariables();
  const play = useSound();
  const current = scope[node.variable];
  const choose = (value: number | string) => { set({ [node.variable]: value }); play("tap"); };
  return <section className="my-2 rounded-3xl border border-base-300 bg-base-100 p-5 sm:p-6">
    <p className="mb-3 font-semibold">{node.label}</p>
    {node.options.length <= 5
      ? <div role="radiogroup" aria-label={node.label} className="flex flex-wrap gap-2">
        {node.options.map((option, index) => <button key={index} type="button" role="radio" aria-checked={current === option.value} onClick={() => choose(option.value)}
          className={`press rounded-2xl border-2 px-4 py-2 text-sm font-semibold transition-colors ${current === option.value ? "border-primary bg-primary/10 text-primary" : "border-base-300 hover:border-base-content/25"}`}>{option.label}</button>)}
      </div>
      : <select className="select w-full" aria-label={node.label} value={node.options.findIndex((option) => option.value === current)} onChange={(event) => choose(node.options[Number(event.target.value)].value)}>
        {node.options.map((option, index) => <option key={index} value={index}>{option.label}</option>)}
      </select>}
  </section>;
}

function ButtonBlock({ node }: { node: Extract<CurieNode, { type: "button" }> }) {
  const { scope, set } = useVariables();
  const play = useSound();
  const run = () => {
    // Actions run in order, each seeing the results of the ones before it.
    const working = { ...scope };
    const changes: Record<string, string | number | boolean> = {};
    for (const action of node.actions) {
      const value = tryEvaluate(action.expression, working, undefined);
      if (value === undefined) continue;
      working[action.variable] = value;
      changes[action.variable] = value;
    }
    set(changes);
    play("pop");
  };
  return <div className="my-2 flex justify-center">
    <button type="button" className={`btn press ${node.style === "outline" ? "btn-outline" : "btn-primary"}`} onClick={run}>{fillTemplate(node.label, scope)}</button>
  </div>;
}

function DisplayBlock({ node }: { node: Extract<CurieNode, { type: "display" }> }) {
  const { scope } = useVariables();
  return <section className="my-2 rounded-3xl border border-base-300 bg-base-100 p-5 sm:p-6">
    {node.title && <h3 className="font-display mb-4 text-lg font-semibold">{fillTemplate(node.title, scope)}</h3>}
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${node.items.length > 2 ? 9 : 12}rem, 1fr))` }}>
      {node.items.map((item, index) => <div key={index} className="rounded-2xl bg-base-200/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-base-content/55">{item.label}</p>
        <p className="font-display mt-1 text-2xl font-bold tabular-nums text-primary" aria-live="polite">
          {formatValue(tryEvaluate(item.expression, scope, undefined))}{item.unit && <span className="ml-1 text-base font-semibold text-base-content/55">{item.unit}</span>}
        </p>
      </div>)}
    </div>
  </section>;
}

const PLOT_SAMPLES = 160;
const PLOT_COLORS = ["--color-primary", "--color-accent", "--color-secondary", "--color-info", "--color-warning", "--color-success"];

function PlotBlock({ node }: { node: Extract<CurieNode, { type: "plot" }> }) {
  const { scope } = useVariables();
  const { mode } = useSettings();
  const colors = useMemo(() => PLOT_COLORS.map((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#5b4bd5"), [mode]);
  const data = useMemo(() => Array.from({ length: PLOT_SAMPLES + 1 }, (_, i) => {
    const x = node.xMin + (node.xMax - node.xMin) * (i / PLOT_SAMPLES);
    const point: Record<string, number | null> = { x };
    node.functions.forEach((fn, index) => {
      const y = tryEvaluate(fn.expression, { ...scope, x }, undefined);
      // Gaps (e.g. tan near π/2 or sqrt of negatives) break the line instead of drawing nonsense.
      point[`f${index}`] = typeof y === "number" && Number.isFinite(y) ? y : null;
    });
    return point;
  }), [node, scope]);
  const fixedY = node.yMin !== undefined || node.yMax !== undefined;
  const axisTick = { fill: "currentColor", fontSize: 12, opacity: 0.7 };
  return <section className="my-2 rounded-3xl border border-base-300 bg-base-100 p-4 sm:p-6">
    {node.title && <h3 className="font-display mb-4 text-lg font-semibold">{fillTemplate(node.title, scope)}</h3>}
    <div className="h-72 w-full text-base-content">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: node.xLabel ? 18 : 4, left: node.yLabel ? 8 : 0 }}>
          <CartesianGrid strokeDasharray="3 4" stroke="currentColor" opacity={0.12} />
          <XAxis dataKey="x" type="number" domain={[node.xMin, node.xMax]} tickFormatter={(value: number) => formatValue(value)} tick={axisTick} tickLine={false} axisLine={{ stroke: "currentColor", opacity: 0.2 }}
            label={node.xLabel ? { value: node.xLabel, position: "insideBottom", offset: -12, fill: "currentColor", fontSize: 12, opacity: 0.6 } : undefined} />
          <YAxis type="number" domain={[node.yMin ?? "auto", node.yMax ?? "auto"]} allowDataOverflow={fixedY} tickFormatter={(value: number) => formatValue(value)} tick={axisTick} tickLine={false} axisLine={false} width={48}
            label={node.yLabel ? { value: node.yLabel, angle: -90, position: "insideLeft", fill: "currentColor", fontSize: 12, opacity: 0.6, style: { textAnchor: "middle" } } : undefined} />
          <Tooltip formatter={(value: number) => formatValue(value)} labelFormatter={(value: number) => `x = ${formatValue(value)}`} cursor={{ stroke: "currentColor", strokeOpacity: 0.2 }}
            contentStyle={{ borderRadius: 12, border: "1px solid var(--color-base-300)", background: "var(--color-base-100)", color: "var(--color-base-content)" }} />
          {node.functions.length > 1 && <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: 12, paddingBottom: 8 }} />}
          {node.functions.map((fn, index) => <Line key={index} dataKey={`f${index}`} name={fillTemplate(fn.label || fn.expression, scope)} type="monotone" dot={false} stroke={colors[index % colors.length]}
            strokeWidth={3} isAnimationActive={false} connectNulls={false} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  </section>;
}

function DiagramBlock({ node, assets, onError }: { node: Extract<CurieNode, { type: "diagram" }>; assets?: AssetMap; onError: Props["onError"] }) {
  const blob = assets?.[node.src];
  const [markup, setMarkup] = useState<{ svg?: string; failed?: string }>({});
  const container = useRef<HTMLDivElement>(null);
  const { scope } = useVariables();

  useEffect(() => {
    let active = true;
    setMarkup({});
    if (!blob) { setMarkup({ failed: node.src ? "Diagram file is missing" : "No SVG chosen yet" }); return; }
    blob.text().then((text) => active && setMarkup({ svg: sanitizeSvg(text) }))
      .catch((error: unknown) => {
        if (!active) return;
        setMarkup({ failed: "Diagram could not be displayed" });
        onError(error instanceof Error ? error.message : "Diagram could not be displayed.");
      });
    return () => { active = false; };
  }, [blob, node.src, onError]);

  // Bindings are applied directly to the SVG elements; React doesn't own the SVG's contents.
  useLayoutEffect(() => {
    const root = container.current;
    if (!root || !markup.svg) return;
    for (const binding of node.bindings) {
      if (isBlockedProperty(binding.property)) continue;
      const element = root.querySelector(`[id="${CSS.escape(binding.target)}"]`);
      const value = tryEvaluate(binding.expression, scope, undefined);
      if (!element || value === undefined) continue;
      if (binding.property === "text") element.textContent = formatValue(value);
      else element.setAttribute(binding.property, typeof value === "number" ? formatValue(value) : String(value));
    }
  }, [markup.svg, node.bindings, scope]);

  return <figure className="my-2 rounded-3xl border border-base-300 bg-base-100 p-4 sm:p-6">
    {node.title && <h3 className="font-display mb-3 text-lg font-semibold">{fillTemplate(node.title, scope)}</h3>}
    {markup.failed ? <MediaFallback label={markup.failed} src={node.src} />
      : markup.svg ? <div ref={container} className="curie-diagram mx-auto max-w-2xl [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: markup.svg }} />
      : <div className="skeleton h-56 w-full rounded-2xl" />}
    <Caption>{node.caption && fillTemplate(node.caption, scope)}</Caption>
  </figure>;
}

const FLIP_MS = 170;

/**
 * Flips in two halves (turn edge-on, swap the face, turn back) instead of a 3D card with hidden back
 * faces, which flickers in WebKitGTK and some Android webviews.
 */
function FlashcardBlock({ node }: { node: Extract<CurieNode, { type: "flashcard" }> }) {
  const [flipped, setFlipped] = useState(false);
  const [turning, setTurning] = useState(false);
  const fill = useFill();
  const front = fill(node.front);
  const back = fill(node.back);
  const { reducedMotion } = useSettings();
  const play = useSound();
  const flip = () => {
    if (turning) return;
    play("flip");
    if (reducedMotion) return setFlipped(!flipped);
    setTurning(true);
    setTimeout(() => { setFlipped((value) => !value); setTurning(false); }, FLIP_MS);
  };
  return <button type="button" aria-pressed={flipped} onClick={flip}
    aria-label={flipped ? `Answer: ${back}. Press to see the question.` : `${front}. Press to reveal the answer.`}
    style={{ transform: `perspective(1200px) rotateY(${turning ? 90 : 0}deg)`, transition: `transform ${FLIP_MS}ms ${turning ? "ease-in" : "ease-out"}` }}
    className={`my-2 flex min-h-52 w-full flex-col items-center justify-center rounded-3xl border p-6 text-center transition-colors ${flipped ? "border-primary/30 bg-primary text-primary-content" : "border-base-300 bg-gradient-to-br from-base-200/80 to-base-100 hover:border-primary/40"}`}>
    <span className={`mb-3 text-xs font-bold uppercase tracking-[0.16em] ${flipped ? "opacity-70" : "text-primary"}`}>{flipped ? "Answer" : "Flashcard"}</span>
    <span className="font-display text-xl font-semibold leading-snug">{flipped ? back : front}</span>
    {!flipped && <span className="mt-4 text-xs text-base-content/50">Tap to flip</span>}
  </button>;
}

/** Keeps one malformed or failing block from taking down the whole lesson. */
class BlockErrorBoundary extends Component<{ id: string; onError: Props["onError"]; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, _info: ErrorInfo) { this.props.onError(`Block "${this.props.id}" could not be displayed: ${error.message}`); }
  render() {
    return this.state.failed
      ? <div role="note" className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">This part of the lesson could not be displayed.</div>
      : this.props.children;
  }
}

export default function BlockRenderer(props: Props) {
  const { scope } = useVariables();
  const { showIf } = props.node;
  const hidden = !!showIf && !tryEvaluate(showIf, scope, false);
  // Learners never see hidden blocks; the editor shows them faded so they can still be edited.
  if (hidden && !props.frame) return null;
  const content = <div id={`block-${props.node.id}`} className={`scroll-mt-24 ${hidden ? "relative opacity-40" : ""}`}>
    {hidden && <span className="badge badge-sm absolute -top-3 right-2 z-10 gap-1 border-base-300 bg-base-100 font-mono"><EyeOff size={11} /> {showIf}</span>}
    <BlockErrorBoundary id={props.node.id} onError={props.onError}><Block {...props} /></BlockErrorBoundary>
  </div>;
  return props.frame ? props.frame(props.node, content) : content;
}

function Block({ node, assets, onError, frame }: Props) {
  switch (node.type) {
    case "markdown": return <MarkdownBlock content={node.content} />;
    case "image": return <ImageBlock node={node} assets={assets} onError={onError} />;
    case "video": return <VideoBlock node={node} assets={assets} onError={onError} />;
    case "lottie": return <LottieBlock node={node} assets={assets} onError={onError} />;
    case "graph": return <GraphBlock node={node} />;
    case "callout": return <CalloutBlock node={node} />;
    case "divider": return <div className="my-6 flex items-center justify-center gap-2 text-base-content/25" role="separator"><span className="size-1.5 rounded-full bg-current" /><span className="size-1.5 rounded-full bg-current" /><span className="size-1.5 rounded-full bg-current" /></div>;
    case "reveal": return <RevealBlock node={node} />;
    case "quiz": return <QuizBlock node={node} />;
    case "slider": return <SliderBlock node={node} />;
    case "flashcard": return <FlashcardBlock node={node} />;
    case "toggle": return <ToggleBlock node={node} />;
    case "choice": return <ChoiceBlock node={node} />;
    case "button": return <ButtonBlock node={node} />;
    case "display": return <DisplayBlock node={node} />;
    case "plot": return <PlotBlock node={node} />;
    case "diagram": return <DiagramBlock node={node} assets={assets} onError={onError} />;
    case "section": return <section className="my-4 border-l-2 border-primary/15 pl-4 sm:pl-6">
      {node.title && <h2 className="font-display mb-5 text-2xl font-bold tracking-tight sm:text-3xl">{node.title}</h2>}
      <div className="space-y-7">{node.children.map((child) => <BlockRenderer key={child.id} node={child} assets={assets} onError={onError} frame={frame} />)}</div>
    </section>;
  }
}
