import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";
import { afterAll, expect, it } from "vitest";
import { collectDeckAssets } from "../src/asset-collector.ts";

const root = mkdtempSync(resolve(tmpdir(), "astromotion-assets-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

it("copies media a deck can link to, and nothing that is build input", () => {
  const files = [
    "talk/slides.deck.mdx",
    "talk/deck.css",
    "talk/Timer.astro",
    "talk/Widget.svelte",
    "talk/helpers.ts",
    "talk/convert.sh",
    "talk/data.json",
    "talk/assets/bg.avif",
    "talk/assets/BG-LOUD.PNG",
    "talk/assets/clip.mp4",
    "talk/assets/theme.opus",
    "talk/assets/handout.pdf",
    "shared/questions.mdx",
    "shared/bg-questions.svg",
    ".astro/types.d.ts",
    ".astro/icon.png",
    "node_modules/.vite/deps/chunk.js",
    "node_modules/pkg/logo.png",
  ];
  for (const file of files) {
    mkdirSync(resolve(root, file, ".."), { recursive: true });
    writeFileSync(resolve(root, file), "");
  }

  const copied = collectDeckAssets(root)
    .map((file) => relative(root, file))
    .toSorted();
  expect(copied).toEqual([
    "shared/bg-questions.svg",
    "talk/assets/BG-LOUD.PNG",
    "talk/assets/bg.avif",
    "talk/assets/clip.mp4",
    "talk/assets/handout.pdf",
    "talk/assets/theme.opus",
  ]);
});
