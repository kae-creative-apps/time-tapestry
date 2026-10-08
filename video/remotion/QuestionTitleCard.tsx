import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
  cancelRender,
  continueRender,
  delayRender,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { Audio } from "@remotion/media";
import { BRAND_COLORS } from "../../src/lib/brand-art";
import {
  QUESTION_CARD_FADE_SECONDS,
  QUESTION_CARD_SECONDS,
  VIDEO_FPS,
  type ChapterVideoPlan,
} from "../../src/lib/video-plan";

const FADE_FRAMES = QUESTION_CARD_FADE_SECONDS * VIDEO_FPS;
const TOTAL_FRAMES = QUESTION_CARD_SECONDS * VIDEO_FPS;

/** Shared by the card and the music so both are gone when the answer starts. */
export function questionCardPresence(frame: number) {
  const enter = interpolate(frame, [0, FADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exit = interpolate(
    frame,
    [TOTAL_FRAMES - FADE_FRAMES, TOTAL_FRAMES],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return Math.min(enter, exit);
}

function QuestionFont({ src }: { src?: string }) {
  const [handle] = useState(() =>
    delayRender("Loading the question-card typeface"),
  );
  useEffect(() => {
    if (!src) {
      cancelRender(new Error("The question card is missing its typeface."));
      return;
    }
    let active = true;
    const face = new FontFace("QuestionInter", `url(${JSON.stringify(src)})`, {
      weight: "400",
    });
    face
      .load()
      .then((loaded) => {
        if (!active) return;
        document.fonts.add(loaded);
        continueRender(handle);
      })
      .catch((error) => {
        if (active) cancelRender(error);
      });
    return () => {
      active = false;
    };
  }, [src, handle]);
  return null;
}

function GlowOrb() {
  const { paper, clay, sage, taupe } = BRAND_COLORS;
  const size = 720;
  const layers = [
    `conic-gradient(from 40deg at 25% 70%, ${taupe}, transparent 20% 80%, ${taupe})`,
    `conic-gradient(from 80deg at 45% 75%, ${sage}, transparent 30% 60%, ${sage})`,
    `conic-gradient(from -60deg at 80% 20%, ${clay}, transparent 40% 60%, ${clay})`,
    `conic-gradient(from 20deg at 20% 80%, ${clay}, transparent 10% 90%, ${clay})`,
  ];
  return (
    <div
      style={{
        position: "absolute",
        width: size,
        height: size,
        right: -80,
        top: 80,
        borderRadius: "50%",
        overflow: "hidden",
        opacity: 0.9,
        filter: "blur(10px) contrast(1.12)",
        background: layers.join(","),
        boxShadow: `inset ${paper} 0 0 18px 2px`,
      }}
    />
  );
}

export function QuestionTitleCard({
  card,
  musicSrc,
  fontSrc,
}: {
  card: NonNullable<ChapterVideoPlan["questionCard"]>;
  musicSrc?: string;
  fontSrc?: string;
}) {
  const frame = useCurrentFrame();
  const presence = questionCardPresence(frame);
  const rise = interpolate(frame, [0, FADE_FRAMES], [28, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const questionSize =
    card.question.length > 180 ? 52 : card.question.length > 110 ? 64 : 76;
  if (musicSrc === undefined) {
    cancelRender(new Error("The question card is missing its music."));
  }
  return (
    <AbsoluteFill style={{ opacity: presence, background: "#38271f" }}>
      <QuestionFont src={fontSrc} />
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 88% 8%, rgba(168, 134, 109, 0.28), transparent 58%), linear-gradient(125deg, #38271f 0%, #543b2e 55%, #705541 100%)",
        }}
      />
      <GlowOrb />
      {musicSrc ? (
        <Audio
          src={musicSrc}
          volume={(audioFrame) => questionCardPresence(audioFrame)}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          left: 150,
          right: 150,
          top: 150,
          bottom: 150,
          borderRadius: 40,
          background: "#5c4033",
          boxShadow: "0 24px 60px rgba(32, 20, 14, 0.28)",
          transform: `translateY(${rise}px)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 54,
            left: 64,
            color: "rgba(255, 255, 255, 0.82)",
            fontFamily: '"QuestionInter", Inter, "Trebuchet MS", sans-serif',
            fontWeight: 400,
            fontSize: 32,
            letterSpacing: "0.04em",
          }}
        >
          {card.label}
        </div>
        <div
          style={{
            position: "absolute",
            left: 96,
            right: 96,
            top: 140,
            bottom: 80,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            color: "#ffffff",
            fontFamily: '"QuestionInter", Inter, "Trebuchet MS", sans-serif',
            fontWeight: 400,
            fontSize: questionSize,
            lineHeight: 1.28,
            letterSpacing: -0.4,
          }}
        >
          {card.question}
        </div>
      </div>
    </AbsoluteFill>
  );
}
