import { describe, expect, it } from "vitest";

// @ts-expect-error -- .mjs source with no type declarations
import { measureSlide, TEXT_SELECTOR } from "../src/deck-check.mjs";

// measureSlide runs inside the browser, so the unit under test is its
// arithmetic, not the DOM. These stubs hand it exactly the things it reads:
// a present section, the elements a selector matches, computed overflow and
// padding, and a scroll container's scroll geometry. Rects are in rendered
// pixels; the section is 900 tall so the scale is 900/720 = 1.25, which also
// proves the conversion back to canvas units happens. The section pads 80
// rendered px (64 canvas px, the theme's 4rem gutter) on every side, so its
// content area ends at 820 down and 1520 across.
type Rect = { bottom: number; height: number; right: number; width: number };

type Extra = Partial<{
  children: unknown[];
  className: string;
  clientHeight: number;
  clientWidth: number;
  column: unknown;
  overflow: string;
  padding: number;
  scrollHeight: number;
  scrollWidth: number;
}>;

function el(tag: string, rect: Partial<Rect>, extra: Extra = {}) {
  const full: Rect = { bottom: 0, height: 10, right: 0, width: 10, ...rect };
  return {
    className: extra.className ?? "",
    clientHeight: extra.clientHeight ?? 0,
    clientWidth: extra.clientWidth ?? 0,
    closest: () => extra.column ?? null,
    getBoundingClientRect: () => full,
    overflow: extra.overflow ?? "visible",
    padding: extra.padding ?? 0,
    querySelectorAll: () => extra.children ?? [],
    scrollHeight: extra.scrollHeight ?? 0,
    scrollWidth: extra.scrollWidth ?? 0,
    tagName: tag.toUpperCase(),
  };
}

const SECTION_PADDING = 80;

function withSlide(
  { all = [] as unknown[], heading = "", text = [] as unknown[] },
  run: () => ReturnType<typeof measureSlide>,
) {
  const section = {
    getBoundingClientRect: () => ({ bottom: 900, height: 900, right: 1600, width: 1600 }),
    padding: SECTION_PADDING,
    querySelector: () => (heading ? { textContent: heading } : null),
    querySelectorAll: (selector: string) => (selector === "*" ? all : text),
  };
  const globals = globalThis as unknown as Record<string, unknown>;
  const prior = { doc: globals.document, gcs: globals.getComputedStyle };
  globals.document = { querySelector: () => section };
  globals.getComputedStyle = (node: { overflow: string; padding: number }) => ({
    borderBottomWidth: "0px",
    borderRightWidth: "0px",
    overflow: node.overflow,
    overflowX: node.overflow,
    overflowY: node.overflow,
    paddingBottom: `${node.padding}px`,
    paddingRight: `${node.padding}px`,
  });
  try {
    return run();
  } finally {
    globals.document = prior.doc;
    globals.getComputedStyle = prior.gcs;
  }
}

describe("measureSlide", () => {
  it("passes a slide whose content sits inside the content area", () => {
    const result = withSlide({ text: [el("P", { bottom: 800, right: 900 })] }, () =>
      measureSlide(TEXT_SELECTOR, 4),
    );
    expect(result.violations).toEqual([]);
  });

  it("reports vertical overflow in canvas units, not rendered pixels", () => {
    // 125 rendered px below the content area, on a 1.25 scale, is 100 canvas
    // px --- and the gutter it ran into is reported in the same units.
    const result = withSlide({ text: [el("UL", { bottom: 945, right: 900 })] }, () =>
      measureSlide(TEXT_SELECTOR, 4),
    );
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].rule).toBe("overflow");
    expect(result.violations[0].detail).toContain("100px below the content area");
    expect(result.violations[0].detail).toContain("gutter there is 64px");
  });

  it("measures against the gutter, not the canvas edge", () => {
    // Inside the canvas (900) but 30 rendered px into the bottom padding: the
    // slide is already too full, and this is where a scroll container would
    // start drawing a scrollbar.
    const result = withSlide({ text: [el("P", { bottom: 850, right: 900 })] }, () =>
      measureSlide(TEXT_SELECTOR, 4),
    );
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].detail).toContain("24px below the content area");
  });

  it("reports horizontal overflow separately", () => {
    const result = withSlide({ text: [el("PRE", { bottom: 500, right: 1600 })] }, () =>
      measureSlide(TEXT_SELECTOR, 4),
    );
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].detail).toContain("64px right of the content area");
  });

  it("measures text inside a split column against that column's padding", () => {
    // A split layout escapes the section's padding and pads its own column
    // (here 40 rendered px), so the same paragraph that would be 30px into the
    // section's gutter is 10px inside the column's content area.
    const column = el("DIV", { bottom: 900, height: 900, right: 960, width: 960 }, { padding: 40 });
    const result = withSlide({ text: [el("P", { bottom: 850, right: 900 }, { column })] }, () =>
      measureSlide(TEXT_SELECTOR, 4),
    );
    expect(result.violations).toEqual([]);
  });

  it("ignores overflow within the tolerance", () => {
    const result = withSlide({ text: [el("P", { bottom: 823, right: 900 })] }, () =>
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

  it("reports a scroll container that draws a scrollbar without hiding anything", () => {
    // Every child sits inside the visible box, but the scrollable area counts
    // the list's trailing margin and the column's bottom padding, so the
    // browser draws a scrollbar: 130 rendered px of scroll, 104 canvas px.
    const list = el("UL", { bottom: 890, height: 300, right: 900, width: 700 });
    const content = el(
      "DIV",
      { bottom: 900, height: 900, right: 960, width: 960 },
      {
        children: [list],
        className: "split-content",
        clientHeight: 900,
        overflow: "auto",
        scrollHeight: 1030,
      },
    );
    const result = withSlide({ all: [content] }, () => measureSlide(TEXT_SELECTOR, 4));
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].rule).toBe("scrollbar");
    expect(result.violations[0].detail).toContain("div.split-content scrolls 104px vertically");
  });

  it("does not also call a clipped container scrolling", () => {
    const line = el("SPAN", { bottom: 590, height: 20, right: 700, width: 400 });
    const pre = el(
      "PRE",
      { bottom: 500, height: 43, right: 800, width: 600 },
      {
        children: [line],
        className: "astro-code",
        clientHeight: 43,
        overflow: "auto",
        scrollHeight: 133,
      },
    );
    const result = withSlide({ all: [pre] }, () => measureSlide(TEXT_SELECTOR, 4));
    expect(result.violations.map((v: { rule: string }) => v.rule)).toEqual(["clipped"]);
  });

  it("does not blame overflow: hidden for scrollable area it never shows", () => {
    const content = el(
      "DIV",
      { bottom: 900, height: 900, right: 960, width: 960 },
      { clientHeight: 900, overflow: "hidden", scrollHeight: 1030 },
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
