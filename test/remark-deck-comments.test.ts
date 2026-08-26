import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import { remarkDeckSections } from "../plugins/remark-deck-sections.ts";
import { remarkDeckComments } from "../plugins/remark-deck-comments.ts";

async function run(input: string, path = "test.deck.mdx") {
  const tree = unified().use(remarkParse).use(remarkMdx).parse(input);
  await unified().use(remarkDeckSections).use(remarkDeckComments).run(tree, { path });
  return tree;
}

describe("remarkDeckComments", () => {
  it("strips a fenced comment block", async () => {
    const tree = await run("# Title\n\n```comment\nwhy this slide is here\n```\n\nbody\n");
    expect(JSON.stringify(tree)).not.toContain("why this slide is here");
    // the slide's own content is untouched
    expect(JSON.stringify(tree)).toContain("body");
  });

  it("strips a comment fence nested inside a JSX block", async () => {
    const tree = await run("# Title\n\n<div>\n\n```comment\nnested rationale\n```\n\n</div>\n");
    expect(JSON.stringify(tree)).not.toContain("nested rationale");
  });

  it("leaves other code fences alone", async () => {
    const tree = await run("# Title\n\n```js\nconst answer = 42;\n```\n");
    expect(JSON.stringify(tree)).toContain("const answer = 42;");
  });

  it("keeps single-line comments and directives", async () => {
    const tree = await run("# Title\n\n{/* _class: hero */}\n\n{/* a note to self */}\n");
    const json = JSON.stringify(tree);
    expect(json).toContain("_class: hero");
    expect(json).toContain("a note to self");
  });

  it("fails the build on a multi-line comment, which no formatter preserves", async () => {
    await expect(run("# Title\n\n{/*\n  spanning\n  two lines\n*/}\n")).rejects.toThrow(
      /does not survive a formatter/,
    );
  });

  it("ignores files that aren't decks", async () => {
    const tree = await run("# Title\n\n```comment\nkept\n```\n", "page.mdx");
    expect(JSON.stringify(tree)).toContain("kept");
  });
});
