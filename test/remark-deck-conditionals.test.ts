import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import { remarkDeckSections } from "../plugins/remark-deck-sections.ts";
import { remarkDeckConditionals } from "../plugins/remark-deck-conditionals.ts";

async function run(input: string, path = "test.deck.mdx") {
  const tree = unified().use(remarkParse).use(remarkMdx).parse(input);
  await unified().use(remarkDeckSections).use(remarkDeckConditionals).run(tree, { path });
  return tree;
}

function attr(node: any, name: string) {
  return node.attributes.find((a: any) => a.name === name);
}

describe("remarkDeckConditionals", () => {
  it("adds data-deck-if from an _if directive, only to the carrying slide", async () => {
    const input = "{/* _if: presenters */}\n\n# A\n\n---\n\n# B\n";
    const tree = await run(input);
    const first = tree.children[0] as any;
    const second = tree.children[1] as any;
    expect(attr(first, "data-deck-if")?.value).toBe("presenters");
    expect(attr(second, "data-deck-if")).toBeUndefined();
  });

  it("removes the directive node from the section's children", async () => {
    const input = "{/* _if: presenters */}\n\n# Title\n";
    const tree = await run(input);
    const section = tree.children[0] as any;
    const exprNodes = section.children.filter((c: any) => c.type === "mdxFlowExpression");
    expect(exprNodes.length).toBe(0);
  });

  it("does nothing for non-.deck.mdx files", async () => {
    const input = "{/* _if: presenters */}\n\n# X\n";
    const tree = await run(input, "ordinary.md");
    expect(tree.children.length).toBe(2);
  });
});
