# astromotion/video

A seekable motion engine for HTML video compositions: the page lays out flat
vector objects, records tweens on a timeline, and a frame renderer
([HyperFrames](https://github.com/heygen-com/hyperframes), or anything that
seeks a registered timeline) captures it frame by frame. Motion is the Web
Animations API. No GSAP, no runtime clock: every frame is a pure function of
time, so frames render in parallel, out of order and at any resolution.

It lives in astromotion because the projects that make videos are the ones that
make decks: the same palette, type and fixed 16:9 canvas. It doesn't depend on
the deck pipeline. The `styled-video` skill (in Ben's `ben` plugin) carries
the production method; this is the engine.

## Using it

HyperFrames serves only the project root, so a composition reaches the engine
through a symlink inside that root, pointing at the installed package:

```sh
ln -s ../../website/node_modules/astromotion/video motion   # path to taste
```

```html
<div
  id="stage"
  class="stage"
  data-composition-id="intro"
  data-aspect="landscape"
  data-start="0"
  data-duration="42"
  data-width="1920"
  data-height="1080"
  data-fps="50"
>
  <div
    id="scene"
    class="clip layer scene"
    data-start="0"
    data-duration="42"
    data-track-index="0"
  ></div>
</div>
<script type="module">
  import * as M from "./motion/motion.js";
  const build = (tl, S, T) => {
    const box = M.layer(document.getElementById("scene"), S.area.x, S.area.y);
    M.set(box, { opacity: 0 });
    M.appear(tl, box, T.word(0, "hello"));
  };
  M.ready(build, { fonts: ['400 20px "Public Sans"'] }).then(({ tl }) => {
    window.__timelines["intro"] = tl;
  });
</script>
```

`ready` loads the fonts and `timing.json` (line and word times; see below),
builds, adds the caption band and compiles. The registration line must appear
literally in the HTML: the HyperFrames lint looks for it.

## The timeline

```js
const tl = M.timeline();
tl.to(targets, props, at, { dur = 0.5, ease = "out-quad", stagger = 0, yoyo = false });
tl.fromTo(targets, from, to, at, { ...opts, immediate = true });
tl.set(targets, props, at);
tl.sample(targets, at, dur, (p) => props, { ease, step = 0.01 }); // computed motion
tl.boil(targets, { amp = 1.2, fps = 12, variants = 3, from, to }); // hand-drawn wobble
const controller = tl.finish(duration); // seek(t), duration(), pause(), play()
```

- **Times are absolute seconds.** There's no "after the previous tween"
  position: a beat lands on the word that names it (`T.word(i, "fence")`), so
  every time is computed, never implied.
- **Properties**: `x`, `y` (px), `scale`, `scaleX`, `scaleY`, `rotation` (deg),
  `opacity`, and any other CSS property by its camelCase name (`fill`,
  `strokeDashoffset`, ...). `transformOrigin` is static and applies at once.
  Relative values (`"+=24"`) are relative to the value when the tween starts.
- **Resolution in time order.** Tweens can be added in any order; `finish()`
  sorts each element's tweens on each property by start time. A tween that
  starts before the previous one on the same property ends cuts it off where it
  is.
- **`fromTo` holds its from values** from the start of the video when it is the
  property's first tween (`immediate: false` to hold the prior value instead).
- **Eases** are named power curves, handed to CSS as `linear()`: `linear`,
  `in`/`out`/`in-out` (cubic), and `in-`, `out-` or `in-out-` plus `quad`,
  `cubic` or `quart`, and an overshooting `out-back` (`out-back(1.4)` for a
  softer one). Any CSS easing string also passes through.
- **Boil** redraws an element slightly differently `fps` times a second, the way
  hand-drawn animation "boils". An SVG path of absolute `M L C Q Z` commands
  jitters its points; anything else jitters its position and angle. Use it for
  pencil marks, not for type that must read steadily.

`M.set(targets, props)` sets resting values at build time, and `M.get(el, prop)`
reads them back. Anything not visible at t=0 must be created hidden
(`M.set(el, { opacity: 0 })`): the renderer seeks cold to any frame.

## How it compiles

Each element's tweens on each property become one paused WAAPI animation
spanning the whole composition (`fill: "both"`), with a keyframe at every tween
boundary and the ease on the keyframe that starts it. Seeking sets `currentTime`
on every animation. That sidesteps the two WAAPI traps a naive "one animation
per tween" timeline falls into: filled animations that the browser auto-removes
once a later one replaces them (which breaks seeking backwards), and a later
animation's backwards fill clobbering an earlier state.

Transforms go through registered custom properties (`--x`, `--y`, `--sx`,
`--sy`, `--r`, plus the boil offsets `--bx`, `--by`, `--br`) feeding the
individual `translate`, `scale` and `rotate` properties, so x and y animate on
independent schedules. The engine registers them and the rule for
`[data-motion]` itself. SVG elements transform about their own box
(`transform-box: fill-box`).

## Helpers

`layer`, `el`, `svg`, `place`; `prepDraw(paths, pad)` and `drawOn` for stroke
draw-on; `appear`, `vanish`, `show`, `hide`, `flyTo`; `camera(layer, S)` with
`to`, `reset` and a logarithmic `logZoom`; `stage`, `timing`, `captions` and
`ready` for the composition contract; `hash` for deterministic per-index noise
(never `Math.random()`).

## timing.json

```json
{
  "duration": 42.1,
  "lines": [
    {
      "caption": "Hello there.",
      "start": 0.4,
      "end": 1.9,
      "words": [{ "w": "Hello", "start": 0.4, "end": 0.8 }]
    }
  ]
}
```

Forced alignment of the script against the voice-over writes it; the LLMs
Unplugged repo's `ops/video/align.py` is the reference implementation.
`T.word(i, w)` throws when a word isn't in its line, which is the check that the
composition and the script agree.
