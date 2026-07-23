import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import { remarkDeckSections } from "../plugins/remark-deck-sections.ts";
import { remarkDeckAnimate } from "../plugins/remark-deck-animate.ts";

async function run(input: string, path = "test.deck.mdx") {
  const tree = unified().use(remarkParse).use(remarkMdx).parse(input);
  await unified().use(remarkDeckSections).use(remarkDeckAnimate).run(tree, { path });
  return tree;
}

function attr(node: any, name: string) {
  return node.attributes.find((a: any) => a.name === name);
}

describe("remarkDeckAnimate", () => {
  it("adds data-auto-animate to a slide carrying the bare flag", async () => {
    const input = "{/* _animate */}\n\n# A\n\n---\n\n# B\n";
    const tree = await run(input);
    const first = tree.children[0] as any;
    const second = tree.children[1] as any;
    expect(attr(first, "data-auto-animate")).toBeDefined();
    expect(attr(first, "data-auto-animate")?.value).toBeNull();
    expect(attr(first, "data-auto-animate-id")).toBeUndefined();
    expect(attr(second, "data-auto-animate")).toBeUndefined();
  });

  it("adds data-auto-animate-id when an id is given", async () => {
    const input = "{/* _animate: pile */}\n\n# A\n";
    const tree = await run(input);
    const first = tree.children[0] as any;
    expect(attr(first, "data-auto-animate")).toBeDefined();
    expect(attr(first, "data-auto-animate-id")?.value).toBe("pile");
  });

  it("removes the directive node from the section's children", async () => {
    const input = "{/* _animate */}\n\n# Title\n";
    const tree = await run(input);
    const section = tree.children[0] as any;
    const exprNodes = section.children.filter((c: any) => c.type === "mdxFlowExpression");
    expect(exprNodes.length).toBe(0);
  });

  it("does nothing for non-.deck.mdx files", async () => {
    const input = "{/* _animate */}\n\n# X\n";
    const tree = await run(input, "ordinary.md");
    expect(tree.children.length).toBe(2);
  });
});
