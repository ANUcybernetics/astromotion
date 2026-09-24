---
id: TASK-6
title: >-
  astromotion-pdf output has ballooned ~12-20x: pages export as thousands of 720
  ppi image strips
status: Done
assignee: []
created_date: '2026-09-24 03:14'
updated_date: '2026-09-24 04:05'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A comp4020 export on 2026-09-24 (macOS, astromotion v0.31.4, astro-theme-university v0.17.3) produced an 87 MB PDF for a 39-slide deck (`week-7`). Weeks 1--6 exported at 6--12 MB. It is not the deck: re-exporting the already-published `week-6` deck today gives 139 MB against the 7 MB file exported on 2026-09-03 (comp4020 website commit `9690b84`, astromotion then pinned at v0.24.0).

The page count is right (39/39), so nothing is animating forever. The bloat is spread evenly (~2 MB per page, 2.2 MB mean). `pdfimages -list` on a split page shows the difference:

- old (week-6 as published): one 1600x900 JPEG per page, ~190 KB
- new: hundreds of full-width RGB strips 3--4 px tall at 720 ppi (3840x4 on a hero page, 1440x4 on a plain one), each a few hundred bytes, uncompressed `image` encoding

That looks like Chrome now rasterising something (a gradient, scrim, filter or blur) into horizontal bands that Ghostscript then carries through instead of flattening, whereas the old pipeline ended up with one JPEG per page.

Suspects, unbisected:

- system Chrome auto-updating --- `findChrome()` prefers `/Applications/Google Chrome.app`, which was 153.0.8010.53 on the day; not in any lockfile, so it can change under a fixed pin
- astromotion changes between v0.24.0 and v0.31.4, especially the Ghostscript step and v0.31.2 `theme/print.css` (ligatures off for `?astromotion-export`)
- astro-theme-university deck CSS between v0.14.0 and v0.17.3 (hero scrims have been touched several times)

Ghostscript 10.08.0 locally. Repro: in `~/projects/comp4020/website`, `pnpm pdf week-6 /tmp/w6.pdf`, then `qpdf --split-pages /tmp/w6.pdf /tmp/p-%d.pdf && pdfimages -list /tmp/p-2.pdf`. Quickest split: export once with `ASTROMOTION_CHROME_PATH` pointed at an older Chromium (or decktape's bundled one) to rule Chrome in or out, then bisect astromotion tags with a `file:` override.

Blocks publishing the comp4020 week-7 PDF.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An export of the comp4020 week-6 deck is back within ~2x of its 7 MB published size, with one image (or vector content) per page rather than strip rasters
- [x] #2 The text layer v0.31.2 restored survives the fix
- [x] #3 A test or check fails an export whose size or per-page image count regresses like this
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: Ghostscript 10.08.0 (2026-09-08, picked up by Homebrew) rasterises every page carrying a soft-masked image into ~870 full-width 720 ppi strips when run with `-dColorConversionStrategy=/LeaveColorUnchanged`. Chrome, astromotion, the theme CSS and macOS are all ruled out. Bisected on one raw capture: 10.07.1 is fine with or without the flag; 10.08.0 bloats only with it. Linux and macOS builds agree.

The flag had been papering over the real fault: `/ebook` sets the legacy `/sRGB` strategy, which from 10.07 takes the device-independent path and paints soft-masked content (a translucent gradient) opaque. Fix: `/ebook` with an explicit `-sColorConversionStrategy=RGB` (src/pdf-compress.mjs). That drops the empty-ICC byte patch, sets a floor of gs >= 10.07 (older versions lose translucent gradients under any setting), and pins `conda:ghostscript` in mise.toml. The export fails if compression grows the file.

Verified end to end on comp4020 week-6: 7.2 MB, <=3 images/page, no ICC, text layer intact. Scrim brightness matches across browser screen, export mode, poppler and Quartz. The published week-6 PDF (gs 10.02) had its hero scrims missing.

The ligature-off rule in theme/print.css stays: gs 10.08 still drops Type 3 ToUnicode entries for ligature glyphs (Chrome writes them correctly), and pdfwrite has no control for it.
<!-- SECTION:NOTES:END -->
