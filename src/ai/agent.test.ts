import { describe, expect, it } from "vitest";
import { z } from "zod";
import { closeDanglingToolCalls, runAgent, type AgentEvent, type AgentTool } from "./agent";
import { ProviderError, type ChatTurn, type ModelProvider, type TurnRequest, type TurnResult } from "./types";

/** A provider that plays back scripted turns and records what it was sent. */
function scripted(turns: (TurnResult | Error)[]) {
  const requests: TurnRequest[] = [];
  const provider: ModelProvider = {
    kind: "openai",
    model: "test",
    async turn(request) {
      requests.push(request);
      const next = turns.shift();
      if (!next) throw new Error("No more scripted turns");
      if (next instanceof Error) throw next;
      if (next.turn.text) request.onText(next.turn.text);
      return next;
    },
    complete: async () => "",
    listModels: async () => [],
  };
  return { provider, requests };
}

const say = (text: string): TurnResult => ({ turn: { role: "assistant", text, toolCalls: [] }, stop: "end" });
const call = (name: string, input: unknown, id = `call-${name}`): TurnResult => ({ turn: { role: "assistant", text: "", toolCalls: [{ id, name, input }] }, stop: "tool_use" });

const echo: AgentTool = {
  name: "echo", description: "Echo", inputSchema: { type: "object" },
  schema: z.object({ word: z.string() }),
  activity: () => "Echoing",
  run: async (input) => ({ content: `echo: ${(input as { word: string }).word}`, summary: "Echoed" }),
};

const user: ChatTurn[] = [{ role: "user", text: "hi" }];

describe("runAgent", () => {
  it("runs tools and feeds their results back until the model answers", async () => {
    const { provider, requests } = scripted([call("echo", { word: "hello" }), say("Done.")]);
    const events: AgentEvent[] = [];
    const added = await runAgent({ provider, system: "s", history: user, tools: [echo], onEvent: (event) => events.push(event) });
    expect(added.map((turn) => turn.role)).toEqual(["assistant", "tool", "assistant"]);
    expect(added[1]).toEqual({ role: "tool", results: [{ id: "call-echo", name: "echo", content: "echo: hello", isError: undefined }] });
    expect(requests[1].history.at(-1)?.role).toBe("tool");
    expect(events.filter((event) => event.type === "tool_start")).toHaveLength(1);
    expect(events.some((event) => event.type === "text" && event.delta === "Done.")).toBe(true);
  });

  it("returns validation problems to the model instead of running the tool", async () => {
    const { provider } = scripted([call("echo", { word: 3 }), call("nope", {}), say("ok")]);
    const added = await runAgent({ provider, system: "s", history: user, tools: [echo], onEvent: () => undefined });
    const results = added.filter((turn) => turn.role === "tool").flatMap((turn) => turn.role === "tool" ? turn.results : []);
    expect(results[0]).toMatchObject({ isError: true, content: expect.stringMatching(/Invalid input for echo: word/) });
    expect(results[1]).toMatchObject({ isError: true, content: expect.stringMatching(/no tool named "nope"/) });
  });

  it("re-issues a turn whose tool call was malformed JSON", async () => {
    const { provider, requests } = scripted([new ProviderError("bad json", "tool-json"), say("Recovered.")]);
    const events: AgentEvent[] = [];
    const added = await runAgent({ provider, system: "s", history: user, tools: [echo], onEvent: (event) => events.push(event) });
    expect(requests).toHaveLength(2);
    expect(events.some((event) => event.type === "turn_retry")).toBe(true);
    expect(added).toHaveLength(1);
  });

  it("never runs the tools of a refused or truncated turn, and keeps the history valid", async () => {
    let ran = false;
    const tool = { ...echo, run: async () => { ran = true; return { content: "", summary: "" }; } };
    const { provider } = scripted([{ ...call("echo", { word: "x" }), stop: "max_tokens" }]);
    const events: AgentEvent[] = [];
    const added = await runAgent({ provider, system: "s", history: user, tools: [tool], onEvent: (event) => events.push(event) });
    expect(ran).toBe(false);
    expect(added.at(-1)).toMatchObject({ role: "tool", results: [{ isError: true }] });
    expect(events.some((event) => event.type === "notice")).toBe(true);
  });

  it("passes other provider errors through", async () => {
    const { provider } = scripted([new ProviderError("Key rejected", "auth")]);
    await expect(runAgent({ provider, system: "s", history: user, tools: [], onEvent: () => undefined })).rejects.toMatchObject({ kind: "auth" });
  });
});

describe("closeDanglingToolCalls", () => {
  it("answers tool calls left without results", () => {
    const turns: ChatTurn[] = [...user, call("echo", {}).turn];
    expect(closeDanglingToolCalls(turns).at(-1)).toMatchObject({ role: "tool", results: [{ id: "call-echo", isError: true }] });
    expect(closeDanglingToolCalls(user)).toBe(user);
  });
});
