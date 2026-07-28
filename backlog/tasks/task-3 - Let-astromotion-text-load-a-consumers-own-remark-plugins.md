---
id: TASK-3
title: Let astromotion-text load a consumer's own remark plugins
status: To Do
assignee: []
created_date: '2026-07-28 05:45'
labels:
  - deck-text
  - cli
dependencies: []
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
astromotion-text resolves @include partials, but a consumer whose decks carry directives handled by its own remark plugin gets those slides' content dropped from the export --- the directive survives as a visible comment, which is honest but not the text. The comp4020 website is the live case: its remarkDeckEmbeds plugin splices content-collection entries into decks via {/* embed: <collection>/<slug>[#section] */}, and the export prints the directive instead of the embedded prose. A repeatable --plugin=<path> flag would let the CLI import those plugins and run them over the tree before extraction, keeping the export whole without astromotion knowing anything about a given consumer's syntax. Low urgency: one deck in one consumer uses one embed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 astromotion-text accepts --plugin=<path> and applies each named remark plugin to the deck tree before the text extraction pass
- [ ] #2 The flag is repeatable, so several plugins can be loaded in the order given
- [ ] #3 A plugin path that cannot be imported, or that does not export a usable remark plugin, fails with a message naming the path rather than a bare stack trace
- [ ] #4 Running the comp4020 website's src/deck-remark-embeds.mjs over week-1.deck.mdx puts the embedded topic text in the export in place of the embed directive
- [ ] #5 deckToMarkdown() exposes the same capability programmatically
- [ ] #6 README documents the flag alongside the other text-export options
<!-- AC:END -->
