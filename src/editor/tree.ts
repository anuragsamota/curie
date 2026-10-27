import type { CurieNode, SectionNode } from "../curie/types";
import { randomId } from "../lib/lesson";

// Immutable operations on the nested block tree. `parentId: null` means the document root.

export type Location = { parentId: string | null; index: number };

export function findBlock(nodes: CurieNode[], id: string): CurieNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.type === "section") {
      const found = findBlock(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

export function locate(nodes: CurieNode[], id: string, parentId: string | null = null): Location | undefined {
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (node.id === id) return { parentId, index };
    if (node.type === "section") {
      const found = locate(node.children, id, node.id);
      if (found) return found;
    }
  }
  return undefined;
}

function mapChildren(nodes: CurieNode[], parentId: string | null, change: (children: CurieNode[]) => CurieNode[]): CurieNode[] {
  if (parentId === null) return change(nodes);
  return nodes.map((node) => {
    if (node.type !== "section") return node;
    if (node.id === parentId) return { ...node, children: change(node.children) };
    return { ...node, children: mapChildren(node.children, parentId, change) };
  });
}

export function updateBlock(nodes: CurieNode[], id: string, update: (node: CurieNode) => CurieNode): CurieNode[] {
  return nodes.map((node) => {
    if (node.id === id) return update(node);
    if (node.type === "section") return { ...node, children: updateBlock(node.children, id, update) };
    return node;
  });
}

export function removeBlock(nodes: CurieNode[], id: string): CurieNode[] {
  return nodes.filter((node) => node.id !== id).map((node) => node.type === "section" ? { ...node, children: removeBlock(node.children, id) } : node);
}

export function insertBlock(nodes: CurieNode[], at: Location, block: CurieNode): CurieNode[] {
  return mapChildren(nodes, at.parentId, (children) => [...children.slice(0, at.index), block, ...children.slice(at.index)]);
}

function contains(node: CurieNode, id: string): boolean {
  return node.type === "section" && node.children.some((child) => child.id === id || contains(child, id));
}

/** Moves a block to a new location; `at.index` refers to positions before the block is removed. */
export function moveBlock(nodes: CurieNode[], id: string, at: Location): CurieNode[] {
  const block = findBlock(nodes, id);
  const from = locate(nodes, id);
  if (!block || !from) return nodes;
  if (at.parentId === id || (at.parentId && contains(block, at.parentId))) return nodes;
  const index = from.parentId === at.parentId && from.index < at.index ? at.index - 1 : at.index;
  return insertBlock(removeBlock(nodes, id), { parentId: at.parentId, index }, block);
}

/** Moves a block one step up or down among its siblings. */
export function nudgeBlock(nodes: CurieNode[], id: string, delta: -1 | 1): CurieNode[] {
  const from = locate(nodes, id);
  if (!from) return nodes;
  const siblings = from.parentId === null ? nodes : (findBlock(nodes, from.parentId) as SectionNode).children;
  const target = from.index + delta;
  if (target < 0 || target >= siblings.length) return nodes;
  return moveBlock(nodes, id, { parentId: from.parentId, index: delta === 1 ? target + 1 : target });
}

export function newBlockId(type: string): string {
  return `${type}-${randomId(5)}`;
}

/** Deep-copies a block, giving it and all its descendants fresh ids. */
export function cloneBlock(node: CurieNode): CurieNode {
  const copy = { ...structuredClone(node), id: newBlockId(node.type) } as CurieNode;
  if (copy.type === "section") copy.children = copy.children.map(cloneBlock);
  return copy;
}

export function duplicateBlock(nodes: CurieNode[], id: string): { blocks: CurieNode[]; copy?: CurieNode } {
  const block = findBlock(nodes, id);
  const from = locate(nodes, id);
  if (!block || !from) return { blocks: nodes };
  const copy = cloneBlock(block);
  return { blocks: insertBlock(nodes, { parentId: from.parentId, index: from.index + 1 }, copy), copy };
}

/** Counts how many blocks reference each asset path. */
export function assetUsage(nodes: CurieNode[], usage = new Map<string, number>()): Map<string, number> {
  for (const node of nodes) {
    if ("src" in node) usage.set(node.src, (usage.get(node.src) ?? 0) + 1);
    if (node.type === "section") assetUsage(node.children, usage);
  }
  return usage;
}
