import JSZip from "jszip";
import { CurieDocumentSchema, CurieManifestSchema, type CurieDocument, type CurieManifest } from "./types";

const MAX_PACKAGE_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 300;

function safePackagePath(path: string): boolean {
  return !path.startsWith("/") && !path.includes("\\") && !path.split("/").includes("..");
}

export async function loadCurie(file: File): Promise<LoadedCurie> {
  if (!file.name.toLowerCase().endsWith(".curie")) throw new Error("Choose a .curie lesson package.");
  if (file.size > MAX_PACKAGE_BYTES) throw new Error("This lesson is larger than the 50 MB starter limit.");

  const zip = await JSZip.loadAsync(file, { checkCRC32: true });
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (entries.length > MAX_FILES) throw new Error("The lesson contains too many files.");
  for (const entry of entries) {
    if (!safePackagePath(entry.name)) throw new Error("Unsafe file path found in lesson package.");
  }

  const manifestFile = zip.file("manifest.json");
  const documentFile = zip.file("document.json");
  if (!manifestFile) throw new Error("Missing manifest.json.");
  if (!documentFile) throw new Error("Missing document.json.");

  const manifest = CurieManifestSchema.parse(JSON.parse(await manifestFile.async("string")));
  const document = CurieDocumentSchema.parse(JSON.parse(await documentFile.async("string")));
  if (manifest.entry !== "document.json") throw new Error("Unsupported entry document.");
  validateNodeAssets(document.blocks, zip);
  return { manifest, document, zip };
}

function validateNodeAssets(nodes: CurieDocument["blocks"], zip: JSZip) {
  for (const node of nodes) {
    if ("src" in node && !/^https?:\/\//i.test(node.src) && !node.src.startsWith("data:") && !node.src.startsWith("blob:")) {
      if (!node.src.startsWith("assets/") || !safePackagePath(node.src) || !zip.file(node.src)) {
        throw new Error(`Missing or unsafe lesson asset: ${node.src}`);
      }
    }
    if (node.type === "section") validateNodeAssets(node.children, zip);
    if (node.type === "quiz" && node.correctIndex >= node.options.length) {
      throw new Error(`Quiz "${node.id}" has a correctIndex outside its options.`);
    }
  }
}

export type LoadedCurie = { manifest: CurieManifest; document: CurieDocument; zip: JSZip };

export async function exportCurie(manifest: CurieManifest, document: CurieDocument, sourceZip?: JSZip): Promise<Blob> {
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("document.json", JSON.stringify(document, null, 2));
  if (sourceZip) {
    const entries = Object.values(sourceZip.files).filter((entry) => !entry.dir && entry.name !== "manifest.json" && entry.name !== "document.json");
    for (const entry of entries) {
      if (safePackagePath(entry.name)) zip.file(entry.name, await entry.async("uint8array"));
    }
  }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
