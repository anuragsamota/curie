import { useMemo, useRef, useState } from "react";
import { ArrowDownUp, BookOpenCheck, Clock3, Compass, FileWarning, FileUp, LayoutGrid, List, Plus, Search, X } from "lucide-react";
import { useLibrary } from "../lib/library";
import { timeAgo } from "../lib/lesson";
import { navigate, paths } from "../lib/router";
import { useSettings, type Settings } from "../lib/settings";
import { useSound } from "../lib/sound";
import type { LessonSummary } from "../lib/storage";
import { useAppActions, useShortcut } from "../ui/AppActions";
import { useLessonMenu } from "../ui/LessonActions";
import { LessonCover } from "../ui/LessonCover";
import { LogoMark } from "../ui/Logo";
import { Menu } from "../ui/Menu";

const SORTS: Record<Settings["librarySort"], { label: string; compare: (a: LessonSummary, b: LessonSummary) => number }> = {
  recent: { label: "Recently used", compare: (a, b) => Math.max(b.openedAt ?? 0, b.updatedAt) - Math.max(a.openedAt ?? 0, a.updatedAt) },
  created: { label: "Date added", compare: (a, b) => b.createdAt - a.createdAt },
  title: { label: "Title", compare: (a, b) => a.manifest.title.localeCompare(b.manifest.title) },
};

function Progress({ lesson }: { lesson: LessonSummary }) {
  if (lesson.missing) return <span className="badge badge-sm gap-1 border-0 bg-warning/15 font-semibold text-warning" title={lesson.path}><FileWarning size={12} /> File missing</span>;
  if (lesson.completedAt) return <span className="badge badge-sm gap-1 border-0 bg-success/12 font-semibold text-success"><BookOpenCheck size={12} /> Completed</span>;
  if (!lesson.progress) return <span className="badge badge-sm border-0 bg-secondary/40 font-semibold text-secondary-content dark:bg-secondary/15 dark:text-secondary">New</span>;
  return <span className="flex items-center gap-2 text-xs text-base-content/55">
    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-base-300"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(lesson.progress * 100)}%` }} /></span>
    {Math.round(lesson.progress * 100)}%
  </span>;
}

function Meta({ lesson }: { lesson: LessonSummary }) {
  return <span className="flex items-center gap-1.5 text-xs text-base-content/50">
    <Clock3 size={12} /> {lesson.minutes} min · {lesson.openedAt ? `opened ${timeAgo(lesson.openedAt)}` : `added ${timeAgo(lesson.createdAt)}`}
  </span>;
}

function LessonCard({ lesson, index, view }: { lesson: LessonSummary; index: number; view: Settings["libraryView"] }) {
  const menu = useLessonMenu();
  const play = useSound();
  const open = () => { play("open"); navigate(paths.lesson(lesson.key)); };
  const style = { animationDelay: `${Math.min(index, 12) * 40}ms` };

  if (view === "list") {
    return <div style={style} role="link" tabIndex={0} onClick={open} onKeyDown={(event) => event.key === "Enter" && event.target === event.currentTarget && open()}
      className="animate-rise group flex cursor-pointer items-center gap-4 rounded-2xl border border-transparent p-2.5 transition-colors hover:border-base-300 hover:bg-base-200/50">
      <LessonCover seed={lesson.manifest.id} title={lesson.manifest.title} image={lesson.cover} className="h-14 w-20 shrink-0 rounded-xl [&_span]:bottom-0.5 [&_span]:left-2 [&_span]:text-3xl" />
      <div className="min-w-0 flex-1">
        <p className="font-display truncate font-semibold">{lesson.manifest.title}</p>
        <p className="truncate text-sm text-base-content/60">{lesson.manifest.description || lesson.manifest.author || "No description"}</p>
      </div>
      <div className="hidden w-48 flex-col items-end gap-1.5 sm:flex"><Progress lesson={lesson} /><Meta lesson={lesson} /></div>
      <Menu items={menu(lesson, "library")} label={`Actions for ${lesson.manifest.title}`} />
    </div>;
  }

  return <div style={style} role="link" tabIndex={0} onClick={open} onKeyDown={(event) => event.key === "Enter" && event.target === event.currentTarget && open()}
    className="animate-rise lift group flex cursor-pointer flex-col rounded-3xl border border-base-300 bg-base-100">
    <div className="relative">
      <LessonCover seed={lesson.manifest.id} title={lesson.manifest.title} image={lesson.cover} className="h-36 rounded-t-3xl" />
      <div className="absolute right-2 top-2 rounded-xl bg-black/20 text-white backdrop-blur-sm transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        <Menu items={menu(lesson, "library")} label={`Actions for ${lesson.manifest.title}`} />
      </div>
    </div>
    <div className="flex flex-1 flex-col gap-2 p-4 pt-3.5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display line-clamp-2 text-lg font-bold leading-snug">{lesson.manifest.title}</h3>
      </div>
      <p className="line-clamp-2 text-sm leading-6 text-base-content/60">{lesson.manifest.description || (lesson.manifest.author ? `By ${lesson.manifest.author}` : "No description yet.")}</p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2"><Meta lesson={lesson} /><Progress lesson={lesson} /></div>
    </div>
  </div>;
}

function EmptyLibrary() {
  const { openNewLesson, openImport } = useAppActions();
  return <div className="flex flex-col items-center px-4 py-14 text-center sm:py-24">
    <div className="relative mb-8 grid size-44 place-items-center">
      <div className="absolute inset-0 rounded-full bg-secondary/25 blur-3xl" />
      <svg viewBox="0 0 160 160" className="animate-orbit absolute inset-0 text-primary/30" aria-hidden="true">
        <ellipse cx="80" cy="80" rx="74" ry="28" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <ellipse cx="80" cy="80" rx="74" ry="28" fill="none" stroke="currentColor" strokeWidth="1.5" transform="rotate(60 80 80)" />
        <ellipse cx="80" cy="80" rx="74" ry="28" fill="none" stroke="currentColor" strokeWidth="1.5" transform="rotate(120 80 80)" />
        <circle cx="154" cy="80" r="5" className="fill-accent" />
      </svg>
      <div className="animate-float"><LogoMark size={72} animated /></div>
    </div>
    <h2 className="font-display text-3xl font-bold tracking-tight">No lessons yet</h2>
    <p className="mt-3 max-w-md leading-7 text-base-content/65">Create your first interactive lesson, or import a <code className="rounded bg-base-200 px-1.5 py-0.5 text-sm">.curie</code> package someone shared with you.</p>
    <div className="mt-7 flex flex-wrap justify-center gap-3">
      <button className="btn btn-primary btn-lg press" onClick={openNewLesson}><Plus size={20} /> New lesson</button>
      <button className="btn btn-outline btn-lg press" onClick={openImport}><FileUp size={20} /> Import .curie</button>
    </div>
    <a className="btn btn-link btn-sm mt-4 text-base-content/60" href={paths.explore}><Compass size={15} /> Or explore lessons to download</a>
    <p className="mt-10 hidden text-xs text-base-content/40 sm:block">Tip: drag a .curie file anywhere onto this window to import it.</p>
  </div>;
}

export default function LibraryPage() {
  const { lessons, ready } = useLibrary();
  const { settings, update } = useSettings();
  const play = useSound();
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  useShortcut((event) => event.key === "/", (event) => { event.preventDefault(); search.current?.focus(); });

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? lessons.filter((lesson) => [lesson.manifest.title, lesson.manifest.description ?? "", lesson.manifest.author ?? "", lesson.searchText].join(" ").toLowerCase().includes(needle))
      : lessons;
    return [...matches].sort(SORTS[settings.librarySort].compare);
  }, [lessons, query, settings.librarySort]);

  if (ready && lessons.length === 0) return <EmptyLibrary />;

  return <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 lg:py-10">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Library</h1>
        <p className="mt-1 text-sm text-base-content/55">{lessons.length} {lessons.length === 1 ? "lesson" : "lessons"} saved on this device</p>
      </div>
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <label className="input input-sm flex-1 sm:w-64 sm:flex-none">
          <Search size={15} className="opacity-50" />
          <input ref={search} type="search" placeholder="Search lessons" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search lessons" />
          {query ? <button aria-label="Clear search" onClick={() => setQuery("")}><X size={14} /></button> : <kbd className="kbd kbd-xs">/</kbd>}
        </label>
        <Menu label="Sort lessons" trigger={<span className="btn btn-sm btn-ghost gap-1.5"><ArrowDownUp size={15} /><span className="hidden md:inline">{SORTS[settings.librarySort].label}</span></span>}
          items={Object.entries(SORTS).map(([key, sort]) => ({ label: sort.label, hint: key === settings.librarySort ? "✓" : undefined, onSelect: () => update({ librarySort: key as Settings["librarySort"] }) }))} />
        <div className="join" role="group" aria-label="View">
          {(["grid", "list"] as const).map((view) => <button key={view} aria-pressed={settings.libraryView === view} aria-label={`${view} view`}
            className={`btn btn-sm join-item btn-square ${settings.libraryView === view ? "btn-active" : "btn-ghost"}`}
            onClick={() => { update({ libraryView: view }); play("tap"); }}>{view === "grid" ? <LayoutGrid size={15} /> : <List size={16} />}</button>)}
        </div>
      </div>
    </div>

    {!ready ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-64 rounded-3xl" />)}</div>
      : visible.length === 0 ? <div className="animate-fade py-20 text-center text-base-content/60">
        <Search className="mx-auto mb-3 opacity-40" size={32} />
        <p className="font-medium">No lessons match “{query}”.</p>
        <button className="btn btn-ghost btn-sm mt-3" onClick={() => setQuery("")}>Clear search</button>
      </div>
      : settings.libraryView === "grid"
        ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{visible.map((lesson, index) => <LessonCard key={lesson.key} lesson={lesson} index={index} view="grid" />)}</div>
        : <div className="flex flex-col gap-1">{visible.map((lesson, index) => <LessonCard key={lesson.key} lesson={lesson} index={index} view="list" />)}</div>}
  </div>;
}
