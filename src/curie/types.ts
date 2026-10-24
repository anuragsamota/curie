import { z } from "zod";

const Base = { id: z.string().min(1) };

export const CurieNodeSchema: z.ZodType<CurieNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ ...Base, type: z.literal("markdown"), content: z.string() }),
    z.object({ ...Base, type: z.literal("image"), src: z.string().min(1), alt: z.string(), caption: z.string().optional() }),
    z.object({ ...Base, type: z.literal("video"), src: z.string().min(1), title: z.string().optional(), caption: z.string().optional() }),
    z.object({
      ...Base, type: z.literal("graph"), title: z.string().optional(),
      xLabel: z.string().optional(), yLabel: z.string().optional(),
      data: z.array(z.object({ x: z.union([z.number(), z.string()]), y: z.number() })).min(1),
      kind: z.enum(["line", "area", "bar"]).default("line"),
    }),
    z.object({ ...Base, type: z.literal("lottie"), src: z.string().min(1), title: z.string().optional(), caption: z.string().optional(), loop: z.boolean().default(true), autoplay: z.boolean().default(true) }),
    z.object({ ...Base, type: z.literal("callout"), variant: z.enum(["info", "tip", "warning", "success"]).default("info"), title: z.string().optional(), content: z.string() }),
    z.object({ ...Base, type: z.literal("divider") }),
    z.object({ ...Base, type: z.literal("reveal"), title: z.string().min(1), content: z.string(), initiallyOpen: z.boolean().default(false) }),
    z.object({ ...Base, type: z.literal("quiz"), question: z.string().min(1), options: z.array(z.string()).min(2).max(8), correctIndex: z.number().int().nonnegative(), explanation: z.string().optional() }),
    z.object({ ...Base, type: z.literal("slider"), label: z.string().min(1), min: z.number(), max: z.number(), step: z.number().positive().default(1), initial: z.number(), unit: z.string().optional() }),
    z.object({ ...Base, type: z.literal("flashcard"), front: z.string(), back: z.string() }),
    z.object({ ...Base, type: z.literal("section"), title: z.string().optional(), children: z.array(CurieNodeSchema) }),
  ]),
);

export type MarkdownNode = { id: string; type: "markdown"; content: string };
export type ImageNode = { id: string; type: "image"; src: string; alt: string; caption?: string };
export type VideoNode = { id: string; type: "video"; src: string; title?: string; caption?: string };
export type GraphNode = { id: string; type: "graph"; title?: string; xLabel?: string; yLabel?: string; data: { x: number | string; y: number }[]; kind: "line" | "area" | "bar" };
export type LottieNode = { id: string; type: "lottie"; src: string; title?: string; caption?: string; loop?: boolean; autoplay?: boolean };
export type CalloutNode = { id: string; type: "callout"; variant: "info" | "tip" | "warning" | "success"; title?: string; content: string };
export type DividerNode = { id: string; type: "divider" };
export type RevealNode = { id: string; type: "reveal"; title: string; content: string; initiallyOpen?: boolean };
export type QuizNode = { id: string; type: "quiz"; question: string; options: string[]; correctIndex: number; explanation?: string };
export type SliderNode = { id: string; type: "slider"; label: string; min: number; max: number; step?: number; initial: number; unit?: string };
export type FlashcardNode = { id: string; type: "flashcard"; front: string; back: string };
export type SectionNode = { id: string; type: "section"; title?: string; children: CurieNode[] };
export type CurieNode = MarkdownNode | ImageNode | VideoNode | GraphNode | LottieNode | CalloutNode | DividerNode | RevealNode | QuizNode | SliderNode | FlashcardNode | SectionNode;

export const CurieManifestSchema = z.object({
  format: z.literal("curie"),
  formatVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  author: z.string().optional(),
  entry: z.literal("document.json"),
  assetsDirectory: z.literal("assets/").default("assets/"),
  requiredFeatures: z.array(z.enum(["markdown", "math", "image", "video", "graph", "lottie", "quiz", "slider", "reveal", "flashcard", "callout"])).default([]),
});
export type CurieManifest = z.infer<typeof CurieManifestSchema>;

export const CurieDocumentSchema = z.object({
  documentVersion: z.literal(1),
  blocks: z.array(CurieNodeSchema),
});
export type CurieDocument = z.infer<typeof CurieDocumentSchema>;
