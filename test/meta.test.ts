import { describe, expect, it } from "vitest";
import { parseDeckFrontmatter } from "../src/meta.ts";

describe("parseDeckFrontmatter", () => {
  it("parses title and description from frontmatter", () => {
    const raw = `---\ntitle: My Deck\ndescription: A test\n---\n# Slide`;
    const result = parseDeckFrontmatter(raw);
    expect(result.data.title).toBe("My Deck");
    expect(result.data.description).toBe("A test");
    expect(result.content).toBe("# Slide");
  });

  it("returns remaining content after frontmatter", () => {
    const raw = `---\ntitle: T\n---\nline one\n\nline two`;
    const result = parseDeckFrontmatter(raw);
    expect(result.content).toBe("line one\n\nline two");
  });

  it("uses slug as fallback title when frontmatter has no title", () => {
    const raw = `---\ndescription: No title here\n---\ncontent`;
    const result = parseDeckFrontmatter(raw, "my-deck");
    expect(result.data.title).toBe("my-deck");
    expect(result.data.description).toBe("No title here");
  });

  it("uses slug as title when there is no frontmatter", () => {
    const raw = "# Just markdown";
    const result = parseDeckFrontmatter(raw, "fallback");
    expect(result.data.title).toBe("fallback");
    expect(result.content).toBe("# Just markdown");
  });

  it("returns undefined title when no frontmatter and no slug", () => {
    const raw = "# Just markdown";
    const result = parseDeckFrontmatter(raw);
    expect(result.data.title).toBeUndefined();
  });

  it("does not override existing title with slug", () => {
    const raw = `---\ntitle: Explicit\n---\ncontent`;
    const result = parseDeckFrontmatter(raw, "slug-title");
    expect(result.data.title).toBe("Explicit");
  });

  it("parses all frontmatter fields", () => {
    const raw = `---\ntitle: T\ndescription: D\nauthor: A\nimage: /img.png\n---\n`;
    const result = parseDeckFrontmatter(raw);
    expect(result.data).toEqual({
      title: "T",
      description: "D",
      author: "A",
      image: "/img.png",
    });
  });
});
