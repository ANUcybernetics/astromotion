import { describe, expect, it } from "vitest";
import { generateQrCode } from "../src/svg/qr-code.ts";

describe("generateQrCode", () => {
  it("returns an SVG wrapped in a qr-code div", () => {
    const result = generateQrCode("https://example.com");
    expect(result).toContain('<div class="qr-code">');
    expect(result).toContain("<svg");
    expect(result).toContain("</svg>");
    expect(result).toContain("</div>");
  });

  it("includes a link to the URL", () => {
    const result = generateQrCode("https://example.com");
    expect(result).toContain('href="https://example.com"');
  });

  it("strips protocol and www from displayed URL", () => {
    const result = generateQrCode("https://www.example.com/path");
    expect(result).toContain("<span>example.com/path</span>");
  });

  it("strips http protocol too", () => {
    const result = generateQrCode("http://example.com");
    expect(result).toContain("<span>example.com</span>");
  });

  it("contains rect elements for QR modules", () => {
    const result = generateQrCode("https://example.com");
    expect(result).toContain("<rect");
    expect(result).toContain('rx="5"');
  });

  it("uses gold fill for finder pattern modules", () => {
    const result = generateQrCode("https://example.com");
    expect(result).toContain('fill="#be830e"');
  });

  it("uses white fill for data modules", () => {
    const result = generateQrCode("https://example.com");
    expect(result).toContain('fill="#ffffff"');
  });

  it("includes animation styles on rects", () => {
    const result = generateQrCode("https://example.com");
    expect(result).toContain("qr-morph");
    expect(result).toContain("qr-color-gold");
    expect(result).toContain("qr-color-light");
  });
});
