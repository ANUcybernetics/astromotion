import type { Root, RootContent } from "mdast";
import { parseIdDirectiveMdx } from "../src/parse-helpers.ts";

export function remarkDeckIds() {
  return (tree: Root, file: { path?: string }) => {
    if (!file.path?.endsWith(".deck.mdx")) return;
    for (const section of tree.children) {
      if ((section as any).type !== "mdxJsxFlowElement" || (section as any).name !== "section")
        continue;
      const sec = section as any;
      const newChildren: RootContent[] = [];
      let id: string | null = null;
      for (const child of sec.children as RootContent[]) {
        if ((child as any).type === "mdxFlowExpression") {
          const parsed = parseIdDirectiveMdx((child as any).value);
          if (parsed !== null) {
            id = parsed;
            continue;
          }
        }
        newChildren.push(child);
      }
      sec.children = newChildren;
      if (id !== null) {
        sec.attributes.push({ type: "mdxJsxAttribute", name: "id", value: id });
      }
    }
  };
}
