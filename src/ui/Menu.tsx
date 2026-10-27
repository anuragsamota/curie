import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSound } from "../lib/sound";

export type MenuItem =
  | { label: string; icon?: LucideIcon; onSelect: () => void; danger?: boolean; disabled?: boolean; hint?: string }
  | "divider";

/** A three-dot (or custom trigger) menu with keyboard support. */
export function Menu({ items, label = "More actions", trigger, align = "end", className = "" }: {
  items: MenuItem[]; label?: string; trigger?: ReactNode; align?: "start" | "end"; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const play = useSound();

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      setOpen(false);
      root.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus({ preventScroll: true });
  };

  return <div ref={root} className={`relative ${className}`} onKeyDown={onKeyDown} onClick={(event) => event.stopPropagation()}>
    <button
      type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={id}
      className={trigger ? "contents" : "btn btn-ghost btn-sm btn-square press"}
      onClick={() => { setOpen(!open); play("tap"); }}
    >
      {trigger ?? <MoreHorizontal size={18} />}
    </button>
    {open && <div ref={list} id={id} role="menu" className={`animate-menu absolute z-50 mt-1.5 min-w-52 rounded-2xl border border-base-300 bg-base-100 p-1.5 text-base-content shadow-[0_20px_50px_-20px_rgb(0_0_0/0.4)] ${align === "end" ? "right-0" : "left-0 origin-top-left"}`}>
      {items.map((item, index) => item === "divider"
        ? <div key={index} className="my-1 h-px bg-base-300" role="separator" />
        : <button
          key={item.label} type="button" role="menuitem" disabled={item.disabled}
          className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm outline-none transition-colors disabled:opacity-40 ${item.danger ? "text-error hover:bg-error/10 focus:bg-error/10" : "hover:bg-base-200 focus:bg-base-200"}`}
          onClick={() => { setOpen(false); item.onSelect(); }}
        >
          {item.icon && <item.icon size={16} className={item.danger ? "" : "text-base-content/60"} />}
          <span className="flex-1">{item.label}</span>
          {item.hint && <kbd className="text-xs text-base-content/40">{item.hint}</kbd>}
        </button>)}
    </div>}
  </div>;
}
