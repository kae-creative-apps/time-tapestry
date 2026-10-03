"use client";

import { useEffect, useState } from "react";
import { collectionRequest } from "@/lib/collection/client-request";

export type SamplePostcardArtwork = {
  front: string;
  back: string;
  fronts: string[];
};

export function usePostcardSample() {
  const [artwork, setArtwork] = useState<SamplePostcardArtwork | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setFailed(false);
    collectionRequest<unknown>(
      "/api/postcards/sample",
      {
        signal: abort.signal,
        cache: "force-cache",
      },
      15000,
    )
      .then((sample) => {
        if (
          !sample ||
          typeof sample !== "object" ||
          !("front" in sample) ||
          typeof sample.front !== "string" ||
          !("back" in sample) ||
          typeof sample.back !== "string" ||
          !("fronts" in sample) ||
          !Array.isArray(sample.fronts) ||
          sample.fronts.length !== 4 ||
          !sample.fronts.every((front) => typeof front === "string")
        )
          throw new Error("Sample unavailable");
        setArtwork({
          front: sample.front,
          back: sample.back,
          fronts: sample.fronts,
        });
      })
      .catch(() => {
        if (!abort.signal.aborted) setFailed(true);
      });
    return () => abort.abort();
  }, [retry]);
  return { artwork, failed, retry: () => setRetry((value) => value + 1) };
}
