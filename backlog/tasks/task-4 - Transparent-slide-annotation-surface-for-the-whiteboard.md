---
id: TASK-4
title: Transparent slide-annotation surface for the whiteboard
status: Done
assignee: []
created_date: '2026-08-05 22:18'
updated_date: '2026-08-05 22:59'
labels:
  - whiteboard
  - decks
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Press W and the whiteboard covers the slide with an opaque board, which is right for a fresh diagram and wrong for marking up the slide already on screen --- circling a term, arrowing between two boxes, ticking off a list as the room works through it. The surface is a fixed opaque overlay (position: fixed; inset: 0 plus a background-color, theme/whiteboard.css:21-28), so there is no way to get ink over slide content today.

Add a second surface to the same board: shift-W opens it transparent over the current slide, plain W keeps the opaque board, and either key flips an already-open board to the other surface without losing the ink.

Strokes stay in viewport coordinates, exactly as the board stores them now. Mapping them into the deck's 1280x720 slide space would keep ink glued to content across a projector resize, and it is not worth the machinery --- a scribble lives about as long as the point being made. Annotations are bucketed per (h, v) slide index so stepping away and back brings them with you, and closing the layer clears the lot.

Key handling gets simpler rather than more complex. The board currently swallows every unmodified key so Reveal cannot navigate underneath it, which also means F, S and B do nothing while it is open. Replace that with one rule for both surfaces: the pen claims the digits, Z/U, C, D and W/Escape, and every other key belongs to the deck. Reveal's bindings were checked against that set and nothing collides --- digits are unbound, Z, U and D are unbound, and C is live only while a Reveal overlay is already open. The trade is that an accidental space or arrow now moves the deck behind the opaque board, unseen.

Two constraints in reveal.js shape the implementation. Reveal drops any shift-modified key before it reaches a custom binding (keyboard.js:170-178 --- keyCode 87 is not on the modifier whitelist), so shift-W cannot be an addKeyBinding callback and has to be claimed by astromotion's own capture-phase listener, which already runs ahead of Reveal's bubble-phase one (keyboard.js:55). The help overlay is fed separately by registerKeyboardShortcut(), so both surfaces still get a row of their own.

Saving with D should write the slide and the ink together. No DOM rasteriser does that faithfully for these decks --- full-bleed backgrounds, webfonts, SVG and CSS transforms are exactly what html2canvas and the foreignObject trick get wrong --- so use the Screen Capture API instead: getDisplayMedia({ preferCurrentTab: true }) on the D keypress, which carries the transient activation the call needs, one frame drawn into a canvas, toolbar hidden for the shot. Capturing the tab picks up the ink already composited over the slide, so nothing has to be redrawn. The cost is a share prompt: acquire the stream on the first save and hold it until the layer closes, and fall back to the current ink-only PNG if the presenter cancels or the browser lacks support.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Shift-W opens a transparent surface over the current slide, plain W opens the opaque board, and pressing the other key while one is open swaps the surface with the ink intact
- [x] #2 Both surfaces appear as their own row in Reveal's help overlay
- [x] #3 On either surface Reveal still responds to every key the pen does not claim, including F, S, B and the navigation keys
- [x] #4 The pen claims the digit keys, Z/U, C, D and W/Escape on both surfaces
- [x] #5 Annotations are kept per slide: stepping away and back shows the same ink, and a slide never drawn on starts empty
- [x] #6 Closing the annotation surface discards every slide's ink, while the opaque board still keeps its drawing until cleared
- [x] #7 Undo and clear act on the slide currently on screen
- [x] #8 Opening Reveal's overview closes the annotation surface rather than leaving ink floating over it
- [x] #9 D on the annotation surface saves a PNG of the slide with the ink over it and no toolbar in the shot
- [x] #10 The presenter is prompted to share at most once per opened layer, not once per save
- [x] #11 Cancelling the share prompt, or running on a browser without the Screen Capture API, still saves the ink on a transparent background
- [x] #12 D on the opaque board is unchanged, compositing the surface colour and its background image
- [x] #13 Annotations are ephemeral: a reload discards them and ?print-pdf renders no ink
- [x] #14 The key-dispatch rules and the per-slide stroke store are covered by tests in test/whiteboard-core.test.ts without a browser
- [x] #15 The README Whiteboard section documents the annotation surface, the shared key rule and the share prompt
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. core.ts: add `surface: "board" | "slide"` to WhiteboardState. `open` carries the surface, and re-issuing it with the other surface flips in place. Board strokes stay a flat array; slide strokes become `Record<string, WhiteboardStroke[]>` keyed by a `slideKey(h, v)` helper, with beginStroke/endStroke/undo/clear routed through whichever bucket is live. No coordinate mapping --- points stay in viewport space throughout.
2. core.ts: replace the swallow-everything default in `keyAction` with an explicit claimed set (digits, Z/U, C, D, W/Escape). Anything else returns null and reaches Reveal. The `swallow` action drops out of WhiteboardAction entirely.
3. index.ts: widen the Reveal interface to the slice used --- addKeyBinding, registerKeyboardShortcut, getIndices, on. Keep the plain-W addKeyBinding, claim shift-W in the existing capture-phase listener (Reveal never dispatches it, keyboard.js:170-178), and register a help row per surface.
4. index.ts: subscribe to slidechanged to swap the live bucket, and to overviewshown to close the layer.
5. whiteboard.css: `[data-surface="slide"]` drops background-color and background-image to transparent and strengthens the toolbar scrim so the chips stay legible over arbitrary slide content.
6. index.ts: split the save path. Board mode composites surface colour plus background image as it does now. Slide mode acquires a getDisplayMedia stream lazily on the first D, holds it until close, hides the toolbar, draws one video frame to a canvas and saves that; a cancelled prompt or a missing API falls back to the ink-only canvas on transparency.
7. Tests in test/whiteboard-core.test.ts for the claimed-key set, the surface flip and the per-slide bucket. README Whiteboard section.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented over src/whiteboard/core.ts (surface in state, per-slide stroke buckets, explicit claimed-key set) and index.ts (capture-phase W/⇧W, registerKeyboardShortcut help rows, slidechanged/overviewshown wiring, getDisplayMedia save path), plus theme/whiteboard.css for the transparent surface.

Verified live in a browser against llms-unplugged with a file: override: ⇧W opens transparent (background rgba(0,0,0,0)) and W crosses to opaque; ArrowRight advances the deck while annotating; ink is per-slide (drew on #/2, blank on #/3, restored on return); both help rows render; three consecutive saves fired one getDisplayMedia prompt and produced PNGs with slide content and ink but no toolbar; a rejected prompt fell back to a mostly-transparent ink-only PNG; board save still fully opaque.

Two bugs found by that testing rather than by the tests. Opening the pen while Reveal's overview was ALREADY up left ink over the thumbnail grid (the overviewshown handler only catches an overview opened afterwards) --- ⇧W now exits the overview first. And nextCaptureFrame hung on the second save, leaving the toolbar hidden: a capture stream only delivers frames when the screen changes, so requestVideoFrameCallback may never fire on a still slide. It now races a 400ms deadline.

Toolbar scrim also had to go from 45% to 72% black plus a backdrop blur --- at 45% the hint was unreadable where it crossed bright slide artwork.
<!-- SECTION:NOTES:END -->
