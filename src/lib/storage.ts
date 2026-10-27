import { isTauri } from "@tauri-apps/api/core";
import { exportCurieInBackground, loadCurieInBackground } from "../curie/background";
import type { AssetMap, ProgressFn } from "../curie/package";
import type { CurieDocument, CurieManifest } from "../curie/types";
import { blockText, flattenBlocks, readingMinutes, slugify } from "./lesson";

/** The full contents of a lesson package. */
export type LessonContent = { manifest: CurieManifest; document: CurieDocument; assets: AssetMap };

/**
 * What the library knows about a lesson without opening it. `key` is local-only; `manifest.id`
 * travels with the package.
 */
export type LessonSummary = {
  key: string;
  manifest: Pick<CurieManifest, "id" | "title" | "description" | "author">;
  minutes: number;
  blocks: number;
  /** Total size of packaged assets in bytes. */
  size: number;
  searchText: string;
  createdAt: number;
  updatedAt: number;
  openedAt?: number;
  /** Furthest reading position reached, 0–1. */
  progress?: number;
  completedAt?: number;
  /** Native only: the .curie file this lesson is read from and saved to. */
  path?: string;
  /** Native only: true when the file lives in Curie's own lessons folder (and is deleted with the lesson). */
  managed?: boolean;
  /** Native only: the file at `path` could not be found when the library was loaded. */
  missing?: boolean;
  /** A small JPEG data URL of the lesson's cover image, for library cards. */
  cover?: string;
  /** Set for lessons downloaded from a lesson source: which file, at which version. */
  origin?: LessonOrigin;
};

export type LessonOrigin = { source: string; path: string; sha: string };

export function summarize(content: LessonContent): Pick<LessonSummary, "manifest" | "minutes" | "blocks" | "size" | "searchText"> {
  const { id, title, description, author } = content.manifest;
  const blocks = flattenBlocks(content.document.blocks);
  return {
    manifest: { id, title, description, author },
    minutes: readingMinutes(content.document),
    blocks: blocks.length,
    size: Object.values(content.assets).reduce((sum, blob) => sum + blob.size, 0),
    searchText: blocks.map(blockText).join(" ").slice(0, 8000),
  };
}

export interface LibraryBackend {
  kind: "browser" | "native";
  /** Where lessons and settings are stored, for showing to the user. */
  location: string;
  list(): Promise<LessonSummary[]>;
  read(summary: LessonSummary): Promise<LessonContent>;
  /**
   * Saves contents and metadata; returns the summary as stored (e.g. with its file path).
   * `packed` is the already-zipped package when the caller has it, which saves re-compressing.
   */
  write(summary: LessonSummary, content: LessonContent, packed?: Blob): Promise<LessonSummary>;
  /** Saves metadata only (progress, last opened); natively also re-adds an entry whose file still exists. */
  update(summary: LessonSummary): Promise<void>;
  remove(summary: LessonSummary): Promise<void>;
  clear(summaries: LessonSummary[]): Promise<void>;
}

export const native = isTauri();

// ── Browser: IndexedDB ────────────────────────────────────────────────────

type BrowserRecord = LessonSummary & { content: LessonContent };
/** Records written by v0.2 stored content at the top level. */
type LegacyRecord = Omit<LessonSummary, "manifest" | "minutes" | "blocks" | "size" | "searchText"> & LessonContent;

const DB_NAME = "curie";
const STORE = "lessons";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local storage."));
  });
}

function browserBackend(): LibraryBackend {
  let dbPromise: Promise<IDBDatabase> | undefined;
  const memory = new Map<string, BrowserRecord>();
  let useMemory = false;

  const run = <T,>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    dbPromise ??= openDb();
    return dbPromise.then((db) => new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error ?? new Error("Local storage failed."));
      tx.onabort = () => reject(tx.error ?? new Error("Local storage was aborted (it may be full)."));
    }));
  };
  const put = async (record: BrowserRecord) => {
    if (useMemory) memory.set(record.key, record);
    else await run("readwrite", (store) => store.put(record));
  };
  const get = async (key: string) => useMemory ? memory.get(key) : run<BrowserRecord | undefined>("readonly", (store) => store.get(key));

  return {
    kind: "browser",
    location: "this browser's local storage",
    async list() {
      let records: (BrowserRecord | LegacyRecord)[];
      try {
        records = await run("readonly", (store) => store.getAll() as IDBRequest<(BrowserRecord | LegacyRecord)[]>);
      } catch {
        useMemory = true;
        throw new Error("STORAGE_UNAVAILABLE");
      }
      const summaries: LessonSummary[] = [];
      for (const record of records) {
        if ("content" in record) {
          const { content: _content, ...summary } = record;
          summaries.push(summary);
          continue;
        }
        const { manifest, document, assets, ...meta } = record;
        const content = { manifest, document, assets };
        const migrated: BrowserRecord = { ...meta, ...summarize(content), content };
        await put(migrated);
        const { content: _migrated, ...summary } = migrated;
        summaries.push(summary);
      }
      return summaries;
    },
    async read(summary) {
      const record = await get(summary.key);
      if (!record) throw new Error("This lesson is no longer in local storage.");
      return record.content;
    },
    async write(summary, content) {
      await put({ ...summary, content });
      return summary;
    },
    async update(summary) {
      const record = await get(summary.key);
      if (record) await put({ ...record, ...summary, content: record.content });
    },
    async remove(summary) {
      if (useMemory) memory.delete(summary.key);
      else await run("readwrite", (store) => store.delete(summary.key));
    },
    async clear() {
      if (useMemory) memory.clear();
      else await run("readwrite", (store) => store.clear());
    },
  };
}

// ── Native: files in the app data folder ──────────────────────────────────
//
// <app data>/
//   library.json   index of every lesson: metadata, progress, and the path of its .curie file
//   settings.json  preferences (see settings.tsx)
//   lessons/       lessons created in Curie (imported lessons stay where they are)

export async function appFolder(): Promise<string> {
  const { appDataDir } = await import("@tauri-apps/api/path");
  return appDataDir();
}

const CHUNK_BYTES = 2 * 1024 * 1024;

/** Reads a file in chunks so large lessons can report progress; falls back to a single read. */
async function readNativeBytes(path: string, onProgress?: ProgressFn): Promise<Uint8Array<ArrayBuffer>> {
  const fs = await import("@tauri-apps/plugin-fs");
  if (!onProgress) return fs.readFile(path) as Promise<Uint8Array<ArrayBuffer>>;
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    handle = await fs.open(path, { read: true });
    const { size } = await handle.stat();
    const bytes = new Uint8Array(size);
    let offset = 0;
    while (offset < size) {
      const read = await handle.read(bytes.subarray(offset, Math.min(size, offset + CHUNK_BYTES)));
      if (read === null) break;
      offset += read;
      onProgress(offset / size);
    }
    return offset === size ? bytes : bytes.slice(0, offset);
  } catch {
    // Some providers (e.g. a few Android content:// sources) don't report a size.
    return fs.readFile(path) as Promise<Uint8Array<ArrayBuffer>>;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export async function readNativeFile(path: string, onProgress?: ProgressFn): Promise<File> {
  const { basename } = await import("@tauri-apps/api/path");
  const bytes = await readNativeBytes(path, onProgress);
  let name = "lesson.curie";
  try { name = await basename(path); } catch { /* content:// URIs have no usable basename */ }
  // Android content:// URIs often lack the extension; loadCurie only needs it as a hint.
  if (!name.toLowerCase().endsWith(".curie") && path.startsWith("content://")) name = "lesson.curie";
  return new File([bytes], name);
}

export async function writeNativeFile(path: string, blob: Blob) {
  const { writeFile } = await import("@tauri-apps/plugin-fs");
  await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
}

async function nativeBackend(): Promise<LibraryBackend> {
  const fs = await import("@tauri-apps/plugin-fs");
  const { join } = await import("@tauri-apps/api/path");
  const root = await appFolder();
  const lessonsDir = await join(root, "lessons");
  const indexPath = await join(root, "library.json");
  await fs.mkdir(lessonsDir, { recursive: true });

  let entries = new Map<string, LessonSummary>();
  // Serialise index writes so overlapping saves can't interleave.
  let queue = Promise.resolve();
  const saveIndex = () => {
    const snapshot = [...entries.values()].map(({ missing: _missing, ...entry }) => entry);
    queue = queue.then(() => fs.writeTextFile(indexPath, JSON.stringify({ version: 1, lessons: snapshot }, null, 2)));
    return queue;
  };

  return {
    kind: "native",
    location: root,
    async list() {
      if (await fs.exists(indexPath)) {
        const parsed = JSON.parse(await fs.readTextFile(indexPath)) as { lessons?: LessonSummary[] };
        entries = new Map((parsed.lessons ?? []).map((entry) => [entry.key, entry]));
      }
      const summaries = await Promise.all([...entries.values()].map(async (entry) => {
        const missing = !entry.path || !(await fs.exists(entry.path).catch(() => false));
        return missing ? { ...entry, missing } : entry;
      }));
      return summaries;
    },
    async read(summary) {
      if (!summary.path) throw new Error("This lesson has no file.");
      let file: File;
      try {
        file = await readNativeFile(summary.path);
      } catch {
        throw new Error(`The lesson file could not be opened: ${summary.path}. It may have been moved or deleted.`);
      }
      return loadCurieInBackground(file);
    },
    async write(summary, content, packed) {
      const path = summary.path ?? await join(lessonsDir, `${slugify(content.manifest.title)}-${summary.key}.curie`);
      await writeNativeFile(path, packed ?? await exportCurieInBackground(content));
      const stored: LessonSummary = { ...summary, path, managed: summary.path ? summary.managed : true, missing: undefined };
      entries.set(stored.key, stored);
      await saveIndex();
      return stored;
    },
    async update(summary) {
      entries.set(summary.key, summary);
      await saveIndex();
    },
    async remove(summary) {
      entries.delete(summary.key);
      await saveIndex();
      // Only delete files Curie created; imported lessons belong to the user.
      if (summary.managed && summary.path) await fs.remove(summary.path).catch(() => undefined);
    },
    async clear(summaries) {
      for (const summary of summaries) {
        if (summary.managed && summary.path) await fs.remove(summary.path).catch(() => undefined);
      }
      entries.clear();
      await saveIndex();
    },
  };
}

export function createBackend(): Promise<LibraryBackend> {
  return native ? nativeBackend() : Promise.resolve(browserBackend());
}
