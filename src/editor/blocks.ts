import {
  ChartLine, Film, GalleryVerticalEnd, Image, Layers, Lightbulb, ListChecks, Minus, PanelTopOpen,
  SlidersHorizontal, Sparkles, Type,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CurieNode } from "../curie/types";
import { newBlockId } from "./tree";

type BlockType = CurieNode["type"];

export type BlockDefinition = {
  label: string;
  description: string;
  icon: LucideIcon;
  group: "Content" | "Media" | "Interactive" | "Layout";
  create: () => CurieNode;
};

export const BLOCKS: Record<BlockType, BlockDefinition> = {
  markdown: { label: "Text", description: "Paragraphs, lists, code and math", icon: Type, group: "Content", create: () => ({ id: newBlockId("text"), type: "markdown", content: "Write something here. Use **bold**, lists, and math like $a^2 + b^2 = c^2$." }) },
  callout: { label: "Callout", description: "Highlighted tip, note or warning", icon: Lightbulb, group: "Content", create: () => ({ id: newBlockId("callout"), type: "callout", variant: "tip", title: "Tip", content: "A helpful hint for the learner." }) },
  image: { label: "Image", description: "Picture or diagram with a caption", icon: Image, group: "Media", create: () => ({ id: newBlockId("image"), type: "image", src: "", alt: "", caption: "" }) },
  video: { label: "Video", description: "MP4 or WebM video", icon: Film, group: "Media", create: () => ({ id: newBlockId("video"), type: "video", src: "", title: "" }) },
  lottie: { label: "Animation", description: "Lottie JSON animation", icon: Sparkles, group: "Media", create: () => ({ id: newBlockId("animation"), type: "lottie", src: "", loop: true, autoplay: true }) },
  graph: { label: "Graph", description: "Line, area or bar chart", icon: ChartLine, group: "Media", create: () => ({ id: newBlockId("graph"), type: "graph", kind: "line", title: "", xLabel: "x", yLabel: "y", data: [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 2, y: 4 }] }) },
  quiz: { label: "Quiz", description: "Multiple-choice quick check", icon: ListChecks, group: "Interactive", create: () => ({ id: newBlockId("quiz"), type: "quiz", question: "Your question here?", options: ["First answer", "Second answer", "Third answer"], correctIndex: 0, explanation: "" }) },
  slider: { label: "Slider", description: "Explore a numeric value", icon: SlidersHorizontal, group: "Interactive", create: () => ({ id: newBlockId("slider"), type: "slider", label: "Pick a value", min: 0, max: 10, step: 1, initial: 5 }) },
  reveal: { label: "Reveal", description: "Hidden hint or explanation", icon: PanelTopOpen, group: "Interactive", create: () => ({ id: newBlockId("reveal"), type: "reveal", title: "Show a hint", content: "The hidden explanation.", initiallyOpen: false }) },
  flashcard: { label: "Flashcard", description: "Flip to reveal the answer", icon: GalleryVerticalEnd, group: "Interactive", create: () => ({ id: newBlockId("flashcard"), type: "flashcard", front: "Question", back: "Answer" }) },
  section: { label: "Section", description: "Group blocks under a heading", icon: Layers, group: "Layout", create: () => ({ id: newBlockId("section"), type: "section", title: "New section", children: [] }) },
  divider: { label: "Divider", description: "Visual break between parts", icon: Minus, group: "Layout", create: () => ({ id: newBlockId("divider"), type: "divider" }) },
};

export const BLOCK_GROUPS = ["Content", "Media", "Interactive", "Layout"] as const;

/** A one-line label for a block in the outline. */
export function blockSummary(node: CurieNode): string {
  const firstLine = (text: string) => text.replace(/[#*_`>$\\]/g, "").split("\n").map((line) => line.trim()).find(Boolean) ?? "";
  switch (node.type) {
    case "markdown": return firstLine(node.content) || "Empty text";
    case "callout": return node.title || firstLine(node.content) || "Callout";
    case "image": return node.alt || node.caption || node.src.split("/").pop() || "Image";
    case "video": case "lottie": return node.title || node.caption || node.src.split("/").pop() || BLOCKS[node.type].label;
    case "graph": return node.title || `${node.kind} chart`;
    case "quiz": return node.question;
    case "slider": return node.label;
    case "reveal": return node.title;
    case "flashcard": return node.front;
    case "section": return node.title || "Untitled section";
    case "divider": return "Divider";
  }
}

export function acceptsAsset(type: BlockType): "image" | "video" | "lottie" | undefined {
  return type === "image" || type === "video" || type === "lottie" ? type : undefined;
}

export function assetKind(path: string): "image" | "video" | "lottie" | "other" {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "bmp", "ico"].includes(ext)) return "image";
  if (["mp4", "webm", "ogv", "mov"].includes(ext)) return "video";
  if (ext === "json") return "lottie";
  return "other";
}
