import { describe, it, expect, afterEach } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { remarkDeckSections } from "../plugins/remark-deck-sections.ts";
import { remarkDeckBg } from "../plugins/remark-deck-bg.ts";
import { buildState } from "../src/build-config.ts";

function classOf(node: any): string | undefined {
  return node?.attributes?.find((a: any) => a.name === "class")?.value;
}

function styleOf(node: any): string | undefined {
  return node?.attributes?.find((a: any) => a.name === "style")?.value;
}

describe("remarkDeckBg", () => {
  afterEach(() => {
    buildState.base = "/";
  });

  it("prepends a .slide-bg div for full-bleed bg images", async () => {
    const input = "# Title\n\n![bg](./photo.jpg)\n\nbody\n";
    const tree = unified().use(remarkParse).parse(input);
    await unified().use(remarkDeckSections).use(remarkDeckBg).run(tree, { path: "test.deck.mdx" });
    const section = tree.children[0] as any;
    const first = section.children[0];
    expect(first.type).toBe("mdxJsxFlowElement");
    expect(first.name).toBe("div");
    expect(classOf(first)).toBe("slide-bg");
    expect(styleOf(first)).toContain("./photo.jpg");
    const imageParas = section.children.filter(
      (c: any) => c.type === "paragraph" && c.children?.[0]?.type === "image",
    );
    expect(imageParas.length).toBe(0);
  });

  it("wraps content in a split-layout for right:40% bg images", async () => {
    const input = "# Title\n\n![bg right:40%](./side.jpg)\n\nbody\n";
    const tree = unified().use(remarkParse).parse(input);
    await unified().use(remarkDeckSections).use(remarkDeckBg).run(tree, { path: "test.deck.mdx" });
    const section = tree.children[0] as any;
    const layout = section.children[0];
    expect(layout.type).toBe("mdxJsxFlowElement");
    expect(classOf(layout)).toBe("split-layout");
    // For right: content first, image second
    const [content, image] = layout.children;
    expect(classOf(content)).toBe("split-content");
    expect(classOf(image)).toBe("split-image");
    expect(styleOf(image)).toContain("width: 40%");
  });

  it("rewrites deck-relative asset URLs to root-absolute", async () => {
    const input = "# Title\n\n![bg](./assets/photo.jpg)\n";
    const tree = unified().use(remarkParse).parse(input);
    await unified()
      .use(remarkDeckSections)
      .use(remarkDeckBg)
      .run(tree, { path: "/proj/src/decks/test.deck.mdx" });
    const section = tree.children[0] as any;
    expect(styleOf(section.children[0])).toContain("url('/src/decks/assets/photo.jpg')");
  });

  it("prefixes rewritten asset URLs with the site base", async () => {
    buildState.base = "/test-base";
    const input = "# Title\n\n![bg](./assets/photo.jpg)\n";
    const tree = unified().use(remarkParse).parse(input);
    await unified()
      .use(remarkDeckSections)
      .use(remarkDeckBg)
      .run(tree, { path: "/proj/src/decks/test.deck.mdx" });
    const section = tree.children[0] as any;
    expect(styleOf(section.children[0])).toContain("url('/test-base/src/decks/assets/photo.jpg')");
  });

  it("applies filter modifiers", async () => {
    const input = "# Title\n\n![bg brightness:0.5 blur:2px](./photo.jpg)\n";
    const tree = unified().use(remarkParse).parse(input);
    await unified().use(remarkDeckSections).use(remarkDeckBg).run(tree, { path: "test.deck.mdx" });
    const section = tree.children[0] as any;
    const first = section.children[0];
    expect(styleOf(first)).toContain("filter: brightness(0.5) blur(2px)");
  });
});
