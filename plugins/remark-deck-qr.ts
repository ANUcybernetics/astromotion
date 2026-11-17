import type { Paragraph, Root, RootContent } from "mdast";
import { generateQrCode } from "../src/svg/qr-code.ts";
import { flowChildren, isSection } from "./section-directive.ts";

function isQrImageParagraph(node: RootContent): node is Paragraph {
  if (node.type !== "paragraph") return false;
  if (node.children.length !== 1) return false;
  const child = node.children[0];
  return child.type === "image" && child.alt === "qr";
}

export function remarkDeckQr() {
  return (tree: Root, file: { path?: string }) => {
    if (!file.path?.endsWith(".deck.mdx")) return;
    for (const sec of tree.children) {
      if (!isSection(sec)) continue;
      sec.children = flowChildren(
        sec.children.map((child): RootContent => {
          if (!isQrImageParagraph(child)) return child;
          const image = child.children[0];
          if (image.type !== "image") return child;
          return { type: "html", value: generateQrCode(image.url) };
        }),
      );
    }
  };
}
