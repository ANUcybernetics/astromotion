import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";
import { remarkDeckNotes } from "../plugins/remark-deck-notes.ts";
import { remarkDeckSections } from "../plugins/remark-deck-sections.ts";

// The reason speaker notes and authoring comments are fences: a multi-line
// `{/* … */}` comment doesn't survive prettier's markdown printer (which oxfmt
// reproduces byte-for-byte) --- it escapes the `*`, turning a valid deck into
// invalid MDX, and the corrupted output is a fixed point, so `--check` reports
// the broken file as correctly formatted. Fence contents are never reflowed, at
// any proseWrap setting. This test is the guard on that claim.
const OXFMT = fileURLToPath(new URL("../node_modules/.bin/oxfmt", import.meta.url));

const DECK = `---
title: Format Stability
---

{/* _class: hero */}

# Slide with prose long enough that a proseWrap setting has something to do with it, and then some more

\`\`\`notes
- first point, with *emphasis* and a [link](https://example.com)
- second point, on a line long enough that reflowing it would show up in a byte comparison
\`\`\`

\`\`\`comment
Why this slide is the way it is, at a length that invites rewrapping.
\`\`\`
`;

function fences(source: string): string[] {
  return Array.from(source.matchAll(/^```(?:notes|comment)\n[\s\S]*?^```$/gm), (m) => m[0]);
}

function format(source: string, proseWrap: string): string {
  const dir = mkdtempSync(join(tmpdir(), "astromotion-fmt-"));
  const deck = join(dir, "stability.deck.mdx");
  const config = join(dir, "oxfmtrc.json");
  writeFileSync(deck, source);
  writeFileSync(config, JSON.stringify({ proseWrap, printWidth: 80 }));
  execFileSync(OXFMT, ["-c", config, deck], { stdio: "pipe" });
  return readFileSync(deck, "utf-8");
}

describe("formatting a deck", () => {
  for (const proseWrap of ["preserve", "always", "never"]) {
    it(`leaves fenced notes and comments byte-identical (proseWrap: ${proseWrap})`, async () => {
      const formatted = format(DECK, proseWrap);
      expect(fences(formatted)).toEqual(fences(DECK));

      // Still valid MDX, and the notes still reach the speaker view.
      const tree = unified().use(remarkParse).use(remarkMdx).parse(formatted);
      await unified()
        .use(remarkDeckSections)
        .use(remarkDeckNotes)
        .run(tree, { path: "stability.deck.mdx" });
      const aside = (tree.children[0] as any).children.find(
        (c: any) => c.type === "mdxJsxFlowElement" && c.name === "aside",
      );
      expect(aside).toBeDefined();
      expect(JSON.stringify(aside)).toContain("second point");
    });
  }

  it("corrupts a multi-line {/* */} comment --- which is why they are rejected", () => {
    const withComment = "---\ntitle: T\n---\n\n{/*\n  a comment with a * in it\n*/}\n";
    const formatted = format(withComment, "preserve");
    expect(formatted).not.toEqual(withComment);
    expect(formatted).toContain("{/_");
    // ...and the damage is a fixed point: formatting again changes nothing, so
    // no format-check can flag it.
    expect(format(formatted, "preserve")).toEqual(formatted);
  });
});
