import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import { remarkDeckSections } from "../plugins/remark-deck-sections.ts";
import { remarkDeckClasses } from "../plugins/remark-deck-classes.ts";

describe("remarkDeckClasses", () => {
  it("applies class from {/* _class: */} directive to parent section", async () => {
    const input = "{/* _class: impact */}\n\n# Loud\n\n---\n\n# Quiet\n";
    const tree = unified().use(remarkParse).use(remarkMdx).parse(input);
    await unified()
      .use(remarkDeckSections)
      .use(remarkDeckClasses)
      .run(tree, { path: "test.deck.mdx" });
    const first = tree.children[0] as any;
    const classAttr = first.attributes.find((a: any) => a.name === "class");
    expect(classAttr?.value).toBe("impact");
    const second = tree.children[1] as any;
    expect(second.attributes.find((a: any) => a.name === "class")).toBeUndefined();
  });

  it("removes the directive node from the section's children", async () => {
    const input = "{/* _class: banner */}\n\n# Title\n";
    const tree = unified().use(remarkParse).use(remarkMdx).parse(input);
    await unified()
      .use(remarkDeckSections)
      .use(remarkDeckClasses)
      .run(tree, { path: "test.deck.mdx" });
    const section = tree.children[0] as any;
    const exprNodes = section.children.filter((c: any) => c.type === "mdxFlowExpression");
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
