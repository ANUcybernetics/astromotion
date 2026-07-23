import { execFile } from "node:child_process";
import { mkdir, readFile, rm, symlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parseHTML } from "linkedom";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = resolve(repoRoot, "test/fixtures/base-path-site");
const astroBin = resolve(
  dirname(createRequire(import.meta.url).resolve("astro/package.json")),
  "bin/astro.mjs",
);
const BASE = "/test-base";

/**
 * Deck pages are injected routes, so nothing the consumer writes can correct a
 * root-absolute URL astromotion emits into `<head>`. A build under a base path
 * is the only thing that catches it: `astro-broken-links-checker` cannot, since
 * `/favicon.svg` and `/test-base/favicon.svg` resolve to the same dist file.
 */
/**
 * The injected deck route names its entrypoint by package specifier
 * ("astromotion/pages/..."), so the fixture has to resolve the package. Linking
 * it here rather than committing the symlink keeps a repo-root cycle out of the
 * tree, and makes the fixture work on a fresh clone.
 */
async function linkPackage() {
  const dir = resolve(fixture, "node_modules");
  await mkdir(dir, { recursive: true });
  await symlink(repoRoot, resolve(dir, "astromotion"), "dir").catch((err) => {
    if (err.code !== "EEXIST") throw err;
  });
}

async function build(outDir: string, env: Record<string, string> = {}) {
  // Vitest injects BASE_URL/MODE/DEV/PROD/SSR into process.env. Inherited by the
  // child, they override the fixture's own `base`, and the build silently emits
  // root-absolute URLs — masking the very bug this test exists to catch.
  // NODE_ENV=test leaks the same way: Vite derives `import.meta.env.PROD` from
  // `(NODE_ENV || mode) === "production"`, so an inherited `test` would make a
  // real `astro build` look non-production and stop the published:false filter
  // firing. Dropping it lets Astro set NODE_ENV=production as a real build does.
  const parentEnv = { ...process.env };
  for (const key of ["BASE_URL", "MODE", "DEV", "PROD", "SSR", "NODE_ENV"]) delete parentEnv[key];

  await execFileAsync(process.execPath, [astroBin, "build", "--outDir", outDir], {
    cwd: fixture,
    env: { ...parentEnv, ...env },
  });
  const html = await readFile(resolve(fixture, outDir, "decks/sample/index.html"), "utf8");
  return parseHTML(html).document;
}

/**
 * Every internal URL the page emits, minus anchors and absolute URLs. Inline
 * `style` attributes matter as much as href/src: remarkDeckBg emits
 * `background-image: url(...)` there, which no downstream pass rewrites.
 */
function internalUrls(doc: Document): string[] {
  const attrUrls = Array.from(
    doc.querySelectorAll("[href], [src]"),
    (el) => el.getAttribute("href") ?? el.getAttribute("src") ?? "",
  );
  const styleUrls = [...doc.querySelectorAll("[style]")].flatMap((el) =>
    Array.from(
      (el.getAttribute("style") ?? "").matchAll(/url\(['"]?([^'")]+)['"]?\)/g),
      (m) => m[1],
    ),
  );
  return [...attrUrls, ...styleUrls].filter((u) => u.startsWith("/") && !u.startsWith("//"));
}

describe("deck head under a base path", () => {
  let configured: Document;
  let omitted: Document;

  beforeAll(async () => {
    await linkPackage();
    configured = await build("dist-configured", {
      FIXTURE_FAVICON: "/favicon.svg",
      FIXTURE_OG_IMAGE: "/og-image.svg",
    });
    omitted = await build("dist-omitted");
  }, 180_000);

  afterAll(async () => {
    await rm(resolve(fixture, "dist-configured"), { recursive: true, force: true });
    await rm(resolve(fixture, "dist-omitted"), { recursive: true, force: true });
  });

  it("prefixes every internal URL with the base path", () => {
    const unprefixed = internalUrls(configured).filter((u) => !u.startsWith(`${BASE}/`));
    expect(unprefixed).toEqual([]);
  });

  it("base-prefixes deck bg images and copies the asset into dist", async () => {
    const bg = configured.querySelector(".slide-bg");
    expect(bg?.getAttribute("style")).toContain(`url('${BASE}/src/decks/assets/bg.svg')`);
    const copied = resolve(fixture, "dist-configured/src/decks/assets/bg.svg");
    await expect(readFile(copied, "utf8")).resolves.toContain("<svg");
  });

  it("emits a base-prefixed favicon when one is configured", () => {
    const icon = configured.querySelector('link[rel="icon"]');
    expect(icon?.getAttribute("href")).toBe(`${BASE}/favicon.svg`);
  });

  it("qualifies og:image against the site and base", () => {
    const og = configured.querySelector('meta[property="og:image"]');
    expect(og?.getAttribute("content")).toBe(`https://example.test${BASE}/og-image.svg`);
  });

  it("emits no favicon link when none is configured", () => {
    expect(omitted.querySelector('link[rel="icon"]')).toBeNull();
  });

  it("emits no social image tags when none is configured", () => {
    expect(omitted.querySelector('meta[property="og:image"]')).toBeNull();
    expect(omitted.querySelector('meta[name="twitter:image"]')).toBeNull();
    expect(omitted.querySelector('meta[name="twitter:card"]')?.getAttribute("content")).toBe(
      "summary",
    );
  });

  // The fixture ships two decks: `sample` (published) and `draft`
  // (published:false). A production build must emit the first and drop the
  // second, so its URL serves nothing and Pagefind has no HTML to index.
  it("drops a published:false deck from the production build", async () => {
    const draft = resolve(fixture, "dist-omitted/decks/draft/index.html");
    await expect(readFile(draft, "utf8")).rejects.toThrow();
    const sample = resolve(fixture, "dist-omitted/decks/sample/index.html");
    await expect(readFile(sample, "utf8")).resolves.toContain("Slide one");
  });
});
