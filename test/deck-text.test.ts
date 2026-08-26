import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as exporter from "../src/deck-text.mjs";
import * as helpers from "../src/parse-helpers.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(__dirname, "fixtures", "deck-text.deck.mdx");

// `src/deck-text.mjs` is plain JavaScript and duplicates these parsers because
// Node won't strip types from files under node_modules, so the shipped bin
// can't import the TypeScript ones. Pin the copies to the originals: any new
// directive (or change to an existing one) that lands in parse-helpers.ts
// without reaching deck-text.mjs fails here.
describe("deck-text directive parsing matches src/parse-helpers.ts", () => {
  const directives = [
    "/* _class: hero */",
    "/* _class:   spaced   */",
    "/* _class: */",
    "/* _id: agenda extra */",
    "/* _if: extended */",
    "/* _animate */",
    "/* _animate: shuffle */",
    "/* _animate: */",
    "/* notes: the removed directive */",
    "/*\n  a multi-line comment\n*/",
    "/* @include ./partial.mdx */",
    "/* @include pkg/partials/foo.mdx trailing */",
    "/* embed: topics/course-overview */",
    "/* just a comment */",
    "not an expression",
    "",
  ];

  const parsers = [
    "parseMdxFlowExpression",
    "parseClassDirectiveMdx",
    "parseIdDirectiveMdx",
    "parseIfDirectiveMdx",
    "isLegacyNotesDirective",
    "isMultilineMdxComment",
    "parseIncludeDirectiveMdx",
    "parseAnimateDirectiveMdx",
  ] as const;

  for (const parser of parsers) {
    it(parser, () => {
      for (const directive of directives) {
        expect(
          (exporter as Record<string, (v: string) => unknown>)[parser](directive),
          `${parser}(${JSON.stringify(directive)})`,
        ).toEqual((helpers as Record<string, (v: string) => unknown>)[parser](directive));
      }
    });
  }

  for (const parser of ["isNotesFence", "isCommentFence"] as const) {
    it(parser, () => {
      for (const lang of ["notes", "comment", "js", "", null, undefined]) {
        expect(
          (exporter as Record<string, (v: unknown) => unknown>)[parser](lang),
          `${parser}(${JSON.stringify(lang)})`,
        ).toEqual((helpers as Record<string, (v: unknown) => unknown>)[parser](lang));
      }
    });
  }

  it("resolveIncludePath", () => {
    const from = path.join(__dirname, "main.deck.mdx");
    for (const includePath of ["./includes/partial.mdx", "../test/includes/partial.mdx"]) {
      expect(exporter.resolveIncludePath(includePath, from)).toBe(
        helpers.resolveIncludePath(includePath, from),
      );
    }
  });
});

describe("deckToMarkdown", () => {
  const markdown = exporter.deckToMarkdown(fixture);

  it("leads with the frontmatter title and separates slides with rules", () => {
    expect(markdown.startsWith("# Text Export\n\n---\n")).toBe(true);
    // Four slides in the fixture, plus the rule under the title.
    expect(markdown.match(/^---$/gm)?.length).toBe(4);
  });

  it("keeps headings, lists, code and tables", () => {
    expect(markdown).toContain("# Title slide");
    expect(markdown).toContain("- second point");
    expect(markdown).toContain("const answer = 42;");
    expect(markdown).toContain("| tests");
  });

  it("splices @include partials and drops their frontmatter", () => {
    expect(markdown).toContain("# Topic heading");
    expect(markdown).toContain("Body paragraph.");
    expect(markdown).not.toContain("A topic with frontmatter");
  });

  it("drops imports and presentation-only directives", () => {
    expect(markdown).not.toContain("import Widget");
    expect(markdown).not.toContain("_class");
    expect(markdown).not.toContain("_id");
    expect(markdown).not.toContain("_animate");
  });

  it("replaces visuals with placeholders", () => {
    expect(markdown).toContain("(background image: title.avif)");
    expect(markdown).toContain("(image: inline picture)");
    expect(markdown).toContain("(qr: <https://example.com/handout>)");
    expect(markdown).toContain("(component: Widget)");
  });

  it("renders speaker notes and authoring comments as labelled asides", () => {
    expect(markdown).toContain("> **notes:** Say this _slowly_, then pause.");
    expect(markdown).toContain("> **comment:** Authoring note to self");
    expect(markdown).toContain("> **comment:** This slide earns its place");
  });

  it("keeps markdown structure inside a notes block", () => {
    // The body is markdown now, so a list in the source stays a list here
    // rather than being flattened into reflowed prose.
    expect(markdown).toContain("> - one reminder\n> - another");
  });

  it("fails on syntax that no longer parses", () => {
    for (const [name, message] of [
      ["deck-text-legacy-notes", /was removed in astromotion/],
      ["deck-text-multiline-comment", /does not survive a formatter/],
    ] as const) {
      expect(() =>
        exporter.deckToMarkdown(path.join(__dirname, "fixtures", `${name}.deck.mdx`)),
      ).toThrow(message);
    }
  });

  it("keeps an unrecognised directive visible rather than dropping it", () => {
    const withEmbed = exporter.deckToMarkdown(
      path.join(__dirname, "fixtures", "deck-text-embed.deck.mdx"),
    );
    expect(withEmbed).toContain("> **comment:** embed: topics/course-overview");
  });

  it("honours the opt-outs", () => {
    const bare = exporter.deckToMarkdown(fixture, {
      comments: false,
      notes: false,
      placeholders: false,
      title: false,
    });
    expect(bare).not.toContain("Text Export");
    expect(bare).not.toContain("notes:");
    expect(bare).not.toContain("comment:");
    expect(bare).not.toContain("(image:");
    expect(bare).not.toContain("(component:");
    // The prose is untouched by any of that.
    expect(bare).toContain("## Agenda");
    expect(bare).toContain("- second point");
  });
});
