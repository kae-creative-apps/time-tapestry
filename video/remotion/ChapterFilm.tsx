import React from "react";
import { AbsoluteFill, Composition, Sequence, useCurrentFrame } from "remotion";
import { Audio, Video } from "@remotion/media";
import { BRAND_COLORS } from "../../src/lib/brand-art";
import {
  audioEnvelopeLevel,
  type AudioEnvelope,
} from "../../src/lib/film-audio-envelope";
import {
  TemplateBackground,
  TemplateFont,
  TemplateTitle,
  TemplateOrbScene,
  TemplateCaption,
  TemplateLogoCloser,
  FONT,
} from "../templates/StoryTemplate";
import {
  type ChapterVideoPlan,
  type VideoClip,
  VIDEO_FPS,
  chapterIntroSeconds,
  VIDEO_CLOSER_SECONDS,
  chapterDurationFrames,
  clipFrames,
  clipTiming,
  clipSourceTimeMs,
  validateVideoPlan,
} from "../../src/lib/video-plan";

export type ChapterFilmProps = {
  plan: ChapterVideoPlan;
  /** Assigned by the trusted render worker after hash verification. */
  mediaUrls: Record<string, string>;
  audioEnvelopes?: Record<string, AudioEnvelope>;
  draft: boolean;
};

function StoryClip({
  clip,
  plan,
  mediaUrls,
  audioEnvelopes,
}: {
  clip: VideoClip;
  plan: ChapterVideoPlan;
  mediaUrls: Record<string, string>;
  audioEnvelopes?: Record<string, AudioEnvelope>;
}) {
  const frame = useCurrentFrame();
  const sourceMs = clipSourceTimeMs(clip, frame);
  const caption = clip.captions.find(
    (item) => sourceMs >= item.startMs && sourceMs < item.endMs,
  );
  const source = plan.sources.find(
    (item) => item.assetId === clip.sourceAssetId,
  );
  const src = source ? mediaUrls[source.assetId] : undefined;
  const audioSrc = clip.audioDerivative
    ? mediaUrls[clip.audioDerivative.assetId]
    : source?.audioDerivative
      ? mediaUrls[`${source.assetId}:audio`]
      : src;
  const interval = clipTiming(clip);
  const timing = {
    trimBefore: interval.startFrame,
    trimAfter: interval.endFrame,
  };
  const audioTiming = clip.audioDerivative
    ? { trimBefore: 0, trimAfter: interval.durationFrames }
    : timing;
  return (
    <AbsoluteFill style={{ background: BRAND_COLORS.espresso }}>
      {clip.kind === "video" && src && (
        <Video
          src={src}
          muted={!!(source?.audioDerivative || clip.audioDerivative)}
          {...timing}
          objectFit="contain"
          style={{ width: "100%", height: "100%" }}
        />
      )}
      {(clip.kind === "audio" ||
        source?.audioDerivative ||
        clip.audioDerivative) &&
        audioSrc && <Audio src={audioSrc} {...audioTiming} />}
      {clip.kind === "audio" && (
        <TemplateOrbScene
          chapterNumber={plan.chapterNumber}
          title={plan.title}
          chapterLabel={plan.promptQuestion ? "A story to keep" : undefined}
          storytellerName={plan.storytellerName}
          attribution="In their own voice"
          caption={caption?.text}
          level={audioEnvelopeLevel(
            clip.audioDerivative
              ? audioEnvelopes?.[clip.audioDerivative.assetId]
              : source
                ? audioEnvelopes?.[source.assetId]
                : undefined,
            clip.audioDerivative ? (frame / VIDEO_FPS) * 1000 : sourceMs,
          )}
        />
      )}
      {clip.kind === "text" && (
        <AbsoluteFill
          style={{
            justifyContent: "center",
            padding: 150,
            color: BRAND_COLORS.espresso,
          }}
        >
          <TemplateBackground chapterNumber={plan.chapterNumber} />
          <div
            style={{
              position: "relative",
              fontFamily: FONT,
              fontSize: 36,
              marginBottom: 28,
            }}
          >
            Written words · No audio
          </div>
          <div
            style={{
              position: "relative",
              fontFamily: FONT,
              fontSize: 52,
              lineHeight: 1.35,
            }}
          >
            {clip.text}
          </div>
        </AbsoluteFill>
      )}
      {clip.kind === "video" && caption && (
        <TemplateCaption text={caption.text} overVideo />
      )}
    </AbsoluteFill>
  );
}

export function ChapterFilm({
  plan,
  mediaUrls,
  audioEnvelopes,
  draft,
}: ChapterFilmProps) {
  const hasRecording = plan.clips.some((clip) => clip.kind !== "text");
  const hasText = plan.clips.some((clip) => clip.kind === "text");
  const attribution = !hasRecording
    ? "Written words · No audio"
    : hasText
      ? "Original recordings and written words"
      : "In their own voice";
  let cursor = chapterIntroSeconds(plan) * VIDEO_FPS;
  const clips = plan.clips.map((clip) => {
    const from = cursor;
    const frames = clipFrames(clip);
    cursor += frames;
    // One parameterized template, with editorial decisions stored in the approved plan.
    return (
      <Sequence
        key={clip.id}
        name={clip.id}
        from={from}
        durationInFrames={frames}
      >
        <StoryClip
          clip={clip}
          plan={plan}
          mediaUrls={mediaUrls}
          audioEnvelopes={audioEnvelopes}
        />
      </Sequence>
    );
  });
  return (
    <AbsoluteFill>
      <TemplateFont src={mediaUrls["brand-font"]} />
      <Sequence
        name="Chapter title"
        from={0}
        durationInFrames={chapterIntroSeconds(plan) * VIDEO_FPS}
      >
        <TemplateTitle
          chapterNumber={plan.chapterNumber}
          title={plan.title}
          chapterLabel={plan.promptQuestion ? "A story to keep" : undefined}
          storytellerName={plan.storytellerName}
          promptQuestion={plan.promptQuestion}
          attribution={attribution}
        />
      </Sequence>
      {clips}
      <Sequence
        name="Animated Time Tapestry logo"
        from={cursor}
        durationInFrames={VIDEO_CLOSER_SECONDS * VIDEO_FPS}
      >
        {plan.brandCloser && mediaUrls["brand-closer"] ? (
          <Video
            src={mediaUrls["brand-closer"]}
            muted
            objectFit="contain"
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <TemplateLogoCloser />
        )}
      </Sequence>
      {draft && (
        <div
          style={{
            position: "absolute",
            top: 24,
            right: 40,
            font: "24px Arial",
            background: BRAND_COLORS.espresso,
            color: BRAND_COLORS.paper,
            padding: "12px 18px",
          }}
        >
          DRAFT · REVIEW BEFORE SHARING
        </div>
      )}
    </AbsoluteFill>
  );
}

export function VideoRoot() {
  return (
    <Composition
      id="ChapterFilm"
      component={ChapterFilm}
      fps={30}
      width={1920}
      height={1080}
      durationInFrames={510}
      defaultProps={{
        plan: {
          schemaVersion: 1,
          id: "synthetic-preview",
          sessionId: "example",
          chapterId: "chapter-1",
          chapterNumber: 1,
          revision: 1,
          title: "A story worth sharing",
          storytellerName: "Sample storyteller",
          sources: [],
          approval: null,
          clips: [
            {
              id: "text-preview",
              sourceAnswerId: "sample-answer",
              kind: "text",
              inMs: 0,
              outMs: 10000,
              captions: [],
              text: "This is a layout preview using fictional text. Add the accepted interview takes to render a real chapter.",
              editorialReason: "Synthetic preview only.",
            },
          ],
        },
        mediaUrls: {},
        draft: true,
      }}
      calculateMetadata={({ props }) => {
        const plan = validateVideoPlan(props.plan, {
          requireApproval: !props.draft,
        });
        return {
          durationInFrames: chapterDurationFrames(plan),
          props: { ...props, plan },
        };
      }}
    />
  );
}
