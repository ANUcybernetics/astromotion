import { describe, expect, it } from "vitest";
import { strokeOutlinePath } from "../src/whiteboard/outline.ts";
import type { WhiteboardPoint } from "../src/whiteboard/core.ts";

function line(pressures: number[]): WhiteboardPoint[] {
  return pressures.map((pressure, i) => ({ x: i * 10, y: i * 5, pressure }));
}

// Every numeric token in the path, for geometric assertions.
function coords(path: string): number[] {
  return path
    .split(/[\sMQZ]+/)
    .filter(Boolean)
    .map(Number);
}

describe("strokeOutlinePath", () => {
  it("returns an empty string for no points", () => {
    expect(strokeOutlinePath([], { size: 8, pen: false })).toBe("");
  });

  it("produces a closed path even for a single tap", () => {
    const path = strokeOutlinePath([{ x: 50, y: 50, pressure: 0.5 }], { size: 8, pen: false });
    expect(path).toMatch(/^M /);
    expect(path).toMatch(/Z$/);
    expect(coords(path).length).toBeGreaterThan(0);
  });

  it("contains only finite coordinates", () => {
    const path = strokeOutlinePath(line([0.5, 0.5, 0.5, 0.5]), { size: 8, pen: false });
    for (const n of coords(path)) expect(Number.isFinite(n)).toBe(true);
  });

  it("honours real stylus pressure when pen is true", () => {
    const soft = strokeOutlinePath(line([0.1, 0.1, 0.1, 0.1]), { size: 8, pen: true });
    const hard = strokeOutlinePath(line([1, 1, 1, 1]), { size: 8, pen: true });
    expect(soft).not.toBe(hard);
  });

  it("switches between real and simulated pressure on the pen flag", () => {
    const points = line([0.1, 0.9, 0.2, 1]);
    const real = strokeOutlinePath(points, { size: 8, pen: true });
    const simulated = strokeOutlinePath(points, { size: 8, pen: false });
    expect(real).not.toBe(simulated);
  });

  it("scales the outline extent with the size option", () => {
    const points = line([0.5, 0.5, 0.5, 0.5]);
    const extent = (size: number) => {
      const ys = coords(strokeOutlinePath(points, { size, pen: false })).filter(
        (_, i) => i % 2 === 1,
      );
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(extent(16)).toBeGreaterThan(extent(4));
  });
});
