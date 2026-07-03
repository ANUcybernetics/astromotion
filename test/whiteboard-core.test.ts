import { describe, it, expect } from "vitest";
import {
  applyAction,
  beginStroke,
  boardFilename,
  BRUSH_SIZES,
  createWhiteboard,
  endStroke,
  extendStroke,
  INK_PALETTE,
  keyAction,
  MAX_INKS,
  resolveInkPalette,
  type WhiteboardState,
} from "../src/whiteboard/core.ts";

const PALETTE_SIZE = INK_PALETTE.length;

function openBoard(): WhiteboardState {
  return applyAction(createWhiteboard(), { type: "open" }, PALETTE_SIZE);
}

describe("createWhiteboard", () => {
  it("starts inactive with no strokes, the first colour, and the fine brush", () => {
    expect(createWhiteboard()).toEqual({
      active: false,
      color: 0,
      size: 0,
      strokes: [],
      current: null,
    });
  });
});

const inks = (value: string) => (name: string) => (name === "--astromotion-wb-inks" ? value : "");

describe("resolveInkPalette", () => {
  it("falls back to the default palette when the theme defines no inks", () => {
    expect(resolveInkPalette(inks(""))).toEqual(INK_PALETTE);
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

describe("keyAction", () => {
  it("claims nothing while inactive (opening is Reveal's key binding)", () => {
    const state = createWhiteboard();
    for (const key of ["w", "W", "Escape", "1", "z", "c", "ArrowRight", " "]) {
      expect(keyAction(state, key, false, PALETTE_SIZE)).toBeNull();
    }
  });

  it("closes on w, W, and Escape", () => {
    const state = openBoard();
    for (const key of ["w", "W", "Escape"]) {
      expect(keyAction(state, key, false, PALETTE_SIZE)).toEqual({ type: "close" });
    }
  });

  it("undoes on z and u (either case)", () => {
    const state = openBoard();
    for (const key of ["z", "Z", "u", "U"]) {
      expect(keyAction(state, key, false, PALETTE_SIZE)).toEqual({ type: "undo" });
    }
  });

  it("clears on c, Backspace, and Delete", () => {
    const state = openBoard();
    for (const key of ["c", "C", "Backspace", "Delete"]) {
      expect(keyAction(state, key, false, PALETTE_SIZE)).toEqual({ type: "clear" });
    }
  });

  it("downloads on d (either case)", () => {
    const state = openBoard();
    for (const key of ["d", "D"]) {
      expect(keyAction(state, key, false, PALETTE_SIZE)).toEqual({ type: "download" });
    }
  });

  it("maps the leading digits to zero-based palette indices", () => {
    const state = openBoard();
    expect(keyAction(state, "1", false, PALETTE_SIZE)).toEqual({ type: "color", index: 0 });
    expect(keyAction(state, "4", false, PALETTE_SIZE)).toEqual({ type: "color", index: 3 });
    expect(keyAction(state, "0", false, PALETTE_SIZE)).toEqual({ type: "swallow" });
  });

  it("maps the digits after the palette to brush sizes, then swallows", () => {
    const state = openBoard();
    // PALETTE_SIZE is 4, so 5 and 6 are the two brush sizes
    expect(keyAction(state, "5", false, PALETTE_SIZE)).toEqual({ type: "size", index: 0 });
    expect(keyAction(state, "6", false, PALETTE_SIZE)).toEqual({ type: "size", index: 1 });
    expect(keyAction(state, "7", false, PALETTE_SIZE)).toEqual({ type: "swallow" });
    expect(keyAction(state, "9", false, PALETTE_SIZE)).toEqual({ type: "swallow" });
  });

  it("shifts the size keys with the palette length", () => {
    const state = openBoard();
    expect(keyAction(state, "2", false, 1)).toEqual({ type: "size", index: 0 });
    expect(keyAction(state, "8", false, MAX_INKS)).toEqual({ type: "size", index: 0 });
    expect(keyAction(state, "9", false, MAX_INKS)).toEqual({ type: "size", index: 1 });
  });

  it("swallows every other unmodified key so Reveal never navigates", () => {
    const state = openBoard();
    for (const key of ["ArrowRight", "ArrowLeft", " ", "n", "p", "f", "s", "Enter"]) {
      expect(keyAction(state, key, false, PALETTE_SIZE)).toEqual({ type: "swallow" });
    }
  });

  it("lets modified keys pass through for browser shortcuts", () => {
    const state = openBoard();
    expect(keyAction(state, "r", true, PALETTE_SIZE)).toBeNull();
    expect(keyAction(state, "w", true, PALETTE_SIZE)).toBeNull();
  });
});

describe("applyAction", () => {
  it("open activates; open on an active board is an identity no-op", () => {
    const opened = openBoard();
    expect(opened.active).toBe(true);
    expect(applyAction(opened, { type: "open" }, PALETTE_SIZE)).toBe(opened);
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
    expect(closed.strokes).toHaveLength(1);
    const reopened = applyAction(closed, { type: "open" }, PALETTE_SIZE);
    expect(reopened.strokes).toHaveLength(1);
  });

  it("close commits a stroke still in progress", () => {
    let state = beginStroke(openBoard(), { x: 0, y: 0, pressure: 0.5 }, false);
    state = extendStroke(state, { x: 1, y: 1, pressure: 0.5 });
    const closed = applyAction(state, { type: "close" }, PALETTE_SIZE);
    expect(closed.current).toBeNull();
    expect(closed.strokes).toHaveLength(1);
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
    expect(undone.strokes).toHaveLength(1);
    expect(undone.strokes[0].points[0].x).toBe(1);
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
    expect(cleared.strokes).toEqual([]);
    expect(cleared.current).toBeNull();
    expect(cleared.active).toBe(true);
  });

  it("clear on an empty board is an identity no-op", () => {
    const state = openBoard();
    expect(applyAction(state, { type: "clear" }, PALETTE_SIZE)).toBe(state);
  });

  it("swallow and download are identity no-ops on the state", () => {
    const state = openBoard();
    expect(applyAction(state, { type: "swallow" }, PALETTE_SIZE)).toBe(state);
    expect(applyAction(state, { type: "download" }, PALETTE_SIZE)).toBe(state);
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
    expect(state.strokes[0].color).toBe(0);
    expect(state.strokes[0].size).toBe(0);
  });

  it("extend appends points; end moves the stroke to the finished list", () => {
    let state = beginStroke(openBoard(), { x: 0, y: 0, pressure: 0.5 }, false);
    state = extendStroke(state, { x: 1, y: 1, pressure: 0.6 });
    state = extendStroke(state, { x: 2, y: 2, pressure: 0.7 });
    state = endStroke(state);
    expect(state.current).toBeNull();
    expect(state.strokes).toHaveLength(1);
    expect(state.strokes[0].points).toHaveLength(3);
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
