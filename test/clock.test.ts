import { describe, expect, it } from "vitest";

import { formatClock, msUntilNextMinute } from "../src/clock";

// Local time, since a wall clock should match the clock on the wall of the
// room --- constructed with the local-time Date constructor, not an ISO string.
const at = (h: number, m: number, s = 0, ms = 0) => new Date(2026, 6, 22, h, m, s, ms);

describe("formatClock", () => {
  it("renders 24-hour HH:MM", () => {
    expect(formatClock(at(14, 5))).toBe("14:05");
  });

  it("zero-pads the hour and keeps midnight at 00", () => {
    expect(formatClock(at(9, 30))).toBe("09:30");
    expect(formatClock(at(0, 0))).toBe("00:00");
  });

  it("ignores seconds rather than rounding the minute up", () => {
    expect(formatClock(at(14, 5, 59, 999))).toBe("14:05");
  });
});

describe("msUntilNextMinute", () => {
  it("waits out the rest of the minute, plus a cushion", () => {
    expect(msUntilNextMinute(at(14, 5, 0, 0))).toBe(60_050);
    expect(msUntilNextMinute(at(14, 5, 59, 500))).toBe(550);
  });

  it("never returns a delay that could fire inside the current minute", () => {
    for (let s = 0; s < 60; s += 7) {
      const delay = msUntilNextMinute(at(14, 5, s, 250));
      const next = at(14, 5, s, 250).getTime() + delay;
      expect(new Date(next).getMinutes()).toBe(6);
    }
  });
});
