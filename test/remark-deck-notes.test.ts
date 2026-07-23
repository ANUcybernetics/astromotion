import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import { remarkDeckSections } from "../plugins/remark-deck-sections.ts";
import { remarkDeckNotes } from "../plugins/remark-deck-notes.ts";

describe("remarkDeckNotes", () => {
  it("appends a notes <aside> to the section and removes the directive", async () => {
    const input = "# Title\n\n{/* notes:\nspeaker note text\n*/}\n\nbody\n";
    const tree = unified().use(remarkParse).use(remarkMdx).parse(input);
    await unified()
      .use(remarkDeckSections)
      .use(remarkDeckNotes)
      .run(tree, { path: "test.deck.mdx" });
    const section = tree.children[0] as any;
    const notesEl = section.children.find(
      (c: any) => c.type === "mdxJsxFlowElement" && c.name === "aside",
    );
    expect(notesEl).toBeDefined();
    // Reveal's notes plugin reads `aside.notes`, so the class must be exactly that
    expect(notesEl.attributes.some((a: any) => a.name === "class" && a.value === "notes")).toBe(
      true,
    );
    // aria-hidden keeps the presenter-only aside from registering as a
    // complementary landmark in static a11y scans
    expect(
      notesEl.attributes.some((a: any) => a.name === "aria-hidden" && a.value === "true"),
    ).toBe(true);
    // the directive body is preserved as raw HTML inside the aside
    const html = notesEl.children.find((c: any) => c.type === "html");
    expect(html?.value).toContain("speaker note text");
    const exprNodes = section.children.filter(
      (c: any) => c.type === "mdxFlowExpression" && (c.value as string).includes("notes:"),
    );
    expect(exprNodes.length).toBe(0);
  });

  it("does nothing when no notes directive is present", async () => {
    const input = "# Title\n\nbody\n";
    const tree = unified().use(remarkParse).use(remarkMdx).parse(input);
    await unified()
      .use(remarkDeckSections)
      .use(remarkDeckNotes)
      .run(tree, { path: "test.deck.mdx" });
    const section = tree.children[0] as any;
    const notesEl = section.children.find(
      (c: any) => c.type === "mdxJsxFlowElement" && c.name === "aside",
    );
    expect(notesEl).toBeUndefined();
  });

  it("preserves HTML in the notes body", async () => {
    const input = "# Title\n\n{/* notes: <strong>bold</strong> and <em>italic</em> */}\n\nbody\n";
    const tree = unified().use(remarkParse).use(remarkMdx).parse(input);
    await unified()
      .use(remarkDeckSections)
      .use(remarkDeckNotes)
      .run(tree, { path: "test.deck.mdx" });
    const section = tree.children[0] as any;
    const notesEl = section.children.find(
      (c: any) => c.type === "mdxJsxFlowElement" && c.name === "aside",
    );
    const html = notesEl.children.find((c: any) => c.type === "html");
    expect(html.value).toContain("<strong>bold</strong>");
    expect(html.value).toContain("<em>italic</em>");
  });
});
