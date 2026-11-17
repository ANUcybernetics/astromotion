import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import { remarkDeckSections } from "../plugins/remark-deck-sections.ts";
import { remarkDeckAnimate } from "../plugins/remark-deck-animate.ts";
import { attrOf, sectionAt } from "./mdast-helpers.ts";

async function run(input: string, path = "test.deck.mdx") {
  const tree = unified().use(remarkParse).use(remarkMdx).parse(input);
  await unified().use(remarkDeckSections).use(remarkDeckAnimate).run(tree, { path });
  return tree;
}

describe("remarkDeckAnimate", () => {
  it("adds data-auto-animate to a slide carrying the bare flag", async () => {
    const input = "{/* _animate */}\n\n# A\n\n---\n\n# B\n";
    const tree = await run(input);
    const first = sectionAt(tree, 0);
    const second = sectionAt(tree, 1);
    expect(attrOf(first, "data-auto-animate")).toBeDefined();
    expect(attrOf(first, "data-auto-animate")?.value).toBeNull();
    expect(attrOf(first, "data-auto-animate-id")).toBeUndefined();
    expect(attrOf(second, "data-auto-animate")).toBeUndefined();
  });

  it("adds data-auto-animate-id when an id is given", async () => {
    const input = "{/* _animate: pile */}\n\n# A\n";
    const tree = await run(input);
    const first = sectionAt(tree, 0);
    expect(attrOf(first, "data-auto-animate")).toBeDefined();
    expect(attrOf(first, "data-auto-animate-id")?.value).toBe("pile");
  });

  it("removes the directive node from the section's children", async () => {
    const input = "{/* _animate */}\n\n# Title\n";
    const tree = await run(input);
    const section = sectionAt(tree, 0);
    const exprNodes = section.children.filter((c) => c.type === "mdxFlowExpression");
    expect(exprNodes.length).toBe(0);
  });

  it("does nothing for non-.deck.mdx files", async () => {
    const input = "{/* _animate */}\n\n# X\n";
    const tree = await run(input, "ordinary.md");
    expect(tree.children.length).toBe(2);
  });
});
