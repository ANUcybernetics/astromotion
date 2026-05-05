import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { remarkDeckSections } from "../plugins/remark-deck-sections.ts";
import { remarkDeckBg } from "../plugins/remark-deck-bg.ts";

describe("remarkDeckBg", () => {
  it("prepends a .slide-bg div for full-bleed bg images", async () => {
    const input = "# Title\n\n![bg](./photo.jpg)\n\nbody\n";
    const tree = unified().use(remarkParse).parse(input);
    await unified()
      .use(remarkDeckSections)
      .use(remarkDeckBg)
      .run(tree, { path: "test.deck.mdx" });
    const section = tree.children[0] as any;
    const first = section.children[0];
    expect(first.type).toBe("html");
    expect(first.value).toContain('class="slide-bg"');
    expect(first.value).toContain("./photo.jpg");
    const imageParas = section.children.filter(
      (c: any) =>
        c.type === "paragraph" && c.children?.[0]?.type === "image",
    );
    expect(imageParas.length).toBe(0);
  });

  it("wraps content in a split-layout for right:40% bg images", async () => {
    const input = "# Title\n\n![bg right:40%](./side.jpg)\n\nbody\n";
    const tree = unified().use(remarkParse).parse(input);
    await unified()
      .use(remarkDeckSections)
      .use(remarkDeckBg)
      .run(tree, { path: "test.deck.mdx" });
    const section = tree.children[0] as any;
    const wrapper = section.children[0];
    expect(wrapper.type).toBe("html");
    expect(wrapper.value).toContain('class="split-layout"');
    expect(wrapper.value).toContain('class="split-content"');
    expect(wrapper.value).toContain('class="split-image"');
    expect(wrapper.value).toContain("width: 40%");
  });

  it("applies filter modifiers", async () => {
    const input = "# Title\n\n![bg brightness:0.5 blur:2px](./photo.jpg)\n";
    const tree = unified().use(remarkParse).parse(input);
    await unified()
      .use(remarkDeckSections)
      .use(remarkDeckBg)
      .run(tree, { path: "test.deck.mdx" });
    const section = tree.children[0] as any;
    const first = section.children[0];
    expect(first.value).toContain("filter: brightness(0.5) blur(2px)");
  });
});
