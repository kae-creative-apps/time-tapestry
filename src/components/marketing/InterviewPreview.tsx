"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SiriOrb } from "@/components/ui/siri-orb";
import { AppIcon } from "@/components/icons";
import { Logo } from "@/components/Logo";
import { ThreadBorder, threadBorderClassName } from "@/components/brand/ThreadBorder";

const questions = [
  {
    text: "What made you become so generous?",
    note: "Donors can begin with one person who showed them what giving looks like.",
  },
  {
    text: "Why did you fall in love with these ministries you give to?",
    note: "The people and stories there are the heart of the conversation.",
  },
  {
    text: "Why was it worth it to you?",
    note: "The question is about meaning, joy, and what they hope their family carries. It never asks what they gave.",
  },
];

/** Readable sample questions. This preview does not record or play a microphone. */
export function InterviewPreview() {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  function close() {
    dialog.current?.close();
    setOpen(false);
    trigger.current?.focus();
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
        Preview the questions <AppIcon name="arrowUpRight" size={20} />
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
              A conversation for a donor’s family
            </p>
            <h2
              id="interview-preview-title"
              className="mt-2 text-2xl sm:text-3xl"
            >
              Questions about a generous life.
            </h2>
            <p className="mt-3 text-base leading-7 text-ink-600">
              Read a sample of what your donors are asked. Nothing is recorded
              on this page, and the questions never ask about gift size.
            </p>
            <div className="my-4 flex justify-center" aria-hidden="true">
              <SiriOrb size={144} animationDuration={10} />
            </div>
            <div className="min-h-7 text-base text-ink-600" role="status">
              Sample questions for your donors.
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
            <div className="mt-4 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setIndex((index + 1) % questions.length)}
                className="min-h-14 rounded-full bg-espresso px-6 py-3 text-base font-medium text-white"
              >
                {index === questions.length - 1
                  ? "First question"
                  : "Next question"}
              </button>
            </div>
          </div>
          <div className="mt-5 border-t border-warmgray-200 pt-4 text-center">
            <p className="text-base leading-7 text-ink-600">
              Donors answer in their own words and can pause whenever they need.
            </p>
            <Link
              href="/for-organizations"
              onClick={close}
              className="mt-2 inline-flex min-h-12 items-center gap-3 rounded-full px-5 text-base font-medium underline underline-offset-4"
            >
              Bring this to your donors <AppIcon name="arrowRight" size={20} />
            </Link>
          </div>
        </div>
      </dialog>
    </>
  );
}
