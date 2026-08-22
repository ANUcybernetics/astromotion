import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { parseHTML } from "linkedom";

export interface DeckViolation {
  page: string;
  rule: string;
  detail: string;
}

export interface DeckPage {
  file: string;
  html: string;
}

async function collectHtmlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collectHtmlFiles(path)));
    else if (entry.name.endsWith(".html")) files.push(path);
  }
  return files;
}

/** Identify built decks by their Reveal wrapper rather than their route: a
 * consumer can mount decks at any prefix. */
export async function collectDeckPages(distDir: string): Promise<DeckPage[]> {
  let all: string[];
  try {
    all = await collectHtmlFiles(distDir);
  } catch {
    return [];
  }
  const decks: DeckPage[] = [];
  for (const file of all) {
    const html = await readFile(file, "utf-8");
    if (!html.includes("reveal")) continue;
    const { document } = parseHTML(html);
    if (document.querySelector(".reveal .slides")) decks.push({ file, html });
  }
  return decks;
}

function isUnpublishedDeckSource(content: string): boolean {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!frontmatter) return false;
  return /^\s*published:\s*false\s*(#.*)?$/m.test(frontmatter[1]);
}

/** Count source decks expected in a production build. */
export async function countSourceDecks(dir: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let count = 0;
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += await countSourceDecks(join(dir, entry.name));
    } else if (/\.deck\.[^./]+$/.test(entry.name)) {
      let content = "";
      try {
        content = await readFile(join(dir, entry.name), "utf-8");
      } catch {
        count += 1;
        continue;
      }
      if (!isUnpublishedDeckSource(content)) count += 1;
    }
  }
  return count;
}

export function checkDeckHtml(html: string, page: string): DeckViolation[] {
  const { document } = parseHTML(html);
  const violations: DeckViolation[] = [];

  const reveal = document.querySelector(".reveal");
  if (!reveal) {
    violations.push({ page, rule: "reveal-wrapper", detail: "Missing .reveal container" });
    return violations;
  }

  const slidesContainer = reveal.querySelector(".slides");
  if (!slidesContainer) {
    violations.push({
      page,
      rule: "slides-wrapper",
      detail: "Missing .slides container inside .reveal",
    });
    return violations;
  }

  const sections = slidesContainer.querySelectorAll(":scope > section");
  if (sections.length === 0) {
    violations.push({ page, rule: "no-slides", detail: "Deck has no <section> slides" });
    return violations;
  }

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i] as Element;
    const slideLabel = `slide ${i + 1}`;

    const bg = section.querySelector(".slide-bg");
    if (bg && !(bg.getAttribute("style") ?? "").includes("background-image")) {
      violations.push({
        page,
        rule: "bg-missing-image",
        detail: `${slideLabel}: .slide-bg has no background-image style`,
      });
    }

    const split = section.querySelector(".split-layout");
    if (split) {
      if (!split.querySelector(".split-content")) {
        violations.push({
          page,
          rule: "split-missing-content",
          detail: `${slideLabel}: .split-layout missing .split-content`,
        });
      }
      if (!split.querySelector(".split-image")) {
        violations.push({
          page,
          rule: "split-missing-image",
          detail: `${slideLabel}: .split-layout missing .split-image`,
        });
      }
    }

    for (const pre of section.querySelectorAll("pre.shiki")) {
      if (!pre.querySelector("code")) {
        violations.push({
          page,
          rule: "shiki-missing-code",
          detail: `${slideLabel}: <pre class="shiki"> has no <code> child`,
        });
      }
    }

    const qr = section.querySelector(".qr-code");
    if (qr && !qr.querySelector("svg")) {
      violations.push({
        page,
        rule: "qr-missing-svg",
        detail: `${slideLabel}: .qr-code has no <svg> element`,
      });
    }
  }

  return violations;
}

export async function checkDecks(
  distDir: string,
): Promise<{ checked: number; violations: DeckViolation[] }> {
  const deckPages = await collectDeckPages(distDir);
  const violations: DeckViolation[] = [];

  for (const { file, html } of deckPages) {
    const page = "/" + relative(distDir, file).replace(/index\.html$/, "");
    violations.push(...checkDeckHtml(html, page));
  }

  return { checked: deckPages.length, violations };
}
