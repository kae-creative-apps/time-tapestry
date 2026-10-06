"use client";

import { useRef, useState } from "react";
import { AppIcon } from "@/components/icons";
import type { CollectionView } from "@/lib/collection/types";
import { mediaPath, portalSecondary } from "./PortalUI";
import { hasRecordedVoiceFilm } from "./recorded-films";
import { hasChapterPlayback } from "@/lib/audio/playback-types";
import { StoryFilmPlayer } from "./StoryFilmPlayer";
import { StoryExportPanel } from "./FilmGenerationPanel";
import { StoryMediaPlayer } from "./StoryOriginalPreview";

/** The owner can watch the approved gift without switching to a recipient link. */
export function ApprovedStories({
  collection,
  accessKey,
  onRefresh,
}: {
  collection: CollectionView;
  accessKey: string;
  onRefresh: () => Promise<unknown>;
}) {
  const [selected, setSelected] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const chapter = collection.chapters[selected] || collection.chapters[0];
  if (!chapter) return null;
  const filmCount = collection.chapters.filter(
    (item) => hasChapterPlayback(item) || hasRecordedVoiceFilm(item),
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
            Your stories in your own voice
          </h2>
        </div>
        <p className="rounded-full bg-sage-100 px-4 py-2 text-base font-medium text-espresso">
          {filmCount} {filmCount === 1 ? "recorded story" : "recorded stories"}{" "}
          · {collection.chapters.length} written stories
        </p>
      </div>
      <nav
        aria-label="Choose an approved story"
        className="my-4 grid grid-cols-4 gap-2"
      >
        {collection.chapters.map((item, index) => (
          <button
            key={item.id}
            type="button"
            aria-current={selected === index ? "page" : undefined}
            onClick={() => choose(index)}
            className={`min-h-12 rounded-xl border p-2 text-left ${selected === index ? "border-espresso bg-espresso text-white" : "border-taupe/30 bg-paper text-espresso hover:bg-sage-100"}`}
          >
            <span className="block text-sm">Chapter {index + 1}</span>
            <span className="mt-1 hidden text-sm font-semibold leading-6 sm:block">
              {item.title}
            </span>
          </button>
        ))}
      </nav>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        {hasChapterPlayback(chapter) ? (
          <StoryFilmPlayer
            key={chapter.playback!.mediaId}
            title={chapter.title}
            storytellerName={collection.storyteller.name}
            src={mediaPath(collection.id, chapter.playback!.mediaId, accessKey)}
            playback={chapter.playback!}
            downloadUrl={
              chapter.playback!.exportMediaId
                ? mediaPath(
                    collection.id,
                    chapter.playback!.exportMediaId!,
                    accessKey,
                  )
                : undefined
            }
          />
        ) : hasRecordedVoiceFilm(chapter) ? (
          <div>
            <StoryMediaPlayer
              key={chapter.videoMediaId}
              label={chapter.title}
              src={mediaPath(collection.id, chapter.videoMediaId, accessKey)}
              preload="metadata"
            />
            <p className="mt-3 text-base leading-7 text-ink-600">
              Your own recorded voice. Your original recordings are kept
              separately below.
            </p>
          </div>
        ) : (
          <div className="brand-gradient-chocolate rounded-2xl p-7 text-white">
            <AppIcon name="collection" size={32} />
            <h3 className="mt-5 text-2xl text-white">
              Saved in your own words.
            </h3>
            <p className="mt-3 text-base leading-7 text-paper">
              A version using your original recording is needed. Your original
              recordings are still saved in your private archive.
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
      {collection.chapters.length === 4 &&
        collection.chapters.every(hasChapterPlayback) && (
          <div className="mt-7">
            <StoryExportPanel
              collection={collection}
              accessKey={accessKey}
              onComplete={onRefresh}
            />
          </div>
        )}
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
