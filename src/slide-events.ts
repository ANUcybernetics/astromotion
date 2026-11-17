import { isSuppressedView } from "./first-run-help";

/**
 * Dispatched on `document` for the slide a deck opens on and after every slide
 * change, so a consumer script (analytics, a progress widget) can follow the
 * deck without holding the Reveal instance.
 */
export const SLIDE_CHANGE_EVENT = "astromotion:slidechange";

export interface SlideChangeDetail {
  /** One-based slide number, as in the `#/n` URL hash. */
  index: number;
  total: number;
  /** The slide's `id`, when it has one. */
  id: string | null;
  /** Text of the slide's first heading, whitespace collapsed. */
  title: string | null;
}

interface SlideDeck {
  getCurrentSlide(): Element | undefined;
  getIndices(): { h: number };
  getTotalSlides(): number;
  on(type: "slidechanged", listener: () => void): void;
  isSpeakerNotes?(): boolean;
  isPrintView?(): boolean;
}

// Leaves out aria-hidden content, such as the `#` of a heading's anchor link,
// so the title is what a screen reader would announce.
export function slideTitle(slide: Element): string | null {
  const heading = slide.querySelector("h1, h2, h3, h4, h5, h6")?.cloneNode(true) as
    | Element
    | undefined;
  if (!heading) return null;
  for (const hidden of heading.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return heading.textContent?.replace(/\s+/g, " ").trim() || null;
}

export function slideDetail(slide: Element, h: number, total: number): SlideChangeDetail {
  return { index: h + 1, total, id: slide.id || null, title: slideTitle(slide) };
}

// The speaker view loads the deck twice more in its preview iframes, and the
// print and export views render slides nobody is watching. Events from those
// would count each slide several times over.
export function emitsSlideEvents(deck: SlideDeck, search: string): boolean {
  return !(deck.isSpeakerNotes?.() || deck.isPrintView?.() || isSuppressedView(search));
}

export function initSlideEvents(
  deck: SlideDeck,
  target: EventTarget = document,
  search: string = location.search,
): void {
  if (!emitsSlideEvents(deck, search)) return;
  const emit = () => {
    const slide = deck.getCurrentSlide();
    if (!slide) return;
    const detail = slideDetail(slide, deck.getIndices().h, deck.getTotalSlides());
    target.dispatchEvent(new CustomEvent(SLIDE_CHANGE_EVENT, { detail }));
  };
  emit();
  deck.on("slidechanged", emit);
}
