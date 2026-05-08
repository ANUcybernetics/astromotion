import { describe, it, expect } from "vitest";
import type { Root } from "mdast";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import { deckRemarkPlugins } from "../plugins/index.ts";

async function runPipeline(input: string, filePath: string): Promise<Root> {
  const processor = unified().use(remarkParse).use(remarkMdx).use(deckRemarkPlugins);
  const tree = processor.parse(input);
  await processor.run(tree, { path: filePath });
  return tree as Root;
}

function classOf(node: any): string | undefined {
  return node?.attributes?.find((a: any) => a.name === "class")?.value;
}

function findChild(parent: any, predicate: (n: any) => boolean): any {
  return (parent.children as any[]).find(predicate);
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
    const [s1, s2, s3] = tree.children as any[];

    // Slide 1: section with class banner, includes a slide-bg div child
    expect(s1.type).toBe("mdxJsxFlowElement");
    expect(s1.name).toBe("section");
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
    const splitContent = findChild(
      splitLayout,
      (n) => classOf(n) === "split-content",
    );
    expect(splitImage).toBeDefined();
    expect(splitContent).toBeDefined();
  });
});
