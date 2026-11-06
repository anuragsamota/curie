// Small JSON documents Curie keeps besides the library: AI settings and keys, progress, the assistant
// chat. Natively they are files in the Curie folder; on the web they live in localStorage.

import { appFolder, native } from "./storage";

const PREFIX = "curie-data:";
const queues = new Map<string, Promise<void>>();

async function filePath(name: string) {
  const { join } = await import("@tauri-apps/api/path");
  return join(await appFolder(), `${name}.json`);
}

export async function readData<T>(name: string, fallback: T): Promise<T> {
  try {
    if (!native) {
      const raw = localStorage.getItem(PREFIX + name);
      return raw === null ? fallback : JSON.parse(raw) as T;
    }
    const fs = await import("@tauri-apps/plugin-fs");
    const path = await filePath(name);
    if (!(await fs.exists(path))) return fallback;
    return JSON.parse(await fs.readTextFile(path)) as T;
  } catch {
    return fallback;
  }
}

/** Writes are serialized per document so a slow write can't overwrite a newer one. */
export function writeData(name: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value);
  const run = async () => {
    if (!native) {
      localStorage.setItem(PREFIX + name, json);
      return;
    }
    const fs = await import("@tauri-apps/plugin-fs");
    await fs.mkdir(await appFolder(), { recursive: true });
    await fs.writeTextFile(await filePath(name), json);
  };
  const next = (queues.get(name) ?? Promise.resolve()).then(run, run);
  queues.set(name, next.catch(() => undefined));
  return next;
}

export async function removeData(name: string) {
  if (!native) { localStorage.removeItem(PREFIX + name); return; }
  const fs = await import("@tauri-apps/plugin-fs");
  const path = await filePath(name);
  if (await fs.exists(path)) await fs.remove(path);
}
