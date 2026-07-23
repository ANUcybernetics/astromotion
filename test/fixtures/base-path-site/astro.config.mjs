import mdx from "@astrojs/mdx";
import { defineConfig, passthroughImageService } from "astro/config";
import { astromotion } from "../../../index.ts";
import { deckRemarkPlugins } from "../../../plugins/index.ts";

// Fixture for the base-path build test. The favicon/ogImage options are driven
// by env vars so one fixture covers both the configured and the omitted case.
// mdx is registered the way a real consumer does it — with deckRemarkPlugins —
// so the build exercises the plugins' URL rewriting (notably remarkDeckBg's
// base-prefixed background-image), not just the deck <head>.
export default defineConfig({
  site: "https://example.test",
  base: "/test-base",
  // The fixture deliberately ships no sharp; deck bg images bypass Astro's
  // image pipeline anyway (they live in inline styles, copied verbatim).
  image: { service: passthroughImageService() },
  // Registered on the shared markdown chain (which plain mdx() inherits), the
  // way the real consumers do it.
  markdown: { remarkPlugins: deckRemarkPlugins },
  integrations: [
    mdx(),
    astromotion({
      favicon: process.env.FIXTURE_FAVICON || undefined,
      ogImage: process.env.FIXTURE_OG_IMAGE || undefined,
    }),
  ],
});
