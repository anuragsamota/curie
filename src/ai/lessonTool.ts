// The create_lesson tool's input format, and its conversion into a real, validated Curie lesson.
// The format is deliberately flat (one block shape with a `type`) so smaller local models can fill it.

import { z } from "zod";
import { detectFeatures, findLessonIssues } from "../curie/package";
import { CurieDocumentSchema, type CurieDocument, type CurieManifest, type CurieNode } from "../curie/types";
import { flattenBlocks, randomId, slugify } from "../lib/lesson";
import type { LessonContent } from "../lib/storage";

export const GENERATED_BLOCK_TYPES = ["markdown", "callout", "quiz", "flashcard", "reveal", "divider", "section", "slider", "toggle", "choice", "display", "plot", "graph"] as const;

const str = (description: string) => ({ type: "string", description });
const num = (description: string) => ({ type: "number", description });

function blockSchema(nested: boolean): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      type: { type: "string", enum: GENERATED_BLOCK_TYPES.filter((type) => !nested || type !== "section") },
      content: str("markdown, callout, reveal: Markdown text. Inline math $...$; display math with $$ on their own lines. {{ expression }} shows a live variable value."),
      title: str("reveal (required: the button label), callout, section, display, plot, graph: a heading"),
      variant: { type: "string", enum: ["info", "tip", "warning", "success"], description: "callout only" },
      question: str("quiz: the question"),
      options: { type: "array", items: { type: "string" }, description: "quiz: 2 to 6 answer choices" },
      correctIndex: { type: "integer", description: "quiz: 0-based index of the correct option" },
      explanation: str("quiz: why the correct answer is right, shown after answering"),
      front: str("flashcard: the prompt"),
      back: str("flashcard: the answer"),
      ...(nested ? {} : { children: { type: "array", items: blockSchema(true), description: "section: the blocks inside it" } }),
      label: str("slider, toggle, choice: the control's label"),
      variable: str("slider, toggle, choice: the variable the control sets (letters, digits and _)"),
      min: num("slider: smallest value"),
      max: num("slider: largest value"),
      step: num("slider: step size"),
      initial: { type: ["number", "string", "boolean"], description: "slider: starting number; toggle: true or false; choice: the starting option's value" },
      unit: str("slider: unit shown after the value"),
      choices: {
        type: "array", description: "choice: the options to pick from",
        items: { type: "object", properties: { label: { type: "string" }, value: { type: ["number", "string"] } }, required: ["label", "value"] },
      },
      items: {
        type: "array", description: "display: live values computed from formulas",
        items: { type: "object", properties: { label: { type: "string" }, expression: { type: "string" }, unit: { type: "string" } }, required: ["label", "expression"] },
      },
      functions: {
        type: "array", description: "plot: up to 4 formulas in x, e.g. a * sin(x)",
        items: { type: "object", properties: { expression: { type: "string" }, label: { type: "string" } }, required: ["expression"] },
      },
      xMin: num("plot: left edge of x"),
      xMax: num("plot: right edge of x"),
      yMin: num("plot: optional fixed bottom of y"),
      yMax: num("plot: optional fixed top of y"),
      xLabel: str("plot, graph: x axis label"),
      yLabel: str("plot, graph: y axis label"),
      kind: { type: "string", enum: ["line", "area", "bar"], description: "graph: chart type" },
      data: {
        type: "array", description: "graph: data points",
        items: { type: "object", properties: { x: { type: ["number", "string"] }, y: { type: "number" } }, required: ["x", "y"] },
      },
      showIf: str("optional on any block: show it only while this expression is true, e.g. showSteps"),
    },
    required: ["type"],
  };
}

export const CREATE_LESSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Lesson title" },
    description: { type: "string", description: "One or two sentences describing the lesson" },
    variables: {
      type: "array", description: "Optional lesson variables: a starting value, or a formula computed from other variables",
      items: { type: "object", properties: { name: { type: "string" }, initial: { type: ["number", "string", "boolean"] }, expression: { type: "string" } }, required: ["name"] },
    },
    blocks: { type: "array", items: blockSchema(false), description: "The lesson's content, in order" },
  },
  required: ["title", "blocks"],
};

type GeneratedBlock = { type: (typeof GENERATED_BLOCK_TYPES)[number]; children?: GeneratedBlock[]; [key: string]: unknown };
const GeneratedBlockSchema: z.ZodType<GeneratedBlock> = z.lazy(() =>
  z.object({ type: z.enum(GENERATED_BLOCK_TYPES), children: z.array(GeneratedBlockSchema).optional() }).passthrough()) as z.ZodType<GeneratedBlock>;

export const CreateLessonInput = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  variables: z.array(z.object({ name: z.string(), initial: z.union([z.number(), z.string(), z.boolean()]).optional(), expression: z.string().optional() })).optional(),
  blocks: z.array(GeneratedBlockSchema).min(1, "A lesson needs at least one block"),
});
export type CreateLessonInput = z.infer<typeof CreateLessonInput>;

const s = (value: unknown) => typeof value === "string" ? value : undefined;
const n = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : undefined;

/** Converts one generated block; the result is checked against the real schema afterwards. */
function convert(block: GeneratedBlock, id: string): Record<string, unknown> {
  const base: Record<string, unknown> = { id, type: block.type, ...(s(block.showIf) ? { showIf: s(block.showIf) } : {}) };
  const b = block as Record<string, unknown>;
  switch (block.type) {
    case "markdown": return { ...base, content: s(b.content) ?? "" };
    case "callout": return { ...base, variant: s(b.variant) ?? "info", title: s(b.title), content: s(b.content) ?? "" };
    case "quiz": return { ...base, question: s(b.question), options: b.options, correctIndex: n(b.correctIndex), explanation: s(b.explanation) };
    case "flashcard": return { ...base, front: s(b.front) ?? "", back: s(b.back) ?? "" };
    case "reveal": return { ...base, title: s(b.title) ?? "Show answer", content: s(b.content) ?? "", initiallyOpen: false };
    case "divider": return base;
    case "section": return { ...base, title: s(b.title), children: (block.children ?? []).map((child, index) => convert(child, `${id}.${index + 1}-${child.type}`)) };
    case "slider": {
      const min = n(b.min) ?? 0;
      return { ...base, label: s(b.label), min, max: n(b.max) ?? 10, step: n(b.step) ?? 1, initial: n(b.initial) ?? min, unit: s(b.unit), variable: s(b.variable) };
    }
    case "toggle": return { ...base, label: s(b.label), variable: s(b.variable), initial: b.initial === true || b.initial === "true" };
    case "choice": {
      const options = Array.isArray(b.choices) ? b.choices : Array.isArray(b.options) ? b.options : [];
      return { ...base, label: s(b.label), variable: s(b.variable), options, initial: b.initial ?? (options[0] as { value?: unknown } | undefined)?.value };
    }
    case "display": return { ...base, title: s(b.title), items: b.items };
    case "plot": return { ...base, title: s(b.title), xLabel: s(b.xLabel), yLabel: s(b.yLabel), xMin: n(b.xMin) ?? -10, xMax: n(b.xMax) ?? 10, yMin: n(b.yMin), yMax: n(b.yMax), functions: b.functions };
    case "graph": return { ...base, title: s(b.title), xLabel: s(b.xLabel), yLabel: s(b.yLabel), kind: s(b.kind) ?? "line", data: b.data };
  }
}

export type BuildResult = { ok: true; content: LessonContent } | { ok: false; problems: string[] };

/** Builds and validates a lesson from create_lesson input; problems are phrased for the model to fix. */
export function buildLesson(input: CreateLessonInput, author = "Curie assistant"): BuildResult {
  const blocks = input.blocks.map((block, index) => convert(block, `b${index + 1}-${block.type}`));
  const parsed = CurieDocumentSchema.safeParse({ documentVersion: 1, ...(input.variables?.length ? { variables: input.variables } : {}), blocks });
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.slice(0, 10).map((issue) => {
        const [, index] = issue.path;
        const block = typeof index === "number" ? blocks[index] : undefined;
        return `${block ? `block ${block.id}` : issue.path.join(".") || "lesson"}: ${issue.path.slice(2).join(".")} ${issue.message}`.replace(/\s+/g, " ").trim();
      }),
    };
  }
  const document: CurieDocument = parsed.data;
  const manifest: CurieManifest = {
    format: "curie", formatVersion: "0.2.0", id: `local.${slugify(input.title)}-${randomId(4)}`,
    title: input.title.trim(), description: input.description?.trim() || undefined, author,
    entry: "document.json", assetsDirectory: "assets/", requiredFeatures: detectFeatures(document),
  };
  const issues = findLessonIssues(manifest, document, {});
  if (issues.length) return { ok: false, problems: issues.slice(0, 10).map((issue) => `${issue.blockId ? `block ${issue.blockId}: ` : ""}${issue.message}`) };
  return { ok: true, content: { manifest, document, assets: {} } };
}

/** A readable text version of a lesson, for the assistant to read. Includes quiz answers. */
export function lessonToText(content: LessonContent, limit = 24000): string {
  const lines: string[] = [`# ${content.manifest.title}`];
  if (content.manifest.description) lines.push(content.manifest.description);
  const visit = (nodes: CurieNode[], depth: number) => {
    for (const node of nodes) {
      switch (node.type) {
        case "markdown": lines.push(node.content); break;
        case "callout": lines.push(`> ${node.title ? `**${node.title}** ` : ""}${node.content}`); break;
        case "reveal": lines.push(`[Reveal: ${node.title}] ${node.content}`); break;
        case "quiz": lines.push(`Quiz: ${node.question}\n${node.options.map((option, index) => `  ${index === node.correctIndex ? "(correct)" : "-"} ${option}`).join("\n")}${node.explanation ? `\n  Explanation: ${node.explanation}` : ""}`); break;
        case "flashcard": lines.push(`Flashcard: ${node.front} → ${node.back}`); break;
        case "section": lines.push(`${"#".repeat(Math.min(depth + 2, 4))} ${node.title ?? "Section"}`); visit(node.children, depth + 1); break;
        case "slider": lines.push(`[Slider "${node.label}"${node.variable ? ` sets ${node.variable}` : ""}: ${node.min} to ${node.max}]`); break;
        case "toggle": case "choice": lines.push(`[${node.type} "${node.label}" sets ${node.variable}]`); break;
        case "display": lines.push(`[Live values: ${node.items.map((item) => `${item.label} = ${item.expression}`).join(", ")}]`); break;
        case "plot": lines.push(`[Plot${node.title ? ` "${node.title}"` : ""}: ${node.functions.map((fn) => `y = ${fn.expression}`).join("; ")}]`); break;
        case "graph": lines.push(`[Chart${node.title ? ` "${node.title}"` : ""}: ${node.data.map((point) => `(${point.x}, ${point.y})`).join(" ")}]`); break;
        case "image": lines.push(`[Image: ${node.alt}${node.caption ? ` — ${node.caption}` : ""}]`); break;
        case "video": case "lottie": case "diagram": lines.push(`[${node.type}${node.title ? `: ${node.title}` : ""}]`); break;
        default: break;
      }
    }
  };
  visit(content.document.blocks, 0);
  const text = lines.join("\n\n");
  return text.length > limit ? `${text.slice(0, limit)}\n\n[…lesson truncated]` : text;
}

/** How many blocks a generated lesson has, for summaries. */
export const blockCount = (content: LessonContent) => flattenBlocks(content.document.blocks).length;
