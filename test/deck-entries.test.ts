import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { astromotion } from "../index.ts";
import { buildState } from "../src/build-config.ts";
import { deckTextEntries } from "../src/deck-entries.ts";
import { deckSlugFromPath } from "../src/deck-slug.ts";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "astromotion-entries-"));
  temporaryDirectories.push(dir);
  return dir;
}

/** Write a deck at `src/decks/<relPath>` under a fresh project root. */
async function project(decks: Record<string, string>): Promise<string> {
  const root = await temporaryDirectory();
  for (const [relPath, source] of Object.entries(decks)) {
    const path = join(root, "src/decks", relPath);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, source);
  }
  return root;
}

function deck(frontmatter: string, body = "# Slide"): string {
  return `---\n${frontmatter}\n---\n\n${body}\n`;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true })));
});

describe("deckSlugFromPath", () => {
  test.each([
    ["/src/decks/week-3.deck.mdx", "week-3"],
    ["/home/ben/site/src/decks/week-3.deck.mdx", "week-3"],
    ["/src/decks/week-3/slides.deck.mdx", "week-3"],
    ["/src/decks/archive/2024/intro.deck.mdx", "archive/2024/intro"],
    ["/src/decks/slides.deck.mdx", "slides"],
  ])("maps %s to %s", (path, expected) => {
    expect(deckSlugFromPath(path)).toBe(expected);
  });

  test.each([["/src/decks/notes.mdx"], ["/src/pages/week-3.deck.mdx"], ["/src/decks/.deck.mdx"]])(
    "rejects %s",
    (path) => {
      expect(deckSlugFromPath(path)).toBeNull();
    },
  );
});

describe("deckTextEntries", () => {
  test("returns one entry per deck, at the route it builds at", async () => {
    const root = await project({
      "week-1.deck.mdx": deck("title: Week 1"),
      "week-2.deck.mdx": deck("title: Week 2"),
    });

    const entries = await deckTextEntries({ root, routePrefix: "/lectures" });

    expect(entries.map((entry) => entry.url)).toEqual(["/lectures/week-1/", "/lectures/week-2/"]);
    expect(entries.map((entry) => entry.title)).toEqual(["Week 1", "Week 2"]);
  });

  test("mounts at the site root when the prefix is empty", async () => {
    const root = await project({ "intro.deck.mdx": deck("title: Intro") });

    const entries = await deckTextEntries({ root, routePrefix: "" });

    expect(entries[0].url).toBe("/intro/");
  });

  test("carries the description and drops an empty one", async () => {
    const root = await project({
      "with.deck.mdx": deck("title: With\ndescription: A deck about decks"),
      "without.deck.mdx": deck("title: Without"),
    });

    const [with_, without] = await deckTextEntries({ root, routePrefix: "/decks" });

    expect(with_.description).toBe("A deck about decks");
    expect(without).not.toHaveProperty("description");
  });

  test("skips unpublished and unlisted decks", async () => {
    const root = await project({
      "shown.deck.mdx": deck("title: Shown"),
      "draft.deck.mdx": deck("title: Draft\npublished: false"),
      "hidden.deck.mdx": deck("title: Hidden\nunlisted: true"),
    });

    const entries = await deckTextEntries({ root, routePrefix: "/decks" });

    expect(entries.map((entry) => entry.title)).toEqual(["Shown"]);
  });

  test("falls back to the slug when a deck has no title", async () => {
    const root = await project({ "untitled.deck.mdx": deck("author: Someone") });

    const entries = await deckTextEntries({ root, routePrefix: "/decks" });

    expect(entries[0].title).toBe("untitled");
  });

  test("strips authoring comments but keeps speaker notes and slide prose", async () => {
    const root = await project({
      "week-3.deck.mdx": deck(
        "title: Week 3",
        [
          "# Backpressure",
          "",
          "```comment",
          "why this slide is the way it is",
          "```",
          "",
          "```notes",
          "what to say out loud",
          "```",
        ].join("\n"),
      ),
    });

    const [entry] = await deckTextEntries({ root, routePrefix: "/lectures" });

    expect(entry.body).toContain("Backpressure");
    expect(entry.body).toContain("what to say out loud");
    expect(entry.body).not.toContain("why this slide is the way it is");
  });

  test("omits the title heading, which travels as a field instead", async () => {
    const root = await project({ "week-4.deck.mdx": deck("title: Week 4", "## Second level") });

    const [entry] = await deckTextEntries({ root, routePrefix: "/lectures" });

    expect(entry.body).not.toContain("# Week 4");
    expect(entry.body).toContain("## Second level");
  });

  test("honours text overrides", async () => {
    const root = await project({
      "week-5.deck.mdx": deck("title: Week 5", "```notes\nsaid aloud\n```"),
    });

    const [entry] = await deckTextEntries({
      root,
      routePrefix: "/lectures",
      text: { notes: false },
    });

    expect(entry.body).not.toContain("said aloud");
  });

  test("finds decks in subdirectories", async () => {
    const root = await project({
      "week-6/slides.deck.mdx": deck("title: Week 6"),
      "archive/old.deck.mdx": deck("title: Old"),
    });

    const entries = await deckTextEntries({ root, routePrefix: "/lectures" });

    expect(entries.map((entry) => entry.url)).toEqual([
      "/lectures/archive/old/",
      "/lectures/week-6/",
    ]);
  });

  test("a project with no decks directory yields nothing", async () => {
    const root = await temporaryDirectory();

    await expect(deckTextEntries({ root, routePrefix: "/decks" })).resolves.toEqual([]);
  });
});

// The defaults are the whole point of the buildState round-trip: a build-time
// caller (a theme generating an llms.txt) knows neither the project root nor
// the prefix the consumer chose, and shouldn't have to be told either.
function setup(root: string, options: Parameters<typeof astromotion>[0] = {}) {
  const hooks = astromotion(options).hooks as Record<string, (args: unknown) => unknown>;
  hooks["astro:config:setup"]({
    config: {
      root: new URL(`file://${root}/`),
      base: "/",
      integrations: [{ name: "@astrojs/mdx" }],
    },
    updateConfig: () => {},
    injectRoute: () => {},
  });
}

describe("defaults recorded by the integration", () => {
  const original = { ...buildState };

  afterEach(() => {
    Object.assign(buildState, original);
  });

  test("uses the root and prefix from config:setup when given neither", async () => {
    const root = await project({ "week-7.deck.mdx": deck("title: Week 7") });
    setup(root, { routePrefix: "/lectures" });

    const entries = await deckTextEntries();

    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe("/lectures/week-7/");
  });

  test("falls back to the default deck prefix", async () => {
    const root = await project({ "week-8.deck.mdx": deck("title: Week 8") });
    setup(root);

    const [entry] = await deckTextEntries();

    expect(entry.url).toBe("/decks/week-8/");
  });
});
