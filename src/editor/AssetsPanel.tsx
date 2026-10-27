import { useEffect, useRef, useState } from "react";
import { FileJson, FileQuestion, Film, Trash2, Upload } from "lucide-react";
import type { AssetMap } from "../curie/package";
import { formatBytes } from "../lib/lesson";
import { assetKind } from "./blocks";

function Thumbnail({ path, blob }: { path: string; blob: Blob }) {
  const kind = assetKind(path);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (kind !== "image") return;
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob, kind]);
  const Icon = kind === "video" ? Film : kind === "lottie" ? FileJson : FileQuestion;
  return <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-base-300 bg-base-200">
    {url ? <img src={url} alt="" className="size-full object-cover" /> : <Icon size={18} className="text-base-content/50" />}
  </span>;
}

export function AssetsPanel({ assets, usage, onUpload, onRemove, onUse, useLabel }: {
  assets: AssetMap; usage: Map<string, number>; onUpload: (files: File[]) => Promise<string[]>;
  onRemove: (path: string) => void; onUse?: (path: string) => void; useLabel?: (path: string) => string | undefined;
}) {
  const input = useRef<HTMLInputElement>(null);
  const entries = Object.entries(assets).sort(([a], [b]) => a.localeCompare(b));
  const total = entries.reduce((sum, [, blob]) => sum + blob.size, 0);
  return <div className="flex flex-col gap-3">
    <button className="btn btn-sm btn-primary btn-soft w-full" onClick={() => input.current?.click()}><Upload size={15} /> Upload files</button>
    <input ref={input} type="file" multiple accept="image/*,video/mp4,video/webm,video/ogg,video/quicktime,.json" className="hidden" onChange={(event) => {
      const files = [...(event.target.files ?? [])];
      event.target.value = "";
      if (files.length) void onUpload(files);
    }} />
    {entries.length === 0
      ? <p className="rounded-xl border border-dashed border-base-300 p-4 text-center text-xs leading-5 text-base-content/50">No files yet. Upload images, videos or Lottie JSON, or drop them onto the editor.</p>
      : <>
        <p className="px-1 text-xs text-base-content/50">{entries.length} {entries.length === 1 ? "file" : "files"} · {formatBytes(total)}</p>
        <ul className="flex flex-col gap-1">
          {entries.map(([path, blob]) => {
            const count = usage.get(path) ?? 0;
            const label = useLabel?.(path);
            return <li key={path} className="group flex items-center gap-2.5 rounded-xl p-1.5 hover:bg-base-200">
              <Thumbnail path={path} blob={blob} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={path}>{path.replace(/^assets\//, "")}</p>
                <p className="text-xs text-base-content/50">{formatBytes(blob.size)} · {count ? `used ${count}×` : "unused"}</p>
              </div>
              {label && onUse && <button className="btn btn-xs btn-primary" onClick={() => onUse(path)}>{label}</button>}
              <button className="btn btn-ghost btn-xs btn-square text-error opacity-60 group-hover:opacity-100" aria-label={`Delete ${path}`} onClick={() => onRemove(path)}><Trash2 size={13} /></button>
            </li>;
          })}
        </ul>
      </>}
  </div>;
}
