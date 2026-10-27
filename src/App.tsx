import { Suspense, lazy, useState } from "react";
import type { ReactNode } from "react";
import { FileUp, Library, Monitor, Moon, PanelLeftClose, Plus, Settings, Sun, Volume2, VolumeX } from "lucide-react";
import { useFileDrop } from "./lib/drop";
import { useLibrary } from "./lib/library";
import { navigate, paths, useRoute, type Route } from "./lib/router";
import { useSettings, type Settings as SettingsType } from "./lib/settings";
import { useSound } from "./lib/sound";
import { isMod, useAppActions, useShortcut } from "./ui/AppActions";
import { LessonCover } from "./ui/LessonCover";
import { Logo, LogoMark } from "./ui/Logo";
import LibraryPage from "./pages/LibraryPage";

const LessonPage = lazy(() => import("./pages/LessonPage"));
const EditorPage = lazy(() => import("./pages/EditorPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

const THEME_CYCLE: SettingsType["theme"][] = ["system", "light", "dark"];
const THEME_ICON = { system: Monitor, light: Sun, dark: Moon };

function NavItem({ href, icon: Icon, label, active, collapsed, badge }: { href: string; icon: typeof Library; label: string; active: boolean; collapsed: boolean; badge?: number }) {
  const play = useSound();
  return <a href={href} onClick={() => play("tap")} aria-current={active ? "page" : undefined} title={collapsed ? label : undefined} aria-label={label}
    className={`press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${collapsed ? "justify-center" : ""} ${active ? "bg-primary/10 text-primary" : "text-base-content/70 hover:bg-base-300/50 hover:text-base-content"}`}>
    <Icon size={19} className="shrink-0" />
    {!collapsed && <span className="flex-1">{label}</span>}
    {!collapsed && badge ? <span className="text-xs tabular-nums text-base-content/45">{badge}</span> : null}
  </a>;
}

function QuickToggles({ vertical }: { vertical: boolean }) {
  const { settings, update } = useSettings();
  const play = useSound();
  const ThemeIcon = THEME_ICON[settings.theme];
  const nextTheme = THEME_CYCLE[(THEME_CYCLE.indexOf(settings.theme) + 1) % THEME_CYCLE.length];
  return <div className={`flex gap-1 ${vertical ? "flex-col items-center" : ""}`}>
    <button className="btn btn-ghost btn-sm btn-square press" title={`Theme: ${settings.theme}`} aria-label={`Theme: ${settings.theme}. Switch to ${nextTheme}.`}
      onClick={() => { update({ theme: nextTheme }); play("toggle"); }}><ThemeIcon size={17} /></button>
    <button className="btn btn-ghost btn-sm btn-square press" title={settings.sound ? "Sound on" : "Sound off"} aria-label={settings.sound ? "Mute sound effects" : "Turn on sound effects"} aria-pressed={settings.sound}
      onClick={() => { update({ sound: !settings.sound }); if (!settings.sound) setTimeout(() => play("toggle"), 0); }}>{settings.sound ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
  </div>;
}

function Sidebar({ route }: { route: Route }) {
  const { settings, update } = useSettings();
  const { lessons } = useLibrary();
  const { openNewLesson, openImport } = useAppActions();
  const collapsed = settings.sidebarCollapsed;
  const recent = lessons.filter((lesson) => lesson.openedAt).sort((a, b) => b.openedAt! - a.openedAt!).slice(0, 4);
  const activeKey = route.name === "lesson" ? route.key : undefined;

  return <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-base-300/80 bg-base-200/60 transition-[width] duration-300 ease-out lg:flex ${collapsed ? "w-[76px]" : "w-[264px]"}`}>
    <div className={`flex h-16 items-center ${collapsed ? "justify-center" : "justify-between px-5"}`}>
      {collapsed
        ? <button className="press rounded-xl" aria-label="Expand sidebar" title="Expand sidebar (Ctrl+B)" onClick={() => update({ sidebarCollapsed: false })}><LogoMark size={34} /></button>
        : <a href={paths.library} aria-label="Curie library"><Logo /></a>}
      {!collapsed && <button className="btn btn-ghost btn-sm btn-square" aria-label="Collapse sidebar" title="Collapse sidebar (Ctrl+B)" onClick={() => update({ sidebarCollapsed: true })}><PanelLeftClose size={18} /></button>}
    </div>
    <div className={`flex flex-1 flex-col gap-6 overflow-y-auto overflow-x-hidden scroll-thin pb-4 ${collapsed ? "px-3" : "px-4"}`}>
      <div className="flex flex-col gap-2 pt-2">
        <button className={`btn btn-primary press shadow-sm ${collapsed ? "btn-square mx-auto" : "justify-start"}`} title={collapsed ? "New lesson" : undefined} onClick={openNewLesson} aria-label="New lesson"><Plus size={18} />{!collapsed && "New lesson"}</button>
        <button className={`btn btn-ghost press ${collapsed ? "btn-square mx-auto" : "justify-start"}`} title={collapsed ? "Import .curie" : undefined} onClick={openImport} aria-label="Import a .curie lesson"><FileUp size={18} />{!collapsed && "Import .curie"}</button>
      </div>
      <nav className="flex flex-col gap-1" aria-label="Main">
        <NavItem href={paths.library} icon={Library} label="Library" active={route.name === "library"} collapsed={collapsed} badge={lessons.length} />
        <NavItem href={paths.settings} icon={Settings} label="Settings" active={route.name === "settings"} collapsed={collapsed} />
      </nav>
      {!collapsed && recent.length > 0 && <div>
        <p className="mb-2 px-3 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-base-content/45">Continue learning</p>
        <div className="flex flex-col gap-1">
          {recent.map((lesson) => <a key={lesson.key} href={paths.lesson(lesson.key)}
            className={`press flex items-center gap-3 rounded-xl p-2 text-sm transition-colors ${activeKey === lesson.key ? "bg-base-300/70" : "hover:bg-base-300/50"}`}>
            <LessonCover seed={lesson.manifest.id} title={lesson.manifest.title} className="size-9 shrink-0 rounded-lg [&_span]:bottom-0 [&_span]:left-1.5 [&_span]:text-xl" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{lesson.manifest.title}</span>
              <span className="mt-1 block h-1 overflow-hidden rounded-full bg-base-300"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round((lesson.progress ?? 0) * 100)}%` }} /></span>
            </span>
          </a>)}
        </div>
      </div>}
    </div>
    <div className={`flex items-center border-t border-base-300/80 py-3 ${collapsed ? "flex-col gap-2 px-3" : "justify-between px-4"}`}>
      <QuickToggles vertical={collapsed} />
      {!collapsed && <span className="text-xs text-base-content/40">v0.2</span>}
    </div>
  </aside>;
}

function MobileNav({ route }: { route: Route }) {
  const { openNewLesson } = useAppActions();
  const play = useSound();
  const item = (active: boolean) => `press flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.7rem] font-medium ${active ? "text-primary" : "text-base-content/60"}`;
  return <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-base-300 bg-base-100/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden">
    <div className="mx-auto flex max-w-md items-center px-4">
      <a href={paths.library} className={item(route.name === "library")} onClick={() => play("tap")}><Library size={21} />Library</a>
      <button className={item(false)} onClick={openNewLesson}><span className="-mt-5 grid size-12 place-items-center rounded-2xl bg-primary text-primary-content shadow-lg shadow-primary/30"><Plus size={22} /></span>Create</button>
      <a href={paths.settings} className={item(route.name === "settings")} onClick={() => play("tap")}><Settings size={21} />Settings</a>
    </div>
  </nav>;
}

function MobileTopBar() {
  const { openImport } = useAppActions();
  return <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-base-300/70 bg-base-100/90 px-4 backdrop-blur-lg lg:hidden">
    <a href={paths.library} aria-label="Curie library"><Logo /></a>
    <div className="flex items-center gap-1">
      <button className="btn btn-ghost btn-sm btn-square" aria-label="Import a .curie lesson" onClick={openImport}><FileUp size={18} /></button>
      <QuickToggles vertical={false} />
    </div>
  </header>;
}

/** Accepts .curie files dropped anywhere outside the editor. */
function DropZone({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [dragging, setDragging] = useState(false);
  const { importFiles, importPaths } = useAppActions();
  useFileDrop(enabled, ({ paths: dropped, files }) => {
    const lessons = dropped.filter((path) => path.toLowerCase().endsWith(".curie"));
    if (lessons.length) void importPaths(lessons);
    else if (files.length) void importFiles(files);
  }, setDragging);
  return <>
    {children}
    {dragging && <div className="animate-fade pointer-events-none fixed inset-0 z-[90] grid place-items-center bg-base-100/70 p-6 backdrop-blur-sm">
      <div className="animate-pop flex flex-col items-center gap-4 rounded-[2rem] border-2 border-dashed border-primary bg-base-100 px-12 py-10 text-center shadow-2xl">
        <LogoMark size={56} animated />
        <p className="font-display text-xl font-bold">Drop to import</p>
        <p className="text-sm text-base-content/60">.curie lesson packages are added to your library</p>
      </div>
    </div>}
  </>;
}

function PageFallback() {
  return <div className="grid min-h-[60vh] place-items-center"><LogoMark size={44} animated /></div>;
}

export default function App() {
  const route = useRoute();
  const { settings, update } = useSettings();
  const { openImport, openNewLesson } = useAppActions();
  const fullscreen = route.name === "editor";

  useShortcut((event) => isMod(event) && event.key.toLowerCase() === "b", (event) => { event.preventDefault(); update({ sidebarCollapsed: !settings.sidebarCollapsed }); });
  useShortcut((event) => isMod(event) && event.key.toLowerCase() === "o", (event) => { event.preventDefault(); openImport(); });
  useShortcut((event) => event.altKey && event.key.toLowerCase() === "n", (event) => { event.preventDefault(); openNewLesson(); });
  useShortcut((event) => isMod(event) && event.key === ",", (event) => { event.preventDefault(); navigate(paths.settings); });

  const page = (() => {
    switch (route.name) {
      case "library": return <LibraryPage />;
      case "lesson": return <LessonPage lessonKey={route.key} />;
      case "editor": return <EditorPage lessonKey={route.key} />;
      case "settings": return <SettingsPage />;
      case "notfound": return <NotFoundPage />;
    }
  })();
  const pageKey = route.name === "lesson" || route.name === "editor" ? `${route.name}:${route.key}` : route.name;

  if (fullscreen) {
    return <Suspense fallback={<PageFallback />}><div key={pageKey} className="animate-fade">{page}</div></Suspense>;
  }

  return <DropZone enabled>
    <div className="flex min-h-screen bg-base-100 text-base-content">
      <Sidebar route={route} />
      <div className="flex min-w-0 flex-1 flex-col pb-20 lg:pb-0">
        {route.name !== "lesson" && <MobileTopBar />}
        <main className="flex-1">
          <Suspense fallback={<PageFallback />}><div key={pageKey} className="animate-page">{page}</div></Suspense>
        </main>
      </div>
      <MobileNav route={route} />
    </div>
  </DropZone>;
}
