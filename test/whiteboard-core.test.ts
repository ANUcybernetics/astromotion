import { describe, it, expect } from "vitest";
import {
  applyAction,
  beginStroke,
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
  it("starts inactive with no strokes and the first colour", () => {
    expect(createWhiteboard()).toEqual({
      active: false,
      color: 0,
      strokes: [],
      current: null,
    });
  });
});

const vars = (defined: Record<string, string>) => (name: string) => defined[name] ?? "";

describe("resolveInkPalette", () => {
  it("falls back to the default palette when the theme defines no inks", () => {
    expect(resolveInkPalette(vars({}))).toEqual(INK_PALETTE);
  });

  it("uses the theme's consecutive run of inks, whatever its length", () => {
    const theme = {
      "--astromotion-wb-ink-1": "#0d0d0d",
      "--astromotion-wb-ink-2": "#be830e",
      "--astromotion-wb-ink-3": "#be4e0e",
      "--astromotion-wb-ink-4": "#0085ad",
      "--astromotion-wb-ink-5": "#1e9e4a",
    };
    expect(resolveInkPalette(vars(theme))).toEqual([
      "#0d0d0d",
      "#be830e",
      "#be4e0e",
      "#0085ad",
      "#1e9e4a",
    ]);
    expect(resolveInkPalette(vars({ "--astromotion-wb-ink-1": "red" }))).toEqual(["red"]);
  });

  it("stops at the first gap in the run", () => {
    const theme = {
      "--astromotion-wb-ink-1": "#111",
      "--astromotion-wb-ink-3": "#333", // slot 2 missing --- ignored
    };
    expect(resolveInkPalette(vars(theme))).toEqual(["#111"]);
  });

  it("trims whitespace from computed values", () => {
    expect(resolveInkPalette(vars({ "--astromotion-wb-ink-1": " #111 " }))).toEqual(["#111"]);
  });

  it("caps the palette at MAX_INKS (the digit keys)", () => {
    const theme = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`--astromotion-wb-ink-${i + 1}`, `#${i}`]),
    );
    expect(resolveInkPalette(vars(theme))).toHaveLength(MAX_INKS);
  });
});

describe("keyAction", () => {
  it("claims nothing while inactive (opening is Reveal's key binding)", () => {
    const state = createWhiteboard();
    for (const key of ["w", "W", "Escape", "1", "z", "c", "ArrowRight", " "]) {
      expect(keyAction(state, key, false)).toBeNull();
    }
  });

  it("closes on w, W, and Escape", () => {
    const state = openBoard();
    for (const key of ["w", "W", "Escape"]) {
      expect(keyAction(state, key, false)).toEqual({ type: "close" });
    }
  });

  it("undoes on z and u (either case)", () => {
    const state = openBoard();
    for (const key of ["z", "Z", "u", "U"]) {
      expect(keyAction(state, key, false)).toEqual({ type: "undo" });
    }
  });

  it("clears on c, Backspace, and Delete", () => {
    const state = openBoard();
    for (const key of ["c", "C", "Backspace", "Delete"]) {
      expect(keyAction(state, key, false)).toEqual({ type: "clear" });
    }
  });

  it("maps digits to zero-based palette indices", () => {
    const state = openBoard();
    expect(keyAction(state, "1", false)).toEqual({ type: "color", index: 0 });
    expect(keyAction(state, "4", false)).toEqual({ type: "color", index: 3 });
    expect(keyAction(state, "9", false)).toEqual({ type: "color", index: 8 });
    expect(keyAction(state, "0", false)).toEqual({ type: "swallow" });
  });

  it("swallows every other unmodified key so Reveal never navigates", () => {
    const state = openBoard();
    for (const key of ["ArrowRight", "ArrowLeft", " ", "n", "p", "f", "s", "Enter"]) {
      expect(keyAction(state, key, false)).toEqual({ type: "swallow" });
    }
  });

  it("lets modified keys pass through for browser shortcuts", () => {
    const state = openBoard();
    expect(keyAction(state, "r", true)).toBeNull();
    expect(keyAction(state, "w", true)).toBeNull();
  });
});

describe("applyAction", () => {
  it("open activates; open on an active board is an identity no-op", () => {
    const opened = openBoard();
    expect(opened.active).toBe(true);
    expect(applyAction(opened, { type: "open" }, PALETTE_SIZE)).toBe(opened);
  });

  it("close keeps strokes and colour selection for the next toggle", () => {
    let state = applyAction(openBoard(), { type: "color", index: 2 }, PALETTE_SIZE);
    state = beginStroke(state, { x: 0, y: 0, pressure: 0.5 }, false);
    state = endStroke(state);
    const closed = applyAction(state, { type: "close" }, PALETTE_SIZE);
    expect(closed.active).toBe(false);
    expect(closed.color).toBe(2);
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

  it("swallow is an identity no-op", () => {
    const state = openBoard();
    expect(applyAction(state, { type: "swallow" }, PALETTE_SIZE)).toBe(state);
  });
});

describe("stroke lifecycle", () => {
  it("begin captures the colour and pen flag at pointerdown", () => {
    let state = applyAction(openBoard(), { type: "color", index: 1 }, PALETTE_SIZE);
    state = beginStroke(state, { x: 5, y: 6, pressure: 0.8 }, true);
    expect(state.current).toEqual({
      color: 1,
      pen: true,
      points: [{ x: 5, y: 6, pressure: 0.8 }],
    });
  });

  it("a colour change mid-stroke does not recolour the stroke in progress", () => {
    let state = beginStroke(openBoard(), { x: 0, y: 0, pressure: 0.5 }, false);
    state = applyAction(state, { type: "color", index: 3 }, PALETTE_SIZE);
    expect(state.current?.color).toBe(0);
    state = endStroke(state);
    expect(state.strokes[0].color).toBe(0);
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
