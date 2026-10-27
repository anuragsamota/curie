import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronRight, GripVertical, Plus } from "lucide-react";
import type { CurieNode } from "../curie/types";
import { useSound } from "../lib/sound";
import { BLOCKS, BLOCK_GROUPS, blockSummary } from "./blocks";
import type { Location } from "./tree";

/** A popover grid of block types. */
export function AddBlockMenu({ onAdd, trigger, align = "start", up = false }: { onAdd: (type: CurieNode["type"]) => void; trigger: (open: () => void) => ReactNode; align?: "start" | "end" | "center"; up?: boolean }) {
  const [open, setOpen] = useState(false);
  const [placeUp, setPlaceUp] = useState(up);
  const root = useRef<HTMLDivElement>(null);
  const play = useSound();
  const toggle = () => {
    // Open upwards when there isn't room for the ~470px menu below the trigger.
    const rect = root.current?.getBoundingClientRect();
    setPlaceUp(up || (!!rect && rect.bottom + 480 > window.innerHeight && rect.top > 480));
    setOpen(!open);
    play("tap");
  };
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>("[data-block-option]")?.focus({ preventScroll: true });
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const position = align === "end" ? "right-0" : align === "center" ? "left-1/2 -translate-x-1/2" : "left-0";
  return <div ref={root} className="relative" onKeyDown={(event) => event.key === "Escape" && setOpen(false)} onClick={(event) => event.stopPropagation()}>
    {trigger(toggle)}
    {open && <div role="menu" className={`animate-menu absolute z-50 w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-base-300 bg-base-100 p-2 text-base-content shadow-[0_24px_60px_-20px_rgb(0_0_0/0.45)] ${position} ${placeUp ? "bottom-full mb-2" : "mt-2"}`}>
      {BLOCK_GROUPS.map((group) => <div key={group} className="mb-1 last:mb-0">
        <p className="px-2 pb-1 pt-1.5 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-base-content/45">{group}</p>
        <div className="grid grid-cols-2 gap-1">
          {Object.entries(BLOCKS).filter(([, def]) => def.group === group).map(([type, def]) =>
            <button key={type} data-block-option role="menuitem" type="button" className="flex items-center gap-2.5 rounded-xl p-2 text-left outline-none transition-colors hover:bg-base-200 focus:bg-base-200"
              onClick={() => { setOpen(false); onAdd(type as CurieNode["type"]); }}>
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-base-200 text-primary"><def.icon size={16} /></span>
              <span className="min-w-0"><span className="block text-sm font-medium">{def.label}</span><span className="block truncate text-[0.7rem] text-base-content/50">{def.description}</span></span>
            </button>)}
        </div>
      </div>)}
    </div>}
  </div>;
}

type TreeProps = {
  nodes: CurieNode[];
  parentId: string | null;
  depth: number;
  selected?: string;
  issueIds: Set<string>;
  onSelect: (id: string) => void;
  onMove: (id: string, to: Location) => void;
  onAdd: (type: CurieNode["type"], at: Location) => void;
  drag: DragState;
};

type DragState = { id?: string; setId: (id?: string) => void; target?: Location; setTarget: (target?: Location) => void };

const same = (a?: Location, b?: Location) => !!a && !!b && a.parentId === b.parentId && a.index === b.index;

function Tree({ nodes, parentId, depth, selected, issueIds, onSelect, onMove, onAdd, drag }: TreeProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const drop = (event: React.DragEvent) => {
    event.preventDefault();
    if (drag.id && drag.target) onMove(drag.id, drag.target);
    drag.setId(undefined);
    drag.setTarget(undefined);
  };

  return <ul className="flex flex-col">
    {nodes.map((node, index) => {
      const def = BLOCKS[node.type];
      const isSection = node.type === "section";
      const open = isSection && !collapsed[node.id];
      const lineBefore = same(drag.target, { parentId, index });
      const lineAfter = isSection ? same(drag.target, { parentId: node.id, index: 0 }) && open : same(drag.target, { parentId, index: index + 1 });
      return <li key={node.id} className="relative">
        {lineBefore && <span className="absolute inset-x-2 -top-px z-10 h-0.5 rounded-full bg-primary" />}
        <div
          draggable onDragStart={(event) => { drag.setId(node.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", node.id); }}
          onDragEnd={() => { drag.setId(undefined); drag.setTarget(undefined); }}
          onDragOver={(event) => {
            if (!drag.id || drag.id === node.id) return;
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            const lower = event.clientY > rect.top + rect.height / 2;
            drag.setTarget(lower ? (isSection && open ? { parentId: node.id, index: 0 } : { parentId, index: index + 1 }) : { parentId, index });
          }}
          onDrop={drop}
          onClick={() => onSelect(node.id)}
          className={`group relative flex cursor-pointer items-center gap-1.5 rounded-xl py-1.5 pr-2 text-sm transition-colors ${selected === node.id ? "bg-primary/12 text-primary" : "hover:bg-base-200"} ${drag.id === node.id ? "opacity-40" : ""}`}
          style={{ paddingLeft: `${0.25 + depth * 1}rem` }}
        >
          <GripVertical size={14} className="shrink-0 cursor-grab text-base-content/25 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
          {isSection
            ? <button type="button" className="-ml-1 grid size-5 place-items-center rounded text-base-content/50 hover:bg-base-300" aria-label={open ? "Collapse section" : "Expand section"} aria-expanded={open}
              onClick={(event) => { event.stopPropagation(); setCollapsed({ ...collapsed, [node.id]: open }); }}><ChevronRight size={14} className={`transition-transform ${open ? "rotate-90" : ""}`} /></button>
            : null}
          <def.icon size={15} className={`shrink-0 ${selected === node.id ? "" : "text-base-content/50"}`} aria-hidden="true" />
          <span className={`min-w-0 flex-1 truncate ${isSection ? "font-semibold" : ""}`}>{blockSummary(node)}</span>
          {issueIds.has(node.id) && <span className="size-2 shrink-0 rounded-full bg-warning" title="This block has a problem" />}
        </div>
        {lineAfter && <span className="absolute inset-x-2 -bottom-px z-10 h-0.5 rounded-full bg-primary" />}
        {isSection && open && <div className="ml-3 border-l border-base-300/80">
          {node.children.length
            ? <Tree nodes={node.children} parentId={node.id} depth={depth} selected={selected} issueIds={issueIds} onSelect={onSelect} onMove={onMove} onAdd={onAdd} drag={drag} />
            : <div onDragOver={(event) => { if (drag.id) { event.preventDefault(); drag.setTarget({ parentId: node.id, index: 0 }); } }} onDrop={drop}
              className={`mx-2 my-1 rounded-lg border border-dashed px-2 py-2 text-xs ${same(drag.target, { parentId: node.id, index: 0 }) ? "border-primary bg-primary/5 text-primary" : "border-base-300 text-base-content/45"}`}>
              Empty section. Drop blocks here.
            </div>}
          <AddBlockMenu onAdd={(type) => onAdd(type, { parentId: node.id, index: node.children.length })} trigger={(toggle) =>
            <button type="button" className="ml-2 flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-base-content/45 hover:bg-base-200 hover:text-base-content" onClick={toggle}><Plus size={12} /> Add to section</button>} />
        </div>}
      </li>;
    })}
  </ul>;
}

export function Outline(props: Omit<TreeProps, "drag" | "parentId" | "depth">) {
  const [dragId, setDragId] = useState<string>();
  const [target, setTarget] = useState<Location>();
  const drag: DragState = { id: dragId, setId: setDragId, target, setTarget };
  const endTarget = { parentId: null, index: props.nodes.length };
  return <div onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setTarget(undefined); }}>
    <Tree {...props} parentId={null} depth={0} drag={drag} />
    <div onDragOver={(event) => { if (dragId) { event.preventDefault(); setTarget(endTarget); } }}
      onDrop={(event) => { event.preventDefault(); if (dragId) props.onMove(dragId, endTarget); setDragId(undefined); setTarget(undefined); }}
      className={`mt-1 h-8 rounded-lg transition-colors ${dragId ? "border border-dashed border-base-300" : ""} ${same(target, endTarget) ? "border-primary bg-primary/5" : ""}`} />
  </div>;
}
