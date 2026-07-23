import { parse } from "yaml";
import { extractFrontmatter } from "./parse-helpers.ts";

interface DeckFrontmatter {
  title?: string;
  description?: string;
  author?: string;
  image?: string;
}

interface DeckMeta {
  data: DeckFrontmatter;
  content: string;
}

export function parseDeckFrontmatter(raw: string, slug?: string): DeckMeta {
  const fm = extractFrontmatter(raw);
  if (!fm) {
    return {
      data: { title: slug },
      content: raw,
    };
  }

  const data = parse(fm.data) as DeckFrontmatter;
  if (!data.title && slug) {
    data.title = slug;
  }

  return { data, content: fm.content };
}
