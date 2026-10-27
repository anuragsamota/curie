import { exportCurie, loadCurie, type LoadedCurie, type ProgressFn } from "./package";
import type { WorkerRequest, WorkerResponse } from "./worker";

type Job = WorkerRequest extends infer R ? R extends WorkerRequest ? Omit<R, "id"> : never : never;

type Pending = { resolve: (value: never) => void; reject: (error: Error) => void; onProgress?: ProgressFn };

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, Pending>();

/** One shared worker, created on first use. `null` when workers are unavailable (e.g. tests). */
function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      const job = pending.get(data.id);
      if (!job) return;
      if ("progress" in data) return job.onProgress?.(data.progress);
      pending.delete(data.id);
      if ("error" in data) job.reject(new Error(data.error));
      else job.resolve(data.result as never);
    };
    worker.onerror = () => {
      // A worker that fails to start falls back to the main thread for this and later jobs.
      worker?.terminate();
      worker = null;
      for (const job of pending.values()) job.reject(new Error("WORKER_FAILED"));
      pending.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

function run<T>(request: Job, onProgress: ProgressFn | undefined, fallback: () => Promise<T>): Promise<T> {
  const target = getWorker();
  if (!target) return fallback();
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: never) => void, reject, onProgress });
    target.postMessage({ ...request, id } as WorkerRequest);
  }).catch((error: Error) => error.message === "WORKER_FAILED" ? fallback() : Promise.reject(error));
}

/** `loadCurie` off the UI thread. */
export function loadCurieInBackground(file: File, onProgress?: ProgressFn): Promise<LoadedCurie> {
  return run({ op: "load", file }, onProgress, () => loadCurie(file, onProgress));
}

/** `exportCurie` off the UI thread. */
export function exportCurieInBackground(content: LoadedCurie, onProgress?: ProgressFn): Promise<Blob> {
  return run({ op: "export", content }, onProgress, () => exportCurie(content.manifest, content.document, content.assets, onProgress));
}
