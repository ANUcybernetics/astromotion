#!/usr/bin/env node
// Export an astromotion deck's text to markdown --- headings, prose, lists,
// code and tables, with the visual layer stripped out. For reading a deck
// away from the screen: print it, mark it up, type the edits back in.
//
// Runs straight on the source file: no build, no preview server, no browser.
// `@include` partials are spliced in the same way the build does it, so what
// you print is the whole deck.
//
// Usage: astromotion-text <deck.deck.mdx> [output.md] [options]
//   --stdout            write to stdout instead of a file
//   --no-notes          drop speaker notes
//   --no-comments       drop authoring comments ({/* … */} blocks)
//   --no-placeholders   drop the (image: …) / (component: …) markers
//   --no-title          don't lead with the frontmatter title

import { writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { deckToMarkdown } from "../src/deck-text.mjs";

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const positional = args.filter((a) => !a.startsWith("--"));

const usage =
  "Usage: astromotion-text <deck.deck.mdx> [output.md] " +
  "[--stdout] [--no-notes] [--no-comments] [--no-placeholders] [--no-title]";

const known = new Set([
  "--stdout",
  "--no-notes",
  "--no-comments",
  "--no-placeholders",
  "--no-title",
]);
const unknown = flags.filter((f) => !known.has(f));
if (unknown.length > 0) {
  console.error(
    `✗ Unknown option${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}\n${usage}`,
  );
  process.exit(1);
}

const deck = positional[0];
if (!deck) {
  console.error(usage);
  process.exit(1);
}
if (!deck.endsWith(".deck.mdx")) {
  console.error(`✗ Not a deck file: ${deck} (expected a path ending in .deck.mdx)`);
  process.exit(1);
}

let markdown;
try {
  markdown = deckToMarkdown(deck, {
    comments: !flags.includes("--no-comments"),
    notes: !flags.includes("--no-notes"),
    placeholders: !flags.includes("--no-placeholders"),
    title: !flags.includes("--no-title"),
  });
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}

if (flags.includes("--stdout")) {
  process.stdout.write(markdown);
} else {
  const output = resolve(positional[1] ?? `${basename(deck, ".deck.mdx")}.md`);
  writeFileSync(output, markdown, "utf-8");
  console.log(`✓ Wrote ${output}`);
}
