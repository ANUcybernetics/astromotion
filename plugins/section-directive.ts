import type { Root, RootContent } from "mdast";

/**
 * The shared shape of the single-directive slide plugins (`_class`, `_if`,
 * `_id`, `_animate`, `notes:`): walk each `<section>`, pull out any
 * mdxFlowExpression comment the parser recognises (last one wins, matching
 * the historical per-plugin behaviour), and once the section's children are
 * filtered, apply the parsed value to the section.
 */
export function sectionDirective<T>(
  parse: (value: string) => T | null,
  apply: (section: any, parsed: T) => void,
) {
  return (tree: Root, file: { path?: string }) => {
    if (!file.path?.endsWith(".deck.mdx")) return;
    for (const section of tree.children) {
      if ((section as any).type !== "mdxJsxFlowElement" || (section as any).name !== "section")
        continue;
      const sec = section as any;
      const newChildren: RootContent[] = [];
      let parsed: T | null = null;
      for (const child of sec.children as RootContent[]) {
        if ((child as any).type === "mdxFlowExpression") {
          const p = parse((child as any).value);
          if (p !== null) {
            parsed = p;
            continue;
          }
        }
        newChildren.push(child);
      }
      sec.children = newChildren;
      if (parsed !== null) apply(sec, parsed);
    }
  };
}

export function attr(name: string, value: string | null) {
  return { type: "mdxJsxAttribute", name, value };
}
