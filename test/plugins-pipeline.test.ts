import { describe, expect, it } from "vitest";
import type { Root, RootContent } from "mdast";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import remarkSmartypants from "remark-smartypants";
import remarkDirective from "remark-directive";
import { deckRemarkPlugins } from "../plugins/index.ts";
import { attrValue, sectionAt } from "./mdast-helpers.ts";

async function runPipeline(input: string, filePath: string): Promise<Root> {
  const processor = unified().use(remarkParse).use(remarkMdx).use(deckRemarkPlugins);
  const tree = processor.parse(input);
  await processor.run(tree, { path: filePath });
  return tree;
}

function collectText(tree: Root): string[] {
  const out: string[] = [];
  function walk(node: Root | RootContent): void {
    if (node.type === "text") out.push(node.value);
    if ("children" in node) for (const c of node.children) walk(c);
  }
  walk(tree);
  return out;
}

const classOf = (node: RootContent | undefined) => attrValue(node, "class");
const styleOf = (node: RootContent | undefined) => attrValue(node, "style");

function findChild(
  parent: Root | RootContent | undefined,
  predicate: (n: RootContent) => boolean,
): RootContent | undefined {
  if (!parent || !("children" in parent)) return undefined;
  const children: RootContent[] = parent.children;
  return children.find(predicate);
}

describe("deck plugin pipeline", () => {
  it("turns a multi-slide deck with all directives into expected AST", async () => {
    const input = `{/* _class: banner */}

# Title

![bg](./bg.jpg)

---

{/* _class: impact */}

**activity**

---

## Heading

![bg right:40%](./side.jpg)

body
`;
    const tree = await runPipeline(input, "/decks/foo.deck.mdx");
    expect(tree.children.length).toBe(3);
    const [s1, s2, s3] = [sectionAt(tree, 0), sectionAt(tree, 1), sectionAt(tree, 2)];

    // Slide 1: section with class banner, includes a slide-bg div child
    expect(classOf(s1)).toBe("banner");
    const slideBg = findChild(
      s1,
      (n) => n.type === "mdxJsxFlowElement" && classOf(n) === "slide-bg",
    );
    expect(slideBg).toBeDefined();

    // Slide 2: section with class impact
    expect(classOf(s2)).toBe("impact");

    // Slide 3: section contains a split-layout wrapper
    const splitLayout = findChild(
      s3,
      (n) => n.type === "mdxJsxFlowElement" && classOf(n) === "split-layout",
    );
    expect(splitLayout).toBeDefined();
    const splitImage = findChild(splitLayout, (n) => classOf(n) === "split-image");
    const splitContent = findChild(splitLayout, (n) => classOf(n) === "split-content");
    expect(splitImage).toBeDefined();
    expect(splitContent).toBeDefined();
  });

  it("applies oldschool smartypants to included content even when Astro registers smartypants first", async () => {
    // Reproduces the bug where unified deduplicates remark-smartypants by
    // reference: when @astrojs/mdx registers it ahead of user plugins, a
    // second .use(remarkSmartypants, ...) just merges options into the first
    // registration and runs before remarkDeckIncludes splices in @include
    // content -- so prose dashes inside includes never become em dashes.
    const dir = mkdtempSync(join(tmpdir(), "astromotion-smarty-"));
    writeFileSync(join(dir, "partial.mdx"), "that's it---the spread is your model\n");
    const input = `intro---one

---

{/* @include ./partial.mdx */}
`;
    const processor = unified()
      .use(remarkParse)
      .use(remarkMdx)
      .use(remarkSmartypants) // simulate @astrojs/mdx default
      .use(deckRemarkPlugins);
    const tree = processor.parse(input);
    await processor.run(tree, { path: join(dir, "deck.deck.mdx") });
    const texts = collectText(tree);
    expect(texts.some((t) => t.includes("---"))).toBe(false);
    expect(texts.some((t) => t.includes("intro—one"))).toBe(true);
    expect(texts.some((t) => t.includes("that’s it—the spread"))).toBe(true);
  });

  it("keeps split bg working when remark-directive strips the alt's :token", async () => {
    // A consuming pipeline (e.g. astro-theme-anu) enables remark-directive for
    // `::: callout` containers. Its micromark extension parses the `:40` in an
    // inline `![bg right:40%]` as a `:40` text directive and drops it, so the
    // image alt arrives as `bg right%` -- which used to silently turn the slide
    // fullscreen. remarkDeckBg must recover the real modifiers from the source.
    // @include partials are parsed without remark-directive, so their alts stay
    // intact and must keep splitting too.
    const dir = mkdtempSync(join(tmpdir(), "astromotion-bg-"));
    writeFileSync(join(dir, "partial.mdx"), "## Included\n\n![bg left:30%](./inc.jpg)\n\nbody\n");
    const input = `# Inline

![bg right:40%](./side.jpg)

body

---

{/* @include ./partial.mdx */}
`;
    const processor = unified()
      .use(remarkParse)
      .use(remarkMdx)
      .use(remarkDirective) // consumer enables this for ::: containers
      .use(deckRemarkPlugins);
    const tree = processor.parse(input);

    // Sanity: confirm remark-directive really did mangle the inline alt.
    const inlinePara = findChild(
      tree,
      (n) => n.type === "paragraph" && n.children[0]?.type === "image",
    );
    const inlineImageNode = inlinePara?.type === "paragraph" ? inlinePara.children[0] : undefined;
    expect(inlineImageNode?.type === "image" && inlineImageNode.alt).toBe("bg right%");

    await processor.run(tree, { path: join(dir, "deck.deck.mdx"), value: input });
    const [s1, s2] = [sectionAt(tree, 0), sectionAt(tree, 1)];

    const inlineSplit = findChild(s1, (n) => classOf(n) === "split-layout");
    expect(inlineSplit).toBeDefined();
    const inlineImage = findChild(inlineSplit, (n) => classOf(n) === "split-image");
    expect(styleOf(inlineImage)).toContain("width: 40%");

    const includedSplit = findChild(s2, (n) => classOf(n) === "split-layout");
    expect(includedSplit).toBeDefined();
    const includedImage = findChild(includedSplit, (n) => classOf(n) === "split-image");
    expect(styleOf(includedImage)).toContain("width: 30%");
  });
});
