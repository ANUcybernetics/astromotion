import { parseIfDirectiveMdx } from "../src/parse-helpers.ts";
import { attr, sectionDirective } from "./section-directive.ts";

export function remarkDeckConditionals() {
  return sectionDirective(parseIfDirectiveMdx, (sec, condition) => {
    sec.attributes.push(attr("data-deck-if", condition));
  });
}
