"use client";

import { useEffect, useRef, useState } from "react";
import type { ChapterPackage, CollectionView } from "@/lib/collection/types";
import { AppIcon } from "@/components/icons";
import { mediaPath, portalField } from "./PortalUI";
import { storyOriginals } from "./story-originals";

/** Large controls supplement the native player without replacing its seeking or volume controls. */
export function StoryMediaPlayer({
  src,
  label,
  kind = "video",
  className = "",
  preload = "none",
  onEnded,
}: {
  src: string;
  label: string;
  kind?: "video" | "audio";
  className?: string;
  preload?: "none" | "metadata";
  onEnded?: () => void;
}) {
  const media = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 15000);
    return () => clearTimeout(timer);
  }, [loading]);
  async function play(retry = false) {
    const player = media.current;
    if (!player) return;
    setError("");
    setLoading(true);
    if (retry) player.load();
    try {
      await player.play();
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setLoading(false);
      setPlaying(false);
      setError(
        "This recording could not play. Check your connection, then try again.",
      );
    }
  }
  const shared = {
    ref: media,
    src,
    controls: kind === "audio" || started,
    preload,
    "aria-label": label,
    onPlay: () => setPlaying(true),
    onPlaying: () => {
      setStarted(true);
      setPlaying(true);
      setLoading(false);
      setError("");
    },
    onWaiting: () => setLoading(true),
    onPause: () => {
      setPlaying(false);
      setLoading(false);
    },
    onEnded: () => {
      setPlaying(false);
      setLoading(false);
      onEnded?.();
    },
    onError: () => {
      setPlaying(false);
      setLoading(false);
      setError(
        "This recording could not load. Check your connection, then try again.",
      );
    },
  };
  return (
    <div
      className={`overflow-hidden rounded-xl border border-warmgray-200 bg-white ${className}`}
    >
      <div className={kind === "video" ? "relative bg-espresso" : "p-4 pb-0"}>
        {kind === "video" ? (
          <video {...shared} playsInline className="aspect-video w-full" />
        ) : (
          <audio {...shared} className="w-full" />
        )}
        {kind === "video" && !started && (
          <div
            className="brand-gradient-chocolate absolute inset-0 flex flex-col items-center justify-center gap-4 p-5 text-center text-white"
            aria-hidden="true"
          >
            <AppIcon name="video" size={40} />
            <p className="max-w-sm font-display text-xl font-medium leading-7 text-white">
              {label}
            </p>
            <p className="text-base text-paper">Use Play below to begin.</p>
          </div>
        )}
      </div>
      <div className="p-4">
        <button
          type="button"
          className="brand-button-primary inline-flex min-h-14 items-center justify-center gap-3 px-6 py-3 text-lg"
          aria-label={`${playing ? "Pause" : "Play"}: ${label}`}
          onClick={() =>
            playing ? media.current?.pause() : void play(Boolean(error))
          }
        >
          <AppIcon name={playing ? "pause" : "play"} size={23} />
          {playing ? "Pause" : "Play"}{" "}
          {kind === "video" ? "video" : "recording"}
        </button>
        <p role="status" className="mt-2 text-base leading-7 text-ink-500">
          {loading
            ? slow
              ? "This is taking longer than usual. You can try loading it again."
              : "Loading your recording…"
            : ""}
        </p>
        {error && (
          <p role="alert" className="mt-2 text-base leading-7 text-oxblood">
            {error}
          </p>
        )}
        {(error || slow) && (
          <button
            type="button"
            onClick={() => void play(true)}
            className="mt-2 min-h-12 text-base font-medium underline underline-offset-4"
          >
            Try loading again
          </button>
        )}
      </div>
    </div>
  );
}

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
            <StoryMediaPlayer
              key={selected.mediaId}
              kind={selected.kind === "video" ? "video" : "audio"}
              label={label}
              src={mediaPath(collection.id, selected.mediaId, accessKey)}
            />
            <p className="mt-3 text-sm leading-7 text-ink-500">
              {selected.fromInterview
                ? "This plays the full saved segment. It may include the interviewer and other answers. It has not been trimmed into an edited story."
                : "This plays your complete saved answer, including any pauses. Your written corrections do not change this recording."}
            </p>
          </div>
        )}
        <p className="mt-4 border-t border-warmgray-200 pt-4 text-sm leading-7 text-ink-500">
          These originals stay unchanged. Your finished films are prepared
          separately and need your approval before sharing.
        </p>
      </div>
    </section>
  );
}
