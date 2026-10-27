// Unzipping, validating and re-zipping lessons is CPU-heavy, so it runs here instead of on the UI thread.
import { exportCurie, loadCurie, type LoadedCurie } from "./package";

export type WorkerRequest =
  | { id: number; op: "load"; file: File }
  | { id: number; op: "export"; content: LoadedCurie };

export type WorkerResponse =
  | { id: number; progress: number }
  | { id: number; result: LoadedCurie | Blob }
  | { id: number; error: string };

// The app is type-checked against DOM types, so describe the worker scope directly.
const scope = self as unknown as { postMessage(message: WorkerResponse): void; onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null };
const post = (message: WorkerResponse) => scope.postMessage(message);

scope.onmessage = async ({ data }) => {
  // Progress events are throttled to whole percents so the UI thread isn't flooded.
  let last = -1;
  const progress = (fraction: number) => {
    const percent = Math.floor(fraction * 100);
    if (percent !== last) { last = percent; post({ id: data.id, progress: fraction }); }
  };
  try {
    const result = data.op === "load"
      ? await loadCurie(data.file, progress)
      : await exportCurie(data.content.manifest, data.content.document, data.content.assets, progress);
    post({ id: data.id, result });
  } catch (error) {
    post({ id: data.id, error: error instanceof Error ? error.message : String(error) });
  }
};
