"use client";

import { useState } from "react";
import type { ChapterPackage, CollectionView } from "@/lib/collection/types";
import { AppIcon } from "@/components/icons";
import { mediaPath, portalField } from "./PortalUI";
import { storyOriginals } from "./story-originals";

export function StoryOriginalPreview({
  collection,
  chapter,
  accessKey,
}: {
  collection: CollectionView;
  chapter: ChapterPackage;
  accessKey: string;
}) {
  const originals = storyOriginals(collection, chapter);
  const [selectedId, setSelectedId] = useState("");
  const selected =
    originals.find((source) => source.mediaId === selectedId) || originals[0];
  const label = selected?.fromInterview
    ? "Complete interview recording segment"
    : "Complete recorded answer";
  return (
    <section
      className="overflow-hidden rounded-2xl border border-warmgray-200 bg-white"
      aria-label="Your original recordings for this story"
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <AppIcon name="video" size={24} className="text-sage-700" />
          <h2 className="text-2xl font-semibold">Your own voice</h2>
        </div>
        <p className="mt-3 text-base leading-7 text-ink-500">
          {selected
            ? "Listen to your original recording as you check the written story. These recordings stay private in your workspace."
            : "No saved audio or video is linked to this written story. You can still review and share the words."}
        </p>
        {originals.length > 1 && (
          <label className="mt-4 block text-base font-medium">
            Choose a recording ({originals.length})
            <select
              className={portalField}
              value={selected.mediaId}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {originals.map((source, index) => (
                <option key={source.mediaId} value={source.mediaId}>
                  Recording {index + 1}:{" "}
                  {source.kind === "video" ? "video" : "audio"}
                  {source.fromInterview
                    ? ", complete interview segment"
                    : ", complete answer"}
                </option>
              ))}
            </select>
          </label>
        )}
        {selected && (
          <div className="mt-5">
            <p className="mb-3 text-base font-medium">{label}</p>
            {selected.kind === "video" ? (
              <video
                key={selected.mediaId}
                controls
                playsInline
                preload="none"
                className="aspect-video w-full rounded-xl bg-espresso"
                aria-label={label}
                src={mediaPath(collection.id, selected.mediaId, accessKey)}
              />
            ) : (
              <audio
                key={selected.mediaId}
                controls
                preload="none"
                className="w-full"
                aria-label={label}
                src={mediaPath(collection.id, selected.mediaId, accessKey)}
              />
            )}
            <p className="mt-3 text-sm leading-7 text-ink-500">
              {selected.fromInterview
                ? "This plays the full saved segment. It may include the interviewer and other answers. It has not been trimmed into an edited story."
                : "This plays your complete saved answer, including any pauses. Your written corrections do not change this recording."}
            </p>
          </div>
        )}
        <p className="mt-4 border-t border-warmgray-200 pt-4 text-sm leading-7 text-ink-500">
          Four edited films in your own voice need cuts chosen and reviewed from
          your recordings. They are not created automatically here. You can
          attach a finished video below.
        </p>
      </div>
    </section>
  );
}
