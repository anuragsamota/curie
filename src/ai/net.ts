import { native } from "../lib/storage";

/**
 * fetch for AI providers. The desktop and Android apps send requests through Tauri's native HTTP
 * client, which avoids CORS (so Ollama needs no OLLAMA_ORIGINS) and allows plain-http LAN hosts.
 */
export const appFetch: typeof fetch = async (input, init) => {
  if (!native) return fetch(input, init);
  const { fetch: nativeFetch } = await import("@tauri-apps/plugin-http");
  // The native client otherwise adds the webview's Origin (http://tauri.localhost on Android), which
  // Ollama and some local servers reject with 403. An empty Origin tells the plugin to send none.
  const headers = new Headers(init?.headers);
  if (!headers.has("Origin")) headers.set("Origin", "");
  return nativeFetch(input as string | URL | Request, { ...init, headers });
};
