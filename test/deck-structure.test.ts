import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { normalizeRoutePrefix } from "../index.ts";
import { checkDeckHtml, checkDecks, countSourceDecks } from "../src/deck-structure.ts";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "astromotion-structure-"));
  temporaryDirectories.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true })));
});

describe("route prefix", () => {
  test.each([
    ["decks", "/decks"],
    ["/lectures/", "/lectures"],
    ["teaching/decks", "/teaching/decks"],
    ["/", ""],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeRoutePrefix(input)).toBe(expected);
  });

  test("rejects route syntax and parent traversal", () => {
    expect(() => normalizeRoutePrefix("/decks/[slug]")).toThrow("routePrefix");
    expect(() => normalizeRoutePrefix("../decks")).toThrow("routePrefix");
  });
});

describe("deck structure", () => {
  test("accepts a complete generated slide", () => {
    const html = `<div class="reveal"><div class="slides"><section>
      <div class="slide-bg" style="background-image: url('/x.jpg')"></div>
      <div class="split-layout"><div class="split-content"></div><div class="split-image"></div></div>
      <pre class="shiki"><code>ok</code></pre><div class="qr-code"><svg></svg></div>
    </section></div></div>`;
    expect(checkDeckHtml(html, "/decks/example/")).toEqual([]);
  });

  test("reports malformed generated structures", () => {
    const html = `<div class="reveal"><div class="slides"><section>
      <div class="slide-bg"></div><div class="split-layout"></div>
      <pre class="shiki"></pre><div class="qr-code"></div>
    </section></div></div>`;
    expect(checkDeckHtml(html, "/lectures/example/").map((item) => item.rule)).toEqual([
      "bg-missing-image",
      "split-missing-content",
      "split-missing-image",
      "shiki-missing-code",
      "qr-missing-svg",
    ]);
  });

  test("discovers deck pages by content at any route", async () => {
    const dir = await temporaryDirectory();
    await mkdir(join(dir, "lectures/example"), { recursive: true });
    await mkdir(join(dir, "ordinary"), { recursive: true });
    await writeFile(
      join(dir, "lectures/example/index.html"),
      '<div class="reveal"><div class="slides"><section>ok</section></div></div>',
    );
    await writeFile(join(dir, "ordinary/index.html"), "<main>ordinary</main>");
    await expect(checkDecks(dir)).resolves.toEqual({ checked: 1, violations: [] });
  });

  test("counts only decks expected in production", async () => {
    const dir = await temporaryDirectory();
    await mkdir(join(dir, "nested"), { recursive: true });
    await writeFile(join(dir, "live.deck.mdx"), "# Live");
    await writeFile(join(dir, "nested/draft.deck.mdx"), "---\npublished: false\n---\n# Draft");
    await writeFile(join(dir, "notes.mdx"), "not a deck");
    await expect(countSourceDecks(dir)).resolves.toBe(1);
  });
});
