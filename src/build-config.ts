/**
 * Build-time state shared between the integration and the remark plugins.
 *
 * The remark plugins are registered by the consumer as bare functions (the
 * `deckRemarkPlugins` array passed to `@astrojs/mdx`), so they can't receive
 * the site's `base` as a plugin option without breaking that API. Both the
 * integration and the plugins resolve from the same package instance in the
 * one Node process, so the integration records the base here during
 * `astro:config:setup` — before any MDX transform runs — and plugins that
 * emit root-absolute URLs read it back.
 */
export const buildState = {
  /** Astro's `config.base`; "/" when the site deploys at the server root. */
  base: "/",
};
