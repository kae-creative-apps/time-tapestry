"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { PostcardFace } from "@/components/collection/PostcardFace";

import { usePostcardSample } from "./usePostcardSample";

/** The sample and mailed postcard use the same renderer, assets and dimensions. */
export function PostcardPreview({
  layout = "turn",
}: {
  layout?: "turn" | "both";
}) {
  const [back, setBack] = useState(false);
  const { artwork, failed, retry } = usePostcardSample();

  return (
    <figure className="w-full max-w-[460px]">
      {artwork ? (
        layout === "both" ? (
          <div className="space-y-5">
            {(["front", "back"] as const).map((face) => (
              <div key={face}>
                <p className="mb-2 text-xs font-medium capitalize text-ink-500">
                  {face}
                </p>
                <div className="overflow-hidden rounded-[3px] shadow-[0_10px_28px_#432e2314]">
                  <PostcardFace
                    html={artwork[face]}
                    title={`Sample postcard ${face}, from Evelyn to Anna`}
                    trim
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-[3px] shadow-[0_20px_50px_#432e2325]">
            <PostcardFace
              html={back ? artwork.back : artwork.front}
              title={`Sample postcard ${back ? "back" : "front"}, from Evelyn to Anna`}
              trim
            />
          </div>
        )
      ) : (
        <div
          className="flex aspect-[3/2] items-center justify-center rounded-[3px] border border-warmgray-200 bg-paper p-6 text-center text-sm text-ink-500"
          role="status"
        >
          {failed ? (
            <div>
              <p>The postcard preview could not load.</p>
              <button
                type="button"
                onClick={retry}
                className="mt-3 min-h-11 rounded-md border border-warmgray-300 px-4 text-espresso"
              >
                Try again
              </button>
            </div>
          ) : (
            "Loading the postcard preview…"
          )}
        </div>
      )}
      <figcaption className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <span className="max-w-[250px] text-xs leading-relaxed text-ink-500">
          Sample postcard. Anna and Evelyn are illustrative names. The QR opens
          the demo.
        </span>
        {layout === "turn" && (
          <button
            type="button"
            aria-pressed={back}
            disabled={!artwork}
            onClick={() => setBack((value) => !value)}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-espresso/25 bg-paper/70 px-4 text-sm font-medium transition-colors hover:bg-white disabled:opacity-50"
          >
            <RotateCcw size={16} aria-hidden="true" />
            {back ? "See the front" : "See the back"}
          </button>
        )}
      </figcaption>
    </figure>
  );
}
