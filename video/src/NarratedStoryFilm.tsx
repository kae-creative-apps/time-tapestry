import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
  Composition,
  Sequence,
  interpolate,
  useCurrentFrame,
  delayRender,
  continueRender,
  cancelRender,
} from "remotion";
import { Audio, Video } from "@remotion/media";
import { BrandArtwork } from "../../src/components/BrandArtwork";
import { BrandPattern } from "../../src/components/BrandPattern";
import { BRAND_COLORS } from "../../src/lib/brand-art";
import type {
  FilmWord,
  NarratedFilmPlan,
} from "../../src/lib/collection/films/types";

export type NarratedStoryFilmProps = {
  plan: NarratedFilmPlan;
  audioSrc: string;
  closerSrc?: string;
  fontSrc?: string;
};
const FPS = 30;
const INTRO = 3;
const CLOSER = 4;
const accents = ["#dce0d3", "#e9d5cb", "#d5cabc", "#cdd6cf"];
const font =
  '"StoryQuicksand", "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';

function pagesFor(words: FilmWord[]) {
  const pages: FilmWord[][] = [];
  let page: FilmWord[] = [];
  for (const word of words) {
    const length = [...page, word].map((item) => item.text).join(" ").length;
    if (
      page.length &&
      (length > 112 || (page.length >= 10 && /[.!?]$/.test(page.at(-1)!.text)))
    ) {
      pages.push(page);
      page = [];
    }
    page.push(word);
  }
  if (page.length) pages.push(page);
  return pages;
}

function FilmBackground({ chapterNumber }: { chapterNumber: number }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{ background: BRAND_COLORS.paper, color: BRAND_COLORS.espresso }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse at 86% 35%, ${accents[chapterNumber - 1]} 0%, transparent 68%)`,
        }}
      />
      <div
        className="film-weave"
        style={{
          position: "absolute",
          width: 1050,
          height: 700,
          right: -320,
          bottom: -370,
          color: BRAND_COLORS.espresso,
          opacity: 0.09,
          translate: `0 ${Math.sin(frame / 180) * 18}px`,
        }}
      >
        <BrandPattern variant="ribbon" />
      </div>
      <div
        style={{
          position: "absolute",
          left: 92,
          top: 100,
          bottom: 100,
          width: 2,
          background: BRAND_COLORS.taupe,
          opacity: 0.18,
        }}
      />
    </AbsoluteFill>
  );
}

function Intro({ plan }: { plan: NarratedFilmPlan }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        padding: "115px 150px",
        color: BRAND_COLORS.espresso,
        justifyContent: "center",
      }}
    >
      <p
        style={{
          fontFamily: font,
          fontSize: 32,
          letterSpacing: 5,
          textTransform: "uppercase",
          margin: "0 0 38px",
        }}
      >
        Story {plan.chapterNumber} of four
      </p>
      <h1
        style={{
          fontFamily: font,
          fontSize: 126,
          lineHeight: 1.08,
          letterSpacing: -4,
          maxWidth: 1420,
          margin: 0,
          opacity: interpolate(frame, [0, 18], [0, 1], {
            extrapolateRight: "clamp",
          }),
          translate: `0 ${interpolate(frame, [0, 24], [24, 0], { extrapolateRight: "clamp" })}px`,
        }}
      >
        {plan.title}
      </h1>
      <p
        style={{
          fontFamily: font,
          fontSize: 44,
          margin: "44px 0 0",
          color: BRAND_COLORS.taupe,
        }}
      >
        A story from {plan.storytellerName}
      </p>
      <p
        style={{ fontFamily: "Arial, sans-serif", fontSize: 28, marginTop: 45 }}
      >
        AI narration from reviewed words. Original recordings are preserved.
      </p>
    </AbsoluteFill>
  );
}

function Narration({
  plan,
  audioSrc,
}: {
  plan: NarratedFilmPlan;
  audioSrc: string;
}) {
  const frame = useCurrentFrame();
  const timeMs = (frame / FPS) * 1000;
  const pages = pagesFor(plan.words);
  const currentIndex = Math.max(
    0,
    pages.findIndex(
      (page, index) => timeMs < (pages[index + 1]?.[0].startMs ?? Infinity),
    ),
  );
  const words = pages[currentIndex] ?? [];
  const pageStart = words[0]?.startMs ?? 0;
  return (
    <AbsoluteFill
      style={{ padding: "90px 150px", color: BRAND_COLORS.espresso }}
    >
      {audioSrc && <Audio src={audioSrc} />}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 40,
          fontFamily: font,
        }}
      >
        <p style={{ fontSize: 30, letterSpacing: 2, margin: 0 }}>
          STORY {plan.chapterNumber} / 4
        </p>
        <p
          style={{
            fontSize: 30,
            maxWidth: 1200,
            textAlign: "right",
            margin: 0,
          }}
        >
          {plan.title}
        </p>
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          maxWidth: 1490,
          paddingBottom: 40,
        }}
      >
        <p
          style={{
            fontFamily: font,
            fontSize: 30,
            color: BRAND_COLORS.taupe,
            margin: "0 0 34px",
          }}
        >
          From {plan.storytellerName}’s reviewed story
        </p>
        <div
          style={{
            fontFamily: font,
            fontSize: 82,
            lineHeight: 1.28,
            letterSpacing: -1.8,
            fontWeight: 500,
            opacity: interpolate(timeMs - pageStart, [0, 160], [0.65, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          {words.map((word, index) => (
            <React.Fragment key={`${word.startMs}-${index}`}>
              <span
                style={{
                  color:
                    timeMs >= word.startMs ? BRAND_COLORS.espresso : "#9e9388",
                  background:
                    timeMs >= word.startMs && timeMs <= word.endMs
                      ? accents[plan.chapterNumber - 1]
                      : "transparent",
                  borderRadius: 10,
                  padding: "2px 3px",
                  boxDecorationBreak: "clone",
                }}
              >
                {word.text}
              </span>
              {index < words.length - 1 ? " " : ""}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          font: "28px Arial, sans-serif",
          color: BRAND_COLORS.taupe,
        }}
      >
        <span>Time Tapestry · AI narration</span>
        <span>
          {currentIndex + 1} / {pages.length}
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          left: 150,
          right: 150,
          bottom: 62,
          height: 3,
          background: "#e3ddd6",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.min(100, (timeMs / plan.audioDurationMs) * 100)}%`,
            background: BRAND_COLORS.sage,
          }}
        />
      </div>
    </AbsoluteFill>
  );
}

function Closer() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        background: BRAND_COLORS.paper,
        gap: 35,
      }}
    >
      <div
        style={{
          width: 690,
          opacity: interpolate(frame, [0, 22], [0, 1], {
            extrapolateRight: "clamp",
          }),
          translate: `0 ${interpolate(frame, [0, 26], [20, 0], { extrapolateRight: "clamp" })}px`,
        }}
      >
        <BrandArtwork
          variant="lockup"
          style={{ width: "100%", height: "auto" }}
        />
      </div>
      <p
        style={{
          fontFamily: font,
          fontSize: 42,
          color: BRAND_COLORS.taupe,
          margin: 0,
        }}
      >
        Stories woven together.
      </p>
    </AbsoluteFill>
  );
}

export function NarratedStoryFilm({
  plan,
  audioSrc,
  closerSrc,
  fontSrc,
}: NarratedStoryFilmProps) {
  const [fontHandle] = useState(() =>
    delayRender("Loading the story typeface"),
  );
  useEffect(() => {
    let cancelled = false;
    if (!fontSrc) {
      continueRender(fontHandle);
      return;
    }
    const face = new FontFace("StoryQuicksand", `url(${fontSrc})`, {
      weight: "100 900",
    });
    face
      .load()
      .then((loaded) => {
        if (!cancelled) {
          document.fonts.add(loaded);
          continueRender(fontHandle);
        }
      })
      .catch(cancelRender);
    return () => {
      cancelled = true;
    };
  }, [fontSrc, fontHandle]);
  const audioFrames = Math.ceil((plan.audioDurationMs / 1000) * FPS);
  return (
    <AbsoluteFill>
      <style>{`.film-weave svg{width:100%;height:100%}${fontSrc ? `@font-face{font-family:StoryQuicksand;src:url('${fontSrc}');font-weight:100 900}` : ""}`}</style>
      <FilmBackground chapterNumber={plan.chapterNumber} />
      <Sequence from={0} durationInFrames={INTRO * FPS}>
        <Intro plan={plan} />
      </Sequence>
      <Sequence from={INTRO * FPS} durationInFrames={audioFrames}>
        <Narration plan={plan} audioSrc={audioSrc} />
      </Sequence>
      <Sequence
        from={INTRO * FPS + audioFrames}
        durationInFrames={CLOSER * FPS}
      >
        {closerSrc ? (
          <Video
            src={closerSrc}
            muted
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <Closer />
        )}
      </Sequence>
    </AbsoluteFill>
  );
}

export function NarratedFilmRoot() {
  return (
    <Composition
      id="NarratedStoryFilm"
      component={NarratedStoryFilm}
      fps={30}
      width={1920}
      height={1080}
      durationInFrames={510}
      defaultProps={{
        plan: {
          schemaVersion: 1,
          jobId: "preview",
          chapterId: "q1",
          chapterNumber: 1,
          storytellerName: "Sample storyteller",
          title: "People who shaped me",
          script: "A fictional story for layout review.",
          sourceTakeIds: ["synthetic"],
          sourceSha256: "",
          scriptSha256: "",
          audioSha256: "",
          audioDurationMs: 10000,
          words: [
            {
              text: "A fictional story for layout review.",
              startMs: 0,
              endMs: 10000,
            },
          ],
          narrationKind: "ai_interviewer",
          templateVersion: "narrated-story-v1",
        },
        audioSrc: "",
      }}
      calculateMetadata={({ props }) => ({
        durationInFrames:
          (INTRO + CLOSER) * FPS +
          Math.ceil((props.plan.audioDurationMs / 1000) * FPS),
      })}
    />
  );
}
