---
id: TASK-5
title: 'astromotion-pdf leaks its preview server, breaking the next decks:check'
status: To Do
assignee: []
created_date: '2026-08-26 07:42'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`scripts/deck-pdf.mjs` starts `npx astro preview --port 4321` detached and cleans up with a process-group kill (`killServer`) only. Astro 7 daemonises the server itself --- the surviving process is `astro preview --port 4321 --json`, outside the group we signal --- so the kill misses it and a `preview` server is left holding the port after the script exits 0.

`scripts/deck-check.mjs` already knows about this: it pairs its process-group kill with `stopBackgroundServer()` (`npx astro dev stop`) precisely for the detached case. deck-pdf has the kill but not the stop.

The symptom lands somewhere else entirely: the next `astromotion-check` run in any repo finds port 4321 occupied by the leaked server, its own dev server never comes up, and it fails with `✗ Dev server never became ready at http://localhost:4321/…` --- which reads like a broken deck rather than a stale process. Observed while porting decks to the fenced notes syntax: a `--notes` PDF export in llms-unplugged left a preview running that then failed a comp4020 decks:check, and the 404 page it served (from the wrong site) was the only clue.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Running astromotion-pdf leaves no server listening on the port when it exits, on success or failure
- [ ] #2 astromotion-check run straight after an astromotion-pdf export finds the port free
<!-- AC:END -->
