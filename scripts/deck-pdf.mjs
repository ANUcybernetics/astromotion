#!/usr/bin/env node
// Export an astromotion deck to PDF.
//
// Pipeline: astro build -> astro preview -> decktape (generic plugin,
// key-driven navigation) -> pdftocairo transparency flattening -> Ghostscript
// compression (optional but on by default: the raw decktape PDF rasterises
// every slide, so a deck with full-bleed backgrounds lands at 100 MB+;
// Ghostscript's /ebook preset cuts that to a few MB with no visible loss at
// presentation scale) -> ICC repair (Ghostscript leaves every image tagged
// with an empty colour profile, which Safari and Preview then refuse to draw
// --- see src/pdf-icc.mjs) -> a second pdftocairo pass, which re-emits the
// compressed file in a structure macOS Quartz draws correctly (see
// flattenTransparency).
//
// With --notes the deck is instead printed via headless Chrome against
// Reveal's print view (?print-pdf&showNotes=separate-page), producing a
// presenter guide with each slide followed by its speaker-notes page.
// decktape can't do this (it screenshots slides one by one), so this mode
// drives Chrome directly through puppeteer-core --- an optional peer
// dependency your project must install to use --notes.
//
// Usage: astromotion-pdf <slug> [output.pdf] [options]
//   --prefix=/decks   route prefix the site serves decks under
//   --port=4321       preview server port
//   --no-compress     skip Ghostscript and keep the raw decktape PDF
//   --notes           presenter guide: slides + interleaved speaker-notes
//                     pages (default output <slug>-notes.pdf; requires
//                     puppeteer-core and a local Chrome/Chromium)
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
    "Usage: astromotion-pdf <slug> [output.pdf] [--prefix=/decks] [--port=4321] [--no-compress] [--notes]",
  );
  process.exit(1);
}

const notes = flags.includes("--notes");
const output = resolve(positional[1] ?? `${slug}${notes ? "-notes" : ""}.pdf`);
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
console.log(`Starting preview server on port ${port}...`);
const server = spawn("npx", ["astro", "preview", "--port", port], {
  stdio: "ignore",
  detached: true,
  env: { ...process.env, ASTRO_DISABLE_DEV_TOOLBAR: "true" },
});

const killServer = () => {
  try {
    if (server.pid) process.kill(-server.pid, "SIGTERM");
  } catch {
    // already gone
  }
};
process.on("exit", killServer);

await waitForServer(url);

// If we're compressing, decktape writes a raw file we hand to Ghostscript;
// the user only ever sees `output`.
const rawOutput = compress ? `${output}.raw.pdf` : output;

const chromeArgs = resolveChromeArgs();
const maxSlides = process.env.DECKTAPE_MAX_SLIDES ?? "500";
const decktapeVersion = process.env.DECKTAPE_VERSION ?? "3.16.1";

// Presenter-guide mode: load Reveal's print view and let Chrome print it.
// `preferCSSPageSize: true` is essential --- Reveal declares
// `@page { size: 1280px 720px }`, and letting Chrome letterbox that onto
// A4/letter drifts the page breaks (see theme/print.css).
async function captureNotes() {
  if (!chromePath) {
    console.error(
      "✗ --notes needs a Chrome/Chromium binary (install one or set DECKTAPE_CHROME_PATH).",
    );
    process.exit(1);
  }
  let puppeteer;
  try {
    ({ default: puppeteer } = await import("puppeteer-core"));
  } catch {
    console.error(
      "✗ --notes requires puppeteer-core (an optional peer dependency).\n" +
        "  Install it in your project: pnpm add -D puppeteer-core",
    );
    process.exit(1);
  }

  const printUrl = `${exportUrl}&print-pdf&showNotes=separate-page`;
  console.log("Printing slides + notes with headless Chrome...");
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

// Ghostscript's pdfwrite cannot reproduce the shading Chrome emits for a
// gradient whose alpha varies --- a `.hero` scrim, or any translucent overlay.
// Chrome splits such a gradient into a colour layer (a function-based,
// ShadingType 1 pattern) behind a luminosity soft mask; pdfwrite keeps the
// mask, converts the colour layer to a form XObject, and writes that form
// EMPTY. The overlay disappears and the slide prints with its text sitting on
// undimmed artwork. No preset, compatibility level or colour-conversion
// strategy avoids it (all of /ebook /printer /default, PDF 1.4 through 1.7,
// tested on gs 10.02).
//
// So flatten the transparency before gs ever sees it. pdftocairo composites
// every group down to plain opaque marks, keeps text as text and fonts
// embedded, and leaves a file gs then compresses without touching an overlay
// that no longer exists.
//
// Without poppler we do NOT compress: a correct large PDF beats a small one
// with washed-out slides, and this failure is invisible in a file listing.
//
// The same pass runs AGAIN after Ghostscript. pdfwrite keeps a multiply-
// blended overlay (astro-theme-university's hero scrim is an opaque grey
// gradient under /BM /Multiply) but rewrites it as a form XObject sharing the
// page's transparency group, and macOS Quartz --- Preview, Safari, Quick Look
// --- draws that form as a near-uniform ~75% darkening of the whole slide
// instead of the gradient. poppler, MuPDF and Chrome's PDFium draw it
// correctly, so the file looks fine everywhere except on a Mac. Re-emitting
// through cairo restores a structure Quartz handles; the JPEGs Ghostscript
// produced pass through untouched, so the size barely moves.
function flattenTransparency(file) {
  const flat = `${file}.flat.pdf`;
  const result = spawnSync("pdftocairo", ["-pdf", file, flat], { stdio: "ignore" });
  if (result.status !== 0) return false;
  renameSync(flat, file);
  return true;
}

if (notes) {
  await captureNotes();
} else {
  captureSlides();
}

killServer();

if (compress) {
  const hasGhostscript = spawnSync("gs", ["--version"], { stdio: "ignore" }).status === 0;
  const hasPoppler = spawnSync("pdftocairo", ["-v"], { stdio: "ignore" }).status === 0;
  if (!hasGhostscript) {
    console.warn("⚠ Ghostscript not found; keeping the uncompressed PDF.");
    renameSync(rawOutput, output);
  } else if (!hasPoppler) {
    console.warn(
      "⚠ pdftocairo (poppler-utils) not found; keeping the uncompressed PDF.\n" +
        "  Ghostscript on its own silently erases translucent overlays --- a\n" +
        "  hero scrim prints as undimmed artwork --- and a wrong PDF looks the\n" +
        "  same as a right one in a file listing. Install poppler-utils to get\n" +
        "  a compressed deck.",
    );
    renameSync(rawOutput, output);
  } else {
    console.log("Flattening transparency with pdftocairo...");
    if (!flattenTransparency(rawOutput)) {
      console.error("\n✗ pdftocairo failed to flatten the deck");
      process.exit(1);
    }
    console.log("Compressing with Ghostscript...");
    run("gs", [
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.4",
      "-dPDFSETTINGS=/ebook",
      // /ebook re-encodes ICC-based images, which shifts the flattened
      // artwork's colour for no gain at presentation scale. Leaving colours
      // alone costs ~15% file size; the slides still downsample normally.
      "-dColorConversionStrategy=/LeaveColorUnchanged",
      "-dNOPAUSE",
      "-dQUIET",
      "-dBATCH",
      `-sOutputFile=${output}`,
      rawOutput,
    ]);
    unlinkSync(rawOutput);
    repairIcc(output);
    console.log("Re-emitting with pdftocairo for Quartz...");
    if (!flattenTransparency(output)) {
      console.error("\n✗ pdftocairo failed to re-emit the compressed deck");
      process.exit(1);
    }
  }
}

console.log(`\n✓ Wrote ${output}`);

// decktape (and its Chromium) can leave handles open that keep the event loop
// alive even after the PDF is written, so exit explicitly once it's done.
process.exit(0);
