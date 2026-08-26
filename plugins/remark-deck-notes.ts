import type { Root, RootContent } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { isLegacyNotesDirective, isNotesFence } from "../src/parse-helpers.ts";
import { attr } from "./section-directive.ts";

// Notes are authored as markdown, so a fence body has to be parsed into mdast
// before it can join the tree. `unified().parse` runs no transformers ---
// registering remark-gfm here only adds its micromark extensions, so a table or
// a strikethrough inside notes parses the way it does in slide prose. Smart
// quotes arrive later: remarkDeckSmartypants walks the whole tree, this aside
// included.
const notesParser = unified().use(remarkParse).use(remarkGfm);

export function remarkDeckNotes() {
  return (tree: Root, file: { path?: string }) => {
    if (!file.path?.endsWith(".deck.mdx")) return;
    for (const section of tree.children) {
      if ((section as any).type !== "mdxJsxFlowElement" || (section as any).name !== "section")
        continue;
      const sec = section as any;
      const kept: RootContent[] = [];
      const notes: RootContent[] = [];
      for (const child of sec.children as RootContent[]) {
        if (child.type === "mdxFlowExpression" && isLegacyNotesDirective(child.value)) {
          throw new Error(legacyNotesError(file.path, child));
        }
        if (child.type === "code" && isNotesFence(child.lang)) {
          // Two fences in one slide read as one set of notes, in source order.
          notes.push(...(notesParser.parse(child.value).children as RootContent[]));
          continue;
        }
        kept.push(child);
      }
      sec.children = kept;
      // `<aside class="notes">` is the element Reveal's notes plugin reads
      // for the speaker view; reveal core CSS hides it (`display:none`) so
      // the audience never sees it. `aria-hidden` is needed too: the notes
      // are presenter-only, and a static a11y scan (which doesn't apply
      // reveal's CSS, so it treats the aside as visible) would otherwise flag
      // it as a complementary landmark nested inside <main>.
      if (notes.length > 0) {
        sec.children.push({
          type: "mdxJsxFlowElement",
          name: "aside",
          attributes: [attr("class", "notes"), attr("aria-hidden", "true")],
          children: notes,
        });
      }
    }
  };
}

function legacyNotesError(path: string, node: RootContent): string {
  const line = node.position ? `:${node.position.start.line}` : "";
  return (
    `${path}${line}: {/* notes: … */} was removed in astromotion v0.23.0. ` +
    "Speaker notes are a fenced `notes` block, authored in markdown:\n\n" +
    "    ```notes\n    - what to say, with *emphasis* and [links](https://example.com)\n    ```\n"
  );
}
