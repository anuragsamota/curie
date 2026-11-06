import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * A bottom sheet for phones: slides up, closes on backdrop tap, Escape, or a downward drag on its
 * handle. Used for editor panels, pickers and action menus.
 */
export function Sheet({ title, onClose, children, className = "" }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const panel = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ start: number; offset: number }>();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey, true); document.body.style.overflow = previous; };
  }, [onClose]);

  const end = () => {
    if (drag && drag.offset > 90) onClose();
    setDrag(undefined);
  };

  return createPortal(<div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={title}>
    <div className="animate-fade absolute inset-0 bg-black/40" onClick={onClose} />
    <div ref={panel} className={`animate-sheet absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-2xl border-t border-base-300 bg-base-100 pb-[env(safe-area-inset-bottom)] shadow-[0_-20px_50px_-20px_rgb(0_0_0/0.35)] ${className}`}
      style={drag ? { transform: `translateY(${drag.offset}px)`, transition: "none" } : { transition: "transform 0.2s var(--ease-out-expo)" }}>
      <div className="touch-none select-none"
        onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setDrag({ start: event.clientY, offset: 0 }); }}
        onPointerMove={(event) => drag && setDrag({ ...drag, offset: Math.max(0, event.clientY - drag.start) })}
        onPointerUp={end} onPointerCancel={end}>
        <div className="flex justify-center pt-2.5"><span className="h-1 w-10 rounded-full bg-base-content/20" /></div>
        <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-1.5">
          <p className="font-display truncate text-base font-semibold">{title}</p>
          <button type="button" className="btn btn-ghost btn-sm btn-square -mr-1.5" aria-label={`Close ${title}`} onPointerDown={(event) => event.stopPropagation()} onClick={onClose}><X size={18} /></button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
    </div>
  </div>, document.body);
}
