/// <reference types="remark-mdx" />
import type { Root, RootContent } from "mdast";

/** A slide `<section>`, as `remarkDeckSections` builds it. */
export type MdxJsxFlowElement = Extract<RootContent, { type: "mdxJsxFlowElement" }>;
export type MdxJsxAttribute = MdxJsxFlowElement["attributes"][number];

/**
 * Narrow nodes taken from `Root.children` (typed as any `RootContent`) to what
 * a flow element may hold. Every caller passes nodes that already sat at flow
 * level in the deck, so this is a typing gap in mdast, not a runtime change.
 */
export function flowChildren(nodes: RootContent[]): MdxJsxFlowElement["children"] {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- mdast types Root.children as RootContent but flow elements as BlockContent | DefinitionContent; these nodes were top-level flow nodes
  return nodes as MdxJsxFlowElement["children"];
}

export function isSection(node: RootContent): node is MdxJsxFlowElement {
  return node.type === "mdxJsxFlowElement" && node.name === "section";
}

/**
 * The shared shape of the single-directive slide plugins (`_class`, `_if`,
 * `_id`, `_animate`, `notes:`): walk each `<section>`, pull out any
 * mdxFlowExpression comment the parser recognises (last one wins, matching
 * the historical per-plugin behaviour), and once the section's children are
 * filtered, apply the parsed value to the section.
 */
export function sectionDirective<T>(
  parse: (value: string) => T | null,
  apply: (section: MdxJsxFlowElement, parsed: T) => void,
) {
  return (tree: Root, file: { path?: string }) => {
    if (!file.path?.endsWith(".deck.mdx")) return;
    for (const sec of tree.children) {
      if (!isSection(sec)) continue;
      const newChildren: RootContent[] = [];
      let parsed: T | null = null;
      for (const child of sec.children) {
        if (child.type === "mdxFlowExpression") {
          const p = parse(child.value);
          if (p !== null) {
            parsed = p;
            continue;
          }
        }
        newChildren.push(child);
      }
      sec.children = flowChildren(newChildren);
      if (parsed !== null) apply(sec, parsed);
    }
  };
}

export function attr(name: string, value: string | null): MdxJsxAttribute {
  return { type: "mdxJsxAttribute", name, value };
}
