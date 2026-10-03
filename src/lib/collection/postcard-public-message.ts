import type { Collection } from "./types";

export const PUBLIC_POSTCARD_MESSAGE_LIMIT = 240;
export const PUBLIC_POSTCARD_DEFAULTS: Record<string, string> = {
  q1: "May you always find kindness, and keep making room to offer it.",
  q2: "May you find hope for the next step, and courage to take it.",
  q3: "The good you sow can keep growing in the lives of others.",
  q4: "May the stories behind you give you courage for the story ahead.",
};

/** Never derives public print copy from an interview, chapter or private blessing. */
export function publicPostcardMessage(
  c: Pick<Collection, "postcardPublicMessages">,
  chapterId: string,
) {
  const message = c.postcardPublicMessages?.[chapterId]?.trim();
  if (message && message.length <= PUBLIC_POSTCARD_MESSAGE_LIMIT)
    return message;
  return PUBLIC_POSTCARD_DEFAULTS[chapterId] || PUBLIC_POSTCARD_DEFAULTS.q4;
}

export function normalizePublicPostcardMessages(
  input: unknown,
  chapterIds: string[],
): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Write a short public message for each postcard.");
  const values = input as Record<string, unknown>;
  if (Object.keys(values).some((id) => !chapterIds.includes(id)))
    throw new Error("Choose one of your four postcards.");
  return Object.fromEntries(
    chapterIds.map((id) => {
      const value = values[id];
      if (
        typeof value !== "string" ||
        !value.trim() ||
        value.trim().length > PUBLIC_POSTCARD_MESSAGE_LIMIT
      )
        throw new Error(
          `Each public postcard message needs 1 to ${PUBLIC_POSTCARD_MESSAGE_LIMIT} characters.`,
        );
      return [id, value.trim()];
    }),
  );
}
