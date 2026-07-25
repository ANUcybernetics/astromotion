// Ephemeral fullscreen whiteboard for doodling mid-presentation.
//
// `W` opens the board --- registered as a Reveal key binding so it appears on
// the help overlay. While open, a capture-phase keydown listener claims every
// unmodified key (digits for colour then brush size, undo on Z, clear on C,
// close on W/Escape) so Reveal never navigates underneath the board; modified keys
// pass through so browser shortcuts keep working. Strokes render via
// perfect-freehand: real stylus pressure when a pen is detected, simulated
// from velocity for mouse and trackpad. The drawing survives toggling back
// to the slides (only C clears it) but lives in memory only --- a reload
// discards it.

import {
  applyAction,
  backgroundImageUrl,
  beginStroke,
  boardFilename,
  BRUSH_SIZES,
  coverRect,
  createWhiteboard,
  endStroke,
  extendStroke,
  keyAction,
  resolveInkPalette,
  resolveMode,
  type WhiteboardAction,
  type WhiteboardState,
} from "./core";
import { strokeOutlinePath } from "./outline";

// Structural slice of the Reveal API --- keeps this module decoupled from
// reveal.js's awkward default-export typings.
interface RevealKeyBindings {
  addKeyBinding(
    binding: { keyCode: number; key: string; description: string },
    callback: (event: KeyboardEvent) => void,
  ): void;
}

// The canvas is fullscreen at the viewport origin, so client coordinates are
// canvas coordinates.
function pointFrom(event: PointerEvent) {
  return { x: event.clientX, y: event.clientY, pressure: event.pressure };
}

export function initWhiteboard(deck: RevealKeyBindings): void {
  const overlay = document.createElement("div");
  overlay.className = "astromotion-whiteboard";
  overlay.setAttribute("role", "application");
  overlay.setAttribute("aria-label", "Whiteboard");
  overlay.hidden = true;

  const canvas = document.createElement("canvas");
  overlay.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  document.body.appendChild(overlay);

  // Consuming themes define the mode and their own palette via custom
  // properties (see resolveMode / resolveInkPalette); themes are static, so
  // resolve once. The mode lands on the overlay as a data attribute, which is
  // what the CSS keys the surface and toolbar chrome off.
  const styles = getComputedStyle(overlay);
  const mode = resolveMode((name) => styles.getPropertyValue(name));
  overlay.dataset.mode = mode;
  const palette = resolveInkPalette((name) => styles.getPropertyValue(name), mode);

  const toolbar = document.createElement("div");
  toolbar.className = "astromotion-whiteboard-toolbar";
  const swatches = palette.map((color, i) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "astromotion-whiteboard-swatch";
    swatch.style.setProperty("--swatch-color", color);
    swatch.setAttribute("aria-label", `Pen colour ${i + 1}`);
    swatch.addEventListener("click", () => dispatch({ type: "color", index: i }));
    toolbar.appendChild(swatch);
    return swatch;
  });
  const sizeButtons = BRUSH_SIZES.map((size, i) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "astromotion-whiteboard-size";
    button.style.setProperty("--dot-size", `${size}px`);
    button.setAttribute("aria-label", `Brush size ${i + 1}`);
    button.addEventListener("click", () => dispatch({ type: "size", index: i }));
    toolbar.appendChild(button);
    return button;
  });
  const hint = document.createElement("span");
  hint.className = "astromotion-whiteboard-hint";
  const colourHint = palette.length > 1 ? `1–${palette.length} colour · ` : "";
  const sizeHint = `${palette.length + 1}–${palette.length + BRUSH_SIZES.length} size · `;
  hint.textContent = `${colourHint}${sizeHint}Z undo · C clear · D save · W close`;
  toolbar.appendChild(hint);
  overlay.appendChild(toolbar);

  let state: WhiteboardState = createWhiteboard();
  let raf = 0;
  let activePointer: number | null = null;

  const scheduleRender = () => {
    if (!raf) raf = requestAnimationFrame(render);
  };

  const render = () => {
    raf = 0;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    const strokes = state.current ? [...state.strokes, state.current] : state.strokes;
    for (const stroke of strokes) {
      const path = strokeOutlinePath(stroke.points, {
        size: BRUSH_SIZES[stroke.size] ?? BRUSH_SIZES[0],
        pen: stroke.pen,
      });
      if (!path) continue;
      ctx.fillStyle = palette[stroke.color] ?? palette[0];
      // ctx is a CanvasRenderingContext2D --- this is not Array#fill. The rule
      // matches any `.fill()` with no receiver check, and upstream declined to
      // add one (oxc-project/oxc#23703).
      // oxlint-disable-next-line unicorn/no-array-fill-with-reference-type
      ctx.fill(new Path2D(path));
    }
  };

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(overlay.clientWidth * dpr);
    canvas.height = Math.round(overlay.clientHeight * dpr);
    scheduleRender();
  };

  const syncDom = () => {
    overlay.hidden = !state.active;
    swatches.forEach((swatch, i) => {
      swatch.setAttribute("aria-pressed", String(i === state.color));
    });
    sizeButtons.forEach((button, i) => {
      button.setAttribute("aria-pressed", String(i === state.size));
    });
  };

  const dispatch = (action: WhiteboardAction) => {
    const wasActive = state.active;
    const next = applyAction(state, action, palette.length);
    if (next === state) return;
    state = next;
    // Closing mid-stroke means the pointerup may never reach the hidden
    // canvas --- reset the gesture tracking or reopening can't draw.
    if (!state.active) activePointer = null;
    syncDom();
    // The canvas has zero size while hidden; size it on the way in.
    if (state.active && !wasActive) resize();
    scheduleRender();
  };

  // The theme's board background image, if it set one. Loaded lazily on the
  // first save and kept, so a second save doesn't re-fetch. crossOrigin is
  // set so a CORS-enabled remote image composites rather than tainting the
  // canvas; one served without the headers just fails to load, and the save
  // falls back to the surface colour alone.
  let backgroundImage: Promise<HTMLImageElement | null> | null = null;
  const loadBackgroundImage = () => {
    backgroundImage ??= new Promise<HTMLImageElement | null>((resolve) => {
      const url = backgroundImageUrl(styles.backgroundImage);
      if (!url) {
        resolve(null);
        return;
      }
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.addEventListener("load", () => resolve(image));
      image.addEventListener("error", () => resolve(null));
      image.src = url;
    });
    return backgroundImage;
  };

  // Save the board as a PNG: composite the (transparent) stroke canvas onto
  // the board surface --- colour, then the background image drawn the way CSS
  // covers the viewport with it --- then hand it to the browser as a download.
  const downloadBoard = async () => {
    render(); // flush any pending frame so the file matches the screen
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const outCtx = out.getContext("2d");
    if (!outCtx || out.width === 0) return;
    outCtx.fillStyle = styles.backgroundColor;
    outCtx.fillRect(0, 0, out.width, out.height);
    const image = await loadBackgroundImage();
    if (image) {
      const rect = coverRect(
        { width: image.naturalWidth, height: image.naturalHeight },
        { width: out.width, height: out.height },
      );
      outCtx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
    }
    outCtx.drawImage(canvas, 0, 0);
    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = boardFilename(new Date());
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  deck.addKeyBinding({ keyCode: 87, key: "W", description: "Whiteboard" }, () => {
    dispatch({ type: "open" });
  });

  document.addEventListener(
    "keydown",
    (event) => {
      const action = keyAction(
        state,
        event.key,
        event.ctrlKey || event.metaKey || event.altKey,
        palette.length,
      );
      if (!action) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (action.type === "download") void downloadBoard();
      else dispatch(action);
    },
    true,
  );

  window.addEventListener("resize", () => {
    if (state.active) resize();
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (!state.active || activePointer !== null) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    activePointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    state = beginStroke(state, pointFrom(event), event.pointerType === "pen");
    scheduleRender();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== activePointer || !state.current) return;
    // Coalesced events carry the full-rate input trail between frames ---
    // this is what makes fast strokes smooth instead of segmented.
    const events = event.getCoalescedEvents?.() ?? [event];
    for (const sample of events) state = extendStroke(state, pointFrom(sample));
    scheduleRender();
  });

  const finishStroke = (event: PointerEvent) => {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    state = endStroke(state);
    scheduleRender();
  };
  canvas.addEventListener("pointerup", finishStroke);
  canvas.addEventListener("pointercancel", finishStroke);
}
