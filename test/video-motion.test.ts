// The video motion engine in real Chrome: compositions are built, compiled to
// WAAPI animations and seeked, and the tests read back computed styles, as a
// renderer's frame would show them.
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
  window.M = M;
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

async function fresh() {
  page = await browser.newPage();
  await page.goto(base);
  await page.waitForFunction("window.moduleReady === true");
}

// run fn(M, stage) in the page; it builds on a timeline and returns a probe
// name → function(t) map is awkward to ship, so tests seek and read inline
const run = <T>(fn: string) =>
  page.evaluate(
    `(() => { const M = window.M; const stage = document.getElementById("stage"); ${fn} })()`,
  ) as Promise<T>;

describe("video motion engine", () => {
  beforeAll(fresh);

  it("tweens and sets land at their times, and seeking back undoes them", async () => {
    const out = await run<number[]>(`
      const a = M.el("div", {}, stage);
      M.set(a, { opacity: 0 });
      const tl = M.timeline();
      tl.to(a, { opacity: 1 }, 1, { dur: 1, ease: "linear" });
      tl.set(a, { opacity: 0.25 }, 5);
      const c = tl.finish(10);
      const at = (t) => (c.seek(t), +getComputedStyle(a).opacity);
      return [at(0), at(1.5), at(3), at(6), at(1.5), at(0)];
    `);
    expect(out[0]).toBe(0);
    expect(out[1]).toBeCloseTo(0.5, 2);
    expect(out[2]).toBe(1);
    expect(out[3]).toBe(0.25);
    expect(out[4]).toBeCloseTo(0.5, 2);
    expect(out[5]).toBe(0);
  });

  it("moves x and y on independent schedules through translate", async () => {
    const out = await run<string[]>(`
      const a = M.layer(stage, 100, 50);
      const tl = M.timeline();
      tl.to(a, { x: 300 }, 0, { dur: 2, ease: "linear" });
      tl.to(a, { y: 150 }, 1, { dur: 2, ease: "linear" });
      const c = tl.finish(4);
      const at = (t) => (c.seek(t), getComputedStyle(a).translate);
      return [at(0), at(1), at(2), at(3)];
    `);
    expect(out).toEqual(["100px 50px", "200px 50px", "300px 100px", "300px 150px"]);
  });

  it("resolves relative values in time order and returns appear to where it sat", async () => {
    const out = await run<string[]>(`
      const a = M.layer(stage, 0, 200);
      M.set(a, { opacity: 0 });
      const tl = M.timeline();
      // added out of time order on purpose
      tl.to(a, { y: "+=50" }, 4, { dur: 0.5 });
      M.appear(tl, a, 1, { y: 24, dur: 0.5 });
      const c = tl.finish(6);
      const at = (t) => (c.seek(t), getComputedStyle(a).translate + " " + getComputedStyle(a).opacity);
      return [at(0.5), at(1), at(2), at(5)];
    `);
    expect(out[0]).toBe("0px 224px 0");
    expect(out[1]).toBe("0px 224px 0");
    expect(out[2]).toBe("0px 200px 1");
    expect(out[3]).toBe("0px 250px 1");
  });

  it("cuts a tween off where it is when a later one starts on the same property", async () => {
    const out = await run<number[]>(`
      const a = M.layer(stage, 0, 0);
      const tl = M.timeline();
      tl.to(a, { x: 100 }, 0, { dur: 2, ease: "linear" });
      tl.to(a, { x: 0 }, 1, { dur: 1, ease: "linear" });
      const c = tl.finish(3);
      const x = (t) => (c.seek(t), parseFloat(getComputedStyle(a).translate));
      return [x(1), x(1.5), x(2), x(2.5)];
    `);
    expect(out[0]).toBeCloseTo(50, 0);
    expect(out[1]).toBeCloseTo(25, 0);
    expect(out[2]).toBeCloseTo(0, 0);
    expect(out[3]).toBeCloseTo(0, 0);
  });

  it("holds a first fromTo's from values from the start unless told not to", async () => {
    const out = await run<number[]>(`
      const a = M.el("div", {}, stage), b = M.el("div", {}, stage);
      const tl = M.timeline();
      tl.fromTo(a, { opacity: 0 }, { opacity: 1 }, 2, { dur: 0.5 });
      tl.fromTo(b, { opacity: 0 }, { opacity: 1 }, 2, { dur: 0.5, immediate: false });
      const c = tl.finish(3);
      c.seek(1);
      return [+getComputedStyle(a).opacity, +getComputedStyle(b).opacity];
    `);
    expect(out).toEqual([0, 1]);
  });

  it("overshoots with out-back and settles", async () => {
    const out = await run<number[]>(`
      const a = M.layer(stage, 0, 0);
      const tl = M.timeline();
      tl.to(a, { x: 100 }, 0, { dur: 1, ease: "out-back(1.4)" });
      const c = tl.finish(1);
      const x = (t) => (c.seek(t), parseFloat(getComputedStyle(a).translate));
      return [x(0.7), x(1)];
    `);
    expect(out[0]).toBeGreaterThan(100);
    expect(out[1]).toBeCloseTo(100, 1);
  });

  it("evaluates a function value per target", async () => {
    const out = await run<string[]>(`
      const els = [0, 1, 2].map(() => M.layer(stage, 0, 0));
      const tl = M.timeline();
      tl.to(els, { x: (i) => i * 100 }, 0, { dur: 1 });
      const c = tl.finish(1);
      c.seek(1);
      return els.map((e) => getComputedStyle(e).translate);
    `);
    expect(out).toEqual(["0px", "100px", "200px"]);
  });

  it("plays a yoyo out and back, and staggers targets", async () => {
    const out = await run<number[]>(`
      const a = M.el("div", {}, stage), b = M.el("div", {}, stage);
      M.set([a, b], { x: 0 });
      const tl = M.timeline();
      tl.to([a, b], { scale: 2 }, 0, { dur: 1, yoyo: true, stagger: 1, ease: "linear" });
      const c = tl.finish(4);
      const s = (el, t) => (c.seek(t), parseFloat(getComputedStyle(el).scale));
      return [s(a, 1), s(a, 2), s(b, 1), s(b, 2), s(b, 3)];
    `);
    expect(out).toEqual([2, 1, 1, 2, 1]);
  });

  it("keeps a layer's resting scale through appear, and pops relative to it", async () => {
    const out = await run<number[]>(`
      const a = M.el("div", {}, stage), b = M.el("div", {}, stage);
      M.set([a, b], { scale: 0.5 });
      const tl = M.timeline();
      M.appear(tl, a, 1, { dur: 0.5 });
      M.appear(tl, b, 1, { dur: 0.5, scale: 0.8 });
      const c = tl.finish(3);
      const s = (el, t) => (c.seek(t), parseFloat(getComputedStyle(el).scale));
      return [s(a, 0.5), s(a, 2), s(b, 1), s(b, 2)];
    `);
    expect(out[0]).toBeCloseTo(0.5, 3);
    expect(out[1]).toBeCloseTo(0.5, 3);
    expect(out[2]).toBeCloseTo(0.4, 3);
    expect(out[3]).toBeCloseTo(0.5, 3);
  });

  it("hides a round-capped path completely until it draws on", async () => {
    // rasterise the prepped path and count inked pixels: a round cap on a
    // zero-length dash would leave a dot at the path's start or end
    const inked = await run<Promise<number>>(`
      const s = M.svg("svg", { width: 400, height: 200, xmlns: "http://www.w3.org/2000/svg" }, stage);
      const p = M.svg("path", { d: "M100 100 C160 20 240 180 300 100", stroke: "black", "stroke-width": 24,
        "stroke-linecap": "round", fill: "none" }, s);
      M.prepDraw([p]);
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(s)],
        { type: "image/svg+xml" }));
      return new Promise((ok) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas");
          c.width = 400; c.height = 200;
          const ctx = c.getContext("2d");
          ctx.drawImage(img, 0, 0);
          const d = ctx.getImageData(0, 0, 400, 200).data;
          let n = 0;
          for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
          ok(n);
        };
        img.src = url;
      });
    `);
    expect(inked).toBe(0);
  });

  it("returns a yoyo to the value it started from, not the property's default", async () => {
    const out = await run<(number | string)[]>(`
      const a = M.el("div", {}, stage);
      M.set(a, { opacity: 0.2, color: "rgb(0, 0, 0)" });
      const tl = M.timeline();
      tl.to(a, { opacity: 0.8, color: "rgb(200, 100, 0)" }, 0, { dur: 1, yoyo: true, ease: "linear" });
      const c = tl.finish(3);
      const at = (t) => (c.seek(t), [+getComputedStyle(a).opacity, getComputedStyle(a).color]);
      return [...at(1), ...at(1.5), ...at(2.5)];
    `);
    expect(out[0]).toBeCloseTo(0.8, 2);
    expect(out[1]).toBe("rgb(200, 100, 0)");
    expect(out[2]).toBeCloseTo(0.5, 2);
    expect(out[4]).toBeCloseTo(0.2, 2);
    expect(out[5]).toBe("rgb(0, 0, 0)");
  });

  it("transforms SVG elements about their own box", async () => {
    const out = await run<number[]>(`
      const s = M.svg("svg", { width: 400, height: 400 }, stage);
      const r = M.svg("rect", { x: 100, y: 100, width: 50, height: 50 }, s);
      M.set(r, { transformOrigin: "50% 50%" });
      const tl = M.timeline();
      tl.to(r, { x: 40, scale: 2 }, 0, { dur: 1, ease: "linear" });
      const c = tl.finish(1);
      c.seek(1);
      const b = r.getBoundingClientRect();
      return [b.width, b.left - s.getBoundingClientRect().left];
    `);
    expect(out[0]).toBeCloseTo(100, 0);
    expect(out[1]).toBeCloseTo(115, 0);
  });

  it("samples computed motion, such as a logarithmic zoom", async () => {
    const out = await run<number[]>(`
      const a = M.layer(stage, 0, 0);
      const tl = M.timeline();
      const cam = M.camera(a, M.stage(stage));
      cam.logZoom(tl, { px: 0, py: 0, from: 1, to: 16 }, 0, 4, "linear");
      const c = tl.finish(4);
      const s = (t) => (c.seek(t), parseFloat(getComputedStyle(a).scale));
      return [s(0), s(1), s(2), s(3), s(4)];
    `);
    [1, 2, 4, 8, 16].forEach((v, i) => expect(out[i]).toBeCloseTo(v, 1));
  });

  it("interpolates colours given as custom properties", async () => {
    const out = await run<string[]>(`
      stage.style.setProperty("--from", "rgb(0, 0, 0)");
      stage.style.setProperty("--to", "rgb(200, 100, 0)");
      const s = M.svg("svg", {}, stage);
      const t = M.svg("text", { text: "hi" }, s);
      const tl = M.timeline();
      tl.fromTo(t, { fill: "var(--from)" }, { fill: "var(--to)" }, 0, { dur: 1, ease: "linear" });
      const c = tl.finish(1);
      const f = (x) => (c.seek(x), getComputedStyle(t).fill);
      return [f(0), f(0.5), f(1)];
    `);
    expect(out).toEqual(["rgb(0, 0, 0)", "rgb(100, 50, 0)", "rgb(200, 100, 0)"]);
  });

  it("boils a path in steps, the same way on every seek", async () => {
    const out = await run<string[]>(`
      const s = M.svg("svg", {}, stage);
      const p = M.svg("path", { d: "M10 10 L10 50" }, s);
      const tl = M.timeline();
      tl.boil(p, { amp: 1, fps: 12, variants: 3 });
      const c = tl.finish(2);
      const d = (t) => (c.seek(t), getComputedStyle(p).d);
      return [d(0.01), d(0.07), d(0.09), d(0.18), d(0.26), d(0.07)];
    `);
    expect(out[0]).toBe(out[1]);
    expect(out[2]).not.toBe(out[1]);
    expect(out[3]).not.toBe(out[2]);
    expect(out[4]).toBe(out[0]);
    expect(out[5]).toBe(out[1]);
  });

  it("registers a controller a renderer can seek", async () => {
    const out = await run<number[]>(`
      const a = M.el("div", {}, stage);
      const tl = M.timeline();
      tl.to(a, { opacity: 0 }, 1, { dur: 1 });
      const c = tl.finish(5);
      c.totalTime(3);
      return [c.duration(), c.totalTime(), c.animations.length, +getComputedStyle(a).opacity];
    `);
    expect(out).toEqual([5, 3, 1, 0]);
  });
});
