import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { remarkDeckSections } from "../plugins/remark-deck-sections.ts";

describe("remarkDeckSections", () => {
  it("wraps groups separated by --- in <section> JSX elements", async () => {
    const input = "# Slide 1\n\n---\n\n# Slide 2\n\n---\n\n# Slide 3\n";
    const tree = unified().use(remarkParse).parse(input);
    await unified().use(remarkDeckSections).run(tree, { path: "test.deck.mdx" });
    expect(tree.children.length).toBe(3);
    for (const node of tree.children) {
      expect((node as any).type).toBe("mdxJsxFlowElement");
      expect((node as any).name).toBe("section");
    }
  });

  it("keeps single-slide documents as one <section>", async () => {
    const input = "# Only slide\n\nbody\n";
    const tree = unified().use(remarkParse).parse(input);
    await unified().use(remarkDeckSections).run(tree, { path: "test.deck.mdx" });
    expect(tree.children.length).toBe(1);
    expect((tree.children[0] as any).children.length).toBe(2);
  });

  it("skips empty groups (consecutive ---)", async () => {
    const input = "# A\n\n---\n\n---\n\n# B\n";
    const tree = unified().use(remarkParse).parse(input);
    await unified().use(remarkDeckSections).run(tree, { path: "test.deck.mdx" });
    expect(tree.children.length).toBe(2);
  });

  it("does nothing for non-.deck.mdx files", async () => {
    const input = "# A\n\n---\n\n# B\n";
    const tree = unified().use(remarkParse).parse(input);
    await unified().use(remarkDeckSections).run(tree, { path: "ordinary.md" });
    const types = tree.children.map((n) => n.type);
    expect(types).toContain("thematicBreak");
  });
});
