"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { inferPostcardFormat } from "@/lib/collection/postcard-format";

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
  const format = useMemo(() => inferPostcardFormat(html), [html]);
  const inset = trim ? format.bleed : 0;
  const width = format.width - inset * 2;
  const height = format.height - inset * 2;
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
          width: format.width,
          height: format.height,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
        onLoad={async (event) => {
          if (!onFit) return;
          const doc = event.currentTarget.contentDocument;
          if (!doc) return onFit(false);
          try {
            // The branded front can contain only images. Request its embedded
            // face explicitly so a valid unused font still passes validation.
            await doc.fonts.load("500 16px Quicksand");
            await doc.fonts.ready;
          } catch {
            return onFit(false);
          }
          const fontLoaded = [...doc.fonts].some(
            (font) => font.family === "Quicksand" && font.status === "loaded",
          );
          const fitsRegions = [
            ...doc.querySelectorAll<HTMLElement>("[data-print-bottom]"),
          ].every(
            (element) =>
              element.getBoundingClientRect().bottom <=
              Number(element.dataset.printBottom) + 1,
          );
          onFit(
            fontLoaded &&
              Math.max(doc.documentElement.scrollWidth, doc.body.scrollWidth) <=
                format.width + 2 &&
              Math.max(
                doc.documentElement.scrollHeight,
                doc.body.scrollHeight,
              ) <=
                format.height + 2 &&
              fitsRegions,
          );
        }}
      />
    </div>
  );
}
