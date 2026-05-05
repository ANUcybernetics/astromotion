import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { remarkDeckIncludes } from "../plugins/remark-deck-includes.ts";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("remarkDeckIncludes", () => {
  it("inlines a single @include directive", async () => {
    const input =
      "# Header\n\n<!-- @include ./fixtures/includes/partial.md -->\n\n# After\n";
    const tree = unified().use(remarkParse).parse(input);
    await unified()
      .use(remarkDeckIncludes)
      .run(tree, { path: path.join(__dirname, "main.deck.mdx") });
    const headings = tree.children.filter((n: any) => n.type === "heading");
    const headingTexts = headings.map((h: any) => h.children[0].value);
    expect(headingTexts).toEqual(["Header", "Partial heading", "After"]);
  });

  it("does nothing for non-.deck.mdx files", async () => {
    const input = "<!-- @include ./fixtures/includes/partial.md -->\n";
    const tree = unified().use(remarkParse).parse(input);
    await unified()
      .use(remarkDeckIncludes)
      .run(tree, { path: path.join(__dirname, "ordinary.md") });
    expect(tree.children.length).toBe(1);
    expect(tree.children[0].type).toBe("html");
  });

  it("recurses into included files", async () => {
    const input = "<!-- @include ./fixtures/includes/main.md -->\n";
    const tree = unified().use(remarkParse).parse(input);
    await unified()
      .use(remarkDeckIncludes)
      .run(tree, { path: path.join(__dirname, "wrapper.deck.mdx") });
    const headings = tree.children.filter((n: any) => n.type === "heading");
    expect(headings.length).toBeGreaterThan(0);
  });
});
