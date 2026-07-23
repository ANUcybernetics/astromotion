import { parseClassDirectiveMdx } from "../src/parse-helpers.ts";
import { attr, sectionDirective } from "./section-directive.ts";

export function remarkDeckClasses() {
  return sectionDirective(parseClassDirectiveMdx, (sec, className) => {
    sec.attributes.push(attr("class", className));
  });
}
