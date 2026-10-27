// Rebuilds examples/<name>.curie from the examples/<name>/ source folder.
// Usage: pnpm pack:example [name]   (default: every folder in examples/)
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import JSZip from "jszip";

const examples = join(import.meta.dirname, "..", "examples");
const names = process.argv[2]
  ? [process.argv[2]]
  : (await readdir(examples, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

for (const name of names) {
  const root = join(examples, name);
  const zip = new JSZip();
  for await (const path of walk(root)) {
    // Fixed dates keep the archive byte-stable between rebuilds.
    zip.file(relative(root, path).split("\\").join("/"), await readFile(path), { date: new Date("2026-01-01T00:00:00Z"), createFolders: false });
  }
  const out = `${root}.curie`;
  await writeFile(out, await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } }));
  console.log(`Wrote ${relative(process.cwd(), out)}`);
}
