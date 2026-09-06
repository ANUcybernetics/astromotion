// The in-page half of `astromotion-check`: measure one slide and report what
// does not fit. Kept out of the bin script so it can be unit-tested against a
// stub DOM, and so the browser only ever evaluates one self-contained function.
//
// Three rules, because a deck fails to fit in three visibly different ways:
//
// - `overflow`: a text element's box extends past the slide's content area,
//   into the gutter the theme pads the slide with. Loud in the room --- the
//   last line of a slide runs into the margin, under the footer, or off the
//   bottom edge. The gutter is the measure, not the canvas edge: a slide whose
//   last line sits in the padding is already too full, and the two symptoms
//   below start there, not 64px later at the edge of the canvas.
// - `clipped`: an element whose overflow is not `visible` is hiding part of
//   its own content. This is the quiet one. A code block inside a split
//   panel is a flex item, and a flex item with a non-visible overflow has an
//   automatic minimum size of zero, so when the slide runs full the block is
//   silently squashed and the last command simply is not on screen. Nothing
//   about the rendered slide says so.
// - `scrollbar`: a scroll container whose scrollable area is larger than its
//   box, so the browser draws a scrollbar on the slide, even though every
//   child is inside the visible box. Scrollable overflow counts the last
//   child's trailing margin and the container's own end padding, so a column
//   whose content merely reaches the gutter still scrolls by margin + padding.
//   Chrome draws that scrollbar on the projector.
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

  // Helpers live inside measureSlide rather than at module scope because the
  // whole function is serialised into the page by its source text.
  // oxlint-disable-next-line unicorn/consistent-function-scoping
  const px = (value) => Number.parseFloat(value) || 0;
  // The edges content must stay inside: the slide's padding box minus its
  // padding. A split layout escapes the section's padding (it is absolutely
  // positioned over the whole canvas) and pads its own content column
  // instead, so text inside one is measured against that column's padding.
  const contentEdges = (el) => {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      bottom: r.bottom - px(style.paddingBottom),
      gutterBottom: px(style.paddingBottom) / scale,
      gutterRight: px(style.paddingRight) / scale,
      right: r.right - px(style.paddingRight),
    };
  };
  const sectionEdges = contentEdges(section);
  const columnEdges = new Map();
  const edgesFor = (el) => {
    const column = el.closest?.(".split-content");
    if (!column) return sectionEdges;
    if (!columnEdges.has(column)) columnEdges.set(column, contentEdges(column));
    return columnEdges.get(column);
  };

  const violations = [];
  let worstBottom = 0;
  let worstRight = 0;
  let gutterBottom = sectionEdges.gutterBottom;
  let gutterRight = sectionEdges.gutterRight;

  for (const el of section.querySelectorAll(textSelector)) {
    const r = el.getBoundingClientRect();
    if (r.height === 0 && r.width === 0) continue;
    const edges = edgesFor(el);
    const below = (r.bottom - edges.bottom) / scale;
    const beyond = (r.right - edges.right) / scale;
    if (below > worstBottom) {
      worstBottom = below;
      gutterBottom = edges.gutterBottom;
    }
    if (beyond > worstRight) {
      worstRight = beyond;
      gutterRight = edges.gutterRight;
    }
  }
  if (worstBottom > tolerance) {
    violations.push({
      detail: `content runs ${Math.round(worstBottom)}px below the content area (the slide's gutter there is ${Math.round(gutterBottom)}px)`,
      rule: "overflow",
    });
  }
  if (worstRight > tolerance) {
    violations.push({
      detail: `content runs ${Math.round(worstRight)}px right of the content area (the slide's gutter there is ${Math.round(gutterRight)}px)`,
      rule: "overflow",
    });
  }

  // Two measures of a scroll container, because they answer different
  // questions. Where the children's boxes end, against the edge the box
  // clips at, says whether content is hidden. scrollHeight says whether the
  // browser will draw a scrollbar: it also counts the last child's trailing
  // margin and the container's end padding, so it is the wrong instrument for
  // "hidden" (a fine slide would report ~100px) and the right one for
  // "scrollbar". A container that hides content is reported as clipped and
  // not also as scrolling; the scrollbar rule is for the case where nothing
  // is hidden and the slide still grows a scrollbar.
  let worstClip;
  let worstScroll;
  for (const el of section.querySelectorAll("*")) {
    const style = getComputedStyle(el);
    if (style.overflow === "visible" && style.overflowX === "visible") continue;
    const box = el.getBoundingClientRect();
    if (box.height === 0 && box.width === 0) continue;
    const edgeBottom = box.bottom - px(style.borderBottomWidth);
    const edgeRight = box.right - px(style.borderRightWidth);

    let hiddenY = 0;
    let hiddenX = 0;
    for (const child of el.querySelectorAll("*")) {
      const r = child.getBoundingClientRect();
      if (r.height === 0 && r.width === 0) continue;
      hiddenY = Math.max(hiddenY, r.bottom - edgeBottom);
      hiddenX = Math.max(hiddenX, r.right - edgeRight);
    }
    const name =
      el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : "");

    if (hiddenY > tolerance || hiddenX > tolerance) {
      const vertical = hiddenY > tolerance;
      const amount = Math.round((vertical ? hiddenY : hiddenX) / scale);
      // Nested scroll containers would each report the same clipped content,
      // so keep only the worst offender on the slide.
      if (worstClip && worstClip.amount >= amount) continue;
      worstClip = {
        amount,
        detail: `${name} hides ${amount}px of its content ${vertical ? "below" : "right of"} the visible box`,
        rule: "clipped",
      };
      continue;
    }

    // Only `auto` and `scroll` draw scrollbars; `hidden` and `clip` cut
    // silently, and their hidden content is the clipped rule's business.
    const scrollsY = /^(auto|scroll)$/.test(style.overflowY);
    const scrollsX = /^(auto|scroll)$/.test(style.overflowX);
    const scrollY = scrollsY ? (el.scrollHeight ?? 0) - (el.clientHeight ?? 0) : 0;
    const scrollX = scrollsX ? (el.scrollWidth ?? 0) - (el.clientWidth ?? 0) : 0;
    if (scrollY <= tolerance && scrollX <= tolerance) continue;
    const vertical = scrollY > tolerance;
    const amount = Math.round((vertical ? scrollY : scrollX) / scale);
    if (worstScroll && worstScroll.amount >= amount) continue;
    worstScroll = {
      amount,
      detail: `${name} scrolls ${amount}px ${vertical ? "vertically" : "horizontally"}: its content plus trailing margin and padding outgrow its box, so the browser draws a scrollbar`,
      rule: "scrollbar",
    };
  }
  if (worstClip) violations.push({ detail: worstClip.detail, rule: worstClip.rule });
  if (worstScroll) violations.push({ detail: worstScroll.detail, rule: worstScroll.rule });

  return { heading, violations };
}
