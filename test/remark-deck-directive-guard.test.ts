import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { remarkDeckDirectiveGuard } from "../plugins/remark-deck-directive-guard.ts";
import { remarkDeckIncludes } from "../plugins/remark-deck-includes.ts";
import { remarkDeckSections } from "../plugins/remark-deck-sections.ts";
import { remarkDeckClasses } from "../plugins/remark-deck-classes.ts";
import { remarkDeckIds } from "../plugins/remark-deck-ids.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parse(input: string) {
  return unified().use(remarkParse).use(remarkMdx).parse(input);
}

describe("remarkDeckDirectiveGuard", () => {
  it("rejects two directives folded onto one line", async () => {
    const tree = parse("{/* _class: impact */} {/* _id: intro */}\n\n# Loud\n");
    await expect(
      unified().use(remarkDeckDirectiveGuard).run(tree, { path: "deck.deck.mdx" }),
    ).rejects.toThrow(
      /deck\.deck\.mdx:1: \{\/\* _class: impact \*\/\} is an inline MDX expression/,
    );
  });

  it("rejects an inline directive on a line of prose", async () => {
    const tree = parse("# Loud\n\nSome prose {/* _animate */} trailing.\n");
    await expect(
      unified().use(remarkDeckDirectiveGuard).run(tree, { path: "deck.deck.mdx" }),
    ).rejects.toThrow("deck.deck.mdx:3");
  });

  it("names the partial and its line when the fold is inside an @include", async () => {
    const tree = parse("{/* @include ./fixtures/includes/folded-directives.mdx */}\n");
    await expect(
      unified()
        .use(remarkDeckDirectiveGuard)
        .use(remarkDeckIncludes)
        .run(tree, { path: path.join(__dirname, "main.deck.mdx") }),
    ).rejects.toThrow(/folded-directives\.mdx:1:/);
  });

  it("leaves the blank-line-separated form alone, both directives applied", async () => {
    const tree = parse("{/* _class: impact */}\n\n{/* _id: intro */}\n\n# Loud\n");
    await unified()
      .use(remarkDeckDirectiveGuard)
      .use(remarkDeckSections)
      .use(remarkDeckClasses)
      .use(remarkDeckIds)
      .run(tree, { path: "deck.deck.mdx" });
    const section = tree.children[0] as any;
    const value = (name: string) => section.attributes.find((a: any) => a.name === name)?.value;
    expect(value("class")).toBe("impact");
    expect(value("id")).toBe("intro");
  });

  it("ignores an inline comment that is not a directive", async () => {
    const tree = parse("# Loud\n\nProse {/* just a note */} more prose.\n");
    await unified().use(remarkDeckDirectiveGuard).run(tree, { path: "deck.deck.mdx" });
    expect(tree.children.length).toBe(2);
  });

  it("does nothing for non-.deck.mdx files", async () => {
    const tree = parse("{/* _class: impact */} {/* _id: intro */}\n");
    await unified().use(remarkDeckDirectiveGuard).run(tree, { path: "ordinary.md" });
    expect(tree.children.length).toBe(1);
  });
});
