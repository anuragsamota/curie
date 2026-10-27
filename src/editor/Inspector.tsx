import { useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, ChevronDown, Link2, Plus, Table, Trash2, Upload, X } from "lucide-react";
import type { AssetMap, Issue } from "../curie/package";
import type { CurieManifest, CurieNode, GraphNode } from "../curie/types";
import { flattenBlocks, readingMinutes } from "../lib/lesson";
import type { CurieDocument } from "../curie/types";
import { BLOCKS, acceptsAsset, assetKind } from "./blocks";

type Change = (node: CurieNode) => void;

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return <label className="flex flex-col gap-1.5">
    <span className="text-xs font-semibold text-base-content/70">{label}</span>
    {children}
    {hint && <span className="text-xs leading-5 text-base-content/50">{hint}</span>}
  </label>;
}

function Text({ value, onChange, placeholder, mono }: { value: string; onChange: (value: string) => void; placeholder?: string; mono?: boolean }) {
  return <input className={`input input-sm w-full ${mono ? "font-mono text-xs" : ""}`} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />;
}

function Area({ value, onChange, placeholder, rows = 4, mono }: { value: string; onChange: (value: string) => void; placeholder?: string; rows?: number; mono?: boolean }) {
  return <textarea className={`textarea textarea-sm w-full [field-sizing:content] leading-6 ${mono ? "font-mono text-[0.8rem]" : ""}`} style={{ minHeight: `${rows * 1.5 + 1}rem`, maxHeight: "60vh" }}
    value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} spellCheck={!mono} />;
}

function Num({ value, onChange, step }: { value: number; onChange: (value: number) => void; step?: number }) {
  const [text, setText] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) { setLastValue(value); setText(String(value)); }
  return <input type="number" className="input input-sm w-full tabular-nums" value={text} step={step ?? "any"} onChange={(event) => {
    setText(event.target.value);
    const parsed = Number(event.target.value);
    if (event.target.value.trim() !== "" && Number.isFinite(parsed)) { setLastValue(parsed); onChange(parsed); }
  }} />;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
    <span>{label}</span>
    <input type="checkbox" className="toggle toggle-sm toggle-primary" checked={checked} onChange={(event) => onChange(event.target.checked)} />
  </label>;
}

const MARKDOWN_HINT = <>Markdown: <code>**bold**</code>, <code>- list</code>, <code>## heading</code>. Inline math <code>$x^2$</code>; display math with <code>$$</code> on its own lines.</>;

function AssetPicker({ kind, value, assets, onChange, onUpload }: {
  kind: "image" | "video" | "lottie"; value: string; assets: AssetMap; onChange: (src: string) => void; onUpload: (files: File[]) => Promise<string[]>;
}) {
  const external = value !== "" && !value.startsWith("assets/");
  const [mode, setMode] = useState<"file" | "url">(external ? "url" : "file");
  const input = useRef<HTMLInputElement>(null);
  const options = Object.keys(assets).filter((path) => assetKind(path) === kind);
  const accept = kind === "image" ? "image/*" : kind === "video" ? "video/mp4,video/webm,video/ogg,video/quicktime" : ".json,application/json";
  return <div className="flex flex-col gap-2">
    <div className="join w-full">
      <button type="button" className={`btn btn-xs join-item flex-1 ${mode === "file" ? "btn-active" : "btn-ghost"}`} onClick={() => setMode("file")}><Upload size={12} /> Lesson file</button>
      <button type="button" className={`btn btn-xs join-item flex-1 ${mode === "url" ? "btn-active" : "btn-ghost"}`} onClick={() => setMode("url")}><Link2 size={12} /> Web URL</button>
    </div>
    {mode === "file" ? <>
      <div className="flex gap-2">
        <select className="select select-sm flex-1" value={value.startsWith("assets/") ? value : ""} onChange={(event) => onChange(event.target.value)}>
          <option value="">{options.length ? "Choose a file…" : "No matching files yet"}</option>
          {options.map((path) => <option key={path} value={path}>{path.replace(/^assets\//, "")}</option>)}
        </select>
        <button type="button" className="btn btn-sm btn-primary btn-soft" onClick={() => input.current?.click()}><Upload size={14} /> Upload</button>
      </div>
      <input ref={input} type="file" accept={accept} className="hidden" onChange={async (event) => {
        const files = [...(event.target.files ?? [])];
        event.target.value = "";
        const [path] = await onUpload(files);
        if (path) onChange(path);
      }} />
      <span className="text-xs text-base-content/50">Files are packaged with the lesson, so it works offline.</span>
    </> : <>
      <Text value={external ? value : ""} onChange={onChange} placeholder="https://…" mono />
      <span className="text-xs text-base-content/50">Web media needs an internet connection and may stop working if the link changes.</span>
    </>}
  </div>;
}

function GraphData({ node, onChange }: { node: GraphNode; onChange: (data: GraphNode["data"]) => void }) {
  const [csvMode, setCsvMode] = useState(false);
  const [csv, setCsv] = useState("");
  const parseX = (text: string) => text.trim() !== "" && Number.isFinite(Number(text)) ? Number(text) : text;
  return <div className="flex flex-col gap-2">
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold text-base-content/70">Data points</span>
      <button type="button" className="btn btn-ghost btn-xs" onClick={() => { setCsv(node.data.map((point) => `${point.x}, ${point.y}`).join("\n")); setCsvMode(!csvMode); }}><Table size={12} /> {csvMode ? "Table" : "Paste CSV"}</button>
    </div>
    {csvMode ? <>
      <Area value={csv} onChange={setCsv} rows={6} mono placeholder={"0, 1\n1, 3\n2, 5"} />
      <button type="button" className="btn btn-sm btn-primary" onClick={() => {
        const rows = csv.split("\n").map((line) => line.split(/[,;\t]/)).filter((cells) => cells.length >= 2 && Number.isFinite(Number(cells[1])))
          .map(([x, y]) => ({ x: parseX(x), y: Number(y) }));
        if (rows.length) { onChange(rows); setCsvMode(false); }
      }}>Apply {csv.split("\n").filter((line) => line.trim()).length} rows</button>
    </> : <div className="overflow-hidden rounded-xl border border-base-300">
      <div className="grid grid-cols-[1fr_1fr_28px] bg-base-200 px-2 py-1 text-xs font-semibold text-base-content/60"><span>x</span><span>y</span><span /></div>
      <div className="max-h-64 overflow-y-auto scroll-thin">
        {node.data.map((point, index) => <div key={index} className="grid grid-cols-[1fr_1fr_28px] items-center gap-1 border-t border-base-300 px-1 py-1">
          <input className="input input-xs input-ghost w-full font-mono" value={String(point.x)} aria-label={`x value ${index + 1}`}
            onChange={(event) => onChange(node.data.map((p, i) => i === index ? { ...p, x: parseX(event.target.value) } : p))} />
          <input type="number" step="any" className="input input-xs input-ghost w-full font-mono" value={point.y} aria-label={`y value ${index + 1}`}
            onChange={(event) => Number.isFinite(event.target.valueAsNumber) && onChange(node.data.map((p, i) => i === index ? { ...p, y: event.target.valueAsNumber } : p))} />
          <button type="button" className="btn btn-ghost btn-xs btn-square" aria-label="Remove row" disabled={node.data.length <= 1} onClick={() => onChange(node.data.filter((_, i) => i !== index))}><X size={12} /></button>
        </div>)}
      </div>
      <button type="button" className="btn btn-ghost btn-xs w-full rounded-none border-t border-base-300" onClick={() => {
        const last = node.data[node.data.length - 1];
        onChange([...node.data, { x: typeof last?.x === "number" ? last.x + 1 : "", y: last?.y ?? 0 }]);
      }}><Plus size={12} /> Add row</button>
    </div>}
  </div>;
}

function BlockFields({ node, onChange, assets, onUpload }: { node: CurieNode; onChange: Change; assets: AssetMap; onUpload: (files: File[]) => Promise<string[]> }) {
  const set = (patch: Record<string, unknown>) => onChange({ ...node, ...patch } as CurieNode);
  const kind = acceptsAsset(node.type);
  switch (node.type) {
    case "markdown":
      return <Field label="Content" hint={MARKDOWN_HINT}><Area value={node.content} onChange={(content) => set({ content })} rows={12} mono /></Field>;
    case "callout":
      return <>
        <Field label="Style">
          <div className="grid grid-cols-4 gap-1">{(["info", "tip", "warning", "success"] as const).map((variant) =>
            <button key={variant} type="button" onClick={() => set({ variant })} className={`btn btn-xs capitalize ${node.variant === variant ? "btn-primary" : "btn-ghost border-base-300"}`}>{variant}</button>)}</div>
        </Field>
        <Field label="Title"><Text value={node.title ?? ""} onChange={(title) => set({ title: title || undefined })} placeholder="Optional" /></Field>
        <Field label="Content" hint={MARKDOWN_HINT}><Area value={node.content} onChange={(content) => set({ content })} rows={5} mono /></Field>
      </>;
    case "image":
      return <>
        <Field label="Image"><AssetPicker kind="image" value={node.src} assets={assets} onChange={(src) => set({ src })} onUpload={onUpload} /></Field>
        <Field label="Alternative text" hint="Describe the image for people who can't see it."><Area value={node.alt} onChange={(alt) => set({ alt })} rows={2} /></Field>
        <Field label="Caption"><Text value={node.caption ?? ""} onChange={(caption) => set({ caption: caption || undefined })} placeholder="Optional" /></Field>
      </>;
    case "video":
    case "lottie":
      return <>
        <Field label={node.type === "video" ? "Video" : "Lottie JSON"}><AssetPicker kind={kind!} value={node.src} assets={assets} onChange={(src) => set({ src })} onUpload={onUpload} /></Field>
        <Field label="Title"><Text value={node.title ?? ""} onChange={(title) => set({ title: title || undefined })} placeholder="Optional" /></Field>
        <Field label="Caption"><Text value={node.caption ?? ""} onChange={(caption) => set({ caption: caption || undefined })} placeholder="Optional" /></Field>
        {node.type === "lottie" && <div className="flex flex-col gap-2 rounded-xl bg-base-200/60 p-3">
          <Toggle label="Loop" checked={node.loop ?? true} onChange={(loop) => set({ loop })} />
          <Toggle label="Play automatically" checked={node.autoplay ?? true} onChange={(autoplay) => set({ autoplay })} />
        </div>}
      </>;
    case "graph":
      return <>
        <Field label="Chart type">
          <div className="grid grid-cols-3 gap-1">{(["line", "area", "bar"] as const).map((chart) =>
            <button key={chart} type="button" onClick={() => set({ kind: chart })} className={`btn btn-xs capitalize ${node.kind === chart ? "btn-primary" : "btn-ghost border-base-300"}`}>{chart}</button>)}</div>
        </Field>
        <Field label="Title"><Text value={node.title ?? ""} onChange={(title) => set({ title: title || undefined })} placeholder="Optional" /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="X axis label"><Text value={node.xLabel ?? ""} onChange={(xLabel) => set({ xLabel: xLabel || undefined })} /></Field>
          <Field label="Y axis label"><Text value={node.yLabel ?? ""} onChange={(yLabel) => set({ yLabel: yLabel || undefined })} /></Field>
        </div>
        <GraphData node={node} onChange={(data) => set({ data })} />
      </>;
    case "quiz":
      return <>
        <Field label="Question"><Area value={node.question} onChange={(question) => set({ question })} rows={2} /></Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-base-content/70">Answers <span className="font-normal text-base-content/50">(select the correct one)</span></span>
          {node.options.map((option, index) => <div key={index} className="flex items-center gap-2">
            <input type="radio" className="radio radio-sm radio-success" name={`correct-${node.id}`} checked={node.correctIndex === index} onChange={() => set({ correctIndex: index })} aria-label={`Mark answer ${index + 1} as correct`} />
            <input className={`input input-sm flex-1 ${node.correctIndex === index ? "input-success" : ""}`} value={option} onChange={(event) => set({ options: node.options.map((o, i) => i === index ? event.target.value : o) })} />
            <button type="button" className="btn btn-ghost btn-xs btn-square" aria-label="Remove answer" disabled={node.options.length <= 2}
              onClick={() => set({ options: node.options.filter((_, i) => i !== index), correctIndex: index < node.correctIndex ? node.correctIndex - 1 : index === node.correctIndex ? 0 : node.correctIndex })}><X size={13} /></button>
          </div>)}
          {node.options.length < 8 && <button type="button" className="btn btn-ghost btn-xs self-start" onClick={() => set({ options: [...node.options, `Answer ${node.options.length + 1}`] })}><Plus size={12} /> Add answer</button>}
        </div>
        <Field label="Explanation" hint="Shown after a correct answer."><Area value={node.explanation ?? ""} onChange={(explanation) => set({ explanation: explanation || undefined })} rows={2} /></Field>
      </>;
    case "slider":
      return <>
        <Field label="Label"><Text value={node.label} onChange={(label) => set({ label })} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Minimum"><Num value={node.min} onChange={(min) => set({ min })} /></Field>
          <Field label="Maximum"><Num value={node.max} onChange={(max) => set({ max })} /></Field>
          <Field label="Step"><Num value={node.step ?? 1} onChange={(step) => step > 0 && set({ step })} /></Field>
          <Field label="Starting value"><Num value={node.initial} onChange={(initial) => set({ initial })} /></Field>
        </div>
        <Field label="Unit"><Text value={node.unit ?? ""} onChange={(unit) => set({ unit: unit || undefined })} placeholder="e.g. kg, m/s" /></Field>
      </>;
    case "reveal":
      return <>
        <Field label="Button label"><Text value={node.title} onChange={(title) => set({ title })} /></Field>
        <Field label="Hidden content" hint={MARKDOWN_HINT}><Area value={node.content} onChange={(content) => set({ content })} rows={5} mono /></Field>
        <Toggle label="Start open" checked={node.initiallyOpen ?? false} onChange={(initiallyOpen) => set({ initiallyOpen })} />
      </>;
    case "flashcard":
      return <>
        <Field label="Front (prompt)"><Area value={node.front} onChange={(front) => set({ front })} rows={2} /></Field>
        <Field label="Back (answer)"><Area value={node.back} onChange={(back) => set({ back })} rows={2} /></Field>
      </>;
    case "section":
      return <>
        <Field label="Section title"><Text value={node.title ?? ""} onChange={(title) => set({ title: title || undefined })} /></Field>
        <p className="text-xs text-base-content/55">This section contains {node.children.length} {node.children.length === 1 ? "block" : "blocks"}. Drag blocks into it in the outline, or use the + inside it.</p>
      </>;
    case "divider":
      return <p className="text-sm text-base-content/60">A divider has no settings.</p>;
  }
}

export function BlockInspector({ node, issues, onChange, onRemove, assets, onUpload }: {
  node: CurieNode; issues: Issue[]; onChange: Change; onRemove: () => void; assets: AssetMap; onUpload: (files: File[]) => Promise<string[]>;
}) {
  const def = BLOCKS[node.type];
  const idField = useId();
  const [advanced, setAdvanced] = useState(false);
  return <div className="flex flex-col gap-4">
    <div className="flex items-center gap-3">
      <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><def.icon size={18} /></span>
      <div className="min-w-0 flex-1"><p className="font-display font-bold">{def.label}</p><p className="truncate text-xs text-base-content/55">{def.description}</p></div>
      <button className="btn btn-ghost btn-sm btn-square text-error" aria-label="Delete block" title="Delete block (Del)" onClick={onRemove}><Trash2 size={16} /></button>
    </div>
    {issues.length > 0 && <div className="flex flex-col gap-1 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs">
      {issues.map((issue, index) => <p key={index} className="flex gap-2"><AlertTriangle size={14} className="mt-px shrink-0 text-warning" />{issue.message}</p>)}
    </div>}
    <div className="flex flex-col gap-4"><BlockFields node={node} onChange={onChange} assets={assets} onUpload={onUpload} /></div>
    <div className="border-t border-base-300 pt-3">
      <button type="button" className="flex w-full items-center justify-between text-xs font-semibold text-base-content/55" onClick={() => setAdvanced(!advanced)} aria-expanded={advanced}>
        Advanced <ChevronDown size={14} className={`transition-transform ${advanced ? "rotate-180" : ""}`} />
      </button>
      {advanced && <div className="animate-fade mt-3">
        <Field label="Block id" hint="Stable identifier used in the lesson file. Must be unique."><input id={idField} className="input input-sm w-full font-mono text-xs" value={node.id} onChange={(event) => onChange({ ...node, id: event.target.value.replace(/\s+/g, "-") })} /></Field>
      </div>}
    </div>
  </div>;
}

export function LessonInspector({ manifest, document, assets, onChange }: { manifest: CurieManifest; document: CurieDocument; assets: AssetMap; onChange: (manifest: CurieManifest) => void }) {
  const blocks = flattenBlocks(document.blocks);
  return <div className="flex flex-col gap-4">
    <div><p className="font-display text-lg font-bold">Lesson details</p><p className="text-xs text-base-content/55">Select a block on the canvas to edit it.</p></div>
    <Field label="Title"><Text value={manifest.title} onChange={(title) => onChange({ ...manifest, title })} /></Field>
    <Field label="Description"><Area value={manifest.description ?? ""} onChange={(description) => onChange({ ...manifest, description: description || undefined })} rows={3} /></Field>
    <Field label="Author"><Text value={manifest.author ?? ""} onChange={(author) => onChange({ ...manifest, author: author || undefined })} /></Field>
    <Field label="Lesson id" hint="A stable identifier that travels with the exported file, e.g. org.school.physics.density."><Text value={manifest.id} onChange={(id) => onChange({ ...manifest, id })} mono /></Field>
    <div className="grid grid-cols-3 gap-2 text-center">
      {[["Blocks", blocks.length], ["Minutes", readingMinutes(document)], ["Files", Object.keys(assets).length]].map(([label, value]) =>
        <div key={label} className="rounded-xl bg-base-200/70 p-2"><p className="font-display text-lg font-bold">{value}</p><p className="text-[0.7rem] text-base-content/55">{label}</p></div>)}
    </div>
  </div>;
}
