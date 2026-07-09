import { describe, it, expect } from "vitest";
import { withBase, absoluteUrl } from "../src/head-urls.ts";

describe("withBase", () => {
  it("leaves root-absolute paths alone at the site root", () => {
    expect(withBase("/favicon.svg", "/")).toBe("/favicon.svg");
  });

  it("prefixes root-absolute paths under a base path", () => {
    expect(withBase("/favicon.svg", "/courses/comp4020/")).toBe("/courses/comp4020/favicon.svg");
  });

  it("tolerates a base without its trailing slash", () => {
    expect(withBase("/favicon.svg", "/courses/comp4020")).toBe("/courses/comp4020/favicon.svg");
  });

  it("never double-prefixes an absolute URL", () => {
    expect(withBase("https://cdn.example/og.png", "/base/")).toBe("https://cdn.example/og.png");
    expect(withBase("//cdn.example/og.png", "/base/")).toBe("//cdn.example/og.png");
    expect(withBase("data:image/svg+xml,<svg/>", "/base/")).toBe("data:image/svg+xml,<svg/>");
  });

  it("leaves relative paths to resolve against the page", () => {
    expect(withBase("./og.png", "/base/")).toBe("./og.png");
    expect(withBase("og.png", "/base/")).toBe("og.png");
  });
});

describe("absoluteUrl", () => {
  const site = new URL("https://comp.anu.edu.au");
  const page = new URL("https://comp.anu.edu.au/courses/comp4020/decks/week-1/");

  it("qualifies a root-absolute path against site and base", () => {
    expect(absoluteUrl("/og-image.svg", site, page, "/courses/comp4020/")).toBe(
      "https://comp.anu.edu.au/courses/comp4020/og-image.svg",
    );
  });

  it("falls back to the page origin when no site is configured", () => {
    expect(absoluteUrl("/og-image.svg", undefined, page, "/courses/comp4020/")).toBe(
      "https://comp.anu.edu.au/courses/comp4020/og-image.svg",
    );
  });

  it("passes through an already-absolute URL", () => {
    expect(absoluteUrl("https://cdn.example/og.png", site, page, "/base/")).toBe(
      "https://cdn.example/og.png",
    );
  });
});
