import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import { remarkDeckIncludes } from "../plugins/remark-deck-includes.ts";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("remarkDeckIncludes", () => {
  it("inlines a single @include directive", async () => {
    const input = "# Header\n\n{/* @include ./fixtures/includes/partial.mdx */}\n\n# After\n";
    const tree = unified().use(remarkParse).use(remarkMdx).parse(input);
    await unified()
      .use(remarkDeckIncludes)
      .run(tree, { path: path.join(__dirname, "main.deck.mdx") });
    const headings = tree.children.filter((n: any) => n.type === "heading");
    const headingTexts = headings.map((h: any) => h.children[0].value);
    expect(headingTexts).toEqual(["Header", "Partial heading", "After"]);
  });

  it("does nothing for non-.deck.mdx files", async () => {
    const input = "{/* @include ./fixtures/includes/partial.mdx */}\n";
    const tree = unified().use(remarkParse).use(remarkMdx).parse(input);
    await unified()
      .use(remarkDeckIncludes)
      .run(tree, { path: path.join(__dirname, "ordinary.md") });
    expect(tree.children.length).toBe(1);
    expect((tree.children[0] as any).type).toBe("mdxFlowExpression");
  });

  it("recurses into included files", async () => {
    const input = "{/* @include ./fixtures/includes/main.mdx */}\n";
    const tree = unified().use(remarkParse).use(remarkMdx).parse(input);
    await unified()
      .use(remarkDeckIncludes)
      .run(tree, { path: path.join(__dirname, "wrapper.deck.mdx") });
    const headings = tree.children.filter((n: any) => n.type === "heading");
    expect(headings.length).toBeGreaterThan(0);
  });

  it("throws for non-.mdx include paths", async () => {
    const input = "{/* @include ./fixtures/includes/partial.md */}\n";
    const tree = unified().use(remarkParse).use(remarkMdx).parse(input);
    await expect(
      unified()
        .use(remarkDeckIncludes)
        .run(tree, { path: path.join(__dirname, "main.deck.mdx") }),
    ).rejects.toThrow("@include only supports .mdx files");
  });

  it("throws with the include chain on a cycle", async () => {
    const input = "{/* @include ./fixtures/includes/cycle-a.mdx */}\n";
    const tree = unified().use(remarkParse).use(remarkMdx).parse(input);
    await expect(
      unified()
        .use(remarkDeckIncludes)
        .run(tree, { path: path.join(__dirname, "main.deck.mdx") }),
    ).rejects.toThrow(/@include cycle: .*cycle-a\.mdx → .*cycle-b\.mdx → .*cycle-a\.mdx/);
  });

  it("names the missing file and the including file when an include is absent", async () => {
    const input = "{/* @include ./fixtures/includes/no-such-partial.mdx */}\n";
    const tree = unified().use(remarkParse).use(remarkMdx).parse(input);
    await expect(
      unified()
        .use(remarkDeckIncludes)
        .run(tree, { path: path.join(__dirname, "main.deck.mdx") }),
    ).rejects.toThrow(
      /@include file not found: \.\/fixtures\/includes\/no-such-partial\.mdx \(included from .*main\.deck\.mdx\)/,
    );
  });

  it("strips yaml frontmatter from included files", async () => {
    const input = "# Deck\n\n{/* @include ./fixtures/includes/with-frontmatter.mdx */}\n";
    const tree = unified().use(remarkParse).use(remarkMdx).parse(input);
    await unified()
      .use(remarkDeckIncludes)
      .run(tree, { path: path.join(__dirname, "main.deck.mdx") });
    const types = tree.children.map((n: any) => n.type);
    expect(types).not.toContain("yaml");
    const headings = tree.children
      .filter((n: any) => n.type === "heading")
      .map((h: any) => h.children[0].value);
    expect(headings).toEqual(["Deck", "Topic heading"]);
  });

  it("resolves bare module specifiers via Node module resolution", async () => {
    const input = "{/* @include @fake/partials/greeting.mdx */}\n";
    const tree = unified().use(remarkParse).use(remarkMdx).parse(input);
    await unified()
      .use(remarkDeckIncludes)
      .run(tree, { path: path.join(__dirname, "fixtures", "wrapper.deck.mdx") });
    const headings = tree.children.filter((n: any) => n.type === "heading");
    expect(headings.map((h: any) => h.children[0].value)).toEqual(["Greeting from node_modules"]);
  });

  it("strips source positions from spliced-in nodes", async () => {
    const input = "# Deck\n\n{/* @include ./fixtures/includes/partial.mdx */}\n";
    const tree = unified().use(remarkParse).use(remarkMdx).parse(input);
    await unified()
      .use(remarkDeckIncludes)
      .run(tree, { path: path.join(__dirname, "main.deck.mdx") });
    // The deck's own heading keeps its position; the spliced-in heading does
    // not, since its offset referenced the partial file rather than the deck.
    const own = tree.children.find(
      (n: any) => n.type === "heading" && n.children[0].value === "Deck",
    );
    const spliced = tree.children.find(
      (n: any) => n.type === "heading" && n.children[0].value === "Partial heading",
    );
    expect((own as any).position).toBeDefined();
    expect((spliced as any).position).toBeUndefined();
  });
});
