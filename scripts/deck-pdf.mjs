#!/usr/bin/env node
// Export an astromotion deck to PDF.
//
// Pipeline: astro build -> astro preview -> decktape (generic plugin,
// key-driven navigation) -> Ghostscript compression (optional but on by
// default: the raw decktape PDF rasterises every slide, so a deck with
// full-bleed backgrounds lands at 100 MB+; Ghostscript's /ebook preset cuts
// that to a few MB with no visible loss at presentation scale).
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

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, renameSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

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

// Scan puppeteer's browser cache for a previously downloaded
// Chrome-for-Testing binary, newest version first. A half-written cache entry
// (a version directory without the binary inside) both breaks puppeteer's own
// resolution and silently aborts its on-demand re-download, so only entries
// whose binary actually exists count.
function puppeteerCacheChrome() {
  const cacheDir = join(homedir(), ".cache", "puppeteer", "chrome");
  let versions;
  try {
    versions = readdirSync(cacheDir);
  } catch {
    return undefined;
  }
  const mac = "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
  return versions
    .toSorted()
    .toReversed()
    .flatMap((v) => [
      join(cacheDir, v, "chrome-linux64", "chrome"),
      join(cacheDir, v, "chrome-mac-arm64", mac),
      join(cacheDir, v, "chrome-mac-x64", mac),
    ])
    .find((b) => existsSync(b));
}

// decktape drives a real browser via puppeteer, whose on-demand Chromium
// download fails hard (and silently, under npx) if its cache holds a
// half-written entry. Prefer an explicit override, then the usual macOS and
// Linux install locations, then a complete binary already in puppeteer's own
// cache --- when one is found we pass it via --chrome-path and set
// PUPPETEER_SKIP_DOWNLOAD so puppeteer never has to find (or download) a
// browser itself. With no match anywhere we fall back to decktape's bundled
// Chromium, downloads and all, rather than failing on a browserless machine.
function findChrome() {
  const candidates = [
    process.env.DECKTAPE_CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ].filter(Boolean);
  return candidates.find((c) => existsSync(c)) ?? puppeteerCacheChrome();
}

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

const chromeArgs = (process.env.DECKTAPE_CHROME_ARGS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
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

  const printUrl = `${url}?print-pdf&showNotes=separate-page`;
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
      url,
      rawOutput,
    ],
    3,
    chromePath ? { ...process.env, PUPPETEER_SKIP_DOWNLOAD: "1" } : process.env,
  );
}

if (notes) {
  await captureNotes();
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
      "-dNOPAUSE",
      "-dQUIET",
      "-dBATCH",
      `-sOutputFile=${output}`,
      rawOutput,
    ]);
    unlinkSync(rawOutput);
  } else {
    console.warn("⚠ Ghostscript not found; keeping the uncompressed PDF.");
    renameSync(rawOutput, output);
  }
}

console.log(`\n✓ Wrote ${output}`);

// decktape (and its Chromium) can leave handles open that keep the event loop
// alive even after the PDF is written, so exit explicitly once it's done.
process.exit(0);
