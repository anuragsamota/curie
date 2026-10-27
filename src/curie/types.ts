import { z } from "zod";
import { NAME_PATTERN } from "./expr";

/** `showIf` hides a block while its expression is false. */
const Base = { id: z.string().min(1), showIf: z.string().optional() };
const Source = z.string().min(1, "Choose a file or enter a URL");
const VariableName = z.string().regex(NAME_PATTERN, "Use letters, digits and _ for variable names, starting with a letter");
const Scalar = z.union([z.number(), z.string(), z.boolean()]);

// Input is `unknown` because defaulted fields (e.g. graph `kind`) are optional before parsing.
export const CurieNodeSchema: z.ZodType<CurieNode, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ ...Base, type: z.literal("markdown"), content: z.string() }),
    z.object({ ...Base, type: z.literal("image"), src: Source, alt: z.string(), caption: z.string().optional() }),
    z.object({ ...Base, type: z.literal("video"), src: Source, title: z.string().optional(), caption: z.string().optional() }),
    z.object({
      ...Base, type: z.literal("graph"), title: z.string().optional(),
      xLabel: z.string().optional(), yLabel: z.string().optional(),
      data: z.array(z.object({ x: z.union([z.number(), z.string()]), y: z.number() })).min(1),
      kind: z.enum(["line", "area", "bar"]).default("line"),
    }),
    z.object({ ...Base, type: z.literal("lottie"), src: Source, title: z.string().optional(), caption: z.string().optional(), loop: z.boolean().default(true), autoplay: z.boolean().default(true) }),
    z.object({ ...Base, type: z.literal("callout"), variant: z.enum(["info", "tip", "warning", "success"]).default("info"), title: z.string().optional(), content: z.string() }),
    z.object({ ...Base, type: z.literal("divider") }),
    z.object({ ...Base, type: z.literal("reveal"), title: z.string().min(1), content: z.string(), initiallyOpen: z.boolean().default(false) }),
    z.object({ ...Base, type: z.literal("quiz"), question: z.string().min(1), options: z.array(z.string()).min(2).max(8), correctIndex: z.number().int().nonnegative(), explanation: z.string().optional() }),
    z.object({ ...Base, type: z.literal("slider"), label: z.string().min(1), min: z.number(), max: z.number(), step: z.number().positive().default(1), initial: z.number(), unit: z.string().optional(), variable: VariableName.optional() }),
    z.object({ ...Base, type: z.literal("toggle"), label: z.string().min(1), variable: VariableName, initial: z.boolean().default(false) }),
    z.object({
      ...Base, type: z.literal("choice"), label: z.string().min(1), variable: VariableName,
      options: z.array(z.object({ label: z.string().min(1), value: z.union([z.number(), z.string()]) })).min(2).max(12),
      initial: z.union([z.number(), z.string()]),
    }),
    z.object({
      ...Base, type: z.literal("button"), label: z.string().min(1), style: z.enum(["primary", "outline"]).default("primary"),
      actions: z.array(z.object({ variable: VariableName, expression: z.string().min(1, "Enter a value or formula") })).min(1, "Add at least one action"),
    }),
    z.object({
      ...Base, type: z.literal("display"), title: z.string().optional(),
      items: z.array(z.object({ label: z.string(), expression: z.string().min(1, "Enter a formula"), unit: z.string().optional() })).min(1),
    }),
    z.object({
      ...Base, type: z.literal("plot"), title: z.string().optional(), xLabel: z.string().optional(), yLabel: z.string().optional(),
      xMin: z.number(), xMax: z.number(), yMin: z.number().optional(), yMax: z.number().optional(),
      functions: z.array(z.object({ expression: z.string().min(1, "Enter a formula in x"), label: z.string().optional() })).min(1).max(6),
    }),
    z.object({
      ...Base, type: z.literal("diagram"), src: Source, title: z.string().optional(), caption: z.string().optional(),
      bindings: z.array(z.object({ target: z.string().min(1, "Enter an element id"), property: z.string().regex(/^(text|[a-zA-Z][\w:-]*)$/, "Enter an attribute name"), expression: z.string().min(1, "Enter a formula") })).default([]),
    }),
    z.object({ ...Base, type: z.literal("flashcard"), front: z.string(), back: z.string() }),
    z.object({ ...Base, type: z.literal("section"), title: z.string().optional(), children: z.array(CurieNodeSchema) }),
  ]),
);

type Common = { id: string; showIf?: string };
export type MarkdownNode = Common & { type: "markdown"; content: string };
export type ImageNode = Common & { type: "image"; src: string; alt: string; caption?: string };
export type VideoNode = Common & { type: "video"; src: string; title?: string; caption?: string };
export type GraphNode = Common & { type: "graph"; title?: string; xLabel?: string; yLabel?: string; data: { x: number | string; y: number }[]; kind: "line" | "area" | "bar" };
export type LottieNode = Common & { type: "lottie"; src: string; title?: string; caption?: string; loop?: boolean; autoplay?: boolean };
export type CalloutNode = Common & { type: "callout"; variant: "info" | "tip" | "warning" | "success"; title?: string; content: string };
export type DividerNode = Common & { type: "divider" };
export type RevealNode = Common & { type: "reveal"; title: string; content: string; initiallyOpen?: boolean };
export type QuizNode = Common & { type: "quiz"; question: string; options: string[]; correctIndex: number; explanation?: string };
export type SliderNode = Common & { type: "slider"; label: string; min: number; max: number; step?: number; initial: number; unit?: string; variable?: string };
export type FlashcardNode = Common & { type: "flashcard"; front: string; back: string };
export type SectionNode = Common & { type: "section"; title?: string; children: CurieNode[] };
export type ToggleNode = Common & { type: "toggle"; label: string; variable: string; initial: boolean };
export type ChoiceNode = Common & { type: "choice"; label: string; variable: string; options: { label: string; value: number | string }[]; initial: number | string };
export type ButtonNode = Common & { type: "button"; label: string; style?: "primary" | "outline"; actions: { variable: string; expression: string }[] };
export type DisplayNode = Common & { type: "display"; title?: string; items: { label: string; expression: string; unit?: string }[] };
export type PlotNode = Common & { type: "plot"; title?: string; xLabel?: string; yLabel?: string; xMin: number; xMax: number; yMin?: number; yMax?: number; functions: { expression: string; label?: string }[] };
export type DiagramNode = Common & { type: "diagram"; src: string; title?: string; caption?: string; bindings: { target: string; property: string; expression: string }[] };
export type CurieNode = MarkdownNode | ImageNode | VideoNode | GraphNode | LottieNode | CalloutNode | DividerNode | RevealNode | QuizNode | SliderNode | FlashcardNode | SectionNode
  | ToggleNode | ChoiceNode | ButtonNode | DisplayNode | PlotNode | DiagramNode;

export const SUPPORTED_FEATURES = [
  "markdown", "math", "image", "video", "graph", "lottie", "quiz", "slider", "reveal", "flashcard", "callout", "divider", "section",
  "variables", "toggle", "choice", "button", "display", "plot", "diagram",
] as const;

export const CurieManifestSchema = z.object({
  format: z.literal("curie"),
  formatVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  author: z.string().optional(),
  /** Optional cover image, a path inside assets/. Older versions of Curie ignore it. */
  cover: z.string().regex(/^assets\/[^/].*/, "The cover must be a file inside assets/").optional(),
  entry: z.literal("document.json"),
  assetsDirectory: z.literal("assets/").default("assets/"),
  // Unknown features are accepted here and reported as a compatibility error by the package loader.
  requiredFeatures: z.array(z.string()).default([]),
});
export type CurieManifest = z.infer<typeof CurieManifestSchema>;

/**
 * A lesson-level variable: a starting value (changed by buttons) or a formula computed from other
 * variables. Input blocks (slider, toggle, choice) declare their own variables.
 */
export const VariableSchema = z.object({
  name: VariableName,
  initial: Scalar.optional(),
  expression: z.string().optional(),
});
export type CurieVariable = z.infer<typeof VariableSchema>;

export const CurieDocumentSchema = z.object({
  documentVersion: z.literal(1),
  variables: z.array(VariableSchema).optional(),
  blocks: z.array(CurieNodeSchema),
});
export type CurieDocument = z.infer<typeof CurieDocumentSchema>;
