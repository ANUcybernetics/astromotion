import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { remarkDeckSections } from "../plugins/remark-deck-sections.ts";
import { remarkDeckQr } from "../plugins/remark-deck-qr.ts";
import { sectionAt } from "./mdast-helpers.ts";

describe("remarkDeckQr", () => {
  it("replaces ![qr](url) with an SVG html node", async () => {
    const input = "# Slide\n\n![qr](https://example.com)\n";
    const tree = unified().use(remarkParse).parse(input);
    await unified().use(remarkDeckSections).use(remarkDeckQr).run(tree, { path: "test.deck.mdx" });
    const section = sectionAt(tree, 0);
    const html = section.children.find((c) => c.type === "html");
    expect(html?.type).toBe("html");
    if (html?.type !== "html") return;
    expect(html.value).toContain("<svg");
    expect(html.value).toContain('class="qr-code"');
  });

  it("leaves non-qr images alone", async () => {
    const input = "# Slide\n\n![alt text](photo.jpg)\n";
    const tree = unified().use(remarkParse).parse(input);
    await unified().use(remarkDeckSections).use(remarkDeckQr).run(tree, { path: "test.deck.mdx" });
    const section = sectionAt(tree, 0);
    const html = section.children.find((c) => c.type === "html");
    expect(html).toBeUndefined();
  });
});
