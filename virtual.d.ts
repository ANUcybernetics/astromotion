declare module "virtual:astromotion/fonts" {
  export const fontVariables: string[];
}

declare module "virtual:astromotion/head" {
  export const favicon: string | null;
  export const ogImage: string | null;
  export const cspEnabled: boolean;
  /** The reveal.js speaker view's inline script; empty unless `cspEnabled`. */
  export const speakerViewScript: string;
  /** The consumer's `head` option component, or null when unset. */
  export const HeadExtra: ((props: Record<string, never>) => unknown) | null;
}
