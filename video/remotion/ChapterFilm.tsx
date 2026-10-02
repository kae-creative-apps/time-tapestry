import React from "react";
import { Audio, Video } from "@remotion/media";
import {
  AbsoluteFill,
  Composition,
  Sequence,
  interpolate,
  useCurrentFrame,
} from "remotion";
import {
  type ChapterVideoPlan,
  type VideoClip,
  VIDEO_FPS,
  VIDEO_INTRO_SECONDS,
  VIDEO_CLOSER_SECONDS,
  chapterDurationFrames,
  clipFrames,
  validateVideoPlan,
} from "../../src/lib/video-plan";

export type ChapterFilmProps = {
  plan: ChapterVideoPlan;
  /** Assigned by the trusted render worker after hash verification. */
  mediaUrls: Record<string, string>;
  draft: boolean;
};

const paper = "#faf6ef";
const ink = "#1a1714";

function Title({ plan }: { plan: ChapterVideoPlan }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background: paper,
        color: ink,
        padding: "110px 150px",
        justifyContent: "center",
        gap: 26,
      }}
    >
      <div style={{ font: "28px Arial", letterSpacing: 6, color: "#7a2e2e" }}>
        CHAPTER {plan.chapterNumber} OF FOUR
      </div>
      <div
        style={{
          font: "86px Georgia",
          lineHeight: 1.12,
          maxWidth: 1500,
          opacity: interpolate(frame, [0, 18], [0, 1], {
            extrapolateRight: "clamp",
          }),
          translate: `0 ${interpolate(frame, [0, 18], [18, 0], { extrapolateRight: "clamp" })}px`,
        }}
      >
        {plan.title}
      </div>
      <div style={{ font: "36px Arial", color: "#6b6358" }}>
        {plan.storytellerName}
      </div>
    </AbsoluteFill>
  );
}

function WordmarkCloser() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background: paper,
        color: ink,
        justifyContent: "center",
        alignItems: "center",
        gap: 34,
      }}
    >
      <div
        style={{
          font: "104px Georgia",
          opacity: interpolate(frame, [0, 22], [0, 1], {
            extrapolateRight: "clamp",
          }),
          translate: `0 ${interpolate(frame, [0, 22], [18, 0], { extrapolateRight: "clamp" })}px`,
        }}
      >
        time tapestry
      </div>
      <div
        style={{
          width: 230,
          height: 4,
          background: "#7a2e2e",
          scale: `${interpolate(frame, [16, 38], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} 1`,
        }}
      />
    </AbsoluteFill>
  );
}

function StoryClip({
  clip,
  plan,
  mediaUrls,
}: {
  clip: VideoClip;
  plan: ChapterVideoPlan;
  mediaUrls: Record<string, string>;
}) {
  const frame = useCurrentFrame();
  const sourceMs = clip.inMs + (frame / VIDEO_FPS) * 1000;
  const caption = clip.captions.find(
    (item) => sourceMs >= item.startMs && sourceMs < item.endMs,
  );
  const source = plan.sources.find(
    (item) => item.assetId === clip.sourceAssetId,
  );
  const src = source ? mediaUrls[source.assetId] : undefined;
  const audioSrc = source?.audioDerivative
    ? mediaUrls[`${source.assetId}:audio`]
    : src;
  return (
    <AbsoluteFill style={{ background: ink, color: paper }}>
      {clip.kind === "video" && src && (
        <Video
          src={src}
          muted={!!source?.audioDerivative}
          trimBefore={Math.round((clip.inMs / 1000) * VIDEO_FPS)}
          trimAfter={Math.round((clip.outMs / 1000) * VIDEO_FPS)}
          objectFit="contain"
          style={{ width: "100%", height: "100%" }}
        />
      )}
      {(clip.kind === "audio" || source?.audioDerivative) && audioSrc && (
        <Audio
          src={audioSrc}
          trimBefore={Math.round((clip.inMs / 1000) * VIDEO_FPS)}
          trimAfter={Math.round((clip.outMs / 1000) * VIDEO_FPS)}
        />
      )}
      {clip.kind !== "video" && (
        <AbsoluteFill
          style={{ padding: "140px 190px", justifyContent: "center", gap: 42 }}
        >
          <div style={{ font: "30px Arial", color: paper, opacity: 0.7 }}>
            {plan.storytellerName} ·{" "}
            {clip.kind === "audio"
              ? "In their own voice"
              : "In their own words"}
          </div>
          <div
            style={{
              font: `${clip.kind === "text" ? 55 : 82}px Georgia`,
              lineHeight: 1.3,
            }}
          >
            {clip.kind === "text" ? clip.text : plan.title}
          </div>
        </AbsoluteFill>
      )}
      {caption && (
        <div
          style={{
            position: "absolute",
            left: 145,
            right: 145,
            bottom: 80,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              font: "46px Arial",
              lineHeight: 1.25,
              textAlign: "center",
              maxWidth: 1500,
              padding: "18px 26px",
              background: "rgba(26,23,20,0.90)",
              color: "#ffffff",
              borderRadius: 8,
            }}
          >
            {caption.text}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
}

export function ChapterFilm({ plan, mediaUrls, draft }: ChapterFilmProps) {
  let cursor = VIDEO_INTRO_SECONDS * VIDEO_FPS;
  const clips = plan.clips.map((clip) => {
    const from = cursor;
    const frames = clipFrames(clip);
    cursor += frames;
    // This is intentionally one parameterized template. Editors change the approved JSON plan.
    return (
      <Sequence
        key={clip.id}
        name={clip.id}
        from={from}
        durationInFrames={frames}
      >
        <StoryClip clip={clip} plan={plan} mediaUrls={mediaUrls} />
      </Sequence>
    );
  });
  return (
    <AbsoluteFill style={{ background: ink }}>
      <Sequence
        name="Chapter title"
        from={0}
        durationInFrames={VIDEO_INTRO_SECONDS * VIDEO_FPS}
      >
        <Title plan={plan} />
      </Sequence>
      {clips}
      <Sequence
        name="Brand closer"
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
          <WordmarkCloser />
        )}
      </Sequence>
      {draft && (
        <div
          style={{
            position: "absolute",
            top: 32,
            right: 40,
            font: "24px Arial",
            background: ink,
            color: paper,
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
