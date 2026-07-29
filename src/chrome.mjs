// Finding a Chrome/Chromium binary to drive, shared by the scripts that need
// one (`astromotion-pdf`, `astromotion-check`).

import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Scan puppeteer's browser cache for a previously downloaded
// Chrome-for-Testing binary, newest version first. A half-written cache entry
// (a version directory without the binary inside) both breaks puppeteer's own
// resolution and silently aborts its on-demand re-download, so only entries
// whose binary actually exists count.
export function puppeteerCacheChrome() {
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

// Prefer an explicit override, then the usual macOS and Linux install
// locations, then a complete binary already in puppeteer's own cache.
// `DECKTAPE_CHROME_PATH` is the older name and still honoured: it predates
// this helper being shared with a script that has nothing to do with decktape.
// Returns undefined when nothing is found; callers decide whether that is
// fatal (`astromotion-check`, which drives Chrome itself) or recoverable
// (`astromotion-pdf`, which can fall back to decktape's bundled Chromium).
export function findChrome() {
  const candidates = [
    process.env.ASTROMOTION_CHROME_PATH,
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

// Chrome flags from the environment, e.g. "--no-sandbox" for containers and
// Linux setups with AppArmor user-namespace restrictions.
export function chromeArgs() {
  return (process.env.ASTROMOTION_CHROME_ARGS ?? process.env.DECKTAPE_CHROME_ARGS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
