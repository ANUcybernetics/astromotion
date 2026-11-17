import type { AstroConfig, AstroIntegration, HookParameters } from "astro";

type SetupArgs = HookParameters<"astro:config:setup">;
type DoneArgs = HookParameters<"astro:config:done">;
type Logger = SetupArgs["logger"];

const silentLogger = (label: string): Logger => ({
  options: { destination: { write: () => {} }, level: "silent" },
  label,
  fork: silentLogger,
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  flush: () => {},
  close: () => {},
});

/**
 * The slice of `AstroConfig` the integration's hooks read. A real config has
 * hundreds of required fields, none of which a hook under test touches, so this
 * is the one place a partial config stands in for the full type.
 */
export function stubConfig(fields: object): AstroConfig {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- AstroConfig is hundreds of required fields; hooks under test read only root/base/integrations/fonts
  return fields as AstroConfig;
}

export interface ConfigSetupFixture {
  root: URL;
  base?: string;
  integrations?: { name: string }[];
  updateConfig?: SetupArgs["updateConfig"];
  injectRoute?: SetupArgs["injectRoute"];
}

function requireHook<K extends "astro:config:setup" | "astro:config:done">(
  integration: AstroIntegration,
  name: K,
): NonNullable<AstroIntegration["hooks"][K]> {
  const hook = integration.hooks[name];
  if (!hook) throw new Error(`integration ${integration.name} has no ${name} hook`);
  return hook;
}

/** Run an integration's `astro:config:setup` hook with stubs for everything it doesn't read. */
export async function runConfigSetup(
  integration: AstroIntegration,
  fixture: ConfigSetupFixture,
): Promise<void> {
  const args: SetupArgs = {
    config: stubConfig({
      root: fixture.root,
      base: fixture.base ?? "/",
      integrations: fixture.integrations ?? [],
    }),
    command: "build",
    isRestart: false,
    updateConfig: fixture.updateConfig ?? ((newConfig) => stubConfig(newConfig)),
    addRenderer: () => {},
    addWatchFile: () => {},
    injectScript: () => {},
    injectRoute: fixture.injectRoute ?? (() => {}),
    addClientDirective: () => {},
    addDevToolbarApp: () => {},
    addMiddleware: () => {},
    createCodegenDir: () => new URL("file:///codegen/"),
    logger: silentLogger("test"),
  };
  await requireHook(integration, "astro:config:setup")(args);
}

/** Run an integration's `astro:config:done` hook with the given (partial) final config. */
export async function runConfigDone(integration: AstroIntegration, config: object): Promise<void> {
  const args: DoneArgs = {
    config: stubConfig(config),
    setAdapter: () => {},
    injectTypes: () => new URL("file:///types/"),
    logger: silentLogger("test"),
    buildOutput: "static",
  };
  await requireHook(integration, "astro:config:done")(args);
}
