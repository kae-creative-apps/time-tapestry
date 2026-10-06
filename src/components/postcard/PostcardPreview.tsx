"use client";

import { useEffect, useId, useState } from "react";
import { PostcardFace } from "@/components/collection/PostcardFace";

/** Flip the same frozen HTML used for printing. No parallel layout or decorative postal overlay. */
export function PostcardPreview({
  front,
  back,
  title,
  onFrontFit,
  onBackFit,
}: {
  front: string;
  back: string;
  title: string;
  onFrontFit?: (fits: boolean) => void;
  onBackFit?: (fits: boolean) => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const [seenBack, setSeenBack] = useState(false);
  const [frontFit, setFrontFit] = useState<boolean | null>(null);
  const [backFit, setBackFit] = useState<boolean | null>(null);
  const id = useId();
  useEffect(() => {
    if (frontFit !== null) onFrontFit?.(frontFit);
  }, [frontFit, onFrontFit]);
  useEffect(() => {
    if (backFit !== null && seenBack) onBackFit?.(backFit);
  }, [backFit, seenBack, onBackFit]);
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p id={`${id}-label`} className="font-medium">
          {title}: {flipped ? "back" : "front"}
        </p>
        <button
          type="button"
          aria-controls={id}
          aria-pressed={flipped}
          className="brand-button-secondary min-h-12 px-5 py-3"
          onClick={() => {
            setSeenBack(true);
            setFlipped((value) => !value);
          }}
        >
          {flipped ? "Show front" : "Turn card over"}
        </button>
      </div>
      <div
        id={id}
        aria-labelledby={`${id}-label`}
        className="[perspective:1600px]"
      >
        <div
          className="relative grid transition-transform duration-300 ease-in-out [transform-style:preserve-3d] motion-reduce:transition-none"
          style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
        >
          <div
            className="col-start-1 row-start-1 [backface-visibility:hidden]"
            aria-hidden={flipped}
          >
            <PostcardFace
              html={front}
              title={`${title} front`}
              onFit={setFrontFit}
            />
          </div>
          <div
            className="col-start-1 row-start-1 [backface-visibility:hidden] [transform:rotateY(180deg)]"
            aria-hidden={!flipped}
          >
            <PostcardFace
              html={back}
              title={`${title} back`}
              onFit={setBackFit}
            />
          </div>
        </div>
      </div>
      <p role="status" className="sr-only">
        Showing the {flipped ? "back" : "front"} of {title}.
      </p>
    </div>
  );
}
