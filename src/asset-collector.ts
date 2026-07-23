import { readdirSync } from "node:fs";
import { resolve } from "node:path";

export function collectDeckAssets(decksDir: string): string[] {
  const assets: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (!/\.(mdx|md|svx|svelte|css)$/.test(entry.name)) {
        // Skip source files, not just decks: an `@include` partial or a
        // component beside the decks is input to the build, and copying it
        // verbatim into dist/ would publish source.
        assets.push(full);
      }
    }
  }
  walk(decksDir);
  return assets;
}
