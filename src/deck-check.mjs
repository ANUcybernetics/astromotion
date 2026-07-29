// The in-page half of `astromotion-check`: measure one slide and report what
// does not fit. Kept out of the bin script so it can be unit-tested against a
// stub DOM, and so the browser only ever evaluates one self-contained function.
//
// Two rules, because a deck fails to fit in two visibly different ways:
//
// - `overflow`: a text element's box extends past the 1280x720 canvas. Loud
//   in the room --- the last line of a slide runs under the footer or off the
//   bottom edge.
// - `clipped`: an element whose overflow is not `visible` is hiding part of
//   its own content. This is the quiet one. A code block inside a split
//   panel is a flex item, and a flex item with a non-visible overflow has an
//   automatic minimum size of zero, so when the slide runs full the block is
//   silently squashed and the last command simply is not on screen. Nothing
//   about the rendered slide says so.
//
// Backgrounds, split-image panels and decorative art bleed off the canvas by
// design, so only text-bearing elements are measured for `overflow`.

export const TEXT_SELECTOR = "h1, h2, h3, h4, h5, h6, p, ul, ol, pre, table, blockquote, dl";

// Serialised into the browser by the bin script, so it must not close over
// anything: everything it needs arrives as arguments.
export function measureSlide(textSelector, tolerance) {
  const section = document.querySelector(".reveal .slides > section.present");
  if (!section) return { error: "no present slide" };

  const box = section.getBoundingClientRect();
  // Reveal scales the 1280x720 canvas to the viewport with a transform, so
  // convert measured pixels back to canvas units --- the numbers a deck
  // author can act on, and stable across viewport sizes.
  const scale = box.height / 720 || 1;
  // Headings carry a trailing "#" from the anchor link the theme adds.
  const heading =
    section.querySelector("h1, h2, h3")?.textContent?.trim().replace(/#$/, "").trim() ?? "";

  const violations = [];
  let worstBottom = 0;
  let worstRight = 0;

  for (const el of section.querySelectorAll(textSelector)) {
    const r = el.getBoundingClientRect();
    if (r.height === 0 && r.width === 0) continue;
    worstBottom = Math.max(worstBottom, (r.bottom - box.bottom) / scale);
    worstRight = Math.max(worstRight, (r.right - box.right) / scale);
  }
  if (worstBottom > tolerance) {
    violations.push({
      detail: `content runs ${Math.round(worstBottom)}px past the bottom of the slide`,
      rule: "overflow",
    });
  }
  if (worstRight > tolerance) {
    violations.push({
      detail: `content runs ${Math.round(worstRight)}px past the right edge of the slide`,
      rule: "overflow",
    });
  }

  // scrollHeight is the wrong instrument here: on a scroll container it counts
  // the last child's bottom margin and the container's bottom padding, so a
  // perfectly fine slide reports ~100px "hidden". Measure where the content
  // actually ends instead, against the edge the box clips at.
  let worstClip;
  for (const el of section.querySelectorAll("*")) {
    const style = getComputedStyle(el);
    if (style.overflow === "visible" && style.overflowX === "visible") continue;
    const box = el.getBoundingClientRect();
    if (box.height === 0 && box.width === 0) continue;
    const edgeBottom = box.bottom - (Number.parseFloat(style.borderBottomWidth) || 0);
    const edgeRight = box.right - (Number.parseFloat(style.borderRightWidth) || 0);

    let hiddenY = 0;
    let hiddenX = 0;
    for (const child of el.querySelectorAll("*")) {
      const r = child.getBoundingClientRect();
      if (r.height === 0 && r.width === 0) continue;
      hiddenY = Math.max(hiddenY, r.bottom - edgeBottom);
      hiddenX = Math.max(hiddenX, r.right - edgeRight);
    }
    if (hiddenY <= tolerance && hiddenX <= tolerance) continue;

    const vertical = hiddenY > tolerance;
    const amount = Math.round((vertical ? hiddenY : hiddenX) / scale);
    // Nested scroll containers would each report the same clipped content, so
    // keep only the worst offender on the slide.
    if (worstClip && worstClip.amount >= amount) continue;
    const name =
      el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : "");
    worstClip = {
      amount,
      detail: `${name} hides ${amount}px of its content ${vertical ? "below" : "right of"} the visible box`,
      rule: "clipped",
    };
  }
  if (worstClip) violations.push({ detail: worstClip.detail, rule: worstClip.rule });

  return { heading, violations };
}
