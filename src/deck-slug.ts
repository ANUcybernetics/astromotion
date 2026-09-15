/**
 * Where decks live, and how a deck file's path becomes its route slug.
 *
 * Both the injected deck route and `deckTextEntries` need this mapping, and a
 * disagreement between them would mean an llms.txt URL that 404s. Keep it
 * here, dependency-free, so the deck page can import it without pulling in
 * the markdown exporter.
 */

/** Deck source directory, relative to the project root. */
export const DECKS_DIR = "src/decks";

const DECK_SUFFIX = ".deck.mdx";
const SLIDES_SUFFIX = "/slides";

/**
 * A deck's route slug: its path under `src/decks` without the `.deck.mdx`
 * suffix, with a trailing `/slides` segment dropped so that
 * `week-3/slides.deck.mdx` (a deck kept in a directory beside its assets)
 * mounts at `week-3` rather than `week-3/slides`.
 *
 * Accepts either an absolute filesystem path or a project-relative glob key
 * (`/src/decks/week-3.deck.mdx`). Returns null for anything that isn't a deck
 * under `src/decks`, which callers treat as a bug rather than a skip.
 */
export function deckSlugFromPath(path: string): string | null {
  const normalised = path.replaceAll("\\", "/");
  if (!normalised.endsWith(DECK_SUFFIX)) return null;

  const marker = `/${DECKS_DIR}/`;
  const at = normalised.lastIndexOf(marker);
  if (at === -1) return null;

  const name = normalised.slice(at + marker.length, -DECK_SUFFIX.length);
  if (!name) return null;

  return name.endsWith(SLIDES_SUFFIX) ? name.slice(0, -SLIDES_SUFFIX.length) : name;
}
