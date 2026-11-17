import { describe, expect, it } from "vitest";
import { astromotion, type AstromotionOptions } from "../index.ts";
import { runConfigDone, runConfigSetup, stubConfig } from "./astro-hooks.ts";

interface LoadablePlugin {
  name: string;
  load: (id: string) => unknown;
}

function isLoadablePlugin(value: unknown): value is LoadablePlugin {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    "load" in value &&
    typeof value.load === "function"
  );
}

// Drives the integration's hooks directly and reads back the virtual fonts
// module the deck head imports, so the default can be checked without a
// build --- and without a font provider that would need the network.
async function virtualFontsModule(options: AstromotionOptions, fonts: { cssVariable: string }[]) {
  const integration = astromotion(options);
  const plugins: unknown[] = [];
  await runConfigSetup(integration, {
    root: new URL("file:///fixture/"),
    integrations: [{ name: "@astrojs/mdx" }],
    updateConfig: (patch) => {
      plugins.push(...(patch.vite?.plugins ?? []));
      return stubConfig(patch);
    },
  });
  await runConfigDone(integration, { fonts });
  const plugin = plugins
    .filter(isLoadablePlugin)
    .find((p) => p.name === "astromotion:virtual-fonts");
  const loaded = plugin?.load("\0virtual:astromotion/fonts");
  return typeof loaded === "string" ? loaded : "";
}

const fonts = [{ cssVariable: "--font-body" }, { cssVariable: "--font-mono" }];

describe("fontVariables", () => {
  it("defaults to every font in the final config", async () => {
    expect(await virtualFontsModule({}, fonts)).toBe(
      'export const fontVariables = ["--font-body","--font-mono"];\n',
    );
  });

  it("is empty when the site registers no fonts", async () => {
    expect(await virtualFontsModule({}, [])).toBe("export const fontVariables = [];\n");
  });

  it("keeps an explicit list as given, even when it omits a registered font", async () => {
    expect(await virtualFontsModule({ fontVariables: ["--font-mono"] }, fonts)).toBe(
      'export const fontVariables = ["--font-mono"];\n',
    );
  });
});
