import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { BookOpen, Check, ChevronDown, CircleHelp, Download, FileUp, FlaskConical, GraduationCap, Menu, Moon, Sun, X } from "lucide-react";
import BlockRenderer from "./components/BlockRenderer";
import { exportCurie, loadCurie, type LoadedCurie } from "./curie/package";
import { sampleDocument, sampleManifest } from "./curie/sample";
import type { CurieDocument, CurieManifest } from "./curie/types";

type LessonState = { manifest: CurieManifest; document: CurieDocument; zip?: LoadedCurie["zip"] };

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("curie-theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [lesson, setLesson] = useState<LessonState>({ manifest: sampleManifest, document: sampleDocument });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("curie-theme", theme);
  }, [theme]);

  const reportError = useCallback((message: string) => setError(message), []);
  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(""); setNotice("");
    try {
      const loaded = await loadCurie(file);
      setLesson({ manifest: loaded.manifest, document: loaded.document, zip: loaded.zip });
      setNotice(`Imported “${loaded.manifest.title}”.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not import this lesson.");
    } finally {
      event.target.value = "";
    }
  }

  async function handleExport() {
    setError(""); setNotice("");
    try {
      const blob = await exportCurie(lesson.manifest, lesson.document, lesson.zip);
      const safeName = lesson.manifest.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lesson";
      downloadBlob(blob, `${safeName}.curie`);
      setNotice("Exported lesson package.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not export this lesson.");
    }
  }

  return (
    <div className="min-h-screen bg-base-100 text-base-content">
      <header className="sticky top-0 z-30 border-b border-base-300/70 bg-base-100/95 backdrop-blur">
        <div className="navbar mx-auto min-h-16 max-w-7xl px-4 sm:px-6">
          <div className="navbar-start gap-2">
            <button className="btn btn-ghost btn-square lg:hidden" aria-label="Open navigation" onClick={() => setSidebarOpen(!sidebarOpen)}><Menu size={20} /></button>
            <a className="flex items-center gap-2 no-underline" href="#" aria-label="Curie home">
              <span className="grid size-9 place-items-center rounded-xl bg-[#d9f99d] text-[#183b2b]"><FlaskConical size={20} strokeWidth={2.4} /></span>
              <span className="text-xl font-extrabold tracking-tight">curie<span className="text-primary">.</span></span>
            </a>
          </div>
          <div className="navbar-center hidden md:flex">
            <div className="flex items-center gap-1 rounded-full bg-base-200 p-1 text-sm font-medium">
              <button className="btn btn-sm rounded-full border-0 bg-base-100 shadow-sm">Learn</button>
              <button className="btn btn-sm btn-ghost rounded-full" onClick={() => setNotice("Lesson editor is planned for a later milestone.")}>Create</button>
              <button className="btn btn-sm btn-ghost rounded-full" onClick={() => setNotice("Your lesson library will be added after the package runtime milestone.")}>Library</button>
            </div>
          </div>
          <div className="navbar-end gap-2">
            <input ref={fileInput} type="file" accept=".curie,application/zip" className="hidden" onChange={handleImport} />
            <button className="btn btn-ghost btn-sm hidden sm:inline-flex" onClick={() => fileInput.current?.click()}><FileUp size={16} /> Import</button>
            <button className="btn btn-primary btn-sm hidden sm:inline-flex" onClick={handleExport}><Download size={16} /> Export lesson</button>
            <button className="btn btn-ghost btn-square btn-sm" aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`} onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className={`${sidebarOpen ? "block" : "hidden"} border-b border-base-300 px-4 py-6 lg:sticky lg:top-16 lg:block lg:h-[calc(100vh-4rem)] lg:border-b-0 lg:border-r lg:px-5`}>
          <div className="mb-7 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-base-content/45">Your learning space</p>
              <p className="mt-1 font-semibold">Foundations</p>
            </div>
            <button className="btn btn-ghost btn-square btn-xs lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"><X size={16} /></button>
          </div>
          <div className="space-y-1">
            <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-base-content/40">Explore</div>
            <button className="flex w-full items-center gap-3 rounded-xl bg-primary/10 px-3 py-2.5 text-left text-sm font-semibold text-primary"><BookOpen size={17} /> Getting started</button>
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-base-content/65 hover:bg-base-200"><GraduationCap size={17} /> Mathematics</button>
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-base-content/65 hover:bg-base-200"><FlaskConical size={17} /> Science</button>
          </div>
          <div className="mt-9 rounded-2xl bg-base-200/70 p-4">
            <div className="mb-2 flex size-9 items-center justify-center rounded-xl bg-[#d9f99d] text-[#183b2b]"><CircleHelp size={18} /></div>
            <p className="text-sm font-bold">Learning, your way</p>
            <p className="mt-1 text-xs leading-5 text-base-content/60">Portable lessons you can learn from, share, and take with you.</p>
          </div>
          <div className="mt-8 text-xs text-base-content/40">Curie Preview · 0.1.0</div>
        </aside>

        <main className="min-w-0 px-4 py-7 sm:px-8 lg:px-12 lg:py-10">
          <div className="mx-auto max-w-3xl">
            <div className="mb-7 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.13em] text-base-content/45">
              <span>Foundations</span><ChevronDown size={13} /><span className="text-primary">Mathematics</span>
            </div>
            <div className="mb-8">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="badge badge-primary badge-outline">STARTER LESSON</span>
                <span className="text-xs text-base-content/50">About 5 min</span>
              </div>
              <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">{lesson.manifest.title}</h1>
              {lesson.manifest.description && <p className="mt-4 max-w-2xl text-lg leading-8 text-base-content/65">{lesson.manifest.description}</p>}
              <div className="mt-6 flex items-center gap-3 border-b border-base-300 pb-6">
                <div className="avatar placeholder"><div className="size-9 rounded-full bg-primary/15 text-sm font-bold text-primary"><span>{(lesson.manifest.author || "C").slice(0, 1).toUpperCase()}</span></div></div>
                <div><p className="text-sm font-semibold">{lesson.manifest.author || "Curie author"}</p><p className="text-xs text-base-content/50">Learning path · Foundations</p></div>
                <div className="ml-auto flex items-center gap-1 text-xs text-base-content/50"><Check size={14} /> Ready to explore</div>
              </div>
            </div>

            {error && <div role="alert" className="alert alert-error mb-5"><span>{error}</span><button className="btn btn-ghost btn-xs" onClick={() => setError("")}>Dismiss</button></div>}
            {notice && <div role="status" className="alert mb-5 border border-success/20 bg-success/10 text-sm"><Check size={17} /><span>{notice}</span><button className="btn btn-ghost btn-xs ml-auto" onClick={() => setNotice("")}>Dismiss</button></div>}

            <article className="lesson-content">
              {lesson.document.blocks.map((node) => <div key={node.id} className="mb-7"><BlockRenderer node={node} zip={lesson.zip} onError={reportError} /></div>)}
            </article>

            <div className="mt-12 rounded-2xl border border-base-300 bg-base-200/40 p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Check size={20} /></div>
                <div className="flex-1">
                  <h2 className="font-bold">That’s a first step.</h2>
                  <p className="mt-1 text-sm leading-6 text-base-content/65">Curie lessons are portable packages. This preview can load and render a basic lesson file; the next milestone will preserve packaged assets during export and add lesson editing.</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button className="btn btn-primary btn-sm" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Review lesson</button>
                    <button className="btn btn-outline btn-sm" onClick={() => fileInput.current?.click()}><FileUp size={15} /> Import a lesson</button>
                  </div>
                </div>
              </div>
            </div>
            <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-base-300 pt-5 text-xs text-base-content/45">
              <span>© Curie · Built for curious minds</span>
              <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-success" /> Local preview</span>
            </footer>
          </div>
        </main>
      </div>
      <div className="fixed bottom-4 right-4 z-20 sm:hidden">
        <div className="join shadow-lg">
          <button className="btn btn-neutral join-item" onClick={() => fileInput.current?.click()} aria-label="Import lesson"><FileUp size={17} /></button>
          <button className="btn btn-primary join-item" onClick={handleExport} aria-label="Export lesson"><Download size={17} /></button>
        </div>
      </div>
    </div>
  );
}
