import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
  cancelRender,
  continueRender,
  delayRender,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { BrandArtwork } from "../../src/components/BrandArtwork";
import { BrandPattern } from "../../src/components/BrandPattern";
import { BRAND_COLORS } from "../../src/lib/brand-art";
import { storyFilmTemplate } from "../../src/lib/story-film-template";

export const FONT =
  '"StoryQuicksand", "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';

export function TemplateFont({ src }: { src?: string }) {
  const [handle] = useState(() =>
    delayRender("Loading the Time Tapestry typeface"),
  );
  useEffect(() => {
    if (!src) {
      continueRender(handle);
      return;
    }
    let active = true;
    const face = new FontFace("StoryQuicksand", `url(${JSON.stringify(src)})`, {
      weight: "300 700",
    });
    face
      .load()
      .then((loaded) => {
        if (active) {
          document.fonts.add(loaded);
          continueRender(handle);
        }
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

export function TemplateBackground({
  chapterNumber,
}: {
  chapterNumber: number;
}) {
  const template = storyFilmTemplate(chapterNumber);
  return (
    <AbsoluteFill
      style={{
        background: BRAND_COLORS.paper,
        color: BRAND_COLORS.espresso,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: template.patternOffset[0],
          top: template.patternOffset[1],
          width: 2560,
          display: "grid",
          gridTemplateColumns: "repeat(4, 640px)",
          opacity: template.patternOpacity,
        }}
      >
        {/* The repeated artwork is one full-frame background, never an isolated swatch. */}
        {Array.from({ length: 16 }, (_, index) => (
          <div key={index} style={{ width: 640, height: (640 * 242) / 369 }}>
            <BrandPattern variant="weave" className="story-template-pattern" />
          </div>
        ))}
      </div>
      <style>
        {".story-template-pattern{display:block;width:100%;height:100%}"}
      </style>
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 48%, rgba(251,250,248,0.8) 0%, rgba(251,250,248,0) 74%)",
        }}
      />
    </AbsoluteFill>
  );
}

type StoryIdentity = {
  chapterNumber: number;
  title: string;
  storytellerName: string;
  attribution?: string;
};

function TemplateHeader({ chapterNumber }: { chapterNumber: number }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 90,
        left: 130,
        right: 130,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        color: BRAND_COLORS.espresso,
      }}
    >
      <BrandArtwork style={{ width: 225, height: 68, display: "block" }} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          fontFamily: FONT,
          fontSize: 29,
          fontWeight: 600,
        }}
      >
        <div style={{ width: 42, height: 2, background: BRAND_COLORS.sage }} />
        Story {chapterNumber} of 4
      </div>
    </div>
  );
}

export function TemplateTitle({
  chapterNumber,
  title,
  storytellerName,
  attribution,
}: StoryIdentity) {
  const frame = useCurrentFrame();
  const { theme } = storyFilmTemplate(chapterNumber);
  const customTitle =
    title.trim() &&
    title.trim().toLocaleLowerCase() !== theme.toLocaleLowerCase();
  return (
    <AbsoluteFill style={{ color: BRAND_COLORS.espresso, fontFamily: FONT }}>
      <TemplateBackground chapterNumber={chapterNumber} />
      <TemplateHeader chapterNumber={chapterNumber} />
      <div
        style={{
          position: "absolute",
          left: 150,
          right: 150,
          top: 285,
          bottom: 185,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 30,
        }}
      >
        <div
          style={{
            fontSize: customTitle ? 34 : 30,
            fontWeight: 600,
            color: BRAND_COLORS.taupe,
          }}
        >
          {customTitle ? theme : "A story from " + storytellerName}
        </div>
        <div
          style={{
            fontSize: title.length > 115 ? 76 : title.length > 65 ? 88 : 108,
            fontWeight: 600,
            letterSpacing: -2.3,
            lineHeight: 1.15,
            overflowWrap: "anywhere",
            maxWidth: 1530,
            opacity: interpolate(frame, [0, 18], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: `0 ${interpolate(frame, [0, 24], [18, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px`,
          }}
        >
          {title.trim() || theme}
        </div>
        {customTitle && (
          <div
            style={{
              fontSize: storytellerName.length > 70 ? 34 : 42,
              lineHeight: 1.3,
              overflowWrap: "anywhere",
              maxWidth: 1480,
            }}
          >
            A story from {storytellerName}
          </div>
        )}
      </div>
      {attribution && (
        <div
          style={{
            position: "absolute",
            bottom: 100,
            left: 150,
            right: 150,
            fontSize: 28,
            lineHeight: 1.35,
            color: BRAND_COLORS.taupe,
          }}
        >
          {attribution}
        </div>
      )}
    </AbsoluteFill>
  );
}

/** Frame-rendered version of the approved SiriOrb. Only measured audio changes its shape. */
function RecordedVoiceOrb({
  level = 0,
  motion = 0,
}: {
  level?: number;
  motion?: number;
}) {
  const volume = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
  const angle = (Number.isFinite(motion) ? motion : 0) + volume * 16;
  const size = 360;
  const blur = size * 0.015;
  // Keep the approved palette stable when the orb is enlarged for video.
  const contrast = 1.12;
  const dot = size * 0.008;
  const shadow = size * 0.008;
  const { paper, clay, sage, taupe } = BRAND_COLORS;
  const layers = [
    `conic-gradient(from ${angle * 2}deg at 25% 70%, ${taupe}, transparent 20% 80%, ${taupe})`,
    `conic-gradient(from ${angle * 2}deg at 45% 75%, ${sage}, transparent 30% 60%, ${sage})`,
    `conic-gradient(from ${angle * -3}deg at 80% 20%, ${clay}, transparent 40% 60%, ${clay})`,
    `conic-gradient(from ${angle * 2}deg at 15% 5%, ${sage}, transparent 10% 90%, ${sage})`,
    `conic-gradient(from ${angle}deg at 20% 80%, ${clay}, transparent 10% 90%, ${clay})`,
    `conic-gradient(from ${angle * -2}deg at 85% 10%, ${taupe}, transparent 20% 80%, ${taupe})`,
  ];
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        isolation: "isolate",
        borderRadius: "50%",
        overflow: "hidden",
        scale: 1 + volume * 0.045,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: layers.join(","),
          boxShadow: `inset ${paper} 0 0 ${shadow}px ${shadow * 0.2}px`,
          filter: `blur(${blur}px) contrast(${contrast})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          backgroundImage: `radial-gradient(circle at center, ${paper} ${dot}px, transparent ${dot}px)`,
          backgroundSize: `${dot * 2}px ${dot * 2}px`,
          backdropFilter: `blur(${blur * 2}px) contrast(${contrast})`,
          mixBlendMode: "overlay",
          maskImage: "radial-gradient(black 25%, transparent 75%)",
        }}
      />
    </div>
  );
}

export function TemplateCaption({
  text,
  overVideo = false,
}: {
  text: string;
  overVideo?: boolean;
}) {
  if (!text.trim()) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 140,
        right: 140,
        bottom: 98,
        display: "flex",
        justifyContent: "center",
        color: overVideo ? "#ffffff" : BRAND_COLORS.espresso,
      }}
    >
      <div
        style={{
          maxWidth: 1600,
          fontFamily: FONT,
          fontSize: text.length > 160 ? 42 : text.length > 112 ? 48 : 56,
          fontWeight: 500,
          lineHeight: 1.32,
          textAlign: "center",
          overflowWrap: "anywhere",
          padding: "16px 28px",
          borderRadius: 16,
          background: overVideo
            ? "rgba(43,31,25,0.94)"
            : "rgba(251,250,248,0.94)",
        }}
      >
        {text}
      </div>
    </div>
  );
}

export function TemplateOrbScene({
  chapterNumber,
  title,
  storytellerName,
  attribution,
  caption,
  level = 0,
  motion = 0,
}: StoryIdentity & { caption?: string; level?: number; motion?: number }) {
  const { theme } = storyFilmTemplate(chapterNumber);
  return (
    <AbsoluteFill style={{ color: BRAND_COLORS.espresso, fontFamily: FONT }}>
      <TemplateBackground chapterNumber={chapterNumber} />
      <TemplateHeader chapterNumber={chapterNumber} />
      <div
        style={{
          position: "absolute",
          top: 211,
          left: 180,
          right: 180,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 52, lineHeight: 1.15, fontWeight: 600 }}>
          {theme}
        </div>
        <div
          style={{
            marginTop: 22,
            fontSize: storytellerName.length > 70 ? 27 : 31,
            lineHeight: 1.3,
            overflowWrap: "anywhere",
            color: BRAND_COLORS.taupe,
          }}
        >
          {storytellerName}
          {attribution ? ` · ${attribution}` : ""}
        </div>
      </div>
      <div
        aria-label={title}
        style={{ position: "absolute", top: 364, left: 780 }}
      >
        <RecordedVoiceOrb level={level} motion={motion} />
      </div>
      {caption && <TemplateCaption text={caption} />}
    </AbsoluteFill>
  );
}

/** Always available when the pre-rendered approved animated logo cannot be supplied. */
export function TemplateLogoCloser() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background: BRAND_COLORS.paper,
        color: BRAND_COLORS.espresso,
        alignItems: "center",
        justifyContent: "center",
        gap: 44,
      }}
    >
      <div
        style={{
          width: 720,
          opacity: interpolate(frame, [0, 22], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: `0 ${interpolate(frame, [0, 28], [18, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px`,
          scale: interpolate(frame, [0, 32], [0.98, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <BrandArtwork
          style={{ width: "100%", height: "auto", display: "block" }}
        />
      </div>
      <div
        style={{
          fontFamily: FONT,
          fontSize: 42,
          color: BRAND_COLORS.espresso,
          opacity: interpolate(frame, [18, 36], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Stories woven together.
      </div>
    </AbsoluteFill>
  );
}
