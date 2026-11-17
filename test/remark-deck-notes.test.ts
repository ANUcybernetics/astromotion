import { describe, expect, it } from "vitest";
import type { Root, RootContent } from "mdast";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import { remarkDeckSections } from "../plugins/remark-deck-sections.ts";
import { remarkDeckNotes } from "../plugins/remark-deck-notes.ts";
import {
  asElement,
  attrValue,
  descendantTypes,
  ofType,
  sectionAt,
  textOf,
} from "./mdast-helpers.ts";

async function run(input: string) {
  const tree = unified().use(remarkParse).use(remarkMdx).parse(input);
  await unified().use(remarkDeckSections).use(remarkDeckNotes).run(tree, { path: "test.deck.mdx" });
  return tree;
}

function notesAside(tree: Root) {
  return sectionAt(tree, 0).children.find(
    (c) => c.type === "mdxJsxFlowElement" && c.name === "aside",
  );
}

// The aside's children, which must exist whenever a test reads them.
function asideChildren(tree: Root): RootContent[] {
  return asElement(notesAside(tree)).children;
}

describe("remarkDeckNotes", () => {
  it("appends a notes <aside> to the section and removes the fence", async () => {
    const tree = await run("# Title\n\n```notes\nspeaker note text\n```\n\nbody\n");
    const aside = notesAside(tree);
    expect(aside).toBeDefined();
    // Reveal's notes plugin reads `aside.notes`, so the class must be exactly that
    expect(attrValue(aside, "class")).toBe("notes");
    // aria-hidden keeps the presenter-only aside from registering as a
    // complementary landmark in static a11y scans
    expect(attrValue(aside, "aria-hidden")).toBe("true");
    const codeNodes = sectionAt(tree, 0).children.filter((c) => c.type === "code");
    expect(codeNodes.length).toBe(0);
  });

  it("parses the body as markdown, not raw HTML", async () => {
    const tree = await run(
      "# Title\n\n```notes\n- first, with *emphasis*\n- second, with a [link](https://example.com)\n```\n",
    );
    const aside = asElement(notesAside(tree));
    expect(aside.children.map((c) => c.type)).toEqual(["list"]);
    const [list] = ofType(aside.children, "list");
    const [first, second] = list?.children ?? [];
    expect(first && descendantTypes(first)).toContain("emphasis");
    expect(second && descendantTypes(second)).toContain("link");
    // nothing arrives as a raw `html` node any more
    expect(JSON.stringify(aside)).not.toContain('"html"');
  });

  it("keeps a code fence that isn't notes on the slide", async () => {
    const tree = await run("# Title\n\n```js\nconst answer = 42;\n```\n");
    expect(notesAside(tree)).toBeUndefined();
    const [code] = ofType(sectionAt(tree, 0).children, "code");
    expect(code?.lang).toBe("js");
  });

  it("reads two fences in one slide as one set of notes, in source order", async () => {
    const tree = await run("# Title\n\n```notes\nfirst\n```\n\nbody\n\n```notes\nsecond\n```\n");
    const children = asideChildren(tree);
    expect(children.length).toBe(2);
    expect(children.map(textOf)).toEqual(["first", "second"]);
  });

  it("does nothing when no notes fence is present", async () => {
    const tree = await run("# Title\n\nbody\n");
    expect(notesAside(tree)).toBeUndefined();
  });

  it("fails the build on the removed {/* notes: */} directive", async () => {
    // A directive nobody claims compiles to nothing, so silently dropping the
    // notes is the failure mode this replaces.
    await expect(run("# Title\n\n{/* notes: old syntax */}\n")).rejects.toThrow(
      /was removed in astromotion/,
    );
  });
});
