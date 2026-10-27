// Lesson sources: public GitHub repositories whose .curie files can be browsed and downloaded.
// Browsing only reads the repository's file list; nothing is downloaded until the user asks.

import type { ProgressFn } from "../curie/package";

export type LessonSource = {
  /** Stable key, e.g. `github:owner/repo` (plus `@branch` and `/path` when given). */
  id: string;
  owner: string;
  repo: string;
  /** Branch or tag; the repository's default branch when omitted. */
  ref?: string;
  /** Only list lessons inside this folder. */
  path?: string;
};

export type RemoteLesson = {
  source: string;
  path: string;
  /** Git blob hash; changes whenever the file changes. */
  sha: string;
  size: number;
  title: string;
  description?: string;
  author?: string;
  url: string;
};

export type Catalog = { lessons: RemoteLesson[]; fetchedAt: number };

export const DEFAULT_SOURCES: LessonSource[] = [{ id: "github:anuragsamota/curie-lessons", owner: "anuragsamota", repo: "curie-lessons" }];

/** Optional file a repository can include to give lessons nicer titles and descriptions. */
const INDEX_FILE = "curie-index.json";
type IndexFile = { lessons?: { file: string; title?: string; description?: string; author?: string }[] };

const NAME = /^[A-Za-z0-9_.-]+$/;

export function sourceLabel(source: LessonSource) {
  return `${source.owner}/${source.repo}${source.path ? `/${source.path}` : ""}`;
}

export function sourceUrl(source: LessonSource) {
  return `https://github.com/${source.owner}/${source.repo}${source.ref || source.path ? `/tree/${source.ref ?? "HEAD"}${source.path ? `/${source.path}` : ""}` : ""}`;
}

/**
 * Accepts `owner/repo`, `https://github.com/owner/repo(.git)` or
 * `https://github.com/owner/repo/tree/<branch>/<folder>`. Returns undefined when unrecognised.
 */
export function parseSource(input: string): LessonSource | undefined {
  let text = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  text = text.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "");
  const [owner, repo, kind, ref, ...rest] = text.split("/");
  if (!owner || !repo || !NAME.test(owner) || !NAME.test(repo)) return undefined;
  if (kind !== undefined && (kind !== "tree" || !ref)) return undefined;
  const path = rest.join("/") || undefined;
  const source: LessonSource = { id: "", owner, repo, ...(ref && ref !== "HEAD" ? { ref } : {}), ...(path ? { path } : {}) };
  source.id = `github:${owner}/${repo}${source.ref ? `@${source.ref}` : ""}${path ? `/${path}` : ""}`.toLowerCase();
  return source;
}

const titleFromFile = (path: string) => {
  const name = path.split("/").pop()!.replace(/\.curie$/i, "").replace(/[-_]+/g, " ").trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
};

async function github(url: string) {
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  } catch {
    throw new Error("Couldn't reach GitHub. Check your internet connection.");
  }
  if (response.status === 404) throw new Error("Repository not found. It may be private, renamed or deleted.");
  if ((response.status === 403 || response.status === 429) && response.headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(response.headers.get("x-ratelimit-reset")) * 1000;
    throw new Error(`GitHub's limit for anonymous requests was reached. Try again ${reset ? `after ${new Date(reset).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "later"}.`);
  }
  if (!response.ok) throw new Error(`GitHub returned an error (${response.status}).`);
  return response;
}

/** Lists every .curie file in a source (one request, plus one for the optional index file). */
export async function fetchCatalog(source: LessonSource): Promise<Catalog> {
  const ref = source.ref ?? "HEAD";
  const response = await github(`https://api.github.com/repos/${source.owner}/${source.repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
  const tree = (await response.json()) as { tree?: { path: string; type: string; sha: string; size?: number }[] };
  const prefix = source.path ? `${source.path}/` : "";
  const files = (tree.tree ?? []).filter((item) => item.type === "blob" && item.path.startsWith(prefix));
  const raw = (path: string) => `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${encodeURIComponent(ref)}/${path.split("/").map(encodeURIComponent).join("/")}`;

  let index: IndexFile = {};
  if (files.some((item) => item.path === `${prefix}${INDEX_FILE}`)) {
    try { index = (await (await fetch(raw(`${prefix}${INDEX_FILE}`))).json()) as IndexFile; } catch { /* titles fall back to file names */ }
  }
  const details = new Map((index.lessons ?? []).map((entry) => [`${prefix}${entry.file}`, entry]));

  const lessons = files.filter((item) => item.path.toLowerCase().endsWith(".curie")).map((item): RemoteLesson => {
    const entry = details.get(item.path);
    return {
      source: source.id, path: item.path, sha: item.sha, size: item.size ?? 0, url: raw(item.path),
      title: entry?.title || titleFromFile(item.path), description: entry?.description, author: entry?.author,
    };
  });
  return { lessons: lessons.sort((a, b) => a.title.localeCompare(b.title)), fetchedAt: Date.now() };
}

/** Downloads a lesson file, reporting progress as it streams in. */
export async function downloadLesson(lesson: RemoteLesson, onProgress?: ProgressFn): Promise<File> {
  let response: Response;
  try {
    response = await fetch(lesson.url);
  } catch {
    throw new Error("Couldn't download the lesson. Check your internet connection.");
  }
  if (!response.ok) throw new Error(`The download failed (${response.status}).`);
  const name = lesson.path.split("/").pop()!;
  const total = Number(response.headers.get("content-length")) || lesson.size;
  if (!response.body || !total) return new File([await response.blob()], name);
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array<ArrayBuffer>);
    received += value.byteLength;
    onProgress?.(Math.min(1, received / total));
  }
  return new File(chunks, name);
}

// ── Catalog cache ─────────────────────────────────────────────────────────
// File lists are cached per source so revisiting Explore doesn't spend GitHub's hourly request limit.

const CACHE_KEY = "curie-catalogs";
export const CATALOG_MAX_AGE = 30 * 60 * 1000;

export function readCatalogCache(): Record<string, Catalog> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") as Record<string, Catalog>; } catch { return {}; }
}

export function writeCatalogCache(catalogs: Record<string, Catalog>) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(catalogs)); } catch { /* cache only */ }
}
