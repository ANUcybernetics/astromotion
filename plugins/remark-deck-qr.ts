import type { Html, Image, Paragraph, Root, RootContent } from "mdast";
import { generateQrCode } from "../src/svg/qr-code.ts";

function isQrImageParagraph(node: RootContent): node is Paragraph {
  if (node.type !== "paragraph") return false;
  if ((node as Paragraph).children.length !== 1) return false;
  const child = (node as Paragraph).children[0];
  return child.type === "image" && (child as Image).alt === "qr";
}

export function remarkDeckQr() {
  return (tree: Root, file: { path?: string }) => {
    if (!file.path?.endsWith(".deck.mdx")) return;
    for (const section of tree.children) {
      if ((section as any).type !== "mdxJsxFlowElement" || (section as any).name !== "section")
        continue;
      const sec = section as any;
      sec.children = (sec.children as RootContent[]).map((child) => {
        if (!isQrImageParagraph(child)) return child;
        const url = ((child as Paragraph).children[0] as Image).url;
        return { type: "html", value: generateQrCode(url) } as Html;
      });
    }
  };
}
