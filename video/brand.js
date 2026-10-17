// Brand moments: the photographs and title block that open a video and the
// lockup that closes it, after the decks' hero and closing slides. The grammar
// is shared; everything a brand owns comes in as data (its logo files, its
// lockup's geometry) or as --video-* tokens in its CSS (stage.css lists them),
// so one composition reads as any brand that supplies them.

import * as M from "./motion.js";

// stage.css's default face, every weight it serves: ready(build, { fonts })
export const fonts = [300, 400, 500, 600, 700].map((w) => `${w} 20px "Public Sans"`);

// A decoded image, ready before the first frame is captured.
export async function image(src, alt = "") {
  const img = new Image();
  img.src = src;
  img.alt = alt;
  await img.decode();
  return img;
}

export const svgText = (src) => fetch(src).then((r) => r.text());

// Full-frame photographs in turn under the hero scrim, behind the scene and the
// caption band. Photo n fades in at `at[n]`; each is gone once the next covers
// it, and the last fades out at `out`. Returns { el, photos, scrim }.
export function backdrop(tl, S, { photos, at, out, fade = 0.6, outDur = 0.9 }) {
  const el = M.el("div", { class: "layer video-backdrop" });
  Object.assign(el.style, { width: `${S.W}px`, height: `${S.H}px` });
  S.root.insertBefore(el, S.root.querySelector(".scene"));
  photos.forEach((img, n) => {
    el.appendChild(img);
    M.set(img, { opacity: 0 });
    tl.to(img, { opacity: 1 }, at[n], { dur: fade });
    if (n < photos.length - 1) tl.set(img, { opacity: 0 }, at[n + 1] + fade);
    else tl.to(img, { opacity: 0 }, out, { dur: outDur, ease: "in-cubic" });
  });
  const scrim = M.el("div", { class: "video-scrim" }, el);
  return { el, photos, scrim };
}

const HERO = {
  landscape: { x: 110, logoTop: 70, logoH: 84, textTop: 580 },
  portrait: { x: 80, logoTop: 110, logoH: 72, textTop: 1080 },
};

// The title block of the decks' hero slide: the brand's logo at the top, then
// the title over a short accent rule, the tagline and the byline. Created
// hidden; bring it in with M.appear. Returns { el, logo, title, rule, tagline, byline }.
export function titleBlock(parent, S, { logo, title, tagline, byline, ...place }) {
  const p = { ...HERO[S.aspect], ...place };
  const el = M.layer(parent, p.x, 0);
  M.set(el, { opacity: 0 });
  if (logo) {
    logo.classList.add("video-hero-logo");
    Object.assign(logo.style, { top: `${p.logoTop}px`, height: `${p.logoH}px` });
    el.appendChild(logo);
  }
  // as wide as the frame less the margin either side, so portrait type wraps
  const text = M.el("div", { class: "video-hero-text" }, el);
  Object.assign(text.style, { top: `${p.textTop}px`, width: `${S.W - 2 * p.x}px` });
  const line = (cls, s) => (s ? M.el("div", { class: cls, text: s }, text) : null);
  return {
    el,
    logo,
    title: line("video-hero-title", title),
    rule: M.el("div", { class: "video-hero-rule" }, text),
    tagline: line("video-hero-tagline", tagline),
    byline: line("video-hero-byline", byline),
  };
}

// The closing lockup of the decks' last slide: two accent rules grow from the
// top and bottom edges of the frame towards the mark, along the axis that runs
// through it, then the mark fades in. `mark` is the artwork's SVG markup, drawn
// `height` px tall and centred on the frame; the brand layer supplies it with
// `axis`, where the rules run as a fraction of the artwork's width, and `gap`,
// the space between each rule's end and the mark as a fraction of its height.
// Returns { el, mark, rules }; the caller fades `el` out.
export function lockup(
  tl,
  parent,
  S,
  { mark, axis, gap, height, rule = 1.5, at, grow = 1, fade = 2 },
) {
  // one SVG over the whole frame, as on the deck's slide, so the rules and the
  // mark sit at fractional positions instead of snapping to the pixel grid
  const el = M.svg("svg", {
    class: "layer",
    width: S.W,
    height: S.H,
    viewBox: `0 0 ${S.W} ${S.H}`,
  });
  parent.appendChild(el);
  const holder = M.el("div");
  holder.innerHTML = mark;
  const art = holder.querySelector("svg");
  const [, , vw, vh] = art
    .getAttribute("viewBox")
    .split(/[\s,]+/)
    .map(Number);
  const w = (height * vw) / vh;
  const x = (S.W - w) / 2,
    y = (S.H - height) / 2;
  for (const [k, v] of Object.entries({ x, y, width: w, height })) art.setAttribute(k, v);
  el.appendChild(art);
  M.set(art, { opacity: 0 });
  const len = y - gap * height;
  const rules = [0, S.H - len].map((ry) => {
    const r = M.svg("rect", {
      class: "video-lockup-rule",
      x: x + axis * w - rule / 2,
      y: ry,
      width: rule,
      height: len,
    });
    el.appendChild(r);
    M.set(r, { transformOrigin: `50% ${ry ? "100%" : "0"}`, scaleY: 0 });
    tl.to(r, { scaleY: 1 }, at, { dur: grow, ease: "out-quart" });
    return r;
  });
  tl.to(art, { opacity: 1 }, at + grow, { dur: fade, ease: "in-out-quad" });
  return { el, mark: art, rules };
}
