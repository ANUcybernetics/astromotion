import type { Root, RootContent } from "mdast";
import { isSection, type MdxJsxFlowElement } from "../plugins/section-directive.ts";

export type NodeOfType<T extends RootContent["type"]> = Extract<RootContent, { type: T }>;

/** The tree's `index`th top-level node, failing loudly when there isn't one. */
export function nodeAt(tree: Root, index: number): RootContent {
  const node = tree.children[index];
  if (!node) throw new Error(`expected a node at index ${index}, tree has ${tree.children.length}`);
  return node;
}

/** The tree's `index`th top-level node, which must be a `<section>`. */
export function sectionAt(tree: Root, index: number): MdxJsxFlowElement {
  const node = nodeAt(tree, index);
  if (!isSection(node)) throw new Error(`expected a <section> at index ${index}, got ${node.type}`);
  return node;
}

/** Narrow a node to a JSX flow element (`<div>`, `<aside>`, ...). */
export function asElement(node: RootContent | undefined): MdxJsxFlowElement {
  if (node?.type !== "mdxJsxFlowElement") {
    throw new Error(`expected an mdxJsxFlowElement, got ${node?.type ?? "nothing"}`);
  }
  return node;
}

export function attrOf(
  node: RootContent | undefined,
  name: string,
): Extract<MdxJsxFlowElement["attributes"][number], { type: "mdxJsxAttribute" }> | undefined {
  if (node?.type !== "mdxJsxFlowElement") return undefined;
  for (const a of node.attributes) {
    if (a.type === "mdxJsxAttribute" && a.name === name) return a;
  }
  return undefined;
}

/** A string attribute's value; `null` for a bare flag, `undefined` when absent. */
export function attrValue(node: RootContent | undefined, name: string): string | null | undefined {
  const value = attrOf(node, name)?.value;
  return typeof value === "string" || value === null ? value : undefined;
}

/** All nodes of one `type`, narrowed to that node's mdast type. */
export function ofType<T extends RootContent["type"]>(
  nodes: RootContent[],
  type: T,
): NodeOfType<T>[] {
  return nodes.filter((n): n is NodeOfType<T> => n.type === type);
}

/** Every `type` in the subtree rooted at `node`, itself included. */
export function descendantTypes(node: RootContent): string[] {
  const below = "children" in node ? node.children.flatMap(descendantTypes) : [];
  return [node.type, ...below];
}

/** The concatenated text values in the subtree rooted at `node`. */
export function textOf(node: RootContent): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  return "children" in node ? node.children.map(textOf).join("") : "";
}
