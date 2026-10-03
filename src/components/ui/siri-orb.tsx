"use client";

import type { CSSProperties } from "react";
import styles from "./siri-orb.module.css";

// Adapted from SmoothUI's Siri Orb by Edu Calvo, supplied by the user:
// https://21st.dev/@educalvolpz/components/siri-orb
export interface SiriOrbProps {
  animationDuration?: number;
  className?: string;
  colors?: {
    bg?: string;
    c1?: string;
    c2?: string;
    c3?: string;
  };
  /** Pixel sizes only, so the effect scales consistently with the rendered orb. */
  size?: number | `${number}px`;
}

export function SiriOrb({
  size = 192,
  className,
  colors,
  animationDuration = 20,
}: SiriOrbProps) {
  const parsedSize =
    typeof size === "number"
      ? size
      : /^(?:\d+\.?\d*|\.\d+)px$/.test(size)
        ? Number.parseFloat(size)
        : 192;
  const sizeValue =
    Number.isFinite(parsedSize) && parsedSize > 0 ? parsedSize : 192;
  const duration =
    Number.isFinite(animationDuration) && animationDuration > 0
      ? animationDuration
      : 20;
  const small = sizeValue < 50;
  const tiny = sizeValue < 30;
  const blurAmount = small
    ? Math.max(sizeValue * 0.008, 1)
    : Math.max(sizeValue * 0.015, 4);
  const contrastAmount = small
    ? Math.max(sizeValue * 0.004, 1.2)
    : Math.max(sizeValue * 0.008, 1.5);
  const dotSize = small
    ? Math.max(sizeValue * 0.004, 0.05)
    : Math.max(sizeValue * 0.008, 0.1);
  const shadowSpread = small
    ? Math.max(sizeValue * 0.004, 0.5)
    : Math.max(sizeValue * 0.008, 2);
  const maskRadius = tiny
    ? "0%"
    : small
      ? "5%"
      : sizeValue < 100
        ? "15%"
        : "25%";
  const finalContrast = tiny
    ? 1.1
    : small
      ? Math.max(contrastAmount * 1.2, 1.3)
      : contrastAmount;

  return (
    <span
      aria-hidden="true"
      data-mask={tiny ? "none" : "radial"}
      className={[styles.orb, className].filter(Boolean).join(" ")}
      style={
        {
          width: sizeValue,
          height: sizeValue,
          "--tt-orb-bg": colors?.bg ?? "#fbfaf8",
          "--tt-orb-c1": colors?.c1 ?? "#c18f7b",
          "--tt-orb-c2": colors?.c2 ?? "#939480",
          "--tt-orb-c3": colors?.c3 ?? "#756454",
          "--tt-orb-duration": `${duration}s`,
          "--tt-orb-blur": `${blurAmount}px`,
          "--tt-orb-contrast": finalContrast,
          "--tt-orb-dot-size": `${dotSize}px`,
          "--tt-orb-shadow": `${shadowSpread}px`,
          "--tt-orb-mask-radius": maskRadius,
        } as CSSProperties
      }
    />
  );
}

export const Component = SiriOrb;
export default SiriOrb;
