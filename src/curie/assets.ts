// Shared rules for asset references inside lesson documents and package entries.

const MIME_TYPES: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  avif: "image/avif", svg: "image/svg+xml", bmp: "image/bmp", ico: "image/x-icon",
  mp4: "video/mp4", webm: "video/webm", ogv: "video/ogg", mov: "video/quicktime",
  json: "application/json", lottie: "application/json",
};

export function mimeForPath(path: string): string {
  const ext = path.split("?")[0].split(".").pop()?.toLowerCase();
  return MIME_TYPES[ext || ""] || "application/octet-stream";
}

/** Sources the renderer may load directly instead of from the package. */
export function isExternalSource(src: string): boolean {
  return /^https?:\/\//i.test(src) || /^data:(image|video)\//i.test(src);
}

/** A relative, forward-slash path that cannot escape the package root. */
export function isSafePackagePath(path: string): boolean {
  if (!path || path.startsWith("/") || path.includes("\\") || /^[a-z]:/i.test(path)) return false;
  if (/[\u0000-\u001f]/.test(path)) return false;
  return path.split("/").every((segment) => segment !== ".." && segment !== ".");
}

export function isPackageAssetPath(src: string): boolean {
  return src.startsWith("assets/") && isSafePackagePath(src);
}
