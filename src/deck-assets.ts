/**
 * How a deck's relative asset path becomes a URL.
 *
 * `astro:build:done` copies each deck asset to `dist/<path relative to the
 * project root>`, so the asset's URL is that same relative path made
 * root-absolute. Both sides go through `deckAssetPath` below: if they ever
 * disagree, a deck points at a file the build never wrote, which renders as a
 * missing background rather than a failed build.
 */

import { relative } from "node:path";
import { DECKS_DIR } from "./deck-slug.ts";

/**
 * The project root a deck file belongs to: everything above its `src/decks`
 * segment, or null for a path that isn't under one.
 *
 * Read from the deck's own path rather than `buildState.root` so the remark
 * plugins stand alone without the integration, and anchored on the whole
 * `/src/decks/` marker: a checkout that itself sits under a directory called
 * `src` (`~/src/project`) would be cut at the wrong segment by a search for
 * `/src/` alone.
 */
export function deckProjectRoot(deckPath: string): string | null {
  const normalised = deckPath.replaceAll("\\", "/");
  const at = normalised.lastIndexOf(`/${DECKS_DIR}/`);
  return at === -1 ? null : normalised.slice(0, at);
}

/**
 * An asset's path relative to the project root, POSIX-separated: the build
 * writes it to `dist/<this>` and pages reference it at `/<this>`.
 *
 * Null when the asset resolves outside the root — nothing copies it there, so
 * there is no URL to give.
 */
export function deckAssetPath(root: string, assetPath: string): string | null {
  const rel = relative(root, assetPath).replaceAll("\\", "/");
  if (!rel || rel === ".." || rel.startsWith("../")) return null;
  return rel;
}
