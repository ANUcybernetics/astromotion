# astromotion

Astro integration for markdown-authored slide decks powered by Reveal.js.
Consumed as a package by Astro sites --- not a standalone app.

The README is the reference for deck-authoring syntax and consumer options; keep
it in step when you change a plugin or an option.

## Commands

- `pnpm test` --- vitest
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check` --- the rest of what CI
  runs (`.github/workflows/ci.yml`)
- `scripts/release.sh <patch|minor|major|x.y.z> [reason]` --- bump version,
  commit, annotated-tag `vX.Y.Z`, push. Refuses if dirty / off main / out of
  sync. See the anu-theme-sync skill for when to release.

## Architecture

The integration (`index.ts`) registers `@astrojs/mdx`, aliases theme CSS via a
virtual module, and injects a catch-all deck route. The twelve remark plugins in
`plugins/` are also exported as `deckRemarkPlugins`, for consumers who manage
`@astrojs/mdx` themselves.

### .deck.mdx format

`plugins/index.ts` holds the canonical plugin order, and that order is
load-bearing: `remarkDeckIncludes` splices partials in place so everything after
it sees the whole deck, and `remarkDeckSections` builds the sections that the
class, id, conditional and animate plugins annotate.

Each plugin gates itself with `if (!file.path?.endsWith('.deck.mdx')) return` so
it ignores non-deck MDX. A new plugin must do the same.

Every directive is a **single-line** `{/* … */}` comment, and a multi-line one
is a build error --- prettier's markdown printer (and oxfmt with it) escapes the
`*` inside one, turning a valid deck into invalid MDX, and the corrupted output
is a fixed point, so `--check` can't detect it either. Prose about a slide goes
in a ` ```notes ` or ` ```comment ` fence instead: fence contents are never
reflowed, at any `proseWrap` setting, and `test/format-stability.test.ts` is the
guard on that.

### Catch-all route

`pages/[...slug].astro` enumerates `*.deck.mdx` with
`import.meta.glob({ eager: true })` to generate one static path per deck, and
initialises Reveal.js inline in the route's `<script>`.

### Bins (`scripts/`)

The three bins --- `astromotion-check` (`scripts/deck-check.mjs`),
`astromotion-pdf` (`scripts/deck-pdf.mjs`) and `astromotion-text`
(`scripts/deck-text.mjs`) --- must be plain JavaScript importing only plain
JavaScript. Node refuses to strip types from files under `node_modules`, which
is where the package lives once a consumer installs it, so a `.ts` bin (or a
`.mjs` bin importing `plugins/*.ts`) fails at `npx` time even though it runs
fine from a checkout.

That's why `src/deck-text.mjs` carries its own copies of the directive parsers
and the `@include` walk instead of importing `src/parse-helpers.ts` and
`plugins/remark-deck-includes.ts`. `test/deck-text.test.ts` pins the copies to
the originals: add or change a directive in `parse-helpers.ts` without mirroring
it there and that test fails.

## Image paths

Deck images must use relative paths (e.g. `./assets/photo.jpg`), resolved at
build time by Astro's asset pipeline. Absolute paths (`/images/...`) pass
through unmodified and 404 on subpath deployments --- intentional, to fail early
rather than mask content bugs.

## Key design decisions

- Slides render onto a fixed 1280×720 canvas, scaled to fit the viewport by
  Reveal.js's `transform: scale()` layout. `maxScale: 4` lifts Reveal's default
  2.0 cap so 4K monitors fill rather than letterbox. Units are anchored to the
  canvas, not the viewport, so slides look pixel-identical at any viewport size.
- `display: "grid"` in the Reveal.js options plus a matching `display: grid` in
  `theme/base.css`, so consuming themes can use `place-content: center` on
  sections (Reveal sets `display` inline on the active section, so the config
  option is what propagates `grid` rather than the default `block`).
- Deck pages must not use Astro's `<ClientRouter />` (conflicts with Reveal.js
  keyboard navigation).
- The whiteboard splits into pure state and geometry modules
  (`src/whiteboard/core.ts`, `src/whiteboard/outline.ts` --- unit tested, no
  DOM) and a thin overlay controller (`src/whiteboard/index.ts`); keep new logic
  on the pure side. The header of `src/whiteboard/index.ts` covers the key
  handling and why it bypasses `addKeyBinding`.

## Theming

`theme/base.css` is always imported and provides unlayered structural CSS
(backgrounds, splits, QR codes) plus an `@layer astromotion` block mapping
`--r-*` variables onto `.reveal` and `.reveal .slides section`. Consuming themes
only need to set `--r-*` in `:root`; anything they need to override outright
goes in an unlayered rule, which automatically wins.

## Fonts

`fontVariables: string[]` bridges Astro's top-level `fonts` config into deck
`<head>`s without editing astromotion components: each entry is a `cssVariable`
name, exposed as `virtual:astromotion/fonts` and rendered by `DeckHead.astro` as
`<Font cssVariable={v} preload />`. The fonts must still be declared in
`astro.config`'s `fonts` array.
