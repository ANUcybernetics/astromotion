#!/usr/bin/env node
// Check every slide of every deck for content that does not fit.
//
// Reveal scales a fixed 1280x720 canvas, so "too much for one slide" is a
// layout fact, not a matter of taste --- but it is invisible until you present
// it, and one failure mode (a squashed code block, see src/deck-check.mjs) is
// invisible even then. This walks each deck a slide at a time in headless
// Chrome and reports what overflows or is clipped.
//
// It runs against `astro dev`, not a production build, deliberately: decks
// with `published: false` are absent from a production build, and those are
// exactly the decks still being written --- the ones worth checking.
//
// Usage: astromotion-check [slug...] [options]
//   --prefix=/decks   route prefix the site serves decks under
//   --dir=src/decks   where the *.deck.mdx files live
//   --port=4321       dev server port
//   --tolerance=4     canvas px of slack before a slide is reported
//   --json            machine-readable output
//
// With no slugs, every deck under --dir is checked.
//
// Environment:
//   ASTROMOTION_CHROME_PATH  Chrome/Chromium binary (overrides discovery)
//   ASTROMOTION_CHROME_ARGS  comma-separated Chrome flags, e.g. "--no-sandbox"
//                            (needed in containers and some Linux setups)
//
// Slides gated behind `_if:` are checked in their default state only: the
// conditional slides are removed from the DOM before Reveal reads it, so a
// deck whose `?presenters` view differs needs its own run against that URL.
//
// Exits 1 if any slide has a violation, so it can gate a release --- but it
// needs a browser and a dev server, so it is a deliberate command rather than
// part of `astro build`.

import { spawn, spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import { chromeArgs, findChrome } from "../src/chrome.mjs";
import { measureSlide, TEXT_SELECTOR } from "../src/deck-check.mjs";

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const slugArgs = args.filter((a) => !a.startsWith("--"));
const flagValue = (name) =>
  flags
    .find((f) => f.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");

const usage =
  "Usage: astromotion-check [slug...] [--prefix=/decks] [--dir=src/decks] " +
  "[--port=4321] [--tolerance=4] [--json]";

const known = new Set(["--json"]);
const unknown = flags.filter((f) => !known.has(f) && !/^--(prefix|dir|port|tolerance)=/.test(f));
if (unknown.length > 0) {
  console.error(
    `✗ Unknown option${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}\n${usage}`,
  );
  process.exit(1);
}

const prefix = (flagValue("prefix") ?? "/decks").replace(/\/+$/, "");
const deckDir = resolve(flagValue("dir") ?? "src/decks");
const port = flagValue("port") ?? "4321";
const tolerance = Number(flagValue("tolerance") ?? 4);
const json = flags.includes("--json");

if (!Number.isFinite(tolerance) || tolerance < 0) {
  console.error(`✗ --tolerance must be a non-negative number\n${usage}`);
  process.exit(1);
}

let slugs = slugArgs;
if (slugs.length === 0) {
  let entries;
  try {
    entries = readdirSync(deckDir);
  } catch {
    console.error(`✗ No deck directory at ${deckDir} (pass --dir=…)`);
    process.exit(1);
  }
  slugs = entries
    .filter((f) => f.endsWith(".deck.mdx"))
    .map((f) => f.slice(0, -".deck.mdx".length))
    .toSorted();
}
if (slugs.length === 0) {
  console.error(`✗ No *.deck.mdx files in ${deckDir}`);
  process.exit(1);
}

// puppeteer-core is an optional peer: only the scripts that drive Chrome
// directly need it, and a consumer that never runs them should not carry it.
let puppeteer;
try {
  puppeteer = (await import("puppeteer-core")).default;
} catch {
  console.error(
    "✗ astromotion-check needs puppeteer-core (an optional peer dependency).\n" +
      "  Install it in your project:  pnpm add -D puppeteer-core",
  );
  process.exit(1);
}

const chromePath = findChrome();
if (!chromePath) {
  console.error(
    "✗ No Chrome or Chromium found. Install one, or point ASTROMOTION_CHROME_PATH\n" +
      "  at a binary, or fetch one with:  npx puppeteer browsers install chrome",
  );
  process.exit(1);
}

async function waitForServer(target) {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(target);
      if (res.ok) return;
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.error(`✗ Dev server never became ready at ${target}`);
  process.exit(1);
}

// Astro detaches the dev server itself when it detects an agent environment,
// in which case the process we spawn exits immediately and the real server
// outlives it --- so signalling our own process group is not enough to clean
// up, and a leaked server from an earlier run serves stale modules to this
// one. `astro dev stop` handles the detached case; the process-group kill
// handles the foreground one. Both are best-effort.
const stopBackgroundServer = () => spawnSync("npx", ["astro", "dev", "stop"], { stdio: "ignore" });

stopBackgroundServer();

// `detached` puts the dev server in its own process group so the whole tree
// can be signalled: npx spawns astro which spawns the real server, and
// killing just the npx wrapper leaves the server alive and the script hanging.
const server = spawn("npx", ["astro", "dev", "--port", port], {
  detached: true,
  env: { ...process.env, ASTRO_DISABLE_DEV_TOOLBAR: "true" },
  stdio: "ignore",
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
process.on("SIGINT", () => process.exit(130));

const base = `http://localhost:${port}`;
await waitForServer(`${base}${prefix}/${slugs[0]}/`);

let browser;
try {
  browser = await puppeteer.launch({
    args: chromeArgs(),
    executablePath: chromePath,
    headless: true,
  });
} catch (error) {
  // Chrome's own failure output is a page of C++ frames. The overwhelmingly
  // common cause on Linux is the sandbox: distros that restrict unprivileged
  // user namespaces (Ubuntu's AppArmor default since 23.10) make Chrome abort
  // before it prints anything useful.
  console.error(
    `✗ Chrome failed to start (${chromePath}).\n` +
      "  On Linux this is usually the user-namespace sandbox. Retry with:\n" +
      "    ASTROMOTION_CHROME_ARGS=--no-sandbox\n" +
      `  Original error: ${String(error).split("\n")[0]}`,
  );
  process.exit(1);
}
const page = await browser.newPage();
// Match the Reveal canvas exactly, so measurements need no rescaling and
// nothing reflows differently from the projector.
await page.setViewport({ height: 720, width: 1280 });

const results = [];
let checkedSlides = 0;

for (const slug of slugs) {
  const url = `${base}${prefix}/${slug}/`;
  const response = await page.goto(url, { waitUntil: "networkidle0" });
  if (!response?.ok()) {
    results.push({ deck: slug, error: `HTTP ${response?.status() ?? "?"} at ${url}` });
    continue;
  }
  try {
    await page.waitForSelector(".reveal .slides > section", { timeout: 15_000 });
  } catch {
    results.push({ deck: slug, error: `no slides rendered at ${url}` });
    continue;
  }
  // Text measured against fallback metrics is wrong in both directions, so
  // wait for the real fonts before believing any box.
  await page.evaluate(() => document.fonts.ready);

  const count = await page.evaluate(
    () => document.querySelectorAll(".reveal .slides > section").length,
  );

  for (let i = 0; i < count; i++) {
    // Reveal's hash is one-based (hashOneBasedIndex), and transitions are
    // off, so a hash change plus a paint is all the settling needed.
    await page.evaluate((n) => {
      location.hash = `#/${n}`;
    }, i + 1);
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );

    // measureSlide closes over nothing, so puppeteer's toString() serialisation
    // carries it into the page intact.
    const measured = await page.evaluate(measureSlide, TEXT_SELECTOR, tolerance);
    checkedSlides++;
    for (const v of measured.violations ?? []) {
      results.push({
        deck: slug,
        detail: v.detail,
        heading: measured.heading,
        rule: v.rule,
        slide: i + 1,
      });
    }
  }
}

await browser.close();
killServer();

const failures = results.filter((r) => r.error || r.rule);

if (json) {
  console.log(JSON.stringify({ checkedSlides, decks: slugs, violations: failures }, null, 2));
} else if (failures.length === 0) {
  console.log(`✓ Checked ${checkedSlides} slide(s) across ${slugs.length} deck(s) — all fit.`);
} else {
  console.error(`\n✗ ${failures.length} slide issue(s):\n`);
  for (const f of failures) {
    if (f.error) {
      console.error(`  ${f.deck}: ${f.error}`);
    } else {
      const where = f.heading ? ` "${f.heading}"` : "";
      console.error(`  ${f.deck} slide ${f.slide}${where} — ${f.rule}: ${f.detail}`);
    }
  }
  console.error("");
}

process.exit(failures.length === 0 ? 0 : 1);
