"use client";

import { useEffect, useRef, useState } from "react";
import { POSTCARD_LAYOUT } from "@/lib/collection/postcard-design";

/** Shows the actual print HTML. Only the marketing view crops the print bleed. */
export function PostcardFace({
  html,
  title,
  onFit,
  trim = false,
}: {
  html: string;
  title: string;
  onFit?: (fits: boolean) => void;
  trim?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const inset = trim ? POSTCARD_LAYOUT.bleed : 0;
  const width = POSTCARD_LAYOUT.width - inset * 2;
  const height = POSTCARD_LAYOUT.height - inset * 2;
  useEffect(() => {
    const resize = new ResizeObserver(([entry]) =>
      setScale(entry.contentRect.width / width),
    );
    if (container.current) resize.observe(container.current);
    return () => resize.disconnect();
  }, [width]);

  return (
    <div
      ref={container}
      className="relative w-full overflow-hidden border border-warmgray-300 bg-white"
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <iframe
        title={title}
        sandbox="allow-same-origin"
        referrerPolicy="no-referrer"
        srcDoc={html}
        tabIndex={-1}
        scrolling="no"
        className="absolute border-0"
        style={{
          left: -inset * scale,
          top: -inset * scale,
          width: POSTCARD_LAYOUT.width,
          height: POSTCARD_LAYOUT.height,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
        onLoad={async (event) => {
          if (!onFit) return;
          const doc = event.currentTarget.contentDocument;
          if (!doc) return onFit(false);
          await doc.fonts.ready;
          const fitsRegions = [
            ...doc.querySelectorAll<HTMLElement>("[data-print-bottom]"),
          ].every(
            (element) =>
              element.getBoundingClientRect().bottom <=
              Number(element.dataset.printBottom) + 1,
          );
          onFit(
            Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight) <=
              POSTCARD_LAYOUT.height + 2 && fitsRegions,
          );
        }}
      />
    </div>
  );
}
