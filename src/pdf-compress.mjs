// Ghostscript settings for astromotion-pdf's compression pass.
//
// The raw capture embeds every slide background at its source resolution, so
// a deck with full-bleed images lands at 100 MB+. `pdfwrite` with the /ebook
// preset downsamples images to 150 ppi and re-encodes them as JPEG, which cuts
// that to a few MB with no visible loss at presentation scale.
//
// The colour strategy is named explicitly as RGB, the value Ghostscript's own
// documentation lists for /ebook. The preset itself still sets the legacy
// `/sRGB` name, which from 10.07 takes the device-independent path: blend-space
// conversion then refuses the page's transparency groups ("Cannot use
// DeviceIndependentColor for a Blending colour space") and a translucent CSS
// gradient over an image comes out opaque. With RGB, Chrome's sRGB-tagged images
// become DeviceRGB, which every renderer (Quartz included) draws identically.
//
// Don't reach for `LeaveColorUnchanged` to keep the ICC tags: 10.07 writes the
// profiles out as zero-byte streams that Quartz refuses to draw, and 10.08
// flattens every page with a soft-masked image into hundreds of 720 ppi strips,
// a 20x larger file with the scrim missing.
//
// Ghostscript older than 10.07 (Ubuntu 24.04 ships 10.02) writes the colour
// layer of a translucent gradient out empty under every setting, so an overlay
// silently vanishes. The export refuses it rather than produce that file.
//
// Plain JavaScript, like the bins that import it: Node won't strip types from
// files under node_modules.

export const MIN_GHOSTSCRIPT = "10.07.0";

/**
 * @param {string} input the raw capture
 * @param {string} output where the compressed PDF goes
 * @returns {string[]} arguments for `gs`
 */
export function ghostscriptArgs(input, output) {
  return [
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.4",
    "-dPDFSETTINGS=/ebook",
    "-sColorConversionStrategy=RGB",
    "-dNOPAUSE",
    "-dQUIET",
    "-dBATCH",
    `-sOutputFile=${output}`,
    input,
  ];
}

const parts = (version) => version.trim().split(".").map(Number);

/**
 * @param {string} version `gs --version` output, e.g. "10.08.0"
 * @returns {boolean} whether this Ghostscript compresses decks correctly
 */
export function ghostscriptSupported(version) {
  const have = parts(version);
  if (have.some(Number.isNaN)) return false;
  const want = parts(MIN_GHOSTSCRIPT);
  for (let i = 0; i < want.length; i++) {
    const h = have[i] ?? 0;
    if (h !== want[i]) return h > want[i];
  }
  return true;
}
