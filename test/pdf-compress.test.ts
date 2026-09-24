import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ghostscriptArgs, ghostscriptSupported } from "../src/pdf-compress.mjs";

describe("ghostscriptSupported", () => {
  it.each([
    ["10.07.0", true],
    ["10.08.0\n", true],
    ["11.0", true],
    ["10.07", true],
    ["10.06.1", false],
    ["10.02.1", false],
    ["9.56.1", false],
    ["not a version", false],
  ])("%j -> %s", (version, expected) => {
    expect(ghostscriptSupported(version)).toBe(expected);
  });
});

// A raw Chrome capture (fixtures/pdf/transparency.html) of three slides over a
// photo: a PNG alpha scrim, a translucent CSS gradient, and a plain page. Both
// ways Ghostscript has broken decks show up here: rasterising pages into
// hundreds of strips (file size and image count explode), and dropping or
// flattening an overlay (the rendered page's brightness moves).
const fixture = path.join(__dirname, "fixtures", "pdf", "transparency.pdf");

const gsVersion = spawnSync("gs", ["--version"], { encoding: "utf8" });
const haveGhostscript = gsVersion.status === 0 && ghostscriptSupported(gsVersion.stdout);
// mise.toml pins Ghostscript, so CI always has it; only a bare local checkout
// may skip.
if (process.env.GITHUB_ACTIONS && !haveGhostscript) {
  throw new Error("CI needs Ghostscript (mise.toml pins conda:ghostscript)");
}

function gs(args: string[]) {
  const result = spawnSync("gs", args, { encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
  return result;
}

const imageObjects = (file: string) =>
  readFileSync(file)
    .toString("latin1")
    .match(/\/Subtype\s*\/Image\b/g)?.length ?? 0;

// Mean brightness of each page, rendered small as raw greyscale (PGM: a text
// header of magic, width, height and maxval, then one byte per pixel).
function pageBrightness(file: string, dir: string, tag: string): number[] {
  gs([
    "-q",
    "-dNOPAUSE",
    "-dBATCH",
    "-sDEVICE=pgmraw",
    "-r12",
    `-sOutputFile=${dir}/${tag}-%d.pgm`,
    file,
  ]);
  return readdirSync(dir)
    .filter((f) => f.startsWith(`${tag}-`))
    .toSorted((a, b) => parseInt(a.slice(tag.length + 1)) - parseInt(b.slice(tag.length + 1)))
    .map((f) => {
      const bytes = readFileSync(path.join(dir, f));
      let offset = 0;
      for (let fields = 0; fields < 4; offset++) {
        if (/\s/.test(String.fromCharCode(bytes[offset]))) fields++;
      }
      const pixels = bytes.subarray(offset);
      return pixels.reduce((sum, v) => sum + v, 0) / pixels.length;
    });
}

describe.skipIf(!haveGhostscript)("ghostscript compression", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "astromotion-pdf-"));
  const output = path.join(dir, "compressed.pdf");
  gs(ghostscriptArgs(fixture, output));

  it("shrinks the capture rather than rasterising it", () => {
    expect(statSync(output).size).toBeLessThan(statSync(fixture).size);
    expect(imageObjects(output)).toBeLessThanOrEqual(imageObjects(fixture));
  });

  it("keeps every overlay as the browser drew it", () => {
    const before = pageBrightness(fixture, dir, "raw");
    const after = pageBrightness(output, dir, "compressed");
    expect(after).toHaveLength(before.length);
    after.forEach((value, page) => expect(value, `page ${page + 1}`).toBeCloseTo(before[page], 0));
  });
});
