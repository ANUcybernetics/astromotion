import { parse } from "yaml";
import { extractFrontmatter } from "./parse-helpers.ts";

export interface DeckFrontmatter {
  title?: string;
  description?: string;
  author?: string;
  image?: string;
  // `published: false` drops the deck from a production build; `unlisted: true`
  // builds it but marks the page noindex and pagefind-ignored, and keeps it out
  // of `deckTextEntries()`. Absent, a deck is published and listed. See the
  // README.
  published?: boolean;
  unlisted?: boolean;
}

/**
 * Fail on the retired spelling of the visibility flag.
 *
 * v0.27 to v0.30 spelt it `listed: false`. A key nobody reads is worse than a
 * build error: the deck quietly comes back into every index. Both readers of
 * deck frontmatter (the injected route and `deckTextEntries`) call this, so a
 * stale deck fails the build with the fix in the message.
 */
export function assertNoRetiredFlags(data: Record<string, unknown>, where: string): void {
  if ("listed" in data) {
    throw new Error(
      `${where}: \`listed\` is not read; use \`unlisted: true\` to keep the deck out of the indexes, or drop the key (decks are listed by default).`,
    );
  }
}

const STRING_KEYS = ["title", "description", "author", "image"] as const;
const BOOLEAN_KEYS = ["published", "unlisted"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Check parsed YAML has the shape of `DeckFrontmatter`; unknown keys pass through. */
function assertDeckFrontmatter(
  value: unknown,
  where: string,
): asserts value is DeckFrontmatter & Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${where}: frontmatter must be a YAML mapping of keys to values`);
  }
  for (const key of STRING_KEYS) {
    if (value[key] !== undefined && typeof value[key] !== "string") {
      throw new Error(`${where}: frontmatter \`${key}\` must be a string`);
    }
  }
  for (const key of BOOLEAN_KEYS) {
    if (value[key] !== undefined && typeof value[key] !== "boolean") {
      throw new Error(`${where}: frontmatter \`${key}\` must be true or false`);
    }
  }
}

interface DeckMeta {
  data: DeckFrontmatter;
  content: string;
}

export function parseDeckFrontmatter(raw: string, slug?: string): DeckMeta {
  const fm = extractFrontmatter(raw);
  if (!fm) {
    return {
      data: { title: slug },
      content: raw,
    };
  }

  const where = slug ?? "deck";
  const data: unknown = parse(fm.data);
  assertDeckFrontmatter(data, where);
  assertNoRetiredFlags(data, where);
  if (!data.title && slug) {
    data.title = slug;
  }

  return { data, content: fm.content };
}
