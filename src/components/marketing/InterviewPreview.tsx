"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SiriOrb } from "@/components/ui/siri-orb";
import { AppIcon } from "@/components/icons";
import { Logo } from "@/components/Logo";
import { ThreadBorder, threadBorderClassName } from "@/components/brand/ThreadBorder";

const questions = [
  {
    text: "Tell me about someone whose kindness has stayed with you.",
    note: "You can begin with one person or one small moment.",
  },
  {
    text: "Can you tell me about a time your faith shaped a choice you made?",
    note: "There is no perfect answer. Tell it in your own words.",
  },
  {
    text: "When you think about the time or money you gave to others, is there a story you would like someone you love to know?",
    note: "The meaning behind your generosity matters. Sharing an amount is your choice.",
  },
];

/** A cached voice sample, never an anonymous paid call or microphone session. */
export function InterviewPreview() {
  const dialog = useRef<HTMLDialogElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [heard, setHeard] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  useEffect(
    () => () => {
      audio.current?.pause();
    },
    [],
  );
  function stop() {
    audio.current?.pause();
    setPlaying(false);
    setLoading(false);
  }
  function close() {
    stop();
    dialog.current?.close();
    setOpen(false);
    trigger.current?.focus();
  }
  async function play() {
    const player = audio.current;
    if (!player) return;
    if (playing) {
      player.pause();
      setPlaying(false);
      return;
    }
    setError("");
    setLoading(true);
    try {
      if (heard) player.currentTime = 0;
      await player.play();
      setPlaying(true);
      setHeard(true);
    } catch {
      setError(
        "The sound could not play. You can read the question above or try again.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
        }}
        className={`${threadBorderClassName} inline-flex min-h-14 items-center justify-center gap-4 rounded-full border border-white/50 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4`}
      >
        <ThreadBorder />
        Preview the interview <AppIcon name="play" size={20} />
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="interview-preview-title"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={(e) => {
          if (e.target === dialog.current) close();
        }}
        className="interview-preview-dialog w-[calc(100%_-_24px)] max-w-[780px] rounded-[28px] border border-warmgray-200 bg-paper p-0 text-espresso shadow-2xl backdrop:bg-espresso/45 backdrop:backdrop-blur-sm"
      >
        <div className="p-5 sm:p-6">
          <div className="sticky top-0 z-10 -mx-1 flex items-center justify-between gap-4 bg-paper px-1 pb-3 pt-1">
            <Logo className="[&_svg]:h-9" />
            <button
              autoFocus
              type="button"
              onClick={close}
              className="min-h-12 rounded-full border border-warmgray-200 bg-white px-5 text-base font-medium"
            >
              Close
            </button>
          </div>
          <div className="mx-auto mt-3 max-w-xl text-center">
            <p className="text-sm font-medium text-ink-600">
              A conversation for someone you love
            </p>
            <h2
              id="interview-preview-title"
              className="mt-2 text-2xl sm:text-3xl"
            >
              Meet your interviewer.
            </h2>
            <p className="mt-3 text-base leading-7 text-ink-600">
              A sample of her voice. Your microphone stays off, and nothing is
              recorded.
            </p>
            <div className="my-4 flex justify-center" aria-hidden="true">
              <SiriOrb size={144} animationDuration={10} />
            </div>
            <div className="min-h-7 text-base text-ink-600" role="status">
              {loading
                ? "Loading the voice sample…"
                : playing
                  ? "Your interviewer is speaking"
                  : heard
                    ? "Take your time."
                    : "Ready when you are."}
            </div>
            <p className="mt-4 text-sm text-ink-600">
              Sample question {index + 1} of {questions.length}
            </p>
            <p aria-live="polite" className="mt-2 min-h-[100px] font-display text-2xl font-semibold leading-snug sm:min-h-[96px] sm:text-3xl">
              {questions[index].text}
            </p>
            <p className="mt-2 min-h-12 text-base leading-7 text-ink-600">
              {questions[index].note}
            </p>
            <audio
              ref={audio}
              src={`/brand/interview-preview-v2-${index + 1}.mp3`}
              preload={open ? "metadata" : "none"}
              onEnded={() => setPlaying(false)}
              onPause={() => setPlaying(false)}
              onError={() => {
                if (open) {
                  setLoading(false);
                  setPlaying(false);
                  setError(
                    "The sample is unavailable. The question is here for you to read.",
                  );
                }
              }}
            />
            <div className="mt-4 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => void play()}
                disabled={loading}
                className="inline-flex min-h-14 items-center justify-center gap-3 rounded-full bg-espresso px-6 py-3 text-lg font-medium text-white disabled:opacity-60"
              >
                <AppIcon name={playing ? "pause" : "play"} size={21} />
                {playing
                  ? "Pause the sample"
                  : heard
                    ? "Listen again"
                    : "Hear the interviewer"}
              </button>
              <button
                type="button"
                onClick={() => {
                  stop();
                  setIndex((index + 1) % questions.length);
                  setHeard(false);
                  setError("");
                }}
                className="min-h-14 rounded-full border border-warmgray-300 bg-white px-6 py-3 text-base font-medium"
              >
                {index === questions.length - 1
                  ? "First question"
                  : "Next question"}
              </button>
            </div>
            {error && (
              <p role="alert" className="mt-4 text-base text-oxblood">
                {error}
              </p>
            )}
          </div>
          <div className="mt-5 border-t border-warmgray-200 pt-4 text-center">
            <p className="text-base leading-7 text-ink-600">
              In your interview, she listens and asks about your memories. You
              can pause and come back.
            </p>
            <Link
              href="/share"
              onClick={close}
              className="mt-2 inline-flex min-h-12 items-center gap-3 rounded-full px-5 text-base font-medium underline underline-offset-4"
            >
              Start my own story <AppIcon name="arrowRight" size={20} />
            </Link>
          </div>
        </div>
      </dialog>
    </>
  );
}
