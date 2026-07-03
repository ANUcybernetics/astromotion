# astromotion

Astro integration for markdown-authored slide decks powered by Reveal.js.
Consumed as a package by Astro sites --- not a standalone app.

## Commands

- `pnpm test` --- vitest
- `scripts/release.sh <patch|minor|major|x.y.z> [reason]` --- bump version,
  commit, annotated-tag `vX.Y.Z`, push. Refuses if dirty / off main / out of
  sync. See the anu-theme-sync skill for when to release.

## Architecture

The integration (`index.ts`) registers `@astrojs/mdx`, aliases theme CSS via a
virtual module, and injects a catch-all deck route. The eight custom remark
plugins are exported as `deckRemarkPlugins` for consumers to wire into their own
markdown processor (see the breaking-change note in CHANGELOG).

### .deck.mdx format

Decks are authored as `.deck.mdx` files. Astro's MDX integration processes them
through the standard remark/rehype pipeline, plus the eight custom remark
plugins (in `plugins/`). The result is an Astro component whose default export
is the slide content.

**Plugin order matters** (each runs in sequence on the remark AST):

1. `remarkDeckIncludes` --- resolves `{/* @include ./path.mdx */}` directives by
   splicing the included AST in-place (must run first so later plugins see the
   full content). Accepts both relative paths and bare module specifiers (e.g.
   `astro-theme-anu/partials/foo.mdx`), the latter resolved via Node's package
   resolution starting from the requesting file. YAML/TOML frontmatter on the
   included file is stripped automatically, so partials can double as standalone
   Astro content with frontmatter.
2. `remarkDeckSections` --- wraps content between `---` thematic breaks in
   `<section>` elements
3. `remarkDeckClasses` --- converts `{/* _class: name */}` expressions to
   `class` attributes on the enclosing section
4. `remarkDeckAnimate` --- converts `{/* _animate */}` (and
   `{/* _animate: id */}`) expressions to `data-auto-animate` (and
   `data-auto-animate-id`) attributes on the enclosing section, enabling
   Reveal.js auto-animate between adjacent slides
5. `remarkDeckNotes` --- converts `{/* notes: ...HTML... */}` expressions to
   `<aside class="notes">` elements inside the section (the element Reveal's
   notes plugin reads for the speaker view)
6. `remarkDeckQr` --- converts `![qr](url)` images to inline SVG QR codes
7. `remarkDeckBg` --- converts `![bg ...](url)` images to background elements
   and split layouts
8. `remarkDeckSmartypants` --- applies oldschool smartypants (curly quotes, em
   dashes) to slide text, including content spliced in by `@include`

Each plugin gates itself with `if (!file.path?.endsWith('.deck.mdx')) return` so
it silently ignores non-deck MDX files.

### Components

Any framework Astro supports (Svelte, React, Vue, Solid, etc.) can be imported
at the top of a `.deck.mdx` file and used directly in slide content. Hydration
is opt-in per component via Astro's `client:*` directives (`client:load`,
`client:visible`, `client:only`, etc.). Slides without interactive components
render as zero-JS server-rendered HTML.

### Catch-all route

`pages/[...slug].astro` uses `import.meta.glob({ eager: true })` to enumerate
all `*.deck.mdx` files at build time and generate one static path per deck. Each
path receives the deck's default export (`Content`) and frontmatter as props.
Reveal.js is initialised inline in the route's `<script>` tag.

### Directive syntax

MDX does not support HTML comments (`<!-- -->`). Directives use MDX expression
comment syntax instead:

| Directive     | Syntax                                                          |
| ------------- | --------------------------------------------------------------- |
| Include       | `{/* @include ./path.mdx */}` or `{/* @include pkg/foo.mdx */}` |
| Slide class   | `{/* _class: name */}`                                          |
| Speaker notes | `{/* notes: ...HTML body... */}`                                |

Background images (`![bg ...](url)`), QR images (`![qr](url)`), and slide
separators (`---`) are unchanged from the previous format.

## Image paths

Deck images must use relative paths (e.g. `./assets/photo.jpg`). Relative paths
are resolved at build time via Astro's asset pipeline. Absolute paths
(`/images/...`) are passed through unmodified and will 404 on subpath
deployments --- this is intentional to fail early rather than mask content bugs.

## Key design decisions

- Slides render onto a fixed 1280×720 canvas, scaled to fit the viewport via
  Reveal.js's built-in `transform: scale()` layout. `maxScale: 4` lifts Reveal's
  default 2.0 cap so 4K monitors fill rather than letterbox. Slides look
  pixel-identical at any viewport because the rem/px units are anchored to the
  canvas, not the viewport.
- `display: "grid"` in Reveal.js options + matching `display: grid` in
  `theme/base.css` so consuming themes can use `place-content: center` on
  sections (Reveal sets `display` inline on the active section, so the config
  option is what propagates `grid` rather than the default `block`).
- Speaker notes render as `<aside class="notes" aria-hidden="true">` and the
  deck route registers Reveal's notes plugin, so the speaker view (press **S**)
  shows them. Reveal core CSS hides `aside.notes` (`display:none`) so the
  audience never sees it; `aria-hidden` keeps the presenter-only aside from
  registering as a complementary landmark in static a11y scans (which don't
  apply reveal's CSS, so they'd otherwise treat the aside as a visible landmark
  nested inside `<main>`).
- Deck pages must not use Astro's `<ClientRouter />` (conflicts with Reveal.js
  keyboard navigation).
- The ephemeral whiteboard (press **W**) splits into pure state/geometry modules
  (`src/whiteboard/core.ts`, `src/whiteboard/outline.ts` --- unit tested, no
  DOM) and a thin overlay controller (`src/whiteboard/index.ts`). Opening goes
  through Reveal's `addKeyBinding` so it appears on the help overlay; while
  open, a capture-phase keydown listener claims all unmodified keys so Reveal
  never navigates underneath. Strokes are perfect-freehand outlines filled on a
  canvas; the drawing survives toggling (only `C` clears) but lives in memory
  only, and `D` downloads it as a timestamped PNG. Themes define the ink palette
  as a consecutive run of `--astromotion-wb-ink-<n>` custom properties (up to
  nine).

## Theming

`theme/base.css` is always imported and provides two things: unlayered
structural CSS (backgrounds, splits, QR codes) and an `@layer astromotion` block
that maps `--r-*` CSS variables to `.reveal` and `.reveal .slides section`
properties (fonts, colours, heading sizes, links, code, Shiki highlighting).

Consuming themes only need to set `--r-*` variables in `:root`; the layer
handles mapping them to elements. For ANU-specific overrides (e.g. gold
background on h1), the consuming theme adds unlayered rules which automatically
win.

The consuming project provides visual theme CSS via the integration's `theme`
option.

## Fonts (Astro fonts API)

`fontVariables: string[]` lets consumers wire decks into Astro's top-level
`fonts` config without editing astromotion components. Each entry is a
`cssVariable` name; astromotion exposes the array as `virtual:astromotion/fonts`
and `DeckHead.astro` renders `<Font cssVariable={v} preload />` for each. Fonts
must still be declared in `astro.config`'s `fonts` array --- this option is only
the bridge between that config and the deck `<head>`.
