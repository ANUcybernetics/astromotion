# Changelog

## 2026-07-03

### Feature: ephemeral whiteboard mode (press W)

Pressing `W` in a deck flips to a fullscreen whiteboard for ephemeral doodles
--- listed on Reveal's help overlay, closed with `W`/`Escape`. Strokes render
via perfect-freehand (the tldraw ink engine) so they get variable-width
pen-physics ink: real stylus pressure when a pen is detected, simulated from
drawing velocity for mouse and trackpad, with coalesced pointer events for
smooth fast strokes. While open, the board claims every unmodified key ---
digits switch colour, `Z` undoes, `C` clears --- so the deck never navigates
underneath; modified keys pass through to the browser. The drawing survives
toggling back to the slides (only `C` clears it) but lives in memory only --- a
reload discards it. Themes can restyle via custom properties:
`--astromotion-wb-bg` sets the board surface, and a consecutive run of
`--astromotion-wb-ink-1`, `-2`, ... (one to nine inks) replaces the built-in
four-colour palette. Adds the `perfect-freehand` dependency (tiny, zero-dep) and
pure-function state/geometry modules with unit tests.

### Feature: the astromotion-decks authoring skill now ships from this repo

The repo doubles as a Claude Code plugin marketplace (`.claude-plugin/`) serving
the `astromotion-decks` skill from `.claude/skills/`, so the skill's canonical
home versions with the package it documents. Subscribe with
`claude plugin marketplace add benswift/astromotion` (pin a release with
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
