import type { Caption } from "@remotion/captions";

export const VIDEO_FPS = 30;
export const MAX_CHAPTER_SECONDS = 3600;
export const VIDEO_INTRO_SECONDS = 3;
export const VIDEO_CLOSER_SECONDS = 4;
/** Interview question card. Music and the card are both gone when this ends. */
export const QUESTION_CARD_SECONDS = 5;
export const QUESTION_CARD_FADE_SECONDS = 0.5;

export type VideoSource = {
  assetId: string;
  sourceAnswerId: string;
  takeId: string;
  acceptedTakeId: string;
  kind: "video" | "audio";
  /** Relative to the worker's private media directory, never a public URL. */
  relativePath: string;
  sha256: string;
  durationMs: number;
  /** Durable original archive reference, distinct from any cleaned derivative. */
  archiveRef: string;
  originalPreserved: true;
  audioDerivative?: {
    relativePath: string;
    sha256: string;
    method: "ffmpeg-cleanup" | "elevenlabs-isolation";
    durationMs: number;
  };
};

export type VideoClip = {
  id: string;
  sourceAnswerId: string;
  sourceAssetId?: string;
  kind: "video" | "audio" | "text";
  inMs: number;
  outMs: number;
  audioFadeInMs?: number;
  audioFadeOutMs?: number;
  /** A sample-shaped copy of this exact frame interval, starting at zero. */
  audioDerivative?: {
    assetId: string;
    relativePath: string;
    sha256: string;
    sampleRate: 48000;
    sampleCount: number;
    startFrame: number;
    endFrame: number;
    fadeInSamples: number;
    fadeOutSamples: number;
  };
  /** Captions use SOURCE time, not chapter time. Text cards use time from zero. */
  captions: Caption[];
  text?: string;
  editorialReason: string;
};

export type ChapterVideoPlan = {
  schemaVersion: 1;
  id: string;
  sessionId: string;
  chapterId: string;
  chapterNumber: 1 | 2 | 3 | 4;
  revision: number;
  title: string;
  /** Living-story question shown in a readable, silent opening card. */
  promptQuestion?: string;
  /**
   * Automatic interview films open on this card for exactly five seconds.
   * The answer, and only the answer, begins when the card ends.
   */
  questionCard?: {
    question: string;
    label: string;
    durationMs: 5000;
    music: { relativePath: string; sha256: string };
  };
  storytellerName: string;
  sources: VideoSource[];
  clips: VideoClip[];
  approval: { approvedBy: string; approvedAt: string } | null;
  /** Optional pre-rendered HyperFrames closer. Must be exactly four seconds. */
  brandCloser?: { relativePath: string; sha256: string; durationMs: 4000 };
};

export const VIDEO_REVIEW_CHECKLIST = [
  "Watch the complete rendered video, including every edit boundary.",
  "Check that edits preserve meaning and do not join unrelated claims.",
  "Check names, dates, faith language and captions against the original.",
  "Listen to original and processed audio for clipping, lost words and artifacts.",
  "Check framing, caption readability, playback and audio sync on a phone.",
  "Confirm the title, chapter number, recipient note and final brand closer.",
  "Confirm the storyteller approves this exact rendered revision before release.",
] as const;

export const CUT_AUDIO_SAMPLE_RATE = 48000;

// Snap arithmetic noise at exact planner frame boundaries before rounding.
const sourceFrame = (ms: number) => {
  const frame = (ms * VIDEO_FPS) / 1000;
  return Math.abs(frame - Math.round(frame)) < 1e-7 ? Math.round(frame) : frame;
};

/** One interval for video, audio and captions. Round outward to retain words. */
export function clipTiming(clip: Pick<VideoClip, "inMs" | "outMs">) {
  const startFrame = Math.floor(sourceFrame(clip.inMs));
  const endFrame = Math.ceil(sourceFrame(clip.outMs));
  return {
    startFrame,
    endFrame,
    durationFrames: endFrame - startFrame,
    inMs: (startFrame * 1000) / VIDEO_FPS,
    outMs: (endFrame * 1000) / VIDEO_FPS,
  };
}

export function clipSourceTimeMs(clip: VideoClip, localFrame: number) {
  return ((clipTiming(clip).startFrame + localFrame) * 1000) / VIDEO_FPS;
}

export function clipAudioSamples(clip: VideoClip) {
  const timing = clipTiming(clip);
  const sampleCount =
    timing.durationFrames * (CUT_AUDIO_SAMPLE_RATE / VIDEO_FPS);
  const first = clip.captions[0],
    last = clip.captions.at(-1);
  const fade = (requested: number | undefined, handle: number) =>
    Math.floor(
      (Math.min(
        15,
        Math.max(0, requested ?? 0),
        Math.max(0, handle),
        (timing.outMs - timing.inMs) / 2,
      ) *
        CUT_AUDIO_SAMPLE_RATE) /
        1000,
    );
  return {
    sampleRate: CUT_AUDIO_SAMPLE_RATE,
    sampleCount,
    fadeInSamples: fade(
      clip.audioFadeInMs,
      (first?.startMs ?? timing.outMs) - timing.inMs,
    ),
    fadeOutSamples: fade(
      clip.audioFadeOutMs,
      timing.outMs - (last?.endMs ?? timing.inMs),
    ),
  };
}

export function clipFrames(clip: VideoClip): number {
  return clipTiming(clip).durationFrames;
}

export function chapterIntroSeconds(
  plan: Pick<ChapterVideoPlan, "promptQuestion" | "questionCard">,
): number {
  if (plan.questionCard) return QUESTION_CARD_SECONDS;
  if (!plan.promptQuestion) return VIDEO_INTRO_SECONDS;
  // Allow unhurried reading before the storyteller's own voice begins.
  return Math.min(
    12,
    Math.max(
      6,
      Math.ceil(plan.promptQuestion.trim().split(/\s+/u).length / 2.5 + 1),
    ),
  );
}

export function chapterDurationFrames(plan: ChapterVideoPlan): number {
  return (
    (chapterIntroSeconds(plan) + VIDEO_CLOSER_SECONDS) * VIDEO_FPS +
    plan.clips.reduce((sum, clip) => sum + clipFrames(clip), 0)
  );
}

export function safeMediaPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length < 500 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    !value.includes(":") &&
    !value.split("/").some((part) => part === ".." || part === "." || !part) &&
    !/[\x00-\x1f]/.test(value)
  );
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const nonempty = (value: unknown, max = 250): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const digest = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

/** Validate all external JSON before opening media or submitting a render job. */
export function validateVideoPlan(
  input: unknown,
  options: { requireApproval?: boolean } = {},
): ChapterVideoPlan {
  const fail = (message: string): never => {
    throw new Error(`Invalid video plan: ${message}`);
  };
  if (!record(input)) return fail("expected an object");
  if (input.schemaVersion !== 1) return fail("unsupported schema version");
  for (const field of [
    "id",
    "sessionId",
    "chapterId",
    "title",
    "storytellerName",
  ]) {
    if (!nonempty(input[field], field === "title" ? 110 : 120))
      return fail(`${field} is missing or too long`);
  }
  if (
    !Number.isInteger(input.chapterNumber) ||
    Number(input.chapterNumber) < 1 ||
    Number(input.chapterNumber) > 4
  )
    return fail("chapterNumber must be 1 to 4");
  if (
    input.promptQuestion !== undefined &&
    (!nonempty(input.promptQuestion, 220) ||
      /[\x00-\x1f]/.test(String(input.promptQuestion)))
  )
    return fail(
      "promptQuestion is missing, too long, or contains control characters",
    );
  if (input.questionCard !== undefined) {
    if (
      !record(input.questionCard) ||
      !nonempty(input.questionCard.question, 500) ||
      /[\x00-\x1f]/.test(String(input.questionCard.question)) ||
      !nonempty(input.questionCard.label, 40) ||
      /[\x00-\x1f]/.test(String(input.questionCard.label)) ||
      input.questionCard.durationMs !== QUESTION_CARD_SECONDS * 1000 ||
      !record(input.questionCard.music) ||
      !safeMediaPath(input.questionCard.music.relativePath) ||
      !digest(input.questionCard.music.sha256)
    )
      return fail(
        "question card needs a short label, the asked question, and a hashed music file",
      );
  }
  if (!Number.isInteger(input.revision) || Number(input.revision) < 1)
    return fail("revision must be positive");
  if (!Array.isArray(input.sources) || input.sources.length > 500)
    return fail("sources must be an array with at most 500 records");
  const sources = new Map<string, Record<string, unknown>>();
  for (const source of input.sources) {
    if (!record(source)) return fail("invalid source");
    for (const field of [
      "assetId",
      "sourceAnswerId",
      "takeId",
      "acceptedTakeId",
      "archiveRef",
    ]) {
      if (!nonempty(source[field], field === "archiveRef" ? 1000 : 120))
        return fail(`source ${field} is missing`);
    }
    if (sources.has(String(source.assetId))) return fail("duplicate assetId");
    if (source.kind !== "video" && source.kind !== "audio")
      return fail("invalid source kind");
    if (!safeMediaPath(source.relativePath) || !digest(source.sha256))
      return fail("source requires a safe relative path and SHA-256");
    if (!finite(source.durationMs) || source.durationMs <= 0)
      return fail("source duration must be positive");
    if (source.originalPreserved !== true)
      return fail("the original must be preserved");
    if (source.takeId !== source.acceptedTakeId)
      return fail("only the accepted take may be rendered");
    if (source.audioDerivative !== undefined) {
      const derivative = source.audioDerivative;
      if (
        !record(derivative) ||
        !safeMediaPath(derivative.relativePath) ||
        !digest(derivative.sha256)
      )
        return fail("invalid audio derivative");
      if (derivative.relativePath === source.relativePath)
        return fail("audio processing must not overwrite the original");
      if (
        !["ffmpeg-cleanup", "elevenlabs-isolation"].includes(
          String(derivative.method),
        )
      )
        return fail("unknown audio processing method");
      if (
        !finite(derivative.durationMs) ||
        Math.abs(derivative.durationMs - source.durationMs) > 100
      )
        return fail(
          "audio derivative duration must match the original within 100ms",
        );
    }
    sources.set(String(source.assetId), source);
  }
  if (
    !Array.isArray(input.clips) ||
    input.clips.length < 1 ||
    input.clips.length > 500
  )
    return fail("provide 1 to 500 clips");
  const clipIds = new Set<string>();
  for (const clip of input.clips) {
    if (
      !record(clip) ||
      !nonempty(clip.id, 120) ||
      !nonempty(clip.sourceAnswerId, 120)
    )
      return fail("clip identity is missing");
    if (clipIds.has(clip.id)) return fail("duplicate clip id");
    clipIds.add(clip.id);
    if (!nonempty(clip.editorialReason, 1000))
      return fail("each cut needs an editorial reason for review");
    if (
      !finite(clip.inMs) ||
      !finite(clip.outMs) ||
      clip.inMs < 0 ||
      clip.outMs <= clip.inMs
    )
      return fail("invalid clip range");
    if (clip.kind === "text") {
      if (
        !nonempty(clip.text, 500) ||
        clip.inMs !== 0 ||
        clip.sourceAssetId !== undefined
      )
        return fail(
          "text cards need approved text, zero inMs and no media source",
        );
    } else {
      const source = sources.get(String(clip.sourceAssetId));
      if (
        !source ||
        source.kind !== clip.kind ||
        source.sourceAnswerId !== clip.sourceAnswerId
      )
        return fail("clip source does not match its answer and media kind");
      if (clip.outMs > Number(source.durationMs))
        return fail("clip extends beyond original duration");
    }
    for (const fade of [clip.audioFadeInMs, clip.audioFadeOutMs]) {
      if (
        fade !== undefined &&
        (!finite(fade) || fade < 0 || fade > 15 || clip.kind === "text")
      )
        return fail("audio fades must be at most 15ms on recorded clips");
    }
    if (!Array.isArray(clip.captions) || clip.captions.length > 20000)
      return fail("captions must be an array");
    let lastEnd = clip.inMs;
    for (const caption of clip.captions) {
      if (
        !record(caption) ||
        !nonempty(caption.text, 220) ||
        !finite(caption.startMs) ||
        !finite(caption.endMs)
      )
        return fail("invalid caption");
      if (
        caption.startMs < clip.inMs ||
        caption.endMs > clip.outMs ||
        caption.endMs <= caption.startMs ||
        caption.startMs < lastEnd
      )
        return fail(
          "caption ranges must be ordered, non-overlapping and inside the clip",
        );
      if (
        caption.timestampMs !== null &&
        (!finite(caption.timestampMs) ||
          caption.timestampMs < caption.startMs ||
          caption.timestampMs > caption.endMs)
      )
        return fail("invalid caption timestamp");
      if (
        caption.confidence !== null &&
        (!finite(caption.confidence) ||
          caption.confidence < 0 ||
          caption.confidence > 1)
      )
        return fail("invalid caption confidence");
      lastEnd = caption.endMs;
    }
  }
  for (const value of input.clips) {
    const clip = value as VideoClip;
    const derivative = clip.audioDerivative;
    if (derivative !== undefined) {
      const timing = clipTiming(clip),
        samples = clipAudioSamples(clip);
      if (
        clip.kind === "text" ||
        !record(derivative) ||
        !nonempty(derivative.assetId, 120) ||
        sources.has(derivative.assetId) ||
        !safeMediaPath(derivative.relativePath) ||
        !digest(derivative.sha256) ||
        derivative.sampleRate !== CUT_AUDIO_SAMPLE_RATE ||
        derivative.sampleCount !== samples.sampleCount ||
        derivative.startFrame !== timing.startFrame ||
        derivative.endFrame !== timing.endFrame ||
        derivative.fadeInSamples !== samples.fadeInSamples ||
        derivative.fadeOutSamples !== samples.fadeOutSamples
      )
        return fail(
          "clip audio derivative must match its exact source interval and safe fades",
        );
    }
  }
  if (input.approval !== null) {
    if (
      !record(input.approval) ||
      !nonempty(input.approval.approvedBy) ||
      typeof input.approval.approvedAt !== "string" ||
      !Number.isFinite(Date.parse(input.approval.approvedAt))
    )
      return fail("invalid edit approval");
  } else if (options.requireApproval !== false)
    return fail("edit plan needs approval before final rendering");
  if (input.brandCloser !== undefined) {
    if (
      !record(input.brandCloser) ||
      !safeMediaPath(input.brandCloser.relativePath) ||
      !digest(input.brandCloser.sha256) ||
      input.brandCloser.durationMs !== 4000
    )
      return fail("brand closer must be a hashed four-second asset");
  }
  const plan = input as unknown as ChapterVideoPlan;
  if (chapterDurationFrames(plan) > MAX_CHAPTER_SECONDS * VIDEO_FPS)
    return fail(
      "finished chapter must be no longer than one hour, including titles and closer",
    );
  return plan;
}
