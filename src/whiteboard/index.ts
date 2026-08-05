// Ephemeral whiteboard for doodling mid-presentation, over two surfaces.
//
// `W` opens the opaque board the theme paints; `⇧W` opens a transparent one
// over the current slide, for marking up what is already on screen. Each key
// toggles its own surface, so pressing the other crosses over with both
// drawings intact.
//
// Both are driven from one capture-phase keydown listener, which runs ahead of
// Reveal's own (bubble-phase) handler. That listener has to own `W` outright,
// because Reveal drops shift-modified keys before they reach a custom binding
// --- so `⇧W` could never arrive via addKeyBinding. The help overlay is fed
// separately, by registerKeyboardShortcut.
//
// The pen claims a small fixed set of keys (W, then the digits, Z/U, C, D and
// Escape while open) and lets everything else through to Reveal, so the deck
// keeps navigating and F, S and B keep working with the board up.
//
// Strokes render via perfect-freehand: real stylus pressure when a pen is
// detected, simulated from velocity for mouse and trackpad. Everything lives
// in memory only --- a reload discards it.

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
  keyAction,
  liveStrokes,
  resolveInkPalette,
  resolveMode,
  slideKey,
  type WhiteboardAction,
  type WhiteboardState,
  type WhiteboardSurface,
} from "./core";
import { strokeOutlinePath } from "./outline";

// Structural slice of the Reveal API --- keeps this module decoupled from
// reveal.js's awkward default-export typings.
interface RevealDeck {
  registerKeyboardShortcut(key: string, description: string): void;
  getIndices(slide?: Element): { h: number; v: number; f?: number };
  isOverview(): boolean;
  toggleOverview(override?: boolean): void;
  on(type: string, listener: () => void): void;
}

// getDisplayMedia's currentTab hints are Chrome-only and absent from the DOM
// lib; harmless where unsupported, so they are asked for and cast away.
interface CaptureConstraints extends DisplayMediaStreamOptions {
  preferCurrentTab?: boolean;
}

// The canvas is fullscreen at the viewport origin, so client coordinates are
// canvas coordinates.
function pointFrom(event: PointerEvent) {
  return { x: event.clientX, y: event.clientY, pressure: event.pressure };
}

function saveCanvas(source: HTMLCanvasElement, name: string) {
  source.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

// Wait for the capture to produce a frame drawn after the toolbar was hidden,
// so the chrome doesn't end up in the saved image. requestVideoFrameCallback
// is the precise signal, but it cannot be the only one: a capture stream
// delivers frames only when the screen changes, so on a still slide the
// callback may never come. Racing a deadline keeps a save from hanging with
// the toolbar hidden, at the cost of very occasionally catching it in shot.
function nextCaptureFrame(video: HTMLVideoElement) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 400);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    if ("requestVideoFrameCallback" in video) {
      video.requestVideoFrameCallback(() => video.requestVideoFrameCallback(done));
    }
  });
}

export function initWhiteboard(deck: RevealDeck): void {
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
  const hintFor = (surface: WhiteboardSurface) =>
    `${colourHint}${sizeHint}Z undo · C clear · D save · ` +
    // W is the way out of the board and the way into it, so which key closes
    // depends on the surface you're looking at.
    (surface === "slide" ? "W board · Esc close" : "⇧W annotate · W close");
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
    const settled = liveStrokes(state);
    const strokes = state.current ? [...settled, state.current] : settled;
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
    overlay.dataset.surface = state.surface;
    hint.textContent = hintFor(state.surface);
    overlay.setAttribute(
      "aria-label",
      state.surface === "slide" ? "Slide annotations" : "Whiteboard",
    );
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
    // Don't hold a screen-capture stream (and its browser-level sharing
    // indicator) open past the layer that asked for it.
    if (wasActive && !state.active) releaseCapture();
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

  // A screen-capture stream, used to save an annotation together with the
  // slide underneath it. No DOM rasteriser reproduces these decks faithfully
  // --- full-bleed backgrounds, webfonts, SVG and CSS transforms are exactly
  // what they get wrong --- whereas a captured frame is what the room saw,
  // ink already composited. It costs a share prompt, so the stream is taken
  // once on the first save and held until the layer closes.
  let capture: Promise<HTMLVideoElement | null> | null = null;
  let captureStream: MediaStream | null = null;

  const releaseCapture = () => {
    captureStream?.getTracks().forEach((track) => track.stop());
    captureStream = null;
    capture = null;
  };

  const acquireCapture = () => {
    capture ??= (async () => {
      // getDisplayMedia needs transient activation, which the D keypress
      // supplies. A cancelled prompt or an unsupported browser resolves null
      // and the caller falls back to saving the ink alone.
      const constraints: CaptureConstraints = { video: true, preferCurrentTab: true };
      const stream = await navigator.mediaDevices?.getDisplayMedia?.(constraints).catch(() => null);
      if (!stream) return null;
      captureStream = stream;
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await new Promise((resolve) =>
        video.addEventListener("loadedmetadata", resolve, { once: true }),
      );
      await video.play();
      return video;
    })();
    return capture;
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
    saveCanvas(out, boardFilename(new Date()));
  };

  // Save an annotation: a captured frame of the slide with the ink already on
  // it, or --- if there is no capture to be had --- the ink alone on
  // transparency, which at least records what was drawn.
  const downloadAnnotation = async () => {
    render();
    const name = annotationFilename(deck.getIndices(), new Date());
    toolbar.hidden = true;
    try {
      const video = await acquireCapture();
      if (!video) {
        saveCanvas(canvas, name);
        return;
      }
      await nextCaptureFrame(video);
      const out = document.createElement("canvas");
      out.width = video.videoWidth;
      out.height = video.videoHeight;
      const outCtx = out.getContext("2d");
      if (!outCtx || out.width === 0) {
        saveCanvas(canvas, name);
        return;
      }
      outCtx.drawImage(video, 0, 0);
      saveCanvas(out, name);
    } finally {
      toolbar.hidden = false;
    }
  };

  // Both surfaces are opened from the listener below rather than through
  // addKeyBinding, so they are announced to the help overlay directly.
  deck.registerKeyboardShortcut("W", "Whiteboard");
  deck.registerKeyboardShortcut("Shift W", "Annotate the slide");

  const syncSlide = () => {
    const { h, v } = deck.getIndices();
    dispatch({ type: "slide", key: slideKey(h, v) });
  };
  syncSlide();
  deck.on("slidechanged", syncSlide);
  // Ink is positioned against the viewport, so it would hang over the
  // thumbnail grid rather than any one slide.
  deck.on("overviewshown", () => dispatch({ type: "close" }));

  document.addEventListener(
    "keydown",
    (event) => {
      const action = keyAction(
        state,
        event.key,
        { shift: event.shiftKey, other: event.ctrlKey || event.metaKey || event.altKey },
        palette.length,
      );
      if (!action) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (action.type === "download") {
        void (state.surface === "slide" ? downloadAnnotation() : downloadBoard());
        return;
      }
      // Drawing over the thumbnail grid means nothing, and the overviewshown
      // handler below only catches an overview opened after the pen. Reading
      // the intent as "take me to this slide and give me the pen" beats
      // silently refusing the key.
      if (action.type === "toggle" && !state.active && deck.isOverview()) {
        deck.toggleOverview(false);
      }
      dispatch(action);
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
