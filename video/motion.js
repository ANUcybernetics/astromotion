// astromotion/video: a seekable motion engine for HTML video compositions
// rendered frame by frame (HyperFrames, or anything that seeks a registered
// timeline). Motion is the Web Animations API: a composition records tweens on
// a timeline, and `finish()` compiles them into one paused WAAPI animation per
// element and property, spanning the whole composition, which a renderer seeks
// by setting `currentTime`. Every frame is a pure function of time.
//
// Transforms are split into registered custom properties (--x, --y, --sx, --sy,
// --r, plus the boil offsets --bx, --by, --br) that feed the individual
// `translate`, `scale` and `rotate` properties, so x and y can be animated on
// independent schedules without a transform matrix to rebuild. Tweens on the
// same property are resolved in time order at compile time, the way a GSAP
// timeline resolves them when it first renders: a relative value ("+=24") is
// relative to the value when its tween starts, and a tween that starts before
// the previous one ends cuts it off where it is.
//
// See README.md next to this file for the contract.

const SVG_NS = "http://www.w3.org/2000/svg";

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, p) => a + (b - a) * p;
// deterministic per-index noise in [0, 1): never Math.random, frames must reproduce
export const hash = (i) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// ------------------------------------------------------------------ easing
// Named eases are exact power curves, handed to CSS as `linear()` with enough
// stops that a 4K camera move stays within a fraction of a pixel of the curve.
// Any other CSS easing string passes through untouched (and is treated as
// linear when a cut-off tween has to be evaluated mid-flight).
const EASE_FNS = { linear: (t) => t };
for (const [name, p] of Object.entries({ quad: 2, cubic: 3, quart: 4 })) {
  EASE_FNS[`in-${name}`] = (t) => t ** p;
  EASE_FNS[`out-${name}`] = (t) => 1 - (1 - t) ** p;
  EASE_FNS[`in-out-${name}`] = (t) => (t < 0.5 ? 2 ** (p - 1) * t ** p : 1 - (-2 * t + 2) ** p / 2);
}
EASE_FNS.in = EASE_FNS["in-cubic"];
EASE_FNS.out = EASE_FNS["out-cubic"];
EASE_FNS["in-out"] = EASE_FNS["in-out-cubic"];
// an overshoot that settles back: "out-back", or "out-back(1.4)" for a softer one
const outBack = (s) => (t) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
EASE_FNS["out-back"] = outBack(1.70158);
const OUT_BACK = /^out-back\((\d*\.?\d+)\)$/;
export const EASES = Object.keys(EASE_FNS);

const EASE_STOPS = 64;
const easeCache = new Map();
function resolveEase(e = "out-quad") {
  const key = typeof e === "function" ? e : String(e);
  if (easeCache.has(key)) return easeCache.get(key);
  const back = typeof e === "string" && OUT_BACK.exec(e);
  const fn = typeof e === "function" ? e : back ? outBack(parseFloat(back[1])) : EASE_FNS[e];
  const css = !fn
    ? e
    : e === "linear"
      ? "linear"
      : `linear(${Array.from({ length: EASE_STOPS + 1 }, (_, i) => +fn(i / EASE_STOPS).toFixed(5)).join(", ")})`;
  const r = { fn: fn || EASE_FNS.linear, css };
  easeCache.set(key, r);
  return r;
}

// --------------------------------------------------------------- properties
// channel → [custom property, unit, resting value]
const CHANNELS = {
  x: ["--x", "px", 0],
  y: ["--y", "px", 0],
  scaleX: ["--sx", "", 1],
  scaleY: ["--sy", "", 1],
  rotation: ["--r", "deg", 0],
};
const LENGTHS = new Set([
  "left",
  "top",
  "right",
  "bottom",
  "width",
  "height",
  "fontSize",
  "strokeWidth",
]);
const STATIC = new Set(["transformOrigin"]);

const reg = (name, syntax, initialValue) => {
  try {
    CSS.registerProperty({ name, syntax, inherits: false, initialValue });
  } catch {
    // already registered (a second copy of the engine, or a page reload in the studio)
  }
};

let installed = false;
function install() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  reg("--x", "<length>", "0px");
  reg("--y", "<length>", "0px");
  reg("--sx", "<number>", "1");
  reg("--sy", "<number>", "1");
  reg("--r", "<angle>", "0deg");
  reg("--bx", "<length>", "0px");
  reg("--by", "<length>", "0px");
  reg("--br", "<angle>", "0deg");
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`
    [data-motion] {
      translate: calc(var(--x) + var(--bx)) calc(var(--y) + var(--by));
      scale: var(--sx) var(--sy);
      rotate: calc(var(--r) + var(--br));
    }
    svg [data-motion] { transform-box: fill-box; }
  `);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

const kebab = (p) => (p.startsWith("--") ? p : p.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`));
const isSvg = (el) => el instanceof Element && el.namespaceURI === SVG_NS && el.tagName !== "svg";

// flatten targets: an element, a list, nested lists, NodeLists; falsy entries dropped
const targetsOf = (t) => {
  if (!t) return [];
  if (t instanceof Element) return [t];
  if (typeof t === "object" && typeof t.length === "number") return [...t].flatMap(targetsOf);
  return [];
};

// scale → scaleX + scaleY; rotate → rotation
function normalise(props = {}) {
  const out = {};
  for (const [k, v] of Object.entries(props)) {
    if (k === "scale") out.scaleX = out.scaleY = v;
    else if (k === "rotate") out.rotation = v;
    else out[k] = v;
  }
  return out;
}

const REL = /^([+-])=\s*(-?[\d.]+)/;
const NUM = /^-?[\d.]+(?:e-?\d+)?(?:px|deg)?$/;
const toNum = (v) =>
  typeof v === "number" ? v : NUM.test(String(v).trim()) ? parseFloat(v) : null;
function resolveValue(v, cur) {
  if (typeof v === "string") {
    const m = REL.exec(v);
    if (m) return (toNum(cur) ?? 0) + (m[1] === "+" ? 1 : -1) * parseFloat(m[2]);
  }
  const n = toNum(v);
  return n ?? v;
}

function fmt(prop, v) {
  if (CHANNELS[prop]) return `${v}${CHANNELS[prop][1]}`;
  if (typeof v === "number" && LENGTHS.has(prop)) return `${v}px`;
  return typeof v === "number" ? String(v) : v;
}
const cssName = (prop) => (CHANNELS[prop] ? CHANNELS[prop][0] : prop);

// build-time values set with set(), read back by get()
const base = new WeakMap();
const baseOf = (el) => {
  if (!base.has(el)) base.set(el, new Map());
  return base.get(el);
};

function applyStatic(el, props) {
  if (props.transformOrigin != null) {
    el.style.transformOrigin = props.transformOrigin;
    if (isSvg(el)) el.style.transformBox = "fill-box";
  }
}

// Set values now, at build time: the resting state before any tween touches
// the element. Numbers are px for lengths and transforms.
export function set(targets, props) {
  install();
  const P = normalise(props);
  for (const el of targetsOf(targets)) {
    applyStatic(el, P);
    for (const [k, raw] of Object.entries(P)) {
      if (STATIC.has(k)) continue;
      const v = resolveValue(raw, get(el, k));
      baseOf(el).set(k, v);
      if (CHANNELS[k]) {
        el.setAttribute("data-motion", "");
        el.style.setProperty(CHANNELS[k][0], fmt(k, v));
      } else el.style.setProperty(kebab(k), fmt(k, v));
    }
  }
  return targets;
}

// A build-time value: what set() left, or the computed style.
export function get(el, prop) {
  const k = normalise({ [prop]: 0 });
  const key = Object.keys(k)[0];
  const b = base.get(el);
  if (b?.has(key)) return b.get(key);
  if (CHANNELS[key]) return CHANNELS[key][2];
  const cs = getComputedStyle(el).getPropertyValue(kebab(key)).trim();
  return toNum(cs) ?? cs;
}

// ----------------------------------------------------------------- timeline
const YOYO = Symbol("yoyo");

export function timeline() {
  install();
  const segs = [];
  const boils = [];
  let seq = 0;
  let compiled = null;

  const add = (el, prop, s) => {
    if (compiled) throw new Error("timeline already finished: add tweens before finish()");
    segs.push({ el, prop, seq: seq++, ...s });
  };

  function tween(
    targets,
    from,
    to,
    at,
    { dur = 0.5, ease = "out-quad", stagger = 0, yoyo = false, immediate = false } = {},
  ) {
    if (!Number.isFinite(at)) throw new Error(`tween time must be a number of seconds, got ${at}`);
    const F = normalise(from ?? {}),
      T = normalise(to);
    const e = resolveEase(ease);
    targetsOf(targets).forEach((el, i) => {
      applyStatic(el, F);
      applyStatic(el, T);
      const t0 = at + i * stagger;
      for (const [k, v] of Object.entries(T)) {
        if (STATIC.has(k)) continue;
        if (CHANNELS[k]) el.setAttribute("data-motion", "");
        // a function value is per target: v(index, element)
        const per = (x) => (typeof x === "function" ? x(i, el) : x);
        const s = {
          t0,
          t1: t0 + dur,
          from: per(F[k]),
          to: per(v),
          ease: e,
          immediate: immediate && k in F,
        };
        add(el, k, s);
        if (yoyo) add(el, k, { t0: t0 + dur, t1: t0 + 2 * dur, to: YOYO, pair: s, ease: e });
      }
    });
    return api;
  }

  const api = {
    // tween to values: tl.to(el, { opacity: 1, y: "-=24" }, 3.2, { dur: 0.5, ease: "out-cubic" })
    to: (targets, props, at, opts) => tween(targets, null, props, at, opts),
    // tween from explicit values; `immediate` (default true) also holds the
    // from values before the tween starts, when it is the property's first tween
    fromTo: (targets, from, to, at, opts = {}) =>
      tween(targets, from, to, at, { immediate: true, ...opts }),
    // jump to values at a time
    set: (targets, props, at) => tween(targets, null, props, at, { dur: 0 }),
    // computed motion: fn(p) → props for p in [0, 1] (eased), sampled every
    // `step` seconds, for values the properties can't express on their own
    // (a logarithmic zoom, a crop that keeps a point centred)
    sample(targets, at, dur, fn, { ease = "linear", step = 0.01 } = {}) {
      const e = resolveEase(ease);
      const n = Math.max(1, Math.ceil(dur / step));
      const frames = Array.from({ length: n + 1 }, (_, i) => {
        const p = i / n;
        return [at + p * dur, normalise(fn(e.fn(p)))];
      });
      for (const el of targetsOf(targets)) {
        for (const k of Object.keys(frames[0][1])) {
          if (CHANNELS[k]) el.setAttribute("data-motion", "");
          add(el, k, { t0: at, t1: at + dur, frames: frames.map(([t, v]) => [t, v[k]]) });
        }
      }
      return api;
    },
    // hand-drawn "boil": the element redraws itself a little differently
    // `fps` times a second. An SVG path with absolute M/L/C/Q/Z commands
    // jitters its points; anything else jitters its position and angle.
    boil(targets, { amp = 1.2, fps = 12, variants = 3, from = 0, to = null, seed = 0 } = {}) {
      targetsOf(targets).forEach((el, i) => {
        el.setAttribute("data-motion", "");
        boils.push({ el, amp, fps, variants, from, to, seed: seed * 101 + i + boils.length * 7 });
      });
      return api;
    },
    // compile into WAAPI animations; returns the controller a renderer seeks
    finish(duration = 0) {
      if (compiled) return compiled;
      compiled = compile(segs, boils, duration);
      return compiled;
    },
  };
  return api;
}

function valueAt(r, t) {
  if (r.frames) {
    const f = r.frames;
    if (t <= f[0][0]) return f[0][1];
    for (let i = 1; i < f.length; i++) {
      if (t <= f[i][0]) {
        const [ta, va] = f[i - 1],
          [tb, vb] = f[i];
        const a = toNum(va),
          b = toNum(vb);
        return a == null || b == null ? va : lerp(a, b, (t - ta) / (tb - ta || 1));
      }
    }
    return f.at(-1)[1];
  }
  const p = r.t1 > r.t0 ? clamp((t - r.t0) / (r.t1 - r.t0), 0, 1) : 1;
  const a = toNum(r.from),
    b = toNum(r.to);
  if (a == null || b == null) return p < 1 ? r.from : r.to;
  return lerp(a, b, r.ease.fn(p));
}

// cut a resolved tween off at time t, where it is then
function truncate(r, t) {
  if (!r.frames) {
    const n = Math.max(1, Math.ceil((t - r.t0) / 0.01));
    r.frames = Array.from({ length: n + 1 }, (_, i) => {
      const ti = r.t0 + ((t - r.t0) * i) / n;
      return [ti, valueAt(r, ti)];
    });
  } else {
    const v = valueAt(r, t);
    r.frames = [...r.frames.filter(([ti]) => ti < t), [t, v]];
  }
  r.t1 = t;
  r.to = r.frames.at(-1)[1];
}

function resolveTrack(list, initial) {
  list.sort((a, b) => a.t0 - b.t0 || a.seq - b.seq);
  let start = initial;
  const first = list[0];
  if (first.immediate && first.from !== undefined) start = resolveValue(first.from, initial);
  // the first tween still resolves its relative values against the initial value
  let cur = initial;
  const out = [];
  for (const s of list) {
    const last = out.at(-1);
    if (last && s.t0 < last.t1) {
      truncate(last, s.t0);
      cur = last.to;
    }
    let r;
    if (s.frames) {
      const frames = s.frames.map(([t, v]) => [t, resolveValue(v, cur)]);
      r = { t0: s.t0, t1: s.t1, frames, from: frames[0][1], to: frames.at(-1)[1] };
    } else {
      const from = s.from === undefined ? cur : resolveValue(s.from, cur);
      const to = s.to === YOYO ? s.pair.resolvedFrom : resolveValue(s.to, from);
      s.resolvedFrom = from;
      r = { t0: s.t0, t1: s.t1, from, to, ease: s.ease };
    }
    out.push(r);
    cur = r.to;
  }
  return { start, resolved: out };
}

function keyframes(prop, start, resolved, D) {
  const name = cssName(prop);
  const off = (t) => clamp(t / D, 0, 1);
  const kf = [];
  let last = -1;
  const push = (t, v, easing) => {
    const offset = Math.max(last, off(t));
    last = offset;
    const k = { offset, [name]: fmt(prop, v) };
    if (easing) k.easing = easing;
    kf.push(k);
  };
  push(0, start);
  let cur = start;
  for (const r of resolved) {
    push(r.t0, cur);
    if (r.frames) {
      for (const [t, v] of r.frames) push(t, v);
    } else {
      push(r.t0, r.from, r.ease.css);
      push(r.t1, r.to);
    }
    cur = r.to;
  }
  push(D, cur);
  return kf;
}

// jitter every coordinate of an absolute-command path
const BOILABLE = /^[MLCQZ\d\s.,eE-]+$/;
function jitterPath(d, amp, seed) {
  let i = 0;
  return d.replace(/-?\d*\.?\d+(?:e-?\d+)?/g, (n) => {
    const v = parseFloat(n) + (hash(seed * 31 + i++) - 0.5) * 2 * amp;
    return String(+v.toFixed(2));
  });
}

function compileBoil(b, D) {
  const { el, amp, fps, variants: n, from } = b;
  const to = b.to ?? D;
  const span = Math.max(0, to - from);
  if (!span) return null;
  const d = el.getAttribute?.("d");
  let frames;
  if (el.tagName === "path" && d && BOILABLE.test(d)) {
    frames = Array.from({ length: n }, (_, v) => ({
      d: `path("${jitterPath(d, amp, b.seed * 17 + v)}")`,
    }));
  } else {
    frames = Array.from({ length: n }, (_, v) => {
      const s = b.seed * 13 + v * 3;
      return {
        "--bx": `${((hash(s) - 0.5) * 2 * amp).toFixed(2)}px`,
        "--by": `${((hash(s + 1) - 0.5) * 2 * amp).toFixed(2)}px`,
        "--br": `${((hash(s + 2) - 0.5) * amp * 0.8).toFixed(2)}deg`,
      };
    });
  }
  const kf = [
    ...frames.map((f, v) => ({ ...f, offset: v / n, easing: "step-end" })),
    { ...frames.at(-1), offset: 1 },
  ];
  return el.animate(kf, {
    duration: (n / fps) * 1000,
    delay: from * 1000,
    iterations: Math.ceil((span * fps) / n),
    fill: "none",
  });
}

function compile(segs, boils, duration) {
  let D = duration;
  for (const s of segs) D = Math.max(D, s.t1);
  for (const b of boils) D = Math.max(D, b.to ?? 0);
  D = Math.max(D, 0.001);
  const groups = new Map();
  for (const s of segs) {
    if (!groups.has(s.el)) groups.set(s.el, new Map());
    const g = groups.get(s.el);
    if (!g.has(s.prop)) g.set(s.prop, []);
    g.get(s.prop).push(s);
  }
  const anims = [];
  for (const [el, props] of groups) {
    for (const [prop, list] of props) {
      const { start, resolved } = resolveTrack(list, get(el, prop));
      const a = el.animate(keyframes(prop, start, resolved, D), {
        duration: D * 1000,
        fill: "both",
      });
      anims.push(a);
    }
  }
  for (const b of boils) {
    const a = compileBoil(b, D);
    if (a) anims.push(a);
  }
  let now = 0;
  const controller = {
    animations: anims,
    duration: () => D,
    time: () => now,
    progress: () => now / D,
    paused: () => true,
    isActive: () => false,
    seek(t) {
      now = clamp(Number(t) || 0, 0, D);
      for (const a of anims) a.currentTime = now * 1000;
      return controller;
    },
    totalTime(t) {
      return t === undefined ? now : controller.seek(t);
    },
    pause() {
      for (const a of anims) a.pause();
      return controller;
    },
    play() {
      for (const a of anims) a.play();
      return controller;
    },
  };
  controller.pause().seek(0);
  return controller;
}

// ------------------------------------------------------------------ helpers
export const el = (tag, attrs = {}, parent) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k === "style") Object.assign(e.style, v);
    else e.setAttribute(k, v);
  }
  if (parent) parent.appendChild(e);
  return e;
};
export const svg = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") e.textContent = v;
    // a text's fill goes inline, so a stylesheet's `svg text { fill }` default never overrides it
    else if (k === "fill" && tag === "text") e.style.fill = v;
    else e.setAttribute(k, v);
  }
  if (parent) parent.appendChild(e);
  return e;
};
// an absolutely placed layer (the project's CSS gives `.layer` its position
// and a 0 0 transform origin) at (x, y)
export const layer = (parent, x = 0, y = 0, cls = "") => {
  const d = el("div", { class: `layer ${cls}`.trim() }, parent);
  set(d, { x, y });
  return d;
};
export const place = (node, x, y) => set(node, { x, y });

// stroke-dashoffset draw-on needs the length; set up once, hidden. `pad`
// lengthens the dash for a path that boils, so a jittered (longer) copy never
// shows a gap at its end.
export function prepDraw(paths, pad = 0) {
  for (const p of paths) {
    const L = p.getTotalLength() + pad;
    p.style.strokeDasharray = `${L}`;
    p.style.strokeDashoffset = `${L}`;
  }
  return paths;
}
export const drawOn = (tl, paths, t, dur = 0.35, stagger = 0.08, ease = "out-cubic") =>
  paths.length ? tl.to(paths, { strokeDashoffset: 0 }, t, { dur, stagger, ease }) : tl;

// appear/vanish move relative to where the thing already sits, so they never
// undo a layer's placement. An appear that is the element's first opacity
// tween holds it hidden from the start, so nothing shows before its cue.
export const appear = (
  tl,
  els,
  t,
  { dur = 0.5, y = 24, scale = 1, stagger = 0.06, ease = "out-quart" } = {},
) =>
  tl.fromTo(els, { opacity: 0, y: `+=${y}`, scale }, { opacity: 1, y: `-=${y}`, scale: 1 }, t, {
    dur,
    stagger,
    ease,
  });
export const vanish = (tl, els, t, { dur = 0.35, y = 0, stagger = 0 } = {}) =>
  tl.to(els, { opacity: 0, ...(y ? { y: `+=${y}` } : {}) }, t, { dur, stagger, ease: "in-cubic" });
export const show = (tl, els, t) => tl.set(els, { opacity: 1 }, t);
export const hide = (tl, els, t) => tl.set(els, { opacity: 0 }, t);
// move an item {el, w, h} so its centre lands on a point, in parent coordinates
export const flyTo = (tl, item, to, t, dur = 0.6, ease = "in-out-cubic") =>
  tl.to(item.el, { x: to.x - item.w / 2, y: to.y - item.h / 2 }, t, { dur, ease });

// Camera: pushes a layer so the point (px, py) of the layer (in its own
// coordinates) sits at the stage point (sx, sy) at scale s.
export function camera(layerEl, S) {
  const home = { x: get(layerEl, "x"), y: get(layerEl, "y") };
  const to = (
    tl,
    { px, py, s = 1, sx = S.area.cx, sy = S.area.cy },
    t,
    dur = 0.7,
    ease = "in-out-cubic",
  ) => tl.to(layerEl, { x: sx - px * s, y: sy - py * s, scale: s }, t, { dur, ease });
  const reset = (tl, t, dur = 0.7) =>
    tl.to(layerEl, { x: home.x, y: home.y, scale: 1 }, t, { dur, ease: "in-out-cubic" });
  // a zoom tweened logarithmically on scale, so every doubling takes as long
  const logZoom = (
    tl,
    { px, py, from, to: s1, sx = S.area.cx, sy = S.area.cy },
    t,
    dur = 2,
    ease = "in-out-quad",
  ) =>
    tl.sample(
      layerEl,
      t,
      dur,
      (p) => {
        const s = Math.exp(lerp(Math.log(from), Math.log(s1), p));
        return { x: sx - px * s, y: sy - py * s, scale: s };
      },
      { ease },
    );
  return { to, reset, logZoom, home };
}

// ------------------------------------------------------------- composition
// The stage is the root composition element (`data-aspect` landscape or
// portrait); a caption band is reserved at the bottom and `area` is what the
// scene may use. The `.scene` layer is clipped to the space above the band.
export function stage(root, { captionH = { landscape: 190, portrait: 300 }, margin = 60 } = {}) {
  const aspect = root.dataset.aspect || "landscape";
  const portrait = aspect === "portrait";
  const W = portrait ? 1080 : 1920,
    H = portrait ? 1920 : 1080;
  const cap = typeof captionH === "number" ? captionH : captionH[aspect];
  const scene = root.querySelector(".scene");
  if (scene)
    Object.assign(scene.style, { width: `${W}px`, height: `${H - cap}px`, overflow: "hidden" });
  const m = margin;
  return {
    root,
    aspect,
    W,
    H,
    portrait,
    captionH: cap,
    area: { x: m, y: m, w: W - 2 * m, h: H - cap - 2 * m, cx: W / 2, cy: (H - cap) / 2 },
  };
}

// timing.json → look-ups, so a move lands on the word that names it. Throws
// when a word isn't in its line: the check that composition and script agree.
const norm = (w) => w.toLowerCase().replace(/[^a-z0-9']/g, "");
export function timing(T) {
  const line = (i) => {
    const l = T.lines[i];
    if (!l) throw new Error(`no line ${i}`);
    return l;
  };
  const find = (i, w, nth) => {
    const l = line(i);
    let n = 0;
    for (const x of l.words) if (norm(x.w) === norm(w) && ++n === nth) return x;
    throw new Error(`"${w}" (${nth}) not in line ${i}: ${l.caption}`);
  };
  return {
    lines: T.lines,
    line,
    start: (i) => line(i).start,
    end: (i) => line(i).end,
    word: (i, w, nth = 1) => find(i, w, nth).start,
    wordEnd: (i, w, nth = 1) => find(i, w, nth).end,
    duration: T.duration,
  };
}

// Open captions: every line's caption prebuilt in the band, shown whole for its line.
export function captions(S, T, tl) {
  const band = el("div", { class: "captions" }, S.root);
  for (const l of T.lines) {
    const c = el("div", { class: "caption", text: l.caption }, band);
    set(c, { opacity: 0 });
    tl.set(c, { opacity: 1 }, l.start);
    tl.set(c, { opacity: 0 }, l.end);
  }
  return band;
}

// Load fonts and timing.json, build, add captions, compile. Resolves with
// { tl, S, T }, where tl is the compiled controller to register:
//   ready(build, { fonts }).then(({ tl }) => { window.__timelines["<id>"] = tl; })
export function ready(build, { fonts = [], captions: withCaptions = true } = {}) {
  const root = document.querySelector("[data-composition-id]");
  const src = root.dataset.timing || "timing.json";
  return Promise.all([
    fetch(src).then((r) => r.json()),
    ...fonts.map((f) => document.fonts.load(f)),
  ]).then(([T0]) => {
    window.TIMING = T0;
    const S = stage(root);
    const T = timing(T0);
    const tl = timeline();
    build(tl, S, T);
    if (withCaptions) captions(S, T0, tl);
    const duration = Number(root.dataset.duration) || T0.duration || 0;
    return { tl: tl.finish(duration), S, T };
  });
}
