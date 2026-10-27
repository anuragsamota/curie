import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowUp, BookOpenCheck, Clock3, FileWarning, Layers, ListTree, PenLine, Sparkles, Trophy, X } from "lucide-react";
import BlockRenderer, { LessonRuntimeProvider } from "../components/BlockRenderer";
import { useLessonContent, useLibrary } from "../lib/library";
import { flattenBlocks, lessonOutline, readingMinutes, type OutlineItem } from "../lib/lesson";
import { navigate, paths } from "../lib/router";
import { useSettings } from "../lib/settings";
import { useSound } from "../lib/sound";
import { Confetti } from "../ui/Confetti";
import { useLessonMenu } from "../ui/LessonActions";
import { Menu } from "../ui/Menu";
import { useToast } from "../ui/Toasts";
import NotFoundPage from "./NotFoundPage";

/**
 * The sticky lesson header. It owns the scroll-progress state so scrolling re-renders only this bar,
 * not the whole lesson (which caused visible flicker in WebKit-based webviews).
 */
function ReadingBar({ title, onProgress, children }: { title: string; onProgress: (progress: number) => void; children: ReactNode }) {
  const [progress, setProgress] = useState(0);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const value = max > 0 ? Math.min(1, window.scrollY / max) : 1;
        setProgress(value);
        onProgressRef.current(value);
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, []);
  return <div className="sticky top-0 z-20 border-b border-base-300/60 bg-base-100">
    <div className="flex h-14 items-center gap-2 px-3 sm:px-6">
      <a href={paths.library} className="btn btn-ghost btn-sm gap-1.5 press"><ArrowLeft size={16} /><span className="hidden sm:inline">Library</span></a>
      <p className={`font-display min-w-0 flex-1 truncate text-center font-semibold transition-opacity duration-300 sm:text-left ${progress > 0.06 ? "opacity-100" : "opacity-0"}`}>{title}</p>
      {children}
    </div>
    <div className="h-[3px]"><div className="h-full origin-left bg-gradient-to-r from-primary to-secondary will-change-transform" style={{ transform: `scaleX(${progress})` }} /></div>
  </div>;
}

/** Tracks which outline target is currently at the top of the viewport. */
function useActiveBlock(ids: string[]) {
  const [active, setActive] = useState<string>();
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActive(visible[0].target.id.replace(/^block-/, ""));
    }, { rootMargin: "-80px 0px -65% 0px" });
    for (const id of ids) {
      const element = document.getElementById(`block-${id}`);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

function Outline({ items, active, onNavigate }: { items: OutlineItem[]; active?: string; onNavigate: (id: string) => void }) {
  if (!items.length) return <p className="px-3 text-sm text-base-content/50">This lesson has no headings yet.</p>;
  return <ol className="flex flex-col gap-0.5">
    {items.map((item, index) => <li key={`${item.id}-${index}`}>
      <button onClick={() => onNavigate(item.id)}
        className={`flex w-full items-start gap-2 rounded-lg px-3 py-1.5 text-left text-sm leading-5 transition-colors ${active === item.id ? "bg-primary/10 font-semibold text-primary" : "text-base-content/65 hover:bg-base-200 hover:text-base-content"}`}
        style={{ paddingLeft: `${0.75 + item.depth * 0.85}rem` }}>
        {item.kind === "quiz" && <Sparkles size={13} className="mt-0.5 shrink-0 text-accent" />}
        <span className="line-clamp-2">{item.label}</span>
      </button>
    </li>)}
  </ol>;
}

export default function LessonPage({ lessonKey }: { lessonKey: string }) {
  const library = useLibrary();
  const lesson = library.get(lessonKey);
  const { content, error: loadError } = useLessonContent(lessonKey);
  const { settings, update, reducedMotion } = useSettings();
  const toast = useToast();
  const play = useSound();
  const menu = useLessonMenu();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [celebrate, setCelebrate] = useState<{ x: number; y: number; id: number }>();
  const endRef = useRef<HTMLDivElement>(null);
  const savedProgress = useRef(0);

  const onError = useCallback((message: string) => toast.error(message, { title: "Lesson content problem" }), [toast]);
  const onQuizAnswered = useCallback((id: string, correct: boolean) => setAnswers((all) => id in all && all[id] ? all : { ...all, [id]: correct }), []);
  const runtime = useMemo(() => ({ onQuizAnswered }), [onQuizAnswered]);

  const doc = content?.document;
  const outline = useMemo(() => doc ? lessonOutline(doc.blocks) : [], [doc]);
  const outlineIds = useMemo(() => [...new Set(outline.map((item) => item.id))], [outline]);
  const active = useActiveBlock(outlineIds);
  const quizCount = useMemo(() => doc ? flattenBlocks(doc.blocks).filter((block) => block.type === "quiz").length : 0, [doc]);
  const correctCount = Object.values(answers).filter(Boolean).length;

  // Record that the lesson was opened (once per visit).
  const touch = library.touch;
  const found = Boolean(lesson && content);
  useEffect(() => {
    if (!found) return;
    savedProgress.current = 0;
    touch(lessonKey, { openedAt: Date.now() });
  }, [found, lessonKey, touch]);

  // Persist the furthest reading position, throttled to meaningful jumps.
  const storedProgress = lesson?.progress ?? 0;
  const onProgress = useCallback((progress: number) => {
    if (!found || progress < storedProgress + 0.05 || progress - savedProgress.current < 0.05) return;
    savedProgress.current = progress;
    touch(lessonKey, { progress: Math.round(progress * 100) / 100 });
  }, [found, storedProgress, lessonKey, touch]);

  // Celebrate reaching the end of the lesson.
  useEffect(() => {
    const element = endRef.current;
    if (!element || !found) return;
    let done = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || done || window.scrollY < 40) return;
      done = true;
      const rect = element.getBoundingClientRect();
      setCelebrate({ x: rect.left + rect.width / 2, y: rect.top + 70, id: Date.now() });
      play("complete");
      touch(lessonKey, { progress: 1, completedAt: Date.now() });
    }, { threshold: 0.6 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [found, lessonKey, play, touch]);

  const goTo = (id: string) => {
    document.getElementById(`block-${id}`)?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    setDrawerOpen(false);
  };

  const skeleton = <div className="mx-auto max-w-3xl px-4 py-16"><div className="skeleton mb-4 h-12 w-2/3" /><div className="skeleton h-64" /></div>;
  if (!library.ready) return skeleton;
  if (!lesson) return <NotFoundPage title="Lesson not found" message="It may have been deleted from this device." />;
  if (loadError) return <div className="flex flex-col items-center px-4 py-24 text-center">
    <div className="mb-5 grid size-16 place-items-center rounded-3xl bg-warning/15 text-warning"><FileWarning size={30} /></div>
    <h1 className="font-display text-2xl font-bold">Couldn't open “{lesson.manifest.title}”</h1>
    <p className="mt-2 max-w-md break-words text-base-content/60">{loadError}</p>
    <div className="mt-6 flex flex-wrap justify-center gap-2">
      <a href={paths.library} className="btn btn-ghost press"><ArrowLeft size={16} /> Back to library</a>
      <Menu items={menu(lesson, "lesson")} label="Lesson actions" trigger={<span className="btn btn-primary">Fix…</span>} align="start" />
    </div>
  </div>;
  if (!content) return skeleton;

  const { manifest, document: lessonDoc } = content;
  const outlineOpen = settings.outlineOpen;

  return <LessonRuntimeProvider value={runtime}>
    <ReadingBar title={manifest.title} onProgress={onProgress}>
      <button className="btn btn-ghost btn-sm btn-square xl:hidden" aria-label="Show outline" onClick={() => setDrawerOpen(true)}><ListTree size={18} /></button>
      <button className={`btn btn-sm btn-square hidden xl:inline-flex ${outlineOpen ? "btn-active" : "btn-ghost"}`} aria-pressed={outlineOpen} aria-label="Toggle outline panel" title="Toggle outline"
        onClick={() => { update({ outlineOpen: !outlineOpen }); play("toggle"); }}><ListTree size={18} /></button>
      <button className="btn btn-ghost btn-sm gap-1.5 press" onClick={() => navigate(paths.editor(lesson.key))}><PenLine size={16} /><span className="hidden sm:inline">Edit</span></button>
      <Menu items={menu(lesson, "lesson")} label="Lesson actions" />
    </ReadingBar>

    <div className="flex justify-center gap-10 px-4 sm:px-8">
      <article className="w-full max-w-3xl min-w-0 py-8 lg:py-12">
        <header className="mb-10">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-medium text-base-content/55">
            <span className="flex items-center gap-1 rounded-full bg-base-200 px-2.5 py-1"><Clock3 size={13} /> {readingMinutes(lessonDoc)} min</span>
            <span className="flex items-center gap-1 rounded-full bg-base-200 px-2.5 py-1"><Layers size={13} /> {flattenBlocks(lessonDoc.blocks).length} blocks</span>
            {quizCount > 0 && <span className="flex items-center gap-1 rounded-full bg-base-200 px-2.5 py-1"><Sparkles size={13} /> {quizCount} quick {quizCount === 1 ? "check" : "checks"}</span>}
            {lesson.completedAt && <span className="flex items-center gap-1 rounded-full bg-success/12 px-2.5 py-1 text-success"><BookOpenCheck size={13} /> Completed</span>}
          </div>
          <h1 className="font-display text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl">{manifest.title}</h1>
          {manifest.description && <p className="mt-4 text-lg leading-8 text-base-content/65">{manifest.description}</p>}
          {manifest.author && <p className="mt-5 flex items-center gap-2.5 text-sm">
            <span className="grid size-8 place-items-center rounded-full bg-primary/12 font-bold text-primary">{manifest.author.charAt(0).toUpperCase()}</span>
            <span className="font-medium">{manifest.author}</span>
          </p>}
        </header>

        {lessonDoc.blocks.length === 0
          ? <div className="rounded-3xl border border-dashed border-base-300 p-10 text-center text-base-content/60">This lesson is empty. <button className="link link-primary" onClick={() => navigate(paths.editor(lesson.key))}>Add some blocks</button>.</div>
          : <div className="space-y-7">{lessonDoc.blocks.map((node) => <BlockRenderer key={node.id} node={node} assets={content.assets} onError={onError} />)}</div>}

        <div ref={endRef} className="relative mt-16 rounded-3xl border border-base-300 bg-gradient-to-br from-primary/8 via-base-100 to-secondary/15 p-6 text-center sm:p-10">
          {celebrate && !reducedMotion && <Confetti key={celebrate.id} x={celebrate.x} y={celebrate.y} />}
          <div className={`mx-auto mb-4 grid size-16 place-items-center rounded-3xl bg-secondary text-secondary-content ${celebrate ? "animate-pop" : ""}`}><Trophy size={30} /></div>
          <h2 className="font-display text-2xl font-bold">Lesson complete!</h2>
          <p className="mx-auto mt-2 max-w-md text-base-content/65">
            {quizCount > 0
              ? `You answered ${correctCount} of ${quizCount} quick ${quizCount === 1 ? "check" : "checks"} correctly${correctCount === quizCount ? ". Perfect score!" : "."}`
              : "Nice work making it to the end."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button className="btn btn-primary press" onClick={() => navigate(paths.library)}>Back to library</button>
            <button className="btn btn-ghost press" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><ArrowUp size={16} /> Review from the top</button>
          </div>
        </div>
      </article>

      <aside className={`sticky top-20 hidden h-[calc(100vh-6rem)] w-60 shrink-0 overflow-y-auto scroll-thin py-12 ${outlineOpen ? "xl:block" : ""}`} aria-label="Lesson outline">
        <p className="mb-3 px-3 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-base-content/45">On this page</p>
        <Outline items={outline} active={active} onNavigate={goTo} />
      </aside>
    </div>

    {/* Portalled so the page-transition wrapper's stacking context can't trap it under the nav. */}
    {drawerOpen && createPortal(<div className="fixed inset-0 z-50 xl:hidden" role="dialog" aria-modal="true" aria-label="Lesson outline">
      <div className="animate-fade absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={() => setDrawerOpen(false)} />
      <div className="absolute inset-y-0 right-0 flex w-80 max-w-[85vw] flex-col bg-base-100 shadow-2xl" style={{ animation: "toast-in 0.35s var(--ease-out-expo) both" }}>
        <div className="flex h-14 items-center justify-between border-b border-base-300 px-4">
          <p className="font-display font-semibold">On this page</p>
          <button className="btn btn-ghost btn-sm btn-square" aria-label="Close outline" onClick={() => setDrawerOpen(false)}><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-2"><Outline items={outline} active={active} onNavigate={goTo} /></div>
      </div>
    </div>, document.body)}
  </LessonRuntimeProvider>;
}
