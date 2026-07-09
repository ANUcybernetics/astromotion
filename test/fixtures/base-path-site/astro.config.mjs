import { defineConfig } from "astro/config";
import { astromotion } from "../../../index.ts";

// Fixture for the base-path build test. The favicon/ogImage options are driven
// by env vars so one fixture covers both the configured and the omitted case.
export default defineConfig({
  site: "https://example.test",
  base: "/test-base",
  integrations: [
    astromotion({
      favicon: process.env.FIXTURE_FAVICON || undefined,
      ogImage: process.env.FIXTURE_OG_IMAGE || undefined,
    }),
  ],
});
