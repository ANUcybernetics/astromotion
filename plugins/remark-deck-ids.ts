import { parseIdDirectiveMdx } from "../src/parse-helpers.ts";
import { attr, sectionDirective } from "./section-directive.ts";

export function remarkDeckIds() {
  return sectionDirective(parseIdDirectiveMdx, (sec, id) => {
    sec.attributes.push(attr("id", id));
  });
}
