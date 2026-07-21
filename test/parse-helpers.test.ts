import { describe, it, expect } from "vitest";
import {
  parseMdxFlowExpression,
  parseClassDirectiveMdx,
  parseIdDirectiveMdx,
  parseNotesDirectiveMdx,
  parseIncludeDirectiveMdx,
  parseAnimateDirectiveMdx,
  extractFrontmatter,
  parseBgModifiers,
} from "../src/parse-helpers.ts";

describe("extractFrontmatter", () => {
  it("extracts frontmatter and content", () => {
    const result = extractFrontmatter("---\ntitle: Test\n---\n# Slide\n");
    expect(result).toEqual({ data: "title: Test", content: "# Slide\n" });
  });

  it("returns null when no frontmatter", () => {
    expect(extractFrontmatter("# Just markdown")).toBeNull();
  });

  it("handles frontmatter at end of file", () => {
    const result = extractFrontmatter("---\ntitle: T\n---");
    expect(result).toEqual({ data: "title: T", content: "" });
  });

  it("handles empty content after frontmatter", () => {
    const result = extractFrontmatter("---\ntitle: T\n---\n");
    expect(result).toEqual({ data: "title: T", content: "" });
  });

  it("handles multiline frontmatter", () => {
    const result = extractFrontmatter("---\ntitle: T\ndescription: D\nauthor: A\n---\ncontent");
    expect(result?.data).toBe("title: T\ndescription: D\nauthor: A");
    expect(result?.content).toBe("content");
  });

  it("returns null for incomplete frontmatter", () => {
    expect(extractFrontmatter("---\ntitle: T\nno closing")).toBeNull();
  });

  it("returns null when dashes not at start", () => {
    expect(extractFrontmatter("text\n---\ntitle: T\n---\n")).toBeNull();
  });
});

describe("parseBgModifiers", () => {
  it("returns empty object for empty string", () => {
    expect(parseBgModifiers("")).toEqual({});
  });

  it("parses left position with default split", () => {
    expect(parseBgModifiers(" left")).toEqual({ position: "left", splitPercent: "50%" });
  });

  it("parses left position with custom split", () => {
    expect(parseBgModifiers(" left:60%")).toEqual({ position: "left", splitPercent: "60%" });
  });

  it("parses right position with custom split", () => {
    expect(parseBgModifiers(" right:40%")).toEqual({ position: "right", splitPercent: "40%" });
  });

  it("parses cover size", () => {
    expect(parseBgModifiers(" cover")).toEqual({ size: "cover" });
  });

  it("parses contain size", () => {
    expect(parseBgModifiers(" contain")).toEqual({ size: "contain" });
  });

  it("parses blur filter", () => {
    expect(parseBgModifiers(" blur:2px")).toEqual({ filters: "blur(2px)" });
  });

  it("parses brightness filter", () => {
    expect(parseBgModifiers(" brightness:0.5")).toEqual({ filters: "brightness(0.5)" });
  });

  it("parses saturate filter", () => {
    expect(parseBgModifiers(" saturate:1.5")).toEqual({ filters: "saturate(1.5)" });
  });

  it("combines multiple filters in input order", () => {
    expect(parseBgModifiers(" brightness:0.5 blur:2px")).toEqual({
      filters: "brightness(0.5) blur(2px)",
    });
  });

  it("combines all three filters", () => {
    expect(parseBgModifiers(" saturate:0.5 brightness:0.8 blur:1px")).toEqual({
      filters: "saturate(0.5) brightness(0.8) blur(1px)",
    });
  });

  it("parses combined position and filters", () => {
    expect(parseBgModifiers(" left:40% blur:3px")).toEqual({
      position: "left",
      splitPercent: "40%",
      filters: "blur(3px)",
    });
  });

  it("ignores unknown tokens", () => {
    expect(parseBgModifiers(" unknown cover")).toEqual({ size: "cover" });
  });

  it("ignores filter keys without values", () => {
    expect(parseBgModifiers(" blur")).toEqual({});
  });
});

describe("parseMdxFlowExpression", () => {
  it("extracts body from a block comment", () => {
    expect(parseMdxFlowExpression("/* hello */")).toBe("hello");
  });

  it("trims internal whitespace", () => {
    expect(parseMdxFlowExpression("/*  spaced  */")).toBe("spaced");
  });

  it("handles surrounding whitespace on the string", () => {
    expect(parseMdxFlowExpression("  /* trimmed */  ")).toBe("trimmed");
  });

  it("returns null for non-comment value", () => {
    expect(parseMdxFlowExpression("just text")).toBeNull();
  });

  it("returns null for missing closing", () => {
    expect(parseMdxFlowExpression("/* unclosed")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseMdxFlowExpression("")).toBeNull();
  });

  it("handles comment with only whitespace body", () => {
    expect(parseMdxFlowExpression("/*   */")).toBe("");
  });

  it("preserves colons and special characters in body", () => {
    expect(parseMdxFlowExpression("/* key: value */")).toBe("key: value");
  });

  it("handles multiline body", () => {
    expect(parseMdxFlowExpression("/* line one\nline two */")).toBe("line one\nline two");
  });
});

describe("parseClassDirectiveMdx", () => {
  it("extracts class name", () => {
    expect(parseClassDirectiveMdx("/* _class: banner */")).toBe("banner");
  });

  it("extracts multiple class names", () => {
    expect(parseClassDirectiveMdx("/* _class: banner centered */")).toBe("banner centered");
  });

  it("returns null for non-class comments", () => {
    expect(parseClassDirectiveMdx("/* notes: hello */")).toBeNull();
  });

  it("handles extra whitespace", () => {
    expect(parseClassDirectiveMdx("/*  _class:  impact  */")).toBe("impact");
  });

  it("returns null for empty value after directive", () => {
    expect(parseClassDirectiveMdx("/* _class: */")).toBeNull();
  });

  it("returns null for non-comment string", () => {
    expect(parseClassDirectiveMdx("_class: banner")).toBeNull();
  });
});

describe("parseIdDirectiveMdx", () => {
  it("extracts the id", () => {
    expect(parseIdDirectiveMdx("/* _id: opening */")).toBe("opening");
  });

  it("keeps only the first token", () => {
    expect(parseIdDirectiveMdx("/* _id: opening remarks */")).toBe("opening");
  });

  it("returns null for non-id comments", () => {
    expect(parseIdDirectiveMdx("/* _class: banner */")).toBeNull();
  });

  it("returns null for empty value after directive", () => {
    expect(parseIdDirectiveMdx("/* _id: */")).toBeNull();
  });
});

describe("parseNotesDirectiveMdx", () => {
  it("extracts notes content", () => {
    expect(parseNotesDirectiveMdx("/* notes: Remember this */")).toBe("Remember this");
  });

  it("returns null for non-notes comments", () => {
    expect(parseNotesDirectiveMdx("/* _class: banner */")).toBeNull();
  });

  it("preserves internal content", () => {
    expect(parseNotesDirectiveMdx("/* notes: line one, line two */")).toBe("line one, line two");
  });

  it("handles multiline notes content", () => {
    expect(parseNotesDirectiveMdx("/* notes:\nspeaker note text\n*/")).toBe("speaker note text");
  });
});

describe("parseIncludeDirectiveMdx", () => {
  it("extracts file path", () => {
    expect(parseIncludeDirectiveMdx("/* @include slides/intro.mdx */")).toBe("slides/intro.mdx");
  });

  it("returns null for non-include comments", () => {
    expect(parseIncludeDirectiveMdx("/* _class: banner */")).toBeNull();
  });

  it("returns null for non-comment value", () => {
    expect(parseIncludeDirectiveMdx("@include file.mdx")).toBeNull();
  });

  it("returns null for empty path", () => {
    expect(parseIncludeDirectiveMdx("/* @include  */")).toBeNull();
  });

  it("extracts only the first token as path", () => {
    expect(parseIncludeDirectiveMdx("/* @include file.mdx extra */")).toBe("file.mdx");
  });

  it("handles relative paths", () => {
    expect(parseIncludeDirectiveMdx("/* @include ../shared/topic.mdx */")).toBe(
      "../shared/topic.mdx",
    );
  });
});

describe("parseAnimateDirectiveMdx", () => {
  it("parses the bare flag with no id", () => {
    expect(parseAnimateDirectiveMdx("/* _animate */")).toEqual({ id: null });
  });

  it("parses an id when given", () => {
    expect(parseAnimateDirectiveMdx("/* _animate: shuffle */")).toEqual({ id: "shuffle" });
  });

  it("treats an empty id as no id", () => {
    expect(parseAnimateDirectiveMdx("/* _animate: */")).toEqual({ id: null });
  });

  it("handles extra whitespace around the id", () => {
    expect(parseAnimateDirectiveMdx("/*  _animate:  pile  */")).toEqual({ id: "pile" });
  });

  it("returns null for other directives", () => {
    expect(parseAnimateDirectiveMdx("/* _class: impact */")).toBeNull();
    expect(parseAnimateDirectiveMdx("/* notes: hi */")).toBeNull();
  });

  it("returns null for a non-comment value", () => {
    expect(parseAnimateDirectiveMdx("_animate")).toBeNull();
  });

  it("does not match a directive that merely starts with _animate", () => {
    expect(parseAnimateDirectiveMdx("/* _animated */")).toBeNull();
  });
});
