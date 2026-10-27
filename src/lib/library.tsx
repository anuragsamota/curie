import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { exportCurie, loadCurie } from "../curie/package";
import type { CurieManifest } from "../curie/types";
import { useToast } from "../ui/Toasts";
import { downloadBlob, randomId, slugify } from "./lesson";
import {
  createBackend, native, readNativeFile, summarize, writeNativeFile,
  type LessonContent, type LessonSummary, type LibraryBackend,
} from "./storage";
/** Every packaged example lesson in examples/, bundled as a URL. */
const EXAMPLE_URLS = import.meta.glob<string>("../../examples/*.curie", { query: "?url", import: "default", eager: true });

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
  /** Adds every bundled example lesson; resolves to the ones added. */
  addExamples: () => Promise<LessonSummary[]>;
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
  const store = useCallback(async (summary: LessonSummary, content: LessonContent) => {
    try {
      const stored = await need().write(summary, content);
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

  const addContent = useCallback((content: LessonContent, path?: string) => {
    const now = Date.now();
    return store({ key: newKey(), ...summarize(content), createdAt: now, updatedAt: now, path, managed: path ? false : undefined }, content);
  }, [store]);

  const importFiles = useCallback(async (files: Iterable<File>) => {
    const imported: LessonSummary[] = [];
    for (const file of files) {
      try {
        const record = await addContent(await loadCurie(file));
        imported.push(record);
        toast.success(`“${record.manifest.title}” was added to your library.`, { title: "Lesson imported" });
      } catch (error) {
        toast.error(message(error, "Could not import this lesson."), { title: `Couldn't import ${file.name}` });
      }
    }
    return imported;
  }, [addContent, toast]);

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
        const content = await loadCurie(await readNativeFile(path));
        // Android content:// URIs don't stay readable after restart, so those are copied into Curie's folder.
        const record = await addContent(content, path.startsWith("content://") ? undefined : path);
        imported.push(record);
        toast.success(`“${record.manifest.title}” was added to your library.`, { title: "Lesson imported" });
      } catch (error) {
        toast.error(message(error, "Could not import this lesson."), { title: "Couldn't import lesson" });
      }
    }
    return imported;
  }, [addContent, toast]);

  const relocate = useCallback(async (key: string, path: string) => {
    const summary = lessonsRef.current.find((lesson) => lesson.key === key);
    if (!summary) return;
    try {
      const content = await loadCurie(await readNativeFile(path));
      const moved: LessonSummary = { ...summary, ...summarize(content), path, missing: undefined };
      await need().update(moved);
      cache.current.set(key, content);
      upsert(moved);
      toast.success("Found the lesson file.");
    } catch (error) {
      toast.error(message(error, "That file isn't a readable lesson."), { title: "Couldn't use that file" });
    }
  }, [toast]);

  const addExamples = useCallback(async () => {
    const added: LessonSummary[] = [];
    for (const [path, url] of Object.entries(EXAMPLE_URLS)) {
      try {
        const response = await fetch(url);
        added.push(await addContent(await loadCurie(new File([await response.blob()], path.split("/").pop()!))));
      } catch (error) {
        toast.error(message(error, "Could not load an example lesson."));
      }
    }
    if (added.length) toast.success(`${added.length} example ${added.length === 1 ? "lesson was" : "lessons were"} added to your library.`);
    return added;
  }, [addContent, toast]);

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
      const blob = await exportCurie(content.manifest, content.document, content.assets);
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
    addExamples, save, touch, duplicate, remove, restore, clear, exportLesson,
  }), [lessons, ready, backend, get, load, create, importFiles, importPaths, relocate, addExamples, save, touch, duplicate, remove, restore, clear, exportLesson]);

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
