import type { Root, RootContent } from "mdast";
import { parseIfDirectiveMdx } from "../src/parse-helpers.ts";

export function remarkDeckConditionals() {
  return (tree: Root, file: { path?: string }) => {
    if (!file.path?.endsWith(".deck.mdx")) return;
    for (const section of tree.children) {
      if ((section as any).type !== "mdxJsxFlowElement" || (section as any).name !== "section")
        continue;
      const sec = section as any;
      const newChildren: RootContent[] = [];
      let condition: string | null = null;
      for (const child of sec.children as RootContent[]) {
        if ((child as any).type === "mdxFlowExpression") {
          const cond = parseIfDirectiveMdx((child as any).value);
          if (cond !== null) {
            condition = cond;
            continue;
          }
        }
        newChildren.push(child);
      }
      sec.children = newChildren;
      if (condition !== null) {
        sec.attributes.push({ type: "mdxJsxAttribute", name: "data-deck-if", value: condition });
      }
    }
  };
}
