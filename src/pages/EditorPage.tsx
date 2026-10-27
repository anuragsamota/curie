import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Check, CloudOff, Copy, Eye, FolderOpen, ListTree, LoaderCircle,
  PanelLeft, PanelRight, PenLine, Plus, Redo2, SlidersHorizontal, Trash2, Undo2, X,
} from "lucide-react";
import BlockRenderer from "../components/BlockRenderer";
import { LessonVariables } from "../components/variables";
import { MAX_ASSET_BYTES, detectFeatures, findLessonIssues, type AssetMap, type Issue } from "../curie/package";
import type { CurieDocument, CurieManifest, CurieNode } from "../curie/types";
import { AssetsPanel } from "../editor/AssetsPanel";
import { BLOCKS, acceptsAsset, assetKind } from "../editor/blocks";
import { BlockInspector, LessonInspector } from "../editor/Inspector";
import { AddBlockMenu, Outline } from "../editor/Outline";
import {
  assetUsage, duplicateBlock, findBlock, insertBlock, locate, moveBlock, nudgeBlock, removeBlock, updateBlock, type Location,
} from "../editor/tree";
import { droppedFiles, useFileDrop } from "../lib/drop";
import { useLessonContent, useLibrary } from "../lib/library";
import { formatBytes } from "../lib/lesson";
import { navigate, paths } from "../lib/router";
import { useSettings } from "../lib/settings";
import { useSound } from "../lib/sound";
import { native, type LessonContent, type LessonSummary } from "../lib/storage";
import { isMod, useShortcut } from "../ui/AppActions";
import { useConfirm } from "../ui/Confirm";
import { useLessonMenu } from "../ui/LessonActions";
import { CoverBanner } from "../ui/LessonCover";
import { LogoMark } from "../ui/Logo";
import { Menu } from "../ui/Menu";
import { useToast } from "../ui/Toasts";
import NotFoundPage from "./NotFoundPage";

type Draft = { manifest: CurieManifest; document: CurieDocument; assets: AssetMap };
type History = { past: Draft[]; present: Draft; future: Draft[]; coalesceKey?: string; coalesceAt: number };

const HISTORY_LIMIT = 100;
const COALESCE_MS = 1000;

/** Undo/redo for the draft. Rapid edits with the same key (e.g. typing in one field) form one step. */
function useHistory(initial: Draft) {
  const [history, setHistory] = useState<History>({ past: [], present: initial, future: [], coalesceAt: 0 });
  const set = useCallback((change: (draft: Draft) => Draft, coalesceKey?: string) => {
    setHistory((current) => {
      const next = change(current.present);
      if (next === current.present) return current;
      const now = Date.now();
      const merge = coalesceKey !== undefined && coalesceKey === current.coalesceKey && now - current.coalesceAt < COALESCE_MS;
      return {
        past: merge ? current.past : [...current.past, current.present].slice(-HISTORY_LIMIT),
        present: next, future: [], coalesceKey, coalesceAt: now,
      };
    });
  }, []);
  const undo = useCallback(() => setHistory((current) => current.past.length ? {
    past: current.past.slice(0, -1), present: current.past[current.past.length - 1], future: [current.present, ...current.future], coalesceAt: 0,
  } : current), []);
  const redo = useCallback(() => setHistory((current) => current.future.length ? {
    past: [...current.past, current.present], present: current.future[0], future: current.future.slice(1), coalesceAt: 0,
  } : current), []);
  return { draft: history.present, set, undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0 };
}

function useIsDesktop() {
  const query = "(min-width: 1024px)";
  const [desktop, setDesktop] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setDesktop(list.matches);
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, []);
  return desktop;
}

function uniqueAssetPath(name: string, existing: AssetMap): string {
  const clean = name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[-.]+|-+$/g, "") || "file";
  const dot = clean.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [clean.slice(0, dot), clean.slice(dot)] : [clean, ""];
  let path = `assets/${clean}`;
  for (let i = 2; path in existing; i++) path = `assets/${base}-${i}${ext}`;
  return path;
}

function Drawer({ side, title, onClose, children }: { side: "left" | "right"; title: string; onClose: () => void; children: ReactNode }) {
  return createPortal(<div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={title}>
    <div className="animate-fade absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
    <div className={`absolute inset-y-0 flex w-[22rem] max-w-[88vw] flex-col bg-base-100 shadow-2xl ${side === "left" ? "left-0" : "right-0"}`}
      style={{ animation: `${side === "left" ? "drawer-left" : "toast-in"} 0.35s var(--ease-out-expo) both` }}>
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-base-300 px-4">
        <p className="font-display font-semibold">{title}</p>
        <button className="btn btn-ghost btn-sm btn-square" aria-label={`Close ${title}`} onClick={onClose}><X size={18} /></button>
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin p-4">{children}</div>
    </div>
  </div>, document.body);
}

function SaveStatus({ state }: { state: "saved" | "saving" | "dirty" | "error" }) {
  const content = {
    saved: [<Check key="i" size={12} />, "Saved"],
    saving: [<LoaderCircle key="i" size={12} className="animate-spin" />, "Saving…"],
    dirty: [<span key="i" className="size-1.5 rounded-full bg-warning" />, "Unsaved changes"],
    error: [<CloudOff key="i" size={12} />, "Not saved"],
  }[state];
  return <span className={`flex items-center gap-1 text-xs ${state === "error" ? "text-error" : "text-base-content/50"}`} aria-live="polite">{content}</span>;
}

export default function EditorPage({ lessonKey }: { lessonKey: string }) {
  const library = useLibrary();
  const record = library.get(lessonKey);
  const { content, error } = useLessonContent(lessonKey);
  if (!library.ready) return <div className="grid h-screen place-items-center"><LogoMark size={44} animated /></div>;
  if (!record) return <NotFoundPage title="Lesson not found" message="It may have been deleted from this device." />;
  if (error) return <NotFoundPage title="Couldn't open this lesson" message={error} />;
  if (!content) return <div className="grid h-screen place-items-center"><LogoMark size={44} animated /></div>;
  // Keyed by lesson only: autosaves update `content` but must not reset the editor's own draft.
  return <Editor key={record.key} record={record} initial={content} />;
}

/** Native saves rewrite the whole .curie file, so wait for a longer pause in typing. */
const AUTOSAVE_DELAY = native ? 1500 : 700;

const withFeatures = (draft: LessonContent): LessonContent => ({ ...draft, manifest: { ...draft.manifest, requiredFeatures: detectFeatures(draft.document) } });

function Editor({ record, initial }: { record: LessonSummary; initial: LessonContent }) {
  const library = useLibrary();
  const { settings, update } = useSettings();
  const toast = useToast();
  const confirm = useConfirm();
  const play = useSound();
  const lessonMenu = useLessonMenu();
  const desktop = useIsDesktop();
  const { draft, set, undo, redo, canUndo, canRedo } = useHistory(initial);
  const [selected, setSelected] = useState<string>();
  const [preview, setPreview] = useState(false);
  const [leftTab, setLeftTab] = useState<"outline" | "assets">("outline");
  const [drawer, setDrawer] = useState<"left" | "right">();
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty" | "error">("saved");
  const [dropping, setDropping] = useState(false);

  const blocks = draft.document.blocks;
  const selectedNode = selected ? findBlock(blocks, selected) : undefined;
  const issues = useMemo(() => findLessonIssues(draft.manifest, draft.document, draft.assets), [draft]);
  const issueIds = useMemo(() => new Set(issues.flatMap((issue) => issue.blockId ? [issue.blockId] : [])), [issues]);
  const usage = useMemo(() => assetUsage(blocks), [blocks]);

  // ── Autosave ────────────────────────────────────────────────────────────
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const savedRef = useRef(draft);
  const libraryRef = useRef(library);
  libraryRef.current = library;

  const save = useCallback(async () => {
    const current = draftRef.current;
    if (current === savedRef.current) return;
    setSaveState("saving");
    try {
      await libraryRef.current.save(record.key, withFeatures(current));
      savedRef.current = current;
      setSaveState(draftRef.current === current ? "saved" : "dirty");
    } catch {
      setSaveState("error");
    }
  }, [record]);

  useEffect(() => {
    if (draft === savedRef.current) return;
    setSaveState("dirty");
    const timer = setTimeout(() => void save(), AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  }, [draft, save]);

  useEffect(() => () => { void save(); }, [save]);

  // ── Editing actions ─────────────────────────────────────────────────────
  const setDocument = useCallback((change: (blocks: CurieNode[]) => CurieNode[], coalesceKey?: string) =>
    set((current) => ({ ...current, document: { ...current.document, blocks: change(current.document.blocks) } }), coalesceKey), [set]);

  const select = useCallback((id?: string) => {
    setSelected(id);
    if (id) requestAnimationFrame(() => document.getElementById(`frame-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }, []);

  const addBlock = (type: CurieNode["type"], at?: Location) => {
    const block = BLOCKS[type].create();
    const from = selected ? locate(blocks, selected) : undefined;
    const target = at ?? (from ? { parentId: from.parentId, index: from.index + 1 } : { parentId: null, index: blocks.length });
    setDocument((nodes) => insertBlock(nodes, target, block));
    play("pop");
    select(block.id);
    if (!desktop) setDrawer(undefined);
  };

  const changeBlock = (id: string, node: CurieNode) => {
    setDocument((nodes) => updateBlock(nodes, id, () => node), `block:${id}`);
    if (node.id !== id) setSelected(node.id);
  };

  const deleteBlock = (id: string) => {
    const node = findBlock(blocks, id);
    const at = locate(blocks, id);
    if (!node || !at) return;
    const siblings = at.parentId ? (findBlock(blocks, at.parentId) as Extract<CurieNode, { type: "section" }>).children : blocks;
    setDocument((nodes) => removeBlock(nodes, id));
    play("delete");
    setSelected(siblings[at.index + 1]?.id ?? siblings[at.index - 1]?.id ?? at.parentId ?? undefined);
    toast.info(`${BLOCKS[node.type].label} block deleted.`, {
      action: { label: "Undo", onClick: () => { setDocument((nodes) => findBlock(nodes, id) ? nodes : insertBlock(nodes, at, node)); setSelected(id); } },
    });
  };

  const duplicate = (id: string) => {
    let copyId: string | undefined;
    setDocument((nodes) => { const result = duplicateBlock(nodes, id); copyId = result.copy?.id; return result.blocks; });
    play("pop");
    setTimeout(() => copyId && select(copyId), 0);
  };

  const nudge = (id: string, delta: -1 | 1) => { setDocument((nodes) => nudgeBlock(nodes, id, delta)); play("tap"); select(id); };
  const move = (id: string, to: Location) => { setDocument((nodes) => moveBlock(nodes, id, to)); play("tap"); };
  const setManifest = (manifest: CurieManifest) => set((current) => ({ ...current, manifest }), "manifest");

  const upload = useCallback(async (files: File[]): Promise<string[]> => {
    const accepted: [string, File][] = [];
    const existing = { ...draftRef.current.assets };
    for (const file of files) {
      if (assetKind(file.name) === "other") { toast.error(`${file.name} isn't a supported image, video, or Lottie JSON file.`); continue; }
      if (file.size > MAX_ASSET_BYTES) { toast.error(`${file.name} is larger than ${formatBytes(MAX_ASSET_BYTES)}.`); continue; }
      const path = uniqueAssetPath(file.name, existing);
      existing[path] = file;
      accepted.push([path, file]);
    }
    if (!accepted.length) return [];
    set((current) => ({ ...current, assets: { ...current.assets, ...Object.fromEntries(accepted) } }));
    toast.success(accepted.length === 1 ? `Added ${accepted[0][0].replace(/^assets\//, "")}.` : `Added ${accepted.length} files.`);
    return accepted.map(([path]) => path);
  }, [set, toast]);

  const removeAsset = async (path: string) => {
    const count = (usage.get(path) ?? 0) + (draftRef.current.manifest.cover === path ? 1 : 0);
    if (count && !(await confirm({ title: "Delete this file?", message: `${count} ${count === 1 ? "block uses" : "blocks use"} ${path}. Those blocks will show a missing-file warning.`, confirmLabel: "Delete file", danger: true }))) return;
    set((current) => {
      const assets = { ...current.assets };
      delete assets[path];
      return { ...current, assets };
    });
    play("delete");
  };

  const exportNow = async () => {
    if (issues.length) {
      toast.error(`Fix ${issues.length} ${issues.length === 1 ? "problem" : "problems"} before exporting.`, { title: "Can't export yet", action: issues[0].blockId ? { label: "Show first", onClick: () => select(issues[0].blockId) } : undefined });
      return;
    }
    await save();
    await library.exportLesson(record.key, withFeatures(draftRef.current));
  };

  const togglePanel = (side: "left" | "right") => {
    play("toggle");
    if (!desktop) return setDrawer(drawer === side ? undefined : side);
    if (side === "left") update({ editorOutlineOpen: !settings.editorOutlineOpen });
    else update({ editorInspectorOpen: !settings.editorInspectorOpen });
  };

  // ── Keyboard and file drop ──────────────────────────────────────────────
  useShortcut((event) => isMod(event) && event.key.toLowerCase() === "s", (event) => { event.preventDefault(); void save().then(() => toast.success("All changes saved.")); }, true);
  useShortcut((event) => isMod(event) && event.key.toLowerCase() === "p", (event) => { event.preventDefault(); setPreview((value) => !value); play("toggle"); }, true);
  useShortcut((event) => isMod(event) && event.key.toLowerCase() === "z" && !event.shiftKey, (event) => { event.preventDefault(); undo(); });
  useShortcut((event) => isMod(event) && (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey)), (event) => { event.preventDefault(); redo(); });
  useShortcut((event) => (event.key === "Delete" || event.key === "Backspace") && !!selected && !preview, (event) => { event.preventDefault(); if (selected) deleteBlock(selected); });
  useShortcut((event) => event.key === "Escape", () => { setSelected(undefined); setDrawer(undefined); });
  useShortcut((event) => event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown") && !!selected, (event) => { event.preventDefault(); if (selected) nudge(selected, event.key === "ArrowUp" ? -1 : 1); });

  useFileDrop(true, (dropped) => {
    void droppedFiles(dropped).then(upload).then((paths) => { if (paths.length) setLeftTab("assets"); })
      .catch(() => toast.error("The dropped files could not be read."));
  }, setDropping);

  // ── Rendering ───────────────────────────────────────────────────────────
  const noopError = useCallback(() => undefined, []);
  const blockIssues = (id: string): Issue[] => issues.filter((issue) => issue.blockId === id);

  const frame = (node: CurieNode, content: ReactNode) => {
    const isSelected = node.id === selected;
    const hasIssue = issueIds.has(node.id);
    const def = BLOCKS[node.type];
    return <div id={`frame-${node.id}`} key={node.id}
      onClick={(event) => { event.stopPropagation(); if (!isSelected) { setSelected(node.id); play("tap"); } }}
      className={`group/frame relative -mx-3 scroll-my-24 rounded-2xl px-3 py-2 transition-shadow ${isSelected ? "ring-2 ring-primary" : hasIssue ? "ring-1 ring-warning/60" : "hover:ring-1 hover:ring-base-content/15"}`}>
      <span className={`absolute -top-3 left-3 z-10 flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider transition-opacity ${isSelected ? "bg-primary text-primary-content opacity-100" : "bg-base-300 text-base-content/70 opacity-0 group-hover/frame:opacity-100"}`}>
        <def.icon size={11} /> {def.label}{hasIssue && <AlertTriangle size={11} className={isSelected ? "" : "text-warning"} />}
      </span>
      {isSelected && <div className="animate-menu absolute -top-4 right-3 z-20 flex items-center gap-0.5 rounded-xl border border-base-300 bg-base-100 p-0.5 shadow-md" onClick={(event) => event.stopPropagation()}>
        <button className="btn btn-ghost btn-xs btn-square" aria-label="Move up" title="Move up (Alt+↑)" onClick={() => nudge(node.id, -1)}><ArrowUp size={14} /></button>
        <button className="btn btn-ghost btn-xs btn-square" aria-label="Move down" title="Move down (Alt+↓)" onClick={() => nudge(node.id, 1)}><ArrowDown size={14} /></button>
        <button className="btn btn-ghost btn-xs btn-square" aria-label="Duplicate" title="Duplicate" onClick={() => duplicate(node.id)}><Copy size={13} /></button>
        <button className="btn btn-ghost btn-xs btn-square lg:hidden" aria-label="Edit block" onClick={() => setDrawer("right")}><SlidersHorizontal size={13} /></button>
        <button className="btn btn-ghost btn-xs btn-square text-error" aria-label="Delete" title="Delete (Del)" onClick={() => deleteBlock(node.id)}><Trash2 size={13} /></button>
      </div>}
      {content}
    </div>;
  };

  const insertLine = (index: number) => <AddBlockMenu key={`insert-${index}`} align="center" onAdd={(type) => addBlock(type, { parentId: null, index })} trigger={(toggle) =>
    <div className="group/insert relative -my-3 flex h-6 items-center justify-center">
      <span className="absolute inset-x-0 h-px bg-primary/40 opacity-0 transition-opacity group-hover/insert:opacity-100" />
      <button type="button" aria-label="Insert block here" onClick={toggle}
        className="relative grid size-6 place-items-center rounded-full border border-base-300 bg-base-100 text-base-content/50 opacity-0 shadow-sm transition-all hover:scale-110 hover:border-primary hover:text-primary focus:opacity-100 group-hover/insert:opacity-100"><Plus size={13} /></button>
    </div>} />;

  const outlinePanel = <div className="flex flex-col gap-3">
    <div role="tablist" className="grid grid-cols-2 rounded-xl bg-base-200 p-1">
      {([["outline", "Outline", ListTree], ["assets", `Files (${Object.keys(draft.assets).length})`, FolderOpen]] as const).map(([tab, label, Icon]) =>
        <button key={tab} role="tab" aria-selected={leftTab === tab} onClick={() => setLeftTab(tab)}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all ${leftTab === tab ? "bg-base-100 shadow-sm" : "text-base-content/60"}`}><Icon size={14} /> {label}</button>)}
    </div>
    {leftTab === "outline" ? <>
      <button type="button" onClick={() => { setSelected(undefined); if (!desktop) setDrawer("right"); }}
        className={`flex items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm font-semibold ${!selected ? "bg-primary/12 text-primary" : "hover:bg-base-200"}`}>
        <PenLine size={15} /> <span className="truncate">{draft.manifest.title || "Untitled lesson"}</span>
      </button>
      <Outline nodes={blocks} selected={selected} issueIds={issueIds} onSelect={(id) => { select(id); if (!desktop) setDrawer(undefined); }} onMove={move} onAdd={addBlock} />
      <AddBlockMenu onAdd={(type) => addBlock(type, { parentId: null, index: blocks.length })} trigger={(toggle) =>
        <button type="button" className="btn btn-sm btn-ghost w-full justify-start border-dashed border-base-300" onClick={toggle}><Plus size={15} /> Add block</button>} />
    </> : <AssetsPanel assets={draft.assets} usage={usage} onUpload={upload} onRemove={(path) => void removeAsset(path)}
      useLabel={(path) => selectedNode && acceptsAsset(selectedNode.type) === assetKind(path) && "src" in selectedNode && selectedNode.src !== path ? "Use" : undefined}
      onUse={(path) => selectedNode && changeBlock(selectedNode.id, { ...selectedNode, src: path } as CurieNode)} />}
  </div>;

  const inspectorPanel = selectedNode
    ? <BlockInspector key={selectedNode.id} node={selectedNode} issues={blockIssues(selectedNode.id)} onChange={(node) => changeBlock(selectedNode.id, node)} onRemove={() => deleteBlock(selectedNode.id)} assets={draft.assets} onUpload={upload} document={draft.document} />
    : <LessonInspector manifest={draft.manifest} document={draft.document} assets={draft.assets} onChange={setManifest} onUpload={upload}
      onVariablesChange={(variables) => set((current) => ({ ...current, document: { ...current.document, variables: variables.length ? variables : undefined } }), "variables")} />;

  const latestRecord = library.get(record.key) ?? record;
  const menuItems = lessonMenu(latestRecord, "editor").map((item) => item !== "divider" && item.label === "Export .curie" ? { ...item, onSelect: () => void exportNow() } : item);
  const showLeft = !preview && desktop && settings.editorOutlineOpen;
  const showRight = !preview && desktop && settings.editorInspectorOpen;

  return <div className="flex h-dvh flex-col bg-base-100 text-base-content">
    <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-base-300 px-2 sm:gap-2 sm:px-3">
      <button className="btn btn-ghost btn-sm btn-square" aria-label="Back to library" title="Back to library" onClick={() => { void save(); navigate(paths.library); }}><ArrowLeft size={18} /></button>
      {!preview && <button className={`btn btn-sm btn-square ${(desktop ? settings.editorOutlineOpen : drawer === "left") ? "btn-active" : "btn-ghost"}`} aria-label="Toggle outline panel" title="Outline and files" onClick={() => togglePanel("left")}><PanelLeft size={17} /></button>}
      <div className="min-w-0 flex-1 px-1">
        <p className="font-display truncate text-sm font-bold sm:text-base">{draft.manifest.title || "Untitled lesson"}</p>
        <SaveStatus state={saveState} />
      </div>

      <div role="radiogroup" aria-label="Mode" className="hidden rounded-xl bg-base-200 p-0.5 sm:flex">
        {([[false, "Edit", PenLine], [true, "Preview", Eye]] as const).map(([value, label, Icon]) =>
          <button key={label} role="radio" aria-checked={preview === value} title={`${label} (Ctrl+P)`} onClick={() => { setPreview(value); play("toggle"); }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-sm font-medium transition-all ${preview === value ? "bg-base-100 shadow-sm" : "text-base-content/60 hover:text-base-content"}`}><Icon size={14} /> {label}</button>)}
      </div>
      <button className={`btn btn-sm btn-square sm:hidden ${preview ? "btn-active" : "btn-ghost"}`} aria-label="Toggle preview" onClick={() => setPreview(!preview)}><Eye size={17} /></button>

      <div className="hidden items-center sm:flex">
        <button className="btn btn-ghost btn-sm btn-square" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}><Undo2 size={17} /></button>
        <button className="btn btn-ghost btn-sm btn-square" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}><Redo2 size={17} /></button>
      </div>
      {issues.length > 0 && <Menu label={`${issues.length} problems`} trigger={<span className="btn btn-sm btn-ghost gap-1 text-warning"><AlertTriangle size={16} /><span className="tabular-nums">{issues.length}</span></span>}
        items={issues.slice(0, 12).map((issue, index) => ({ label: issue.message, icon: AlertTriangle, onSelect: () => { setPreview(false); if (issue.blockId) select(issue.blockId); else setSelected(undefined); }, hint: String(index + 1) }))} className="[&_[role=menu]]:w-80" />}
      {!preview && <button className={`btn btn-sm btn-square ${(desktop ? settings.editorInspectorOpen : drawer === "right") ? "btn-active" : "btn-ghost"}`} aria-label="Toggle inspector panel" title="Inspector" onClick={() => togglePanel("right")}><PanelRight size={17} /></button>}
      <Menu items={[
        { label: "Undo", icon: Undo2, onSelect: undo, disabled: !canUndo, hint: "Ctrl Z" },
        { label: "Redo", icon: Redo2, onSelect: redo, disabled: !canRedo, hint: "Ctrl ⇧ Z" },
        "divider", ...menuItems,
      ]} label="Lesson actions" />
    </header>

    <div className="flex min-h-0 flex-1">
      {showLeft && <aside className="animate-fade w-72 shrink-0 overflow-y-auto scroll-thin border-r border-base-300 p-3" aria-label="Outline and files">{outlinePanel}</aside>}

      <main className="min-w-0 flex-1 overflow-y-auto scroll-thin bg-base-200/60" onClick={() => !preview && setSelected(undefined)}>
        <div className={`mx-auto max-w-3xl px-4 sm:px-6 ${preview ? "py-8 sm:py-12" : "py-6 sm:py-10"}`}>
          <LessonVariables document={draft.document}>
          <div className={`rounded-[2rem] border border-base-300 bg-base-100 px-5 py-8 shadow-sm transition-all sm:px-10 sm:py-12 ${preview ? "" : "pb-10"}`}>
            <header className={`mb-10 rounded-2xl ${preview ? "" : `-m-3 cursor-pointer p-3 transition-shadow ${!selected ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-base-content/15"}`}`}
              onClick={(event) => { if (preview) return; event.stopPropagation(); setSelected(undefined); if (!desktop) setDrawer("right"); }}>
              <CoverBanner image={draft.manifest.cover ? draft.assets[draft.manifest.cover] : undefined} className="mb-8" />
              <h1 className="font-display text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl">{draft.manifest.title || <span className="text-base-content/30">Untitled lesson</span>}</h1>
              {draft.manifest.description && <p className="mt-4 text-lg leading-8 text-base-content/65">{draft.manifest.description}</p>}
              {draft.manifest.author && <p className="mt-4 text-sm font-medium text-base-content/60">By {draft.manifest.author}</p>}
            </header>

            {blocks.length === 0 && !preview
              ? <div className="flex flex-col items-center rounded-3xl border-2 border-dashed border-base-300 px-6 py-14 text-center">
                <p className="font-display text-lg font-bold">Start building your lesson</p>
                <p className="mt-1 text-sm text-base-content/60">Add text, media, and interactive blocks.</p>
                <AddBlockMenu align="center" onAdd={(type) => addBlock(type)} trigger={(toggle) => <button className="btn btn-primary mt-5 press" onClick={toggle}><Plus size={18} /> Add your first block</button>} />
              </div>
              : <div className={preview ? "space-y-7" : "flex flex-col gap-7"}>
                {blocks.map((node, index) => preview
                  ? <BlockRenderer key={node.id} node={node} assets={draft.assets} onError={noopError} />
                  : [index === 0 ? null : insertLine(index), <BlockRenderer key={node.id} node={node} assets={draft.assets} onError={noopError} frame={frame} />])}
              </div>}

            {!preview && blocks.length > 0 && <div className="mt-8 flex justify-center">
              <AddBlockMenu align="center" up onAdd={(type) => addBlock(type, { parentId: null, index: blocks.length })} trigger={(toggle) =>
                <button className="btn btn-ghost border-dashed border-base-300 press" onClick={toggle}><Plus size={16} /> Add block</button>} />
            </div>}
          </div>
          </LessonVariables>
          {preview && <p className="mt-4 text-center text-xs text-base-content/45">Preview: this is what learners see. Press Ctrl+P to go back to editing.</p>}
        </div>
      </main>

      {showRight && <aside className="animate-fade w-80 shrink-0 overflow-y-auto scroll-thin border-l border-base-300 p-4" aria-label="Inspector">{inspectorPanel}</aside>}
    </div>

    {!desktop && !preview && drawer === "left" && <Drawer side="left" title="Outline" onClose={() => setDrawer(undefined)}>{outlinePanel}</Drawer>}
    {!desktop && !preview && drawer === "right" && <Drawer side="right" title={selectedNode ? BLOCKS[selectedNode.type].label : "Lesson details"} onClose={() => setDrawer(undefined)}>{inspectorPanel}</Drawer>}
    {!desktop && !preview && <div className="fixed bottom-5 right-5 z-30">
      <AddBlockMenu align="end" up onAdd={(type) => addBlock(type)} trigger={(toggle) =>
        <button className="btn btn-primary btn-circle btn-lg shadow-xl shadow-primary/30 press" aria-label="Add block" onClick={toggle}><Plus size={24} /></button>} />
    </div>}

    {dropping && <div className="animate-fade pointer-events-none fixed inset-0 z-[90] grid place-items-center bg-base-100/70 backdrop-blur-sm">
      <div className="animate-pop rounded-[2rem] border-2 border-dashed border-primary bg-base-100 px-10 py-8 text-center shadow-2xl">
        <FolderOpen className="mx-auto mb-3 text-primary" size={40} />
        <p className="font-display text-xl font-bold">Drop to add files</p>
        <p className="text-sm text-base-content/60">Images, videos and Lottie JSON are added to this lesson</p>
      </div>
    </div>}
  </div>;
}
