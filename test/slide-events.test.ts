import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";

import {
  emitsSlideEvents,
  initSlideEvents,
  SLIDE_CHANGE_EVENT,
  type SlideChangeDetail,
  slideTitle,
} from "../src/slide-events";

const { document } = parseHTML(`
  <div class="slides">
    <section id="intro"><h2>  Counting
      words </h2><h3>ignored</h3></section>
    <section><p>no heading</p></section>
  </div>`);
const slides = [...document.querySelectorAll("section")];

function fakeDeck(opts: { speakerNotes?: boolean; printView?: boolean } = {}) {
  let current = 0;
  const listeners: Array<() => void> = [];
  return {
    getCurrentSlide: () => slides[current],
    getIndices: () => ({ h: current }),
    getTotalSlides: () => slides.length,
    on: (_type: "slidechanged", listener: () => void) => void listeners.push(listener),
    isSpeakerNotes: () => opts.speakerNotes ?? false,
    isPrintView: () => opts.printView ?? false,
    goTo(h: number) {
      current = h;
      for (const listener of listeners) listener();
    },
  };
}

function collect(target: EventTarget): SlideChangeDetail[] {
  const seen: SlideChangeDetail[] = [];
  target.addEventListener(SLIDE_CHANGE_EVENT, (e) =>
    seen.push((e as CustomEvent<SlideChangeDetail>).detail),
  );
  return seen;
}

describe("slideTitle", () => {
  it("takes the first heading with whitespace collapsed", () => {
    expect(slideTitle(slides[0])).toBe("Counting words");
  });

  it("is null for a slide without a heading", () => {
    expect(slideTitle(slides[1])).toBeNull();
  });
});

describe("initSlideEvents", () => {
  it("reports the opening slide, then each change, one-based like the URL hash", () => {
    const deck = fakeDeck();
    const target = new EventTarget();
    const seen = collect(target);
    initSlideEvents(deck, target, "");
    deck.goTo(1);
    expect(seen).toEqual([
      { index: 1, total: 2, id: "intro", title: "Counting words" },
      { index: 2, total: 2, id: null, title: null },
    ]);
  });

  it("stays silent in the speaker view's previews and the print and export views", () => {
    expect(emitsSlideEvents(fakeDeck({ speakerNotes: true }), "")).toBe(false);
    expect(emitsSlideEvents(fakeDeck({ printView: true }), "")).toBe(false);
    expect(emitsSlideEvents(fakeDeck(), "?astromotion-export")).toBe(false);

    const deck = fakeDeck({ speakerNotes: true });
    const target = new EventTarget();
    const seen = collect(target);
    initSlideEvents(deck, target, "");
    deck.goTo(1);
    expect(seen).toEqual([]);
  });
});
