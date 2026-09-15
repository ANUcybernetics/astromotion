/**
 * The decks as text, with the URLs they build at.
 *
 * Both halves already exist --- `deckToMarkdown` renders a deck's readable
 * content, and the integration knows the prefix its routes are mounted at ---
 * but nothing outside the package could put them together: the decks
 * directory and the slug rule are astromotion's, not the consumer's. This is
 * the pairing, for a site generator that wants the decks in a text index
 * (llms.txt) rather than on a page.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildState } from "./build-config.ts";
import { DECKS_DIR, deckSlugFromPath } from "./deck-slug.ts";
import { deckToMarkdown } from "./deck-text.mjs";
import { parseDeckFrontmatter } from "./meta.ts";

/** Options forwarded to `deckToMarkdown`. */
export interface DeckTextOptions {
  notes?: boolean;
  comments?: boolean;
  placeholders?: boolean;
  title?: boolean;
}

export interface DeckTextEntry {
  /** Base-relative URL of the built deck page, e.g. `/lectures/week-3/`. */
  url: string;
  title: string;
  description?: string;
  /** The deck's readable content as markdown. */
  body: string;
}

export interface DeckTextEntriesOptions {
  /**
   * Project root --- the directory holding `src/decks`. Defaults to the root
   * the integration recorded during `astro:config:setup`, so a caller running
   * in a build hook needs no argument at all.
   */
  root?: string;
  /**
   * Route prefix the decks are mounted at. Defaults to the integration's
   * resolved prefix, which is the point: a consumer that registers
   * `astromotion()` by hand with its own `routePrefix` gets correct URLs
   * without repeating the value anywhere else.
   */
  routePrefix?: string;
  /**
   * Overrides for the text rendering. Defaults differ from `deckToMarkdown`'s
   * own: `comments: false`, because authoring comments are stripped from the
   * built HTML and publishing them in a text index would expose something the
   * site itself doesn't; and `title: false`, because the title travels as a
   * field on the entry and an index typically renders its own heading.
   */
  text?: DeckTextOptions;
}

async function collectDeckFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    // No decks directory is a site without decks, not a failure.
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collectDeckFiles(path)));
    else if (entry.name.endsWith(".deck.mdx")) files.push(path);
  }
  return files;
}

/**
 * Read every published, listed deck under `src/decks` as a text entry.
 *
 * Skips `published: false` (no route is built for it, so an entry would point
 * at a 404) and `listed: false` (built, but kept out of every index --- which
 * is what a text index is).
 */
export async function deckTextEntries(
  options: DeckTextEntriesOptions = {},
): Promise<DeckTextEntry[]> {
  const root = options.root ?? buildState.root;
  const routePrefix = options.routePrefix ?? buildState.routePrefix;
  const textOptions: DeckTextOptions = { comments: false, title: false, ...options.text };

  const files = await collectDeckFiles(join(root, DECKS_DIR));
  const entries: DeckTextEntry[] = [];

  for (const file of files) {
    const slug = deckSlugFromPath(file);
    if (!slug) continue;

    const source = await readFile(file, "utf-8");
    const { data } = parseDeckFrontmatter(source, slug);
    if (data.published === false || data.listed === false) continue;

    const description = typeof data.description === "string" ? data.description.trim() : "";

    entries.push({
      url: `${routePrefix}/${slug}/`,
      title: data.title ?? slug,
      ...(description && { description }),
      body: deckToMarkdown(file, textOptions),
    });
  }

  return entries.toSorted((a, b) => a.url.localeCompare(b.url));
}
