import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, CloudDownload, Compass, FolderGit2, RefreshCw, Search, Settings2, TriangleAlert, X } from "lucide-react";
import { useLibrary } from "../lib/library";
import { formatBytes, timeAgo } from "../lib/lesson";
import { navigate, paths } from "../lib/router";
import { useSettings } from "../lib/settings";
import { useSound } from "../lib/sound";
import {
  CATALOG_MAX_AGE, fetchCatalog, readCatalogCache, sourceLabel, writeCatalogCache,
  type Catalog, type LessonSource, type RemoteLesson,
} from "../lib/sources";
import { useShortcut } from "../ui/AppActions";
import { LessonCover } from "../ui/LessonCover";

type CatalogState = { catalog?: Catalog; loading: boolean; error?: string };

/** File lists for every source: cached ones are reused, stale or missing ones are fetched. */
function useCatalogs(sources: LessonSource[]) {
  const [states, setStates] = useState<Record<string, CatalogState>>(() =>
    Object.fromEntries(Object.entries(readCatalogCache()).map(([id, catalog]) => [id, { catalog, loading: false }])));
  const statesRef = useRef(states);
  statesRef.current = states;

  const refresh = useCallback(async (source: LessonSource) => {
    setStates((all) => ({ ...all, [source.id]: { ...all[source.id], loading: true, error: undefined } }));
    try {
      const catalog = await fetchCatalog(source);
      setStates((all) => ({ ...all, [source.id]: { catalog, loading: false } }));
      writeCatalogCache({ ...readCatalogCache(), [source.id]: catalog });
    } catch (error) {
      setStates((all) => ({ ...all, [source.id]: { ...all[source.id], loading: false, error: error instanceof Error ? error.message : "Couldn't load this source." } }));
    }
  }, []);

  useEffect(() => {
    for (const source of sources) {
      const current = statesRef.current[source.id];
      if (!current?.catalog || Date.now() - current.catalog.fetchedAt > CATALOG_MAX_AGE) void refresh(source);
    }
  }, [sources, refresh]);

  return { states, refresh };
}

function RemoteCard({ lesson, index }: { lesson: RemoteLesson; index: number }) {
  const library = useLibrary();
  const play = useSound();
  const [busy, setBusy] = useState(false);
  const local = library.downloaded(lesson);
  const outdated = local && local.origin?.sha !== lesson.sha;

  const get = async () => {
    setBusy(true);
    const record = await library.download(lesson);
    setBusy(false);
    if (record) play("success");
  };
  const open = () => { if (local) { play("open"); navigate(paths.lesson(local.key)); } };

  return <div style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }} className="animate-rise flex flex-col rounded-3xl border border-base-300 bg-base-100">
    <div className="relative">
      <LessonCover seed={`${lesson.source}/${lesson.path}`} title={local?.manifest.title ?? lesson.title} image={local?.cover} className="h-32 rounded-t-3xl" />
      {local && <span className="badge badge-sm absolute left-3 top-3 gap-1 border-0 bg-black/35 font-semibold text-white backdrop-blur-sm"><Check size={12} /> In your library</span>}
    </div>
    <div className="flex flex-1 flex-col gap-2 p-4 pt-3.5">
      <h3 className="font-display line-clamp-2 text-lg font-bold leading-snug">{local?.manifest.title ?? lesson.title}</h3>
      <p className="line-clamp-2 text-sm leading-6 text-base-content/60">
        {local?.manifest.description ?? lesson.description ?? (lesson.author ? `By ${lesson.author}` : <span className="font-mono text-xs">{lesson.path}</span>)}
      </p>
      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
        <span className="text-xs text-base-content/50">{formatBytes(lesson.size)}</span>
        <div className="flex gap-1.5">
          {local && <button className="btn btn-sm btn-ghost press" onClick={open}><BookOpen size={15} /> Open</button>}
          {(!local || outdated) && <button className={`btn btn-sm press ${local ? "btn-ghost text-primary" : "btn-primary"}`} disabled={busy} onClick={() => void get()}>
            {busy ? <span className="loading loading-spinner loading-xs" /> : local ? <RefreshCw size={15} /> : <CloudDownload size={15} />}
            {local ? "Update" : "Download"}
          </button>}
        </div>
      </div>
    </div>
  </div>;
}

function SourceSection({ source, state, query, onRefresh }: { source: LessonSource; state?: CatalogState; query: string; onRefresh: () => void }) {
  const lessons = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const all = state?.catalog?.lessons ?? [];
    return needle ? all.filter((lesson) => [lesson.title, lesson.description ?? "", lesson.author ?? "", lesson.path].join(" ").toLowerCase().includes(needle)) : all;
  }, [state, query]);

  return <section className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-base-200 text-base-content/70"><FolderGit2 size={18} /></span>
        <div className="min-w-0">
          <p className="font-display truncate font-bold">{sourceLabel(source)}</p>
          <p className="text-xs text-base-content/50">
            GitHub{source.ref ? ` · ${source.ref}` : ""}
            {state?.catalog && ` · ${state.catalog.lessons.length} ${state.catalog.lessons.length === 1 ? "lesson" : "lessons"} · checked ${timeAgo(state.catalog.fetchedAt)}`}
          </p>
        </div>
      </div>
      <button className="btn btn-ghost btn-sm" disabled={state?.loading} onClick={onRefresh} title="Check for new lessons">
        <RefreshCw size={15} className={state?.loading ? "animate-spin" : ""} /> Refresh
      </button>
    </div>

    {state?.error && <div role="alert" className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm">
      <TriangleAlert size={18} className="mt-0.5 shrink-0 text-warning" />
      <div className="flex-1"><p className="font-semibold">Couldn't load this source</p><p className="text-base-content/70">{state.error}</p></div>
      <button className="btn btn-sm btn-ghost" onClick={onRefresh}>Try again</button>
    </div>}

    {!state?.catalog && state?.loading
      ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-60 rounded-3xl" />)}</div>
      : state?.catalog && (lessons.length
        ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{lessons.map((lesson, index) => <RemoteCard key={lesson.path} lesson={lesson} index={index} />)}</div>
        : <p className="rounded-2xl bg-base-200/60 px-4 py-6 text-center text-sm text-base-content/55">
          {query ? `No lessons here match “${query}”.` : "This repository has no .curie files yet."}
        </p>)}
  </section>;
}

export default function ExplorePage() {
  const { settings } = useSettings();
  const { states, refresh } = useCatalogs(settings.sources);
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  useShortcut((event) => event.key === "/", (event) => { event.preventDefault(); search.current?.focus(); });

  return <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 lg:py-10">
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Explore</h1>
        <p className="mt-1 max-w-xl text-sm text-base-content/55">Lessons shared in your lesson sources. Nothing is downloaded until you choose a lesson, and deleting it later only removes your copy.</p>
      </div>
      <div className="flex w-full items-center gap-2 sm:w-auto">
        {settings.sources.length > 0 && <label className="input input-sm flex-1 sm:w-64 sm:flex-none">
          <Search size={15} className="opacity-50" />
          <input ref={search} type="search" placeholder="Search lessons" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search shared lessons" />
          {query ? <button aria-label="Clear search" onClick={() => setQuery("")}><X size={14} /></button> : <kbd className="kbd kbd-xs">/</kbd>}
        </label>}
        <a href={`${paths.settings}`} onClick={() => setTimeout(() => document.getElementById("sources")?.scrollIntoView(), 120)} className="btn btn-sm btn-ghost gap-1.5"><Settings2 size={15} /> Sources</a>
      </div>
    </div>

    {settings.sources.length === 0
      ? <div className="flex flex-col items-center px-4 py-16 text-center">
        <span className="mb-5 grid size-16 place-items-center rounded-3xl bg-secondary/25 text-primary"><Compass size={30} /></span>
        <h2 className="font-display text-2xl font-bold">No lesson sources</h2>
        <p className="mt-2 max-w-md text-base-content/60">Add a GitHub repository that contains .curie files to browse its lessons here.</p>
        <a href={paths.settings} onClick={() => setTimeout(() => document.getElementById("sources")?.scrollIntoView(), 120)} className="btn btn-primary mt-6 press">Add a source</a>
      </div>
      : <div className="flex flex-col gap-12">
        {settings.sources.map((source) => <SourceSection key={source.id} source={source} state={states[source.id]} query={query} onRefresh={() => void refresh(source)} />)}
      </div>}
  </div>;
}
