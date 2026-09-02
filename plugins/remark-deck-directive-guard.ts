import type { Root } from "mdast";
import { isSlideDirective } from "../src/parse-helpers.ts";

/**
 * A slide directive only works as a *flow* expression --- a `{/* … *​/}`
 * comment alone on its line, with a blank line either side. Put two of them on
 * one line and MDX parses both as inline expressions inside a paragraph, where
 * none of the directive plugins look: the slide silently loses its class, its
 * id, or its include, with no build error and nothing to see until someone
 * notices a slide has lost its layout.
 *
 * That is not a hypothetical. Prettier's markdown printer (which oxfmt
 * reproduces) folds two adjacent single-line comments onto one line, so a
 * formatter run over a deck introduces it, and the folded output is itself a
 * stable fixed point --- a format-check cannot see it either. Hence this
 * guard: erroring is the only way the corruption stays visible.
 */
export function remarkDeckDirectiveGuard() {
  return (tree: Root, file: { path?: string }) => {
    if (!file.path?.endsWith(".deck.mdx")) return;
    assertNoInlineDirectives(tree, file.path);
  };
}

/**
 * Also called by remarkDeckIncludes on each partial as it is parsed, before
 * the splice strips positions --- checking there is what lets the error name
 * the partial and its line rather than the deck that included it.
 */
export function assertNoInlineDirectives(tree: Root, path: string): void {
  walk(tree as unknown as Node, (node) => {
    if (node.type !== "mdxTextExpression") return;
    if (!isSlideDirective(node.value ?? "")) return;
    throw new Error(inlineDirectiveError(path, node));
  });
}

interface Node {
  type: string;
  value?: string;
  position?: { start: { line: number } };
  children?: Node[];
}

function walk(node: Node, visit: (node: Node) => void): void {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

function inlineDirectiveError(path: string, node: Node): string {
  const line = node.position ? `:${node.position.start.line}` : "";
  return (
    `${path}${line}: {${node.value}} is an inline MDX expression, so astromotion ` +
    "cannot apply it to the slide. A slide directive must sit alone on its " +
    "line, with a blank line between it and the next one:\n\n" +
    "    {/* _class: impact */}\n\n    {/* _id: intro */}\n\n" +
    "Two directives on one line is what a markdown formatter leaves behind " +
    "when it folds them together.\n"
  );
}
