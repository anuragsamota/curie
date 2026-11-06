// The student's own study notes: imported, split into passages and indexed for search, so the
// assistant can ground its answers, lessons and quizzes in them.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useAiConfig } from "../ai/config";
import { appFolder, native } from "../lib/storage";
import { randomId } from "../lib/lesson";
import { useToast } from "../ui/Toasts";
import { Bm25Index } from "./bm25";
import { chunkPages, type PageText, type Passage } from "./chunk";
import { TRANSCRIBE_PROMPT, extractPdf, extractText, noteKind, prepareImage } from "./extract";

export type NoteSummary = {
  id: string;
  name: string;
  kind: "pdf" | "text" | "image" | "pasted";
  /** Size of the original file in bytes. */
  size: number;
  chars: number;
  pages?: number;
  passageCount: number;
  addedAt: number;
};
export type NoteRecord = NoteSummary & { text: string; passages: Passage[] };
export type SearchHit = { noteId: string; noteName: string; index: number; page?: number; text: string; score: number };

// ── Storage ───────────────────────────────────────────────────────────────

interface NotesStore {
  list(): Promise<NoteRecord[]>;
  put(note: NoteRecord): Promise<void>;
  remove(id: string): Promise<void>;
}

function browserStore(): NotesStore {
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("curie-notes", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("notes", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open note storage."));
  });
  let db: Promise<IDBDatabase> | undefined;
  const run = <T,>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) => (db ??= open()).then((database) => new Promise<T>((resolve, reject) => {
    const tx = database.transaction("notes", mode);
    const request = action(tx.objectStore("notes"));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error ?? new Error("Note storage failed."));
    tx.onabort = () => reject(tx.error ?? new Error("Note storage is full."));
  }));
  return {
    list: () => run("readonly", (store) => store.getAll() as IDBRequest<NoteRecord[]>),
    put: async (note) => { await run("readwrite", (store) => store.put(note)); },
    remove: async (id) => { await run("readwrite", (store) => store.delete(id)); },
  };
}

/** Natively, each note is a JSON file in <Curie folder>/notes/. */
function nativeStore(): NotesStore {
  const dir = async () => {
    const { join } = await import("@tauri-apps/api/path");
    const fs = await import("@tauri-apps/plugin-fs");
    const path = await join(await appFolder(), "notes");
    await fs.mkdir(path, { recursive: true });
    return path;
  };
  const file = async (id: string) => (await import("@tauri-apps/api/path")).join(await dir(), `${id}.json`);
  return {
    async list() {
      const fs = await import("@tauri-apps/plugin-fs");
      const { join } = await import("@tauri-apps/api/path");
      const folder = await dir();
      const entries = await fs.readDir(folder);
      const notes = await Promise.all(entries.filter((entry) => entry.isFile && entry.name.endsWith(".json"))
        .map(async (entry) => JSON.parse(await fs.readTextFile(await join(folder, entry.name))) as NoteRecord).map((note) => note.catch(() => undefined)));
      return notes.filter((note): note is NoteRecord => !!note);
    },
    async put(note) {
      const fs = await import("@tauri-apps/plugin-fs");
      await fs.writeTextFile(await file(note.id), JSON.stringify(note));
    },
    async remove(id) {
      const fs = await import("@tauri-apps/plugin-fs");
      const path = await file(id);
      if (await fs.exists(path)) await fs.remove(path);
    },
  };
}

export function buildNote(name: string, kind: NoteSummary["kind"], size: number, pages: PageText[]): NoteRecord {
  const text = pages.map((page) => page.text).join("\n\n").trim();
  const passages = chunkPages(pages);
  return {
    id: `${Date.now().toString(36)}-${randomId(5)}`, name, kind, size, chars: text.length,
    pages: kind === "pdf" ? pages.length : undefined, passageCount: passages.length, addedAt: Date.now(), text, passages,
  };
}

// ── Context ───────────────────────────────────────────────────────────────

type NotesValue = {
  notes: NoteSummary[];
  ready: boolean;
  addFiles: (files: File[]) => Promise<NoteSummary[]>;
  addText: (name: string, text: string) => Promise<NoteSummary | undefined>;
  remove: (id: string) => Promise<void>;
  read: (id: string) => NoteRecord | undefined;
  search: (query: string, limit?: number, noteIds?: string[]) => SearchHit[];
};

const NotesContext = createContext<NotesValue | null>(null);
const summary = ({ text: _text, passages: _passages, ...rest }: NoteRecord): NoteSummary => rest;

export function NotesProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<NoteRecord[]>([]);
  const [ready, setReady] = useState(false);
  const store = useMemo(() => native ? nativeStore() : browserStore(), []);
  const index = useRef(new Bm25Index());
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const toast = useToast();
  const { provider } = useAiConfig();

  const indexNote = (note: NoteRecord) => note.passages.forEach((passage, i) => index.current.add(`${note.id}#${i}`, `${note.name}\n${passage.text}`));
  const unindexNote = (note: NoteRecord) => note.passages.forEach((_, i) => index.current.remove(`${note.id}#${i}`));

  useEffect(() => {
    void store.list().then((notes) => {
      notes.sort((a, b) => b.addedAt - a.addedAt).forEach(indexNote);
      setRecords(notes);
    }).catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Could not read your notes.", { title: "Notes problem" }))
      .finally(() => setReady(true));
  }, [store, toast]);

  const save = useCallback(async (note: NoteRecord) => {
    await store.put(note);
    indexNote(note);
    setRecords((current) => [note, ...current]);
    return summary(note);
  }, [store]);

  const addFiles = useCallback(async (files: File[]) => {
    const added: NoteSummary[] = [];
    for (const file of files) {
      const kind = noteKind(file);
      if (!kind) { toast.error(`${file.name} isn't a supported note. Use PDF, text, Markdown or a photo.`, { title: "Can't add this file" }); continue; }
      const task = toast.task(`Adding ${file.name}`, kind === "image" ? "Transcribing with AI…" : "Reading…");
      try {
        let pages: PageText[];
        if (kind === "pdf") pages = await extractPdf(file, (fraction) => task.update(fraction * 0.9));
        else if (kind === "text") pages = await extractText(file);
        else {
          if (!provider) throw new Error("Photos of notes are transcribed by your AI model. Set one up in Settings → AI assistant first.");
          task.update(0.2);
          const image = await prepareImage(file);
          pages = [{ text: await provider.complete({ prompt: TRANSCRIBE_PROMPT, images: [image] }) }];
        }
        task.update(0.95, "Indexing…");
        const note = buildNote(file.name, kind, file.size, pages);
        if (!note.chars) {
          toast.warning(kind === "pdf" ? `${file.name} has no selectable text (it may be a scan). Add photos of its pages instead, which can be transcribed with AI.` : `${file.name} is empty.`, { title: "Nothing to add" });
          continue;
        }
        added.push(await save(note));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not add this note.", { title: `Couldn't add ${file.name}` });
      } finally {
        task.done();
      }
    }
    if (added.length) toast.success(added.length === 1 ? `“${added[0].name}” is ready to study from.` : `${added.length} notes are ready to study from.`, { title: "Notes added" });
    return added;
  }, [provider, save, toast]);

  const addText = useCallback(async (name: string, text: string) => {
    if (!text.trim()) return undefined;
    try {
      return await save(buildNote(name.trim() || "Pasted notes", "pasted", new Blob([text]).size, [{ text }]));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save these notes.");
      return undefined;
    }
  }, [save, toast]);

  const remove = useCallback(async (id: string) => {
    const note = recordsRef.current.find((record) => record.id === id);
    if (!note) return;
    await store.remove(id);
    unindexNote(note);
    setRecords((current) => current.filter((record) => record.id !== id));
  }, [store]);

  const read = useCallback((id: string) => recordsRef.current.find((record) => record.id === id), []);

  const search = useCallback((query: string, limit = 6, noteIds?: string[]) => {
    const allowed = noteIds?.length ? new Set(noteIds) : undefined;
    return index.current.search(query, limit, allowed ? (id) => allowed.has(id.slice(0, id.indexOf("#"))) : undefined).flatMap(({ id, score }) => {
      const [noteId, position] = id.split("#");
      const note = recordsRef.current.find((record) => record.id === noteId);
      const passage = note?.passages[Number(position)];
      return note && passage ? [{ noteId, noteName: note.name, index: Number(position), page: passage.page, text: passage.text, score }] : [];
    });
  }, []);

  const notes = useMemo(() => records.map(summary), [records]);
  const value = useMemo(() => ({ notes, ready, addFiles, addText, remove, read, search }), [notes, ready, addFiles, addText, remove, read, search]);
  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotes() {
  const value = useContext(NotesContext);
  if (!value) throw new Error("useNotes must be used inside NotesProvider");
  return value;
}
