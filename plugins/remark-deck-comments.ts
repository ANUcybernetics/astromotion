import type { Root, RootContent } from "mdast";
import { isCommentFence, isMultilineMdxComment } from "../src/parse-helpers.ts";

/**
 * Strip authoring comments --- prose about a slide, written for whoever edits
 * the deck next --- so they leave nothing in the rendered deck. A fenced
 * `comment` block is the syntax; `astromotion-text --comments` is what surfaces
 * them again.
 *
 * Multi-line `{/* … *​/}` comments are rejected rather than stripped, because
 * they don't survive a formatter: prettier's markdown printer (and oxfmt with
 * it) escapes the `*` inside one, and the corrupted result is a fixed point no
 * format-check can flag. Failing here turns a silent corruption into a build
 * error with a fix in it. Single-line comments are safe and stay.
 */
export function remarkDeckComments() {
  return (tree: Root, file: { path?: string }) => {
    if (!file.path?.endsWith(".deck.mdx")) return;
    walk(tree as unknown as RootContent, file.path);
  };
}

// Recursive rather than a pass over section children: a comment fence is prose
// the author put wherever it belongs, including inside a JSX block or a list.
function walk(node: RootContent, path: string) {
  const children = (node as any).children as RootContent[] | undefined;
  if (!children) return;
  const kept: RootContent[] = [];
  for (const child of children) {
    if (
      (child.type === "mdxFlowExpression" || child.type === "mdxTextExpression") &&
      isMultilineMdxComment(child.value)
    ) {
      throw new Error(multilineCommentError(path, child));
    }
    if (child.type === "code" && isCommentFence(child.lang)) continue;
    walk(child, path);
    kept.push(child);
  }
  (node as any).children = kept;
}

function multilineCommentError(path: string, node: RootContent): string {
  const line = node.position ? `:${node.position.start.line}` : "";
  return (
    `${path}${line}: a multi-line {/* … */} comment does not survive a ` +
    "formatter --- prettier and oxfmt escape the `*` inside it and the broken " +
    "output is a fixed point. Use a fenced `comment` block instead:\n\n" +
    "    ```comment\n    why this slide is the way it is\n    ```\n\n" +
    "Single-line comments and directives ({/* _class: hero */}) are fine as they are.\n"
  );
}
