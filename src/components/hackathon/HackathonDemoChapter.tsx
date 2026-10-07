"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BrandLockup } from "@/components/Logo";
import { AppIcon } from "@/components/icons";
import { SiriOrb } from "@/components/ui/siri-orb";
import { PostcardPreview } from "@/components/postcard/PostcardPreview";
import {
  HACKATHON_DEMO_PARTNER_NOTE,
  HACKATHON_DEMO_STORYTELLER as GIGI,
  hackathonDemoChapters,
  spokenText,
  type HackathonDemoChapter as DemoChapter,
} from "@/data/hackathon-demo";
import type { HackathonDemoFilm } from "@/data/hackathon-demo-films";
import s from "./HackathonDemo.module.css";

const SPEAKER = { gigi: "Gigi", interviewer: "Interviewer" } as const;

const runtime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

/** Fade sections up as they scroll in. Content already on screen, and every
 * section before hydration or with reduced motion, is never hidden. */
function useReveal() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const items = [
      ...(root.current?.querySelectorAll<HTMLElement>("[data-reveal]") ?? []),
    ].filter((item) => item.getBoundingClientRect().top > window.innerHeight);
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add(s.revealed);
          observer.unobserve(entry.target);
        }),
      { rootMargin: "0px 0px -10% 0px" },
    );
    items.forEach((item) => {
      item.classList.add(s.reveal);
      observer.observe(item);
    });
    return () => observer.disconnect();
  }, []);
  return root;
}

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
  const root = useReveal();
  const cardNumber = String(chapter.number).padStart(2, "0");
  return (
    <div ref={root} className={s.page}>
      <p className={s.partnerBand}>
        <span className={s.partnerTag}>Demo</span>
        {HACKATHON_DEMO_PARTNER_NOTE}
      </p>

      <header className={s.header}>
        <Link href="/hackathon-demo-1" aria-label="Gigi's collection, chapter 1">
          <BrandLockup className="[&_svg]:h-11" />
        </Link>
        <nav aria-label="Gigi's four chapters" className={s.stepper}>
          {hackathonDemoChapters.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className={s.step}
              aria-current={item.number === chapter.number ? "page" : undefined}
            >
              <span className={s.stepNumber}>0{item.number}</span>
              <span className={s.stepLabel}>{item.theme}</span>
            </Link>
          ))}
        </nav>
      </header>

      <main>
        <section className={s.hero} aria-labelledby="chapter-title">
          <p className={`${s.eyebrow} ${s.enter}`}>
            Chapter {chapter.number} of 4 · {chapter.theme}
          </p>
          <h1 id="chapter-title" className={s.enter}>
            {chapter.title}
          </h1>
          <p className={`${s.heroQuestion} ${s.enter}`}>
            “{chapter.question}”
          </p>
          <p className={`${s.byline} ${s.enter}`}>
            From <strong>{GIGI.fullName}</strong>, {GIGI.age}, {GIGI.hometown}
            <br />
            {GIGI.description}. Recorded for {GIGI.recipient},{" "}
            {GIGI.recipientDescription}.
          </p>
        </section>

        <section className={s.showcase} aria-label="Gigi's interview">
          <div className={`${s.filmPanel} ${s.enter}`}>
            <div className={s.filmHead}>
              <SiriOrb size="28px" />
              <p>Gigi’s audio interview</p>
              {film && <span>{runtime(film.seconds)}</span>}
            </div>
            {film ? (
              <video
                controls
                playsInline
                preload="metadata"
                poster={film.poster}
                src={film.src}
                aria-label={`Gigi’s audio interview for ${chapter.title}, with captions`}
                className={s.video}
              />
            ) : (
              <div className={`${s.video} grid place-items-center text-ink-500`}>
                This chapter’s film is still being prepared.
              </div>
            )}
            <blockquote className={s.excerpt}>“{chapter.transcript}”</blockquote>
            <details className={s.conversation}>
              <summary>Read the full conversation</summary>
              <dl className={s.turns}>
                {chapter.conversation.map((line, index) => (
                  <div
                    key={index}
                    className={`${s.turn} ${line.speaker === "interviewer" ? s.turnInterviewer : ""}`}
                  >
                    <dt>{SPEAKER[line.speaker]}</dt>
                    <dd>{spokenText(line.text)}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </div>
          <div className={s.showcaseExtras}>
            <figure className={s.floatPostcard}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/brand/postcards/designer-2026-10-06-v2/postcard-${cardNumber}-${chapter.theme}-front.webp`}
                alt={`The ${chapter.theme} postcard Sammie receives.`}
                width={1500}
                height={1000}
              />
            </figure>
            <blockquote className={s.floatQuote}>
              “{chapter.pullQuote}”
              <cite>Gigi</cite>
            </blockquote>
          </div>
          <p className={s.disclosure}>
            Illustrative example. Gigi, Sammie and the ministries are fictional,
            and both voices are generated with AI.
          </p>
        </section>

        <section className={`${s.band} ${s.bandSand}`} aria-labelledby="postcard-title">
          <div className={`${s.inner} ${s.split}`} data-reveal>
            <div>
              <p className={s.eyebrow}>
                Postcard {chapter.postcard.number} of 4 · Mailed on day{" "}
                {chapter.postcard.sentOnDay}
              </p>
              <h2 id="postcard-title" className={s.sectionTitle}>
                “{chapter.postcard.message}”
              </h2>
              <p className={s.sectionNote}>
                Printed and mailed to {GIGI.recipient}. The QR code on the back
                opens this chapter, so Gigi’s voice is one scan away.
              </p>
            </div>
            <div className={s.postcardFrame}>
              <PostcardPreview
                front={postcard.front}
                back={postcard.back}
                title={`Postcard ${chapter.postcard.number}`}
              />
            </div>
          </div>
        </section>

        <section className={s.band} aria-labelledby="story-title">
          <div className={`${s.inner} ${s.story}`}>
            <div className={s.storyText} data-reveal>
              <h2 className={s.eyebrow} id="story-title">
                In Gigi’s voice
              </h2>
              {chapter.story.split("\n\n").map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <aside className={s.storyAside} data-reveal>
              <blockquote className={s.pullQuote}>“{chapter.pullQuote}”</blockquote>
              <div className={s.scripture}>
                <p className={s.eyebrow}>Scripture</p>
                <blockquote>“{chapter.scripture.text}”</blockquote>
                <p>
                  {chapter.scripture.reference} ({chapter.scripture.translation})
                </p>
              </div>
            </aside>
          </div>
        </section>

        <section className={`${s.band} ${s.bandSand}`} aria-labelledby="moments-title">
          <div className={s.inner}>
            <h2 id="moments-title" className={s.sectionTitle} data-reveal>
              {chapter.momentsTitle}
            </h2>
            <ol className={s.moments}>
              {chapter.moments.map((moment, index) => (
                <li
                  key={moment.title}
                  className={s.moment}
                  data-reveal
                  style={{ "--delay": `${index * 0.08}s` } as CSSProperties}
                >
                  <p className={s.momentNumber}>0{index + 1}</p>
                  <h3>{moment.title}</h3>
                  <p>{moment.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className={s.band} aria-labelledby="reply-title">
          <div className={s.reply} data-reveal>
            <p className={s.eyebrow}>Reply to Gigi</p>
            <h2 id="reply-title" className={s.sectionTitle}>
              {chapter.replyPrompt}
            </h2>
            <form
              className={s.replyForm}
              onSubmit={(event) => {
                event.preventDefault();
                const text = reply.trim();
                if (!text) return;
                setSaved(text);
                setReply("");
              }}
            >
              <label className="sr-only" htmlFor="demo-reply">
                {chapter.replyPrompt}
              </label>
              <textarea
                id="demo-reply"
                rows={4}
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                placeholder="Write a note to Gigi."
              />
              <div className={s.replyRow}>
                <p>This demo reply stays on this page. It is not sent or saved.</p>
                <button type="submit" className={s.primaryButton}>
                  Save demo reply
                </button>
              </div>
            </form>
            {saved && (
              <p role="status" className={s.saved}>
                {saved}
              </p>
            )}
          </div>
        </section>

        <section className={s.next} data-reveal>
          {chapter.next ? (
            <>
              <p className={s.eyebrow}>Next chapter</p>
              <h2>{chapter.next.label}</h2>
              <p>{chapter.next.teaser}</p>
              <Link href={chapter.next.href} className={s.lightButton}>
                Open the next chapter <AppIcon name="arrowUpRight" size={20} />
              </Link>
            </>
          ) : (
            <>
              <p className={s.eyebrow}>The whole collection</p>
              <h2>You’ve opened every chapter.</h2>
              <p>Return to the whole collection anytime.</p>
              <Link href="/hackathon-demo-1" className={s.lightButton}>
                Start again with Kindness received{" "}
                <AppIcon name="arrowUpRight" size={20} />
              </Link>
            </>
          )}
        </section>
      </main>
      <footer className={s.footer}>
        Time Tapestry · A legacy of generosity, passed down in their own voice.
      </footer>
    </div>
  );
}
