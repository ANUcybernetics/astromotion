import type { Root, RootContent, Paragraph, Image } from "mdast";
import { dirname, resolve } from "node:path";
import { parseBgModifiers } from "../src/parse-helpers.ts";

interface BgImage {
  url: string;
  position?: "left" | "right";
  size?: string;
  splitPercent?: string;
  filters?: string;
}

function resolveAssetUrl(url: string, deckPath: string | undefined): string {
  if (!deckPath) return url;
  if (!url.startsWith("./") && !url.startsWith("../")) return url;
  const absPath = resolve(dirname(deckPath), url);
  const srcIdx = absPath.indexOf("/src/");
  if (srcIdx === -1) return url;
  return absPath.slice(srcIdx);
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

function asBgImageParagraph(node: RootContent): BgImage | null {
  if (node.type !== "paragraph") return null;
  const para = node as Paragraph;
  if (para.children.length !== 1) return null;
  const child = para.children[0];
  if (child.type !== "image") return null;
  const img = child as Image;
  if (!img.alt?.startsWith("bg")) return null;
  const modifiers = img.alt.slice(2);
  return { url: img.url, ...parseBgModifiers(modifiers) };
}

function attr(name: string, value: string): MdxJsxAttribute {
  return { type: "mdxJsxAttribute", name, value };
}

function div(
  className: string,
  style: string | null,
  children: RootContent[],
): MdxJsxFlowElement {
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
  return (tree: Root, file: { path?: string }) => {
    if (!file.path?.endsWith(".deck.mdx")) return;
    for (const section of tree.children) {
      if ((section as any).type !== "mdxJsxFlowElement" || (section as any).name !== "section")
        continue;
      const sec = section as any;
      const bgImages: BgImage[] = [];
      const remaining: RootContent[] = [];
      for (const child of sec.children as RootContent[]) {
        const img = asBgImageParagraph(child);
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
