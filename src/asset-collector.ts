import { readdirSync } from "node:fs";
import { extname, resolve } from "node:path";

/**
 * Files a deck can reference by a literal URL (an `![bg]` image, a `<video>`
 * or `<audio>` src, a linked PDF), which the build copies verbatim into dist/.
 * An allowlist rather than a list of source types to skip: anything else under
 * src/decks --- partials, components, scripts, a stray `.astro/` or Vite cache
 * from running a dev server in the wrong directory --- is build input, and
 * copying it would publish it.
 */
const ASSET_EXTENSIONS = new Set(
  [
    "avif webp png jpg jpeg gif svg ico",
    "mp4 webm mov m4v vtt",
    "mp3 m4a opus ogg oga wav flac",
    "pdf woff woff2 ttf otf",
  ].flatMap((group) => group.split(" ")),
);

export function collectDeckAssets(decksDir: string): string[] {
  const assets: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (ASSET_EXTENSIONS.has(extname(entry.name).slice(1).toLowerCase())) {
        assets.push(full);
      }
    }
  }
  walk(decksDir);
  return assets;
}
