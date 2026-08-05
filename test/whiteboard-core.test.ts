import { describe, expect, it } from "vitest";
import {
  annotationFilename,
  applyAction,
  backgroundImageUrl,
  beginStroke,
  boardFilename,
  BRUSH_SIZES,
  coverRect,
  createWhiteboard,
  endStroke,
  extendStroke,
  INK_PALETTES,
  keyAction,
  liveStrokes,
  MAX_INKS,
  resolveInkPalette,
  resolveMode,
  slideKey,
  type WhiteboardState,
} from "../src/whiteboard/core.ts";

const PALETTE_SIZE = INK_PALETTES.light.length;
const NONE = { shift: false, other: false };
const SHIFT = { shift: true, other: false };
const MOD = { shift: false, other: true };

function openBoard(): WhiteboardState {
  return applyAction(createWhiteboard(), { type: "toggle", surface: "board" }, PALETTE_SIZE);
}

function openAnnotation(): WhiteboardState {
  return applyAction(createWhiteboard(), { type: "toggle", surface: "slide" }, PALETTE_SIZE);
}

function draw(state: WhiteboardState, x: number): WhiteboardState {
  return endStroke(beginStroke(state, { x, y: x, pressure: 0.5 }, false));
}

describe("createWhiteboard", () => {
  it("starts inactive with no strokes, the first colour, and the fine brush", () => {
    expect(createWhiteboard()).toEqual({
      active: false,
      surface: "board",
      color: 0,
      size: 0,
      board: [],
      slides: {},
      slide: slideKey(0, 0),
      current: null,
    });
  });
});

const inks = (value: string) => (name: string) => (name === "--astromotion-wb-inks" ? value : "");
const mode = (value: string) => (name: string) => (name === "--astromotion-wb-mode" ? value : "");

describe("resolveMode", () => {
  it("defaults to a light board when the theme says nothing", () => {
    expect(resolveMode(mode(""))).toBe("light");
  });

  it("reads dark, however the theme spaced or cased it", () => {
    expect(resolveMode(mode("dark"))).toBe("dark");
    expect(resolveMode(mode("  Dark "))).toBe("dark");
  });

  it("treats anything it doesn't recognise as light", () => {
    expect(resolveMode(mode("light"))).toBe("light");
    expect(resolveMode(mode("charcoal"))).toBe("light");
  });
});

describe("resolveInkPalette", () => {
  it("falls back to the default palette when the theme defines no inks", () => {
    expect(resolveInkPalette(inks(""))).toEqual(INK_PALETTES.light);
  });

  it("falls back to the mode's palette, so a dark board opens on pale ink", () => {
    expect(resolveInkPalette(inks(""), "dark")).toEqual(INK_PALETTES.dark);
    expect(resolveInkPalette(inks("#111, #222"), "dark")).toEqual(["#111", "#222"]);
  });

  it("splits the theme's comma-separated list, whatever its length", () => {
    expect(resolveInkPalette(inks("#0d0d0d, #be830e, #be4e0e, #0085ad, #1e9e4a"))).toEqual([
      "#0d0d0d",
      "#be830e",
      "#be4e0e",
      "#0085ad",
      "#1e9e4a",
    ]);
    expect(resolveInkPalette(inks("red"))).toEqual(["red"]);
  });

  it("keeps commas inside functional notation together", () => {
    expect(resolveInkPalette(inks("rgb(190, 131, 14), hsl(200, 100%, 34%)"))).toEqual([
      "rgb(190, 131, 14)",
      "hsl(200, 100%, 34%)",
    ]);
  });

  it("tolerates ragged whitespace and empty segments", () => {
    expect(resolveInkPalette(inks("  #111 ,, #222,  "))).toEqual(["#111", "#222"]);
  });

  it("caps the palette at MAX_INKS (the digit keys)", () => {
    const twelve = Array.from({ length: 12 }, (_, i) => `#${i}${i}${i}`).join(", ");
    expect(resolveInkPalette(inks(twelve))).toHaveLength(MAX_INKS);
  });
});

describe("backgroundImageUrl", () => {
  it("pulls the url out of a computed background-image", () => {
    expect(backgroundImageUrl(`url("/decks/_astro/board.avif")`)).toBe("/decks/_astro/board.avif");
    expect(backgroundImageUrl("url('board.avif')")).toBe("board.avif");
    expect(backgroundImageUrl("url(board.avif)")).toBe("board.avif");
  });

  it("returns null for values the export can't composite", () => {
    expect(backgroundImageUrl("none")).toBeNull();
    expect(backgroundImageUrl("")).toBeNull();
    expect(backgroundImageUrl("linear-gradient(#000, #fff)")).toBeNull();
  });
});

describe("coverRect", () => {
  it("centres the overflow when the source is wider than the box", () => {
    expect(coverRect({ width: 200, height: 50 }, { width: 100, height: 100 })).toEqual({
      x: -150,
      y: 0,
      width: 400,
      height: 100,
    });
  });

  it("centres the overflow when the source is taller than the box", () => {
    expect(coverRect({ width: 50, height: 200 }, { width: 100, height: 100 })).toEqual({
      x: 0,
      y: -150,
      width: 100,
      height: 400,
    });
  });

  it("fills the box exactly when the aspect ratios match", () => {
    expect(coverRect({ width: 1600, height: 900 }, { width: 800, height: 450 })).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 450,
    });
  });

  it("falls back to the box for a source with no intrinsic size", () => {
    expect(coverRect({ width: 0, height: 0 }, { width: 100, height: 60 })).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 60,
    });
  });
});

describe("keyAction", () => {
  it("claims only W while inactive, so the rest of the keyboard is Reveal's", () => {
    const state = createWhiteboard();
    for (const key of ["Escape", "1", "z", "c", "d", "ArrowRight", " "]) {
      expect(keyAction(state, key, NONE, PALETTE_SIZE)).toBeNull();
    }
  });

  it("picks the surface from shift, not the letter's case", () => {
    for (const state of [createWhiteboard(), openBoard(), openAnnotation()]) {
      for (const key of ["w", "W"]) {
        expect(keyAction(state, key, NONE, PALETTE_SIZE)).toEqual({
          type: "toggle",
          surface: "board",
        });
        expect(keyAction(state, key, SHIFT, PALETTE_SIZE)).toEqual({
          type: "toggle",
          surface: "slide",
        });
      }
    }
  });

  it("closes on Escape from either surface", () => {
    for (const state of [openBoard(), openAnnotation()]) {
      expect(keyAction(state, "Escape", NONE, PALETTE_SIZE)).toEqual({ type: "close" });
    }
  });

  it("undoes on z and u (either case)", () => {
    const state = openBoard();
    for (const key of ["z", "Z", "u", "U"]) {
      expect(keyAction(state, key, NONE, PALETTE_SIZE)).toEqual({ type: "undo" });
    }
  });

  it("clears on c, Backspace, and Delete", () => {
    const state = openBoard();
    for (const key of ["c", "C", "Backspace", "Delete"]) {
      expect(keyAction(state, key, NONE, PALETTE_SIZE)).toEqual({ type: "clear" });
    }
  });

  it("downloads on d (either case)", () => {
    const state = openBoard();
    for (const key of ["d", "D"]) {
      expect(keyAction(state, key, NONE, PALETTE_SIZE)).toEqual({ type: "download" });
    }
  });

  it("maps the leading digits to zero-based palette indices", () => {
    const state = openBoard();
    expect(keyAction(state, "1", NONE, PALETTE_SIZE)).toEqual({ type: "color", index: 0 });
    expect(keyAction(state, "4", NONE, PALETTE_SIZE)).toEqual({ type: "color", index: 3 });
    expect(keyAction(state, "0", NONE, PALETTE_SIZE)).toBeNull();
  });

  it("maps the digits after the palette to brush sizes, then gives up the key", () => {
    const state = openBoard();
    // PALETTE_SIZE is 4, so 5 and 6 are the two brush sizes
    expect(keyAction(state, "5", NONE, PALETTE_SIZE)).toEqual({ type: "size", index: 0 });
    expect(keyAction(state, "6", NONE, PALETTE_SIZE)).toEqual({ type: "size", index: 1 });
    expect(keyAction(state, "7", NONE, PALETTE_SIZE)).toBeNull();
    expect(keyAction(state, "9", NONE, PALETTE_SIZE)).toBeNull();
  });

  it("shifts the size keys with the palette length", () => {
    const state = openBoard();
    expect(keyAction(state, "2", NONE, 1)).toEqual({ type: "size", index: 0 });
    expect(keyAction(state, "8", NONE, MAX_INKS)).toEqual({ type: "size", index: 0 });
    expect(keyAction(state, "9", NONE, MAX_INKS)).toEqual({ type: "size", index: 1 });
  });

  it("leaves every key it does not claim to the deck, on either surface", () => {
    // Navigation keeps working with the board up, and so do Reveal's F, S and
    // B --- the pen only takes what it needs.
    for (const state of [openBoard(), openAnnotation()]) {
      for (const key of ["ArrowRight", "ArrowLeft", " ", "n", "p", "f", "s", "b", "o", "Enter"]) {
        expect(keyAction(state, key, NONE, PALETTE_SIZE)).toBeNull();
      }
    }
  });

  it("lets modified keys pass through for browser shortcuts", () => {
    const state = openBoard();
    expect(keyAction(state, "r", MOD, PALETTE_SIZE)).toBeNull();
    expect(keyAction(state, "w", MOD, PALETTE_SIZE)).toBeNull();
  });
});

describe("applyAction", () => {
  it("toggling the surface already showing closes the board", () => {
    const opened = openBoard();
    expect(opened.active).toBe(true);
    expect(opened.surface).toBe("board");
    const closed = applyAction(opened, { type: "toggle", surface: "board" }, PALETTE_SIZE);
    expect(closed.active).toBe(false);
  });

  it("toggling the other surface crosses over with both drawings intact", () => {
    let state = draw(openBoard(), 1);
    state = applyAction(state, { type: "toggle", surface: "slide" }, PALETTE_SIZE);
    expect(state.active).toBe(true);
    expect(state.surface).toBe("slide");
    state = draw(state, 2);
    expect(liveStrokes(state)).toHaveLength(1);

    state = applyAction(state, { type: "toggle", surface: "board" }, PALETTE_SIZE);
    expect(state.surface).toBe("board");
    expect(state.board).toHaveLength(1);
    expect(state.slides[state.slide]).toHaveLength(1);
  });

  it("close keeps strokes and the colour/size selection for the next toggle", () => {
    let state = applyAction(openBoard(), { type: "color", index: 2 }, PALETTE_SIZE);
    state = applyAction(state, { type: "size", index: 1 }, PALETTE_SIZE);
    state = beginStroke(state, { x: 0, y: 0, pressure: 0.5 }, false);
    state = endStroke(state);
    const closed = applyAction(state, { type: "close" }, PALETTE_SIZE);
    expect(closed.active).toBe(false);
    expect(closed.color).toBe(2);
    expect(closed.size).toBe(1);
    expect(closed.board).toHaveLength(1);
    const reopened = applyAction(closed, { type: "toggle", surface: "board" }, PALETTE_SIZE);
    expect(reopened.board).toHaveLength(1);
  });

  it("close commits a stroke still in progress", () => {
    let state = beginStroke(openBoard(), { x: 0, y: 0, pressure: 0.5 }, false);
    state = extendStroke(state, { x: 1, y: 1, pressure: 0.5 });
    const closed = applyAction(state, { type: "close" }, PALETTE_SIZE);
    expect(closed.current).toBeNull();
    expect(closed.board).toHaveLength(1);
  });

  it("ignores out-of-range colour indices", () => {
    const state = openBoard();
    expect(applyAction(state, { type: "color", index: PALETTE_SIZE }, PALETTE_SIZE)).toBe(state);
    expect(applyAction(state, { type: "color", index: -1 }, PALETTE_SIZE)).toBe(state);
  });

  it("re-selecting the current colour is an identity no-op", () => {
    const state = openBoard();
    expect(applyAction(state, { type: "color", index: 0 }, PALETTE_SIZE)).toBe(state);
  });

  it("size selects a brush; out-of-range and re-select are identity no-ops", () => {
    const state = openBoard();
    const broad = applyAction(state, { type: "size", index: 1 }, PALETTE_SIZE);
    expect(broad.size).toBe(1);
    expect(applyAction(state, { type: "size", index: 0 }, PALETTE_SIZE)).toBe(state);
    expect(applyAction(state, { type: "size", index: BRUSH_SIZES.length }, PALETTE_SIZE)).toBe(
      state,
    );
    expect(applyAction(state, { type: "size", index: -1 }, PALETTE_SIZE)).toBe(state);
  });

  it("undo removes the most recent stroke only", () => {
    let state = openBoard();
    state = endStroke(beginStroke(state, { x: 1, y: 1, pressure: 0.5 }, false));
    state = endStroke(beginStroke(state, { x: 2, y: 2, pressure: 0.5 }, false));
    const undone = applyAction(state, { type: "undo" }, PALETTE_SIZE);
    expect(undone.board).toHaveLength(1);
    expect(undone.board[0].points[0].x).toBe(1);
  });

  it("undo on an empty board is an identity no-op", () => {
    const state = openBoard();
    expect(applyAction(state, { type: "undo" }, PALETTE_SIZE)).toBe(state);
  });

  it("clear drops all strokes including one in progress", () => {
    let state = openBoard();
    state = endStroke(beginStroke(state, { x: 1, y: 1, pressure: 0.5 }, false));
    state = beginStroke(state, { x: 2, y: 2, pressure: 0.5 }, false);
    const cleared = applyAction(state, { type: "clear" }, PALETTE_SIZE);
    expect(cleared.board).toEqual([]);
    expect(cleared.current).toBeNull();
    expect(cleared.active).toBe(true);
  });

  it("clear on an empty board is an identity no-op", () => {
    const state = openBoard();
    expect(applyAction(state, { type: "clear" }, PALETTE_SIZE)).toBe(state);
  });

  it("download is an identity no-op on the state", () => {
    const state = openBoard();
    expect(applyAction(state, { type: "download" }, PALETTE_SIZE)).toBe(state);
  });
});

describe("slide annotations", () => {
  const go = (state: WhiteboardState, h: number, v = 0) =>
    applyAction(state, { type: "slide", key: slideKey(h, v) }, PALETTE_SIZE);

  it("keeps ink per slide, so stepping away and back brings it with you", () => {
    let state = draw(openAnnotation(), 1);
    state = go(state, 1);
    expect(liveStrokes(state)).toEqual([]);
    state = draw(state, 2);
    expect(liveStrokes(state)).toHaveLength(1);

    state = go(state, 0);
    expect(liveStrokes(state)).toHaveLength(1);
    expect(liveStrokes(state)[0].points[0].x).toBe(1);
  });

  it("ignores the fragment step: one annotation covers the whole slide", () => {
    expect(slideKey(2, 0)).toBe("2.0");
    expect(slideKey(2, 1)).not.toBe(slideKey(2, 0));
  });

  it("undo and clear act on the slide on screen, not the board behind it", () => {
    let state = draw(openBoard(), 9);
    state = applyAction(state, { type: "toggle", surface: "slide" }, PALETTE_SIZE);
    state = draw(draw(state, 1), 2);
    state = go(state, 1);
    state = draw(state, 3);

    const undone = applyAction(state, { type: "undo" }, PALETTE_SIZE);
    expect(undone.slides[slideKey(1, 0)]).toEqual([]);
    expect(undone.slides[slideKey(0, 0)]).toHaveLength(2);

    const cleared = applyAction(state, { type: "clear" }, PALETTE_SIZE);
    expect(cleared.slides[slideKey(1, 0)]).toEqual([]);
    expect(cleared.slides[slideKey(0, 0)]).toHaveLength(2);
    expect(cleared.board).toHaveLength(1);
  });

  it("closing discards every slide's ink but leaves the board's drawing", () => {
    let state = draw(openBoard(), 9);
    state = applyAction(state, { type: "toggle", surface: "slide" }, PALETTE_SIZE);
    state = draw(state, 1);
    state = draw(go(state, 1), 2);

    const closed = applyAction(state, { type: "close" }, PALETTE_SIZE);
    expect(closed.active).toBe(false);
    expect(closed.slides).toEqual({});
    expect(closed.board).toHaveLength(1);
  });

  it("changing slide mid-stroke lands the ink on the slide it was drawn on", () => {
    let state = beginStroke(openAnnotation(), { x: 1, y: 1, pressure: 0.5 }, false);
    state = go(state, 1);
    expect(state.current).toBeNull();
    expect(state.slides[slideKey(0, 0)]).toHaveLength(1);
    expect(liveStrokes(state)).toEqual([]);
  });

  it("re-announcing the slide already showing is an identity no-op", () => {
    const state = openAnnotation();
    expect(applyAction(state, { type: "slide", key: state.slide }, PALETTE_SIZE)).toBe(state);
  });
});

describe("annotationFilename", () => {
  it("names the slide one-based, matching the deck's own hash", () => {
    expect(annotationFilename({ h: 0, v: 0 }, new Date(2026, 6, 3, 15, 4, 27))).toBe(
      "annotation-1-1-20260703-150427.png",
    );
    expect(annotationFilename({ h: 4, v: 2 }, new Date(2026, 11, 31, 23, 59, 59))).toBe(
      "annotation-5-3-20261231-235959.png",
    );
  });
});

describe("boardFilename", () => {
  it("formats a local timestamp with zero padding", () => {
    expect(boardFilename(new Date(2026, 6, 3, 15, 4, 27))).toBe("whiteboard-20260703-150427.png");
    expect(boardFilename(new Date(2026, 11, 31, 23, 59, 59))).toBe(
      "whiteboard-20261231-235959.png",
    );
  });
});

describe("stroke lifecycle", () => {
  it("begin captures the colour, size, and pen flag at pointerdown", () => {
    let state = applyAction(openBoard(), { type: "color", index: 1 }, PALETTE_SIZE);
    state = applyAction(state, { type: "size", index: 1 }, PALETTE_SIZE);
    state = beginStroke(state, { x: 5, y: 6, pressure: 0.8 }, true);
    expect(state.current).toEqual({
      color: 1,
      size: 1,
      pen: true,
      points: [{ x: 5, y: 6, pressure: 0.8 }],
    });
  });

  it("a colour or size change mid-stroke does not restyle the stroke in progress", () => {
    let state = beginStroke(openBoard(), { x: 0, y: 0, pressure: 0.5 }, false);
    state = applyAction(state, { type: "color", index: 3 }, PALETTE_SIZE);
    state = applyAction(state, { type: "size", index: 1 }, PALETTE_SIZE);
    expect(state.current?.color).toBe(0);
    expect(state.current?.size).toBe(0);
    state = endStroke(state);
    expect(state.board[0].color).toBe(0);
    expect(state.board[0].size).toBe(0);
  });

  it("extend appends points; end moves the stroke to the finished list", () => {
    let state = beginStroke(openBoard(), { x: 0, y: 0, pressure: 0.5 }, false);
    state = extendStroke(state, { x: 1, y: 1, pressure: 0.6 });
    state = extendStroke(state, { x: 2, y: 2, pressure: 0.7 });
    state = endStroke(state);
    expect(state.current).toBeNull();
    expect(state.board).toHaveLength(1);
    expect(state.board[0].points).toHaveLength(3);
  });

  it("begin while inactive or mid-stroke is an identity no-op", () => {
    const inactive = createWhiteboard();
    expect(beginStroke(inactive, { x: 0, y: 0, pressure: 0.5 }, false)).toBe(inactive);
    const drawing = beginStroke(openBoard(), { x: 0, y: 0, pressure: 0.5 }, false);
    expect(beginStroke(drawing, { x: 9, y: 9, pressure: 0.5 }, false)).toBe(drawing);
  });

  it("extend and end without a stroke in progress are identity no-ops", () => {
    const state = openBoard();
    expect(extendStroke(state, { x: 0, y: 0, pressure: 0.5 })).toBe(state);
    expect(endStroke(state)).toBe(state);
  });
});
