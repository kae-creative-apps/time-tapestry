// Only whole, recognized performance cues are removed. Ordinary bracketed
// memories and the raw saved conversation remain untouched.
const performanceCues = new Set([
  "smile",
  "smiles",
  "smiling",
  "smiles warmly",
  "smiling warmly",
  "with a smile",
  "happy",
  "happily",
  "gentle",
  "gently",
  "warm",
  "warmly",
  "in a warm tone",
  "softly",
  "sigh",
  "sighs",
  "sighing",
  "laughs",
  "laughing",
  "laughs softly",
  "chuckles",
  "chuckling",
  "thoughtful",
  "thoughtfully",
  "excited",
  "pause",
  "pauses",
  "long pause",
  "clears throat",
  "inhales",
  "exhales",
  "whispers",
]);

export function stripConversationPerformanceCues(text: string) {
  let removedCue = false;
  const cleaned = text.replace(
    /\[([^\[\]\n]{1,80})\]|\(([^()\n]{1,80})\)|(?<!\*)\*([^*\n]{1,80})\*(?!\*)/g,
    (
      tag,
      square: string | undefined,
      round: string | undefined,
      stars: string | undefined,
    ) => {
      const cue = (square ?? round ?? stars ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
      if (!performanceCues.has(cue)) return tag;
      removedCue = true;
      return "";
    },
  );
  if (!removedCue) return text;
  return cleaned
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.!?;:])/g, "$1")
    .replace(/^[ \t]+|[ \t]+$/gm, "")
    .trim();
}
