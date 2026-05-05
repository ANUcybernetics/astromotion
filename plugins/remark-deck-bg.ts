import type { Root, RootContent, Paragraph, Image, Html } from "mdast";
import { unified } from "unified";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { parseBgModifiers } from "../src/parse-helpers.ts";

interface BgImage {
  url: string;
  position?: "left" | "right";
  size?: string;
  splitPercent?: string;
  filters?: string;
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

function buildSlideBg(img: BgImage): string {
  const size = img.size || "cover";
  const styleParts = [
    `background-image: url('${img.url}')`,
    `background-size: ${size}`,
    "background-position: center",
  ];
  if (img.filters) styleParts.push(`filter: ${img.filters}`);
  return `<div class="slide-bg" style="${styleParts.join("; ")}"></div>`;
}

function buildSplitImage(img: BgImage): string {
  const percent = img.splitPercent || "50%";
  const filterPart = img.filters ? `; filter: ${img.filters}` : "";
  return `<div class="split-image" style="background-image: url('${img.url}'); width: ${percent}${filterPart}"></div>`;
}

async function nodesToHtml(nodes: RootContent[]): Promise<string> {
  const root: Root = { type: "root", children: nodes };
  const result = await unified().use(remarkRehype).use(rehypeStringify).run(root);
  const file = await unified()
    .use(remarkRehype)
    .use(rehypeStringify)
    .stringify(result as any);
  return String(file);
}

export function remarkDeckBg() {
  return async (tree: Root, file: { path?: string }) => {
    if (!file.path?.endsWith(".deck.mdx")) return;
    for (const section of tree.children) {
      if ((section as any).type !== "mdxJsxFlowElement" || (section as any).name !== "section")
        continue;
      const sec = section as any;
      const bgImages: BgImage[] = [];
      const remaining: RootContent[] = [];
      for (const child of sec.children as RootContent[]) {
        const img = asBgImageParagraph(child);
        if (img) bgImages.push(img);
        else remaining.push(child);
      }
      const fullBleed = bgImages.find((i) => !i.position);
      const splitImg = bgImages.find((i) => i.position);
      if (splitImg) {
        const percent = splitImg.splitPercent || "50%";
        const contentPercent = `calc(100% - ${percent})`;
        const imgDiv = buildSplitImage(splitImg);
        const innerHtml = await nodesToHtml(remaining);
        let splitHtml: string;
        if (splitImg.position === "left") {
          splitHtml = `<div class="split-layout">${imgDiv}<div class="split-content" style="width: ${contentPercent}">${innerHtml}</div></div>`;
        } else {
          splitHtml = `<div class="split-layout"><div class="split-content" style="width: ${contentPercent}">${innerHtml}</div>${imgDiv}</div>`;
        }
        const newChildren: RootContent[] = [];
        if (fullBleed) newChildren.push({ type: "html", value: buildSlideBg(fullBleed) } as Html);
        newChildren.push({ type: "html", value: splitHtml } as Html);
        sec.children = newChildren;
      } else {
        const newChildren: RootContent[] = [];
        if (fullBleed) newChildren.push({ type: "html", value: buildSlideBg(fullBleed) } as Html);
        newChildren.push(...remaining);
        sec.children = newChildren;
      }
    }
  };
}
