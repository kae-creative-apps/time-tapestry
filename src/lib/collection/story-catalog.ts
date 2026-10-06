import type { CollectionView } from "./types";
import type { LivingStory } from "./living-story-types";

export type StoryCatalogEntry = {
  id: string;
  title: string;
  question?: string;
  category: string;
  content: string;
  videoMediaId?: string;
  publishedAt?: string;
  original: boolean;
};
export function storyCatalog(
  c: CollectionView,
  living: LivingStory,
): StoryCatalogEntry[] {
  const original = c.chapters.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    category: "original",
    content: chapter.content,
    videoMediaId:
      chapter.film?.narrationKind === "original_recording"
        ? chapter.videoMediaId
        : undefined,
    original: true,
  }));
  const additions = living.moments
    .filter(
      (m) => m.status === "published" && m.videoMediaId && m.content?.trim(),
    )
    .sort(
      (a, b) =>
        (a.publishedAt || a.createdAt).localeCompare(
          b.publishedAt || b.createdAt,
        ) || a.id.localeCompare(b.id),
    )
    .map((m) => ({
      id: m.id,
      title: m.title,
      question: m.question,
      category: m.category,
      content: m.content!,
      videoMediaId: m.videoMediaId,
      publishedAt: m.publishedAt,
      original: false,
    }));
  return [...original, ...additions];
}
export function matchesStorySearch(
  item: { title: string; question?: string; content?: string },
  query: string,
): boolean {
  const normalize = (value: string) =>
    value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase();
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  const text = normalize(
    [item.title, item.question, item.content].filter(Boolean).join(" "),
  );
  return words.every((word) => text.includes(word));
}
