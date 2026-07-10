---
name: astromotion-decks
description:
  Authors and edits slide decks using the astromotion package (Astro + MDX +
  Reveal.js + Marp-inspired markdown syntax). Use when working with .deck.mdx
  files, slide presentations, or when the user mentions decks, slides, or
  astromotion.
---

You author slide decks as `.deck.mdx` files using the astromotion package. Decks
are MDX-first (markdown plus optional component imports), processed by Astro's
MDX integration and rendered as Reveal.js presentations. Slides server-render to
zero-JS HTML by default; interactive components opt into hydration via Astro's
`client:*` directives.

## File conventions

Decks live in `src/decks/`. Top-level files use the filename stem as the slug:

- `my-talk.deck.mdx` -> `/decks/my-talk/`

Subdirectories also work for grouping related decks:

- `my-series/slides.deck.mdx` -> `/decks/my-series/`
- `my-series/bonus.deck.mdx` -> `/decks/my-series/bonus/`

Assets go in `src/decks/assets/` and are referenced with `./assets/` from deck
files.

## Deck file structure

```mdx
---
title: Deck Title
description: Optional description for meta tags
---

import Counter from "../components/Counter.svelte";
import "./my-talk.deck.css";

export const GREETING = "hello";

# First slide

Content here

---

## Second slide

{GREETING}, world

---

## Interactive slide

<Counter client:visible />
```

Top-level `import` and `export const` statements work as in any MDX file. Use
them to bring in components, deck-scoped CSS, and shared constants. There is no
`<script>` wrapper.

### Frontmatter

YAML frontmatter between `---` fences at the top of the file. Fields: `title`
(required), `description`, `author`, `image` (OG image path).

### Slide separators

Separate slides with a blank line, three dashes, blank line (`\n---\n`). This is
a markdown thematic break --- the same separator used by Marp.

## Markdown slides

Most slide content is plain markdown. Supported:

- Standard markdown: headings, lists, bold, italic, links, inline code
- GFM extensions: tables, strikethrough, task lists
- Fenced code blocks: syntax-highlighted via Shiki (configurable theme)
- Smart typography applied automatically (smart quotes, em dashes)

## Slide directives (MDX expression comments)

MDX does not support HTML comments (`<!-- ... -->`). Directives use MDX
expression-comment syntax:

- `{/* _class: name */}` --- set the slide's CSS class
- `{/* _if: name */}` --- gate the slide on a URL query param: the slide is
  removed unless the deck URL carries `?name` (e.g. `?presenters`). Filtered
  before Reveal initialises, so slide numbers and `#/` hashes count only the
  slides that survive.
- `{/* notes: Speaker notes here */}` --- presenter notes (visible in speaker
  view)
- `{/* @include ./path.mdx */}` --- splice the contents of another `.mdx` file
  into this slide. The `.mdx` extension is required.

Place directives at the top of a slide (after the `---` separator).

**Documenting directives in fenced examples:** when you show a directive inside
a fenced code block (e.g. a tutorial deck or prose docs), tag the fence `mdx`,
not `markdown`. oxfmt formats the body of a `markdown`-tagged fence as markdown
and corrupts the directive --- `{/* _class: impact */}` becomes
`{/_ \_class: impact _/}` (asterisks flipped to underscores, the class
underscore escaped). An `mdx`-tagged fence is left intact.

### Available slide classes

- `impact` --- large, bold text for key statements
- `banner` --- full-bleed background with overlay text
- `quote` --- styled for quotations
- `centered` --- vertically and horizontally centred content
- `anu-logo` --- generates an animated ANU logo slide (no other content needed)
- `socy-logo` --- generates an animated School of Cybernetics logo slide

## Background images

Marp-inspired syntax using `![bg](url)` at the start of a slide:

```markdown
![bg](./assets/photo.avif)
```

### Variants

- `![bg](url)` --- full-bleed background (cover)
- `![bg contain](url)` --- contained background
- `![bg left:50%](url)` --- split layout, image on left taking 50% width
- `![bg right:40%](url)` --- split layout, image on right taking 40% width
- `![bg blur:5px brightness:0.7](url)` --- CSS filters on the background

### Image path resolution

Use relative paths only (`./assets/photo.avif`). They resolve via Astro's asset
pipeline at build time. Absolute paths (`/images/...`) pass through unmodified
and will 404 on subpath deployments. Remote URLs (`https://...`) are used
directly.

## QR codes

```markdown
![qr](https://example.com)
```

Generates an animated inline SVG QR code linking to the URL.

## Components and hydration

Any framework Astro supports (Svelte, React, Vue, Solid, etc.) can be imported
at the top of a `.deck.mdx` file and used in slide content. Hydration is opt-in
per component via Astro's `client:*` directives:

| Directive              | When the component hydrates                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| (none)                 | server-rendered as static HTML, never hydrated                                                  |
| `client:load`          | as soon as the page loads                                                                       |
| `client:idle`          | when the browser is idle                                                                        |
| `client:visible`       | when the component scrolls into view                                                            |
| `client:only="svelte"` | skip SSR, render only on the client (use for components that touch `window`/DOM at module load) |

```mdx
import StaticChart from "../components/StaticChart.svelte";
import LiveDemo from "../components/LiveDemo.svelte";

## A static slide

<StaticChart data={[1, 2, 3]} />

---

## An interactive slide

<LiveDemo client:visible />
```

Slides without interactive components emit zero JavaScript.

## Deck-scoped CSS

Import a CSS file at the top of the deck file:

```mdx
import "./my-talk.deck.css";
```

Style rules in that file apply to this deck only (the file is scoped via the
import graph). Prefer this over inline `<style>` blocks.

## Theme

Decks use their own theme CSS, independent of the site's `global.css`. The theme
is configured in `astro.config.mjs` via
`astromotion({ theme: "./path/to/theme.css" })`. The theme file sets Reveal.js's
`--r-*` CSS variables under `:root` and adds slide-class styles (`.banner`,
`.impact`, etc.). astromotion's `theme/base.css` is always imported and maps
`--r-*` to Reveal.js elements via an `@layer astromotion` block, so consuming
themes only need to set variables.

## Architecture notes

- Slides render onto a fixed 1280×720 canvas, scaled to fit the viewport via
  Reveal.js's `transform: scale()` layout. `maxScale: 4` lifts Reveal's default
  2.0 cap so 4K monitors fill rather than letterbox.
- The catch-all `pages/[...slug].astro` route enumerates `*.deck.mdx` files via
  `import.meta.glob({ eager: true })` at build time, generating one static path
  per deck.
- Decks must not use Astro's `<ClientRouter />` --- it conflicts with Reveal.js
  keyboard navigation.

## PDF export

```sh
node node_modules/astromotion/scripts/deck-pdf.mjs <slug> output.pdf
```

Builds the site, starts a preview server, and uses decktape to capture slides.

## Generating background images

Use the `styled-image-gen` skill. It owns the whole workflow --- reading the
site-wide `## Image generation style` section from the project `CLAUDE.md`,
choosing reference images, composing the prompt, and picking a model. Only the
deck-specific parts live here:

- Write into the deck's `assets/` directory with `--output-dir` +
  `--output-filename`, so the path is predictable and can be referenced as
  `![bg](./assets/<filename>.avif)` immediately
- Full-bleed backgrounds (`![bg]`) take the default `16:9`. Split layouts
  (`![bg left:50%]`, `![bg right:50%]`) want `--aspect-ratio 3:4` or `9:16`, so
  the image fills its panel instead of letterboxing inside it
- `--model recraft` gives a vector background (geometric, flat-illustration,
  diagrammatic) as an editable `.svg` that scales crisply at any resolution. It
  takes no reference images, so only the prompt suffix shapes the result.
  Reference it as `![bg](./assets/<filename>.svg)`

Reference the generated image in a slide:

```markdown
![bg](./assets/slide-01.avif)

# Slide title
```
