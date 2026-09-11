import { describe, expect, it } from "vitest";
import { hasModeFlag, MODES, resolveModes } from "../src/pdf-modes.mjs";

// `flagValue` as scripts/deck-pdf.mjs defines it, and an identity resolver so
// the expected paths don't depend on the machine's working directory.
const flagValue = (flags: string[]) => (name: string) =>
  flags
    .find((f) => f.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");

function run(flags: string[], positionalOutput?: string) {
  return resolveModes({
    flags,
    positionalOutput,
    slug: "my-talk",
    flagValue: flagValue(flags),
    resolvePath: (p: string) => p,
  });
}

describe("hasModeFlag", () => {
  it("matches a bare flag and a flag carrying a path", () => {
    expect(hasModeFlag(["--notes"], "notes")).toBe(true);
    expect(hasModeFlag(["--notes=guide.pdf"], "notes")).toBe(true);
  });

  it("does not match a different flag that shares a prefix", () => {
    expect(hasModeFlag(["--no-compress"], "notes")).toBe(false);
    expect(hasModeFlag(["--notes-only"], "notes")).toBe(false);
  });
});

describe("resolveModes", () => {
  it("defaults to the projection deck when no mode is named", () => {
    expect(run([])).toEqual({ modes: ["slides"], outputs: { slides: "my-talk.pdf" } });
  });

  it("keeps the positional output path for a single mode", () => {
    expect(run([], "out.pdf").outputs).toEqual({ slides: "out.pdf" });
    expect(run(["--notes"], "guide.pdf").outputs).toEqual({ notes: "guide.pdf" });
  });

  it("names each mode's default output from its suffix", () => {
    expect(run(["--notes"]).outputs).toEqual({ notes: "my-talk-notes.pdf" });
    expect(run(["--handout"]).outputs).toEqual({ handout: "my-talk-handout.pdf" });
  });

  it("exports several modes from one run, each to its own default", () => {
    expect(run(["--slides", "--notes", "--handout"])).toEqual({
      modes: ["slides", "notes", "handout"],
      outputs: {
        slides: "my-talk.pdf",
        notes: "my-talk-notes.pdf",
        handout: "my-talk-handout.pdf",
      },
    });
  });

  it("takes each mode's output path off its own flag", () => {
    expect(run(["--slides=deck.pdf", "--notes=guide.pdf"]).outputs).toEqual({
      slides: "deck.pdf",
      notes: "guide.pdf",
    });
  });

  it("emits in a fixed order whatever order the flags were typed in", () => {
    expect(run(["--handout", "--notes", "--slides"]).modes).toEqual(MODES);
  });

  it("refuses a positional path when several modes were asked for", () => {
    const { error, modes } = run(["--slides", "--notes"], "out.pdf");
    expect(modes).toBeUndefined();
    expect(error).toContain("ambiguous");
    // The message has to say how to name them, since there is no other way.
    expect(error).toContain("--slides=<path> --notes=<path>");
  });

  it("still accepts a positional path alongside one mode's own flag", () => {
    // One mode, so nothing is ambiguous: the explicit flag wins.
    expect(run(["--notes=guide.pdf"], "ignored.pdf").outputs).toEqual({ notes: "guide.pdf" });
  });
});
