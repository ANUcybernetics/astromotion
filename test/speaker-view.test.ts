import { describe, expect, it } from "vitest";
import { speakerViewScript } from "../src/speaker-view.ts";

describe("speakerViewScript", () => {
  it("extracts the speaker view's own script from the installed notes plugin", () => {
    const script = speakerViewScript();
    expect(script).toContain("callRevealApi");
    expect(script).not.toContain("<script");
  });
});
