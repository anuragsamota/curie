import { useCallback } from "react";
import { BookOpen, Copy, Download, FileSearch, PenLine, Trash2 } from "lucide-react";
import { useLibrary } from "../lib/library";
import { navigate, paths } from "../lib/router";
import { useSettings } from "../lib/settings";
import { useSound } from "../lib/sound";
import { native, type LessonSummary } from "../lib/storage";
import { useConfirm } from "./Confirm";
import type { MenuItem } from "./Menu";
import { useToast } from "./Toasts";

type Context = "library" | "lesson" | "editor";

/** Builds the per-lesson three-dot menu, shared by library cards, the viewer, and the editor. */
export function useLessonMenu() {
  const library = useLibrary();
  const confirm = useConfirm();
  const toast = useToast();
  const play = useSound();
  const { settings } = useSettings();

  const remove = useCallback(async (record: LessonSummary, context: Context) => {
    const title = record.manifest.title;
    // Imported files on desktop are only removed from the library; the .curie file itself is kept.
    const keepsFile = native && !record.managed;
    if (settings.confirmDeletes && !(await confirm({
      title: keepsFile ? `Remove “${title}” from your library?` : `Delete “${title}”?`,
      message: keepsFile
        ? <>The lesson file stays where it is{record.path ? <> (<span className="break-all font-mono text-xs">{record.path}</span>)</> : null}. You can import it again at any time.</>
        : "The lesson and its assets will be removed from this device. Export it first if you want to keep a copy.",
      confirmLabel: keepsFile ? "Remove" : "Delete lesson", danger: !keepsFile,
    }))) return;
    const removed = await library.remove(record.key);
    play("delete");
    if (context !== "library") navigate(paths.library);
    if (removed) toast.info(`“${title}” was ${keepsFile ? "removed" : "deleted"}.`, { duration: 7000, action: { label: "Undo", onClick: () => void library.restore(removed) } });
  }, [confirm, library, play, settings.confirmDeletes, toast]);

  const locate = useCallback(async (record: LessonSummary) => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ title: `Locate “${record.manifest.title}”`, filters: [{ name: "Curie lesson", extensions: ["curie"] }] });
    if (typeof path === "string") await library.relocate(record.key, path);
  }, [library]);

  return useCallback((record: LessonSummary, context: Context): MenuItem[] => record.missing ? [
    { label: "Locate file…", icon: FileSearch, onSelect: () => void locate(record) },
    "divider",
    { label: "Remove from library", icon: Trash2, danger: true, onSelect: () => void remove(record, context) },
  ] : [
    ...(context !== "lesson" ? [{ label: "Open lesson", icon: BookOpen, onSelect: () => navigate(paths.lesson(record.key)) }] : []),
    ...(context !== "editor" ? [{ label: "Edit", icon: PenLine, onSelect: () => navigate(paths.editor(record.key)) }] : []),
    { label: "Export .curie", icon: Download, onSelect: () => void library.exportLesson(record.key) },
    { label: "Duplicate", icon: Copy, onSelect: () => void library.duplicate(record.key) },
    "divider",
    { label: native && !record.managed ? "Remove from library" : "Delete", icon: Trash2, danger: true, onSelect: () => void remove(record, context) },
  ], [library, locate, remove]);
}
