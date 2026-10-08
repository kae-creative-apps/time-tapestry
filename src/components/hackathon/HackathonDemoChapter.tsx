"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import type { HackathonDemoChapter as DemoChapter } from "@/data/hackathon-demo";

const BLACK_POSTER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=";

export function HackathonDemoChapter({ chapter }: { chapter: DemoChapter }) {
  const [reply, setReply] = useState("");
  const [saved, setSaved] = useState("");
  return (
    <main className="mx-auto max-w-5xl px-5 pb-16 pt-5 text-espresso sm:px-8 sm:pt-8">
      <header className="mb-8 border-b border-warmgray-200 pb-5">
        <Logo />
      </header>
      <article aria-label={chapter.title}>
        <p className="brand-eyebrow text-taupe-600">
          Chapter {chapter.number} · Gigi’s generosity, for Sammie
        </p>
        <h1 className="mt-4 max-w-3xl font-display text-4xl font-medium leading-tight sm:text-5xl">
          {chapter.title}
        </h1>
        <p className="mt-3 text-lg text-ink-500">
          From Gigi, a donor, for her granddaughter Sammie.
        </p>
        <div className="mt-8 grid items-start gap-7 lg:grid-cols-[1.1fr_.9fr]">
          <div className="overflow-hidden rounded-2xl border border-warmgray-200 bg-white">
            <h2 className="px-5 pb-4 pt-5 text-2xl font-semibold">
              Clip of Gigi
            </h2>
            <video
              muted
              playsInline
              poster={BLACK_POSTER}
              aria-label="Empty video placeholder. Gigi’s recording is not attached to this demo."
              className="aspect-video w-full bg-black"
            />
            <p className="px-5 pb-2 pt-5 text-sm font-medium uppercase tracking-[0.14em] text-taupe-600">
              Transcript excerpt
            </p>
            <p className="px-5 pb-5 text-base leading-8">
              {chapter.transcript}
            </p>
          </div>
          <div className="rounded-2xl border border-warmgray-200 bg-white p-6 sm:p-8">
            <p className="brand-eyebrow text-taupe-600">In Gigi’s voice</p>
            <div className="mt-5 whitespace-pre-wrap text-[18px] leading-9">
              {chapter.story}
            </div>
            <blockquote className="mt-7 border-l-4 border-clay-300 pl-5 font-display text-2xl leading-9">
              {chapter.pullQuote}
            </blockquote>
            <aside className="mt-7 rounded-2xl bg-clay-50 p-5">
              <p className="brand-eyebrow text-taupe-600">Scripture</p>
              <blockquote className="mt-4 text-lg leading-8">
                {chapter.scripture.text}
              </blockquote>
              <p className="mt-3 text-sm text-ink-500">
                {chapter.scripture.reference} {chapter.scripture.translation}
              </p>
            </aside>
          </div>
        </div>
        <section className="mt-8 rounded-2xl border border-warmgray-200 bg-white p-6 sm:p-8">
          <h2 className="font-display text-3xl font-medium">
            {chapter.momentsTitle}
          </h2>
          <ol className="mt-5 grid gap-4 sm:grid-cols-3">
            {chapter.moments.map((moment) => (
              <li
                key={moment}
                className="rounded-2xl bg-paper-100 p-5 text-base leading-8"
              >
                {moment}
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
            <label className="block text-base font-medium" htmlFor="demo-reply">
              A reply to Gigi
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
                Continue
              </p>
              <Link
                href={chapter.next.href}
                className="mt-3 inline-flex font-display text-3xl font-medium underline decoration-white/40 underline-offset-4"
              >
                {chapter.next.label}
              </Link>
            </>
          ) : (
            <>
              <h2 className="font-display text-3xl font-medium">
                This is the last chapter.
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-8 text-paper">
                Sammie can return to Gigi’s four stories from the beginning.
              </p>
              <Link
                href="/hackathon-demo-1"
                className="mt-5 inline-flex font-display text-2xl font-medium underline decoration-white/40 underline-offset-4"
              >
                Return to the collection
              </Link>
            </>
          )}
        </section>
      </article>
    </main>
  );
}
