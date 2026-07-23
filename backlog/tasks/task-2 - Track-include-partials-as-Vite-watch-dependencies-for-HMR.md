---
id: TASK-2
title: Track @include partials as Vite watch dependencies for HMR
status: Done
assignee: []
created_date: "2026-05-08 11:07"
updated_date: "2026-06-10 04:24"
labels:
  - dx
  - bug
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

## Context

The `remark-deck-includes` plugin (`plugins/remark-deck-includes.ts`) reads
partial `.mdx` files synchronously via `readFileSync` at MDX compile time and
splices their AST into the parent. The included file paths are never
registered as Vite dependencies, so editing a partial does not trigger HMR —
the dev server only reloads when the parent `.deck.mdx` itself changes.

Consumers currently work around this by touching the parent file (or
restarting the dev server) after every edit to a partial. This was hit
during a recent refactor of the `llms-unplugged` cutouts decks where the
authoring flow involves heavy editing of partials like
`cutouts-sycophancy.mdx`, `cutouts-tool-use.mdx`, etc.

Production builds are unaffected — this is purely a dev-server ergonomics
issue.

## Implementation options

### Option A — vite plugin parallel to the include splice (recommended)

Add a small Vite plugin in `index.ts` that, on `transform` of a
`.deck.mdx` file, regex-scans the source for `{/* @include ./path.mdx */}`
directives and calls `this.addWatchFile(absPath)` for each match. Recurse
into nested includes by reading the matched file and scanning it the same
way (with the same `MAX_DEPTH` guard the remark plugin uses).

Pros: doesn't touch the remark plugin, doesn't depend on internal VFile
state flowing between layers, cheap to implement.

Cons: duplicates the regex/path-resolution logic with the remark plugin —
they need to stay in sync.

### Option B — VFile data + integration hook

Have `remark-deck-includes` accumulate visited paths on `file.data.includedFiles`
during its recursive splice, then have a Vite plugin / Astro hook read that
data after MDX compilation and call `addWatchFile` for each path.

Pros: single source of truth (the remark plugin already walks every
include).

Cons: requires plumbing data out of @astrojs/mdx's internal pipeline
into a Vite hook with access to `addWatchFile`. May or may not be possible
without forking / wrapping @astrojs/mdx — needs investigation.

## Recommendation

Start with Option A. It's bounded, doesn't require integration spelunking,
and the duplicated regex is small (one line in `parseIncludeDirectiveMdx`'s
neighborhood). If Option B turns out to be straightforward via a public
@astrojs/mdx hook, switch to it later.

## Downstream consumer update

After this is fixed, tested, and pushed:

1. Bump astromotion in `~/projects/llms-unplugged/website/package.json`
   to pull in the fix.
2. Verify HMR works locally on the cutouts decks: edit
   `src/decks/cutouts-sycophancy.mdx` and confirm the change reflects in
   the dev server without touching the parent `cutouts-3h.deck.mdx`.

## Notes

- The remark plugin gates on `.deck.mdx`; the watch-file logic should match
  that gating so we don't try to register includes for non-deck MDX files.
- Respect `MAX_DEPTH = 10` to avoid pathological cycles.
- Add a regression test that simulates an include and asserts the
  parent's transform registers the partial as a watch file.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Editing an included partial in a consuming project triggers HMR without touching the parent .deck.mdx
- [x] #2 Nested includes (partial including partial) are also tracked
- [x] #3 Production build still works correctly
- [x] #4 Regression test added covering the watch-file registration
- [x] #5 CHANGELOG entry added
- [x] #6 Manual verification in llms-unplugged after upstream publish: edit cutouts-sycophancy.mdx, see HMR fire

## Verification findings (2026-05-08)

Plugin works as designed: registers all 11 cutouts-3h partials via
`server.watcher.add`, fires `handleHotUpdate` on partial edits, and sends a
`full-reload` over the dev WebSocket. Confirmed via debug logging in the
llms-unplugged dev server.

However, **even direct edits to a parent `.deck.mdx` file are not picked up
by the running dev server in this Astro 6.3.1 + @astrojs/mdx 5.0.4 setup**.
After editing the parent, the server keeps returning the rendered output
captured at startup (verified via `curl` and a controlled browser session).
A server restart is required to refresh.

This means AC #1 and #6 cannot be verified end-to-end with the current
upstream tooling --- the upstream caching issue masks any effect of the
watch-file registration. Filed against a future upstream Astro/MDX fix; the
plumbing in this task is correct and will start working as soon as the
underlying invalidation lands.

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Fixed in v0.5.4 (commit d1be2e5): handleHotUpdate now calls server.moduleGraph.onFileChange() for each parent deck before sending full-reload — without the invalidation the dev server re-served the stale compiled parent MDX module. Regression tests cover the invalidation and its ordering before the reload. AC#6 verified in llms-unplugged on astromotion v0.5.4 (astro 6.4.4 / @astrojs/mdx 6.0.2): edited src/decks/partials/cutouts-generation.mdx with no consumer-side shim; both cutouts decks re-rendered fresh without touching the parents. llms-unplugged's temporary shim has been removed.

<!-- SECTION:NOTES:END -->
