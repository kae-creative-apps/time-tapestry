"use client";

import { useRef, useState } from "react";
import { AppIcon } from "@/components/icons";
import type { CollectionView } from "@/lib/collection/types";
import { isNarratedFilm, mediaPath, portalSecondary } from "./PortalUI";
import { StoryMediaPlayer } from "./StoryOriginalPreview";

/** The owner can watch the approved gift without switching to a recipient link. */
export function ApprovedStories({
  collection,
  accessKey,
}: {
  collection: CollectionView;
  accessKey: string;
}) {
  const [selected, setSelected] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const chapter = collection.chapters[selected] || collection.chapters[0];
  if (!chapter) return null;
  const filmCount = collection.chapters.filter(
    (item) => item.videoMediaId,
  ).length;
  function choose(index: number, focus = false) {
    setSelected(index);
    if (focus) heading.current?.focus();
  }
  return (
    <section
      id="saved-stories"
      className="mb-9 scroll-mt-6 rounded-[24px] border border-taupe/30 bg-white p-5 sm:p-8"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="brand-eyebrow text-taupe-600">
            Your finished collection
          </p>
          <h2 className="mt-3 text-3xl font-semibold">
            Your stories and videos
          </h2>
        </div>
        <p className="rounded-full bg-sage-100 px-4 py-2 text-base font-medium text-espresso">
          {filmCount} {filmCount === 1 ? "video" : "videos"} ·{" "}
          {collection.chapters.length} written stories
        </p>
      </div>
      <nav
        aria-label="Choose an approved story"
        className="my-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {collection.chapters.map((item, index) => (
          <button
            key={item.id}
            type="button"
            aria-current={selected === index ? "page" : undefined}
            onClick={() => choose(index)}
            className={`min-h-24 rounded-xl border p-4 text-left ${selected === index ? "border-espresso bg-espresso text-white" : "border-taupe/30 bg-paper text-espresso hover:bg-sage-100"}`}
          >
            <span className="block text-sm">
              Story {index + 1} ·{" "}
              {item.videoMediaId ? "Video and words" : "Written story"}
            </span>
            <span className="mt-2 block text-lg font-semibold leading-6">
              {item.title}
            </span>
          </button>
        ))}
      </nav>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        {chapter.videoMediaId ? (
          <div>
            <StoryMediaPlayer
              key={chapter.videoMediaId}
              label={chapter.title}
              src={mediaPath(collection.id, chapter.videoMediaId, accessKey)}
              preload="metadata"
            />
            <p className="mt-3 text-base leading-7 text-ink-600">
              {isNarratedFilm(chapter)
                ? "An AI voice reads your approved words. Your original recordings are kept separately below."
                : "Your approved story film. Your original recordings are kept separately below."}
            </p>
          </div>
        ) : (
          <div className="brand-gradient-chocolate rounded-2xl p-7 text-white">
            <AppIcon name="collection" size={32} />
            <h3 className="mt-5 text-2xl text-white">
              Saved in your own words.
            </h3>
            <p className="mt-3 text-base leading-7 text-paper">
              This story was approved without a finished video. Any original
              recordings are still available in your private recording archive
              below.
            </p>
          </div>
        )}
        <div className="min-w-0">
          <h3 ref={heading} tabIndex={-1} className="text-2xl font-semibold">
            {chapter.title}
          </h3>
          <p className="mt-4 whitespace-pre-wrap text-lg leading-8 text-espresso">
            {chapter.content}
          </p>
        </div>
      </div>
      <nav
        aria-label="Move between approved stories"
        className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-warmgray-200 pt-5"
      >
        <button
          type="button"
          disabled={selected === 0}
          className={portalSecondary}
          onClick={() => choose(selected - 1, true)}
        >
          Previous story
        </button>
        <span className="text-base font-medium">
          {selected + 1} of {collection.chapters.length}
        </span>
        <button
          type="button"
          disabled={selected === collection.chapters.length - 1}
          className={portalSecondary}
          onClick={() => choose(selected + 1, true)}
        >
          Next story
        </button>
      </nav>
    </section>
  );
}
