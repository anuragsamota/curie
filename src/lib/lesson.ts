import type { CurieDocument, CurieNode } from "../curie/types";

/** Text a learner reads in a block, used for reading-time estimates and search. */
export function blockText(node: CurieNode): string {
  switch (node.type) {
    case "markdown": case "callout": case "reveal": return node.content;
    case "quiz": return [node.question, ...node.options, node.explanation ?? ""].join(" ");
    case "flashcard": return `${node.front} ${node.back}`;
    case "image": return `${node.alt} ${node.caption ?? ""}`;
    case "video": case "lottie": return `${node.title ?? ""} ${node.caption ?? ""}`;
    case "graph": return node.title ?? "";
    case "slider": return node.label;
    case "section": return node.title ?? "";
    case "divider": return "";
  }
}

export function flattenBlocks(nodes: CurieNode[]): CurieNode[] {
  return nodes.flatMap((node) => node.type === "section" ? [node, ...flattenBlocks(node.children)] : [node]);
}

const INTERACTIVE = new Set(["quiz", "slider", "flashcard", "reveal", "video", "lottie", "graph"]);

export function readingMinutes(document: CurieDocument): number {
  const blocks = flattenBlocks(document.blocks);
  const words = blocks.map(blockText).join(" ").split(/\s+/).filter(Boolean).length;
  const interactions = blocks.filter((block) => INTERACTIVE.has(block.type)).length;
  return Math.max(1, Math.round(words / 200 + interactions * 0.5));
}

export type OutlineItem = { id: string; label: string; depth: number; kind: "heading" | "section" | "quiz" | "media" };

/** Navigable landmarks of a lesson: sections, Markdown headings (h1–h2), and quizzes. */
export function lessonOutline(nodes: CurieNode[], depth = 0): OutlineItem[] {
  return nodes.flatMap((node): OutlineItem[] => {
    if (node.type === "section") {
      return [...(node.title ? [{ id: node.id, label: node.title, depth, kind: "section" as const }] : []), ...lessonOutline(node.children, depth + 1)];
    }
    if (node.type === "markdown") {
      const headings = [...node.content.matchAll(/^(#{1,2})\s+(.+)$/gm)];
      return headings.map((match) => ({ id: node.id, label: match[2].replace(/[*_`$]/g, ""), depth: depth + match[1].length - 1, kind: "heading" as const }));
    }
    if (node.type === "quiz") return [{ id: node.id, label: node.question, depth, kind: "quiz" }];
    return [];
  });
}

export function slugify(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lesson";
}

export function randomId(length = 6): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(length)), (byte) => alphabet[byte % alphabet.length]).join("");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function timeAgo(timestamp: number, now = Date.now()): string {
  const seconds = Math.round((timestamp - now) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
