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
  size: number; // brush size index, fixed at pointerdown
  pen: boolean; // real stylus pressure (vs simulated from velocity)
  points: WhiteboardPoint[];
}

// Which surface the board is showing. "board" is the opaque scratch surface
// the theme paints; "slide" is transparent, so the ink lands over whatever
// slide is on screen. Points are viewport coordinates on both --- a scribble
// over a slide is meant to last about as long as the point being made, so it
// is not worth mapping into the deck's 1280x720 space to survive a resize.
export type WhiteboardSurface = "board" | "slide";

export interface WhiteboardState {
  active: boolean;
  surface: WhiteboardSurface;
  color: number;
  size: number;
  board: WhiteboardStroke[]; // the opaque board's one shared drawing
  slides: Record<string, WhiteboardStroke[]>; // annotations, keyed by slideKey
  slide: string; // which slide annotations currently apply to
  current: WhiteboardStroke | null;
}

export type WhiteboardAction =
  // Each key owns a surface: toggling the one already showing closes the
  // board, toggling the other crosses over with both drawings intact.
  | { type: "toggle"; surface: WhiteboardSurface }
  | { type: "close" }
  | { type: "slide"; key: string }
  | { type: "color"; index: number }
  | { type: "size"; index: number }
  | { type: "undo" }
  | { type: "clear" }
  | { type: "download" };

// Light or dark board. The mode swaps the default surface and the default
// ink palette --- dark ink on a pale board, or pale ink on a dark one --- and
// flips the toolbar chrome (that half lives in CSS, keyed off data-mode).
export type WhiteboardMode = "light" | "dark";

// Default whiteboard-marker inks per mode, used when the consuming theme
// doesn't define a palette of its own (see resolveInkPalette). The first ink
// is the pen the board opens with, so it carries the mode's contrast.
export const INK_PALETTES: Record<WhiteboardMode, string[]> = {
  light: ["#1d1d1f", "#d62828", "#1d6fd6", "#1e9e4a"],
  dark: ["#f4f4ef", "#ff6b6b", "#5eb0ff", "#4ade80"],
};

// Brush sizes in CSS px (pressure thins/thickens around each): fine for
// writing, broad for highlighting. The two digit keys after the palette
// select them.
export const BRUSH_SIZES = [12, 36];

// Colour keys are the leading digits and the brush sizes claim the next
// ones, so a palette can hold at most 9 - BRUSH_SIZES.length inks.
export const MAX_INKS = 9 - BRUSH_SIZES.length;

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

// Resolve the board mode from the theme: --astromotion-wb-mode is `light`
// (the default, and the historical behaviour) or `dark`.
export function resolveMode(readVar: (name: string) => string): WhiteboardMode {
  return readVar("--astromotion-wb-mode").trim().toLowerCase() === "dark" ? "dark" : "light";
}

// Resolve the ink palette from the theme: --astromotion-wb-inks is a single
// comma-separated colour list which replaces the default palette entirely,
// so themes control both the colours and how many there are (capped at
// MAX_INKS). The readVar indirection keeps this testable without a DOM.
export function resolveInkPalette(
  readVar: (name: string) => string,
  mode: WhiteboardMode = "light",
): string[] {
  const inks = splitColorList(readVar("--astromotion-wb-inks"));
  return inks.length > 0 ? inks.slice(0, MAX_INKS) : INK_PALETTES[mode];
}

// Pull the first url() out of a computed `background-image` value. Gradients
// and `none` yield null: the board still paints them on screen, but the PNG
// export can only composite a real image.
export function backgroundImageUrl(value: string): string | null {
  const match = /url\((?:"([^"]*)"|'([^']*)'|([^)]*))\)/.exec(value);
  const url = (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
  return url === "" ? null : url;
}

// `background-size: cover` in numbers, for replaying the on-screen board
// background into the export canvas: scale the source to cover the box,
// then centre the overflow.
export function coverRect(
  source: { width: number; height: number },
  box: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  if (source.width <= 0 || source.height <= 0) return { x: 0, y: 0, ...box };
  const scale = Math.max(box.width / source.width, box.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
}

// Reveal indices identify a slide; the fragment step is deliberately left out,
// so one annotation covers a slide however far through its fragments you are.
export function slideKey(h: number, v: number): string {
  return `${h}.${v}`;
}

export function createWhiteboard(): WhiteboardState {
  return {
    active: false,
    surface: "board",
    color: 0,
    size: 0,
    board: [],
    slides: {},
    slide: slideKey(0, 0),
    current: null,
  };
}

// The strokes the live surface owns: the board's shared drawing, or the
// annotations belonging to the slide on screen.
export function liveStrokes(state: WhiteboardState): WhiteboardStroke[] {
  return state.surface === "board" ? state.board : (state.slides[state.slide] ?? []);
}

function withStrokes(state: WhiteboardState, strokes: WhiteboardStroke[]): WhiteboardState {
  if (state.surface === "board") return { ...state, board: strokes };
  return { ...state, slides: { ...state.slides, [state.slide]: strokes } };
}

// Land any stroke still in progress on the surface it was drawn on, so
// switching surfaces or slides mid-stroke doesn't drop the ink.
function commitCurrent(state: WhiteboardState): WhiteboardState {
  if (!state.current) return state;
  return { ...withStrokes(state, [...liveStrokes(state), state.current]), current: null };
}

// Modifier state for a keydown. `shift` picks the surface on W and is
// otherwise ignored; `other` is ctrl/meta/alt, which always passes through so
// browser and OS shortcuts keep working.
export interface KeyModifiers {
  shift: boolean;
  other: boolean;
}

// Map a keydown to an action. The pen claims a small fixed set --- W, then the
// digits, Z/U, C, D and Escape while it is open --- and everything else
// returns null and reaches Reveal, so the deck keeps navigating and F, S and B
// keep working with the board up. Nothing in the claimed set collides with
// Reveal's own bindings: digits, Z, U and D are unbound, and C is live only
// while a Reveal overlay is already open.
//
// W is claimed whether the board is open or shut, because Reveal never
// dispatches a shift-modified key to a custom binding (it drops them before
// the binding table), so both surfaces have to be opened from here.
export function keyAction(
  state: WhiteboardState,
  key: string,
  modifiers: KeyModifiers,
  paletteSize: number,
): WhiteboardAction | null {
  if (modifiers.other) return null;
  // Match on shift rather than the letter's case, so Caps Lock doesn't open
  // the annotation surface when plain W was meant.
  if (key === "w" || key === "W") {
    return { type: "toggle", surface: modifiers.shift ? "slide" : "board" };
  }
  if (!state.active) return null;
  switch (key) {
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
      // Digits map to the palette first, then the next BRUSH_SIZES.length
      // digits pick the brush size (e.g. four inks: 1-4 colour, 5-6 size).
      if (/^[1-9]$/.test(key)) {
        const index = Number(key) - 1;
        if (index < paletteSize) return { type: "color", index };
        if (index < paletteSize + BRUSH_SIZES.length) {
          return { type: "size", index: index - paletteSize };
        }
      }
      return null;
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
    case "toggle":
      if (!state.active) return { ...state, active: true, surface: action.surface };
      if (state.surface === action.surface)
        return applyAction(state, { type: "close" }, paletteSize);
      return { ...commitCurrent(state), surface: action.surface };
    case "close": {
      // The board's drawing and the colour/size selection survive the toggle
      // --- only the clear action empties it. Slide annotations do not: they
      // belong to a moment in the talk, so closing the layer discards them
      // rather than leaving stale ink to reappear later.
      const committed = commitCurrent(state);
      return { ...committed, active: false, slides: {}, current: null };
    }
    case "slide":
      if (action.key === state.slide) return state;
      return { ...commitCurrent(state), slide: action.key };
    case "color":
      if (action.index < 0 || action.index >= paletteSize || action.index === state.color) {
        return state;
      }
      return { ...state, color: action.index };
    case "size":
      if (action.index < 0 || action.index >= BRUSH_SIZES.length || action.index === state.size) {
        return state;
      }
      return { ...state, size: action.index };
    // Undo and clear act on the live surface only, so clearing an annotation
    // never wipes the board sitting behind it, or another slide's ink.
    case "undo": {
      const strokes = liveStrokes(state);
      if (strokes.length === 0) return state;
      return withStrokes(state, strokes.slice(0, -1));
    }
    case "clear":
      if (liveStrokes(state).length === 0 && !state.current) return state;
      return { ...withStrokes(state, []), current: null };
    case "download": // side effect owned by the DOM layer, no state change
      return state;
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

const stamp = (now: Date) =>
  `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-` +
  `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

// Timestamped download name, e.g. whiteboard-20260703-152410.png. Local time
// --- it should match the clock on the wall of the room you presented in.
export function boardFilename(now: Date): string {
  return `whiteboard-${stamp(now)}.png`;
}

// Annotations are saved against the slide they mark up, so a run of them from
// one talk sorts by slide rather than by the order they happened to be taken.
export function annotationFilename(indices: { h: number; v: number }, now: Date): string {
  return `annotation-${indices.h + 1}-${indices.v + 1}-${stamp(now)}.png`;
}

export function beginStroke(
  state: WhiteboardState,
  point: WhiteboardPoint,
  pen: boolean,
): WhiteboardState {
  if (!state.active || state.current) return state;
  return { ...state, current: { color: state.color, size: state.size, pen, points: [point] } };
}

export function extendStroke(state: WhiteboardState, point: WhiteboardPoint): WhiteboardState {
  if (!state.current) return state;
  return {
    ...state,
    current: { ...state.current, points: [...state.current.points, point] },
  };
}

export function endStroke(state: WhiteboardState): WhiteboardState {
  return commitCurrent(state);
}
