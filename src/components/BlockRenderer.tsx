import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import Lottie from "lottie-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { CurieNode } from "../curie/types";
import type JSZip from "jszip";

type Props = { node: CurieNode; zip?: JSZip; onError: (message: string) => void };

function MarkdownBlock({ content }: { content: string }) {
  return <div className="prose prose-slate max-w-none dark:prose-invert curie-prose">
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{content}</ReactMarkdown>
  </div>;
}

function mimeForPath(path: string): string {
  const ext = path.split("?")[0].split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
    avif: "image/avif", svg: "image/svg+xml", bmp: "image/bmp", ico: "image/x-icon",
    mp4: "video/mp4", webm: "video/webm", ogv: "video/ogg", mov: "video/quicktime",
    json: "application/json", lottie: "application/json",
  };
  return types[ext || ""] || "application/octet-stream";
}

function useAsset(src: string, zip?: JSZip, onError?: (message: string) => void) {
  const [resolved, setResolved] = useState<string>();
  useEffect(() => {
    let objectUrl: string | undefined;
    let active = true;
    setResolved(undefined);

    async function resolve() {
      if (/^https?:\/\//i.test(src) || src.startsWith("data:") || src.startsWith("blob:")) {
        if (active) setResolved(src);
        return;
      }
      if (!zip || !src.startsWith("assets/") || src.split("/").includes("..")) {
        onError?.(`Asset path is not available: ${src}`);
        return;
      }
      const entry = zip.file(src);
      if (!entry) {
        onError?.(`Missing asset in lesson package: ${src}`);
        return;
      }
      const bytes = await entry.async("uint8array");
      const blob = new Blob([bytes], { type: mimeForPath(src) });
      objectUrl = URL.createObjectURL(blob);
      if (active) setResolved(objectUrl);
    }
    void resolve().catch((error: unknown) => onError?.(error instanceof Error ? error.message : `Could not load asset: ${src}`));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, zip, onError]);
  return resolved;
}

function ImageBlock({ node, zip, onError }: { node: Extract<CurieNode, {type:"image"}>; zip?: JSZip; onError: Props["onError"] }) {
  const src = useAsset(node.src, zip, onError);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return <figure className="my-6">
    {src && !failed ? <img src={src} alt={node.alt} className="mx-auto max-h-[34rem] w-auto max-w-full rounded-2xl object-contain" loading="lazy" onError={() => { setFailed(true); onError(`Image could not be displayed: ${node.src}`); }} />
      : <div className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-2xl border border-base-300 bg-base-200/50 p-6 text-center text-sm text-base-content/60"><span className="text-3xl">▧</span><span>{failed ? "Image failed to load" : "Loading image…"}</span><span className="break-all text-xs">{node.src}</span></div>}
    {node.caption && <figcaption className="mt-3 text-center text-sm text-base-content/60">{node.caption}</figcaption>}
  </figure>;
}

function VideoBlock({ node, zip, onError }: { node: Extract<CurieNode, {type:"video"}>; zip?: JSZip; onError: Props["onError"] }) {
  const src = useAsset(node.src, zip, onError);
  return <figure className="my-7">
    {node.title && <h3 className="mb-3 text-lg font-semibold">{node.title}</h3>}
    {src ? <video className="w-full rounded-2xl bg-black shadow-sm" controls preload="metadata" src={src}>Your browser does not support embedded video.</video> : <div className="skeleton aspect-video w-full rounded-2xl" />}
    {node.caption && <figcaption className="mt-3 text-center text-sm text-base-content/60">{node.caption}</figcaption>}
  </figure>;
}

function LottieBlock({ node, zip, onError }: { node: Extract<CurieNode, {type:"lottie"}>; zip?: JSZip; onError: Props["onError"] }) {
  const src = useAsset(node.src, zip, onError);
  const [animationData, setAnimationData] = useState<unknown>();
  useEffect(() => {
    let active = true;
    setAnimationData(undefined);
    if (!src) return;
    fetch(src).then((response) => {
      if (!response.ok) throw new Error(`Lottie fetch failed (${response.status})`);
      return response.json();
    }).then((data: unknown) => { if (active) setAnimationData(data); })
      .catch((error: unknown) => onError(error instanceof Error ? error.message : "Could not load Lottie animation."));
    return () => { active = false; };
  }, [src, onError]);
  return <figure className="my-7 rounded-2xl border border-base-300 bg-base-200/30 p-4 sm:p-6">
    {node.title && <h3 className="mb-3 text-center text-lg font-semibold">{node.title}</h3>}
    {animationData ? <div className="mx-auto max-h-80 max-w-md"><Lottie animationData={animationData} loop={node.loop ?? true} autoplay={node.autoplay ?? true} /></div>
      : <div className="skeleton mx-auto h-48 w-full max-w-md rounded-xl" />}
    {node.caption && <figcaption className="mt-3 text-center text-sm text-base-content/60">{node.caption}</figcaption>}
  </figure>;
}

function GraphBlock({ node }: { node: Extract<CurieNode, {type:"graph"}> }) {
  const chart = useMemo(() => {
    const common = { data: node.data, margin: { top: 12, right: 16, bottom: 8, left: 0 } };
    const axis = <>
      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.14} />
      <XAxis dataKey="x" tick={{ fill: "currentColor", fontSize: 12 }} tickLine={false} axisLine={false} />
      <YAxis tick={{ fill: "currentColor", fontSize: 12 }} tickLine={false} axisLine={false} width={42} />
      <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--fallback-b3, #ddd)", background: "var(--fallback-b1, #fff)", color: "var(--fallback-bc, #111)" }} />
    </>;
    if (node.kind === "bar") return <BarChart {...common}>{axis}<Bar dataKey="y" fill="#16a085" radius={[5, 5, 0, 0]} /></BarChart>;
    if (node.kind === "area") return <AreaChart {...common}>{axis}<Area type="monotone" dataKey="y" stroke="#16a085" fill="#16a085" fillOpacity={0.18} strokeWidth={3} /></AreaChart>;
    return <LineChart {...common}>{axis}<Line type="monotone" dataKey="y" stroke="#16a085" strokeWidth={3} dot={{ r: 4, fill: "#16a085" }} activeDot={{ r: 6 }} /></LineChart>;
  }, [node]);
  return <section className="my-8 rounded-2xl border border-base-300 bg-base-100 p-4 sm:p-6">
    {node.title && <h3 className="mb-4 text-lg font-semibold">{node.title}</h3>}
    <div className="mb-2 flex flex-wrap gap-4 text-xs text-base-content/50">{node.xLabel && <span>X: {node.xLabel}</span>}{node.yLabel && <span>Y: {node.yLabel}</span>}</div>
    <div className="h-72 w-full text-base-content"><ResponsiveContainer width="100%" height="100%">{chart}</ResponsiveContainer></div>
  </section>;
}

function CalloutBlock({ node }: { node: Extract<CurieNode, {type:"callout"}> }) {
  const variants = {
    info: "border-info/30 bg-info/10",
    tip: "border-success/30 bg-success/10",
    warning: "border-warning/40 bg-warning/10",
    success: "border-success/30 bg-success/10",
  };
  return <aside className={`my-6 rounded-2xl border p-4 sm:p-5 ${variants[node.variant]}`}>
    {node.title && <h3 className="mb-1 font-bold">{node.title}</h3>}
    <MarkdownBlock content={node.content} />
  </aside>;
}

function RevealBlock({ node }: { node: Extract<CurieNode, {type:"reveal"}> }) {
  const [open, setOpen] = useState(node.initiallyOpen ?? false);
  return <details className="my-5 rounded-xl border border-base-300 bg-base-100 p-4" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer select-none font-semibold">{node.title}</summary>
    {open && <div className="mt-3"><MarkdownBlock content={node.content} /></div>}
  </details>;
}

function QuizBlock({ node }: { node: Extract<CurieNode, {type:"quiz"}> }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const correct = selected === node.correctIndex;
  return <section className="my-7 rounded-2xl border border-base-300 bg-base-100 p-5 sm:p-6">
    <div className="mb-2 text-xs font-bold uppercase tracking-wider text-primary">Quick check</div>
    <h3 className="mb-4 text-lg font-bold">{node.question}</h3>
    <div className="space-y-2">
      {node.options.map((option, index) => <label key={`${node.id}-${index}`} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${selected === index ? "border-primary bg-primary/5" : "border-base-300 hover:bg-base-200/60"}`}>
        <input className="radio radio-primary mt-0.5" type="radio" name={`quiz-${node.id}`} checked={selected === index} onChange={() => { setSelected(index); setSubmitted(false); }} />
        <span>{option}</span>
      </label>)}
    </div>
    <button className="btn btn-primary btn-sm mt-4" disabled={selected === null} onClick={() => setSubmitted(true)}>Check answer</button>
    {submitted && <div className={`mt-4 rounded-xl p-3 text-sm ${correct ? "bg-success/10 text-success" : "bg-warning/10 text-base-content"}`}>
      <strong>{correct ? "Correct!" : "Not quite."}</strong>
      {node.explanation && <p className="mt-1">{node.explanation}</p>}
    </div>}
  </section>;
}

function SliderBlock({ node }: { node: Extract<CurieNode, {type:"slider"}> }) {
  const [value, setValue] = useState(node.initial);
  const decimals = Math.min(6, (String(node.step ?? 1).split(".")[1] || "").length);
  return <section className="my-7 rounded-2xl border border-base-300 bg-base-100 p-5 sm:p-6">
    <div className="flex items-center justify-between gap-4"><label htmlFor={`slider-${node.id}`} className="font-semibold">{node.label}</label><output className="rounded-lg bg-primary/10 px-3 py-1.5 font-mono font-bold text-primary">{value.toFixed(decimals)}{node.unit ? ` ${node.unit}` : ""}</output></div>
    <input id={`slider-${node.id}`} type="range" className="range range-primary mt-4" min={node.min} max={node.max} step={node.step ?? 1} value={value} onChange={(event) => setValue(Number(event.target.value))} />
    <div className="mt-1 flex justify-between text-xs text-base-content/50"><span>{node.min}{node.unit ? ` ${node.unit}` : ""}</span><span>{node.max}{node.unit ? ` ${node.unit}` : ""}</span></div>
  </section>;
}

function FlashcardBlock({ node }: { node: Extract<CurieNode, {type:"flashcard"}> }) {
  const [flipped, setFlipped] = useState(false);
  return <button type="button" onClick={() => setFlipped((v) => !v)} className="my-6 flex min-h-44 w-full flex-col items-center justify-center rounded-2xl border border-base-300 bg-base-200/50 p-6 text-center transition hover:border-primary/50">
    <span className="mb-3 text-xs font-bold uppercase tracking-widest text-primary">{flipped ? "Answer" : "Flashcard · Tap to reveal"}</span>
    <span className="text-lg font-semibold">{flipped ? node.back : node.front}</span>
  </button>;
}

export default function BlockRenderer({ node, zip, onError }: Props) {
  switch (node.type) {
    case "markdown": return <MarkdownBlock content={node.content} />;
    case "image": return <ImageBlock node={node} zip={zip} onError={onError} />;
    case "video": return <VideoBlock node={node} zip={zip} onError={onError} />;
    case "lottie": return <LottieBlock node={node} zip={zip} onError={onError} />;
    case "graph": return <GraphBlock node={node} />;
    case "callout": return <CalloutBlock node={node} />;
    case "divider": return <hr className="my-8 border-base-300" />;
    case "reveal": return <RevealBlock node={node} />;
    case "quiz": return <QuizBlock node={node} />;
    case "slider": return <SliderBlock node={node} />;
    case "flashcard": return <FlashcardBlock node={node} />;
    case "section": return <section className="my-8">
      {node.title && <h2 className="mb-4 text-2xl font-bold tracking-tight">{node.title}</h2>}
      <div className="space-y-6">{node.children.map((child) => <BlockRenderer key={child.id} node={child} zip={zip} onError={onError} />)}</div>
    </section>;
  }
}
