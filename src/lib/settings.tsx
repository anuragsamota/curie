import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { DEFAULT_SOURCES, type LessonSource } from "./sources";
import { appFolder, native } from "./storage";

export type Settings = {
  theme: "system" | "light" | "dark";
  motion: "system" | "full" | "reduced";
  sound: boolean;
  volume: number;
  textSize: "sm" | "md" | "lg";
  sidebarCollapsed: boolean;
  outlineOpen: boolean;
  editorOutlineOpen: boolean;
  editorInspectorOpen: boolean;
  libraryView: "grid" | "list";
  librarySort: "recent" | "title" | "created";
  confirmDeletes: boolean;
  /** Pre-filled author for new lessons. */
  defaultAuthor: string;
  /** GitHub repositories listed on the Explore page. */
  sources: LessonSource[];
};

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  motion: "system",
  sound: true,
  volume: 0.5,
  textSize: "md",
  sidebarCollapsed: false,
  outlineOpen: true,
  editorOutlineOpen: true,
  editorInspectorOpen: true,
  libraryView: "grid",
  librarySort: "recent",
  confirmDeletes: true,
  defaultAuthor: "",
  sources: DEFAULT_SOURCES,
};

const STORAGE_KEY = "curie-settings";

/** Native: settings.json in the app data folder, next to library.json. */
async function settingsFile() {
  const { join } = await import("@tauri-apps/api/path");
  return join(await appFolder(), "settings.json");
}

async function readNativeSettings(): Promise<Settings> {
  const fs = await import("@tauri-apps/plugin-fs");
  const path = await settingsFile();
  if (!(await fs.exists(path))) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...(JSON.parse(await fs.readTextFile(path)) as Partial<Settings>) };
}

async function writeNativeSettings(settings: Settings) {
  const fs = await import("@tauri-apps/plugin-fs");
  await fs.mkdir(await appFolder(), { recursive: true });
  await fs.writeTextFile(await settingsFile(), JSON.stringify(settings, null, 2));
}

function readSettings(): Settings {
  if (native) return DEFAULT_SETTINGS;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}

type SettingsContextValue = {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
  /** The theme actually applied after resolving "system". */
  mode: "light" | "dark";
  reducedMotion: boolean;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(readSettings);
  // Native settings load asynchronously from disk; hold rendering until then so the theme doesn't flash.
  const [loaded, setLoaded] = useState(!native);
  useEffect(() => {
    if (!native) return;
    void readNativeSettings().then(setSettings).catch(() => undefined).finally(() => setLoaded(true));
  }, []);
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const prefersReduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const mode = settings.theme === "system" ? (prefersDark ? "dark" : "light") : settings.theme;
  const reducedMotion = settings.motion === "system" ? prefersReduced : settings.motion === "reduced";

  useEffect(() => {
    if (!loaded) return;
    if (native) {
      const timer = setTimeout(() => void writeNativeSettings(settings).catch(() => undefined), 300);
      return () => clearTimeout(timer);
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* storage unavailable */ }
  }, [settings, loaded]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", `curie-${mode}`);
    root.setAttribute("data-mode", mode);
    root.setAttribute("data-motion", reducedMotion ? "reduced" : "full");
    root.setAttribute("data-text-size", settings.textSize);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", mode === "dark" ? "#13111f" : "#fdfcfa");
  }, [mode, reducedMotion, settings.textSize]);

  const update = useCallback((patch: Partial<Settings>) => setSettings((current) => ({ ...current, ...patch })), []);
  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);
  const value = useMemo(() => ({ settings, update, reset, mode, reducedMotion }), [settings, update, reset, mode, reducedMotion]);
  return <SettingsContext.Provider value={value}>{loaded ? children : null}</SettingsContext.Provider>;
}

export function useSettings() {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSettings must be used inside SettingsProvider");
  return value;
}
