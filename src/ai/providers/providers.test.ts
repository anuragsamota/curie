import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatTurn } from "../types";
import { claudeProvider, echoContent, runnableToolCalls, toAnthropicMessages } from "./anthropic";
import { ollamaAccumulator, toOllamaMessages } from "./ollama";
import { chatCompletionsAccumulator, toOpenAiMessages } from "./openai";
import { ThinkSplitter, httpFailure, parseArguments } from "./shared";

const history: ChatTurn[] = [
  { role: "user", text: "What is osmosis?", context: "<note_excerpts>…</note_excerpts>" },
  { role: "assistant", text: "Let me look.", toolCalls: [{ id: "c1", name: "search_notes", input: { query: "osmosis" } }] },
  { role: "tool", results: [{ id: "c1", name: "search_notes", content: "[1] Biology: …" }] },
];

describe("ThinkSplitter", () => {
  it("separates <think> reasoning from the answer, even across chunk boundaries", () => {
    const text: string[] = [];
    const thinking: string[] = [];
    const splitter = new ThinkSplitter((chunk) => text.push(chunk), (chunk) => thinking.push(chunk));
    for (const chunk of ["<thi", "nk>Hmm, wa", "ter.</th", "ink>Osmosis is", " diffusion <of> water."]) splitter.push(chunk);
    splitter.flush();
    expect(thinking.join("")).toBe("Hmm, water.");
    expect(text.join("")).toBe("Osmosis is diffusion <of> water.");
  });
});

describe("OpenAI-compatible", () => {
  it("maps the conversation to chat messages", () => {
    const messages = toOpenAiMessages("system", history);
    expect(messages[0]).toEqual({ role: "system", content: "system" });
    expect(messages[1]).toEqual({ role: "user", content: "<note_excerpts>…</note_excerpts>\n\nWhat is osmosis?" });
    expect(messages[2]).toMatchObject({ role: "assistant", tool_calls: [{ id: "c1", type: "function", function: { name: "search_notes", arguments: "{\"query\":\"osmosis\"}" } }] });
    expect(messages[3]).toEqual({ role: "tool", tool_call_id: "c1", content: "[1] Biology: …" });
  });

  it("assembles streamed text, reasoning and tool calls", () => {
    const text: string[] = [];
    const acc = chatCompletionsAccumulator((chunk) => text.push(chunk), () => undefined);
    acc.push({ choices: [{ delta: { reasoning_content: "thinking" } }] });
    acc.push({ choices: [{ delta: { content: "Searching" } }] });
    acc.push({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_9", function: { name: "search_", arguments: "{\"que" } }] } }] });
    acc.push({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "notes", arguments: "ry\":\"cells\"}" } }] }, finish_reason: "tool_calls" }] });
    const { turn, stop } = acc.finish();
    expect(stop).toBe("tool_use");
    expect(turn).toMatchObject({ text: "Searching", thinking: "thinking", toolCalls: [{ id: "call_9", name: "search_notes", input: { query: "cells" } }] });
    expect(text.join("")).toBe("Searching");
  });

  it("flags unparseable tool arguments instead of guessing", () => {
    expect(parseArguments("{\"query\": \"cel")).toEqual({ INVALID_JSON: "{\"query\": \"cel" });
    expect(parseArguments({ query: "x" })).toEqual({ query: "x" });
  });
});

describe("Ollama", () => {
  it("explains a 403 as a refused origin, not a bad key", async () => {
    const error = await httpFailure(new Response("Forbidden", { status: 403 }), "Ollama");
    expect(error.message).toMatch(/OLLAMA_ORIGINS/);
    expect(error.message).not.toMatch(/API key/);
  });

  it("maps tool results with their tool name and reads native tool calls", () => {
    expect(toOllamaMessages("s", history)[3]).toEqual({ role: "tool", tool_name: "search_notes", content: "[1] Biology: …" });
    const acc = ollamaAccumulator(() => undefined, () => undefined);
    acc.push({ message: { content: "", tool_calls: [{ function: { name: "create_lesson", arguments: { title: "T", blocks: [] } } }] } });
    acc.push({ done: true, done_reason: "stop" });
    const { turn, stop } = acc.finish();
    expect(stop).toBe("tool_use");
    expect(turn.toolCalls[0]).toMatchObject({ name: "create_lesson", input: { title: "T", blocks: [] } });
  });

  it("reports length stops and server errors", () => {
    const acc = ollamaAccumulator(() => undefined, () => undefined);
    acc.push({ message: { content: "partial" }, done: true, done_reason: "length" });
    expect(acc.finish().stop).toBe("max_tokens");
    expect(() => ollamaAccumulator(() => undefined, () => undefined).push({ error: "llama3 does not support tools" })).toThrow(/does not support tools/);
  });
});

describe("Claude", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("replays Claude's own content and rebuilds other providers' turns", () => {
    const messages = toAnthropicMessages(history);
    expect(messages[0]).toEqual({ role: "user", content: [{ type: "text", text: "<note_excerpts>…</note_excerpts>" }, { type: "text", text: "What is osmosis?" }] });
    expect(messages[1]).toEqual({ role: "assistant", content: [{ type: "text", text: "Let me look." }, { type: "tool_use", id: "c1", name: "search_notes", input: { query: "osmosis" } }] });
    expect(messages[2]).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "c1", content: "[1] Biology: …", is_error: undefined }] });
  });

  it("after a mid-answer fallback, echoes only earlier text and runs only the new model's tool calls", () => {
    const content = [
      { type: "thinking", thinking: "x", signature: "s" },
      { type: "text", text: "Partial ", citations: null },
      { type: "tool_use", id: "old", name: "search_notes", input: {} },
      { type: "fallback", from: { model: "claude-opus-5-5" }, to: { model: "fallback-model" } },
      { type: "text", text: "Continued.", citations: null },
      { type: "tool_use", id: "new", name: "search_notes", input: { query: "q" } },
    ] as unknown as Parameters<typeof echoContent>[0];
    expect(echoContent(content).map((block) => block.type)).toEqual(["text", "text", "tool_use"]);
    expect(runnableToolCalls(content).map((call) => call.id)).toEqual(["new"]);
  });

  it("streams through the Anthropic SDK with thinking, caching, fallbacks and eager tool input", async () => {
    const events = [
      { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } },
      { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Check the notes." } },
      { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig" } },
      { type: "content_block_stop", index: 0 },
      { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Searching your notes." } },
      { type: "content_block_stop", index: 1 },
      { type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "toolu_1", name: "search_notes", input: {} } },
      { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: "{\"query\": \"osm" } },
      { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: "osis\"}" } },
      { type: "content_block_stop", index: 2 },
      { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 20 } },
      { type: "message_stop" },
    ];
    const sse = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
    const fetchMock = vi.fn(async () => new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = claudeProvider({ apiKey: "sk-ant-test", model: "claude-opus-5-5" });
    const text: string[] = [];
    const thinking: string[] = [];
    const result = await provider.turn({
      system: "You are a tutor.", history: [{ role: "user", text: "Explain osmosis" }],
      tools: [{ name: "search_notes", description: "Search", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } }],
      onText: (delta) => text.push(delta), onThinking: (delta) => thinking.push(delta),
    });

    expect(result.stop).toBe("tool_use");
    expect(result.turn.toolCalls).toEqual([{ id: "toolu_1", name: "search_notes", input: { query: "osmosis" } }]);
    expect(result.turn.text).toBe("Searching your notes.");
    expect(result.turn.thinking).toBe("Check the notes.");
    expect(text.join("")).toBe("Searching your notes.");
    expect(thinking.join("")).toBe("Check the notes.");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toMatch(/\/v1\/messages/);
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      model: "claude-opus-5-5", stream: true, fallbacks: "default",
      thinking: { type: "adaptive", display: "summarized" }, output_config: { effort: "medium" }, cache_control: { type: "ephemeral" },
      tools: [{ name: "search_notes", eager_input_streaming: true }],
    });
    expect(body).not.toHaveProperty("temperature");
    const headers = new Headers(init.headers);
    expect(headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
  });

  it("explains authentication failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }), { status: 401, headers: { "content-type": "application/json" } })));
    const provider = claudeProvider({ apiKey: "bad", model: "claude-haiku-5-5" });
    await expect(provider.turn({ system: "s", history: [{ role: "user", text: "hi" }], tools: [], onText: () => undefined })).rejects.toMatchObject({ kind: "auth" });
  });
});
