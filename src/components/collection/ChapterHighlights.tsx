"use client";

import { AppIcon } from "@/components/icons";
import { momentClock } from "@/lib/collection/chapter-highlights";
import { publicPostcardMessage } from "@/lib/collection/postcard-public-message";
import type { ChapterPackage, CollectionView } from "@/lib/collection/types";
import styles from "./ChapterHighlights.module.css";

const themes: Record<string, string> = {
  q1: "Kindness",
  q2: "Faith",
  q3: "Generosity",
  q4: "Encouragement",
};

export function ChapterHighlights({
  collection,
  chapter,
  chapterIndex,
  bookHref,
  onSeek,
}: {
  collection: CollectionView;
  chapter: ChapterPackage;
  chapterIndex: number;
  bookHref: string;
  onSeek: (startMs: number) => void;
}) {
  const moments = chapter.storyMoments || [];
  const pullQuote = publicPostcardMessage(collection, chapter.id);
  const blessing = collection.chapterBlessings[chapter.id];
  return (
    <div className="min-w-0 rounded-[28px] border border-[#e7dfd6] bg-white p-6 sm:p-8">
      <p className="brand-eyebrow text-taupe-600">
        {themes[chapter.id] || `Story ${chapterIndex + 1}`} · Story{" "}
        {chapterIndex + 1} of {collection.chapters.length}
      </p>
      <h2 className="mt-3 font-display text-3xl font-medium leading-tight sm:text-4xl">
        {chapter.title}
      </h2>
      <blockquote className={`${styles.quote} mt-5`}>{pullQuote}</blockquote>
      {moments.length > 0 && (
        <>
          <h3 className="mt-7 font-display text-2xl font-medium">
            {moments.length === 3 ? "Three key moments" : "Key moments"}
          </h3>
          <ol className={styles.moments}>
            {moments.map((moment) => {
              const timed = moment.startMs != null;
              const body = (
                <>
                  {timed && (
                    <span className={styles.chip}>
                      {momentClock(moment.startMs || 0)}
                    </span>
                  )}
                  <span className={styles.momentText}>{moment.quote}</span>
                </>
              );
              return (
                <li key={`${moment.startMs ?? "note"}:${moment.quote}`}>
                  {timed ? (
                    <button
                      type="button"
                      className={styles.moment}
                      onClick={() => onSeek(moment.startMs || 0)}
                    >
                      {body}
                    </button>
                  ) : (
                    <div className={styles.moment}>{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
      <a
        className="brand-button-primary mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 px-5 py-3 sm:w-auto"
        href={bookHref}
      >
        <AppIcon name="download" size={18} />
        Download the whole story
      </a>
      {chapter.storyTranscript && (
        <details className={styles.transcript}>
          <summary>Read the transcript</summary>
          <p>{chapter.storyTranscript}</p>
        </details>
      )}
      {blessing &&
        (blessing.encouragement ||
          blessing.scriptureText ||
          blessing.scriptureReference) && (
          <aside className="mt-6 rounded-2xl bg-clay-50 p-5">
            <p className="brand-eyebrow text-taupe-600">A word for you</p>
            {blessing.encouragement && (
              <p className="mt-4 text-lg leading-8">{blessing.encouragement}</p>
            )}
            {blessing.scriptureText && (
              <blockquote className="mt-4 text-lg leading-8">
                {blessing.scriptureText}
              </blockquote>
            )}
            <p className="mt-3 text-sm text-ink-500">
              {blessing.scriptureReference} {blessing.scriptureTranslation}
            </p>
          </aside>
        )}
    </div>
  );
}
