/**
 * Types for `deck-text.mjs`, which is plain JavaScript by necessity (see
 * CLAUDE.md) and so carries none of its own.
 *
 * A declaration file rather than `allowJs` in this package's tsconfig,
 * because `src/deck-entries.ts` imports it and ships as TypeScript: every
 * consumer type-checks that file under *its* tsconfig, and one without
 * `allowJs` would fail on the untyped import.
 */

export interface DeckToMarkdownOptions {
  /** Keep fenced `notes` blocks (default: true). */
  notes?: boolean;
  /** Keep authoring comments (default: true). */
  comments?: boolean;
  /** Mark where visuals were, e.g. `(image: …)` (default: true). */
  placeholders?: boolean;
  /** Lead with the frontmatter title as an `h1` (default: true). */
  title?: boolean;
}

/** Render a deck's text content as markdown, slides separated by `---`. */
export function deckToMarkdown(deckPath: string, options?: DeckToMarkdownOptions): string;

/** The body of a `{/* … *\/}` expression, or null if it isn't one. */
export function parseMdxFlowExpression(value: string): string | null;

export function parseClassDirectiveMdx(value: string): string | null;
export function parseIfDirectiveMdx(value: string): string | null;
export function parseIdDirectiveMdx(value: string): string | null;
export function parseIncludeDirectiveMdx(value: string): string | null;
export function parseAnimateDirectiveMdx(value: string): { id: string | null } | null;

export function isNotesFence(lang: string | null | undefined): boolean;
export function isCommentFence(lang: string | null | undefined): boolean;
export function isLegacyNotesDirective(value: string): boolean;
export function isMultilineMdxComment(value: string): boolean;

export function resolveIncludePath(includePath: string, fromFile: string): string;
