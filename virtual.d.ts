declare module "virtual:astromotion/fonts" {
  export const fontVariables: string[];
}

declare module "virtual:astromotion/head" {
  export const favicon: string | null;
  export const ogImage: string | null;
  export const cspEnabled: boolean;
  /** The reveal.js speaker view's inline script; empty unless `cspEnabled`. */
  export const speakerViewScript: string;
}
