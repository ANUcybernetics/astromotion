# astromotion

Astro integration for markdown-authored slide decks powered by
[Reveal.js](https://revealjs.com), with a bit of [Marp](https://marp.app) syntax
mixed in.

This is shared in the spirit of openness and bonhomie, but it's really quite
idiosyncratic, and I don't expect anyone apart from
[me](https://github.com/benswift/) is going to find it useful.

### About the name

The name is a portmanteau of Astro + [Animotion](https://animotion.pages.dev).
Animotion (a Svelte wrapper around Reveal.js) was the original runtime, but it
was removed in favour of using Reveal.js directly --- the Svelte runtime and
SvelteKit shims weren't worth the cost when 98% of decks are pure markdown. The
name stuck because renaming a package used across several projects isn't worth
the churn.

## Install

```sh
npm install github:ANUcybernetics/astromotion
```

## Setup

In your `astro.config.ts`:

```js
import { defineConfig } from "astro/config";
import { astromotion } from "astromotion";

export default defineConfig({
  integrations: [astromotion()],
});
```

The integration registers `@astrojs/mdx` (only if no other integration has
already done so) and adds the deck remark plugins to Astro's global markdown
config, so it composes cleanly with themes that register mdx themselves. It also
injects the `/decks/[...slug]` catch-all route and resolves your theme CSS.
Slides are server-rendered HTML by default; interactive components opt in to
client-side hydration per component via Astro's `client:*` directives.

**Important:** deck pages must not use Astro's `<ClientRouter />` --- it
conflicts with Reveal.js keyboard navigation.

### Head assets

Deck pages are injected routes, so astromotion --- not your layout --- owns
their `<head>`. Two options fill it:

```js
astromotion({
  favicon: "/favicon.svg", // omit and no <link rel="icon"> is emitted
  ogImage: "/og-image.png", // omit and the og:/twitter: image tags are omitted
});
```

Both take a path served by your site (typically from `public/`), or an absolute
URL, and are resolved against the site's `base` --- so they stay correct on a
site deployed under a subpath. Nothing is emitted for an option you leave unset:
a dangling icon or social-card URL is worse than none.

## Writing slides

Create `.deck.mdx` files in `src/decks/`:

```
src/decks/
  my-talk.deck.mdx             -> /decks/my-talk/
  assets/
    photo.jpg
```

Top-level files use the filename stem as the slug. Subdirectories also work ---
a file named `slides.deck.mdx` maps to the folder root URL, and other names
become sub-paths:

```
src/decks/
  my-series/
    slides.deck.mdx            -> /decks/my-series/
    bonus.deck.mdx             -> /decks/my-series/bonus/
```

### Frontmatter

Decks support YAML frontmatter with these fields:

```mdx
---
title: My Talk
description: A talk about things
image: /og-image.png
---
```

All fields are optional. `title` falls back to the filename slug. `description`
defaults to "Slide deck". `image` overrides the integration's `ogImage` option
for this deck. These are used for the page `<title>` and Open Graph / Twitter
Card meta tags; when neither `image` nor `ogImage` is set, the social-image tags
are omitted.

### Slide syntax

Slides are separated by `---` (thematic breaks). Each section becomes a
Reveal.js `<section>` element.

### Minimal example

```mdx
---
title: My Deck
---

import MyWidget from "../components/MyWidget.svelte";

# Hello

![bg](./photo.jpg)

---

## Slide with widget

<MyWidget client:visible prop="value" />

---

{/* _class: impact */}

**Big statement slide**

{/* notes: This is a speaker note. <em>HTML is supported.</em> */}
```

### Directives

MDX does not support HTML comments. Directives use MDX expression comment
syntax:

- `{/* _class: name */}` --- set a CSS class on the enclosing slide (e.g.
  `impact`, `banner`, `quote`, `centered`, or any custom class your theme
  defines)
- `{/* _if: name */}` --- gate the slide on a URL query param: it is removed
  before Reveal.js initialises unless the deck URL carries `?name`, so slide
  numbers and `#/` hashes count only the slides that survive
- `{/* _id: name */}` --- put an `id` on the slide so Reveal.js can address it
  by name: a link to `#/name` (from anywhere in the deck, or from outside it)
  navigates to that slide, and the URL shows `#/name` rather than a slide number
  while it's on screen --- handy for a running-order or index slide whose
  entries jump to their sections
- `{/* _animate */}` --- flag the slide for Reveal.js
  [auto-animate](https://revealjs.com/auto-animate/): adjacent slides that both
  carry `_animate` smoothly tween matching elements (matched by `data-id`, or by
  text for headings/paragraphs) from one slide to the next. Use
  `{/* _animate: id */}` to scope independent sequences --- only slides whose
  ids match animate across their shared boundary.
- `{/* notes: ...HTML body... */}` --- presenter notes, visible in the Reveal.js
  speaker view (press **S**). The content is rendered as HTML.
- `{/* @include ./path.mdx */}` --- inline slides from another `.mdx` file (see
  Include directives below)

### Background images

Marp-inspired background image syntax:

- `![bg](./assets/photo.jpg)` --- full-bleed background
- `![bg contain](url)` / `![bg cover](url)` --- sizing
- `![bg left:50%](url)` / `![bg right:40%](url)` --- split layout (the
  percentage controls the image panel width)
- `![bg blur:5px brightness:0.7 saturate:1.5](url)` --- CSS filters (blur,
  brightness, and saturate can be combined freely)

Image paths must be relative to the deck file (e.g. `./assets/photo.jpg`).
Absolute paths like `/images/...` are not resolved and will 404 on subpath
deployments.

### QR codes

```mdx
![qr](https://example.com)
```

Generates an SVG QR code at build time, with CSS animations on the modules (the
little squares morph and shift colour). The animations respect
`prefers-reduced-motion`. The URL is displayed as a clickable link beneath the
code.

### Include directives

Inline slides from another `.mdx` file:

```mdx
{/* @include ./shared-intro.mdx */}
```

Paths are relative to the current deck file. Included content participates in
slide splitting --- thematic breaks inside the included file create new slides.
Only `.mdx` files are supported; rename any `.md` partials to `.mdx` first. This
is handy for sharing common slides (acknowledgements, logos, boilerplate) across
multiple decks.

### Components

Import any component framework Astro supports (Svelte, React, Vue, Solid, etc.)
at the top of the file and use it directly in slide content. Hydration is opt-in
per component:

```mdx
import MyWidget from "../components/MyWidget.svelte";
import AnotherWidget from "../components/AnotherWidget.jsx";

---

## Slide with components

<MyWidget client:visible />
<AnotherWidget client:load prop="value" />
```

Available `client:*` directives:

- `client:load` --- hydrate immediately on page load
- `client:visible` --- hydrate when the component enters the viewport
- `client:only="svelte"` --- render only client-side (skip SSR entirely)
- No directive --- render as static HTML, no JavaScript

### Code blocks

Fenced code blocks get syntax highlighting at build time via
[Shiki](https://shiki.style). The theme defaults to `vitesse-dark` but is
configurable --- see Options below.

### Smart typography

[Smartypants](https://www.npmjs.com/package/smartypants) runs on all slide
content, converting straight quotes to curly quotes, triple dashes to em dashes,
double dashes to en dashes, and triple dots to ellipsis characters.

## Theming

The default theme re-exports Reveal.js's built-in black theme. For custom
styling, create a CSS file and pass it to the integration:

```js
astromotion({ theme: "./src/decks/theme.css" });
```

Your theme CSS sets Reveal.js CSS variables and slide class styles. At a minimum
you'll want:

- **Reveal.js CSS variables** --- `--r-background-color`, `--r-main-color`,
  `--r-main-font`, `--r-main-font-size`, `--r-heading-color`,
  `--r-heading-font`, `--r-link-color`
- **Slide section base styles** --- padding, text-align, font-weight under
  `.reveal .slides section`
- **Slide classes** --- visual treatments for `banner`, `impact`, `quote`,
  `centered` (the classes available via `{/* _class: ... */}` directives)

### Structural classes reference

These classes are generated by the build pipeline and styled by the base theme.
Your custom theme layers on top:

| Class            | Purpose                                           |
| ---------------- | ------------------------------------------------- |
| `.slide-bg`      | Full-bleed background image (absolute positioned) |
| `.split-layout`  | Flex wrapper for split image/content slides       |
| `.split-image`   | Image panel in split layout (width set inline)    |
| `.split-content` | Content panel in split layout                     |
| `.qr-code`       | Container for generated QR code SVGs              |

### Sharing styles between your site and your decks

If your Astro site and your slide decks share a visual identity, extract the
common CSS custom properties into a shared file (e.g. `src/styles/common.css`)
and `@import` it from both your site's global stylesheet and your deck theme.

Keep context-specific things separate --- the website and decks have
fundamentally different rendering models (responsive layout vs a fixed 1280×720
viewport scaled to fill the screen), so root font size, layout tokens, and
Reveal.js `--r-*` variables should stay in their respective files.

### Font loading

The theme CSS should only _reference_ fonts (via `font-family`), not _load_
them. Use Astro's built-in font system in your `astro.config.ts`:

```js
export default defineConfig({
  fonts: [
    {
      name: "Your Font",
      cssVariable: "--font-your-font",
      provider: fontProviders.google(),
    },
  ],
});
```

## Options

```ts
astromotion({
  theme: "./src/my-theme.css", // custom theme CSS path (default: built-in black theme)
  injectRoutes: true, // inject /decks/[...slug] route (default: true)
  shikiConfig: { theme: "vitesse-dark" }, // full ShikiConfig (default: { theme: "vitesse-dark" })
});
```

The `shikiConfig` option accepts the full Astro `ShikiConfig` shape — single
theme via `theme`, or dual light/dark themes via `themes`:

```js
astromotion({
  shikiConfig: {
    themes: { light: anuLight, dark: anuDark },
    defaultColor: false,
  },
});
```

If you set `injectRoutes: false`, you'll need to create your own route pages.
See `pages/[...slug].astro` in this package for the reference implementation.

## Reveal.js configuration

The integration configures Reveal.js with these options:

- **1280×720** slide dimensions, no margin
- **linear navigation** (no 2D grid) with no on-screen controls
- **hash-based URLs** with 1-based indexing (`#/1`, `#/2`, etc.)
- **no transitions** between slides
- **CSS grid display** with centering (so `place-content: center` works in your
  theme CSS)
- **`viewDistance: 10`** for preloading nearby slides

These aren't currently configurable by the consumer --- they're hardcoded in the
catch-all route. If you need different settings, set `injectRoutes: false` and
write your own route.

## Keyboard help

Reveal's help overlay lists every key binding, astromotion's included, and **?**
brings it up. Since that only helps someone who already suspects there's help,
the overlay also opens by itself the first time a deck is loaded in a browser
tab. **Escape** dismisses it.

That "first time" is per tab, not per browser: the flag lives in
`sessionStorage` keyed by the deck's path, so a reload doesn't re-show the
overlay, a second deck opened in the same tab gets its own showing, and a fresh
tab is treated as a fresh viewer. The speaker-notes view and the `?print-pdf`
export view never show it.

## Whiteboard

Press **W** while presenting to flip to a fullscreen whiteboard for ephemeral
doodles (it's listed on Reveal's help overlay, press **?**). Strokes are drawn
with [perfect-freehand](https://github.com/steveruizok/perfect-freehand), so
they get variable-width ink: real pressure when drawing with a stylus, and
pressure simulated from drawing speed with a mouse or trackpad.

While the whiteboard is open it owns the keyboard (so the deck can't navigate
underneath): the leading **digit keys** switch pen colour and the next two pick
the brush size, fine or broad --- with the default four-colour palette that's
**1–4** for colour and **5–6** for size (or click the toolbar buttons). **Z**
undoes the last stroke, **C** clears the board, **D** downloads the board as a
timestamped PNG (e.g. `whiteboard-20260703-152410.png`), and **W** or **Escape**
closes it. The drawing survives toggling back to the slides --- flip to the deck
and return and it's still there --- but it lives in memory only: **C** clears
it, and a page reload discards it.

Consuming themes can restyle the board via four CSS custom properties:

- `--astromotion-wb-mode` --- `light` (the default) or `dark`. It picks which
  way round the board runs: a pale surface with near-black as the opening pen
  colour, or a near-black surface with pale ink. The mode also flips the toolbar
  chrome, so the swatches stay legible either way.
- `--astromotion-wb-bg` --- the board surface colour, overriding the mode's
  default (`#fcfcf9` light, `#131313` dark).
- `--astromotion-wb-bg-image` --- an image printed over that surface, sized like
  a `cover` background. It's the caller's job to supply artwork that suits the
  mode: a mostly-dark image for a dark board, a mostly-pale one for a light
  board. The image is composited into the saved PNG too, so a downloaded board
  looks like the one on screen (a cross-origin image needs CORS headers, or it
  is skipped and the export falls back to the surface colour). Use it for a URL
  that needs no bundler resolution --- a `public/` path, an absolute URL, a data
  URI; for an asset sitting beside your theme file, set `background-image`
  directly (see below).
- `--astromotion-wb-inks` --- a comma-separated colour list defining the pen
  palette, any length from one to seven inks (the digit keys, minus the two the
  brush sizes claim), replacing the mode's built-in four-colour palette
  entirely. Any CSS colour syntax works, including `var()` references and legacy
  comma-form `rgb()`.

Note that the mode only chooses the _defaults_: if your theme sets its own inks,
switching to `dark` won't recolour them, so set a pale first ink to match. For
example, ANU-flavoured inks on a light board:

```css
:root {
  --astromotion-wb-bg: var(--anu-white);
  --astromotion-wb-inks:
    var(--anu-dark-grey), var(--anu-gold), var(--anu-copper), var(--anu-teal);
}
```

and the same palette on a dark board carrying a bundled background image. The
image is set as a plain rule on `.astromotion-whiteboard` rather than through
the custom property, because a relative `url()` inside a custom property
resolves against wherever the `var()` is _used_ (astromotion's own CSS), not
where it's declared --- lightningcss rejects it outright as ambiguous. Declared
this way your bundler hashes and base-prefixes it like any other asset:

```css
:root {
  --astromotion-wb-mode: dark;
  --astromotion-wb-inks:
    var(--anu-white), var(--anu-gold), var(--anu-copper), var(--anu-teal);
}

.astromotion-whiteboard {
  background-image: url("./assets/whiteboard-bg.avif");
}
```

## Presenter clock

Press **T** while presenting to show a small 24-hour clock (`HH:MM`) in the
bottom-right corner, and **T** again to hide it (it's listed on Reveal's help
overlay, press **?**). It's for the presenter's own glance at the time when
Reveal's speaker view isn't on a second screen, so it's deliberately quiet ---
white on a translucent scrim, at a fixed size outside the scaled slide canvas
--- and it starts hidden, so a deck read on the web or exported to PDF never
shows one.

Consuming themes can restyle it via CSS custom properties:
`--astromotion-clock-bg`, `--astromotion-clock-color`,
`--astromotion-clock-opacity`, `--astromotion-clock-radius`,
`--astromotion-clock-font-family` and `--astromotion-clock-font-size`.

## Deck listing page

The integration doesn't inject a listing page since it would need your site's
layout. Create your own at `src/pages/decks/index.astro`:

```astro
---
import YourLayout from "../../layouts/YourLayout.astro";
import { parseDeckFrontmatter } from "astromotion";
import fs from "node:fs";
import path from "node:path";

const decksDir = path.resolve("src/decks");
const decks = [];

for (const entry of fs.readdirSync(decksDir, { withFileTypes: true })) {
  if (entry.isDirectory()) {
    for (const file of fs.readdirSync(path.join(decksDir, entry.name))) {
      const match = file.match(/^(.+)\.deck\.mdx$/);
      if (!match) continue;
      const raw = fs.readFileSync(path.join(decksDir, entry.name, file), "utf-8");
      const { data } = parseDeckFrontmatter(raw, entry.name);
      const slug = match[1] === "slides" ? entry.name : `${entry.name}/${match[1]}`;
      decks.push({ slug, title: data.title ?? slug, description: data.description });
    }
  } else if (entry.isFile()) {
    const match = entry.name.match(/^(.+)\.deck\.mdx$/);
    if (!match) continue;
    const raw = fs.readFileSync(path.join(decksDir, entry.name), "utf-8");
    const { data } = parseDeckFrontmatter(raw, match[1]);
    decks.push({ slug: match[1], title: data.title ?? match[1], description: data.description });
  }
}

decks.sort((a, b) => a.slug.localeCompare(b.slug));
---

<YourLayout title="Decks">
  <h1>Decks</h1>
  <ul>
    {decks.map((deck) => (
      <li>
        <a href={`/decks/${deck.slug}/`}>{deck.title}</a>
        {deck.description && <span> --- {deck.description}</span>}
      </li>
    ))}
  </ul>
</YourLayout>
```

## PDF export

The bundled `astromotion-pdf` command builds the site, starts a preview server,
captures the deck with [decktape](https://github.com/astefanutti/decktape),
compresses the result with Ghostscript, repairs the colour spaces Ghostscript
breaks on the way through (see below), and cleans up:

```sh
npx astromotion-pdf my-talk output.pdf
```

Options:

- `--prefix=/decks` --- route prefix the site serves decks under (pass this if
  you've remounted the deck route, e.g. `--prefix=/lectures`)
- `--port=4321` --- preview server port
- `--no-compress` --- keep the raw decktape PDF. The raw capture rasterises
  every slide, so decks with full-bleed backgrounds land at 100 MB+;
  Ghostscript's `/ebook` preset cuts that to a few MB with no visible loss at
  presentation scale. If `gs` isn't installed the script keeps the raw PDF and
  says so.
- `--notes` --- export a presenter guide instead: each slide followed by a page
  of its speaker notes (default output `<slug>-notes.pdf`). This mode skips
  decktape and prints Reveal's `?print-pdf&showNotes=separate-page` view with
  headless Chrome (`preferCSSPageSize: true`, so the page size comes from
  Reveal's `@page` rule). It needs the optional
  [puppeteer-core](https://pptr.dev) peer dependency
  (`pnpm add -D puppeteer-core`) and a local Chrome/Chromium --- unlike decktape
  mode there's no bundled-browser fallback. The `DECKTAPE_CHROME_PATH` /
  `DECKTAPE_CHROME_ARGS` variables apply here too.

Environment variables:

- `DECKTAPE_CHROME_PATH` --- Chrome/Chromium binary for decktape to drive. When
  unset the script looks in the usual macOS and Linux install locations, and
  only falls back to decktape's bundled Chromium (a large one-off download) if
  none is found.
- `DECKTAPE_CHROME_ARGS` --- comma-separated Chrome flags, e.g. `--no-sandbox`
  (needed in containers and some Linux setups)
- `DECKTAPE_MAX_SLIDES` --- safety cap on exported slides (default 500)
- `DECKTAPE_VERSION` --- decktape version npx runs (default 3.16.1)

The script waits up to 30 seconds for the preview server to respond and uses
generous pauses between slides (5 seconds load, 2.5 seconds per slide) to handle
heavy decks. decktape's `reveal` plugin can't drive astromotion decks (reveal.js
6 is initialised as an ES module and never lands on `window`), so the script
uses the `generic` plugin, stepping through slides by key press --- if you
invoke decktape by hand, do the same:

```sh
npx decktape generic --key=ArrowRight --size=1280x720 http://localhost:4321/decks/my-talk/ output.pdf
```

`--size` sets the browser viewport, not the slide canvas: the canvas is fixed at
1280x720 and Reveal scales it to fit, so a larger viewport does **not** sharpen
the export. Chrome embeds slide background images at their source resolution
either way (measured identical at 1280x720 and 1920x1080) and text is vector ---
only the PDF's nominal page size in points changes. Keep any override at 16:9;
another ratio letterboxes the canvas into the page.

### Broken colour profiles

Ghostscript 10.07 writes every image's ICC profile out as a zero-byte stream
while leaving the image's colour space pointing at it, so each image in a
compressed deck carries a colour profile that isn't one. (Ghostscript 10.02
doesn't, which is a good way to be handed the bug by whichever machine you
exported on.) Poppler, pdf.js, PDFium and MuPDF fall back on the profile's
component count and render normally --- poppler noisily, two warnings per image
--- but Apple's CoreGraphics doesn't, so in Safari and Preview the images simply
don't draw and the deck arrives as text on blank backgrounds.

The export repairs this before it writes the file: an empty ICC colour space is
rewritten to the device space its component count implies (`/DeviceRGB` for
three), which is exactly the fallback the tolerant renderers already apply, so
nothing that renders today changes appearance. The rewrite is padded to the same
byte length, so it can't disturb the file Ghostscript wrote --- and it's a no-op
on a Ghostscript that writes profiles properly.

### Export mode

Both capture modes load the deck with `?astromotion-export`. A deck served that
way sets `data-astromotion-export` on `<html>` and stops `setInterval` from
scheduling anything, so a live widget renders its first frame and then holds
still. `setTimeout` is left alone (Reveal and Astro use it for one-shot startup
work), so nothing about how the deck builds itself changes.

That matters because the `generic` plugin decides the deck is over when a
`MutationObserver` over the whole document sees nothing change for a second
after ArrowRight. Any element that keeps redrawing --- a talk timer, a
countdown, a marquee --- means it never stops, and the export runs to
`DECKTAPE_MAX_SLIDES`, silently appending hundreds of copies of the final slide.

Freezing timers covers the usual case. A widget animating by another route (CSS
keyframes that mutate the DOM, a canvas driven by `requestAnimationFrame`) can
still run an export away, so if a deck exports far more slides than it has,
that's where to look: hide the offender for the export rather than raising the
cap. `{/* _if: live */}` gates a whole slide behind a query param, and
`[data-astromotion-export] .my-widget { display: none }` gates any part of one.

## Text export

For reading a deck away from the screen --- printing it out, marking it up with
a pen, typing the edits back in --- `astromotion-text` writes the deck's text as
plain markdown:

```sh
npx astromotion-text src/decks/week-3.deck.mdx        # writes week-3.md
npx astromotion-text src/decks/week-3.deck.mdx --stdout | less
```

Unlike the PDF export this runs straight on the source file: no build, no
preview server, no browser. It parses the deck, splices in `@include` partials
exactly as the build does (so the export is the whole deck, not just the deck
file), drops everything that only exists to be looked at, and serialises what's
left. Slides stay separated by `---`.

Kept: headings, prose, lists, code blocks, tables, links, blockquotes. Replaced
with a one-line marker so an image-only slide doesn't print blank:

| In the deck                  | In the export                    |
| ---------------------------- | -------------------------------- |
| `![bg](./assets/title.avif)` | `(background image: title.avif)` |
| `![a diagram](./x.png)`      | `(image: a diagram)`             |
| `![qr](https://example.com)` | `(qr: <https://example.com>)`    |
| `<CourseTimeline />`         | `(component: CourseTimeline)`    |
| `{/* notes: … */}`           | `> **notes:** …`                 |
| `{/* a note to self */}`     | `> **comment:** …`               |

Dropped entirely: `import` statements and the presentation-only directives
(`_class`, `_id`, `_if`, `_animate`). A directive astromotion doesn't recognise
--- one your own remark plugin handles --- survives as a comment rather than
being silently swallowed.

Options:

- `--stdout` --- write to stdout instead of `<slug>.md`
- `--no-notes` --- drop speaker notes
- `--no-comments` --- drop authoring comments
- `--no-placeholders` --- drop the `(image: …)` / `(component: …)` markers
- `--no-title` --- don't lead with the frontmatter title as an `h1`

The same thing is available programmatically:

```js
import { deckToMarkdown } from "astromotion/src/deck-text.mjs";

const md = deckToMarkdown("src/decks/week-3.deck.mdx", { comments: false });
```

## Overflow check

A Reveal deck scales a fixed 1280x720 canvas, so "too much for one slide" is a
layout fact rather than a matter of taste --- but it is invisible until you
present it. `astromotion-check` walks every slide of every deck in headless
Chrome and reports what does not fit:

```sh
npx astromotion-check                          # every deck under src/decks
npx astromotion-check week-3 --prefix=/lectures
```

```
✗ 2 slide issue(s):

  week-3 slide 6 "Backpressure, channel by channel" — overflow: content runs 43px past the bottom of the slide
  week-3 slide 9 "Wiring it up" — clipped: pre.astro-code hides 72px of its content below the visible box
```

Two rules, because a deck overflows in two visibly different ways:

- **`overflow`** --- a text element's box extends past the canvas. Loud: the
  last line runs off the bottom edge or under the footer.
- **`clipped`** --- an element whose overflow is not `visible` is hiding part of
  its own content. This is the quiet one. A code block inside a split panel is a
  flex item, and a flex item with a non-visible overflow has an automatic
  minimum size of zero, so on a full slide it is silently squashed and the last
  command simply is not on screen. Nothing about the rendered slide says so.

Backgrounds, split-image panels and decorative art bleed off the canvas by
design, so only text-bearing elements are measured for `overflow`.

It runs against `astro dev` rather than a production build, deliberately: a deck
with `published: false` is absent from a production build, and those are exactly
the decks still being written. It exits non-zero on any violation, so it can
gate a release --- but because it needs a browser and a dev server it is a
deliberate command, not part of `astro build`.

Options:

- `--prefix=/decks` --- route prefix the site serves decks under
- `--dir=src/decks` --- where the `*.deck.mdx` files live
- `--port=4321` --- dev server port
- `--tolerance=4` --- canvas px of slack before a slide is reported
- `--json` --- machine-readable output

It needs [`puppeteer-core`](https://pptr.dev/) (an optional peer dependency:
`pnpm add -D puppeteer-core`) and a local Chrome or Chromium.
`ASTROMOTION_CHROME_PATH` overrides browser discovery and
`ASTROMOTION_CHROME_ARGS` passes flags --- on Linux distributions that restrict
unprivileged user namespaces you will need
`ASTROMOTION_CHROME_ARGS=--no-sandbox`.

Slides gated behind `_if:` are checked in their default state only, since the
conditional slides are removed from the DOM before Reveal reads it; a deck whose
`?presenters` view differs needs its own run against that URL.

## Exports

The package exports:

- **`astromotion(options?)`** --- the Astro integration (this is what you use)
- **`deckRemarkPlugins`** --- the array of remark plugins in the correct order,
  exported for use when you manage `@astrojs/mdx` yourself
- **`parseDeckFrontmatter(raw, slug?)`** --- parse YAML frontmatter from a deck
  file (useful for listing pages)
- **`deckToMarkdown(deckPath, options?)`** (from
  `astromotion/src/deck-text.mjs`) --- the text export above, as a function

## Migration from `.deck.md` / `.deck.svelte`

1. Rename `*.deck.md` and `*.deck.svelte` to `*.deck.mdx`.
2. For `.deck.svelte` files with a `<script lang="ts">` block, lift its contents
   to top-level MDX `import` and `export const` statements and drop the
   `<script>` wrapper.
3. Convert directive syntax from HTML comments to MDX expression syntax:
   - `<!-- @include ./path -->` → `{/* @include ./path.mdx */}`
   - `<!-- _class: name -->` → `{/* _class: name */}`
   - `<!-- notes: ... -->` → `{/* notes: ... */}`
4. Rename any `.md` partial files used by `@include` to `.mdx`.
5. Remove `@astrojs/svelte` and `deckPreprocessor` from your Astro config if
   they were only there for deck support. Add `@astrojs/mdx` as a dependency
   (the integration will register it automatically, but it must be installed).

Background image syntax, QR images, and slide separators are unchanged.

## Licence

MIT --- (c) Ben Swift
