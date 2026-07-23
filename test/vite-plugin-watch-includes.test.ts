import { describe, expect, it, vi } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectIncludePaths, viteDeckWatchIncludes } from "../src/vite-plugin-watch-includes.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fixturesDir = path.join(__dirname, "fixtures");
const fixturesDeckPath = path.join(fixturesDir, "fixture.deck.mdx");
const partialPath = path.join(fixturesDir, "includes", "partial.mdx");
const mainPath = path.join(fixturesDir, "includes", "main.mdx");

function fakeServer() {
  return {
    moduleGraph: { onFileChange: vi.fn() },
    watcher: { add: vi.fn() },
    ws: { send: vi.fn() },
  };
}

describe("collectIncludePaths", () => {
  it("returns the absolute path of a single include", () => {
    const source = "# Header\n\n{/* @include ./includes/partial.mdx */}\n";
    expect(collectIncludePaths(source, fixturesDeckPath)).toEqual([partialPath]);
  });

  it("recurses into nested includes", () => {
    const source = "{/* @include ./includes/main.mdx */}\n";
    expect(collectIncludePaths(source, fixturesDeckPath)).toEqual([mainPath, partialPath]);
  });

  it("ignores non-.mdx include paths", () => {
    const source = "{/* @include ./includes/partial.md */}\n";
    expect(collectIncludePaths(source, fixturesDeckPath)).toEqual([]);
  });

  it("returns the path for missing includes (so they're still watched)", () => {
    const source = "{/* @include ./does-not-exist.mdx */}\n";
    expect(collectIncludePaths(source, fixturesDeckPath)).toEqual([
      path.join(fixturesDir, "does-not-exist.mdx"),
    ]);
  });

  it("returns empty for source without include directives", () => {
    expect(collectIncludePaths("# Heading\n\nNo directives.\n", fixturesDir)).toEqual([]);
  });

  it("deduplicates the same include referenced twice", () => {
    const source =
      "{/* @include ./includes/partial.mdx */}\n\n{/* @include ./includes/partial.mdx */}\n";
    expect(collectIncludePaths(source, fixturesDeckPath)).toEqual([partialPath]);
  });

  it("ignores non-include MDX flow expressions", () => {
    const source = "{/* notes: speaker note */}\n{/* _class: banner */}\n";
    expect(collectIncludePaths(source, fixturesDeckPath)).toEqual([]);
  });
});

describe("viteDeckWatchIncludes plugin", () => {
  it("only applies during dev", () => {
    expect(viteDeckWatchIncludes().apply).toBe("serve");
  });

  it("registers includes from a real .deck.mdx fixture on transform", () => {
    const plugin = viteDeckWatchIncludes();
    const server = fakeServer();
    plugin.configureServer(server);
    const id = path.join(fixturesDir, "with-mdx-include.deck.mdx");
    plugin.transform.call({}, "ignored", id);
    expect(server.watcher.add).toHaveBeenCalledWith([partialPath]);
  });

  it("does nothing on transform for non-.deck.mdx ids", () => {
    const plugin = viteDeckWatchIncludes();
    const server = fakeServer();
    plugin.configureServer(server);
    const id = path.join(fixturesDir, "ordinary.md");
    plugin.transform.call({}, "ignored", id);
    expect(server.watcher.add).not.toHaveBeenCalled();
  });

  it("strips query suffix from id when resolving", () => {
    const plugin = viteDeckWatchIncludes();
    const server = fakeServer();
    plugin.configureServer(server);
    const id = path.join(fixturesDir, "with-mdx-include.deck.mdx") + "?import";
    plugin.transform.call({}, "ignored", id);
    expect(server.watcher.add).toHaveBeenCalledWith([partialPath]);
  });

  it("does not throw when the deck file is missing", () => {
    const plugin = viteDeckWatchIncludes();
    const server = fakeServer();
    plugin.configureServer(server);
    const id = path.join(fixturesDir, "does-not-exist.deck.mdx");
    expect(() => plugin.transform.call({}, "ignored", id)).not.toThrow();
    expect(server.watcher.add).not.toHaveBeenCalled();
  });

  it("sends full-reload when a tracked include changes", () => {
    const plugin = viteDeckWatchIncludes();
    const server = fakeServer();
    plugin.configureServer(server);
    const deckId = path.join(fixturesDir, "with-mdx-include.deck.mdx");
    plugin.transform.call({}, "ignored", deckId);
    plugin.handleHotUpdate({ file: partialPath });
    expect(server.ws.send).toHaveBeenCalledWith({ type: "full-reload" });
  });

  it("invalidates each parent deck module when a tracked include changes", () => {
    const plugin = viteDeckWatchIncludes();
    const server = fakeServer();
    plugin.configureServer(server);
    const deckId = path.join(fixturesDir, "with-mdx-include.deck.mdx");
    plugin.transform.call({}, "ignored", deckId);
    plugin.handleHotUpdate({ file: partialPath });
    expect(server.moduleGraph.onFileChange).toHaveBeenCalledWith(deckId);
    const sendOrder = server.ws.send.mock.invocationCallOrder[0]!;
    const invalidateOrder = server.moduleGraph.onFileChange.mock.invocationCallOrder[0]!;
    expect(invalidateOrder).toBeLessThan(sendOrder);
  });

  it("does not send full-reload for unrelated file changes", () => {
    const plugin = viteDeckWatchIncludes();
    const server = fakeServer();
    plugin.configureServer(server);
    const deckId = path.join(fixturesDir, "with-mdx-include.deck.mdx");
    plugin.transform.call({}, "ignored", deckId);
    plugin.handleHotUpdate({ file: path.join(fixturesDir, "unrelated.mdx") });
    expect(server.ws.send).not.toHaveBeenCalled();
    expect(server.moduleGraph.onFileChange).not.toHaveBeenCalled();
  });
});
