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

Consuming themes can restyle the board via two CSS custom properties:
`--astromotion-wb-bg` sets the board surface, and `--astromotion-wb-inks` is a
comma-separated colour list defining the pen palette --- any length from one to
seven inks (the digit keys, minus the two the brush sizes claim), replacing the
built-in four-colour palette entirely. Any CSS colour syntax works, including
`var()` references and legacy comma-form `rgb()`. For example, ANU-flavoured
inks:

```css
:root {
  --astromotion-wb-bg: var(--anu-white);
  --astromotion-wb-inks:
    var(--anu-dark-grey), var(--anu-gold), var(--anu-copper), var(--anu-teal);
}
```

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

Requires [decktape](https://github.com/astefanutti/decktape):

```sh
npx decktape reveal --size 1280x720 http://localhost:4321/decks/my-talk/ output.pdf
```

Or use the bundled script, which builds, starts a preview server, exports, and
cleans up:

```sh
node node_modules/astromotion/scripts/deck-pdf.mjs my-talk output.pdf
```

The script waits up to 30 seconds for the preview server to respond and uses
generous pauses between slides (5 seconds load, 4 seconds per slide) to handle
heavy decks.

## Exports

The package exports:

- **`astromotion(options?)`** --- the Astro integration (this is what you use)
- **`deckRemarkPlugins`** --- the array of remark plugins in the correct order,
  exported for use when you manage `@astrojs/mdx` yourself
- **`parseDeckFrontmatter(raw, slug?)`** --- parse YAML frontmatter from a deck
  file (useful for listing pages)

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
