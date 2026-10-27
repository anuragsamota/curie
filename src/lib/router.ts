import { useMemo, useSyncExternalStore } from "react";

// Hash routing keeps the app working from file:// and inside the Tauri webview without server rewrites.

export type Route =
  | { name: "library" }
  | { name: "lesson"; key: string }
  | { name: "editor"; key: string }
  | { name: "explore" }
  | { name: "settings" }
  | { name: "notfound" };

export const paths = {
  library: "#/",
  lesson: (key: string) => `#/lesson/${encodeURIComponent(key)}`,
  editor: (key: string) => `#/edit/${encodeURIComponent(key)}`,
  explore: "#/explore",
  settings: "#/settings",
};

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { name: "library" };
  if (parts[0] === "lesson" && parts[1]) return { name: "lesson", key: parts[1] };
  if (parts[0] === "edit" && parts[1]) return { name: "editor", key: parts[1] };
  if (parts[0] === "explore") return { name: "explore" };
  if (parts[0] === "settings") return { name: "settings" };
  return { name: "notfound" };
}

function subscribe(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return useMemo(() => parseRoute(hash), [hash]);
}

export function navigate(path: string) {
  if (window.location.hash === path) return;
  window.location.hash = path;
  window.scrollTo({ top: 0 });
}
