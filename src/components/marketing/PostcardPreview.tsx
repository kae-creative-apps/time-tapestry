"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { QrCode, RotateCcw } from "lucide-react";
import { BrandArtwork } from "@/components/BrandArtwork";

// Adapted interaction from React Bits Flip Card: an explicit, accessible turn.
// https://reactbits.dev/micro/flip-card
export function PostcardPreview() {
  const [back, setBack] = useState(false);
  // Keep server and first-client markup identical, then honor the preference.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return (
    <figure className="w-full max-w-[460px]">
      <div className="relative aspect-[3/2] min-h-[220px] w-full [perspective:1200px] sm:min-h-0">
        <motion.div
          animate={{ rotateY: back && !reduceMotion ? 180 : 0 }}
          transition={{
            duration: reduceMotion ? 0 : 0.65,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="relative h-full w-full [transform-style:preserve-3d]"
        >
          <div
            aria-hidden={back}
            inert={back}
            className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden rounded-[4px] border border-white/70 bg-paper px-6 py-5 text-espresso shadow-[0_20px_50px_#432e2325] [backface-visibility:hidden]"
            style={reduceMotion && back ? { visibility: "hidden" } : undefined}
          >
            <div
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(ellipse_at_bottom_left,#c18f7b66,transparent_65%),radial-gradient(ellipse_at_bottom_right,#93948055,transparent_70%)]"
            />
            <BrandArtwork variant="mark" className="relative h-[22%] w-auto" />
            <BrandArtwork
              variant="wordmark"
              className="relative mt-4 w-[47%]"
            />
            <p className="relative mt-4 text-[clamp(11px,1.3vw,15px)]">
              What you gave lives on.
            </p>
          </div>
          <div
            aria-hidden={!back}
            inert={!back}
            className="absolute inset-0 grid grid-cols-[1.2fr_1fr] gap-4 rounded-[4px] border border-warmgray-200 bg-paper p-5 text-espresso shadow-[0_20px_50px_#432e2325] [backface-visibility:hidden] sm:gap-6 sm:p-7"
            style={{
              transform: reduceMotion ? undefined : "rotateY(180deg)",
              visibility: reduceMotion && !back ? "hidden" : undefined,
            }}
          >
            <div className="flex flex-col items-start">
              <BrandArtwork variant="mark" className="mb-4 h-7 w-7" />
              <p className="font-display text-base font-semibold sm:text-xl">
                A story for you.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-ink-500 sm:text-sm">
                A note from your loved one, with Scripture or encouragement they
                chose.
              </p>
            </div>
            <div className="flex flex-col justify-between border-l border-warmgray-300 pl-4 sm:pl-6">
              <span
                className="ml-auto h-9 w-7 border border-warmgray-300"
                aria-hidden="true"
              />
              <div>
                <QrCode aria-hidden="true" size={36} strokeWidth={1.2} />
                <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
                  Your family’s QR code goes here.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
      <figcaption className="mt-7 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-ink-500">
          Illustrative postcard · {back ? "Back" : "Front"}
        </span>
        <button
          type="button"
          aria-pressed={back}
          onClick={() => setBack((value) => !value)}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-espresso/25 bg-paper/70 px-4 text-sm font-medium transition-colors hover:bg-white"
        >
          <RotateCcw size={16} aria-hidden="true" />
          {back ? "See the front" : "Turn it over"}
        </button>
      </figcaption>
    </figure>
  );
}
