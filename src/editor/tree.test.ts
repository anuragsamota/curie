import { describe, expect, it } from "vitest";
import type { CurieNode } from "../curie/types";
import { assetUsage, cloneBlock, duplicateBlock, findBlock, insertBlock, locate, moveBlock, nudgeBlock, removeBlock, updateBlock } from "./tree";

const text = (id: string): CurieNode => ({ id, type: "markdown", content: id });
const tree = (): CurieNode[] => [
  text("a"),
  { id: "s", type: "section", title: "S", children: [text("b"), text("c")] },
  { id: "img", type: "image", src: "assets/x.png", alt: "" },
];
const ids = (nodes: CurieNode[]): unknown[] => nodes.map((node) => node.type === "section" ? { [node.id]: ids(node.children) } : node.id);

describe("block tree", () => {
  it("finds and locates nested blocks", () => {
    expect(findBlock(tree(), "c")).toMatchObject({ id: "c" });
    expect(locate(tree(), "c")).toEqual({ parentId: "s", index: 1 });
    expect(locate(tree(), "img")).toEqual({ parentId: null, index: 2 });
  });

  it("updates, inserts and removes without mutating the input", () => {
    const original = tree();
    const updated = updateBlock(original, "b", (node) => ({ ...node, content: "changed" }) as CurieNode);
    expect(findBlock(updated, "b")).toMatchObject({ content: "changed" });
    expect(findBlock(original, "b")).toMatchObject({ content: "b" });
    expect(ids(insertBlock(original, { parentId: "s", index: 0 }, text("new")))).toEqual(["a", { s: ["new", "b", "c"] }, "img"]);
    expect(ids(removeBlock(original, "b"))).toEqual(["a", { s: ["c"] }, "img"]);
  });

  it("moves blocks within and across parents", () => {
    expect(ids(moveBlock(tree(), "a", { parentId: null, index: 3 }))).toEqual([{ s: ["b", "c"] }, "img", "a"]);
    expect(ids(moveBlock(tree(), "img", { parentId: "s", index: 1 }))).toEqual(["a", { s: ["b", "img", "c"] }]);
    expect(ids(moveBlock(tree(), "c", { parentId: null, index: 0 }))).toEqual(["c", "a", { s: ["b"] }, "img"]);
  });

  it("refuses to move a section into itself", () => {
    expect(ids(moveBlock(tree(), "s", { parentId: "s", index: 0 }))).toEqual(ids(tree()));
  });

  it("nudges among siblings and stops at the edges", () => {
    expect(ids(nudgeBlock(tree(), "c", -1))).toEqual(["a", { s: ["c", "b"] }, "img"]);
    expect(ids(nudgeBlock(tree(), "a", 1))).toEqual([{ s: ["b", "c"] }, "a", "img"]);
    expect(ids(nudgeBlock(tree(), "a", -1))).toEqual(ids(tree()));
  });

  it("duplicates with fresh ids for the whole subtree", () => {
    const { blocks, copy } = duplicateBlock(tree(), "s");
    expect(blocks).toHaveLength(4);
    expect(copy!.id).not.toBe("s");
    const childIds = (copy as Extract<CurieNode, { type: "section" }>).children.map((child) => child.id);
    expect(childIds).not.toContain("b");
    expect(new Set(childIds).size).toBe(2);
    expect(cloneBlock(text("x")).id).toMatch(/^markdown-/);
  });

  it("counts asset usage", () => {
    expect(assetUsage([...tree(), { id: "i2", type: "image", src: "assets/x.png", alt: "" }]).get("assets/x.png")).toBe(2);
  });
});
