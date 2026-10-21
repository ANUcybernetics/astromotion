import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

// @ts-expect-error -- .mjs source with no type declarations
import { deckSlugsIn } from "../src/deck-files.mjs";
import { deckSlugFromPath } from "../src/deck-slug.ts";

const FILES = [
  "intro.deck.mdx",
  "week-3/slides.deck.mdx",
  "week-3/diagram.svg",
  "talks/2026/keynote.deck.mdx",
  "talks/2026/notes.md",
];

let root: string | undefined;

function decksDir() {
  root = mkdtempSync(join(tmpdir(), "astromotion-decks-"));
  const dir = join(root, "src", "decks");
  for (const file of FILES) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), "");
  }
  return dir;
}

afterEach(() => {
  if (root) rmSync(root, { force: true, recursive: true });
  root = undefined;
});

describe("deckSlugsIn", () => {
  it("finds decks at any depth and mounts slides.deck.mdx at its directory", () => {
    expect(deckSlugsIn(decksDir())).toEqual(["intro", "talks/2026/keynote", "week-3"]);
  });

  it("agrees with the slug the deck route uses", () => {
    const dir = decksDir();
    const routeSlugs = FILES.map((file) => deckSlugFromPath(join(dir, file)))
      .filter((slug) => slug !== null)
      .toSorted();
    expect(deckSlugsIn(dir)).toEqual(routeSlugs);
  });

  it("throws when the directory is missing", () => {
    expect(() => deckSlugsIn(join(tmpdir(), "astromotion-no-such-dir"))).toThrow();
  });
});
