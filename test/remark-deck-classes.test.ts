import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import { remarkDeckSections } from "../plugins/remark-deck-sections.ts";
import { remarkDeckClasses } from "../plugins/remark-deck-classes.ts";
import { attrOf, attrValue, sectionAt } from "./mdast-helpers.ts";

describe("remarkDeckClasses", () => {
  it("applies class from {/* _class: */} directive to parent section", async () => {
    const input = "{/* _class: impact */}\n\n# Loud\n\n---\n\n# Quiet\n";
    const tree = unified().use(remarkParse).use(remarkMdx).parse(input);
    await unified()
      .use(remarkDeckSections)
      .use(remarkDeckClasses)
      .run(tree, { path: "test.deck.mdx" });
    const first = sectionAt(tree, 0);
    expect(attrValue(first, "class")).toBe("impact");
    const second = sectionAt(tree, 1);
    expect(attrOf(second, "class")).toBeUndefined();
  });

  it("removes the directive node from the section's children", async () => {
    const input = "{/* _class: banner */}\n\n# Title\n";
    const tree = unified().use(remarkParse).use(remarkMdx).parse(input);
    await unified()
      .use(remarkDeckSections)
      .use(remarkDeckClasses)
      .run(tree, { path: "test.deck.mdx" });
    const section = sectionAt(tree, 0);
    const exprNodes = section.children.filter((c) => c.type === "mdxFlowExpression");
    expect(exprNodes.length).toBe(0);
  });

  it("does nothing for non-.deck.mdx files", async () => {
    const input = "{/* _class: impact */}\n\n# X\n";
    const tree = unified().use(remarkParse).use(remarkMdx).parse(input);
    await unified()
      .use(remarkDeckSections)
      .use(remarkDeckClasses)
      .run(tree, { path: "ordinary.md" });
    expect(tree.children.length).toBe(2);
  });
});
