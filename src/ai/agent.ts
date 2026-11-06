// The study agent's loop: ask the model, run the tools it calls, feed the results back, repeat.
// Provider-neutral; every tool input is validated before it runs.

import type { ZodType } from "zod";
import {
  ProviderError, type AssistantTurn, type ChatTurn, type Effort, type ModelProvider, type ToolCall, type ToolResult,
  type ToolSpec, type ToolTurn,
} from "./types";

export type ToolOutcome = { content: string; summary: string; isError?: boolean; data?: { lessonKey?: string; lessonTitle?: string } };

export type AgentTool = ToolSpec & {
  schema: ZodType<unknown>;
  /** What the student sees while the tool runs, e.g. "Searching your notes for “osmosis”". */
  activity: (input: never) => string;
  run: (input: never, signal?: AbortSignal) => Promise<ToolOutcome>;
};

export type AgentEvent =
  | { type: "turn_start" }
  | { type: "turn_retry" }
  | { type: "text"; delta: string }
  | { type: "thinking"; delta: string }
  | { type: "turn_end"; turn: AssistantTurn }
  | { type: "tool_start"; call: ToolCall; activity: string }
  | { type: "tool_end"; call: ToolCall; outcome: ToolOutcome }
  | { type: "tool_turn"; turn: ToolTurn }
  | { type: "notice"; message: string };

type RunOptions = {
  provider: ModelProvider;
  system: string;
  history: ChatTurn[];
  tools: AgentTool[];
  onEvent: (event: AgentEvent) => void;
  signal?: AbortSignal;
  effort?: Effort;
  maxSteps?: number;
};

const MAX_JSON_RETRIES = 2;

async function execute(tools: AgentTool[], call: ToolCall, onEvent: RunOptions["onEvent"], signal?: AbortSignal): Promise<ToolResult> {
  const tool = tools.find((candidate) => candidate.name === call.name);
  const fail = (content: string): ToolResult => {
    onEvent({ type: "tool_end", call, outcome: { content, summary: content, isError: true } });
    return { id: call.id, name: call.name, content, isError: true };
  };
  if (!tool) return fail(`There is no tool named "${call.name}". Available tools: ${tools.map((candidate) => candidate.name).join(", ")}.`);
  const input = call.input as Record<string, unknown> | undefined;
  if (input && typeof input === "object" && "INVALID_JSON" in input) return fail(JSON.stringify({ INVALID_JSON: input.INVALID_JSON }));
  const parsed = tool.schema.safeParse(call.input);
  if (!parsed.success) {
    const problems = parsed.error.issues.slice(0, 8).map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ");
    return fail(`Invalid input for ${tool.name}: ${problems}. Fix these and call the tool again.`);
  }
  onEvent({ type: "tool_start", call, activity: tool.activity(parsed.data as never) });
  try {
    const outcome = await tool.run(parsed.data as never, signal);
    onEvent({ type: "tool_end", call, outcome });
    return { id: call.id, name: call.name, content: outcome.content, isError: outcome.isError };
  } catch (error) {
    return fail(`The ${tool.name} tool failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * A conversation must never end with tool calls that have no results (the next request would be
 * rejected). Calls that were not run (stopped, declined or cut off) get an error result instead.
 */
export function closeDanglingToolCalls(turns: ChatTurn[], reason = "Not run: the turn was interrupted."): ChatTurn[] {
  const last = turns.at(-1);
  if (last?.role !== "assistant" || last.toolCalls.length === 0) return turns;
  return [...turns, { role: "tool", results: last.toolCalls.map((call) => ({ id: call.id, name: call.name, content: reason, isError: true })) }];
}

/** Runs the agent until the model answers without tools. Returns the turns added to the conversation. */
export async function runAgent({ provider, system, history, tools, onEvent, signal, effort, maxSteps = 10 }: RunOptions): Promise<ChatTurn[]> {
  const added: ChatTurn[] = [];
  const specs: ToolSpec[] = tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));

  for (let step = 0; step < maxSteps; step++) {
    let result: Awaited<ReturnType<ModelProvider["turn"]>> | undefined;
    for (let attempt = 0; !result; attempt++) {
      onEvent({ type: "turn_start" });
      try {
        result = await provider.turn({
          system, history: [...history, ...added], tools: specs, signal, effort,
          onText: (delta) => onEvent({ type: "text", delta }),
          onThinking: (delta) => onEvent({ type: "thinking", delta }),
        });
      } catch (error) {
        // A tool call that isn't valid JSON never completed, so the turn is simply asked for again.
        if (error instanceof ProviderError && error.kind === "tool-json" && attempt < MAX_JSON_RETRIES) {
          onEvent({ type: "turn_retry" });
          continue;
        }
        throw error;
      }
    }

    const { turn, stop } = result;
    added.push(turn);
    onEvent({ type: "turn_end", turn });

    // Never act on a declined or truncated turn: its tool calls may be cut off mid-input.
    if (stop === "refusal" || stop === "max_tokens") {
      onEvent({ type: "notice", message: stop === "refusal"
        ? "The model declined to continue with this request. Try rephrasing it."
        : turn.toolCalls.length ? "The model ran out of room while writing a tool call. Ask for something smaller, like a shorter lesson." : "The answer reached its length limit and was cut off." });
      const closed = closeDanglingToolCalls(added, "Not run: the turn was cut off.");
      if (closed.length > added.length) { added.push(closed.at(-1)!); onEvent({ type: "tool_turn", turn: closed.at(-1) as ToolTurn }); }
      break;
    }
    if (stop === "pause") continue;
    if (stop !== "tool_use" || turn.toolCalls.length === 0) return added;

    const results: ToolResult[] = [];
    for (const call of turn.toolCalls) {
      if (signal?.aborted) throw new ProviderError("Stopped.", "aborted");
      results.push(await execute(tools, call, onEvent, signal));
    }
    const toolTurn: ToolTurn = { role: "tool", results };
    added.push(toolTurn);
    onEvent({ type: "tool_turn", turn: toolTurn });
  }
  if (added.at(-1)?.role === "tool") onEvent({ type: "notice", message: "Stopped after several tool steps. Ask the assistant to continue if it wasn't finished." });
  return added;
}
