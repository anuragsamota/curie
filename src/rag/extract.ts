// Turns uploaded notes into plain text. Text and Markdown are read directly, PDFs locally with pdf.js
// (nothing leaves the device), and photos of notes are transcribed by the configured AI model.

import type { PageText } from "./chunk";

export type NoteKind = "pdf" | "text" | "image";

const TEXT_EXTENSIONS = ["txt", "md", "markdown", "csv", "tex", "json", "html", "htm"];
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"];
export const NOTE_ACCEPT = [...TEXT_EXTENSIONS, "pdf", ...IMAGE_EXTENSIONS].map((ext) => `.${ext}`).join(",");

export function noteKind(file: File): NoteKind | undefined {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf" || file.type === "application/pdf") return "pdf";
  if (IMAGE_EXTENSIONS.includes(ext) || file.type.startsWith("image/")) return "image";
  if (TEXT_EXTENSIONS.includes(ext) || file.type.startsWith("text/")) return "text";
  return undefined;
}

export async function extractText(file: File): Promise<PageText[]> {
  const text = await file.text();
  // HTML notes keep their words, not their markup.
  if (/\.html?$/i.test(file.name)) return [{ text: new DOMParser().parseFromString(text, "text/html").body.textContent ?? "" }];
  return [{ text }];
}

export async function extractPdf(file: File, onProgress?: (fraction: number) => void): Promise<PageText[]> {
  // The legacy build carries polyfills for older Android WebViews and WebKitGTK.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await task.promise;
  try {
    const pages: PageText[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const text = content.items.map((item) => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("")
        .replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim();
      pages.push({ text, page: number });
      onProgress?.(number / pdf.numPages);
    }
    return pages;
  } finally {
    void task.destroy();
  }
}

/** Shrinks a photo to at most 2000px on its long edge as JPEG, which keeps uploads small and models happy. */
export async function prepareImage(file: File): Promise<{ mediaType: string; data: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.86);
  return { mediaType: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) };
}

export const TRANSCRIBE_PROMPT = "Transcribe these notes into clean Markdown. Keep every piece of content: headings, lists, tables, diagrams' labels, and formulas (as LaTeX in $...$). Fix obvious handwriting slips, but do not add, summarize or explain anything that isn't on the page. Reply with the transcription only.";
