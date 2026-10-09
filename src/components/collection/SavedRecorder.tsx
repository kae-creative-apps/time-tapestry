"use client";
import { useEffect, useState } from "react";
import {
  useStoryRecorder,
  NOT_SAVED_WARNING,
  type StoryRecorderOptions,
} from "@/hooks/useStoryRecorder";
import {
  getTakeBlob,
  recordingExtension,
  type LocalTake,
} from "@/lib/collection/local-takes";
import { RecoveredRecordingPrompt } from "./RecoveredRecordingPrompt";
export type SavedRecorderProps = StoryRecorderOptions;
const primary =
  "min-h-12 rounded-md bg-oxblood px-5 py-3 font-medium text-white disabled:opacity-50";
const secondary =
  "min-h-12 rounded-md border border-warmgray-300 bg-paper-50 px-4 py-3 text-ink-700 disabled:opacity-50";

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
function LocalPlayback({
  take,
  fallback,
}: {
  take: LocalTake;
  fallback?: Blob;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    (fallback ? Promise.resolve(fallback) : getTakeBlob(take))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((error) =>
        setError(
          error instanceof Error ? error.message : "Could not load this take.",
        ),
      );
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [take.id, take.updatedAt, fallback]);
  return (
    <div className="space-y-3">
      {url &&
        (take.kind === "video" ? (
          <video
            src={url}
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full rounded-md bg-ink-800"
            aria-label="Preview your video"
          />
        ) : (
          <audio
            src={url}
            controls
            preload="metadata"
            className="w-full"
            aria-label="Preview your voice recording"
          />
        ))}
      {error && (
        <p className="text-sm text-oxblood" role="alert">
          {error}
        </p>
      )}
      {url && (
        <a
          href={url}
          download={`time-tapestry-${take.questionId}-${take.id}.${recordingExtension(take.mimeType)}`}
          className="inline-flex items-center text-sm font-medium text-oxblood underline underline-offset-4"
        >
          Download recording
        </a>
      )}
    </div>
  );
}

export default function SavedRecorder(props: SavedRecorderProps) {
  const {
    kind,
    onMediaSaved,
    suggestedDuration = "Aim for 2 to 5 minutes. A short, specific memory is enough.",
  } = props;
  const {
    limit,
    phase,
    seconds,
    takes,
    uploading,
    error,
    message,
    storageWarning,
    fallbacks,
    localCopies,
    video,
    busy,
    pending,
    start,
    stop,
    backup,
    inputLevel,
    inputState,
    resumeInputMeter,
    recoveredTakes,
    keepRecovered,
    deferRecovered,
    deferredRecoveryCount,
    reviewRecovered,
  } = useStoryRecorder(props);
  return (
    <div className="space-y-5">
      {recoveredTakes.map((take) => (
        <RecoveredRecordingPrompt
          key={take.id}
          take={take}
          disabled={busy}
          onKeep={() => void keepRecovered(take)}
          onLater={() => deferRecovered(take.id)}
        >
          <LocalPlayback take={take} fallback={fallbacks[take.id]} />
        </RecoveredRecordingPrompt>
      ))}
      {deferredRecoveryCount > 0 && (
        <p className="text-sm text-ink-500">
          Your recovered recordings are still on this device.{" "}
          <button
            type="button"
            disabled={busy}
            onClick={reviewRecovered}
            className="min-h-11 text-oxblood underline underline-offset-4 disabled:opacity-50"
          >
            Review recovered recordings
          </button>
        </p>
      )}
      <div className="rounded-lg border border-warmgray-300 bg-paper-50 p-5 sm:p-6">
        {kind === "video" && (
          <video
            ref={video}
            muted
            playsInline
            autoPlay
            aria-label="Camera preview"
            className={`mb-4 aspect-video w-full rounded-md bg-ink-800 ${phase === "starting" || phase === "recording" ? "" : "hidden"}`}
          />
        )}
        {suggestedDuration ? (
          <p className="text-base text-ink-700">{suggestedDuration}</p>
        ) : null}
        <p className={`${suggestedDuration ? "mt-2" : ""} text-sm text-ink-400`}>
          Each clip saves on this device while you record, then backs up to your
          collection after you stop. Recording stops automatically at{" "}
          {Math.floor(limit / 60)} minutes. Your other takes stay available to
          replay.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          {phase === "recording" ? (
            <button type="button" className={primary} onClick={stop}>
              Stop and save
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              className={primary}
              onClick={() => void start()}
            >
              {phase === "starting"
                ? "Opening recorder…"
                : phase === "saving"
                  ? "Saving take…"
                  : takes.length
                    ? "Record another take"
                    : `Record ${kind === "video" ? "video" : "voice"}`}
            </button>
          )}
          {phase === "recording" && (
            <span
              className="font-mono text-lg text-oxblood"
              role="timer"
              aria-label={`${seconds} seconds recorded`}
            >
              ● {clock(seconds)} / {clock(limit)}
            </span>
          )}
          {phase === "idle" && !uploading && (
            <span className="text-sm text-ink-400">
              Camera and microphone open only when you choose Record.
            </span>
          )}
        </div>
        {phase === "recording" &&
          seconds >= limit - Math.min(120, limit / 4) && (
            <p role="status" className="mt-4 text-sm font-medium text-oxblood">
              This clip will save in {clock(limit - seconds)}. Finish your
              thought before the clip saves. You can add detail in a follow-up
              answer.
            </p>
          )}
        {phase === "recording" && (
          <div className="mt-4 space-y-3">
            <label className="block text-sm text-ink-500">
              Microphone input
              <meter
                min={0}
                max={100}
                value={inputLevel}
                aria-label="Microphone input level"
                className="mt-2 h-3 w-full"
              />
            </label>
            {inputState === "suspended" && (
              <button
                type="button"
                onClick={resumeInputMeter}
                className="min-h-11 text-sm text-oxblood underline underline-offset-4"
              >
                Resume microphone meter
              </button>
            )}
            {inputState === "unavailable" && (
              <p className="text-sm text-ink-500">
                The input meter is unavailable in this browser. Replay your
                recording to check its sound.
              </p>
            )}
            <p className="text-sm text-ink-400">
              Keep this tab open while recording and saving.
            </p>
          </div>
        )}
      </div>
      {(phase === "saving" || uploading) && (
        <p role="status" className="text-base font-semibold">
          Keep this page open and your computer awake until saving is confirmed.
        </p>
      )}
      {storageWarning && (
        <p className="text-sm text-ink-400" role="status">
          {storageWarning}
        </p>
      )}
      {error && (
        <p
          className="rounded-md border border-oxblood/30 p-4 text-oxblood"
          role="alert"
        >
          {error}
        </p>
      )}
      {message && (
        <p className="text-sm text-ink-700" role="status">
          {message}
        </p>
      )}
      {pending.map((take, index) => (
        <div
          key={take.id}
          className="space-y-3 rounded-lg border border-warmgray-300 p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xl">
              {take.state === "recording"
                ? "Recovered recording"
                : `${take.state === "backed_up" || localCopies[take.id] ? "Saved take" : "Take"} ${index + 1}`}
            </h3>
            <span className="text-sm text-ink-400">
              {take.state === "backed_up"
                ? "Backed up"
                : localCopies[take.id] === true
                  ? "Saved on this device"
                  : localCopies[take.id] === undefined
                    ? "Checking device copy…"
                    : fallbacks[take.id]
                      ? "Not saved yet"
                      : "Device copy unavailable"}
            </span>
          </div>
          {take.state !== "backed_up" &&
            localCopies[take.id] === false &&
            fallbacks[take.id] && (
              <p role="alert" className="text-sm text-oxblood">
                {NOT_SAVED_WARNING}
              </p>
            )}
          {take.state === "recording" && (
            <p className="text-sm text-ink-400">
              The previous recording stopped before it finished saving. Replay
              the recovered portion and back it up before continuing. Some
              browsers may not be able to play an interrupted recording.
            </p>
          )}
          <LocalPlayback take={take} fallback={fallbacks[take.id]} />
          <button
            type="button"
            className={secondary}
            disabled={busy}
            onClick={() =>
              void backup(
                take.state === "recording" ? { ...take, state: "local" } : take,
                fallbacks[take.id],
              )
            }
          >
            {uploading === take.id
              ? onMediaSaved
                ? "Backing up…"
                : "Backing up and transcribing…"
              : take.state === "backed_up"
                ? "Use this recording"
                : "Back up this take"}
          </button>
        </div>
      ))}
    </div>
  );
}
