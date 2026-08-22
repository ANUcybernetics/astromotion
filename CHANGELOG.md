# Changelog

## 2026-08-22 (v0.22.1)

The optional `puppeteer-core` peer now starts at 25. Puppeteer 25 replaces its
vulnerable `extract-zip` download path, while astromotion's existing Node 24
floor already satisfies the new Puppeteer line.

## 2026-08-22 (v0.22.0)

### Deck routing and build integrity belong to the deck engine

The integration now accepts `routePrefix`, so a site can mount the standard
injected route at `/lectures` or another prefix without copying a custom Astro
integration. It also checks generated deck structure after each production
build and warns when published source decks produce no deck pages. These checks
previously lived in a particular website theme, leaving non-theme consumers
unprotected and coupling the theme to Reveal's internal markup.

The setup documentation now states the real shared-processor contract:
consumers that already own the MDX/markdown pipeline pass the exported
`deckRemarkPlugins` themselves.

## 2026-08-15 (v0.21.1)

### The whiteboard pen holds its weight on every screen

Brush widths were fixed in CSS pixels, on an overlay that sits outside Reveal's
scaled slides --- so the pen was the one thing in a deck that ignored the
1280x720 design canvas. Slide content scales by `min(vw/1280, vh/720)`, so the
same stroke landed twice as heavy on a 1080p projector as on a 4K display, and
handwriting takes up roughly a constant fraction of the screen either way. The
mark read spidery on one and blobby on the other.

Sizes are now deck units, multiplied by Reveal's scale as the stroke is drawn.
The toolbar's size preview takes the same factor, capped so the broad marker
stays inside its chip; the chips themselves are unchanged, being click targets
for the presenter's hand rather than content sized against the slide.

## 2026-08-08 (v0.21.0)

### A friendlier greeting than Reveal's shortcut table

Opening a deck for the first time in a tab used to pop Reveal's own help
overlay: a full-screen black sheet of every key binding, unstyled by the deck's
theme, dumped on someone who had just clicked a link. It taught the bindings and
looked like an error dialog.

In its place is a small themed card --- that this is a reveal.js deck, that `←`
and `→` move through it, and that `?` lists the rest --- dismissed by any key,
any click, or twelve seconds. It is deliberately not a real modal, so unlike the
overlay it swallows nothing: the arrow that dismisses it also advances the
slide.

Themes can restyle it through `--astromotion-hint-scrim`,
`--astromotion-hint-bg`, `--astromotion-hint-color`,
`--astromotion-hint-border`, `--astromotion-hint-radius`,
`--astromotion-hint-shadow`, `--astromotion-hint-padding`,
`--astromotion-hint-font-family`, `--astromotion-hint-font-size`,
`--astromotion-hint-kbd-bg` and `--astromotion-hint-kbd-edge`.

## 2026-08-06 (v0.20.0)

### The whiteboard gets a second surface, over the slide

`W` covered the slide with an opaque board, which is right for a diagram drawn
from nothing and wrong for marking up what is already on screen. `⇧W` now opens
the same board transparent, over the current slide. Each key toggles its own
surface, so pressing the other crosses over with both drawings intact, and
`Escape` closes whichever is showing.

Annotations belong to a slide: navigate away and back and yours is still there,
while closing the layer discards the lot. The ink stays positioned against the
window rather than the slide, so a resize mid-scribble moves it out of place ---
a deliberate trade, since an annotation is meant to last about as long as the
point being made, and mapping into the deck's 1280x720 space to survive a
projector change would have been the bulk of the work for a case that does not
arise.

`⇧W` could not be a Reveal key binding: Reveal drops shift-modified keys before
they reach the binding table. Both surfaces are opened from astromotion's own
capture-phase listener instead, and announced to the help overlay through
`registerKeyboardShortcut`, which is also why they get a row each.

### The board no longer swallows the keyboard

Previously the open board claimed every unmodified key so Reveal could not
navigate underneath it, which also meant `F`, `S` and `B` did nothing while it
was up. Both surfaces now claim only what the pen needs --- `W`, then the
digits, `Z`/`U`, `C`, `D` and `Escape` --- and leave every other key to the
deck. Nothing in that set collides with Reveal's own bindings: the digits, `Z`,
`U` and `D` are unbound, and `C` is live only while a Reveal overlay is already
open.

The trade is that an accidental space or arrow now moves the deck behind the
opaque board, unseen. Worth it for one rule instead of two, and for the keys
that were silently dead.

### Saving an annotation captures the slide with it

`D` on the board still composites the board's surface and background image. `D`
on an annotation saves the slide _with_ the ink over it, via the browser's
screen-capture picker --- no DOM rasteriser reproduces these decks faithfully,
since full-bleed backgrounds, webfonts, SVG and CSS transforms are exactly what
they get wrong, whereas a captured frame is what the room saw. The stream is
taken once on the first save and held until the layer closes, so the share
prompt appears once per opened layer rather than once per save. Cancelling it,
or a browser without the API, falls back to saving the ink alone on
transparency.

Files are named for their slide, one-based to match the deck's own `#/` hash:
`annotation-3-1-20260703-152410.png`.

## 2026-08-05 (v0.19.6)

### The keyboard help overlay shows itself on a deck's first load

Astromotion adds key bindings a viewer has no way to discover --- `W` for the
whiteboard, `T` for the clock --- and Reveal's `?` shortcut only helps someone
who already suspects there is help to be had. The overlay now opens by itself
the first time a deck is loaded in a browser tab, listing Reveal's own shortcuts
and astromotion's alongside them. Escape dismisses it.

"First time" is scoped to the tab, via `sessionStorage` keyed by the deck's
path: a reload doesn't re-show it, a second deck opened in the same tab gets its
own showing, and a fresh tab is treated as a fresh viewer. localStorage was the
alternative and is worse --- a flag set months ago would suppress the overlay
for someone who has long forgotten the keys, and would need invalidating every
time a binding is added.

The speaker-notes view (which loads the deck in an iframe) and the `?print-pdf`
export view are both excluded, so nothing new appears in an exported PDF.

One wrinkle found while building this: reveal.js 6.0.1 still declares the 5.x
`isPrintingPDF()` in its bundled `.d.ts`, but the method no longer exists at
runtime --- the replacement is `isPrintView()`. Calling the phantom typechecks
cleanly and throws in the browser, and inside `initialize().then()` that
rejection is swallowed silently. The guards are called optionally and backed by
a plain `print-pdf` URL check for that reason.

## 2026-08-04 (v0.19.5)

### Whiteboard toolbar at one-and-a-half times the size

The colour swatches, brush-size chips and key hint at the bottom of the
whiteboard were sized for a laptop screen rather than a lecture theatre, where
the presenter is often reaching for a swatch on a touchscreen or a tablet from
arm's length. Every dimension in the toolbar --- chip diameter, borders, rings,
gap, padding, hint text, and the dot that stands in for the brush width --- is
now 1.5x what it was.

Growing it exposed a latent layout bug: the toolbar is absolutely positioned at
`left: 50%` with no `right`, so its shrink-to-fit width was capped at half the
viewport. The old chrome fit inside that by luck; the larger chrome didn't, and
flex shrank the circles into ellipses. The toolbar now takes
`width: max-content` (bounded by the viewport) and the chips refuse to shrink,
so the swatches stay round at any deck size.

## 2026-07-31 (v0.19.4)

### PDF export: images Safari refused to draw

Ghostscript 10.07 writes every image's ICC profile out as a zero-byte stream
while leaving the image's colour space pointing at it, so a compressed deck
carries one broken profile shared by all its images. Poppler, pdf.js, PDFium and
MuPDF fall back on the profile's component count and render normally --- which
is why this went unnoticed --- but Apple's CoreGraphics doesn't, so in Safari
and Preview the images simply don't draw and the deck arrives as text on blank
backgrounds. Ghostscript 10.02 writes the profiles correctly, so whether an
export is broken depends on which machine ran it.

The export now rewrites an empty ICC colour space to the device space its
component count implies (`/DeviceRGB` for three) before writing the file ---
exactly the fallback the tolerant renderers already apply, so nothing that
renders today changes appearance. The rewrite is padded to the same byte length,
so it cannot disturb the rest of the file, and it does nothing at all on a
Ghostscript that behaves.

### PDF export: a live widget no longer runs the export away

decktape's generic plugin decides the deck is over when a `MutationObserver`
over the whole document sees nothing change for a second after ArrowRight. A
widget redrawing on a `setInterval` --- a talk timer, a countdown, a marquee ---
therefore means the export never ends: it runs to `DECKTAPE_MAX_SLIDES`, quietly
appending hundreds of copies of the final slide. Add one such widget to a deck
template and every deck stops exporting at once.

Both capture modes now load the deck with `?astromotion-export`, which sets
`data-astromotion-export` on `<html>` and stops `setInterval` scheduling
anything. A live widget renders its first frame and then holds still --- what a
still frame of a deck should look like anyway --- while `setTimeout` is left
alone, so nothing about how the deck builds itself changes. A widget that
animates by some other route can still run an export away; hide it with the
attribute.

## 2026-07-30 (v0.19.3)

### QR codes: hide the decorative grid from the accessibility tree

The generated `<svg>` now carries `aria-hidden="true"`. The surrounding `<a>` is
already named by the `<span>` holding the display URL, so the grid was never
anything but decoration — screen readers had no reason to walk it, and neither
does anything else.

The reason to bother is build time. A QR is roughly a thousand `<rect>`s, each
with its own inline `style` carrying two animations, and post-build
accessibility checkers walk every element: axe-core over JSDOM spent 68s on a
single deck page that embedded one, 75.7s of it inside the `region` rule alone
(every other rule on that page ran in about 50ms). With the attribute the same
page scans in 1.3s, with no change in what gets reported. On the COMP4020 site
that is the difference between a three-minute CI build and a one-minute one, and
it compounds — the cost was per-page, so it recurred for every deck that showed
a QR.

## 2026-07-29 (v0.19.2)

### `astromotion-check`: don't leave a dev server running

Astro detaches the dev server itself when it detects an agent environment, so
the process the check spawns exits immediately and the real server outlives it:
every run leaked one, and the next run found a stale server on the port serving
modules from before the last edit (which surfaced as an unexplained HTTP 500,
not as anything about staleness). The check now runs `astro dev stop` before
starting and again on exit, alongside the existing process-group kill, so it
cleans up whichever mode Astro chose.

## 2026-07-29 (v0.19.1)

### Split slides: stop silently squashing a code block instead of overflowing

The failure `astromotion-check` was written to find, fixed at the source.
`.split-content` is a flex column, and a flex item whose overflow is not
`visible` has an automatic minimum size of zero --- so on a slide with too much
content the flex algorithm shrank the code block below its own contents rather
than letting anything overflow. The block collapsed to its padding and the last
command was simply not on screen, with nothing about the rendered slide saying
so. `.split-content > *` is now `flex-shrink: 0`.

An overfull split slide therefore now overflows visibly where it used to hide
the overflow inside a squashed child. That is the intended change --- loud is
the right failure mode for a deck, and it is the state `astromotion-check`
reports --- but it does mean a deck that looked fine may now show the problem it
always had. Run the check after bumping.

## 2026-07-29 (v0.19.0)

### `astromotion-check`: find slides that don't fit before the room does

A deck scales a fixed 1280x720 canvas, so a slide either fits or it doesn't ---
but nothing said which until it was on the projector. Worse, one failure mode
was invisible even then: a code block inside a split panel is a flex item, and a
flex item whose overflow is not `visible` has an automatic minimum size of zero,
so on a full slide the block is silently squashed to its padding. The slide
looks deliberate; the last command is simply not on screen. That shipped in a
week-1 lecture deck, on the slide carrying the commands the room was there to
copy.

`astromotion-check` walks every slide of every deck in headless Chrome and
reports `overflow` (a text element past the canvas edge) and `clipped` (an
element hiding its own content). It runs against `astro dev`, not a production
build, because a deck with `published: false` is absent from a build and those
are exactly the decks still being written. Exits non-zero, so it can gate a
release --- but it needs a browser and a dev server, so it stays a deliberate
command rather than part of `astro build`.

Needs `puppeteer-core` (already an optional peer for `astromotion-pdf --notes`)
and a local Chrome. Chrome discovery moved to `src/chrome.mjs`, shared by both
scripts; `ASTROMOTION_CHROME_PATH` / `ASTROMOTION_CHROME_ARGS` are the new
names, with the older `DECKTAPE_*` pair still honoured.

One measurement note, since the first cut of the `clipped` rule was unusable:
`scrollHeight` counts a scroll container's bottom padding and its last child's
bottom margin, so a perfectly fine slide reports ~100px "hidden". The rule
measures where descendant content actually ends against the edge the box clips
at.

## 2026-07-28 (v0.18.1)

### PDF export: stop Ghostscript blanking slides that layer transparency over an image

A slide that puts a semi-transparent overlay over a full-bleed background — a
`.hero` scrim like astro-theme-university's
`linear-gradient(to top, rgb(0 0 0 / 80%), rgb(0 0 0 / 20%))` — exported as a
flat grey-to-black wash with the artwork gone, while the slide's text (a higher
stacking context) survived. On a deck with a section divider per speaker that is
twenty-odd ruined slides, and the surviving text made the export look plausible
enough to send.

The cause was the Ghostscript compression step, not the browser: `/ebook`
implies a colour-conversion strategy that re-encodes ICC-based images, and that
conversion flattens the transparency group and paints the overlay opaque.
`astromotion-pdf` now passes `-dColorConversionStrategy=/LeaveColorUnchanged`,
which preserves the group. Measured on a 182-slide deck: mean luminance on a
divider slide goes from 0.012 (broken) back to 0.068, matching the uncompressed
export and the live deck's 0.072. File size grows ~15%; downsampling is
unaffected.

Worth knowing if you export decks: this was invisible to any check that looked
only at the uncompressed decktape output, and the failure is silent — no
warning, no error, just darker slides.

## 2026-07-28 (v0.18.0)

### `astromotion-text`: export a deck's text as markdown

A second bin, for reading a deck away from the screen:

```sh
npx astromotion-text src/decks/week-3.deck.mdx
```

It writes `week-3.md` --- headings, prose, lists, code and tables, with the
visual layer stripped out. `@include` partials are spliced in the same way the
build does it, so the export is the whole deck rather than the deck file.
Images, backgrounds, QR codes and components leave a one-line marker
(`(background image: bg-title.avif)`) so an image-only slide doesn't print
blank; speaker notes and authoring comments become labelled blockquotes.
`--no-placeholders`, `--no-notes`, `--no-comments`, `--no-title` and `--stdout`
adjust that.

Unlike `astromotion-pdf` this runs straight on the source file: no build, no
preview server, no browser. `deckToMarkdown(deckPath, options)` is exported from
`astromotion/src/deck-text.mjs` for programmatic use.

## 2026-07-28 (v0.17.1)

> **Correction (v0.18.1).** This entry originally claimed to fix hero slides
> printing as a flat wash with their background artwork missing. It did not —
> the diagnosis was wrong. The culprit was the Ghostscript compression step, not
> Chrome's colour adjustment; see v0.18.1 for the actual fix. The measurement
> that produced the wrong conclusion compared a Ghostscript-compressed export
> against uncompressed test output, so the difference came from the compression
> rather than the CSS. Both scopings produce identical raw decktape output.

### `print-color-adjust` now applies in the decktape export path

`theme/print.css` applied `print-color-adjust: exact` only under
`html.reveal-print`, the class Reveal sets in its `?print-pdf` view. But
`astromotion-pdf`'s default path drives decktape, which prints the **ordinary**
deck view one slide at a time and never sets that class — so the rule never
applied there.

The rule is now scoped to `.reveal, .reveal *` and applies in both paths. This
is a correctness tidy-up rather than a fix for any observed symptom: measured on
a deck with a semi-transparent hero scrim over full-bleed backgrounds, raw
decktape output is identical either way. `print-color-adjust` is inert outside
paged contexts, so on-screen rendering is unchanged.

Also documented, in the script header and README: `--size` sets the browser
viewport, not the slide canvas — the canvas is fixed at 1280x720 and Reveal
scales it to fit, so a larger viewport does not sharpen the export (background
images embed at source resolution either way; measured identical at 1280x720 and
1920x1080). And a runaway-export note: the `generic` plugin stops when a frame
repeats, so any always-animating element — a timer, a live clock — makes every
frame differ and drives the export to `DECKTAPE_MAX_SLIDES` with hundreds of
duplicate trailing pages.

## 2026-07-25 (v0.17.0)

### Light or dark whiteboard, optionally on a background image

The whiteboard (press **W**) was always a pale board with near-black as the
opening pen colour. Themes can now flip it with `--astromotion-wb-mode: dark`: a
near-black surface, a pale default ink, and toolbar chrome inverted to match
(the mode is resolved at init and mirrored onto the overlay as `data-mode`,
since CSS can't branch on a custom property's value). Light stays the default,
so existing themes are untouched.

`--astromotion-wb-bg-image` prints an image over the board surface, sized like a
`cover` background — grid paper, a staff, a house-style backdrop. It's the
caller's job to supply artwork suited to the mode. The saved PNG composites the
image too, so a downloaded board matches the screen; a cross-origin image
without CORS headers is skipped rather than tainting the export. For an asset
beside your theme file, set `background-image` on `.astromotion-whiteboard`
directly instead — a relative `url()` inside a custom property resolves against
where the `var()` is used, not where it's declared, which lightningcss rejects
as ambiguous.

Internal: `INK_PALETTE` became `INK_PALETTES` (a light/dark pair) and
`resolveInkPalette` takes the mode as a second argument, defaulting to light.
Both are `src/whiteboard/core.ts` internals rather than package exports.

## 2026-07-23 (v0.16.2)

### Internal: one engine for the single-directive plugins

`remarkDeckClasses`, `remarkDeckConditionals`, `remarkDeckIds`,
`remarkDeckAnimate` and `remarkDeckNotes` were five copies of the same
walk-sections/extract-directive/apply loop. They now share a
`sectionDirective(parse, apply)` helper; every named export (and its behaviour)
is unchanged.

## 2026-07-23 (v0.16.1)

### Deck bg images respect the site's base path

`![bg](./assets/x.avif)` backgrounds were rewritten to root-absolute
`/src/decks/...` URLs with no base prefix, so on a site deployed under a subpath
(`base: "/courses/x"`) every deck background 404'd — the exact failure the deck
`<head>` URL helpers already guard against. The integration now records
`config.base` at setup and the bg plugin prefixes rewritten URLs with it. The
base-path build fixture gained a real `![bg]` image, and its every-internal-URL
assertion now also reads `url(...)` refs out of inline styles, so a regression
here fails the suite.

### Clearer failures for broken `@include` graphs

An `@include` cycle used to recurse to the depth cap and silently truncate the
deck; it now fails the build with the full chain (`@include cycle: a → b → a`).
A missing include file surfaced as a bare `ENOENT`; it now names the include
path and the file that requested it. Nesting deeper than the cap is an error
instead of a silent stop.

### Sundry robustness

- `.slide-bg` and `.split-image` set `background-repeat: no-repeat`, so
  `![bg contain]` images no longer tile (previously worked around in consumer
  deck themes).
- the deck asset copier skips all `.md`/`.mdx`/`.svx`/`.svelte`/`.css` sources
  (not just `.deck.*`), so an `@include` partial or component beside the decks
  is no longer published verbatim into `dist/`.
- asset-copy errors other than a missing `src/decks/` directory now fail the
  build instead of being silently swallowed.
- the deck favicon `<link>` only claims `type="image/svg+xml"` for actual `.svg`
  paths.
- dropped three unused runtime dependencies (`remark-rehype`,
  `rehype-stringify`, `@shikijs/rehype`); added a `typecheck` script (and a
  tsconfig that can actually run it) covering `src/`, `plugins/` and `index.ts`.

## 2026-07-22

### Presenter clock on `T`

Press **T** in a deck for a small 24-hour `HH:MM` clock in the bottom-right
corner, and **T** again to hide it; the binding is registered with Reveal, so it
shows up on the help overlay alongside **W** for the whiteboard.

Presenting on one screen (or mirrored to a projector) means Reveal's speaker
view --- which carries the only clock in the stack --- isn't visible, leaving
nowhere to check the time without reaching for a phone. The overlay is sized in
viewport pixels outside the scaled slide canvas, so it stays discreet on any
display, and it renders hours and minutes only: seconds tick distractingly in
the audience's peripheral vision, and "am I running late" is a minute-grained
question. It starts hidden, so decks read on the web and PDF exports are
unaffected unless the presenter asks for it.

Themes restyle it through `--astromotion-clock-bg`, `--astromotion-clock-color`,
`--astromotion-clock-opacity`, `--astromotion-clock-radius`,
`--astromotion-clock-font-family` and `--astromotion-clock-font-size`.

## 2026-07-21

### `_id` directive: named links between slides

New `{/* _id: name */}` directive puts an `id` on the enclosing slide, which is
what Reveal.js needs to resolve a named link: `<a href="#/name">` now navigates
to that slide from anywhere in the deck (or from outside it), and the URL reads
`#/name` instead of a slide number while it's on screen.

The motivating case is a running-order slide whose entries jump to the section
they name --- previously the only way to link a specific slide was its index,
which shifts whenever a slide is added ahead of it.

## 2026-07-20

### `published: false` drops a deck from production builds

A deck whose frontmatter carries `published: false` is now omitted from the
injected `/decks/[...slug]` routes in a production build (`astro build`): no
route is generated, so no HTML lands in `dist/` and there is nothing for
Pagefind or a crawler to find at its URL. The dev server still serves it
(`import.meta.env.PROD` is false under `astro dev`), so work-in-progress decks
stay previewable locally.

Previously astromotion globbed every `*.deck.mdx` off disk regardless of
frontmatter, so a consumer's content-collection `published` flag governed
listings and graph membership but not whether the deck page itself was emitted —
an unpublished deck still built and was searchable. The check is a strict
`=== false`, so an absent or `true` flag stays published as before; nothing
changes for decks that don't set it.

## 2026-07-16

### Print view: full-page notes, no filler pages

Two cosmetic fixes to the `?print-pdf` view (and therefore to
`astromotion-pdf --notes` output):

- separate-page speaker notes now fill their printed page (`min-height` matching
  the fixed canvas) instead of leaving the deck background showing below a
  content-height white strip
- decks now set `pdfMaxPagesPerSlide: 1` --- the canvas is fixed at 1280x720, so
  scrollHeight overflow is always decorative (glows, full-bleed backgrounds) and
  used to mint background-only filler pages after affected slides

### `astromotion-pdf --notes`: presenter-guide export

New `--notes` flag on `astromotion-pdf` exports a presenter guide: each slide
followed by a page of its speaker notes, ready to hand to whoever's delivering
the deck. decktape can't produce notes pages (it screenshots slides one at a
time), so this mode instead prints Reveal's `?print-pdf&showNotes=separate-page`
view with headless Chrome via [puppeteer-core](https://pptr.dev) --- a new
**optional** peer dependency, needed only for `--notes` --- passing
`preferCSSPageSize: true` so the page size comes from Reveal's
`@page { size: 1280px 720px }` declaration rather than drifting across A4/letter
paper. Ghostscript compression applies as in the default mode; output defaults
to `<slug>-notes.pdf`.

### Print view support (`?print-pdf`)

Reveal's print/PDF-export view (`?print-pdf`, optionally with
`&showNotes=separate-page` for interleaved speaker-notes pages) previously
rendered astromotion decks as an unreadable mess: Reveal's print CSS forces
every section to `display: block !important`, collapsing the grid-based slide
layout, and separate-page speaker notes inherit the theme's light text colour on
a transparent (i.e. white, on paper) background.

A new `theme/print.css` (loaded by `DeckLayout`) restores the fixed 1280x720
canvas in print view, styles separate-page notes dark-on-white, hides the
whiteboard, and adds the unprefixed `print-color-adjust: exact` that Firefox
needs to keep slide background colours. For correctly-paged output, print with
the page size taken from CSS (e.g. Playwright's `preferCSSPageSize: true`) ---
Reveal declares `@page { size: 1280px 720px }` and browser-default A4/letter
paper drifts the page breaks.

Also fixes two `oxlint` errors in `scripts/deck-pdf.mjs` (mutating
`sort`/`reverse` on the puppeteer cache listing).

## 2026-07-15

### `astromotion-pdf`: hardened PDF export, now an actual bin

`scripts/deck-pdf.mjs` claimed a `npx astromotion-pdf` usage line but
`package.json` had no `bin` entry, so the command never existed --- you had to
invoke the script by its `node_modules` path. It's now wired up as a real bin
(`npx astromotion-pdf <slug> [output.pdf]`).

The script also absorbs the hardening the llms-unplugged site had accreted in
its local copy, plus two flags the old hardcoded URL made necessary:

- **Chrome discovery.** puppeteer's on-demand Chromium download fails hard (and
  silently, under npx) when its cache holds a half-written entry. The script now
  looks for a system Chrome/Chromium in the usual macOS and Linux locations
  (after the existing `DECKTAPE_CHROME_PATH` override) and passes it via
  `--chrome-path` with `PUPPETEER_SKIP_DOWNLOAD=1`; decktape's bundled Chromium
  remains the fallback on browserless machines.
- **Capture retry.** decktape intermittently dies mid-capture with "Attempted to
  use detached Frame" (a timing bug in its progress-bar code); the capture now
  retries up to 3 times.
- **Ghostscript compression, on by default.** The raw capture rasterises every
  slide (full-bleed decks land at 100 MB+); `gs -dPDFSETTINGS=/ebook` cuts that
  to a few MB. `--no-compress` opts out; a missing `gs` degrades to the raw PDF
  with a warning.
- **`--prefix` and `--port` flags.** Sites that remount the deck route (e.g.
  under `/lectures/`) or preview on a non-default port could not use the script
  at all; both are now flags, defaulting to `/decks` and `4321`.
- **Pinned decktape.** `npx --yes decktape@3.16.1` instead of a bare
  `npx decktape` (which prompts interactively, or fails in CI, when decktape
  isn't installed); override with `DECKTAPE_VERSION`.
- The script now exits with a clear error if the preview server never becomes
  ready, instead of letting decktape fail obscurely.

The README's hand-invocation example also switched from the `reveal` plugin
(which can't drive astromotion decks --- reveal.js 6 is an ES module and never
lands on `window`) to the `generic` plugin the script itself uses.

## 2026-07-10 (later)

### Breaking: the `astromotion-decks` skill no longer ships from this repo

`.claude/skills/` and `.claude-plugin/` are gone. The skill now lives in the
`ben` personal plugin (`benswift/claude-plugin-personal`), which tracks its
default branch.

It shipped here so it would stay tagged in lockstep with the deck syntax it
documents. That lock was never real: Claude Code resolves the skill through a
single marketplace `ref` in `settings.json`, so every consumer loads whatever
tag that ref names, regardless of which astromotion version its `package.json`
pins. What the arrangement did produce was a release, a tag, a consumer
propagation pass and a plugin re-clone every time a sentence of documentation
changed --- see the entry below, which cost exactly that.

Nothing in the package's runtime, build output or API surface changes. If you
subscribed to this repo as a Claude Code marketplace, drop the entry:

```jsonc
// settings.json
"extraKnownMarketplaces": { "astromotion": { ... } },  // remove
"enabledPlugins": { "astromotion@astromotion": true }, // remove
```

Consumers pinning `#v0.10.1` need not bump for this release; the tag matters
only if you want the removal reflected in your lockfile.

## 2026-07-10

### `astromotion-decks` no longer restates `styled-image-gen`'s defaults

The skill's "Generating background images" section claimed `--resolution 4K` was
the script's default (it is 2K), and documented a per-deck `image-style.txt`
style override that nothing in this repo reads and no consumer has ever created.
Both were duplicated surface that had drifted from the tool they described.

The section now covers only what is deck-specific --- writing into the deck's
`assets/`, the portrait ratios split layouts want, and the recraft/SVG case ---
and defers the workflow, model choice and defaults to `styled-image-gen`.

Skill-only change: no runtime, build or API surface is affected.
`.claude-plugin/plugin.json` was also stranded at 0.9.1 and is now back in step
with the package version.

## 2026-07-09

### Breaking: deck `<head>` assets are opt-in, and base-path aware

`DeckHead` hardcoded `<link rel="icon" href="/favicon.svg">` and defaulted
`og:image` to `/og-image.svg`. Both were root-absolute, so on a site deployed
under a `base` path they addressed the server root rather than the site; and
both pointed at files a consumer need never have created. Every deck consumer
was shipping a dangling `og:image`.

Deck pages are injected routes, so no consumer layout could correct this.
`favicon` and `ogImage` are now integration options, resolved against the site's
`base`, and **nothing is emitted when they are unset**. A deck's `image:`
frontmatter still overrides `ogImage`.

To keep a favicon on your decks, pass it explicitly:

```js
astromotion({ favicon: "/favicon.svg" });
```

A build-time test now builds a fixture under `base: "/test-base"` and asserts
every internal URL in the deck head carries the prefix. The class of bug is
invisible to `astro-broken-links-checker`, which resolves prefixed and
unprefixed paths to the same file.

## 2026-07-03

### Tweak: bigger whiteboard brushes (12px and 36px)

The two brush sizes are now 12px fine and 36px broad (were 8px and 16px), so the
broad marker reads as a proper highlighter at projection distance. The toolbar
dots render at half the on-canvas diameter so the broad dot still fits inside
its chip.

### Feature: two whiteboard brush sizes (fine and broad)

The whiteboard now has two brush sizes --- fine (8px) for writing and broad
(16px) for highlighting --- selected with the first two digit keys after the
colour palette (so with the default four-ink palette, `1`--`4` switch colour and
`5`--`6` switch size) or by clicking the new toolbar buttons, which show each
brush's actual on-canvas dot. Like colour, the size is fixed per stroke at
pointerdown and survives toggling the board closed. Reserving two digits for the
brushes caps the ink palette at seven colours (was nine); no known theme defines
more than five.

### Feature: ephemeral whiteboard mode (press W)

Pressing `W` in a deck flips to a fullscreen whiteboard for ephemeral doodles
--- listed on Reveal's help overlay, closed with `W`/`Escape`. Strokes render
via perfect-freehand (the tldraw ink engine) so they get variable-width
pen-physics ink: real stylus pressure when a pen is detected, simulated from
drawing velocity for mouse and trackpad, with coalesced pointer events for
smooth fast strokes. While open, the board claims every unmodified key ---
digits switch colour, `Z` undoes, `C` clears, `D` downloads the board as a
timestamped PNG --- so the deck never navigates underneath; modified keys pass
through to the browser. The drawing survives toggling back to the slides (only
`C` clears it) but lives in memory only --- a reload discards it. Themes can
restyle via two custom properties: `--astromotion-wb-bg` sets the board surface,
and `--astromotion-wb-inks` is a comma-separated colour list (one to nine inks,
split on top-level commas so legacy `rgb(r, g, b)` works) that replaces the
built-in four-colour palette. Adds the `perfect-freehand` dependency (tiny,
zero-dep) and pure-function state/geometry modules with unit tests.

### Feature: the astromotion-decks authoring skill now ships from this repo

The repo doubles as a Claude Code plugin marketplace (`.claude-plugin/`) serving
the `astromotion-decks` skill from `.claude/skills/`, so the skill's canonical
home versions with the package it documents. Subscribe with
`claude plugin marketplace add ANUcybernetics/astromotion` (pin a release with
`@vX.Y.Z`), then `claude plugin install astromotion@astromotion`. The plugin
version in `.claude-plugin/plugin.json` tracks the package version.

## 2026-06-30

### Feature: keep the display awake while presenting fullscreen

Laptops dim and sleep the screen on an idle timer, and a presentation runs for
minutes at a time with no pointer or keyboard activity --- so the display would
sleep mid-slide. The deck route now uses the Screen Wake Lock API to hold the
display on while the deck is fullscreen, re-acquiring the lock when the page
returns to the foreground (the browser releases it automatically when the tab is
hidden). The lock is scoped to fullscreen because that's when a deck is actually
being shown, and because entering fullscreen is the user gesture the API needs
to grant the request. Best-effort: unsupported browsers and rejected requests
fall back to the OS idle behaviour. No deck content or syntax changes.

## 2026-06-23

### Breaking: require Astro 7 and @astrojs/mdx 7

Peer dependencies now require `astro@^7` and `@astrojs/mdx@^7` (previously
`astro@^6` and `@astrojs/mdx@^5 || ^6`). Astro 7 ships Vite 8 (Rolldown), a Rust
compiler, and Sätteri as the default Markdown processor. The deck engine itself
is unchanged --- it builds its own standalone `unified()` pipeline and only
imports types from Astro --- so no deck content or syntax changes are required.
Consumers must move to Astro 7 in lockstep.

## 2026-06-11

### Feature: speaker notes now show in the Reveal.js speaker view

`{/* notes: ... */}` directives were emitted as `<div class="notes">`, but the
deck route registered no Reveal plugins, so pressing **S** opened nothing and
the notes (hidden by consuming themes) surfaced nowhere. The route now registers
Reveal's notes plugin, and `remarkDeckNotes` emits
`<aside class="notes" aria-hidden="true">` --- the element the plugin reads ---
so the speaker view (current slide, next slide, notes, timer) works. Reveal core
CSS hides `aside.notes` (`display:none`) so the audience never sees it, and
`aria-hidden` keeps the presenter-only aside from registering as a complementary
landmark in static a11y scans (which don't apply reveal's CSS). HTML in the
notes body is preserved.

## 2026-06-10

### Fix: deck partial edits now show up in the dev server

Editing an `@include` partial sent a full-reload but the browser came back with
stale content: the dev server's compiled parent `.deck.mdx` module was never
invalidated, so the reload re-served the output compiled before the edit.
`astromotion:watch-includes` now calls `moduleGraph.onFileChange()` for every
deck whose (transitive) include set contains the changed file before sending the
full-reload, so a partial edit behaves like an edit to the deck itself. Verified
against astro 6.4.4 / @astrojs/mdx 6.0.2 in llms-unplugged.

## 2026-06-05

### Fix: inline `![bg right:40%]` split lost when remark-directive is enabled

Consumers that register `remark-directive` (e.g. astro-theme-anu, for `:::`
callout containers) broke inline split backgrounds. Its micromark extension
parses the `:40` in an inline `![bg right:40%]` as a `:40` text directive and
drops it, so the alt reached `remarkDeckBg` as `bg right%` and the slide
silently rendered fullscreen instead of a 40% split (`blur:`/`brightness:`/
`saturate:` filter modifiers were mangled the same way). `@include` partials
were unaffected because `remarkDeckIncludes` parses them with its own processor
that has no `remark-directive` --- which is why split backgrounds only worked
from partials, not the main deck. `remarkDeckIncludes` now strips source
positions from spliced `@include` nodes (their offsets referenced the partial,
not the deck), and `remarkDeckBg` re-reads an inline image's alt from the raw
deck source (`file.value`) via its source offset --- only for genuine inline
images, which are the ones that still carry a position. Inline and included
split backgrounds now behave identically.

## 2026-06-03

### `_if` directive for query-param-gated slides

New `{/* _if: name */}` slide directive sets `data-deck-if="name"` on the
enclosing `<section>`. The deck's Reveal bootstrap removes any such slide whose
query param is absent from the deck URL before `deck.initialize()` runs, so
slide indices and `#/` hashes count only the slides that survive. A slide tagged
`{/* _if: presenters */}` is hidden by default and appears only when the URL
carries `?presenters`. Handled by a new `remarkDeckConditionals` plugin, slotted
into `deckRemarkPlugins` after `remarkDeckClasses`.

## 2026-05-30

### `_animate` directive for Reveal.js auto-animate

New `{/* _animate */}` slide directive (plus `{/* _animate: id */}`) sets
`data-auto-animate` (and `data-auto-animate-id`) on the enclosing `<section>`,
so adjacent slides that both carry it smoothly tween matching elements via
Reveal.js [auto-animate](https://revealjs.com/auto-animate/). Elements match by
`data-id` (authored in your markup/components) or, for headings and paragraphs,
by text content. Ids scope independent sequences: only slides whose ids match
animate across their shared boundary. Handled by a new `remarkDeckAnimate`
plugin, slotted into `deckRemarkPlugins` after `remarkDeckClasses`.

### **Breaking:** deck remark plugins are no longer auto-registered

The integration no longer registers `deckRemarkPlugins` on Astro's global
`markdown.remarkPlugins`. Astro 6.4's `markdown.processor` is a single value
that can't be co-owned by multiple integrations, and the old top-level
`markdown.remarkPlugins` API is deprecated (removed in Astro 8).

Consumers must now wire the exported `deckRemarkPlugins` into their own markdown
processor: with astro-theme-anu,
`anuTheme({ extraRemarkPlugins: deckRemarkPlugins })`; standalone,
`markdown: { processor: unified({ remarkPlugins: deckRemarkPlugins }) }`
(`unified` from `@astrojs/markdown-remark`). The plugins still self-gate on
`.deck.mdx`, so they no-op on regular content.

## 2026-05-23

### **Breaking:** `codeTheme` removed, replaced by `shikiConfig`

The `codeTheme: ShikiConfig["theme"]` option only accepted a single theme, but
the README documented passing a dual-theme `{ themes, defaultColor }` object —
which silently bypassed the type. Replaced with `shikiConfig: ShikiConfig`
accepting the full Astro shiki shape (single `theme` or dual `themes` with
optional `defaultColor`).

Migration: rename `codeTheme: "<name>"` → `shikiConfig: { theme: "<name>" }`.

### Plugins registered via global markdown config

`deckRemarkPlugins` now goes onto Astro's global `markdown.remarkPlugins`, which
`@astrojs/mdx` inherits by default (`extendMarkdownConfig: true`). Previously
astromotion only attached the plugins when it owned the mdx integration; when a
theme registered mdx first, the deck plugins silently fell off and decks
rendered as plain MDX (no `<section>` wrapping, `@include` directives ignored).
Each plugin still gates itself on `endsWith(".deck.mdx")` so the change is a
no-op for regular `.md` / `.mdx` files.

### `@include` strips yaml frontmatter

When `{/* @include ./topic.mdx */}` splices an included file's content into a
deck, YAML and TOML frontmatter on the included file are now removed
automatically. This lets a single `.mdx` file double as a standalone Astro
content entry (with frontmatter) and as a deck slide partial.

## 2026-05-12

### `@include` supports bare module specifiers

`{/* @include ... */}` now accepts bare module specifiers in addition to
relative/absolute paths --- e.g.
`{/* @include astro-theme-anu/partials/foo.mdx */}` goes through Node's package
resolution starting from the requesting deck file. The watch plugin follows the
same rule, so HMR still wires up hot-reload on partial edits. Existing relative
paths (`./`, `../`, `/`) behave exactly as before.

## 2026-05-09

### Refresh dependencies

Bumped all dependencies to latest, notably `reveal.js` 5.2 → 6.0 (matches what
consumers like llms-unplugged were already pinning) and `@shikijs/rehype` 3 → 4.
Also added the previously missing `remark-smartypants` direct dep that the
plugin pipeline test was importing.

Reveal 6 dropped the `dist/` segment from its package exports, so the CSS
imports in `DeckLayout.astro` and `theme/default.css` were updated from
`reveal.js/dist/reveal.css` → `reveal.js/reveal.css` and similarly for the black
theme.

### Disable Reveal.js scroll view on narrow viewports

Reveal 6 ships `scrollActivationWidth: 435`, which silently switches decks into
a vertical-scroll layout (slides stacked at near-1:1, no scaling) on viewports
≤435px wide. That broke the assumed invariant that decks always render onto the
fixed 1280×720 canvas scaled to fit. The deck route now sets
`scrollActivationWidth: null`, so portrait mobile viewports get the same scaled
16:9 layout as desktop --- just smaller.

## 2026-05-08

### Track `@include` partials as Vite watch dependencies

A new dev-only Vite plugin (`astromotion:watch-includes`) scans each `.deck.mdx`
source on transform, walks nested includes up to `MAX_DEPTH = 10`, registers
each resolved partial with Vite's file watcher, and sends a `full-reload` over
the dev WebSocket when a tracked partial changes. Production builds are
unaffected --- this is purely a dev-server ergonomics change.

Note: in environments where Astro's MDX dev pipeline caches rendered deck
output, a content refresh may still require a manual server restart. The
watch-file registration and reload signal are correct; downstream effectiveness
depends on how Astro invalidates its module/page caches in your version.

## 2026-05-06

### `fontVariables` option for the Astro 6 fonts API

`astromotion()` now accepts a `fontVariables: string[]` option whose entries are
`cssVariable` names from Astro's top-level `fonts` config. For each variable,
astromotion injects `<Font cssVariable={v} preload />` into the deck `<head>`
--- giving decks self-hosted fonts with automatic preloading, subsetting, and
`font-fallback` metrics.

```ts
import { fontProviders } from "astro/config";

defineConfig({
  fonts: [
    {
      provider: fontProviders.google(),
      name: "Public Sans",
      cssVariable: "--font-public-sans",
    },
  ],
  integrations: [
    astromotion({
      theme: "./src/decks/theme.css",
      fontVariables: ["--font-public-sans"],
    }),
  ],
});
```

Consuming themes can reference the variable directly
(`var(--font-public-sans, "Public Sans")`) or rely on the `@font-face` rule
emitted by `<Font>` to register the family by its plain name.

## 2026-05-05

### Breaking: unified `.deck.mdx` format

`.deck.md` and `.deck.svelte` paths are removed. Decks are now authored as
`.deck.mdx` files processed by Astro's MDX integration with a set of custom
remark plugins (lifted from the previous bespoke pipeline).

**Why:** the previous split forced authors to choose between server-rendered
markdown (`.deck.md`, no components) and client-only Svelte (`.deck.svelte`,
full Svelte runtime, no SSR). The new format gives islands-style hydration: SSR
by default, per-component opt-in to client-side hydration via Astro's `client:*`
directives.

**Migration:** Rename `*.deck.md` and `*.deck.svelte` → `*.deck.mdx`. For files
that had a `<script lang="ts">` block, lift its contents to top-level MDX
`import` and `export const` statements (drop the `<script>` wrapper).

Convert directive syntax from HTML comments to MDX expression syntax:
`<!-- @include ./path -->` → `{/* @include ./path.mdx */}`,
`<!-- _class: name -->` → `{/* _class: name */}`, `<!-- notes: ... -->` →
`{/* notes: ... */}`. The bg image syntax (`![bg ...](url)`), QR images
(`![qr](url)`), and slide separators (`---`) are unchanged.

`@astrojs/svelte` is no longer a peer dependency. `@astrojs/mdx` is now
required.

## 2026-04-29

### Slides now render onto a fixed 1280×720 canvas

Reveal.js's `disableLayout: true` flag has been dropped from both the `.deck.md`
catch-all route and the `.deck.svelte` preprocessor. With layout enabled, Reveal
renders slides at the configured 1280×720 canvas and applies a
`transform: scale()` to fit the viewport, so a deck looks pixel-identical at any
resolution from a thumbnail up to 4K.

`maxScale: 4` was added alongside the flip to lift Reveal's default 2.0 scale
cap, which would otherwise letterbox 4K monitors (3.0× scale needed). The
`display: "grid"` Reveal option remains, so consuming themes can keep using
`place-content: center` on sections.

**Behaviour change for authors:** the slide canvas was previously viewport-sized
(e.g. 1920×1080 on a full-HD monitor); it is now a fixed 1280×720. Decks
authored to fit a stretched viewport may need their content trimmed to fit a
720-tall canvas. Typical content sizes in the `astro-theme-anu` deck.css fit
comfortably; very dense slides should be spot-checked.

**No theme-CSS changes required.** Consuming themes' rem/px sizing, padding,
`place-content` rules, absolute positioning, and split/QR layouts all work the
same way against a fixed canvas as they did against a viewport-sized one.

## 2026-04-09

### Image resolution rewritten --- relative paths only

The image handling pipeline has been rewritten to use the remark AST instead of
regex-based HTML string parsing.

**Breaking: absolute image paths are no longer resolved.** Paths like
`/assets/photo.jpg` in deck markdown are passed through as-is and will 404 on
subpath deployments. Use relative paths (`./assets/photo.jpg`) instead --- these
are resolved correctly for both the Vite plugin path (via ES module imports) and
the static HTML path (via `resolveImageUrl`).

**`processDeckMarkdown` accepts a `base` option.** The catch-all
`[...slug].astro` page passes `import.meta.env.BASE_URL` so that resolved
relative paths include the deployment base path in the generated HTML. This only
affects the static HTML path --- the Vite plugin path uses imports which Vite
resolves natively.

**Migration:** change any `/assets/...` or `/images/...` paths in deck files to
`./assets/...`. Background images (`![bg](...)`) and inline images (`![](...)`)
both need relative paths. The build will fail visibly if an image path can't be
resolved, which is the intended behaviour.

### Internal changes

- `resolveAstImageUrls`: walks mdast to resolve relative image URLs in-place
  (replaces `resolveInlineImgSrcs`)
- `collectAstImageImports`: walks mdast to collect relative URLs into the import
  map with placeholder tokens (replaces `replaceRelativeImgSrcs`)
- `htmlToSegments`: splits stringified HTML on placeholders into segments
  (replaces regex-based `findRelativeImgSrcs` usage in vite-plugin.ts)
- `findRelativeImgSrcs` removed from vite-plugin.ts imports (still used by the
  Svelte preprocessor)

## 2026-04-08

- `.svx` extension support for deck files
- add oxlint, oxfmt, and stylelint configs
- replace regex parsing with structured helpers in parse-helpers.ts

## 2026-04-07

- `@layer astromotion` wraps `--r-*` variable mappings in base.css
- remove built-in logo slide generation --- consumers provide their own logo
  content and CSS
- keep `<style>` blocks inline for `.deck.md` files (previously extracted)
- resolve `@include` directives at text level before parsing

## 2026-04-06

- `preprocess` option: transform raw deck markdown before slide processing
- `preprocessModule` support for passing preprocessors via virtual module

## 2026-04-03

- remove Animotion dependency, use Reveal.js directly (no Svelte runtime for
  `.deck.md` files)
- configurable Shiki code theme (default: `vitesse-dark`)

## 2026-04-01

- remove Tailwind CSS dependency
- configurable code block theme

## 2026-03-18

- vitest test suite
- `@include` directive for composing decks from separate files

## 2026-03-17

- rename `.deck.svelte` to `.deck.svx`
- support top-level deck files (not just subdirectories)

## 2026-03-11

- structural base.css split from visual theme
- edge-to-edge slides (`margin: 0`), linear navigation, hash-based URLs
- `disableLayout: true` + `display: grid` for CSS-based centering

## 2026-03-11

Initial package.
