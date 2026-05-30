import type { Root, RootContent } from "mdast";
import { parseAnimateDirectiveMdx } from "../src/parse-helpers.ts";

/**
 * Converts `{/* _animate *​/}` (and `{/* _animate: id *​/}`) directives into the
 * `data-auto-animate` attribute (and optional `data-auto-animate-id`) that
 * Reveal.js looks for on a `<section>`. Reveal animates between two adjacent
 * slides only when both carry `data-auto-animate` and their
 * `data-auto-animate-id` values match, so a bare flag on a run of slides
 * animates the whole run, while ids scope independent sequences.
 *
 * The directive only flips the slide into auto-animate mode; which elements
 * glide (and how they match) is controlled by `data-id` attributes in the
 * slide's own markup/components, exactly as in hand-written Reveal HTML.
 */
export function remarkDeckAnimate() {
  return (tree: Root, file: { path?: string }) => {
    if (!file.path?.endsWith(".deck.mdx")) return;
    for (const section of tree.children) {
      if ((section as any).type !== "mdxJsxFlowElement" || (section as any).name !== "section")
        continue;
      const sec = section as any;
      const newChildren: RootContent[] = [];
      let animate: { id: string | null } | null = null;
      for (const child of sec.children as RootContent[]) {
        if ((child as any).type === "mdxFlowExpression") {
          const parsed = parseAnimateDirectiveMdx((child as any).value);
          if (parsed !== null) {
            animate = parsed;
            continue;
          }
        }
        newChildren.push(child);
      }
      sec.children = newChildren;
      if (animate !== null) {
        sec.attributes.push({
          type: "mdxJsxAttribute",
          name: "data-auto-animate",
          value: null,
        });
        if (animate.id !== null) {
          sec.attributes.push({
            type: "mdxJsxAttribute",
            name: "data-auto-animate-id",
            value: animate.id,
          });
        }
      }
    }
  };
}
