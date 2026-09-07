import { describe, expect, it } from "vitest";
import { astromotion, type AstromotionOptions } from "../index.ts";

// Drives the integration's hooks directly and reads back the virtual fonts
// module the deck head imports, so the default can be checked without a
// build --- and without a font provider that would need the network.
function virtualFontsModule(options: AstromotionOptions, fonts: { cssVariable: string }[]) {
  const integration = astromotion(options);
  const plugins: { name: string; load?: (id: string) => string | null }[] = [];
  const hooks = integration.hooks as Record<string, (args: unknown) => unknown>;
  hooks["astro:config:setup"]({
    config: {
      root: new URL("file:///fixture/"),
      base: "/",
      integrations: [{ name: "@astrojs/mdx" }],
    },
    updateConfig: (patch: { vite?: { plugins?: typeof plugins } }) => {
      plugins.push(...(patch.vite?.plugins ?? []));
    },
    injectRoute: () => {},
  });
  hooks["astro:config:done"]({ config: { fonts } });
  const plugin = plugins.find((p) => p.name === "astromotion:virtual-fonts");
  return plugin?.load?.("\0virtual:astromotion/fonts") ?? "";
}

const fonts = [{ cssVariable: "--font-body" }, { cssVariable: "--font-mono" }];

describe("fontVariables", () => {
  it("defaults to every font in the final config", () => {
    expect(virtualFontsModule({}, fonts)).toBe(
      'export const fontVariables = ["--font-body","--font-mono"];\n',
    );
  });

  it("is empty when the site registers no fonts", () => {
    expect(virtualFontsModule({}, [])).toBe("export const fontVariables = [];\n");
  });

  it("keeps an explicit list as given, even when it omits a registered font", () => {
    expect(virtualFontsModule({ fontVariables: ["--font-mono"] }, fonts)).toBe(
      'export const fontVariables = ["--font-mono"];\n',
    );
  });
});
