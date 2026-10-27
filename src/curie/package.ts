import JSZip from "jszip";
import type { ZodError, ZodType, ZodTypeDef } from "zod";
import { isExternalSource, isPackageAssetPath, isSafePackagePath, mimeForPath } from "./assets";
import {
  CurieDocumentSchema, CurieManifestSchema, SUPPORTED_FEATURES,
  type CurieDocument, type CurieManifest, type CurieNode,
} from "./types";

export const MAX_PACKAGE_BYTES = 50 * 1024 * 1024;
export const MAX_EXTRACTED_BYTES = 200 * 1024 * 1024;
export const MAX_FILES = 300;
export const MAX_ASSET_BYTES = 50 * 1024 * 1024;
const MB = 1024 * 1024;

/** Package files other than manifest.json and document.json, keyed by their path (e.g. `assets/plot.svg`). */
export type AssetMap = Record<string, Blob>;
export type LoadedCurie = { manifest: CurieManifest; document: CurieDocument; assets: AssetMap };

/** Archive noise added by common zip tools; never part of a lesson. */
function isIgnoredEntry(path: string): boolean {
  return path.startsWith("__MACOSX/") || path.split("/").pop() === ".DS_Store";
}

function stripDotPrefix(path: string): string {
  return path.replace(/^(\.\/)+/, "");
}

/** Size recorded in the ZIP central directory. JSZip does not expose it publicly. */
function declaredSize(entry: JSZip.JSZipObject): number {
  const size = (entry as unknown as { _data?: { uncompressedSize?: unknown } })._data?.uncompressedSize;
  return typeof size === "number" ? size : 0;
}

/**
 * Maps archive entries to canonical package paths: strips `./` prefixes and a single enclosing
 * folder (e.g. `my-lesson/manifest.json`), and rejects unsafe or ambiguous paths.
 */
function normalizeEntries(entries: JSZip.JSZipObject[]): Map<string, JSZip.JSZipObject> {
  const paths = entries.map((entry) => {
    // JSZip silently resolves `..` segments in `name`; check what the archive actually contains.
    const original = entry.unsafeOriginalName ?? entry.name;
    const path = stripDotPrefix(original);
    if (!isSafePackagePath(path)) throw new Error(`Unsafe file path in lesson package: "${original}".`);
    return path;
  });

  let prefix = "";
  if (!paths.includes("manifest.json")) {
    const roots = new Set(paths.map((path) => path.split("/")[0]));
    const [root] = roots;
    if (roots.size === 1 && paths.includes(`${root}/manifest.json`)) prefix = `${root}/`;
  }

  const result = new Map<string, JSZip.JSZipObject>();
  const seenFolded = new Set<string>();
  paths.forEach((path, index) => {
    const normalized = path.slice(prefix.length);
    const folded = normalized.toLowerCase();
    if (seenFolded.has(folded)) {
      throw new Error(`The lesson package contains duplicate or case-conflicting files: "${normalized}".`);
    }
    seenFolded.add(folded);
    result.set(normalized, entries[index]);
  });
  return result;
}

function describeZodError(fileName: string, error: ZodError): string {
  const [issue] = error.issues;
  const where = issue.path.reduce<string>((acc, part) => typeof part === "number" ? `${acc}[${part}]` : acc ? `${acc}.${part}` : String(part), "");
  const message = issue.code === "invalid_union_discriminator" ? `unsupported block type (${issue.message})` : issue.message;
  const more = error.issues.length > 1 ? ` (${error.issues.length - 1} more problem${error.issues.length > 2 ? "s" : ""})` : "";
  return `${fileName} is invalid${where ? ` at ${where}` : ""}: ${message}${more}.`;
}

function parseJsonFile<T>(fileName: string, text: string, schema: ZodType<T, ZodTypeDef, unknown>): T {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(`${fileName} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const result = schema.safeParse(raw);
  if (!result.success) throw new Error(describeZodError(fileName, result.error));
  return result.data;
}

export function checkRequiredFeatures(manifest: CurieManifest) {
  const unsupported = manifest.requiredFeatures.filter((feature) => !(SUPPORTED_FEATURES as readonly string[]).includes(feature));
  if (unsupported.length) {
    throw new Error(`This lesson needs features this version of Curie does not support: ${unsupported.join(", ")}. Try a newer version of Curie.`);
  }
}

export type Issue = { blockId?: string; message: string };

/**
 * Semantic checks the schema cannot express. `hasAsset` is omitted for lessons that have no
 * packaged assets, in which case every local asset reference is reported as missing.
 */
export function findDocumentIssues(document: CurieDocument, hasAsset?: (path: string) => boolean): Issue[] {
  const issues: Issue[] = [];
  const ids = new Set<string>();
  const visit = (nodes: CurieNode[]) => {
    for (const node of nodes) {
      const report = (message: string) => issues.push({ blockId: node.id, message });
      if (ids.has(node.id)) report(`document.json uses the block id "${node.id}" more than once.`);
      ids.add(node.id);
      // An empty src is reported by the schema ("Choose a file or enter a URL").
      if ("src" in node && node.src && !isExternalSource(node.src)) {
        if (!isPackageAssetPath(node.src)) report(`Block "${node.id}" has an unsupported or unsafe source: "${node.src}". Use a path inside assets/ or an https:// URL.`);
        else if (!hasAsset?.(node.src)) report(`Block "${node.id}" refers to a missing asset: "${node.src}". Asset paths are case-sensitive.`);
      }
      if (node.type === "quiz" && node.correctIndex >= node.options.length) {
        report(`Quiz "${node.id}" has a correctIndex outside its options.`);
      }
      if (node.type === "slider" && (node.min >= node.max || node.initial < node.min || node.initial > node.max)) {
        report(`Slider "${node.id}" needs min < max and an initial value between them.`);
      }
      if (node.type === "section") visit(node.children);
    }
  };
  visit(document.blocks);
  return issues;
}

export function validateDocument(document: CurieDocument, hasAsset?: (path: string) => boolean) {
  const [first] = findDocumentIssues(document, hasAsset);
  if (first) throw new Error(first.message);
}

const FIELD_LABELS: Record<string, string> = { src: "File", alt: "Alt text", options: "Answers", correctIndex: "Correct answer", data: "Data points", children: "Section" };

/** Every problem that would stop a lesson from exporting, for showing in the editor. */
export function findLessonIssues(manifest: CurieManifest, document: CurieDocument, assets: AssetMap): Issue[] {
  const issues: Issue[] = [];
  const manifestResult = CurieManifestSchema.safeParse(manifest);
  if (!manifestResult.success) issues.push({ message: describeZodError("manifest.json", manifestResult.error) });
  const documentResult = CurieDocumentSchema.safeParse(document);
  if (!documentResult.success) {
    for (const issue of documentResult.error.issues) {
      const index = issue.path[0] === "blocks" && typeof issue.path[1] === "number" ? issue.path[1] : undefined;
      const field = issue.path.slice(2).map((part) => FIELD_LABELS[String(part)] ?? part).join(" ");
      issues.push({ blockId: index === undefined ? undefined : document.blocks[index]?.id, message: `${field ? `${field}: ` : ""}${issue.message}` });
    }
  }
  issues.push(...findDocumentIssues(document, (path) => path in assets));
  return issues;
}

/** Derives `requiredFeatures` from the blocks a document actually uses. */
export function detectFeatures(document: CurieDocument): string[] {
  const features = new Set<string>();
  const visit = (nodes: CurieNode[]) => {
    for (const node of nodes) {
      features.add(node.type);
      const text = [("content" in node && node.content) || "", node.type === "flashcard" ? node.front + node.back : ""].join(" ");
      if (/\$[^$]+\$/.test(text)) features.add("math");
      if (node.type === "section") visit(node.children);
    }
  };
  visit(document.blocks);
  return (SUPPORTED_FEATURES as readonly string[]).filter((feature) => features.has(feature));
}

export async function loadCurie(file: File): Promise<LoadedCurie> {
  if (!file.name.toLowerCase().endsWith(".curie")) throw new Error("Choose a .curie lesson package.");
  if (file.size > MAX_PACKAGE_BYTES) throw new Error(`This lesson is larger than the ${MAX_PACKAGE_BYTES / MB} MB limit.`);

  let source: JSZip;
  try {
    source = await JSZip.loadAsync(await file.arrayBuffer(), { checkCRC32: true });
  } catch {
    throw new Error("This file is not a readable .curie package. It may be corrupt or not a ZIP archive.");
  }

  const entries = Object.values(source.files).filter((entry) => !entry.dir && !isIgnoredEntry(stripDotPrefix(entry.name)));
  if (entries.length > MAX_FILES) throw new Error(`The lesson contains more than ${MAX_FILES} files.`);
  const normalized = normalizeEntries(entries);

  const declaredTotal = entries.reduce((sum, entry) => sum + declaredSize(entry), 0);
  if (declaredTotal > MAX_EXTRACTED_BYTES) throw new Error(`This lesson expands to more than ${MAX_EXTRACTED_BYTES / MB} MB.`);

  if (!normalized.has("manifest.json")) throw new Error("This package has no manifest.json at its root.");
  if (!normalized.has("document.json")) throw new Error("This package has no document.json at its root.");

  // Extract under canonical paths so lookups and export never see wrapper folders or `./` prefixes.
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  let extracted = 0;
  for (const [path, entry] of normalized) {
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = await entry.async("uint8array") as Uint8Array<ArrayBuffer>;
    } catch {
      throw new Error(`"${path}" could not be read from the package. The archive may be corrupt.`);
    }
    extracted += bytes.byteLength;
    if (extracted > MAX_EXTRACTED_BYTES) throw new Error(`This lesson expands to more than ${MAX_EXTRACTED_BYTES / MB} MB.`);
    files.set(path, bytes);
  }

  const decoder = new TextDecoder();
  const manifest = parseJsonFile("manifest.json", decoder.decode(files.get("manifest.json")), CurieManifestSchema);
  checkRequiredFeatures(manifest);
  const document = parseJsonFile("document.json", decoder.decode(files.get("document.json")), CurieDocumentSchema);
  const assets: AssetMap = {};
  for (const [path, bytes] of files) {
    if (path !== "manifest.json" && path !== "document.json") assets[path] = new Blob([bytes], { type: mimeForPath(path) });
  }
  validateDocument(document, (path) => path in assets);
  return { manifest, document, assets };
}

export async function exportCurie(manifest: CurieManifest, document: CurieDocument, assets: AssetMap = {}): Promise<Blob> {
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("document.json", JSON.stringify(document, null, 2));
  for (const [path, blob] of Object.entries(assets)) {
    if (isSafePackagePath(path) && path !== "manifest.json" && path !== "document.json") {
      zip.file(path, new Uint8Array(await blob.arrayBuffer()), { createFolders: false });
    }
  }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
