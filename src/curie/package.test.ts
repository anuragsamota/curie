import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { isExternalSource, isSafePackagePath, mimeForPath } from "./assets";
import { detectFeatures, exportCurie, findLessonIssues, loadCurie, validateDocument } from "./package";
import { CurieDocumentSchema, CurieManifestSchema } from "./types";


const manifest = {
  format: "curie", formatVersion: "0.1.0", id: "test.lesson", title: "Test lesson",
  entry: "document.json", assetsDirectory: "assets/", requiredFeatures: ["markdown", "image"],
};
const document = {
  documentVersion: 1,
  blocks: [
    { id: "intro", type: "markdown", content: "# Hi $x$" },
    { id: "pic", type: "image", src: "assets/pic.svg", alt: "A picture" },
  ],
};
const SVG = "<svg xmlns='http://www.w3.org/2000/svg'/>";

/** Builds a .curie File from a map of archive paths to contents (objects are JSON-encoded). */
async function makePackage(files: Record<string, unknown>, name = "lesson.curie"): Promise<File> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, typeof content === "string" || content instanceof Uint8Array ? content : JSON.stringify(content), { createFolders: false });
  }
  return new File([await zip.generateAsync({ type: "uint8array" })], name);
}

const validFiles = () => ({ "manifest.json": manifest, "document.json": document, "assets/pic.svg": SVG });

describe("loadCurie", () => {
  it("loads a canonical package", async () => {
    const loaded = await loadCurie(await makePackage(validFiles()));
    expect(loaded.manifest.title).toBe("Test lesson");
    expect(loaded.document.blocks.map((block) => block.id)).toEqual(["intro", "pic"]);
    expect(await loaded.assets["assets/pic.svg"].text()).toBe(SVG);
    expect(loaded.assets["assets/pic.svg"].type).toBe("image/svg+xml");
  });

  it("normalizes a single enclosing folder", async () => {
    const wrapped = Object.fromEntries(Object.entries(validFiles()).map(([path, content]) => [`my-lesson/${path}`, content]));
    const loaded = await loadCurie(await makePackage(wrapped));
    expect(Object.keys(loaded.assets)).toEqual(["assets/pic.svg"]);
  });

  it("normalizes ./ prefixes and ignores macOS archive noise", async () => {
    const files = Object.fromEntries(Object.entries(validFiles()).map(([path, content]) => [`./${path}`, content]));
    const loaded = await loadCurie(await makePackage({ ...files, "__MACOSX/._manifest.json": "x", "assets/.DS_Store": "x" }));
    expect(Object.keys(loaded.assets)).toEqual(["assets/pic.svg"]);
  });

  it.each([
    ["traversal", "assets/../../evil.txt"],
    ["absolute path", "/etc/evil.txt"],
    ["backslash", "assets\\evil.txt"],
    ["drive letter", "C:/evil.txt"],
  ])("rejects unsafe paths (%s)", async (_label, path) => {
    await expect(loadCurie(await makePackage({ ...validFiles(), [path]: "x" }))).rejects.toThrow(/Unsafe file path/);
  });

  it("rejects case-conflicting duplicate paths", async () => {
    await expect(loadCurie(await makePackage({ ...validFiles(), "assets/PIC.svg": SVG }))).rejects.toThrow(/case-conflicting/);
  });

  it("reports a missing manifest or document", async () => {
    await expect(loadCurie(await makePackage({ "document.json": document }))).rejects.toThrow(/no manifest\.json/);
    await expect(loadCurie(await makePackage({ "manifest.json": manifest }))).rejects.toThrow(/no document\.json/);
  });

  it("reports missing and case-mismatched assets", async () => {
    await expect(loadCurie(await makePackage({ "manifest.json": manifest, "document.json": document }))).rejects.toThrow(/missing asset: "assets\/pic\.svg"/);
    await expect(loadCurie(await makePackage({ "manifest.json": manifest, "document.json": document, "assets/Pic.svg": SVG }))).rejects.toThrow(/case-sensitive/);
  });

  it("names the file that has invalid JSON", async () => {
    await expect(loadCurie(await makePackage({ ...validFiles(), "document.json": "{ nope" }))).rejects.toThrow(/^document\.json is not valid JSON/);
  });

  it("points at the invalid field in a schema error", async () => {
    const bad = { ...document, blocks: [{ id: "q", type: "quiz", question: "?", options: ["only one"], correctIndex: 0 }] };
    await expect(loadCurie(await makePackage({ ...validFiles(), "document.json": bad }))).rejects.toThrow(/document\.json is invalid at blocks\[0\]\.options/);
  });

  it("reports unknown block types", async () => {
    const bad = { ...document, blocks: [{ id: "x", type: "hologram" }] };
    await expect(loadCurie(await makePackage({ ...validFiles(), "document.json": bad }))).rejects.toThrow(/blocks\[0\]\.type: unsupported block type/);
  });

  it("gives an explicit compatibility error for unknown required features", async () => {
    const future = { ...manifest, requiredFeatures: ["markdown", "simulation"] };
    await expect(loadCurie(await makePackage({ ...validFiles(), "manifest.json": future }))).rejects.toThrow(/does not support: simulation/);
  });

  it("rejects non-zip files and wrong extensions", async () => {
    await expect(loadCurie(new File(["not a zip"], "lesson.curie"))).rejects.toThrow(/not a readable \.curie package/);
    await expect(loadCurie(await makePackage(validFiles(), "lesson.zip"))).rejects.toThrow(/Choose a \.curie/);
  });

  it("rejects unsafe asset sources in the document", async () => {
    const bad = { ...document, blocks: [{ id: "pic", type: "image", src: "javascript:alert(1)", alt: "" }] };
    await expect(loadCurie(await makePackage({ ...validFiles(), "document.json": bad }))).rejects.toThrow(/unsupported or unsafe source/);
  });
});

describe("exportCurie", () => {
  it("round-trips content and asset bytes", async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    const loaded = await loadCurie(await makePackage({ ...validFiles(), "assets/clip.mp4": bytes }));
    const blob = await exportCurie(loaded.manifest, loaded.document, loaded.assets);
    const reloaded = await loadCurie(new File([blob], "again.curie"));
    expect(reloaded.manifest).toEqual(loaded.manifest);
    expect(reloaded.document).toEqual(loaded.document);
    expect(new Uint8Array(await reloaded.assets["assets/clip.mp4"].arrayBuffer())).toEqual(bytes);
    expect(await reloaded.assets["assets/pic.svg"].text()).toBe(SVG);
  });
});

describe("validateDocument", () => {
  it("rejects duplicate block ids, including inside sections", () => {
    expect(() => validateDocument({
      documentVersion: 1,
      blocks: [{ id: "a", type: "divider" }, { id: "s", type: "section", children: [{ id: "a", type: "divider" }] }],
    })).toThrow(/"a" more than once/);
  });

  it("rejects sliders whose initial value is out of range", () => {
    expect(() => validateDocument({
      documentVersion: 1,
      blocks: [{ id: "s", type: "slider", label: "x", min: 0, max: 10, step: 1, initial: 11 }],
    })).toThrow(/Slider "s"/);
  });
});

describe("findLessonIssues and detectFeatures", () => {
  it("collects schema and semantic issues with their block ids", () => {
    const doc = CurieDocumentSchema.parse(document);
    const issues = findLessonIssues(CurieManifestSchema.parse(manifest), doc, {});
    expect(issues).toEqual([expect.objectContaining({ blockId: "pic", message: expect.stringMatching(/missing asset/) })]);
  });

  it("derives required features from the blocks in use", () => {
    expect(detectFeatures(CurieDocumentSchema.parse(document))).toEqual(["markdown", "math", "image"]);
  });
});

// Lessons now live in their own repository; check them when it is checked out next to this one.
const LESSONS = process.env.CURIE_LESSONS_DIR ?? join(import.meta.dirname, "../../../curie-lessons");
const lessonFiles = existsSync(LESSONS) ? readdirSync(LESSONS).filter((name) => name.endsWith(".curie")) : [];

describe.skipIf(lessonFiles.length === 0)("curie-lessons packages", () => {
  it.each(lessonFiles)("%s loads and has no issues", async (name) => {
    const loaded = await loadCurie(new File([await readFile(join(LESSONS, name))], name));
    expect(findLessonIssues(loaded.manifest, loaded.document, loaded.assets)).toEqual([]);
    expect(loaded.manifest.requiredFeatures).toEqual(detectFeatures(loaded.document));
  });
});

describe("cover images", () => {
  it("keeps a cover that exists and drops one that doesn't", async () => {
    const withCover = await loadCurie(await makePackage({ ...validFiles(), "manifest.json": { ...manifest, cover: "assets/pic.svg" } }));
    expect(withCover.manifest.cover).toBe("assets/pic.svg");
    const missing = await loadCurie(await makePackage({ ...validFiles(), "manifest.json": { ...manifest, cover: "assets/gone.png" } }));
    expect(missing.manifest.cover).toBeUndefined();
  });

  it("reports a missing cover in the editor", () => {
    const issues = findLessonIssues(CurieManifestSchema.parse({ ...manifest, cover: "assets/gone.png" }), CurieDocumentSchema.parse(document), { "assets/pic.svg": new Blob([SVG]) });
    expect(issues).toEqual([expect.objectContaining({ message: expect.stringMatching(/cover image/) })]);
  });

  it("reports load progress up to 1", async () => {
    const seen: number[] = [];
    await loadCurie(await makePackage(validFiles()), (fraction) => seen.push(fraction));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)).toBe(1);
  });
});

describe("asset helpers", () => {
  it("only treats http(s) and media data: URLs as external", () => {
    expect(isExternalSource("https://example.com/a.png")).toBe(true);
    expect(isExternalSource("data:image/png;base64,AA==")).toBe(true);
    expect(isExternalSource("data:text/html,<script>")).toBe(false);
    expect(isExternalSource("javascript:alert(1)")).toBe(false);
    expect(isExternalSource("blob:https://x/1")).toBe(false);
  });

  it("validates package paths", () => {
    expect(isSafePackagePath("assets/a.png")).toBe(true);
    expect(isSafePackagePath("assets/./a.png")).toBe(false);
    expect(isSafePackagePath("")).toBe(false);
  });

  it("maps SVG to the right MIME type", () => {
    expect(mimeForPath("assets/x.SVG")).toBe("image/svg+xml");
    expect(mimeForPath("assets/x.unknown")).toBe("application/octet-stream");
  });
});
