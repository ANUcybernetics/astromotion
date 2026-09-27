// The video engine's Canvas 2D layer in real Chrome: a canvas redrawn as a pure
// function of t on every seek, read back as pixels, at the device pixel ratio a
// 4K render uses.
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { type Browser, launch, type Page } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { chromeArgs, findChrome } from "../src/chrome.mjs";

const root = join(import.meta.dirname, "..", "video");
const PAGE = `<!doctype html><html><body style="margin:0">
<div id="stage" data-composition-id="t" data-duration="10" style="position:relative;width:800px;height:400px"></div>
<script type="module">
  import * as M from "./motion.js";
  import * as C from "./canvas.js";
  window.M = M;
  window.C = C;
  // a pixel hash of a canvas's whole backing store
  window.pixels = (el) => {
    const d = el.getContext("2d").getImageData(0, 0, el.width, el.height).data;
    let h = 2166136261;
    for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619);
    return (h >>> 0).toString(16);
  };
  // two thousand seeded marks sweeping in over t: the shape of a real beat
  window.field = (tl, parent, opts = {}) => {
    const r = C.rng(42);
    const marks = Array.from({ length: 2000 }, () => [r() * 380, r() * 180, r() * 4, r()]);
    return C.canvas(tl, parent, (ctx, t, { w, h }) => {
      ctx.fillStyle = "#1c1917";
      ctx.fillRect(0, 0, w, h);
      for (const [x, y, d, a] of marks) {
        const p = C.phase(t, d, 2, "out-cubic");
        if (!p) continue;
        ctx.globalAlpha = a * p;
        ctx.fillStyle = a > 0.5 ? "#be830e" : "#fff";
        ctx.beginPath();
        ctx.arc(10 + x * p, 10 + y, 1.5 + a * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }, { w: 400, h: 200, ...opts });
  };
  window.moduleReady = true;
</script></body></html>`;

let server: Server;
let browser: Browser;
let page: Page;
let base: string;

beforeAll(async () => {
  server = createServer(async (req, res) => {
    if (req.url === "/" || req.url === "/index.html") {
      res.setHeader("content-type", "text/html");
      res.end(PAGE);
      return;
    }
    try {
      const body = await readFile(join(root, req.url ?? ""));
      res.setHeader("content-type", "text/javascript");
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((ok) => server.listen(0, ok));
  const addr = server.address();
  base = `http://localhost:${typeof addr === "object" && addr ? addr.port : 0}/`;
  const executablePath = findChrome();
  if (!executablePath) throw new Error("no Chrome found (set ASTROMOTION_CHROME_PATH)");
  browser = await launch({
    executablePath,
    args: [...chromeArgs(), "--no-sandbox"],
    headless: true,
  });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  server?.close();
});

async function fresh(deviceScaleFactor = 1) {
  page = await browser.newPage();
  await page.setViewport({ width: 800, height: 400, deviceScaleFactor });
  await page.goto(base);
  await page.waitForFunction("window.moduleReady === true");
}

const run = <T>(fn: string) =>
  page.evaluate(
    `(() => { const M = window.M, C = window.C; const stage = document.getElementById("stage"); ${fn} })()`,
  ) as Promise<T>;

describe("video canvas layer", () => {
  it("draws the same pixels for the same t, however it was reached", async () => {
    await fresh(2);
    const seeked = await run<string[]>(`
      const tl = M.timeline();
      const c = window.field(tl, stage);
      const ctl = tl.finish(6);
      const at = (t) => (ctl.seek(t), window.pixels(c.el));
      return [at(1.5), at(4), at(0), at(1.5), at(0.2), at(4), at(1.5)];
    `);
    expect(seeked[0]).toBe(seeked[3]);
    expect(seeked[0]).toBe(seeked[6]);
    expect(seeked[1]).toBe(seeked[5]);
    expect(new Set([seeked[0], seeked[1], seeked[2], seeked[4]]).size).toBe(4);
    // a cold page seeking straight to the frame, as a parallel renderer does
    await fresh(2);
    const cold = await run<string>(`
      const tl = M.timeline();
      const c = window.field(tl, stage);
      tl.finish(6).seek(1.5);
      return window.pixels(c.el);
    `);
    expect(cold).toBe(seeked[0]);
  });

  it("resets the context between frames, so no state leaks from one seek to the next", async () => {
    await fresh();
    const out = await run<string[]>(`
      const tl = M.timeline();
      const c = C.canvas(tl, stage, (ctx, t) => {
        if (t > 1) {
          ctx.globalAlpha = 0.2;
          ctx.translate(50, 0);
        }
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, 20, 20);
      }, { w: 100, h: 20 });
      const ctl = tl.finish(2);
      const at = (t) => (ctl.seek(t), window.pixels(c.el));
      return [at(0), at(2), at(0)];
    `);
    expect(out[0]).not.toBe(out[1]);
    expect(out[2]).toBe(out[0]);
  });

  it("sizes the backing store for the device pixel ratio, times density", async () => {
    await fresh(2);
    const out = await run<number[]>(`
      const tl = M.timeline();
      const a = C.canvas(tl, stage, (ctx) => {
        ctx.fillStyle = "#000";
        ctx.fillRect(10, 10, 20, 20);
      }, { w: 100, h: 50 });
      const b = C.canvas(tl, stage, () => {}, { w: 100, h: 50, density: 1.5 });
      tl.finish(1);
      const alpha = (x, y) => a.ctx.getImageData(x, y, 1, 1).data[3];
      const box = a.el.getBoundingClientRect();
      return [a.el.width, a.el.height, b.el.width, b.el.height, box.width, box.height,
        alpha(19, 19), alpha(20, 20), alpha(59, 59), alpha(60, 60)];
    `);
    expect(out.slice(0, 6)).toEqual([200, 100, 300, 150, 100, 50]);
    expect(out.slice(6)).toEqual([0, 255, 255, 0]);
  });

  it("places and tweens the canvas element like any other", async () => {
    await fresh();
    const out = await run<string[]>(`
      const tl = M.timeline();
      const c = C.canvas(tl, stage, () => {}, { x: 30, y: 40, w: 10, h: 10 });
      M.set(c.el, { opacity: 0 });
      tl.to(c.el, { opacity: 1, x: 130 }, 0, { dur: 1, ease: "linear" });
      const ctl = tl.finish(1);
      ctl.seek(1);
      const s = getComputedStyle(c.el);
      return [s.translate, s.opacity];
    `);
    expect(out).toEqual(["130px 40px", "1"]);
  });

  it("gives the same numbers for the same seed", async () => {
    await fresh();
    const out = await run<number[][]>(`
      const take = (seed) => { const r = C.rng(seed); return Array.from({ length: 1000 }, r); };
      return [take(7), take(7), take(8)];
    `);
    expect(out[0]).toEqual(out[1]);
    expect(out[0]).not.toEqual(out[2]);
    expect(out[0].every((v) => v >= 0 && v < 1)).toBe(true);
    const mean = out[0].reduce((s, v) => s + v, 0) / out[0].length;
    expect(mean).toBeCloseTo(0.5, 1);
  });

  it("eases progress through a phase", async () => {
    await fresh();
    const out = await run<number[]>(`
      return [C.phase(0, 1, 2), C.phase(2, 1, 2), C.phase(4, 1, 2), C.phase(2, 1, 2, "out-quad"),
        C.phase(0.9, 1, 0), C.phase(1, 1, 0)];
    `);
    expect(out).toEqual([0, 0.5, 1, 0.75, 0, 1]);
  });
});
