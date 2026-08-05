import { describe, expect, it } from "vitest";

import { claimFirstView, helpSeenKey, isSuppressedView } from "../src/first-run-help";

const fakeStore = (): Storage & { size: () => number } => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
    size: () => map.size,
  };
};

const throwingStore = (): Storage =>
  new Proxy({} as Storage, {
    get() {
      throw new DOMException("storage disabled");
    },
  });

describe("helpSeenKey", () => {
  it("scopes the flag to the deck path", () => {
    expect(helpSeenKey("/decks/intro")).not.toBe(helpSeenKey("/decks/outro"));
  });
});

describe("isSuppressedView", () => {
  it("suppresses the overlay in the PDF export view", () => {
    expect(isSuppressedView("?print-pdf&showNotes=separate-page")).toBe(true);
  });

  it("leaves ordinary and param-gated deck URLs alone", () => {
    expect(isSuppressedView("")).toBe(false);
    expect(isSuppressedView("?presenters")).toBe(false);
  });
});

describe("claimFirstView", () => {
  it("claims once, then reports every later view as seen", () => {
    const storage = fakeStore();
    const key = helpSeenKey("/decks/intro");
    expect(claimFirstView(storage, key)).toBe(true);
    expect(claimFirstView(storage, key)).toBe(false);
    expect(claimFirstView(storage, key)).toBe(false);
  });

  it("treats a second deck in the same session as its own first view", () => {
    const storage = fakeStore();
    expect(claimFirstView(storage, helpSeenKey("/decks/intro"))).toBe(true);
    expect(claimFirstView(storage, helpSeenKey("/decks/outro"))).toBe(true);
  });

  it("stays quiet when storage is missing rather than showing on every load", () => {
    expect(claimFirstView(undefined, helpSeenKey("/decks/intro"))).toBe(false);
  });

  it("stays quiet when storage throws, and doesn't propagate the error", () => {
    expect(claimFirstView(throwingStore(), helpSeenKey("/decks/intro"))).toBe(false);
  });
});
