import remarkSmartypants from "remark-smartypants";
import type { Root } from "mdast";

// Wrap remark-smartypants so unified can't deduplicate it against Astro's
// default mdx integration (which also registers remark-smartypants). When
// references match, unified merges the registrations and only the earliest
// position runs -- before remarkDeckIncludes splices in @include content, so
// the spliced text never gets processed. This wrapper has its own reference
// and runs at the end of the deck pipeline, after includes are resolved.
export function remarkDeckSmartypants() {
  const plugin = remarkSmartypants as unknown as (opts: { dashes: string }) => (tree: Root) => void;
  const inner = plugin({ dashes: "oldschool" });
  return (tree: Root, file: { path?: string }) => {
    if (!file.path?.endsWith(".deck.mdx")) return;
    inner(tree);
  };
}
