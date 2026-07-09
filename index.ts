import type { AstroIntegration, ShikiConfig } from "astro";
import mdx from "@astrojs/mdx";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectDeckAssets } from "./src/asset-collector.ts";
import { viteDeckWatchIncludes } from "./src/vite-plugin-watch-includes.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface AstromotionOptions {
  theme?: string;
  injectRoutes?: boolean;
  /**
   * Shiki config for deck code blocks. Accepts the full `ShikiConfig`
   * shape — either a single `theme`, or dual `themes` with optional
   * `defaultColor`. Defaults to `{ theme: "vitesse-dark" }`.
   */
  shikiConfig?: ShikiConfig;
  /**
   * `cssVariable` names registered via Astro's top-level `fonts` config.
   * For each variable, astromotion injects `<Font cssVariable={v} preload />`
   * into the deck `<head>` so deck pages get self-hosted fonts with
   * automatic preloading. The fonts themselves must be declared in
   * `astro.config`'s `fonts` array.
   */
  fontVariables?: string[];
  /**
   * Favicon for deck pages, as a path served by the site (e.g.
   * `/favicon.svg`, from `public/`). Resolved against the site's `base`.
   * When omitted, no `<link rel="icon">` is emitted — a dangling icon link
   * is worse than none.
   */
  favicon?: string;
  /**
   * Default social-card image for deck pages, as a site-served path or an
   * absolute URL. A deck's `image:` frontmatter overrides it. When neither
   * is set, the `og:image` / `twitter:image` tags are omitted entirely.
   */
  ogImage?: string;
}

export function astromotion(options: AstromotionOptions = {}): AstroIntegration {
  const { injectRoutes = true } = options;
  const themePath = options.theme
    ? resolve(options.theme)
    : resolve(__dirname, "theme/default.css");
  const fontVariables = options.fontVariables ?? [];

  let projectRoot = "";

  return {
    name: "astromotion",
    hooks: {
      "astro:config:setup"({ updateConfig, injectRoute, config }) {
        projectRoot = fileURLToPath(config.root);

        const hasMdx = config.integrations.some((i) => i.name === "@astrojs/mdx");
        if (!hasMdx) {
          const shikiConfig: ShikiConfig = options.shikiConfig ?? { theme: "vitesse-dark" };
          updateConfig({
            integrations: [mdx({ shikiConfig })],
          });
        }

        const fontsModuleId = "virtual:astromotion/fonts";
        const resolvedFontsModuleId = "\0" + fontsModuleId;

        const headModuleId = "virtual:astromotion/head";
        const resolvedHeadModuleId = "\0" + headModuleId;

        updateConfig({
          vite: {
            resolve: {
              alias: {
                "virtual:astromotion/theme": themePath,
              },
            },
            plugins: [
              viteDeckWatchIncludes(),
              {
                name: "astromotion:virtual-fonts",
                resolveId(id: string) {
                  if (id === fontsModuleId) return resolvedFontsModuleId;
                  return null;
                },
                load(id: string) {
                  if (id === resolvedFontsModuleId) {
                    return `export const fontVariables = ${JSON.stringify(fontVariables)};\n`;
                  }
                  return null;
                },
              },
              {
                name: "astromotion:virtual-head",
                resolveId(id: string) {
                  if (id === headModuleId) return resolvedHeadModuleId;
                  return null;
                },
                load(id: string) {
                  if (id === resolvedHeadModuleId) {
                    return (
                      `export const favicon = ${JSON.stringify(options.favicon ?? null)};\n` +
                      `export const ogImage = ${JSON.stringify(options.ogImage ?? null)};\n`
                    );
                  }
                  return null;
                },
              },
            ],
          },
        });

        if (injectRoutes) {
          injectRoute({
            pattern: "/decks/[...slug]",
            entrypoint: "astromotion/pages/[...slug].astro",
          });
        }
      },
      "astro:build:done"({ dir, logger }) {
        const decksDir = resolve(projectRoot, "src/decks");
        try {
          const assets = collectDeckAssets(decksDir);
          for (const asset of assets) {
            const relPath = relative(projectRoot, asset);
            const dest = resolve(fileURLToPath(dir), relPath);
            mkdirSync(dirname(dest), { recursive: true });
            copyFileSync(asset, dest);
          }
          if (assets.length > 0) {
            logger.info(`Copied ${assets.length} deck asset(s) to build output.`);
          }
        } catch {
          // No src/decks directory — nothing to copy
        }
      },
    },
  };
}

export { deckRemarkPlugins } from "./plugins/index.ts";
export { parseDeckFrontmatter } from "./src/meta.ts";
