import { describe, expect, it } from "vitest";

// @ts-expect-error -- .mjs source with no type declarations
import { measureSlide, TEXT_SELECTOR } from "../src/deck-check.mjs";

// measureSlide runs inside the browser, so the unit under test is its
// arithmetic, not the DOM. These stubs hand it exactly the three things it
// reads: a present section, the elements a selector matches, and computed
// overflow. Rects are in rendered pixels; the section is 900 tall so the
// scale is 900/720 = 1.25, which also proves the conversion back to canvas
// units happens.
type Rect = { bottom: number; height: number; right: number; width: number };

function el(
  tag: string,
  rect: Partial<Rect>,
  extra: Partial<{ children: unknown[]; className: string; overflow: string }> = {},
) {
  const full: Rect = { bottom: 0, height: 10, right: 0, width: 10, ...rect };
  return {
    className: extra.className ?? "",
    getBoundingClientRect: () => full,
    overflow: extra.overflow ?? "visible",
    querySelectorAll: () => extra.children ?? [],
    tagName: tag.toUpperCase(),
  };
}

function withSlide(
  { all = [] as unknown[], heading = "", text = [] as unknown[] },
  run: () => ReturnType<typeof measureSlide>,
) {
  const section = {
    getBoundingClientRect: () => ({ bottom: 900, height: 900, right: 1600, width: 1600 }),
    querySelector: () => (heading ? { textContent: heading } : null),
    querySelectorAll: (selector: string) => (selector === "*" ? all : text),
  };
  const globals = globalThis as unknown as Record<string, unknown>;
  const prior = { doc: globals.document, gcs: globals.getComputedStyle };
  globals.document = { querySelector: () => section };
  globals.getComputedStyle = (node: { overflow: string }) => ({
    borderBottomWidth: "0px",
    borderRightWidth: "0px",
    overflow: node.overflow,
    overflowX: node.overflow,
  });
  try {
    return run();
  } finally {
    globals.document = prior.doc;
    globals.getComputedStyle = prior.gcs;
  }
}

describe("measureSlide", () => {
  it("passes a slide whose content sits inside the canvas", () => {
    const result = withSlide({ text: [el("P", { bottom: 800, right: 900 })] }, () =>
      measureSlide(TEXT_SELECTOR, 4),
    );
    expect(result.violations).toEqual([]);
  });

  it("reports vertical overflow in canvas units, not rendered pixels", () => {
    // 125 rendered px past the bottom, on a 1.25 scale, is 100 canvas px.
    const result = withSlide({ text: [el("UL", { bottom: 1025, right: 900 })] }, () =>
      measureSlide(TEXT_SELECTOR, 4),
    );
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].rule).toBe("overflow");
    expect(result.violations[0].detail).toContain("100px past the bottom");
  });

  it("ignores overflow within the tolerance", () => {
    const result = withSlide({ text: [el("P", { bottom: 903, right: 900 })] }, () =>
      measureSlide(TEXT_SELECTOR, 4),
    );
    expect(result.violations).toEqual([]);
  });

  it("catches a scrollable element hiding its own content", () => {
    // A code block squashed to its padding: the box ends at 500, the code
    // lines inside run to 590 — 90 rendered px, 72 canvas px, off screen.
    const line = el("SPAN", { bottom: 590, height: 20, right: 700, width: 400 });
    const pre = el(
      "PRE",
      { bottom: 500, height: 43, right: 800, width: 600 },
      { children: [line], className: "astro-code theme-dark", overflow: "auto" },
    );
    const result = withSlide({ all: [pre] }, () => measureSlide(TEXT_SELECTOR, 4));
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].rule).toBe("clipped");
    expect(result.violations[0].detail).toContain("pre.astro-code");
    expect(result.violations[0].detail).toContain("72px");
    expect(result.violations[0].detail).toContain("below");
  });

  it("does not blame a scroll container for its last child's bottom margin", () => {
    // The regression that made the first cut of this rule unusable: a fine
    // slide whose scrollHeight exceeds clientHeight by padding + margin, with
    // every child comfortably inside the visible box.
    const list = el("UL", { bottom: 713, height: 300, right: 900, width: 700 });
    const content = el(
      "DIV",
      { bottom: 720, height: 720, right: 960, width: 960 },
      { children: [list], className: "split-content", overflow: "auto" },
    );
    const result = withSlide({ all: [content] }, () => measureSlide(TEXT_SELECTOR, 4));
    expect(result.violations).toEqual([]);
  });

  it("does not call an overflow:visible element clipped", () => {
    const child = el("P", { bottom: 900, height: 400 });
    const div = el("DIV", { bottom: 500, height: 100 }, { children: [child], overflow: "visible" });
    const result = withSlide({ all: [div] }, () => measureSlide(TEXT_SELECTOR, 4));
    expect(result.violations).toEqual([]);
  });

  it("reports only the worst of nested scroll containers", () => {
    const line = el("SPAN", { bottom: 900, height: 20, right: 700, width: 400 });
    const pre = el(
      "PRE",
      { bottom: 700, height: 43, right: 800, width: 600 },
      { children: [line], className: "astro-code", overflow: "auto" },
    );
    const content = el(
      "DIV",
      { bottom: 720, height: 720, right: 960, width: 960 },
      { children: [pre, line], className: "split-content", overflow: "auto" },
    );
    const result = withSlide({ all: [content, pre] }, () => measureSlide(TEXT_SELECTOR, 4));
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].detail).toContain("pre.astro-code");
  });

  it("reports the slide's heading so a violation can be found by eye", () => {
    const result = withSlide(
      { heading: "2. Install the course plugin", text: [el("UL", { bottom: 1100 })] },
      () => measureSlide(TEXT_SELECTOR, 4),
    );
    expect(result.heading).toBe("2. Install the course plugin");
  });
});
