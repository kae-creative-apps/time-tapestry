import { SiriOrb } from "@/components/ui/siri-orb";

/** Stable motion across turn changes; the nearby label communicates live state. */
export function InterviewPresence({
  state,
  compact = false,
}: {
  state: "connecting" | "speaking" | "listening" | "paused" | "unavailable";
  compact?: boolean;
}) {
  return (
    <SiriOrb
      size={compact ? 64 : 144}
      className={[
        compact ? "shrink-0" : "!h-28 !w-28 shrink-0 sm:!h-36 sm:!w-36",
        (state === "paused" || state === "unavailable") &&
          "before:![animation-play-state:paused]",
      ]
        .filter(Boolean)
        .join(" ")}
      animationDuration={10}
    />
  );
}
