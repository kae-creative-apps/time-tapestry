"use client";

import { useEffect, useRef, useState } from "react";
import { InterviewPresence } from "@/components/collection/InterviewPresence";
import { SiriOrb } from "@/components/ui/siri-orb";
import {
  startConnectionCue,
  type ConnectionCue,
} from "@/lib/collection/connection-cue";

const states = [
  {
    state: "connecting",
    title: "Connecting",
    description: "A little movement as the conversation begins.",
  },
  {
    state: "listening",
    title: "Listening",
    description: "A slower motion while you tell your story.",
  },
  {
    state: "speaking",
    title: "Speaking",
    description: "Gentle movement while a question is spoken.",
  },
] as const;

export function MotionPreview() {
  const cueRef = useRef<ConnectionCue | null>(null);
  const mounted = useRef(true);
  const [playing, setPlaying] = useState(false);
  const [previewed, setPreviewed] = useState(false);

  useEffect(() => {
    mounted.current = true;
    const stop = () => cueRef.current?.dispose();
    window.addEventListener("pagehide", stop);
    return () => {
      mounted.current = false;
      stop();
      window.removeEventListener("pagehide", stop);
    };
  }, []);

  function previewSound() {
    if (cueRef.current) return;
    setPlaying(true);
    setPreviewed(false);
    const cue = startConnectionCue();
    cueRef.current = cue;
    void cue.finished.then(() => {
      if (cueRef.current === cue) cueRef.current = null;
      if (mounted.current) {
        setPlaying(false);
        setPreviewed(true);
      }
    });
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-base text-ink-500">
        <span className="rounded-full bg-sage-100 px-4 py-1.5 font-medium text-ink-600">
          Simulated states
        </span>
        <p>
          This preview does not connect an interview or use your microphone.
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.2fr]">
        <section
          aria-labelledby="orb-specimen-title"
          className="flex flex-col items-center justify-center rounded-2xl border border-warmgray-200 bg-white px-6 py-8 text-center sm:px-8"
        >
          <SiriOrb size={192} />
          <h2 id="orb-specimen-title" className="mt-7 text-2xl font-medium">
            The brand orb
          </h2>
          <p className="mt-2 text-base leading-7 text-ink-500">
            Clay, sage and taupe, moving together.
          </p>
          <div aria-hidden="true" className="mt-5 flex gap-2">
            <span className="h-3 w-3 rounded-full bg-clay" />
            <span className="h-3 w-3 rounded-full bg-sage" />
            <span className="h-3 w-3 rounded-full bg-taupe" />
          </div>
        </section>
        <section
          aria-label="Simulated interview presence states"
          className="brand-gradient-chocolate rounded-2xl px-5 py-3 text-white sm:px-8"
        >
          {states.map(({ state, title, description }) => (
            <div
              key={state}
              className="flex min-h-32 items-center gap-4 border-b border-white/15 py-6 last:border-0 sm:gap-6"
            >
              <div className="flex w-[88px] shrink-0 items-center justify-center">
                <InterviewPresence state={state} compact />
              </div>
              <div>
                <h2 className="text-xl font-medium text-white">{title}</h2>
                <p className="mt-2 text-base leading-7 text-paper">
                  {description}
                </p>
              </div>
            </div>
          ))}
        </section>
      </div>
      <section
        aria-labelledby="connection-sound-title"
        className="mt-5 flex flex-col justify-between gap-5 rounded-2xl border border-warmgray-200 bg-white p-6 sm:flex-row sm:items-center sm:p-8"
      >
        <div className="max-w-xl">
          <h2 id="connection-sound-title" className="text-2xl font-medium">
            A soft beginning
          </h2>
          <p className="mt-2 text-base leading-7 text-ink-500">
            Two short notes mark the start. In the interview, they finish before
            the microphone begins recording.
          </p>
        </div>
        <div className="shrink-0">
          <button
            type="button"
            className="brand-button-primary w-full sm:w-auto"
            disabled={playing}
            onClick={previewSound}
          >
            {playing ? "Previewing sound…" : "Preview connection sound"}
          </button>
          <p role="status" className="mt-2 min-h-6 text-sm text-ink-500">
            {previewed
              ? "Preview finished."
              : "Sound plays when you press Preview."}
          </p>
        </div>
      </section>
    </>
  );
}
