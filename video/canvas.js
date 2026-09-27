// astromotion/video: a Canvas 2D layer for the motion engine, for what flat
// vector elements can't carry: thousands of marks, continuous fields, generated
// data. A composition hands it a pure draw(ctx, t); the timeline calls it on
// every seek, once the animations are set, so a canvas frame renders in
// parallel, out of order and at any resolution like the rest. There is no
// requestAnimationFrame loop and nothing carries between frames: every call
// resets the context and draws the whole picture for t.
//
// The backing store follows the page's device pixel ratio (a 4K render of a
// 1920x1080 composition runs at 2), times `density` for a canvas the camera
// pushes in on, so marks are drawn at the pixels they land on.
//
// See README.md next to this file for the contract.

import { clamp, ease, set } from "./motion.js";

// A canvas of w x h CSS px at (x, y) in `parent`, redrawn by draw(ctx, t, { w, h })
// on every seek of `tl`. The element takes tweens like any other (opacity, x,
// scale); the drawing is in CSS px, whatever the backing store.
export function canvas(tl, parent, draw, { x = 0, y = 0, w, h, density = 1, cls = "" } = {}) {
  if (!(w > 0 && h > 0)) throw new Error("canvas needs a width and height in CSS px");
  const el = document.createElement("canvas");
  if (cls) el.className = cls;
  Object.assign(el.style, {
    position: "absolute",
    left: "0",
    top: "0",
    width: `${w}px`,
    height: `${h}px`,
    transformOrigin: "0 0",
  });
  parent.appendChild(el);
  set(el, { x, y });
  const ctx = el.getContext("2d");
  const render = (t) => {
    const r = (globalThis.devicePixelRatio || 1) * density;
    const bw = Math.round(w * r),
      bh = Math.round(h * r);
    if (el.width !== bw || el.height !== bh) {
      el.width = bw;
      el.height = bh;
    }
    ctx.reset();
    ctx.setTransform(bw / w, 0, 0, bh / h, 0, 0);
    draw(ctx, t, { w, h });
  };
  tl.draw(render);
  return { el, ctx, w, h, render };
}

// eased progress through [t0, t0 + dur] at time t: 0 before, 1 after
export const phase = (t, t0, dur, e = "linear") =>
  ease(e)(dur > 0 ? clamp((t - t0) / dur, 0, 1) : t < t0 ? 0 : 1);

// A seeded PRNG (mulberry32): rng(seed)() gives the same sequence of numbers in
// [0, 1) for the same seed, everywhere. Generate data with it at build time and
// have draw() only read the result; a draw that needs randomness makes a fresh
// rng(seed) per call, so a frame never depends on the frames before it.
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let z = a;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}
