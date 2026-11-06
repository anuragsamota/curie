import { useMemo, useRef, useState } from "react";
import { ClipboardPaste, FileImage, FileText, FileType2, Lock, NotebookText, Search, Sparkles, Target, Trash2, Upload, X } from "lucide-react";
import { useAssistant } from "../ai/assistant";
import { useAiConfig } from "../ai/config";
import { formatBytes, timeAgo } from "../lib/lesson";
import { useIsPhone } from "../lib/media";
import { useSound } from "../lib/sound";
import { NOTE_ACCEPT } from "../rag/extract";
import { useNotes, type NoteSummary } from "../rag/notes";
import { useConfirm } from "../ui/Confirm";
import { Menu } from "../ui/Menu";
import { Sheet } from "../ui/Sheet";

const KIND_ICON = { pdf: FileType2, text: FileText, pasted: ClipboardPaste, image: FileImage };

function PasteNotes({ onClose }: { onClose: () => void }) {
  const { addText } = useNotes();
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const phone = useIsPhone();
  const form = <form className="flex flex-col gap-3" onSubmit={async (event) => {
    event.preventDefault();
    setSaving(true);
    const added = await addText(name, text);
    setSaving(false);
    if (added) onClose();
  }}>
    <input className="input w-full" placeholder="Name, e.g. Chapter 3 lecture notes" value={name} onChange={(event) => setName(event.target.value)} aria-label="Note name" />
    <textarea className="textarea min-h-56 w-full leading-6" placeholder="Paste or type your notes here…" value={text} onChange={(event) => setText(event.target.value)} aria-label="Note text" autoFocus />
    <div className="flex justify-end gap-2">
      <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary press" disabled={!text.trim() || saving}>{saving && <span className="loading loading-spinner loading-sm" />} Add notes</button>
    </div>
  </form>;
  if (phone) return <Sheet title="Paste notes" onClose={onClose}>{form}</Sheet>;
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4" onClick={onClose}>
    <div className="animate-pop w-full max-w-xl rounded-2xl border border-base-300 bg-base-100 p-5 shadow-2xl" role="dialog" aria-modal="true" aria-label="Paste notes" onClick={(event) => event.stopPropagation()}>
      <div className="mb-4 flex items-center justify-between"><p className="font-display text-lg font-semibold">Paste notes</p><button className="btn btn-ghost btn-sm btn-square" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
      {form}
    </div>
  </div>;
}

function NoteRow({ note }: { note: NoteSummary }) {
  const { remove } = useNotes();
  const { ask } = useAssistant();
  const { provider } = useAiConfig();
  const confirm = useConfirm();
  const play = useSound();
  const Icon = KIND_ICON[note.kind];
  const about = `my note "${note.name}" (note id ${note.id})`;
  return <div className="flex items-center gap-3 rounded-xl border border-base-300 bg-base-100 p-3">
    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-content"><Icon size={18} /></span>
    <div className="min-w-0 flex-1">
      <p className="truncate font-medium">{note.name}</p>
      <p className="truncate text-xs text-base-content/50">{[note.pages ? `${note.pages} pages` : undefined, `${Math.max(1, Math.round(note.chars / 1000))}k characters`, note.kind === "image" ? "transcribed" : undefined, formatBytes(note.size), `added ${timeAgo(note.addedAt)}`].filter(Boolean).join(" · ")}</p>
    </div>
    {provider && <button className="btn btn-sm btn-ghost hidden press sm:inline-flex" onClick={() => ask(`Make an interactive lesson from ${about}. Read the whole note first.`)}><Sparkles size={15} /> Make a lesson</button>}
    <Menu label={`Actions for ${note.name}`} items={[
      ...(provider ? [
        { label: "Make a lesson", icon: Sparkles, onSelect: () => ask(`Make an interactive lesson from ${about}. Read the whole note first.`) },
        { label: "Quiz me on it", icon: Target, onSelect: () => ask(`Make a practice quiz from ${about}: 8 to 10 questions with explanations, from easy to hard.`) },
        { label: "Summarise it", icon: NotebookText, onSelect: () => ask(`Summarise ${about}: the main ideas, key terms and what to memorise.`) },
        "divider" as const,
      ] : []),
      { label: "Delete note", icon: Trash2, danger: true, onSelect: async () => {
        if (!(await confirm({ title: `Delete “${note.name}”?`, message: "It's removed from Curie on this device. The original file isn't touched.", confirmLabel: "Delete", danger: true }))) return;
        await remove(note.id);
        play("delete");
      } },
    ]} />
  </div>;
}

export default function Notes() {
  const { notes, ready, addFiles, search } = useNotes();
  const { provider } = useAiConfig();
  const [query, setQuery] = useState("");
  const [pasting, setPasting] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => query.trim().length > 1 ? search(query, 8) : [], [query, search, notes]);

  return <div className="flex flex-col gap-5 pb-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-base-content/60">{notes.length ? `${notes.length} ${notes.length === 1 ? "note" : "notes"} the assistant can learn from` : "Add the notes you study from"}</p>
      <div className="flex gap-2">
        <button className="btn btn-sm btn-ghost border-base-300 press" onClick={() => setPasting(true)}><ClipboardPaste size={15} /> Paste text</button>
        <button className="btn btn-sm btn-primary press" onClick={() => input.current?.click()}><Upload size={15} /> Add files</button>
      </div>
      <input ref={input} type="file" accept={NOTE_ACCEPT} multiple className="hidden" onChange={(event) => {
        const files = [...(event.target.files ?? [])];
        event.target.value = "";
        if (files.length) void addFiles(files);
      }} />
    </div>

    {notes.length > 0 && <label className="input w-full">
      <Search size={16} className="opacity-50" />
      <input type="search" placeholder="Search your notes" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search your notes" />
      {query && <button aria-label="Clear search" onClick={() => setQuery("")}><X size={14} /></button>}
    </label>}

    {query.trim().length > 1 ? <div className="flex flex-col gap-2">
      {hits.length === 0 ? <p className="py-8 text-center text-sm text-base-content/55">Nothing in your notes matches “{query}”.</p>
        : hits.map((hit) => <div key={`${hit.noteId}-${hit.index}`} className="rounded-xl border border-base-300 bg-base-100 p-3.5">
          <p className="mb-1 text-xs font-semibold text-primary">{hit.noteName}{hit.page ? ` · page ${hit.page}` : ""}</p>
          <p className="line-clamp-4 text-sm leading-6 text-base-content/75">{hit.text}</p>
        </div>)}
    </div> : !ready ? <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
      : notes.length === 0 ? <button onClick={() => input.current?.click()} className="flex flex-col items-center rounded-2xl border-2 border-dashed border-base-300 px-6 py-14 text-center transition-colors hover:border-primary/40 hover:bg-base-200/40">
        <span className="grid size-12 place-items-center rounded-xl bg-secondary text-secondary-content"><NotebookText size={22} /></span>
        <p className="font-display mt-4 text-lg font-semibold">Add your study notes</p>
        <p className="mt-1 max-w-sm text-sm leading-6 text-base-content/60">PDFs, text and Markdown are read on this device. {provider ? "Photos of handwritten notes are transcribed by your AI model." : "Set up an AI model to also add photos of handwritten notes."}</p>
        <span className="btn btn-primary btn-sm mt-5"><Upload size={15} /> Choose files</span>
      </button>
      : <div className="flex flex-col gap-2">{notes.map((note) => <NoteRow key={note.id} note={note} />)}</div>}

    <p className="flex items-start gap-2 text-xs leading-5 text-base-content/50">
      <Lock size={13} className="mt-0.5 shrink-0" />
      Notes are stored and searched only on this device. When you ask the assistant something, the passages it uses are sent to the AI model you chose{provider?.kind === "ollama" ? " (Ollama, which runs on your own computer or network)" : ""}.
    </p>
    {pasting && <PasteNotes onClose={() => setPasting(false)} />}
  </div>;
}
