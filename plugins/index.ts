import { remarkDeckIncludes } from "./remark-deck-includes.ts";
import { remarkDeckSections } from "./remark-deck-sections.ts";
import { remarkDeckClasses } from "./remark-deck-classes.ts";
import { remarkDeckConditionals } from "./remark-deck-conditionals.ts";
import { remarkDeckAnimate } from "./remark-deck-animate.ts";
import { remarkDeckNotes } from "./remark-deck-notes.ts";
import { remarkDeckQr } from "./remark-deck-qr.ts";
import { remarkDeckBg } from "./remark-deck-bg.ts";
import { remarkDeckSmartypants } from "./remark-deck-smartypants.ts";

export const deckRemarkPlugins = [
  remarkDeckIncludes,
  remarkDeckSections,
  remarkDeckClasses,
  remarkDeckConditionals,
  remarkDeckAnimate,
  remarkDeckNotes,
  remarkDeckQr,
  remarkDeckBg,
  remarkDeckSmartypants,
];

export {
  remarkDeckIncludes,
  remarkDeckSections,
  remarkDeckClasses,
  remarkDeckConditionals,
  remarkDeckAnimate,
  remarkDeckNotes,
  remarkDeckQr,
  remarkDeckBg,
  remarkDeckSmartypants,
};
