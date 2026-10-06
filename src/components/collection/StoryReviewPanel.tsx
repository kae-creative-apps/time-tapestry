"use client";

import { useEffect, useRef, useState } from "react";
import type { ChapterPackage, CollectionView } from "@/lib/collection/types";
import { StoryIssueReport } from "./StoryIssueReport";
import { StoryMediaPlayer } from "./StoryOriginalPreview";
import { storyOriginals } from "./story-originals";
import { mediaPath, portalField } from "./PortalUI";
import { hasRecordedVoiceFilm } from "./recorded-films";

/** Playback and navigation only. Story words and recordings are not editable here. */
export function StoryReviewPanel({
  chapter,
  collection,
  accessKey,
  active,
  onIssueReported,
  expectedChapterHash,
}: {
  chapter: ChapterPackage;
  collection: CollectionView;
  accessKey: string;
  active: boolean;
  onIssueReported?: () => void;
  expectedChapterHash?: string;
}) {
  const section = useRef<HTMLElement>(null);
  const originals = storyOriginals(collection, chapter);
  const [selectedId, setSelectedId] = useState("");
  const selected =
    originals.find((item) => item.mediaId === selectedId) || originals[0];
  useEffect(() => {
    if (!active)
      section.current
        ?.querySelectorAll<HTMLMediaElement>("video,audio")
        .forEach((media) => media.pause());
  }, [active]);

  const original = selected ? (
    <div>
      {originals.length > 1 && (
        <label className="mb-5 block text-base font-medium">
          Choose a saved recording
          <select
            className={portalField}
            value={selected.mediaId}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {originals.map((item, index) => (
              <option key={item.mediaId} value={item.mediaId}>
                Recording {index + 1},{" "}
                {item.kind === "video" ? "video with sound" : "audio only"}
              </option>
            ))}
          </select>
        </label>
      )}
      <StoryMediaPlayer
        key={selected.mediaId}
        kind={selected.kind === "video" ? "video" : "audio"}
        label={
          selected.fromInterview
            ? "Your original interview recording"
            : "Your recorded answer"
        }
        src={mediaPath(collection.id, selected.mediaId, accessKey)}
      />
      <p className="mt-3 text-base leading-7 text-ink-600">
        {selected.fromInterview
          ? "This is the complete saved interview segment. It may include other answers. Your finished film is prepared separately."
          : "This is your complete saved answer, including your pauses."}
      </p>
    </div>
  ) : (
    <p className="rounded-xl bg-paper p-5 text-base leading-7">
      No original recording is linked to this story. Your saved material is kept
      while this is checked.
    </p>
  );

  return (
    <section
      ref={section}
      hidden={!active}
      className="min-w-0 rounded-2xl border border-warmgray-200 bg-white p-5 sm:p-8"
      aria-label={`Listen to ${chapter.title}`}
    >
      <h2
        id={`review-chapter-${chapter.id}`}
        tabIndex={-1}
        className="mb-4 scroll-mt-5 text-xl font-semibold sm:text-2xl"
      >
        {chapter.title}
      </h2>
      <div>
        {hasRecordedVoiceFilm(chapter) ? (
          <>
            <StoryMediaPlayer
              key={chapter.videoMediaId}
              label={chapter.title}
              src={mediaPath(collection.id, chapter.videoMediaId, accessKey)}
            />
            <details
              className="mt-5 rounded-xl border border-warmgray-200 p-4"
              onToggle={(event) => {
                if (!event.currentTarget.open)
                  event.currentTarget
                    .querySelectorAll<HTMLMediaElement>("video,audio")
                    .forEach((media) => media.pause());
              }}
            >
              <summary className="min-h-12 cursor-pointer py-2 text-base font-medium">
                Listen to the original recording
              </summary>
              <div className="mt-3">{original}</div>
            </details>
          </>
        ) : (
          <>
            <p className="mb-4 rounded-xl bg-paper p-4 text-base leading-7">
              A version using your original recording is needed. Your original
              recording is available below.
            </p>
            {original}
          </>
        )}
      </div>
      <details className="mt-4 rounded-xl border border-warmgray-200 p-4">
        <summary className="min-h-12 cursor-pointer py-2 text-base font-medium">
          Read this written chapter
        </summary>
        <p className="mt-3 whitespace-pre-wrap text-lg leading-8">
          {chapter.content}
        </p>
        <p className="mt-4 text-sm leading-6 text-ink-600">
          Prepared from your recording. Your original voice stays unchanged.
        </p>
        <StoryIssueReport
          collectionId={collection.id}
          chapterId={chapter.id}
          accessKey={accessKey}
          expectedChapterHash={expectedChapterHash}
          initialIssueId={
            collection.storyIssues?.find(
              (issue) =>
                issue.chapterId === chapter.id && issue.status === "open",
            )?.id
          }
          onReported={onIssueReported}
        />
      </details>
    </section>
  );
}
