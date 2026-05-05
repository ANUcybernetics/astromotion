import type { Root, RootContent } from "mdast";

interface MdxJsxFlowElement {
  type: "mdxJsxFlowElement";
  name: string;
  attributes: Array<{ type: "mdxJsxAttribute"; name: string; value: string | null }>;
  children: RootContent[];
}

function makeSection(children: RootContent[]): MdxJsxFlowElement {
  return {
    type: "mdxJsxFlowElement",
    name: "section",
    attributes: [],
    children,
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
    tree.children = sections as unknown as RootContent[];
  };
}
