// Extract the readable text of a deck as plain markdown --- the thing you
// print out and mark up with a pen, with none of the visual layer.
//
// This runs entirely on the mdast source tree: parse the `.deck.mdx`, splice
// in `@include` partials, throw away everything that only exists to be
// *looked at* (images, backgrounds, QR codes, components, layout directives),
// and serialise what's left back to markdown. No Astro, no build, no browser.
//
// Deliberately plain JavaScript rather than TypeScript, and deliberately
// standalone rather than importing `src/parse-helpers.ts` and
// `plugins/remark-deck-includes.ts`: Node refuses to strip types from files
// under `node_modules`, so anything a consumer runs as a bin has to be JS that
// only imports JS. `test/deck-text.test.ts` pins the duplicated directive
// parsing against the TypeScript originals so the two can't drift.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, resolve } from "node:path";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { parse as parseYaml } from "yaml";

const MAX_DEPTH = 10;

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter).use(remarkMdx);

// `rule: "-"` keeps the slide separators looking like the ones in the source.
// Everything MDX is removed before this runs, so an unhandled node type here
// is a serialiser error rather than silent data loss --- which is what we
// want.
const serialiser = unified().use(remarkGfm).use(remarkStringify, {
  bullet: "-",
  emphasis: "_",
  fences: true,
  listItemIndent: "one",
  rule: "-",
  ruleRepetition: 3,
  ruleSpaces: false,
  strong: "*",
});

/* ---------- directive parsing (mirrors src/parse-helpers.ts) ---------- */

export function parseMdxFlowExpression(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/*") || !trimmed.endsWith("*/")) return null;
  return trimmed.slice(2, -2).trim();
}

function parseMdxDirective(value, directive) {
  const body = parseMdxFlowExpression(value);
  if (!body) return null;
  const prefix = directive + ":";
  if (!body.startsWith(prefix)) return null;
  const v = body.slice(prefix.length).trim();
  return v || null;
}

export function parseClassDirectiveMdx(value) {
  return parseMdxDirective(value, "_class");
}

export function parseIfDirectiveMdx(value) {
  return parseMdxDirective(value, "_if");
}

export function parseIdDirectiveMdx(value) {
  const id = parseMdxDirective(value, "_id");
  return id ? (id.split(/\s/)[0] ?? null) : null;
}

export function parseNotesDirectiveMdx(value) {
  return parseMdxDirective(value, "notes");
}

export function parseIncludeDirectiveMdx(value) {
  const body = parseMdxFlowExpression(value);
  if (!body) return null;
  if (!body.startsWith("@include ")) return null;
  const path = body.slice("@include ".length).trim().split(/\s/)[0];
  return path || null;
}

export function parseAnimateDirectiveMdx(value) {
  const body = parseMdxFlowExpression(value);
  if (body === null) return null;
  if (body === "_animate") return { id: null };
  const prefix = "_animate:";
  if (body.startsWith(prefix)) {
    const id = body.slice(prefix.length).trim();
    return { id: id || null };
  }
  return null;
}

export function resolveIncludePath(includePath, fromFile) {
  if (
    includePath.startsWith("./") ||
    includePath.startsWith("../") ||
    includePath.startsWith("/")
  ) {
    return resolve(dirname(fromFile), includePath);
  }
  return createRequire(fromFile).resolve(includePath);
}

/* ---------- include resolution ---------- */

// Same splice-in-place walk as `remarkDeckIncludes`, minus the position
// stripping: nothing downstream of here reads positions.
function resolveIncludesIn(root, ancestors) {
  const fromFile = ancestors.at(-1);
  for (let i = root.children.length - 1; i >= 0; i--) {
    const node = root.children[i];
    if (node.type !== "mdxFlowExpression") continue;
    const includePath = parseIncludeDirectiveMdx(node.value);
    if (!includePath) continue;
    if (!includePath.endsWith(".mdx")) {
      throw new Error(
        `@include only supports .mdx files, got: ${includePath}. Rename the file to .mdx.`,
      );
    }
    const absPath = resolveIncludePath(includePath, fromFile);
    if (ancestors.includes(absPath)) {
      throw new Error(`@include cycle: ${[...ancestors, absPath].join(" → ")}`);
    }
    if (ancestors.length > MAX_DEPTH) {
      throw new Error(`@include nesting deeper than ${MAX_DEPTH} levels: ${ancestors.join(" → ")}`);
    }
    let content;
    try {
      content = readFileSync(absPath, "utf-8");
    } catch {
      throw new Error(`@include file not found: ${includePath} (included from ${fromFile})`);
    }
    const includeRoot = parser.parse(content);
    resolveIncludesIn(includeRoot, [...ancestors, absPath]);
    root.children.splice(i, 1, ...includeRoot.children.filter((n) => !isFrontmatter(n)));
  }
}

function isFrontmatter(node) {
  return node.type === "yaml" || node.type === "toml";
}

/* ---------- text extraction ---------- */

function text(value) {
  return { type: "text", value };
}

function paragraph(value) {
  return { type: "paragraph", children: [text(value)] };
}

// Placeholders are wrapped in parentheses rather than square brackets because
// remark-stringify escapes a leading `[` (it could otherwise start a link
// label) and `\(image: …\)` on the page is exactly the sort of noise this
// export exists to remove.
function placeholder(label, detail) {
  return `(${detail ? `${label}: ${detail}` : label})`;
}

// The alt text carries astromotion's image syntax: `qr` for a QR code,
// `bg`-prefixed for backgrounds and split layouts. Everything else is a
// content image, where the alt is the only text worth keeping --- falling
// back to the filename when there isn't one, so the marker still says which
// image it was.
function imagePlaceholder(node) {
  const alt = (node.alt ?? "").trim();
  const file = basename(node.url ?? "");
  // A QR code's whole content is its URL, so that one keeps the address ---
  // as a link node, which serialises to the bare `<https://…>` autolink form
  // instead of the backslash-escaped `https\://` a text node would produce.
  if (alt === "qr") {
    return [text("(qr: "), { type: "link", url: node.url, children: [text(node.url)] }, text(")")];
  }
  if (alt === "bg" || alt.startsWith("bg ")) return [text(placeholder("background image", file))];
  return [text(placeholder("image", alt || file))];
}

// Speaker-notes bodies are HTML. Tags that end a block become a space so the
// words either side don't run together; inline tags (`<em>`, `<code>`) become
// nothing, so the punctuation after them stays put.
function stripTags(html) {
  return html
    .replace(/<(br|\/p|\/div|\/li|\/ul|\/ol|\/h[1-6])\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// remark-stringify never re-wraps, so text it emits is as long as the string
// it was handed. Deck prose keeps the source's own wrapping; reflowed asides
// need wrapping here or they print as one very long line.
function wrap(value, width) {
  const lines = [];
  let line = "";
  for (const word of value.split(" ")) {
    if (line === "") line = word;
    else if (line.length + 1 + word.length <= width) line += " " + word;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== "") lines.push(line);
  return lines.join("\n");
}

// Speaker notes and authoring comments are both prose *about* the slide, so
// both render as a labelled blockquote --- visible whether the markdown is
// read raw or rendered, and clearly not part of what's on screen.
function aside(label, body) {
  // Comments are indented to sit inside `{/* … */}` in the source, and that
  // indentation survives into the node value; a line starting with a space
  // serialises as `&#x20;`. Reflow each paragraph instead.
  const lines = body
    .split(/\n{2,}/)
    .map((para) => wrap(para.replace(/\s+/g, " ").trim(), 76))
    .filter(Boolean);
  const children = lines.map((line, i) =>
    i === 0
      ? {
          type: "paragraph",
          children: [{ type: "strong", children: [text(label)] }, text(" " + line)],
        }
      : paragraph(line),
  );
  return { type: "blockquote", children: children.length > 0 ? children : [paragraph(label)] };
}

// Directives that only steer presentation (`_class`, `_id`, `_if`,
// `_animate`) leave nothing behind. `notes:` and free-form comments become
// asides when asked for. An unrecognised directive --- a consumer's own, e.g.
// `{/* embed: topics/foo */}` --- is left visible as a comment rather than
// silently dropped, so the export never quietly omits content.
function convertExpression(node, options) {
  const body = parseMdxFlowExpression(node.value);
  if (body === null) return null;
  const notes = parseNotesDirectiveMdx(node.value);
  if (notes !== null) return options.notes ? aside("notes:", stripTags(notes)) : null;
  if (
    parseClassDirectiveMdx(node.value) !== null ||
    parseIdDirectiveMdx(node.value) !== null ||
    parseIfDirectiveMdx(node.value) !== null ||
    parseAnimateDirectiveMdx(node.value) !== null
  ) {
    return null;
  }
  return options.comments ? aside("comment:", body) : null;
}

// Returns the node's replacement: `null` to drop it, an array to splice its
// surviving children into the parent in its place.
function convert(node, options) {
  if (isFrontmatter(node) || node.type === "mdxjsEsm") return null;

  if (node.type === "mdxFlowExpression" || node.type === "mdxTextExpression") {
    return convertExpression(node, options);
  }

  // A component with no text of its own (`<CourseTimeline />`) is a widget:
  // mark its place. One that wraps content keeps the content and loses the
  // wrapper.
  if (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") {
    const children = convertChildren(node.children ?? [], options);
    if (children.length > 0) return children;
    if (!options.placeholders) return null;
    const label = placeholder("component", node.name ?? "");
    return node.type === "mdxJsxFlowElement" ? paragraph(label) : text(label);
  }

  if (node.type === "image" || node.type === "imageReference") {
    return options.placeholders ? imagePlaceholder(node) : null;
  }

  // Raw HTML in the source is markup, but it can carry text between the tags.
  if (node.type === "html") {
    const stripped = stripTags(node.value);
    return stripped ? paragraph(stripped) : null;
  }

  if (Array.isArray(node.children)) {
    const children = convertChildren(node.children, options);
    // A paragraph that held nothing but an image is now empty; so is a list
    // item whose only content was a component. Drop the husk.
    if (children.length === 0 && node.children.length > 0) return null;
    return { ...node, children };
  }

  return node;
}

function convertChildren(children, options) {
  return children.flatMap((child) => {
    const converted = convert(child, options);
    if (converted === null) return [];
    return Array.isArray(converted) ? converted : [converted];
  });
}

/* ---------- entry point ---------- */

/**
 * Render a deck's text content as markdown.
 *
 * @param {string} deckPath - path to a `.deck.mdx` file
 * @param {object} [options]
 * @param {boolean} [options.notes=true] - keep `{/* notes: … *​/}` directives
 * @param {boolean} [options.comments=true] - keep authoring comments
 * @param {boolean} [options.placeholders=true] - mark where visuals were
 * @param {boolean} [options.title=true] - lead with the frontmatter title
 * @returns {string} markdown, slides separated by `---`
 */
export function deckToMarkdown(deckPath, options = {}) {
  const opts = {
    comments: true,
    notes: true,
    placeholders: true,
    title: true,
    ...options,
  };
  const absPath = resolve(deckPath);
  const tree = parser.parse(readFileSync(absPath, "utf-8"));
  resolveIncludesIn(tree, [absPath]);

  const frontmatterNode = tree.children.find((n) => n.type === "yaml");
  const frontmatter = frontmatterNode ? (parseYaml(frontmatterNode.value) ?? {}) : {};

  const children = convertChildren(tree.children, opts);
  if (opts.title && frontmatter.title) {
    children.unshift(
      { type: "heading", depth: 1, children: [text(String(frontmatter.title))] },
      // The deck's own slides are separated by the source's thematic breaks;
      // this one keeps the title from running into the first slide.
      { type: "thematicBreak" },
    );
  }

  return serialiser.stringify({ type: "root", children });
}
