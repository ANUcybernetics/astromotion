/**
 * The export-mode guard `DeckHead` inlines in every deck's `<head>` (see the
 * comment there for why it exists and why it must be inline).
 *
 * It lives here as a string so the component can emit it and hash exactly the
 * same bytes: under a site's `security.csp`, Astro hashes the scripts it
 * bundles but not an `is:inline` one, which the browser would then block.
 */
export const EXPORT_SHIM =
  'if (new URLSearchParams(location.search).has("astromotion-export")) {' +
  ' document.documentElement.dataset.astromotionExport = "";' +
  " window.setInterval = () => 0; }";

/** CSP source expression (`'sha256-…'` without the quotes) for an inline script body. */
export async function scriptHash(body: string): Promise<`sha256-${string}`> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return `sha256-${btoa(String.fromCodePoint(...new Uint8Array(digest)))}`;
}
