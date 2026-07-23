---
id: TASK-1
title: "Remove animotion dependency, use Reveal.js directly"
status: Done
assignee: []
created_date: "2026-04-02 11:23"
updated_date: "2026-07-23 08:01"
labels:
  - refactor
  - breaking-change
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

## Context

Animotion wraps Reveal.js in Svelte components (`<Presentation>`, `<Slide>`, `<Code>`, `<Action>`, etc.) and is the core runtime dependency of astromotion. However, an audit of 58 `.deck.svx` files across all consuming projects found that only 1 (an example/demo deck) uses any animotion-specific features. The remaining 57 are pure markdown.

Animotion adds: a peer dependency consuming projects must install, a SvelteKit environment shim (animotion assumes SvelteKit, we run Astro), a dual-path preprocessor (animotion components skip markdown processing), and coupling to animotion's Reveal.js version.

This task removes animotion and replaces it with a thin Reveal.js integration owned by astromotion. Svelte remains available as an opt-in per-deck escape hatch for slides that need interactivity.

## File extension

Replace `.deck.svx` with `.deck.md`. The svx extension comes from mdsvex (markdown + Svelte); since the default output is now plain HTML, `.deck.md` better reflects what the files are. The preprocessor matches on this extension to identify deck files.

Consuming projects will need to rename their files. Provide a migration note or script.

## Implementation plan

### 1. Replace animotion components with direct Reveal.js

- **`<Presentation>`** → a small Astro component (or inline `<script>`) that calls `Reveal.initialize()` on mount with the current hardcoded options. Cleanup on unmount.
- **`<Slide>`** → preprocessor emits `<section>` tags directly.
- **`<Code>`** → use rehype-shiki (or similar) in the existing remark/rehype pipeline. The preprocessor already runs rehype; add syntax highlighting there instead of delegating to a client-side component.
- **`<Notes>`** → preprocessor emits `<aside class="notes">`.

### 2. Simplify the preprocessor

- Remove the dual-path logic (animotion component detection regex, the "skip markdown" path).
- Remove auto-imports of animotion components.
- Remove the `REVEAL_BRIDGE` (`getPresentation()` / `window.Reveal` injection).
- Output format changes from a Svelte component to an Astro component or raw HTML consumed by the catch-all route.
- Change file matching from `*.deck.svx` to `*.deck.md`.

### 3. Update the Astro integration

- Remove the `$app/environment` → `sveltekit-shims/environment.js` alias.
- The catch-all deck route renders HTML into a `<div class="reveal"><div class="slides">...</div></div>` wrapper with a `<script>` that initialises Reveal.js.
- Remove `@animotion/core` from `peerDependencies`.
- Add `reveal.js` as a direct dependency (currently inherited transitively through animotion).

### 4. Svelte opt-in escape hatch

For the rare deck that needs interactivity or animation beyond Reveal.js fragments:

- A frontmatter flag (e.g. `framework: svelte`) switches the preprocessor output to a Svelte component instead of plain HTML.
- The catch-all route detects this and renders via `client:only="svelte"` as today.
- `@astrojs/svelte` remains an optional/peer dependency, only needed if any deck opts in.
- Document this in the README with an example.

### 5. Update the example deck

The one deck using animotion features (`cyberneticstudio-xyz/src/decks/example.deck.svx`) is a demo. Replace the two animotion-specific slides with Reveal.js-native equivalents:

- **Animated code slide** (uses `<Code>` + `<Action>` for step-through code updates) → use Reveal.js fragments with static code blocks, or a `framework: svelte` slide demonstrating the opt-in hatch.
- **Animated SVG slide** (uses `@animotion/motion` tweens) → use CSS transitions triggered by Reveal.js fragment events, or a `framework: svelte` slide.

This keeps the example deck as a showcase of what's possible without requiring animotion.

### 6. Consider a name change

"Astromotion" is a portmanteau of Astro + animotion. With animotion removed, the name is misleading. Consider renaming to something that reflects the actual stack (Astro + Reveal.js + markdown). Some options:

- **astro-reveal** (direct, descriptive)
- **astro-decks** (framework-agnostic name)
- **deckdown** (markdown → decks)

Or keep the name if it's already established and the etymology doesn't matter. This is a judgement call --- flag it but don't block the task on it.

## Animation without animotion

For slides that need step-by-step reveals or animation, the recommended approaches (in order of simplicity):

1. **Reveal.js fragments** --- `class="fragment fade-in"` etc. Covers most "things appear on click" cases. Could add a remark plugin for markdown-friendly fragment syntax.
2. **CSS transitions** --- triggered by Reveal.js classes (`.visible`, `.current-fragment`). No JS needed.
3. **Svelte opt-in** --- for genuinely interactive slides, use the `framework: svelte` frontmatter flag and write Svelte inline.

## Consuming project migration

Seven projects on this machine consume astromotion. All 52 deck files are pure markdown (no animotion features) except the one example deck in cyberneticstudio-xyz.

| Project                  | Path                                                      | Deck files |
| ------------------------ | --------------------------------------------------------- | ---------- |
| cyberneticstudio-xyz     | `~/projects/cyberneticstudio-xyz`                         | 4          |
| llms-unplugged           | `~/projects/llms-unplugged/website`                       | 2          |
| comp1720                 | `~/projects/teaching-archive/comp1720`                    | 11         |
| comp2300                 | `~/projects/teaching-archive/comp2300`                    | 16         |
| comp2710-lens            | `~/projects/teaching-archive/comp2710-lens`               | 17         |
| astro-theme-anu docs     | `~/projects/astro-theme-anu/docs`                         | 1          |
| astro-theme-anu template | `~/projects/astro-theme-anu/templates/course-with-slides` | 1          |

Additionally, `astro-theme-anu/packages/astro-theme-anu` lists astromotion as an optional peer dependency.

### Migration steps per project

1. **Rename files**: `*.deck.svx` → `*.deck.md` (a one-liner: `find src/decks -name '*.deck.svx' -exec sh -c 'mv "$1" "${1%.svx}.md"' _ {} \;`).
2. **Update dependency**: point to the new astromotion version (or renamed package if we rename it). Remove `@animotion/core` from dependencies if listed.
3. **Update astro config**: no change expected --- the integration call (`astromotion({ theme: ... })`) stays the same, just the internal behaviour changes.
4. **Verify**: build the site and spot-check a few decks render correctly.

### Migration for cyberneticstudio-xyz example deck

The two animotion slides in `example.deck.svx` need manual porting:

- **Animated code slide**: replace with static code blocks using Reveal.js fragments to step through highlights, or convert to a `framework: svelte` slide to demonstrate the opt-in escape hatch.
- **Animated SVG slide**: replace with CSS transitions on fragment events, or convert to a `framework: svelte` slide.

### Providing a migration script

Include a `migrate.sh` script or a documented one-liner in the release notes that handles the file rename across a project. The content of the files doesn't change --- only the extension.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 animotion removed from peerDependencies; reveal.js added as direct dependency
- [ ] #2 SvelteKit environment shim removed
- [ ] #3 preprocessor emits HTML sections, not Svelte components, by default
- [ ] #4 preprocessor matches _.deck.md instead of _.deck.svx
- [ ] #5 syntax highlighting handled by rehype pipeline, not client-side Code component
- [ ] #6 catch-all route initialises Reveal.js without a framework runtime
- [ ] #7 frontmatter framework: svelte flag opts a deck into Svelte component output
- [ ] #8 example deck updated with Reveal.js-native equivalents of animotion demos
- [ ] #9 all existing tests updated and passing
- [ ] #10 CLAUDE.md updated to reflect new architecture
- [ ] #11 all 7 consuming projects migrated: files renamed to \*.deck.md, dependencies updated, builds verified
- [ ] #12 migration script or documented one-liner included in release notes
- [ ] #13 visual regression check: use agent-browser to screenshot representative slides before and after migration, confirming rendered appearance is unchanged

<!-- AC:END -->
