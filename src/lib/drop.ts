import { useEffect, useRef } from "react";
import { native, readNativeFile } from "./storage";

/** Native drops give file paths (Tauri intercepts them before the page sees a File); web drops give Files. */
export type Dropped = { paths: string[]; files: File[] };

/** Reads dropped native paths into File objects, for consumers that need the bytes. */
export async function droppedFiles(dropped: Dropped): Promise<File[]> {
  if (dropped.files.length) return dropped.files;
  return Promise.all(dropped.paths.map(readNativeFile));
}

/** Watches for files dragged over the window. `onHover` drives a drop overlay. */
export function useFileDrop(enabled: boolean, onDrop: (dropped: Dropped) => void, onHover: (hovering: boolean) => void) {
  const handlers = useRef({ onDrop, onHover });
  handlers.current = { onDrop, onHover };

  useEffect(() => {
    if (!enabled) return;
    if (native) {
      let unlisten: (() => void) | undefined;
      let cancelled = false;
      void import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent(({ payload }) => {
        if (payload.type === "enter" || payload.type === "over") handlers.current.onHover(true);
        else if (payload.type === "leave") handlers.current.onHover(false);
        else {
          handlers.current.onHover(false);
          if (payload.paths.length) handlers.current.onDrop({ paths: payload.paths, files: [] });
        }
      })).then((stop) => { if (cancelled) stop(); else unlisten = stop; });
      return () => { cancelled = true; unlisten?.(); };
    }

    let depth = 0;
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files");
    const enter = (event: DragEvent) => { if (hasFiles(event)) { depth++; handlers.current.onHover(true); } };
    const leave = () => { depth = Math.max(0, depth - 1); if (!depth) handlers.current.onHover(false); };
    const over = (event: DragEvent) => { if (hasFiles(event)) event.preventDefault(); };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      handlers.current.onHover(false);
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length) handlers.current.onDrop({ paths: [], files });
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [enabled]);
}
