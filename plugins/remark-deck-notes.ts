import { parseNotesDirectiveMdx } from "../src/parse-helpers.ts";
import { attr, sectionDirective } from "./section-directive.ts";

export function remarkDeckNotes() {
  return sectionDirective(parseNotesDirectiveMdx, (sec, notesContent) => {
    // `<aside class="notes">` is the element Reveal's notes plugin reads
    // for the speaker view; reveal core CSS hides it (`display:none`) so
    // the audience never sees it. `aria-hidden` is needed too: the notes
    // are presenter-only, and a static a11y scan (which doesn't apply
    // reveal's CSS, so it treats the aside as visible) would otherwise flag
    // it as a complementary landmark nested inside <main>.
    sec.children.push({
      type: "mdxJsxFlowElement",
      name: "aside",
      attributes: [attr("class", "notes"), attr("aria-hidden", "true")],
      children: [{ type: "html", value: notesContent }],
    });
  });
}
