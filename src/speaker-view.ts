import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

/**
 * The inline script of reveal.js's speaker view.
 *
 * The notes plugin opens the speaker view as an about:blank window and
 * document.write()s its HTML into it. That window inherits the deck page's
 * CSP, so on a site with `security.csp` the view stays stuck on "Loading
 * speaker view..." unless this script's hash is in script-src. It is read from
 * the installed plugin rather than hard-coded so a reveal.js bump can't
 * silently break it.
 */
export function speakerViewScript(): string {
  const require = createRequire(import.meta.url);
  // require.resolve picks the minified CJS build; the ESM build beside it (the
  // one the deck page imports) keeps the view as a plain string literal.
  const notes = require.resolve("reveal.js/plugin/notes").replace(/\.js$/, ".mjs");
  const source = readFileSync(notes, "utf8");
  const literal = source.match(/"((?:[^"\\]|\\.)*<script>(?:[^"\\]|\\.)*)"/)?.[1];
  if (!literal) throw new Error("astromotion: reveal.js speaker view HTML not found");
  const html = new Function(`return "${literal}"`)() as string;
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error("astromotion: reveal.js speaker view has no inline <script>");
  return script;
}
