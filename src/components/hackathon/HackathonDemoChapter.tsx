"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { PostcardPreview } from "@/components/postcard/PostcardPreview";
import {
  HACKATHON_DEMO_STORYTELLER as GIGI,
  spokenText,
  type HackathonDemoChapter as DemoChapter,
} from "@/data/hackathon-demo";
import type { HackathonDemoFilm } from "@/data/hackathon-demo-films";

const SPEAKER = { gigi: "Gigi", interviewer: "Interviewer" } as const;

export function HackathonDemoChapter({
  chapter,
  film,
  postcard,
}: {
  chapter: DemoChapter;
  film: HackathonDemoFilm | null;
  postcard: { front: string; back: string };
}) {
  const [reply, setReply] = useState("");
  const [saved, setSaved] = useState("");
  return (
    <main className="mx-auto max-w-5xl px-5 pb-16 pt-5 text-espresso sm:px-8 sm:pt-8">
      <header className="mb-8 border-b border-warmgray-200 pb-5">
        <Logo />
      </header>
      <article aria-label={chapter.title}>
        <p className="brand-eyebrow text-taupe-600">
          Chapter {chapter.number} · {chapter.theme}
        </p>
        <h1 className="mt-4 max-w-3xl font-display text-4xl font-medium leading-tight sm:text-5xl">
          {chapter.title}
        </h1>
        <p className="mt-3 text-lg text-ink-500">
          From {GIGI.firstName}, for {GIGI.recipient}.
        </p>
        <p className="mt-1 text-sm text-ink-500">
          {GIGI.fullName}, {GIGI.age}, {GIGI.hometown}. Recorded for{" "}
          {GIGI.recipient}, {GIGI.recipientDescription}.
        </p>

        <div className="mt-8 grid items-start gap-7 lg:grid-cols-[1.1fr_.9fr]">
          <section className="overflow-hidden rounded-2xl border border-warmgray-200 bg-white">
            <h2 className="px-5 pb-1 pt-5 text-2xl font-semibold">
              Gigi’s interview
            </h2>
            <p className="px-5 pb-4 text-sm text-ink-500">
              Audio interview
              {film ? ` · ${Math.round(film.seconds)} seconds` : ""}
            </p>
            {film ? (
              <video
                controls
                playsInline
                preload="metadata"
                poster={film.poster}
                src={film.src}
                aria-label={`Gigi’s audio interview for ${chapter.title}, with captions`}
                className="aspect-video w-full bg-paper-100"
              />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center bg-paper-100 px-6 text-center text-ink-500">
                Gigi’s film for this chapter is still being prepared.
              </div>
            )}
            <p className="px-5 pt-3 text-xs leading-5 text-ink-500">
              Illustrative example. Gigi and Sammie are a sample family, and
              both voices are generated with AI.
            </p>
            <p className="px-5 pb-2 pt-5 text-sm font-medium uppercase tracking-[0.14em] text-taupe-600">
              Transcript excerpt
            </p>
            <blockquote className="px-5 text-base leading-8">
              “{chapter.transcript}”
            </blockquote>
            <details className="group mx-5 mb-5 mt-5 rounded-xl bg-paper-100 p-4">
              <summary className="cursor-pointer text-base font-medium">
                Read the full conversation
              </summary>
              <dl className="mt-4 space-y-4">
                {chapter.conversation.map((line, index) => (
                  <div key={index}>
                    <dt className="text-sm font-medium uppercase tracking-[0.12em] text-taupe-600">
                      {SPEAKER[line.speaker]}
                    </dt>
                    <dd
                      className={`mt-1 text-base leading-8 ${line.speaker === "interviewer" ? "italic text-ink-500" : ""}`}
                    >
                      {spokenText(line.text)}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          </section>

          <section className="rounded-2xl border border-warmgray-200 bg-white p-5 sm:p-6">
            <p className="brand-eyebrow text-taupe-600">
              Postcard {chapter.postcard.number} of 4 · mailed on day{" "}
              {chapter.postcard.sentOnDay}
            </p>
            <p className="mt-3 font-display text-2xl leading-9">
              “{chapter.postcard.message}”
            </p>
            <div className="mt-5">
              <PostcardPreview
                front={postcard.front}
                back={postcard.back}
                title={`Postcard ${chapter.postcard.number}`}
              />
            </div>
          </section>
        </div>

        <section className="mt-8 rounded-2xl border border-warmgray-200 bg-white p-6 sm:p-8">
          <p className="brand-eyebrow text-taupe-600">In Gigi’s voice</p>
          <div className="mt-5 max-w-3xl whitespace-pre-wrap text-[18px] leading-9">
            {chapter.story}
          </div>
          <blockquote className="mt-7 max-w-3xl border-l-4 border-clay-300 pl-5 font-display text-2xl leading-9">
            “{chapter.pullQuote}”
          </blockquote>
          <aside className="mt-7 max-w-3xl rounded-2xl bg-clay-50 p-5">
            <p className="brand-eyebrow text-taupe-600">Scripture</p>
            <blockquote className="mt-4 text-lg leading-8">
              “{chapter.scripture.text}”
            </blockquote>
            <p className="mt-3 text-sm text-ink-500">
              {chapter.scripture.reference} ({chapter.scripture.translation})
            </p>
          </aside>
        </section>

        <section className="mt-8 rounded-2xl border border-warmgray-200 bg-white p-6 sm:p-8">
          <h2 className="font-display text-3xl font-medium">
            {chapter.momentsTitle}
          </h2>
          <ol
            className={`mt-5 grid gap-4 sm:grid-cols-2 ${chapter.moments.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}
          >
            {chapter.moments.map((moment, index) => (
              <li
                key={moment.title}
                className="rounded-2xl bg-paper-100 p-5 text-base leading-7"
              >
                <p className="text-sm text-taupe-600">{index + 1}</p>
                <p className="mt-1 font-semibold">{moment.title}</p>
                <p className="mt-2">{moment.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-8 rounded-2xl border border-warmgray-200 bg-white p-6 sm:p-8">
          <h2 className="text-2xl font-semibold">Reply to Gigi</h2>
          <p className="mt-3 max-w-2xl text-base leading-7 text-ink-500">
            This demo reply stays on this page. It is not sent, saved, or
            mailed.
          </p>
          <form
            className="mt-5"
            onSubmit={(event) => {
              event.preventDefault();
              const text = reply.trim();
              if (!text) return;
              setSaved(text);
              setReply("");
            }}
          >
            <label className="block text-lg font-medium" htmlFor="demo-reply">
              {chapter.replyPrompt}
            </label>
            <textarea
              id="demo-reply"
              rows={4}
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              className="mt-2 w-full rounded-xl border border-warmgray-300 bg-white p-3 text-base leading-7"
              placeholder="Write a note to Gigi."
            />
            <button
              type="submit"
              className="brand-button-primary mt-4 inline-flex min-h-12 items-center justify-center px-5 py-3"
            >
              Save demo reply
            </button>
          </form>
          {saved && (
            <p
              role="status"
              className="mt-5 whitespace-pre-wrap text-base leading-8"
            >
              {saved}
            </p>
          )}
        </section>

        <section className="mt-8 rounded-2xl bg-espresso p-6 text-paper sm:p-8">
          {chapter.next ? (
            <>
              <p className="text-sm font-medium uppercase tracking-[0.14em] text-paper">
                Next chapter
              </p>
              <Link
                href={chapter.next.href}
                className="mt-3 inline-flex font-display text-3xl font-medium underline decoration-white/40 underline-offset-4"
              >
                {chapter.next.label}
              </Link>
              <p className="mt-2 text-base text-paper">{chapter.next.teaser}</p>
            </>
          ) : (
            <>
              <h2 className="font-display text-3xl font-medium">
                You’ve opened every chapter.
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-8 text-paper">
                Return to the whole collection anytime.
              </p>
              <Link
                href="/hackathon-demo-1"
                className="mt-5 inline-flex font-display text-2xl font-medium underline decoration-white/40 underline-offset-4"
              >
                Start again with Kindness received
              </Link>
            </>
          )}
        </section>
      </article>
    </main>
  );
}
