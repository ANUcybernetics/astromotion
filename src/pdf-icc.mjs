// Repair the empty ICC profiles Ghostscript leaves behind.
//
// `gs -dColorConversionStrategy=/LeaveColorUnchanged` (see scripts/deck-pdf.mjs
// for why the compression pass needs it) keeps every image's
// `[/ICCBased N 0 R]` colour space but writes the profile stream out EMPTY ---
// `<< /N 3 /Length 0 >>`. An ICC stream of zero bytes is not a valid profile,
// so the colour space is broken for every image in the deck.
//
// Renderers split on that. Poppler, pdf.js, PDFium and MuPDF fall back on the
// `/N` component count and carry on (poppler noisily: two "read ICCBased color
// space profile error" warnings per image). Apple's CoreGraphics does not: in
// Safari and Preview the images simply DON'T DRAW, so a deck exported on Linux
// arrives at a Mac as text on blank backgrounds. That is a silent, viewer
// -specific failure in a published artefact, which is worth a byte patch.
//
// The patch drops the indirection instead of embedding a profile: replace the
// colour space array with the device space `/N` implies --- exactly the
// fallback the tolerant renderers already use, so nothing that renders today
// changes appearance. Rewriting it in place keeps every xref offset valid: the
// replacement is padded with spaces to the byte length of the array it
// replaces (whitespace inside an array is a token separator, so the padding is
// invisible to a parser).
//
// Plain JavaScript, like the bins that import it: Node won't strip types from
// files under node_modules.

const DEVICE_SPACE = { 1: "/DeviceGray", 3: "/DeviceRGB", 4: "/DeviceCMYK" };

// Objects whose dict is an empty ICC profile stream: `/Length 0` and an `/N`
// this function knows a device space for. The dict pattern deliberately
// excludes `<` and `>` so it can't run past `>>` into the next object, and a
// `/Length` given as an indirect reference simply doesn't match (gs writes it
// inline, and an unmatched object is left alone).
const EMPTY_ICC_STREAM = /(\d+)\s+\d+\s+obj\s*<<([^<>]*)>>\s*stream/g;
const ICC_COLOR_SPACE = /\[\s*\/ICCBased\s+(\d+)\s+\d+\s+R\s*\]/g;

/**
 * @param {Uint8Array} bytes a PDF file
 * @returns {{ bytes: Uint8Array, patched: Array<{ object: number, space: string }> }}
 *   the repaired file (the input, unchanged, when there was nothing to repair)
 *   and one entry per colour space rewritten
 */
export function repairEmptyIccColorSpaces(bytes) {
  // latin1 is the byte-preserving round trip: every byte maps to one code unit,
  // so offsets in the string are offsets in the file.
  const pdf = Buffer.from(bytes).toString("latin1");

  const empty = new Map();
  for (const [, object, dict] of pdf.matchAll(EMPTY_ICC_STREAM)) {
    if (!/\/Length\s+0(?![0-9])/.test(dict)) continue;
    const n = dict.match(/\/N\s+(\d+)(?![0-9])/);
    const space = n && DEVICE_SPACE[Number(n[1])];
    if (space) empty.set(object, space);
  }
  if (empty.size === 0) return { bytes, patched: [] };

  const patched = [];
  const repaired = pdf.replaceAll(ICC_COLOR_SPACE, (array, object) => {
    const space = empty.get(object);
    if (!space) return array;
    patched.push({ object: Number(object), space });
    return padArray(space, array.length);
  });
  if (patched.length === 0) return { bytes, patched: [] };

  return { bytes: Buffer.from(repaired, "latin1"), patched };
}

// `[/DeviceRGB` + padding + `]`, padded to `length` bytes. The array it
// replaces always has room: `[/ICCBased 9 0 R]` is 17 bytes at its shortest,
// and the longest device space is 12 inside the brackets.
function padArray(space, length) {
  const array = `[${space}]`;
  if (array.length > length) {
    throw new Error(`Cannot fit ${array} into ${length} bytes without moving xref offsets`);
  }
  return `[${space}${" ".repeat(length - array.length)}]`;
}
