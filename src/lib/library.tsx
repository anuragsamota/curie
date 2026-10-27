import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { exportCurieInBackground, loadCurieInBackground } from "../curie/background";
import type { ProgressFn } from "../curie/package";
import type { CurieManifest } from "../curie/types";
import { useToast } from "../ui/Toasts";
import { coverThumbnail } from "./cover";
import { downloadBlob, randomId, slugify } from "./lesson";
import { downloadLesson, type RemoteLesson } from "./sources";
import {
  createBackend, native, readNativeFile, summarize, writeNativeFile,
  type LessonContent, type LessonOrigin, type LessonSummary, type LibraryBackend,
} from "./storage";

type NewLesson = { title: string; description?: string; author?: string };
type LearnerState = Partial<Pick<LessonSummary, "openedAt" | "progress" | "completedAt">>;
/** Everything needed to undo a delete. */
export type RemovedLesson = { summary: LessonSummary; content?: LessonContent };

type LibraryValue = {
  lessons: LessonSummary[];
  ready: boolean;
  native: boolean;
  /** Where lessons and settings are stored. */
  location: string;
  get: (key: string) => LessonSummary | undefined;
  /** Reads a lesson's full contents (from storage or its file). */
  load: (key: string) => Promise<LessonContent>;
  create: (input: NewLesson) => Promise<LessonSummary>;
  /** Imports browser File objects (web, or drops/pickers that give no path). */
  importFiles: (files: Iterable<File>) => Promise<LessonSummary[]>;
  /** Native: adds lessons by path; the file stays where it is and is read when opened. */
  importPaths: (paths: string[]) => Promise<LessonSummary[]>;
  /** Native: points a missing lesson at its new location. */
  relocate: (key: string, path: string) => Promise<void>;
  /** Downloads a lesson from a lesson source, or updates the copy already in the library. */
  download: (remote: RemoteLesson) => Promise<LessonSummary | undefined>;
  /** The library's copy of a lesson from a source, if it was downloaded. */
  downloaded: (remote: Pick<RemoteLesson, "source" | "path">) => LessonSummary | undefined;
  save: (key: string, content: LessonContent) => Promise<void>;
  /** Updates learner state (progress, last opened) without changing `updatedAt`. */
  touch: (key: string, patch: LearnerState) => void;
  duplicate: (key: string) => Promise<LessonSummary | undefined>;
  remove: (key: string) => Promise<RemovedLesson | undefined>;
  restore: (removed: RemovedLesson) => Promise<void>;
  clear: () => Promise<void>;
  exportLesson: (key: string, content?: LessonContent) => Promise<void>;
};

const LibraryContext = createContext<LibraryValue | null>(null);

function newKey() {
  return `${Date.now().toString(36)}-${randomId(5)}`;
}

const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

/** Adds the cover thumbnail shown on library cards. */
async function withCover(summary: LessonSummary, content: LessonContent): Promise<LessonSummary> {
  const image = content.manifest.cover ? content.assets[content.manifest.cover] : undefined;
  return { ...summary, cover: image ? await coverThumbnail(image) : undefined };
}

type AddOptions = { path?: string; packed?: Blob; origin?: LessonOrigin };

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [ready, setReady] = useState(false);
  const [backend, setBackend] = useState<LibraryBackend>();
  const toast = useToast();
  const lessonsRef = useRef(lessons);
  lessonsRef.current = lessons;
  const backendRef = useRef(backend);
  backendRef.current = backend;
  // Recently loaded contents, so reopening a lesson (or opening it after editing) skips the disk.
  const cache = useRef(new Map<string, LessonContent>());

  useEffect(() => {
    void (async () => {
      try {
        const created = await createBackend();
        setBackend(created);
        try {
          setLessons(await created.list());
        } catch (error) {
          if (message(error, "") === "STORAGE_UNAVAILABLE") toast.warning("Lessons will only be kept until you close this tab.", { title: "Local storage is unavailable" });
          else toast.error(message(error, "Could not read the library."), { title: "Library problem" });
        }
      } catch (error) {
        toast.error(message(error, "Could not open the lesson folder."), { title: "Library problem" });
      } finally {
        setReady(true);
      }
    })();
  }, [toast]);

  const need = () => {
    if (!backendRef.current) throw new Error("The library is still loading.");
    return backendRef.current;
  };

  const upsert = (summary: LessonSummary) =>
    setLessons((all) => all.some((item) => item.key === summary.key) ? all.map((item) => item.key === summary.key ? summary : item) : [...all, summary]);

  /** Writes contents and records them in the library. */
  const store = useCallback(async (summary: LessonSummary, content: LessonContent, packed?: Blob) => {
    try {
      const stored = await need().write(await withCover(summary, content), content, packed);
      cache.current.set(stored.key, content);
      upsert(stored);
      return stored;
    } catch (error) {
      toast.error(message(error, "Could not save the lesson."), { title: "Save failed" });
      throw error;
    }
  }, [toast]);

  const get = useCallback((key: string) => lessons.find((lesson) => lesson.key === key), [lessons]);

  const load = useCallback(async (key: string) => {
    const cached = cache.current.get(key);
    if (cached) return cached;
    const summary = lessonsRef.current.find((lesson) => lesson.key === key);
    if (!summary) throw new Error("This lesson is not in your library.");
    const content = await need().read(summary);
    cache.current.set(key, content);
    if (summary.missing) upsert({ ...summary, missing: undefined });
    return content;
  }, []);

  const create = useCallback(async ({ title, description, author }: NewLesson) => {
    const now = Date.now();
    const manifest: CurieManifest = {
      format: "curie", formatVersion: "0.1.0", id: `local.${slugify(title)}-${randomId(4)}`, title,
      description: description || undefined, author: author || undefined,
      entry: "document.json", assetsDirectory: "assets/", requiredFeatures: ["markdown"],
    };
    const content: LessonContent = {
      manifest, assets: {},
      document: { documentVersion: 1, blocks: [{ id: `intro-${randomId(4)}`, type: "markdown", content: `## Introduction\n\nStart writing your lesson here. Use **Markdown** and math like $E = mc^2$.` }] },
    };
    return store({ key: newKey(), ...summarize(content), createdAt: now, updatedAt: now }, content);
  }, [store]);

  const addContent = useCallback((content: LessonContent, { path, packed, origin }: AddOptions = {}) => {
    const now = Date.now();
    return store({ key: newKey(), ...summarize(content), createdAt: now, updatedAt: now, path, managed: path ? false : undefined, origin }, content, packed);
  }, [store]);

  /**
   * Reads, unpacks and stores one lesson while a progress notification is shown. Unpacking runs in
   * a worker, so the app stays responsive with large lessons.
   */
  const ingest = useCallback(async (title: string, reading: string, read: (onProgress: ProgressFn) => Promise<File>, place: (content: LessonContent, file: File) => Promise<LessonSummary>) => {
    const task = toast.task(title, reading);
    try {
      const file = await read((fraction) => task.update(fraction * 0.4));
      task.update(0.4, "Unpacking lesson…");
      const content = await loadCurieInBackground(file, (fraction) => task.update(0.4 + fraction * 0.5));
      task.update(0.9, "Saving to your library…");
      return await place(content, file);
    } finally {
      task.done();
    }
  }, [toast]);

  const importFiles = useCallback(async (files: Iterable<File>) => {
    const imported: LessonSummary[] = [];
    for (const file of files) {
      try {
        const record = await ingest(`Importing ${file.name}`, "Reading file…", async () => file, (content) => addContent(content, { packed: file }));
        imported.push(record);
        toast.success(`“${record.manifest.title}” was added to your library.`, { title: "Lesson imported" });
      } catch (error) {
        toast.error(message(error, "Could not import this lesson."), { title: `Couldn't import ${file.name}` });
      }
    }
    return imported;
  }, [addContent, ingest, toast]);

  const importPaths = useCallback(async (paths: string[]) => {
    const imported: LessonSummary[] = [];
    for (const path of paths) {
      const existing = lessonsRef.current.find((lesson) => lesson.path === path);
      if (existing) {
        toast.info(`“${existing.manifest.title}” is already in your library.`);
        imported.push(existing);
        continue;
      }
      try {
        const name = path.startsWith("content://") ? "lesson" : path.split(/[\\/]/).pop();
        const record = await ingest(`Importing ${name}`, "Reading file…", (onProgress) => readNativeFile(path, onProgress), (content, file) =>
          // Android content:// URIs don't stay readable after restart, so those are copied into Curie's folder.
          path.startsWith("content://") ? addContent(content, { packed: file }) : addContent(content, { path }));
        imported.push(record);
        toast.success(`“${record.manifest.title}” was added to your library.`, { title: "Lesson imported" });
      } catch (error) {
        toast.error(message(error, "Could not import this lesson."), { title: "Couldn't import lesson" });
      }
    }
    return imported;
  }, [addContent, ingest, toast]);

  const relocate = useCallback(async (key: string, path: string) => {
    const summary = lessonsRef.current.find((lesson) => lesson.key === key);
    if (!summary) return;
    try {
      const content = await loadCurieInBackground(await readNativeFile(path));
      const moved = await withCover({ ...summary, ...summarize(content), path, missing: undefined }, content);
      await need().update(moved);
      cache.current.set(key, content);
      upsert(moved);
      toast.success("Found the lesson file.");
    } catch (error) {
      toast.error(message(error, "That file isn't a readable lesson."), { title: "Couldn't use that file" });
    }
  }, [toast]);

  const downloaded = useCallback((remote: Pick<RemoteLesson, "source" | "path">) =>
    lessons.find((lesson) => lesson.origin?.source === remote.source && lesson.origin.path === remote.path), [lessons]);

  const download = useCallback(async (remote: RemoteLesson) => {
    const origin: LessonOrigin = { source: remote.source, path: remote.path, sha: remote.sha };
    const existing = lessonsRef.current.find((lesson) => lesson.origin?.source === remote.source && lesson.origin.path === remote.path);
    try {
      const record = await ingest(`Downloading “${remote.title}”`, "Downloading…", (onProgress) => downloadLesson(remote, onProgress), (content, file) => {
        cache.current.delete(existing?.key ?? "");
        // An update replaces the contents but keeps the learner's progress.
        return existing
          ? store({ ...existing, ...summarize(content), updatedAt: Date.now(), origin }, content, file)
          : addContent(content, { packed: file, origin });
      });
      toast.success(`“${record.manifest.title}” ${existing ? "was updated" : "was added to your library"}.`, { title: existing ? "Lesson updated" : "Lesson downloaded" });
      return record;
    } catch (error) {
      toast.error(message(error, "Could not download this lesson."), { title: `Couldn't download “${remote.title}”` });
      return undefined;
    }
  }, [addContent, ingest, store, toast]);

  const save = useCallback(async (key: string, content: LessonContent) => {
    const summary = lessonsRef.current.find((lesson) => lesson.key === key);
    if (!summary) return;
    await store({ ...summary, ...summarize(content), updatedAt: Date.now() }, content);
  }, [store]);

  const touch = useCallback((key: string, patch: LearnerState) => {
    const summary = lessonsRef.current.find((lesson) => lesson.key === key);
    if (!summary) return;
    const updated = { ...summary, ...patch };
    upsert(updated);
    void backendRef.current?.update(updated).catch(() => undefined);
  }, []);

  const duplicate = useCallback(async (key: string) => {
    try {
      const source = await load(key);
      const title = `${source.manifest.title} (copy)`;
      const record = await addContent({ ...structuredClone({ manifest: source.manifest, document: source.document }), assets: { ...source.assets }, manifest: { ...source.manifest, title, id: `local.${slugify(title)}-${randomId(4)}` } });
      toast.success(`Created “${title}”.`);
      return record;
    } catch (error) {
      toast.error(message(error, "Could not duplicate this lesson."));
      return undefined;
    }
  }, [addContent, load, toast]);

  const remove = useCallback(async (key: string) => {
    const summary = lessonsRef.current.find((lesson) => lesson.key === key);
    if (!summary) return undefined;
    // Keep the contents of files Curie deletes, so Undo can write them back.
    const content = summary.managed || !native ? await load(key).catch(() => undefined) : undefined;
    setLessons((all) => all.filter((lesson) => lesson.key !== key));
    cache.current.delete(key);
    await need().remove(summary);
    return { summary, content };
  }, [load]);

  const restore = useCallback(async ({ summary, content }: RemovedLesson) => {
    if (content) await store(summary.managed ? { ...summary, path: undefined, managed: undefined } : summary, content);
    else {
      // Imported files were never deleted; re-adding the entry is enough.
      await need().update(summary);
      upsert(summary);
    }
  }, [store]);

  const clear = useCallback(async () => {
    const all = lessonsRef.current;
    setLessons([]);
    cache.current.clear();
    await need().clear(all);
  }, []);

  const exportLesson = useCallback(async (key: string, provided?: LessonContent) => {
    try {
      const content = provided ?? await load(key);
      const task = toast.task("Exporting lesson", "Packing files…");
      const blob = await exportCurieInBackground(content, (fraction) => task.update(fraction)).finally(task.done);
      const filename = `${slugify(content.manifest.title)}.curie`;
      if (native) {
        const { save: saveDialog } = await import("@tauri-apps/plugin-dialog");
        const path = await saveDialog({ defaultPath: filename, filters: [{ name: "Curie lesson", extensions: ["curie"] }] });
        if (!path) return;
        await writeNativeFile(path, blob);
        toast.success(`Saved to ${path}.`, { title: "Lesson exported" });
      } else {
        downloadBlob(blob, filename);
        toast.success(`Saved ${filename} to your downloads.`, { title: "Lesson exported" });
      }
    } catch (error) {
      toast.error(message(error, "Could not export this lesson."), { title: "Export failed" });
    }
  }, [load, toast]);

  const value = useMemo<LibraryValue>(() => ({
    lessons, ready, native, location: backend?.location ?? "", get, load, create, importFiles, importPaths, relocate,
    download, downloaded, save, touch, duplicate, remove, restore, clear, exportLesson,
  }), [lessons, ready, backend, get, load, create, importFiles, importPaths, relocate, download, downloaded, save, touch, duplicate, remove, restore, clear, exportLesson]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const value = useContext(LibraryContext);
  if (!value) throw new Error("useLibrary must be used inside LibraryProvider");
  return value;
}

/** Loads a lesson's contents for viewing; reloads when the lesson is saved. */
export function useLessonContent(key: string) {
  const { load, get, ready } = useLibrary();
  const summary = get(key);
  const version = summary?.updatedAt;
  const [state, setState] = useState<{ content?: LessonContent; error?: string; loading: boolean }>({ loading: true });
  useEffect(() => {
    if (!ready || version === undefined) return;
    let active = true;
    setState((current) => ({ ...current, loading: true, error: undefined }));
    load(key).then((content) => active && setState({ content, loading: false }))
      .catch((error: unknown) => active && setState({ loading: false, error: message(error, "Could not open this lesson.") }));
    return () => { active = false; };
  }, [key, version, ready, load]);
  return state;
}
