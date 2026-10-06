"use client";

import { useEffect, useRef, useState } from "react";
import type { ChapterPackage, CollectionView } from "@/lib/collection/types";
import { AppIcon } from "@/components/icons";
import { StoryMediaPlayer } from "./StoryOriginalPreview";
import { storyOriginals } from "./story-originals";
import {
  isNarratedFilm,
  mediaPath,
  portalField,
  portalSecondary,
} from "./PortalUI";

/** Playback and navigation only. Story words and recordings are not editable here. */
export function StoryReviewPanel({
  chapter,
  collection,
  accessKey,
  active,
  busy,
  onRecord,
}: {
  chapter: ChapterPackage;
  collection: CollectionView;
  accessKey: string;
  active: boolean;
  busy: boolean;
  onRecord: () => void;
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
      No original recording is linked to this story. Earlier saved material is
      kept. Record an answer to prepare a new film.
    </p>
  );

  return (
    <section
      ref={section}
      hidden={!active}
      className="min-w-0 rounded-2xl border border-warmgray-200 bg-white p-5 sm:p-8"
      aria-label={`Listen to ${chapter.title}`}
    >
      <p className="brand-eyebrow text-taupe-600">
        Story {chapter.id.slice(1)} of 4
      </p>
      <h2 className="mt-3 text-3xl font-semibold">{chapter.title}</h2>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-ink-600">
        {chapter.videoMediaId
          ? "Play your finished film. You can listen to the original below whenever you need to."
          : "Play your saved recording while your film is being prepared. Your own voice stays at the heart of the story."}
      </p>
      <div className="mt-6">
        {chapter.videoMediaId ? (
          <>
            <StoryMediaPlayer
              key={chapter.videoMediaId}
              label={chapter.title}
              src={mediaPath(collection.id, chapter.videoMediaId, accessKey)}
            />
            {isNarratedFilm(chapter) && (
              <p className="mt-3 rounded-xl bg-paper p-4 text-base leading-7">
                This previously saved film uses AI narration. It has been kept.
                New films use your original recorded voice.
              </p>
            )}
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
          original
        )}
      </div>
      <div className="mt-6 border-t border-warmgray-200 pt-5">
        <p className="mb-3 text-base leading-7 text-ink-600">
          Want to say something differently? You can return to the recorder.
          Your earlier recordings stay saved.
        </p>
        <button
          type="button"
          className={portalSecondary}
          disabled={busy}
          onClick={onRecord}
        >
          Record this answer again <AppIcon name="arrowRight" size={18} />
        </button>
      </div>
    </section>
  );
}
