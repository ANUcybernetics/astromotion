import { QR } from "@qrgrid/core";

const PRIMES = [11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71];
const MODULE_SIZE = 10;
const MARGIN = 40;

function stagger(i: number, range: number): number {
  return ((i * PRIMES[i % PRIMES.length]) % (range * 1000)) / 1000;
}

export function generateQrCode(url: string): string {
  const qr = new QR(url, { errorCorrection: "H" });
  const totalSize = qr.gridSize * MODULE_SIZE + MARGIN * 2;
  const rects: string[] = [];

  qr.data.forEach((bit: number, i: number) => {
    if (!bit) return;

    const row = Math.floor(i / qr.gridSize);
    const col = i % qr.gridSize;
    const x = col * MODULE_SIZE + MARGIN;
    const y = row * MODULE_SIZE + MARGIN;

    const isFinder =
      (row < 7 && col < 7) ||
      (row < 7 && col >= qr.gridSize - 7) ||
      (row >= qr.gridSize - 7 && col < 7);

    const fill = isFinder ? "#be830e" : "#ffffff";
    const colorAnim = isFinder ? "qr-color-gold" : "qr-color-light";
    const delay = stagger(i, 5);

    const animation = [
      `qr-morph ${8 + stagger(i, 4)}s cubic-bezier(0.22, 1, 0.36, 1) ${delay}s infinite`,
      `${colorAnim} ${(isFinder ? 8 : 10) + stagger(i, 3)}s ease-in-out ${delay}s infinite`,
    ].join(", ");

    rects.push(
      `<rect x="${x}" y="${y}" width="${MODULE_SIZE}" height="${MODULE_SIZE}" fill="${fill}" rx="5" ry="5" style="animation: ${animation}"/>`,
    );
  });

  const displayUrl = url.replace(/^https?:\/\/(www\.)?/, "");

  // The link is named by the <span>, so the grid itself is decoration. Hiding it
  // also keeps it out of accessibility tooling that walks the tree per element:
  // a QR is ~1000 <rect>s each carrying an inline animation style, and axe-core
  // over JSDOM spent ~68s on a single such page (its `region` rule alone) before
  // this attribute, versus ~1.3s after.
  return `<div class="qr-code"><a href="${url}"><svg aria-hidden="true" viewBox="0 0 ${totalSize} ${totalSize}" xmlns="http://www.w3.org/2000/svg">\n${rects.join("\n")}\n</svg><span>${displayUrl}</span></a></div>`;
}
