// Deck discovery for the bin scripts. They run from node_modules, where Node
// will not strip types, so they can't import src/deck-slug.ts; this mirrors
// its slug rule in plain JS, and test/deck-files.test.ts holds the two to
// agreement.

import { readdirSync } from "node:fs";

const DECK_SUFFIX = ".deck.mdx";
const SLIDES_SUFFIX = "/slides";

/**
 * Route slugs for every `*.deck.mdx` under `dir`, at any depth: a deck kept
 * in a directory beside its assets (`week-3/slides.deck.mdx`) mounts at
 * `week-3`, as the injected deck route has it. Throws if `dir` is missing.
 */
export function deckSlugsIn(dir) {
  return readdirSync(dir, { recursive: true })
    .map((path) => String(path).replaceAll("\\", "/"))
    .filter((path) => path.endsWith(DECK_SUFFIX))
    .map((path) => path.slice(0, -DECK_SUFFIX.length))
    .map((name) => (name.endsWith(SLIDES_SUFFIX) ? name.slice(0, -SLIDES_SUFFIX.length) : name))
    .toSorted();
}
