// Ephemeral whiteboard state for the deck overlay.
//
// Pure data and transitions: the DOM layer (./index.ts) owns the canvas,
// pointer events, and rendering, and drives everything through these
// functions so the behaviour is testable without a browser. Strokes live in
// memory only: they survive toggling the board closed and open again (so you
// can flip back to the slides and return to the doodle), but only the clear
// key empties the board, and a page reload discards everything.

export interface WhiteboardPoint {
  x: number;
  y: number;
  pressure: number;
}

export interface WhiteboardStroke {
  color: number; // palette index, fixed at pointerdown
  pen: boolean; // real stylus pressure (vs simulated from velocity)
  points: WhiteboardPoint[];
}

export interface WhiteboardState {
  active: boolean;
  color: number;
  strokes: WhiteboardStroke[];
  current: WhiteboardStroke | null;
}

export type WhiteboardAction =
  | { type: "open" }
  | { type: "close" }
  | { type: "color"; index: number }
  | { type: "undo" }
  | { type: "clear" }
  | { type: "download" }
  | { type: "swallow" };

// Default whiteboard-marker ink, used when the consuming theme doesn't
// define a palette of its own (see resolveInkPalette).
export const INK_PALETTE = ["#1d1d1f", "#d62828", "#1d6fd6", "#1e9e4a"];

// Colour keys are the digits, so a palette can hold at most nine inks.
export const MAX_INKS = 9;

// Split a CSS colour list on top-level commas only, so commas inside
// functional notation (legacy rgb(190, 131, 14)) don't break a colour apart.
// var() references never reach us --- getComputedStyle substitutes them
// before the value is read.
function splitColorList(value: string): string[] {
  const colors: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      colors.push(value.slice(start, i));
      start = i + 1;
    }
  }
  colors.push(value.slice(start));
  return colors.map((color) => color.trim()).filter(Boolean);
}

// Resolve the ink palette from the theme: --astromotion-wb-inks is a single
// comma-separated colour list which replaces the default palette entirely,
// so themes control both the colours and how many there are (capped at
// MAX_INKS). The readVar indirection keeps this testable without a DOM.
export function resolveInkPalette(readVar: (name: string) => string): string[] {
  const inks = splitColorList(readVar("--astromotion-wb-inks"));
  return inks.length > 0 ? inks.slice(0, MAX_INKS) : INK_PALETTE;
}

export function createWhiteboard(): WhiteboardState {
  return { active: false, color: 0, strokes: [], current: null };
}

// Map a keydown to an action. Opening the board is Reveal's key binding (so
// it shows on the help overlay), not ours --- when inactive we claim nothing.
// While active we claim every unmodified key: unhandled ones map to "swallow"
// so Reveal never navigates underneath the board. Modified keys pass through
// untouched to keep browser and OS shortcuts working.
export function keyAction(
  state: WhiteboardState,
  key: string,
  hasModifier: boolean,
): WhiteboardAction | null {
  if (!state.active || hasModifier) return null;
  switch (key) {
    case "w":
    case "W":
    case "Escape":
      return { type: "close" };
    case "z":
    case "Z":
    case "u":
    case "U":
      return { type: "undo" };
    case "c":
    case "C":
    case "Backspace":
    case "Delete":
      return { type: "clear" };
    case "d":
    case "D":
      return { type: "download" };
    default:
      if (/^[1-9]$/.test(key)) return { type: "color", index: Number(key) - 1 };
      return { type: "swallow" };
  }
}

// Actions that leave the state untouched return it identically, so callers
// can cheaply skip re-rendering on no-ops.
export function applyAction(
  state: WhiteboardState,
  action: WhiteboardAction,
  paletteSize: number,
): WhiteboardState {
  switch (action.type) {
    case "open":
      return state.active ? state : { ...state, active: true };
    case "close": {
      // Strokes and colour selection survive the toggle --- only the clear
      // action empties the board. A stroke still in progress is committed
      // (its ink was already on the board).
      const strokes = state.current ? [...state.strokes, state.current] : state.strokes;
      return { active: false, color: state.color, strokes, current: null };
    }
    case "color":
      if (action.index < 0 || action.index >= paletteSize || action.index === state.color) {
        return state;
      }
      return { ...state, color: action.index };
    case "undo":
      if (state.strokes.length === 0) return state;
      return { ...state, strokes: state.strokes.slice(0, -1) };
    case "clear":
      if (state.strokes.length === 0 && !state.current) return state;
      return { ...state, strokes: [], current: null };
    case "download": // side effect owned by the DOM layer, no state change
    case "swallow":
      return state;
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

// Timestamped download name, e.g. whiteboard-20260703-152410.png. Local time
// --- it should match the clock on the wall of the room you presented in.
export function boardFilename(now: Date): string {
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `whiteboard-${date}-${time}.png`;
}

export function beginStroke(
  state: WhiteboardState,
  point: WhiteboardPoint,
  pen: boolean,
): WhiteboardState {
  if (!state.active || state.current) return state;
  return { ...state, current: { color: state.color, pen, points: [point] } };
}

export function extendStroke(state: WhiteboardState, point: WhiteboardPoint): WhiteboardState {
  if (!state.current) return state;
  return {
    ...state,
    current: { ...state.current, points: [...state.current.points, point] },
  };
}

export function endStroke(state: WhiteboardState): WhiteboardState {
  if (!state.current) return state;
  return { ...state, strokes: [...state.strokes, state.current], current: null };
}
