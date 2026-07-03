// Stroke geometry: perfect-freehand turns raw input points into a closed
// variable-width outline polygon (the tldraw ink engine), and we join that
// into an SVG path string --- quadratic curves through segment midpoints ---
// which the DOM layer feeds to Path2D and fills. Pressure is real when the
// input came from a stylus, simulated from drawing velocity otherwise.

import { getStroke } from "perfect-freehand";

import type { WhiteboardPoint } from "./core";

export interface OutlineOptions {
  size: number; // full stroke width in CSS pixels
  pen: boolean; // honour input pressure rather than simulating it
}

export function strokeOutlinePath(
  points: WhiteboardPoint[],
  { size, pen }: OutlineOptions,
): string {
  if (points.length === 0) return "";
  const outline = getStroke(
    points.map((p) => [p.x, p.y, p.pressure]),
    {
      size,
      thinning: 0.55,
      smoothing: 0.5,
      streamline: 0.5,
      simulatePressure: !pen,
    },
  );
  return svgPathFromOutline(outline);
}

function svgPathFromOutline(outline: number[][]): string {
  if (outline.length === 0) return "";
  const parts = [`M ${outline[0][0]} ${outline[0][1]} Q`];
  for (let i = 0; i < outline.length; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % outline.length];
    parts.push(`${x0} ${y0} ${(x0 + x1) / 2} ${(y0 + y1) / 2}`);
  }
  parts.push("Z");
  return parts.join(" ");
}
