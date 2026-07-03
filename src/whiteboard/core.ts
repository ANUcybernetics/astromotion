// Ephemeral whiteboard state for the deck overlay.
//
// Pure data and transitions: the DOM layer (./index.ts) owns the canvas,
// pointer events, and rendering, and drives everything through these
// functions so the behaviour is testable without a browser. Nothing is ever
// persisted --- closing the whiteboard discards every stroke.

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
  | { type: "swallow" };

// Whiteboard-marker ink. Consuming themes can override per-slot via
// --astromotion-wb-ink-<n> custom properties (read by the DOM layer).
export const INK_PALETTE = ["#1d1d1f", "#d62828", "#1d6fd6", "#1e9e4a"];

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
    case "close":
      // Colour selection survives across sessions; strokes never do.
      return { active: false, color: state.color, strokes: [], current: null };
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
    case "swallow":
      return state;
  }
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
