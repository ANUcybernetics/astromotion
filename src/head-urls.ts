/**
 * URL helpers for the deck `<head>`.
 *
 * Deck pages are injected routes, so the consumer never renders `<head>`
 * itself. Anything astromotion emits there has to be resolved against the
 * site's `base` — a root-absolute path like `/favicon.svg` points at the
 * server root, which is the wrong place on any site deployed under a
 * subpath.
 */

/** True for URLs that already address a host or carry their own scheme. */
function isAbsolute(path: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("//");
}

/**
 * Prefix a root-absolute path with the site's base.
 *
 * `baseUrl` is Astro's `import.meta.env.BASE_URL`: "/" at the root, or
 * "/courses/comp4020/" under a base path (Astro guarantees the trailing
 * slash). Absolute URLs and relative paths are returned untouched.
 */
export function withBase(path: string, baseUrl: string): string {
  if (!path.startsWith("/") || isAbsolute(path)) return path;
  const prefix = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${prefix}${path}`;
}

/**
 * Resolve a path to an absolute URL for `og:`/`twitter:` metadata, which
 * social scrapers only accept fully qualified. `site` is `Astro.site`, which
 * is undefined when the consumer hasn't configured one; we fall back to the
 * page's own URL so the value is still well-formed.
 */
export function absoluteUrl(
  path: string,
  site: URL | undefined,
  pageUrl: URL,
  baseUrl: string,
): string {
  if (isAbsolute(path)) return path;
  return new URL(withBase(path, baseUrl), site ?? pageUrl).href;
}
