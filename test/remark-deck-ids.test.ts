import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import { remarkDeckSections } from "../plugins/remark-deck-sections.ts";
import { remarkDeckClasses } from "../plugins/remark-deck-classes.ts";
import { remarkDeckIds } from "../plugins/remark-deck-ids.ts";

async function run(input: string, path = "test.deck.mdx") {
  const tree = unified().use(remarkParse).use(remarkMdx).parse(input);
  await unified().use(remarkDeckSections).use(remarkDeckIds).run(tree, { path });
  return tree;
}

function idOf(node: any): string | undefined {
  return node?.attributes?.find((a: any) => a.name === "id")?.value;
}

describe("remarkDeckIds", () => {
  it("applies id from {/* _id: */} directive to parent section", async () => {
    const tree = await run("{/* _id: opening */}\n\n# One\n\n---\n\n# Two\n");
    expect(idOf(tree.children[0])).toBe("opening");
    expect(idOf(tree.children[1])).toBeUndefined();
  });

  it("removes the directive node from the section's children", async () => {
    const tree = await run("{/* _id: opening */}\n\n# One\n");
    const section = tree.children[0] as any;
    expect(section.children.filter((c: any) => c.type === "mdxFlowExpression").length).toBe(0);
  });

  it("keeps only the first token, since ids cannot contain spaces", async () => {
    const tree = await run("{/* _id: opening remarks */}\n\n# One\n");
    expect(idOf(tree.children[0])).toBe("opening");
  });

  it("coexists with a _class directive on the adjacent line", async () => {
    const tree = unified()
      .use(remarkParse)
      .use(remarkMdx)
      .parse("{/* _class: hero */}\n{/* _id: opening */}\n\n# One\n");
    await unified()
      .use(remarkDeckSections)
      .use(remarkDeckClasses)
      .use(remarkDeckIds)
      .run(tree, { path: "test.deck.mdx" });
    const section = tree.children[0] as any;
    expect(section.attributes.find((a: any) => a.name === "class")?.value).toBe("hero");
    expect(idOf(section)).toBe("opening");
    expect(section.children.filter((c: any) => c.type === "mdxFlowExpression").length).toBe(0);
  });

  it("does nothing for non-.deck.mdx files", async () => {
    const tree = await run("{/* _id: opening */}\n\n# One\n", "ordinary.md");
    expect(idOf(tree.children[0])).toBeUndefined();
  });
});
