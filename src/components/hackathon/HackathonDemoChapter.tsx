"use client";

import Link from "next/link";
import { useState } from "react";
import { BrandLockup } from "@/components/Logo";
import { BrandPattern } from "@/components/BrandPattern";
import { AppIcon } from "@/components/icons";
import { FadeIn } from "@/components/ui/FadeIn";
import { Stagger, StaggerItem } from "@/components/ui/Stagger";
import { SiriOrb } from "@/components/ui/siri-orb";
import { PostcardPreview } from "@/components/postcard/PostcardPreview";
import fd from "@/components/marketing/FrontDoor.module.css";
import {
  HACKATHON_DEMO_PARTNER_NOTE,
  HACKATHON_DEMO_STORYTELLER as GIGI,
  hackathonDemoChapters,
  spokenText,
  type HackathonDemoChapter as DemoChapter,
} from "@/data/hackathon-demo";
import type { HackathonDemoFilm } from "@/data/hackathon-demo-films";
import s from "./HackathonDemo.module.css";

// Same orb palette as the storyteller dashboard.
const ORB_COLORS = { bg: "#432e23", c1: "#e5c8bb", c2: "#dadecf", c3: "#c18f7b" };
const SPEAKER = { gigi: "Gigi", interviewer: "Interviewer" } as const;

const runtime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

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
    <div className={`${fd.frontDoor} ${s.shell}`}>
      <div className={s.column}>
        <header className={s.top}>
          <Link href="/hackathon-demo-1" aria-label="Gigi's collection, chapter 1">
            <BrandLockup />
          </Link>
        </header>

        <FadeIn>
          <p className={s.demoNote}>
            <span className={s.demoTag}>Demo</span>
            {HACKATHON_DEMO_PARTNER_NOTE}
          </p>
        </FadeIn>

        <FadeIn delay={0.04}>
          <section className={s.hero} aria-labelledby="chapter-title">
            <BrandPattern variant="ribbon" className={s.pattern} />
            <div className={s.heroCopy}>
              <div className={s.orbRow}>
                <SiriOrb size={76} animationDuration={16} colors={ORB_COLORS} />
                <p className={s.eyebrow}>
                  Chapter {chapter.number} of 4 · {chapter.theme}
                </p>
              </div>
              <h1 id="chapter-title" className={s.title}>
                {chapter.title}
              </h1>
              <p className={s.lede}>“{chapter.question}”</p>
              <p className={s.byline}>
                From {GIGI.fullName}, {GIGI.age}, {GIGI.hometown}. {GIGI.description}.
              </p>
            </div>

            <div className={s.film}>
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
                <div className={`${s.video} grid place-items-center text-espresso`}>
                  This chapter’s film is still being prepared.
                </div>
              )}
              <div className={s.filmMeta}>
                <span>Gigi’s audio interview</span>
                {film && <span>{runtime(film.seconds)}</span>}
              </div>
            </div>
            <blockquote className={s.excerpt}>“{chapter.transcript}”</blockquote>

            <Stagger className={s.tasks} stagger={0.06} delay={0.2}>
              {hackathonDemoChapters.map((item) => {
                const state =
                  item.number < chapter.number
                    ? s.done
                    : item.number === chapter.number
                      ? s.current
                      : "";
                return (
                  <StaggerItem key={item.path}>
                    <Link
                      href={item.path}
                      className={`${s.task} ${state}`}
                      aria-current={item.number === chapter.number ? "page" : undefined}
                    >
                      <span className={s.mark} aria-hidden="true">
                        {item.number < chapter.number ? (
                          <AppIcon name="check" size={14} />
                        ) : (
                          item.number
                        )}
                      </span>
                      <span>
                        <span className={s.taskTitle}>{item.title}</span>
                        <span className={s.taskDetail}>{item.question}</span>
                      </span>
                    </Link>
                  </StaggerItem>
                );
              })}
            </Stagger>

            <div className={s.actions}>
              {chapter.next ? (
                <Link href={chapter.next.href} className={s.heroPrimary}>
                  Next: {chapter.next.label} <AppIcon name="arrowRight" size={18} />
                </Link>
              ) : (
                <Link href="/hackathon-demo-1" className={s.heroPrimary}>
                  Start again <AppIcon name="arrowRight" size={18} />
                </Link>
              )}
              <a href="#reply" className={s.heroSecondary}>
                Reply to Gigi
              </a>
            </div>
          </section>
        </FadeIn>

        <FadeIn delay={0.08}>
          <section className={s.callout} aria-labelledby="postcard-title">
            <p className={s.kicker}>
              Postcard {chapter.postcard.number} of 4 · Mailed on day{" "}
              {chapter.postcard.sentOnDay}
            </p>
            <h2 id="postcard-title">“{chapter.postcard.message}”</h2>
            <p>
              Printed and mailed to {GIGI.recipient}. The QR code on the back
              opens this chapter, so Gigi’s voice is one scan away.
            </p>
            <div className={s.postcardFrame}>
              <PostcardPreview
                front={postcard.front}
                back={postcard.back}
                title={`Postcard ${chapter.postcard.number}`}
              />
            </div>
          </section>
        </FadeIn>

        <FadeIn delay={0.12}>
          <section className={s.card} aria-labelledby="story-title">
            <p className={s.kicker}>In Gigi’s voice</p>
            <h2 id="story-title">Her story</h2>
            <div className={s.story}>
              {chapter.story.split("\n\n").map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <blockquote className={s.pullQuote}>“{chapter.pullQuote}”</blockquote>
            <div className={s.scripture}>
              <p className={s.kicker}>Scripture</p>
              <blockquote>“{chapter.scripture.text}”</blockquote>
              <p>
                {chapter.scripture.reference} ({chapter.scripture.translation})
              </p>
            </div>
          </section>
        </FadeIn>

        <FadeIn delay={0.16}>
          <section className={s.card} aria-labelledby="moments-title">
            <p className={s.kicker}>Key moments</p>
            <h2 id="moments-title">{chapter.momentsTitle}</h2>
            <Stagger
              className={`${s.strip} ${chapter.moments.length === 3 ? s.strip3 : ""}`}
              stagger={0.06}
              delay={0.25}
            >
              {chapter.moments.map((moment, index) => (
                <StaggerItem key={moment.title} className={s.tile}>
                  <div className={s.tileBody}>
                    <p className={s.momentNumber}>0{index + 1}</p>
                    <h3 className={s.tileTitle}>{moment.title}</h3>
                    <p className={s.tileNote}>{moment.text}</p>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </section>
        </FadeIn>

        <FadeIn delay={0.2}>
          <section className={s.card}>
            <details className={s.conversation}>
              <summary>
                <h2>
                  <span className={`${s.kicker} block`}>The full conversation</span>
                  Read what Gigi said
                </h2>
                <span className={s.toggle} aria-hidden="true">
                  +
                </span>
              </summary>
              <dl className={s.turns}>
                {chapter.conversation.map((line, index) => (
                  <div
                    key={index}
                    className={`${s.turn} ${line.speaker === "interviewer" ? s.interviewer : ""}`}
                  >
                    <dt>{SPEAKER[line.speaker]}</dt>
                    <dd>{spokenText(line.text)}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </section>
        </FadeIn>

        <FadeIn delay={0.24}>
          <section id="reply" className={`${s.card} ${s.reply}`} aria-labelledby="reply-title">
            <p className={s.kicker}>Reply to Gigi</p>
            <h2 id="reply-title">{chapter.replyPrompt}</h2>
            <form
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
                <button type="submit" className={fd.primaryButton}>
                  Save demo reply
                </button>
              </div>
            </form>
            {saved && (
              <p role="status" className={s.saved}>
                {saved}
              </p>
            )}
          </section>
        </FadeIn>

        <FadeIn delay={0.28}>
          <section className={s.card} aria-labelledby="collection-title">
            <p className={s.kicker}>The whole collection</p>
            <h2 id="collection-title">
              {chapter.next ? "Gigi’s four stories" : "You’ve opened every chapter."}
            </h2>
            <p className={s.cardNote}>
              {chapter.next
                ? `Next: ${chapter.next.label}. ${chapter.next.teaser}`
                : "Return to the whole collection anytime."}
            </p>
            <div className={`${s.strip} ${s.strip4}`}>
              {hackathonDemoChapters.map((item) => {
                const here = item.number === chapter.number;
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={`${s.tile} ${here ? s.tileHere : ""}`}
                    aria-current={here ? "page" : undefined}
                  >
                    <div className={s.filmStage}>
                      <SiriOrb size={56} animationDuration={18} colors={ORB_COLORS} />
                    </div>
                    <div className={s.tileBody}>
                      <p className={s.tileLabel}>{item.theme}</p>
                      <h3 className={s.tileTitle}>{item.title}</h3>
                      <span className={s.tileLink}>
                        {here ? "You are here" : "Open this story"}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        </FadeIn>

        <p className={s.footer}>
          Illustrative example. Gigi, Sammie and the ministries are fictional,
          and both voices are generated with AI.
        </p>
      </div>
    </div>
  );
}
