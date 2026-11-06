import JSZip from "jszip";
import type { Page, Route } from "@playwright/test";

/** Builds a .curie package in memory and returns it as base64. */
export async function curiePackage(title: string, document: object): Promise<string> {
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify({ format: "curie", formatVersion: "0.2.0", id: `test.${title.toLowerCase().replace(/\W+/g, "-")}`, title, entry: "document.json", assetsDirectory: "assets/", requiredFeatures: [] }));
  zip.file("document.json", JSON.stringify(document));
  return zip.generateAsync({ type: "base64" });
}

/** Imports a lesson by dropping it on the window, like a user dragging a file in. */
export async function importLesson(page: Page, base64: string, name = "lesson.curie") {
  await page.evaluate(([data, fileName]) => {
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], fileName));
    window.dispatchEvent(new DragEvent("dragenter", { dataTransfer: transfer }));
    window.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, cancelable: true }));
  }, [base64, name] as const);
  await page.waitForURL(/#\/lesson\//);
}

/** Stores AI settings and keys before the app starts (web builds keep them in localStorage). */
export async function configureAi(page: Page, ai: Record<string, unknown>, keys: Record<string, string> = {}) {
  await page.addInitScript(([settings, secrets]) => {
    localStorage.setItem("curie-settings", JSON.stringify({ ai: settings, sound: false }));
    localStorage.setItem("curie-data:keys", JSON.stringify(secrets));
  }, [ai, keys] as const);
}

/** Sets a range input's value the way a drag would. */
export async function setRange(page: Page, label: string, value: number) {
  await page.getByLabel(label).evaluate((input, next) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, String(next));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

export type ChatRequest = { messages: { role: string; content: string; tool_name?: string }[]; tools?: { function: { name: string } }[]; options?: { num_ctx?: number } };

/** A scripted Ollama: each /api/chat request is answered by `reply`, as newline-delimited JSON. */
export async function mockOllama(page: Page, reply: (request: ChatRequest) => object[]) {
  const requests: ChatRequest[] = [];
  await page.route("http://ollama.test:11434/api/chat", async (route: Route) => {
    const request = route.request().postDataJSON() as ChatRequest;
    requests.push(request);
    await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: reply(request).map((line) => JSON.stringify(line)).join("\n") + "\n" });
  });
  await page.route("http://ollama.test:11434/api/tags", (route) => route.fulfill({ json: { models: [{ name: "qwen-test:latest" }, { name: "llama-test:8b" }] } }));
  return requests;
}

export const say = (text: string) => [{ message: { role: "assistant", content: text }, done: false }, { message: { role: "assistant", content: "" }, done: true, done_reason: "stop" }];
export const callTool = (name: string, args: object) => [{ message: { role: "assistant", content: "", tool_calls: [{ function: { name, arguments: args } }] }, done: false }, { done: true, done_reason: "stop" }];
