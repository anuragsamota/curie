import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, ChevronDown, EyeOff, ImageOff, Link2, Plus, Table, Trash2, Upload, Variable, X } from "lucide-react";
import type { AssetMap, Issue } from "../curie/package";
import { checkSyntax } from "../curie/expr";
import { lessonVariables } from "../curie/logic";
import type { CurieManifest, CurieNode, CurieVariable, DiagramNode, DisplayNode, GraphNode } from "../curie/types";
import { flattenBlocks, readingMinutes } from "../lib/lesson";
import type { CurieDocument } from "../curie/types";
import { useObjectUrl } from "../ui/LessonCover";
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


const EXPR_HINT = <>Formulas use variables, <code>+ - * / ^</code>, comparisons, <code>and</code>/<code>or</code>, <code>a ? b : c</code> and functions like <code>sin</code>, <code>sqrt</code>, <code>round(x, 2)</code>.</>;

/** A formula field that flags syntax errors as you type. */
function Expr({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  const error = value.trim() ? checkSyntax(value) : undefined;
  return <div className="flex flex-col gap-1">
    <input className={`input input-sm w-full font-mono text-xs ${error ? "input-warning" : ""}`} value={value} placeholder={placeholder} spellCheck={false} onChange={(event) => onChange(event.target.value)} />
    {error && <span className="text-[0.7rem] text-warning">{error}</span>}
  </div>;
}

/** A variable name field; keeps names to letters, digits and _. */
function VariableField({ value, onChange, names }: { value: string; onChange: (value: string) => void; names?: string[] }) {
  const list = useId();
  return <>
    <input className="input input-sm w-full font-mono text-xs" value={value} list={names ? list : undefined} placeholder="e.g. speed" spellCheck={false}
      onChange={(event) => onChange(event.target.value.replace(/[^A-Za-z0-9_]/g, "").replace(/^[0-9]+/, ""))} />
    {names && <datalist id={list}>{names.map((name) => <option key={name} value={name} />)}</datalist>}
  </>;
}

/** Reads a typed value: numbers and true/false become values, anything else stays text. */
function parseScalar(text: string): number | string | boolean {
  if (text === "true" || text === "false") return text === "true";
  return text.trim() !== "" && Number.isFinite(Number(text)) ? Number(text) : text;
}

/** Rows with add and remove buttons, for options, actions, functions and so on. */
function Rows<T>({ label, items, onChange, render, create, min = 0, max = 20 }: {
  label: string; items: T[]; onChange: (items: T[]) => void; render: (item: T, set: (item: T) => void, index: number) => ReactNode; create: () => T; min?: number; max?: number;
}) {
  return <div className="flex flex-col gap-1.5">
    <span className="text-xs font-semibold text-base-content/70">{label}</span>
    {items.map((item, index) => <div key={index} className="flex items-start gap-1.5 rounded-xl bg-base-200/60 p-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">{render(item, (next) => onChange(items.map((current, i) => i === index ? next : current)), index)}</div>
      <button type="button" className="btn btn-ghost btn-xs btn-square" aria-label="Remove" disabled={items.length <= min} onClick={() => onChange(items.filter((_, i) => i !== index))}><X size={12} /></button>
    </div>)}
    {items.length < max && <button type="button" className="btn btn-ghost btn-xs self-start" onClick={() => onChange([...items, create()])}><Plus size={12} /> Add</button>}
  </div>;
}

/** Element ids in a diagram's SVG, offered as suggestions when binding. */
function useSvgIds(blob?: Blob) {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    if (!blob) { setIds([]); return; }
    void blob.text().then((text) => {
      if (active) setIds([...new DOMParser().parseFromString(text, "image/svg+xml").querySelectorAll("[id]")].map((element) => element.id));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [blob]);
  return ids;
}

const SVG_PROPERTIES = ["text", "transform", "fill", "stroke", "opacity", "x", "y", "cx", "cy", "r", "width", "height", "x1", "y1", "x2", "y2", "d", "points", "stroke-width", "visibility"];

function BindingRows({ node, set, assets }: { node: DiagramNode; set: (patch: Record<string, unknown>) => void; assets: AssetMap }) {
  const ids = useSvgIds(assets[node.src]);
  const idList = useId();
  const propList = useId();
  return <>
    <datalist id={idList}>{ids.map((id) => <option key={id} value={id} />)}</datalist>
    <datalist id={propList}>{SVG_PROPERTIES.map((name) => <option key={name} value={name} />)}</datalist>
    <Rows label="Bindings" items={node.bindings} onChange={(bindings) => set({ bindings })} create={() => ({ target: ids[0] ?? "", property: "transform", expression: "" })}
      render={(binding, update) => <>
        <div className="grid grid-cols-2 gap-1.5">
          <input className="input input-xs w-full font-mono" list={idList} placeholder="element id" value={binding.target} onChange={(event) => update({ ...binding, target: event.target.value })} aria-label="Element id" />
          <input className="input input-xs w-full font-mono" list={propList} placeholder="attribute" value={binding.property} onChange={(event) => update({ ...binding, property: event.target.value })} aria-label="Attribute" />
        </div>
        <Expr value={binding.expression} onChange={(expression) => update({ ...binding, expression })} placeholder={binding.property === "transform" ? "\"rotate(\" + angle + \" 100 100)\"" : "formula"} />
      </>} />
    <span className="text-xs leading-5 text-base-content/50">Give elements an <code>id</code> in your SVG editor, then set one of their attributes (or <code>text</code>) from a formula. {ids.length ? `${ids.length} ids found.` : ""}</span>
  </>;
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

function BlockFields({ node, onChange, assets, onUpload, settable }: {
  node: CurieNode; onChange: Change; assets: AssetMap; onUpload: (files: File[]) => Promise<string[]>; settable: string[];
}) {
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
        <Field label="Variable" hint={<>Optional. Name the value so text (<code>{"{{ mass }}"}</code>), formulas and other blocks can use it.</>}>
          <VariableField value={node.variable ?? ""} onChange={(variable) => set({ variable: variable || undefined })} />
        </Field>
      </>;
    case "toggle":
      return <>
        <Field label="Label"><Text value={node.label} onChange={(label) => set({ label })} /></Field>
        <Field label="Variable" hint="true when switched on, false when off."><VariableField value={node.variable} onChange={(variable) => set({ variable })} /></Field>
        <Toggle label="Starts on" checked={node.initial} onChange={(initial) => set({ initial })} />
      </>;
    case "choice":
      return <>
        <Field label="Label"><Text value={node.label} onChange={(label) => set({ label })} /></Field>
        <Field label="Variable" hint="Set to the chosen option's value."><VariableField value={node.variable} onChange={(variable) => set({ variable })} /></Field>
        <Rows label="Options (label → value)" items={node.options} min={2} max={12} onChange={(options) => set({ options })} create={() => ({ label: `Option ${node.options.length + 1}`, value: node.options.length + 1 })}
          render={(option, update) => <div className="grid grid-cols-[1fr_6rem] gap-1.5">
            <input className="input input-xs w-full" value={option.label} onChange={(event) => update({ ...option, label: event.target.value })} aria-label="Option label" />
            <input className="input input-xs w-full font-mono" value={String(option.value)} onChange={(event) => {
              const value = parseScalar(event.target.value);
              update({ ...option, value: typeof value === "boolean" ? event.target.value : value });
            }} aria-label="Option value" />
          </div>} />
        <Field label="Starts on">
          <select className="select select-sm w-full" value={node.options.findIndex((option) => option.value === node.initial)} onChange={(event) => set({ initial: node.options[Number(event.target.value)].value })}>
            {node.initial !== undefined && !node.options.some((option) => option.value === node.initial) && <option value={-1}>Choose…</option>}
            {node.options.map((option, index) => <option key={index} value={index}>{option.label}</option>)}
          </select>
        </Field>
      </>;
    case "button":
      return <>
        <Field label="Label"><Text value={node.label} onChange={(label) => set({ label })} /></Field>
        <Field label="Style">
          <div className="grid grid-cols-2 gap-1">{(["primary", "outline"] as const).map((style) =>
            <button key={style} type="button" onClick={() => set({ style })} className={`btn btn-xs capitalize ${(node.style ?? "primary") === style ? "btn-primary" : "btn-ghost border-base-300"}`}>{style}</button>)}</div>
        </Field>
        <Rows label="When pressed, set" items={node.actions} min={1} onChange={(actions) => set({ actions })} create={() => ({ variable: settable[0] ?? "", expression: "0" })}
          render={(action, update) => <div className="grid grid-cols-[6.5rem_auto_1fr] items-start gap-1.5">
            <VariableField value={action.variable} onChange={(variable) => update({ ...action, variable })} names={settable} />
            <span className="pt-1 text-sm text-base-content/50">=</span>
            <Expr value={action.expression} onChange={(expression) => update({ ...action, expression })} placeholder="count + 1" />
          </div>} />
        <span className="text-xs leading-5 text-base-content/50">Buttons can change input variables and lesson values, not formulas.</span>
      </>;
    case "display":
      return <>
        <Field label="Title"><Text value={node.title ?? ""} onChange={(title) => set({ title: title || undefined })} placeholder="Optional" /></Field>
        <Rows<DisplayNode["items"][number]> label="Values" items={node.items} min={1} max={8} onChange={(items) => set({ items })} create={() => ({ label: "", expression: "" })}
          render={(item, update) => <>
            <div className="grid grid-cols-[1fr_5rem] gap-1.5">
              <input className="input input-xs w-full" placeholder="Label" value={item.label} onChange={(event) => update({ ...item, label: event.target.value })} aria-label="Label" />
              <input className="input input-xs w-full" placeholder="Unit" value={item.unit ?? ""} onChange={(event) => update({ ...item, unit: event.target.value || undefined })} aria-label="Unit" />
            </div>
            <Expr value={item.expression} onChange={(expression) => update({ ...item, expression })} placeholder="mass * 9.81" />
          </>} />
        <span className="text-xs leading-5 text-base-content/50">{EXPR_HINT}</span>
      </>;
    case "plot":
      return <>
        <Field label="Title"><Text value={node.title ?? ""} onChange={(title) => set({ title: title || undefined })} placeholder="Optional" /></Field>
        <Rows label="Functions of x" items={node.functions} min={1} max={6} onChange={(functions) => set({ functions })} create={() => ({ expression: "x", label: "" })}
          render={(fn, update) => <>
            <div className="flex items-center gap-1.5"><span className="font-mono text-xs text-base-content/55">y =</span><div className="flex-1"><Expr value={fn.expression} onChange={(expression) => update({ ...fn, expression })} placeholder="a * sin(b * x)" /></div></div>
            <input className="input input-xs w-full" placeholder="Legend label (optional)" value={fn.label ?? ""} onChange={(event) => update({ ...fn, label: event.target.value || undefined })} aria-label="Legend label" />
          </>} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="x from"><Num value={node.xMin} onChange={(xMin) => set({ xMin })} /></Field>
          <Field label="x to"><Num value={node.xMax} onChange={(xMax) => set({ xMax })} /></Field>
          <Field label="y from" hint="Empty = automatic"><input type="number" step="any" className="input input-sm w-full" value={node.yMin ?? ""} onChange={(event) => set({ yMin: event.target.value === "" ? undefined : event.target.valueAsNumber })} /></Field>
          <Field label="y to"><input type="number" step="any" className="input input-sm w-full" value={node.yMax ?? ""} onChange={(event) => set({ yMax: event.target.value === "" ? undefined : event.target.valueAsNumber })} /></Field>
          <Field label="X axis label"><Text value={node.xLabel ?? ""} onChange={(xLabel) => set({ xLabel: xLabel || undefined })} /></Field>
          <Field label="Y axis label"><Text value={node.yLabel ?? ""} onChange={(yLabel) => set({ yLabel: yLabel || undefined })} /></Field>
        </div>
        <span className="text-xs leading-5 text-base-content/50">Use <code>x</code> for the horizontal axis and any lesson variable for the rest. Fixing the y range keeps the axes still while variables change.</span>
      </>;
    case "diagram":
      return <>
        <Field label="SVG file"><AssetPicker kind="image" value={node.src} assets={assets} onChange={(src) => set({ src })} onUpload={onUpload} /></Field>
        <Field label="Title"><Text value={node.title ?? ""} onChange={(title) => set({ title: title || undefined })} placeholder="Optional" /></Field>
        <Field label="Caption"><Text value={node.caption ?? ""} onChange={(caption) => set({ caption: caption || undefined })} placeholder="Optional" /></Field>
        <BindingRows node={node} set={set} assets={assets} />
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

export function BlockInspector({ node, issues, onChange, onRemove, assets, onUpload, document }: {
  node: CurieNode; issues: Issue[]; onChange: Change; onRemove: () => void; assets: AssetMap; onUpload: (files: File[]) => Promise<string[]>; document: CurieDocument;
}) {
  const variables = [...lessonVariables(document).values()];
  const names = variables.map((variable) => variable.name);
  const settable = variables.filter((variable) => variable.kind !== "formula").map((variable) => variable.name);
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
    <div className="flex flex-col gap-4"><BlockFields node={node} onChange={onChange} assets={assets} onUpload={onUpload} settable={settable} /></div>
    <div className="flex flex-col gap-1.5 border-t border-base-300 pt-3">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-base-content/70"><EyeOff size={13} /> Show only when</span>
      <Expr value={node.showIf ?? ""} onChange={(showIf) => onChange({ ...node, showIf: showIf.trim() ? showIf : undefined })} placeholder="Always shown, e.g. showDetails or speed > 10" />
      {names.length > 0 && <span className="text-xs text-base-content/50">Variables: <span className="font-mono">{names.join(", ")}</span></span>}
    </div>
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

function CoverPicker({ value, assets, onChange, onUpload }: { value?: string; assets: AssetMap; onChange: (cover?: string) => void; onUpload: (files: File[]) => Promise<string[]> }) {
  const input = useRef<HTMLInputElement>(null);
  const url = useObjectUrl(value ? assets[value] : undefined);
  const images = Object.keys(assets).filter((path) => assetKind(path) === "image");
  return <div className="flex flex-col gap-2">
    <button type="button" onClick={() => input.current?.click()} aria-label={value ? "Change cover image" : "Upload a cover image"}
      className="group relative grid aspect-[16/10] w-full place-items-center overflow-hidden rounded-xl border-2 border-dashed border-base-300 bg-base-200/50 text-base-content/50 transition-colors hover:border-primary/50 hover:text-primary">
      {url
        ? <><img src={url} alt="" className="absolute inset-0 size-full object-cover" /><span className="absolute inset-0 grid place-items-center bg-black/40 text-sm font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">Change cover</span></>
        : value ? <span className="flex flex-col items-center gap-1 text-xs text-warning"><ImageOff size={22} /> Missing file</span>
          : <span className="flex flex-col items-center gap-1 text-xs"><Upload size={22} /> Upload a cover image</span>}
    </button>
    <div className="flex gap-2">
      <select className="select select-sm min-w-0 flex-1" value={value ?? ""} onChange={(event) => onChange(event.target.value || undefined)} aria-label="Cover image">
        <option value="">{images.length ? "Generated cover" : "No images in this lesson yet"}</option>
        {images.map((path) => <option key={path} value={path}>{path.replace(/^assets\//, "")}</option>)}
      </select>
      {value && <button type="button" className="btn btn-sm btn-ghost btn-square" aria-label="Remove cover" title="Use the generated cover" onClick={() => onChange(undefined)}><X size={14} /></button>}
    </div>
    <input ref={input} type="file" accept="image/*" className="hidden" onChange={async (event) => {
      const files = [...(event.target.files ?? [])];
      event.target.value = "";
      const [path] = await onUpload(files);
      if (path) onChange(path);
    }} />
  </div>;
}

function VariablesEditor({ document, onChange }: { document: CurieDocument; onChange: (variables: CurieVariable[]) => void }) {
  const inputs = [...lessonVariables(document).values()].filter((variable) => variable.kind === "input");
  const list = document.variables ?? [];
  return <div className="flex flex-col gap-2 border-t border-base-300 pt-4">
    <div><p className="flex items-center gap-1.5 font-display font-bold"><Variable size={16} /> Variables</p>
      <p className="text-xs leading-5 text-base-content/55">Use them in text as <code>{"{{ name }}"}</code>, in math, plots, diagrams and “show only when”.</p></div>
    {inputs.length > 0 && <div className="flex flex-wrap gap-1">{inputs.map((variable) =>
      <span key={variable.name} className="badge badge-sm border-base-300 bg-base-200 font-mono" title="Set by an input block">{variable.name} = {String(variable.initial)}</span>)}</div>}
    <Rows label="Lesson values and formulas" items={list} onChange={(variables) => onChange(variables)} create={() => ({ name: `v${list.length + 1}`, expression: "" })}
      render={(variable, update) => <>
        <div className="grid grid-cols-[1fr_auto] gap-1.5">
          <VariableField value={variable.name} onChange={(name) => update({ ...variable, name })} />
          <div className="join">
            {(["value", "formula"] as const).map((kind) => <button key={kind} type="button" className={`btn btn-xs join-item ${(variable.expression !== undefined) === (kind === "formula") ? "btn-active" : "btn-ghost"}`}
              onClick={() => update(kind === "formula" ? { name: variable.name, expression: variable.expression ?? "" } : { name: variable.name, initial: variable.initial ?? 0 })}>{kind === "value" ? "Value" : "Formula"}</button>)}
          </div>
        </div>
        {variable.expression !== undefined
          ? <Expr value={variable.expression} onChange={(expression) => update({ ...variable, expression })} placeholder="mass * gravity" />
          : <input className="input input-sm w-full font-mono text-xs" value={String(variable.initial ?? "")} placeholder="Starting value" onChange={(event) => update({ ...variable, initial: parseScalar(event.target.value) })} aria-label="Starting value" />}
      </>} />
    <span className="text-xs leading-5 text-base-content/50">A <b>value</b> starts as written and can be changed by buttons. A <b>formula</b> is always recomputed from other variables. {EXPR_HINT}</span>
  </div>;
}

export function LessonInspector({ manifest, document, assets, onChange, onUpload, onVariablesChange }: {
  manifest: CurieManifest; document: CurieDocument; assets: AssetMap; onChange: (manifest: CurieManifest) => void; onUpload: (files: File[]) => Promise<string[]>;
  onVariablesChange: (variables: CurieVariable[]) => void;
}) {
  const blocks = flattenBlocks(document.blocks);
  return <div className="flex flex-col gap-4">
    <div><p className="font-display text-lg font-bold">Lesson details</p><p className="text-xs text-base-content/55">Select a block on the canvas to edit it.</p></div>
    <Field label="Cover image" hint="Shown on library cards and at the top of the lesson. Wide images (16:9) work best.">
      <CoverPicker value={manifest.cover} assets={assets} onUpload={onUpload} onChange={(cover) => onChange({ ...manifest, cover })} />
    </Field>
    <Field label="Title"><Text value={manifest.title} onChange={(title) => onChange({ ...manifest, title })} /></Field>
    <Field label="Description"><Area value={manifest.description ?? ""} onChange={(description) => onChange({ ...manifest, description: description || undefined })} rows={3} /></Field>
    <Field label="Author"><Text value={manifest.author ?? ""} onChange={(author) => onChange({ ...manifest, author: author || undefined })} /></Field>
    <Field label="Lesson id" hint="A stable identifier that travels with the exported file, e.g. org.school.physics.density."><Text value={manifest.id} onChange={(id) => onChange({ ...manifest, id })} mono /></Field>
    <div className="grid grid-cols-3 gap-2 text-center">
      {[["Blocks", blocks.length], ["Minutes", readingMinutes(document)], ["Files", Object.keys(assets).length]].map(([label, value]) =>
        <div key={label} className="rounded-xl bg-base-200/70 p-2"><p className="font-display text-lg font-bold">{value}</p><p className="text-[0.7rem] text-base-content/55">{label}</p></div>)}
    </div>
    <VariablesEditor document={document} onChange={onVariablesChange} />
  </div>;
}
