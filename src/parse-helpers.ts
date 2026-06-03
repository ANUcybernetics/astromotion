import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

interface BgModifiers {
  position?: "left" | "right";
  size?: string;
  splitPercent?: string;
  filters?: string;
}

/**
 * Resolve an `@include` path against the file requesting it. Relative paths
 * (`./`, `../`) and absolute paths use the requester's directory; bare module
 * specifiers (e.g. `astro-theme-anu/partials/foo.mdx`) go through Node's
 * package resolution starting from the requester.
 */
export function resolveIncludePath(includePath: string, fromFile: string): string {
  if (
    includePath.startsWith("./") ||
    includePath.startsWith("../") ||
    includePath.startsWith("/")
  ) {
    return resolve(dirname(fromFile), includePath);
  }
  return createRequire(fromFile).resolve(includePath);
}

export function parseMdxFlowExpression(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/*") || !trimmed.endsWith("*/")) return null;
  return trimmed.slice(2, -2).trim();
}

function parseMdxDirective(value: string, directive: string): string | null {
  const body = parseMdxFlowExpression(value);
  if (!body) return null;
  const prefix = directive + ":";
  if (!body.startsWith(prefix)) return null;
  const v = body.slice(prefix.length).trim();
  return v || null;
}

export function parseClassDirectiveMdx(value: string): string | null {
  return parseMdxDirective(value, "_class");
}

export function parseIfDirectiveMdx(value: string): string | null {
  return parseMdxDirective(value, "_if");
}

export function parseNotesDirectiveMdx(value: string): string | null {
  return parseMdxDirective(value, "notes");
}

export function parseIncludeDirectiveMdx(value: string): string | null {
  const body = parseMdxFlowExpression(value);
  if (!body) return null;
  if (!body.startsWith("@include ")) return null;
  const path = body.slice("@include ".length).trim().split(/\s/)[0];
  return path || null;
}

/**
 * Parse an `{/* _animate *​/}` directive, which flags the enclosing slide for
 * Reveal.js auto-animate (a smooth FLIP transition to the next/previous slide
 * that also carries `_animate`). Returns `null` when `value` is not an animate
 * directive, or `{ id }` when it is:
 *
 *   {/* _animate *​/}        -> { id: null }   (bare flag)
 *   {/* _animate: shuffle *​/} -> { id: "shuffle" }  (scoped group)
 *
 * The optional id maps to `data-auto-animate-id`: Reveal only animates between
 * two adjacent slides whose ids are equal, so giving two separate sequences
 * different ids stops them animating across the boundary between them.
 */
export function parseAnimateDirectiveMdx(value: string): { id: string | null } | null {
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

export function extractFrontmatter(raw: string): { data: string; content: string } | null {
  const open = "---\n";
  if (!raw.startsWith(open)) return null;
  const closeIdx = raw.indexOf("\n---\n", open.length);
  if (closeIdx === -1) {
    if (raw.indexOf("\n---", open.length) === raw.length - 4 && raw.endsWith("\n---")) {
      return { data: raw.slice(open.length, raw.length - 4), content: "" };
    }
    return null;
  }
  return {
    data: raw.slice(open.length, closeIdx),
    content: raw.slice(closeIdx + "\n---\n".length),
  };
}

export function parseBgModifiers(modifiers: string): BgModifiers {
  const result: BgModifiers = {};
  const tokens = modifiers.trim().split(/\s+/).filter(Boolean);
  const filterParts: string[] = [];

  for (const token of tokens) {
    const colonIdx = token.indexOf(":");
    const key = colonIdx === -1 ? token : token.slice(0, colonIdx);
    const value = colonIdx === -1 ? undefined : token.slice(colonIdx + 1);

    if (key === "left" || key === "right") {
      result.position = key;
      result.splitPercent = value || "50%";
    } else if (key === "contain" || key === "cover") {
      result.size = key;
    } else if (key === "blur" || key === "brightness" || key === "saturate") {
      if (value) filterParts.push(`${key}(${value})`);
    }
  }

  if (filterParts.length > 0) result.filters = filterParts.join(" ");
  return result;
}
