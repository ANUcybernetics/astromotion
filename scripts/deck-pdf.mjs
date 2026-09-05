#!/usr/bin/env node
// Export an astromotion deck to PDF.
//
// Pipeline: astro build -> astro preview -> decktape (generic plugin,
// key-driven navigation) -> Ghostscript compression (optional but on by
// default: the raw decktape PDF rasterises every slide, so a deck with
// full-bleed backgrounds lands at 100 MB+; Ghostscript's /ebook preset cuts
// that to a few MB with no visible loss at presentation scale) -> ICC repair
// (Ghostscript leaves every image tagged with an empty colour profile, which
// Safari and Preview then refuse to draw --- see src/pdf-icc.mjs).
//
// Translucent overlays survive that pipeline only as images with an alpha
// channel (astro-theme-university's hero scrim is one). A CSS gradient whose
// alpha varies reaches the PDF as a shading behind a luminosity soft mask,
// which pdfwrite writes out empty, and an opaque gradient under a blend mode
// survives pdfwrite but macOS Quartz then misdraws it. Re-emitting the file
// through pdftocairo before and after Ghostscript papered over both, at the
// cost of baking poppler's brighter reading of translucent SVG fills into
// every viewer; the export now runs Ghostscript alone and leaves the overlay
// primitive to the theme.
//
// With --notes or --handout the deck is instead printed via headless Chrome
// against Reveal's print view (?print-pdf&showNotes=separate-page): --notes
// gives a presenter guide with each slide followed by its speaker-notes page,
// --handout imposes the same material three rows to a landscape A4 page with
// each slide beside its own notes. decktape can't do either (it screenshots
// slides one by one), so both drive Chrome directly through puppeteer-core ---
// an optional peer dependency your project must install to use them.
//
// Usage: astromotion-pdf <slug> [output.pdf] [options]
//   --prefix=/decks   route prefix the site serves decks under
//   --port=4321       preview server port
//   --no-compress     skip Ghostscript and keep the raw decktape PDF
//   --notes           presenter guide: slides + interleaved speaker-notes
//                     pages (default output <slug>-notes.pdf; requires
//                     puppeteer-core and a local Chrome/Chromium)
//   --handout         lectern handout: three slide-and-notes rows to a
//                     landscape A4 page (default output <slug>-handout.pdf;
//                     same requirements as --notes)
//
// Environment:
//   DECKTAPE_CHROME_PATH  Chrome/Chromium binary (overrides discovery)
//   DECKTAPE_CHROME_ARGS  comma-separated Chrome flags, e.g. "--no-sandbox"
//                         (needed in containers and some Linux setups)
//   DECKTAPE_MAX_SLIDES   safety cap on exported slides (default 500); the
//                         generic plugin stops at the last slide on its own
//   DECKTAPE_VERSION      decktape version npx runs (default 3.16.1)
//
// Runaway exports: the generic plugin decides the deck is over when a
// MutationObserver over the whole document sees nothing change for a second
// after ArrowRight, so ANY element that keeps redrawing defeats it and the
// export grinds to DECKTAPE_MAX_SLIDES, silently emitting hundreds of
// duplicate trailing pages. Both capture modes therefore load the deck with
// `?astromotion-export`, which stops repeating timers (see DeckHead.astro). A
// widget animating by some other route --- CSS keyframes that mutate the DOM,
// a canvas driven by requestAnimationFrame --- can still run an export away;
// hide it for the export (`_if:` gates a whole slide, and
// `[data-astromotion-export]` any part of one) rather than raising the cap.

import { spawn, spawnSync } from "node:child_process";
import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { findChrome, chromeArgs as resolveChromeArgs } from "../src/chrome.mjs";
import { repairEmptyIccColorSpaces } from "../src/pdf-icc.mjs";

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const positional = args.filter((a) => !a.startsWith("--"));
const flagValue = (name) =>
  flags
    .find((f) => f.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");

const slug = positional[0];
if (!slug) {
  console.error(
    "Usage: astromotion-pdf <slug> [output.pdf] [--prefix=/decks] [--port=4321] [--no-compress] [--notes] [--handout]",
  );
  process.exit(1);
}

const notes = flags.includes("--notes");
const handout = flags.includes("--handout");
if (notes && handout) {
  console.error("✗ --notes and --handout are separate outputs; run the export once for each.");
  process.exit(1);
}
const suffix = notes ? "-notes" : handout ? "-handout" : "";
const output = resolve(positional[1] ?? `${slug}${suffix}.pdf`);
const compress = !flags.includes("--no-compress");
const prefix = (flagValue("prefix") ?? "/decks").replace(/\/+$/, "");
const port = flagValue("port") ?? "4321";
const url = `http://localhost:${port}${prefix}/${slug}/`;
// Both capture modes ask the deck for its still-frame behaviour: no repeating
// timers, so a live widget can't keep the DOM changing (see DeckHead.astro).
const exportUrl = `${url}?astromotion-export`;

// Chrome discovery lives in src/chrome.mjs, shared with astromotion-check.
// decktape drives a real browser via puppeteer; when we find a complete
// binary we pass it via --chrome-path and set PUPPETEER_SKIP_DOWNLOAD so
// puppeteer never has to find (or download) one itself. With no match
// anywhere we fall back to decktape's bundled Chromium, downloads and all,
// rather than failing on a browserless machine.

function run(command, cmdArgs, env = process.env) {
  const result = spawnSync(command, cmdArgs, { stdio: "inherit", env });
  if (result.status !== 0) {
    console.error(`\n✗ ${command} failed (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
}

// decktape occasionally dies mid-capture with "Attempted to use detached
// Frame" --- a timing bug in its progress-bar code, not a problem with the
// deck. It's intermittent, so just retry the whole capture a few times.
function runWithRetry(command, cmdArgs, attempts, env = process.env) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = spawnSync(command, cmdArgs, { stdio: "inherit", env });
    if (result.status === 0) return;
    console.warn(
      `⚠ decktape attempt ${attempt}/${attempts} failed (exit ${result.status})` +
        (attempt < attempts ? " --- retrying" : ""),
    );
  }
  console.error(`\n✗ decktape failed after ${attempts} attempts`);
  process.exit(1);
}

async function waitForServer(target) {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(target);
      if (res.ok) return;
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error(`✗ Preview server never became ready at ${target}`);
  process.exit(1);
}

const chromePath = findChrome();
if (chromePath) console.log(`Using browser: ${chromePath}`);

console.log("Building site...");
run("npx", ["astro", "build"]);

// `detached` puts the preview in its own process group so we can later kill
// the whole tree: `npx` spawns astro which spawns the real server, and
// signalling just the npx wrapper leaves the server (and its open handles)
// alive, hanging the script. `stdio: "ignore"` keeps an undrained pipe from
// filling during the long synchronous decktape run --- another way the script
// can wedge.
// Astro 7 daemonises the preview server, so the process that ends up holding
// the port is outside the group we spawn and a group kill alone leaves it
// running --- and a leftover daemon then makes the NEXT export (or
// astromotion-check) fail with "never became ready" against a server from
// whichever site ran last. `astro preview stop` is how Astro takes its own
// daemon down; run it before starting (a stale one blocks a fresh start) and
// again on the way out. Both are best-effort.
const stopBackgroundServer = () =>
  spawnSync("npx", ["astro", "preview", "stop"], { stdio: "ignore" });

stopBackgroundServer();

console.log(`Starting preview server on port ${port}...`);
const server = spawn("npx", ["astro", "preview", "--port", port], {
  stdio: "ignore",
  detached: true,
  env: { ...process.env, ASTRO_DISABLE_DEV_TOOLBAR: "true" },
});

let stopped = false;
const killServer = () => {
  if (stopped) return;
  stopped = true;
  try {
    if (server.pid) process.kill(-server.pid, "SIGTERM");
  } catch {
    // already gone
  }
  stopBackgroundServer();
};
process.on("exit", killServer);

await waitForServer(url);

// If we're compressing, decktape writes a raw file we hand to Ghostscript;
// the user only ever sees `output`.
const rawOutput = compress ? `${output}.raw.pdf` : output;

const chromeArgs = resolveChromeArgs();
const maxSlides = process.env.DECKTAPE_MAX_SLIDES ?? "500";
const decktapeVersion = process.env.DECKTAPE_VERSION ?? "3.16.1";

// Presenter-guide and handout modes: load Reveal's print view and let Chrome
// print it. `preferCSSPageSize: true` is essential --- the page size comes
// from a CSS `@page` rule (Reveal's own `1280px 720px` for --notes, the
// landscape A4 the handout swaps in for it), and letting Chrome letterbox that
// onto its default paper drifts every page break (see theme/print.css).
//
// `prepare` runs in the page once it has settled and before the print, and is
// where --handout rewrites the DOM.
async function printWithChrome(mode, query, prepare) {
  if (!chromePath) {
    console.error(
      `✗ ${mode} needs a Chrome/Chromium binary (install one or set DECKTAPE_CHROME_PATH).`,
    );
    process.exit(1);
  }
  let puppeteer;
  try {
    ({ default: puppeteer } = await import("puppeteer-core"));
  } catch {
    console.error(
      `✗ ${mode} requires puppeteer-core (an optional peer dependency).\n` +
        "  Install it in your project: pnpm add -D puppeteer-core",
    );
    process.exit(1);
  }

  const printUrl = `${exportUrl}&print-pdf&showNotes=separate-page${query}`;
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    args: chromeArgs,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    // networkidle0 waits for every slide's assets (the print view renders the
    // whole deck at once); a deck with a long-polling embed may never go
    // idle, so a timeout degrades to a warning rather than aborting.
    try {
      await page.goto(printUrl, { waitUntil: "networkidle0", timeout: 60_000 });
    } catch {
      console.warn("⚠ Page never went network-idle; printing anyway.");
    }
    await page.evaluate(() => document.fonts.ready);
    // Same settling pause decktape mode uses (--load-pause): backgrounds and
    // late layout work have no load event to await.
    await new Promise((r) => setTimeout(r, 5000));
    if (prepare) await page.evaluate(prepare);
    await page.pdf({
      path: rawOutput,
      preferCSSPageSize: true,
      printBackground: true,
      timeout: 300_000,
    });
  } finally {
    await browser.close();
  }
}

function captureNotes() {
  console.log("Printing slides + notes with headless Chrome...");
  return printWithChrome("--notes", "");
}

// The handout is the notes print view re-imposed: Reveal leaves `.slides`
// holding a flat run of `.pdf-page` elements, each followed by the
// `.speaker-notes-pdf` page for that slide (a slide without notes gets none),
// and this pairs them up into rows that theme/print.css lays out three to a
// landscape A4 page.
//
// `pdfSeparateFragments=false` is what makes the pairing one row per slide:
// left on, Reveal emits a page per fragment step and hangs the notes off the
// first of them, so a slide with a three-step build would take four rows, one
// carrying the notes and three blank beside a nearly identical thumbnail. Off,
// each slide prints once with its build complete --- which is what a lectern
// copy wants anyway.
function captureHandout() {
  console.log("Printing handout with headless Chrome...");
  return printWithChrome("--handout", "&pdfSeparateFragments=false", () => {
    const slides = document.querySelector(".reveal .slides");
    const children = [...slides.children];

    // The canvas size has to be read before the rewrite: `.pdf-page` gets its
    // width from filling `.slides`, so once it sits in a thumbnail box it
    // would measure 88mm rather than the deck's own 1280px.
    const first = children.find((el) => el.classList.contains("pdf-page"));
    if (!first) throw new Error("handout: the print view produced no slide pages");
    const canvasWidth = first.offsetWidth;
    const canvasHeight = first.offsetHeight;

    const boxes = [];
    for (let i = 0; i < children.length; i++) {
      const slide = children[i];
      if (!slide.classList.contains("pdf-page")) continue;

      const row = document.createElement("div");
      row.className = "astromotion-handout-row";
      slides.insertBefore(row, slide);

      const box = document.createElement("div");
      box.className = "astromotion-handout-slide";
      row.appendChild(box);
      box.appendChild(slide);
      slide.style.width = `${canvasWidth}px`;
      slide.style.height = `${canvasHeight}px`;
      boxes.push(box);

      const next = children[i + 1];
      const notes = next?.classList.contains("speaker-notes-pdf")
        ? next
        : Object.assign(document.createElement("div"), {
            className: "speaker-notes speaker-notes-pdf",
          });
      // A stand-in for a slide with no notes still needs the attribute the
      // notes styles key off, so the empty cell measures like a full one.
      notes.setAttribute("data-layout", "separate-page");
      row.appendChild(notes);
      if (notes === next) i++;
    }

    document.documentElement.classList.add("astromotion-handout");

    // Reveal sizes the printed page by injecting `@page { size: <slide> }`
    // into a <style> element; the handout is landscape A4, so drop that rule
    // and write our own. Only Reveal's rule matches: the deck's own CSS
    // arrives as a linked stylesheet, and this is the one @page in the
    // document that names a size.
    for (const style of document.head.querySelectorAll("style")) {
      if (/@page\s*\{[^}]*\bsize\b/.test(style.textContent)) style.remove();
    }
    const pageRule = document.createElement("style");
    pageRule.textContent = "@page { size: A4 landscape; margin: 6mm 10mm; }";
    document.head.appendChild(pageRule);

    // The thumbnail's width is set in millimetres by the stylesheet and the
    // canvas is in pixels, so the scale between them can only be measured, and
    // only once the row is laid out. The height then has to be written back as
    // a definite length rather than left to `aspect-ratio`: a grid item with an
    // auto height stretches to the row, and Chrome resolves that stretch
    // differently when paginating than it does on screen.
    const scale = boxes[0].getBoundingClientRect().width / canvasWidth;
    document.documentElement.style.setProperty("--astromotion-handout-slide-scale", `${scale}`);
    for (const box of boxes) box.style.height = `${canvasHeight * scale}px`;
  });
}

// decktape's `reveal` plugin can't drive astromotion decks: it requires a
// global `Reveal` exposing `availableFragments`, but astromotion initialises
// reveal.js 6 as an ES module and never puts it on `window`, so the plugin
// refuses to activate. We use the `generic` plugin instead, which navigates by
// key press (ArrowRight steps through fragments and slides) and stops once a
// frame repeats --- no Reveal API needed, so it's robust across reveal.js
// versions. Each frame is captured in its settled state, so auto-animate
// slides export correctly.
function captureSlides() {
  console.log("Capturing slides with decktape...");
  runWithRetry(
    "npx",
    [
      "--yes",
      `decktape@${decktapeVersion}`,
      "generic",
      // `=` form throughout: decktape's parser otherwise reads a flag-like
      // value (e.g. `--chrome-arg --no-sandbox`) as the next option and bails.
      "--key=ArrowRight",
      `--max-slides=${maxSlides}`,
      "--size=1280x720",
      "--load-pause=5000",
      "--pause=2500",
      ...(chromePath ? [`--chrome-path=${chromePath}`] : []),
      ...chromeArgs.map((a) => `--chrome-arg=${a}`),
      exportUrl,
      rawOutput,
    ],
    3,
    chromePath ? { ...process.env, PUPPETEER_SKIP_DOWNLOAD: "1" } : process.env,
  );
}

// Ghostscript hands back a file whose every image is tagged with an empty ICC
// profile, which Safari and Preview refuse to draw (see src/pdf-icc.mjs). The
// repair is a same-length byte patch, so it can't disturb the file gs wrote.
function repairIcc(file) {
  const { bytes, patched } = repairEmptyIccColorSpaces(readFileSync(file));
  if (patched.length === 0) return;
  writeFileSync(file, bytes);
  console.log(
    `Repaired ${patched.length} empty ICC colour space(s) → ` +
      `${[...new Set(patched.map((p) => p.space))].join(", ")}`,
  );
}

if (notes) {
  await captureNotes();
} else if (handout) {
  await captureHandout();
} else {
  captureSlides();
}

killServer();

if (compress) {
  const hasGhostscript = spawnSync("gs", ["--version"], { stdio: "ignore" }).status === 0;
  if (hasGhostscript) {
    console.log("Compressing with Ghostscript...");
    run("gs", [
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.4",
      "-dPDFSETTINGS=/ebook",
      // /ebook re-encodes ICC-based images, which shifts the artwork's
      // colour for no gain at presentation scale. Leaving colours alone costs
      // ~15% file size; the slides still downsample normally.
      "-dColorConversionStrategy=/LeaveColorUnchanged",
      "-dNOPAUSE",
      "-dQUIET",
      "-dBATCH",
      `-sOutputFile=${output}`,
      rawOutput,
    ]);
    unlinkSync(rawOutput);
    repairIcc(output);
  } else {
    console.warn("⚠ Ghostscript not found; keeping the uncompressed PDF.");
    renameSync(rawOutput, output);
  }
}

console.log(`\n✓ Wrote ${output}`);

// decktape (and its Chromium) can leave handles open that keep the event loop
// alive even after the PDF is written, so exit explicitly once it's done.
process.exit(0);
