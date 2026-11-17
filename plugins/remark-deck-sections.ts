import type { Root, RootContent } from "mdast";
import { flowChildren, type MdxJsxFlowElement } from "./section-directive.ts";

function makeSection(children: RootContent[]): MdxJsxFlowElement {
  return {
    type: "mdxJsxFlowElement",
    name: "section",
    attributes: [],
    children: flowChildren(children),
  };
}

export function remarkDeckSections() {
  return (tree: Root, file: { path?: string }) => {
    if (!file.path?.endsWith(".deck.mdx")) return;
    const sections: MdxJsxFlowElement[] = [];
    let current: RootContent[] = [];
    for (const node of tree.children) {
      if (node.type === "thematicBreak") {
        if (current.length > 0) sections.push(makeSection(current));
        current = [];
      } else {
        current.push(node);
      }
    }
    if (current.length > 0) sections.push(makeSection(current));
    tree.children = sections;
  };
}
