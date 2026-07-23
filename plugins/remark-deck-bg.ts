import type { Image, Paragraph, Root, RootContent } from "mdast";
import { dirname, resolve } from "node:path";
import { buildState } from "../src/build-config.ts";
import { withBase } from "../src/head-urls.ts";
import { parseBgModifiers } from "../src/parse-helpers.ts";

interface BgImage {
  url: string;
  position?: "left" | "right";
  size?: string;
  splitPercent?: string;
  filters?: string;
}

// The rewritten URL is root-absolute, so it needs the site's base prefix on a
// subpath deploy — nothing downstream rewrites URLs inside inline styles, so
// an unprefixed `/src/...` would point above the base and 404 (the same
// failure head-urls.ts exists to prevent in the deck <head>).
function resolveAssetUrl(url: string, deckPath: string | undefined): string {
  if (!deckPath) return url;
  if (!url.startsWith("./") && !url.startsWith("../")) return url;
  const absPath = resolve(dirname(deckPath), url);
  const srcIdx = absPath.indexOf("/src/");
  if (srcIdx === -1) return url;
  return withBase(absPath.slice(srcIdx), buildState.base);
}

interface MdxJsxAttribute {
  type: "mdxJsxAttribute";
  name: string;
  value: string | null;
}

interface MdxJsxFlowElement {
  type: "mdxJsxFlowElement";
  name: string;
  attributes: MdxJsxAttribute[];
  children: RootContent[];
}

// Recover an inline bg image's alt straight from the deck source.
//
// When a consuming pipeline parses deck content with remark-directive enabled
// (e.g. for `::: callout` containers), a `:token` inside an inline image's alt
// is parsed as a text directive and dropped --- `![bg right:40%]` reaches this
// plugin as `bg right%`, silently losing the split (and any blur:/brightness:
// filters). The raw source (`file.value`) is never rewritten by tree
// transforms, so re-read the alt from the image node's source offset.
//
// remarkDeckIncludes strips positions from @include-spliced nodes (their offsets
// pointed into a different file), so a missing offset means "use the parsed alt
// as-is" --- already correct, since partials are parsed without remark-directive.
function rawImageAlt(img: Image, file: { value?: unknown }): string {
  const alt = img.alt ?? "";
  const offset = img.position?.start?.offset;
  const src = typeof file.value === "string" ? file.value : null;
  if (offset === undefined || src === null || !src.startsWith("![", offset)) return alt;
  const altEnd = src.indexOf("](", offset + 2);
  return altEnd === -1 ? alt : src.slice(offset + 2, altEnd);
}

function asBgImageParagraph(node: RootContent, file: { value?: unknown }): BgImage | null {
  if (node.type !== "paragraph") return null;
  const para = node as Paragraph;
  if (para.children.length !== 1) return null;
  const child = para.children[0];
  if (child.type !== "image") return null;
  const img = child as Image;
  const alt = rawImageAlt(img, file);
  if (!alt.startsWith("bg")) return null;
  return { url: img.url, ...parseBgModifiers(alt.slice(2)) };
}

function attr(name: string, value: string): MdxJsxAttribute {
  return { type: "mdxJsxAttribute", name, value };
}

function div(className: string, style: string | null, children: RootContent[]): MdxJsxFlowElement {
  const attrs: MdxJsxAttribute[] = [attr("class", className)];
  if (style) attrs.push(attr("style", style));
  return { type: "mdxJsxFlowElement", name: "div", attributes: attrs, children };
}

function slideBgStyle(img: BgImage): string {
  const size = img.size || "cover";
  const parts = [
    `background-image: url('${img.url}')`,
    `background-size: ${size}`,
    "background-position: center",
  ];
  if (img.filters) parts.push(`filter: ${img.filters}`);
  return parts.join("; ");
}

function splitImageStyle(img: BgImage): string {
  const percent = img.splitPercent || "50%";
  const parts = [`background-image: url('${img.url}')`, `width: ${percent}`];
  if (img.filters) parts.push(`filter: ${img.filters}`);
  return parts.join("; ");
}

export function remarkDeckBg() {
  return (tree: Root, file: { path?: string; value?: unknown }) => {
    if (!file.path?.endsWith(".deck.mdx")) return;
    for (const section of tree.children) {
      if ((section as any).type !== "mdxJsxFlowElement" || (section as any).name !== "section")
        continue;
      const sec = section as any;
      const bgImages: BgImage[] = [];
      const remaining: RootContent[] = [];
      for (const child of sec.children as RootContent[]) {
        const img = asBgImageParagraph(child, file);
        if (img) {
          img.url = resolveAssetUrl(img.url, file.path);
          bgImages.push(img);
        } else {
          remaining.push(child);
        }
      }
      const fullBleed = bgImages.find((i) => !i.position);
      const splitImg = bgImages.find((i) => i.position);

      const newChildren: RootContent[] = [];
      if (fullBleed) {
        newChildren.push(div("slide-bg", slideBgStyle(fullBleed), []) as unknown as RootContent);
      }
      if (splitImg) {
        const percent = splitImg.splitPercent || "50%";
        const contentStyle = `width: calc(100% - ${percent})`;
        const content = div("split-content", contentStyle, remaining);
        const image = div("split-image", splitImageStyle(splitImg), []);
        const layoutChildren: RootContent[] =
          splitImg.position === "left"
            ? [image as unknown as RootContent, content as unknown as RootContent]
            : [content as unknown as RootContent, image as unknown as RootContent];
        newChildren.push(div("split-layout", null, layoutChildren) as unknown as RootContent);
      } else {
        newChildren.push(...remaining);
      }
      sec.children = newChildren;
    }
  };
}
