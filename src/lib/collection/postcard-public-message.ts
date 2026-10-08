import type { Collection } from "./types";

export const PUBLIC_POSTCARD_MESSAGE_LIMIT = 240;
export const PUBLIC_POSTCARD_DEFAULTS: Record<string, string> = {
  q1: "May you remember who first showed you a generous life.",
  q2: "May you know why a generous life was worth living.",
  q3: "May you see the lives that flourished, and the joy of giving.",
  q4: "May you carry this generosity into your own life.",
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
