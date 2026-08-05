---
id: TASK-4
title: Transparent slide-annotation surface for the whiteboard
status: To Do
assignee: []
created_date: '2026-08-05 22:18'
updated_date: '2026-08-05 22:18'
labels:
  - whiteboard
  - decks
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Press W and the whiteboard covers the slide with an opaque board, which is right for a fresh diagram and wrong for marking up the slide already on screen --- circling a term, arrowing between two boxes, ticking off a list as the room works through it. The surface is a fixed opaque overlay (position: fixed; inset: 0 plus a background-color, theme/whiteboard.css:21-28), so there is no way to get ink over slide content today.

Add a second surface to the same board: shift-W opens it transparent over the current slide, plain W keeps the opaque board. Reveal dispatches key bindings by keyCode and hands the callback the event, so both have to live on one binding (keyCode 87) that branches on event.shiftKey --- which also means the help overlay gets a single row whose description has to name both.

Two things make this more than a CSS change. Ink has to stick to the content, so annotation strokes are stored in the deck's 1280x720 slide coordinates rather than the viewport client coordinates the board uses, mapped through the .reveal .slides bounding rect at pointer time and back at render. A projector resize then moves the ink with the slide instead of leaving it behind. And ink has to belong to a slide, so strokes are kept per (h, v) index from deck.getIndices(), swapped on Reveal's slidechanged event, with undo and clear scoped to the slide in front of you.

Navigation has to keep working, which inverts the board's key handling: the opaque board deliberately swallows every unmodified key so Reveal cannot navigate underneath it, whereas the annotation layer must let arrows, space, N/P and Home/End through while still claiming the digits, Z, C, D and W/Escape. Fragment state is ignored --- annotations key on the slide, so the same ink shows at every fragment step.

Scope limits worth stating up front. The D export writes ink only, on a transparent background, because compositing the actual slide would need a DOM rasteriser the package does not carry and should not take on. The layer stays in memory, so a reload discards it and ?print-pdf renders nothing. The speaker-notes window is a separate document and gets no annotations. And while the layer is open it swallows pointer events, so slide links and QR codes are not clickable until it is closed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Shift-W opens the board transparent over the current slide while plain W still opens the opaque board, both from a single Reveal key binding whose help-overlay description names the two
- [ ] #2 Ink drawn on the annotation surface stays aligned with the slide content across a window resize or a change of display
- [ ] #3 Annotations are kept per slide: navigating away and back shows the same ink, and a slide never drawn on starts empty
- [ ] #4 Undo and clear affect only the slide currently on screen
- [ ] #5 With the annotation surface open Reveal still responds to its navigation keys (arrows, space, N/P, Home/End), while the digits, Z, C, D and W/Escape are claimed by the layer
- [ ] #6 The same annotation shows at every fragment step within a slide
- [ ] #7 The opaque board is unchanged: viewport-space ink, one shared drawing, every unmodified key swallowed
- [ ] #8 D saves the annotation as a PNG with a transparent background, named for the slide it belongs to
- [ ] #9 The toolbar stays legible over arbitrary slide content
- [ ] #10 Annotations are ephemeral: a reload discards them and ?print-pdf renders no ink
- [ ] #11 Opening Reveal's overview closes the annotation surface
- [ ] #12 The coordinate mapping, per-slide stroke store and key-dispatch rules are covered by tests in test/whiteboard-core.test.ts without a browser
- [ ] #13 The README Whiteboard section documents the annotation surface and its limits
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. core.ts: add `surface: "board" | "slide"` to WhiteboardState; `open` carries the surface. Strokes move from a flat array to `{ board: WhiteboardStroke[], slides: Record<string, WhiteboardStroke[]> }`, with a `slideKey(h, v)` helper and undo/clear/endStroke routed through the active bucket.
2. core.ts: `toSlidePoint(client, rect)` / `toClientPoint(slide, rect)` mapping the 1280x720 slide space through the .reveal .slides bounding rect. Pure, so it tests without a DOM.
3. core.ts: `keyAction` takes the surface. Board keeps the swallow-everything default; slide mode returns null (pass through to Reveal) for anything outside the claimed set.
4. index.ts: widen the RevealKeyBindings interface to the slice actually used --- addKeyBinding, getIndices, on. Branch the keyCode 87 callback on event.shiftKey; subscribe to slidechanged to swap buckets and overviewshown to close.
5. index.ts: render maps slide-space strokes through the current rect each frame; the existing viewport path stays for board mode. Recompute the rect on resize and slidechanged rather than caching it.
6. whiteboard.css: `[data-surface="slide"]` drops the background colour and image to transparent and strengthens the toolbar scrim.
7. downloadBoard splits: board mode composites surface + background image as now; slide mode exports the ink canvas alone, via an `annotationFilename(indices, date)` alongside boardFilename.
8. Tests in test/whiteboard-core.test.ts for the new pure functions; README Whiteboard section.
<!-- SECTION:PLAN:END -->
