import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { useLibrary } from "../lib/library";
import { navigate, paths } from "../lib/router";
import { useSettings } from "../lib/settings";
import { useSound } from "../lib/sound";
import { native } from "../lib/storage";

type AppActions = {
  openImport: () => void;
  openNewLesson: () => void;
  importFiles: (files: File[]) => Promise<void>;
  importPaths: (paths: string[]) => Promise<void>;
};

const AppActionsContext = createContext<AppActions | null>(null);

/** App-wide entry points (import picker, new-lesson dialog) reachable from any page or shortcut. */
export function AppActionsProvider({ children }: { children: ReactNode }) {
  const library = useLibrary();
  const play = useSound();
  const { settings, update } = useSettings();
  const fileInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState({ title: "", description: "", author: "" });
  const [creating, setCreating] = useState(false);

  const openImported = useCallback((imported: { key: string }[]) => {
    if (imported.length !== 1) return;
    play("success");
    navigate(paths.lesson(imported[0].key));
  }, [play]);

  const importFiles = useCallback(async (files: File[]) => openImported(await library.importFiles(files)), [library, openImported]);
  const importPaths = useCallback(async (paths: string[]) => openImported(await library.importPaths(paths)), [library, openImported]);

  const openImport = useCallback(async () => {
    if (!native) return fileInput.current?.click();
    // Native: pick with the system dialog so we get real paths and can keep lessons where they are.
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ multiple: true, title: "Import lessons", filters: [{ name: "Curie lesson", extensions: ["curie"] }] });
    if (picked?.length) await importPaths(picked);
  }, [importPaths]);

  const openNewLesson = useCallback(() => {
    setDraft({ title: "", description: "", author: settings.defaultAuthor });
    dialog.current?.showModal();
    play("open");
  }, [play, settings.defaultAuthor]);

  const api = useMemo(() => ({ openImport: () => void openImport(), openNewLesson, importFiles, importPaths }), [openImport, openNewLesson, importFiles, importPaths]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) return;
    setCreating(true);
    try {
      if (draft.author.trim() !== settings.defaultAuthor) update({ defaultAuthor: draft.author.trim() });
      const record = await library.create({ title: draft.title.trim(), description: draft.description.trim(), author: draft.author.trim() });
      dialog.current?.close();
      play("success");
      navigate(paths.editor(record.key));
    } finally {
      setCreating(false);
    }
  }

  return <AppActionsContext.Provider value={api}>
    {children}
    <input ref={fileInput} type="file" accept=".curie" multiple className="hidden" onChange={(event) => {
      const files = [...(event.target.files ?? [])];
      event.target.value = "";
      if (files.length) void importFiles(files);
    }} />
    <dialog ref={dialog} className="modal modal-bottom sm:modal-middle">
      <form className="modal-box animate-pop w-full max-w-none sm:max-w-lg" onSubmit={submit}>
        <div className="mb-5 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-secondary text-secondary-content"><Sparkles size={20} /></div>
          <div>
            <h3 className="font-display text-xl font-bold">New lesson</h3>
            <p className="text-sm text-base-content/60">You can change all of this later in the editor.</p>
          </div>
        </div>
        <fieldset className="fieldset gap-3">
          <label className="floating-label">
            <span>Title</span>
            <input autoFocus required className="input input-lg w-full" placeholder="Title, e.g. How rainbows form" value={draft.title} maxLength={120} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </label>
          <label className="floating-label">
            <span>Short description</span>
            <textarea className="textarea w-full" rows={2} placeholder="Short description (optional)" value={draft.description} maxLength={300} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </label>
          <label className="floating-label">
            <span>Author</span>
            <input className="input w-full" placeholder="Author (optional)" value={draft.author} maxLength={80} onChange={(event) => setDraft({ ...draft, author: event.target.value })} />
          </label>
        </fieldset>
        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={() => dialog.current?.close()}>Cancel</button>
          <button type="submit" className="btn btn-primary press" disabled={!draft.title.trim() || creating}>{creating && <span className="loading loading-spinner loading-sm" />} Create and edit</button>
        </div>
      </form>
      <form method="dialog" className="modal-backdrop"><button>close</button></form>
    </dialog>
  </AppActionsContext.Provider>;
}

export function useAppActions() {
  const value = useContext(AppActionsContext);
  if (!value) throw new Error("useAppActions must be used inside AppActionsProvider");
  return value;
}

/** Runs `handler` for a keyboard shortcut unless the user is typing in a field. */
export function useShortcut(match: (event: KeyboardEvent) => boolean, handler: (event: KeyboardEvent) => void, allowInFields = false) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const matchRef = useRef(match);
  matchRef.current = match;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if ((!typing || allowInFields) && matchRef.current(event)) handlerRef.current(event);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allowInFields]);
}

export const isMod = (event: KeyboardEvent) => event.metaKey || event.ctrlKey;
