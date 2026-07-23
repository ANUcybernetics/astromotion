import { parseAnimateDirectiveMdx } from "../src/parse-helpers.ts";
import { attr, sectionDirective } from "./section-directive.ts";

/**
 * Converts `{/* _animate *​/}` (and `{/* _animate: id *​/}`) directives into the
 * `data-auto-animate` attribute (and optional `data-auto-animate-id`) that
 * Reveal.js looks for on a `<section>`. Reveal animates between two adjacent
 * slides only when both carry `data-auto-animate` and their
 * `data-auto-animate-id` values match, so a bare flag on a run of slides
 * animates the whole run, while ids scope independent sequences.
 *
 * The directive only flips the slide into auto-animate mode; which elements
 * glide (and how they match) is controlled by `data-id` attributes in the
 * slide's own markup/components, exactly as in hand-written Reveal HTML.
 */
export function remarkDeckAnimate() {
  return sectionDirective(parseAnimateDirectiveMdx, (sec, animate) => {
    sec.attributes.push(attr("data-auto-animate", null));
    if (animate.id !== null) {
      sec.attributes.push(attr("data-auto-animate-id", animate.id));
    }
  });
}
