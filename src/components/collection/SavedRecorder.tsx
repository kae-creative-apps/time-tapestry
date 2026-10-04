"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnswerTake } from "@/lib/collection/types";
import {
  answerFromLocal,
  appendTakeChunk,
  getTakeBlob,
  getLocalTake,
  listLocalTakes,
  putLocalTake,
  recordingExtension,
  requestRecordingStorage,
  type LocalTake,
} from "@/lib/collection/local-takes";

const MAX_SECONDS = 10 * 60;
const NOT_SAVED_WARNING =
  "Not saved yet. Keep this tab open and download your recording.";
const primary =
  "min-h-12 rounded-md bg-oxblood px-5 py-3 font-medium text-white disabled:opacity-50";
const secondary =
  "min-h-12 rounded-md border border-warmgray-300 bg-paper-50 px-4 py-3 text-ink-700 disabled:opacity-50";

export type SavedRecorderProps = {
  collectionId: string;
  accessKey: string;
  kind: "video" | "voice";
  questionId: string;
  prompt: string;
  onSaved?: (take: AnswerTake) => void;
  onMediaSaved?: (media: {
    mediaId: string;
    kind: "video" | "voice";
    durationSeconds?: number;
    localTakeId: string;
  }) => void;
  onBusyChange?: (busy: boolean) => void;
  directUpload?: boolean;
  suggestedDuration?: string;
  maxSeconds?: number;
};

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function mimeTypeFor(kind: "video" | "voice"): string | undefined {
  const candidates =
    kind === "video"
      ? ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
      : [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/mp4",
          "audio/ogg;codecs=opus",
        ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function friendlyRecordingError(error: unknown): string {
  if (
    error instanceof DOMException &&
    ["NotAllowedError", "PermissionDeniedError"].includes(error.name)
  )
    return "Camera or microphone access was not allowed. You can enable it in your browser settings, record voice only, or type your answer.";
  if (error instanceof DOMException && error.name === "NotFoundError")
    return "No camera or microphone was found. Connect one, or type your answer.";
  return error instanceof Error
    ? error.message
    : "Recording could not start. You can try again or type your answer.";
}

async function responseData(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.error || "Your recording could not be backed up yet.");
  return data;
}

async function hasDurableLocalCopy(
  take: LocalTake,
  expectedBytes?: number,
): Promise<boolean> {
  try {
    const stored = await getLocalTake(take.id);
    if (!stored) return false;
    const blob = await getTakeBlob(stored);
    return (
      blob.size > 0 &&
      (expectedBytes === undefined || blob.size === expectedBytes)
    );
  } catch {
    return false;
  }
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

export default function SavedRecorder({
  collectionId,
  accessKey,
  kind,
  questionId,
  prompt,
  onSaved,
  onMediaSaved,
  onBusyChange,
  directUpload = false,
  suggestedDuration = "Aim for 2 to 5 minutes. A short, specific memory is enough.",
  maxSeconds = MAX_SECONDS,
}: SavedRecorderProps) {
  const limit = Math.min(MAX_SECONDS, Math.max(30, maxSeconds));
  const endpoint = `/api/collection/${encodeURIComponent(collectionId)}`;
  const query = `?key=${encodeURIComponent(accessKey)}`;
  const [phase, setPhase] = useState<
    "idle" | "starting" | "recording" | "saving"
  >("idle");
  const [seconds, setSeconds] = useState(0);
  const [takes, setTakes] = useState<LocalTake[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const [fallbacks, setFallbacks] = useState<Record<string, Blob>>({});
  const [localCopies, setLocalCopies] = useState<Record<string, boolean>>({});
  const video = useRef<HTMLVideoElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const audioRecorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const active = useRef<LocalTake | null>(null);
  const chunks = useRef<Blob[]>([]);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const startedAt = useRef(0);
  const mounted = useRef(true);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const onMediaSavedRef = useRef(onMediaSaved);
  onMediaSavedRef.current = onMediaSaved;
  const busy = phase !== "idle" || uploading !== null;

  const refresh = useCallback(async () => {
    try {
      const stored = await listLocalTakes(collectionId, questionId);
      const checks = await Promise.all(
        stored
          .filter((take) => take.kind === kind && take.state !== "backed_up")
          .map(
            async (take) => [take.id, await hasDurableLocalCopy(take)] as const,
          ),
      );
      if (mounted.current)
        setLocalCopies((previous) => ({
          ...previous,
          ...Object.fromEntries(checks),
        }));
      if (mounted.current)
        setTakes((previous) => {
          const memoryOnly = previous.filter(
            (item) => !stored.some((saved) => saved.id === item.id),
          );
          return [
            ...stored.filter((item) => item.kind === kind),
            ...memoryOnly,
          ];
        });
    } catch (error) {
      if (mounted.current) setStorageWarning(friendlyRecordingError(error));
    }
  }, [collectionId, questionId, kind]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      const memoryOnly = takes.some(
        (take) =>
          take.state !== "backed_up" &&
          fallbacks[take.id] &&
          localCopies[take.id] !== true,
      );
      if (recorder.current?.state === "recording" || uploading || memoryOnly) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading, takes, fallbacks, localCopies]);
  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
      if (audioRecorder.current?.state === "recording")
        audioRecorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );
  useEffect(() => {
    if (phase !== "recording") return;
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
      setSeconds(Math.min(elapsed, limit));
      if (elapsed >= limit && recorder.current?.state === "recording") {
        setMessage(
          `This clip reached ${Math.floor(limit / 60)} minutes. We are saving it. You can record another take after it is backed up.`,
        );
        recorder.current.stop();
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [phase, limit]);

  async function uploadMedia(blob: Blob, label: string): Promise<string> {
    const name = `${label}.${recordingExtension(blob.type)}`;
    if (directUpload) {
      const mediaId = crypto.randomUUID();
      const { upload } = await import("@vercel/blob/client");
      await upload(`collections/${collectionId}/${mediaId}`, blob, {
        access: "private",
        multipart: true,
        contentType: blob.type.split(";")[0],
        handleUploadUrl: `${endpoint}/media/upload${query}`,
        clientPayload: JSON.stringify({
                  bytes: blob.size,
          mediaId,
          mimeType: blob.type.split(";")[0],
          name,
        }),
      });
      const result = await responseData(
        await fetch(`${endpoint}/media${query}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaId }),
        }),
      );
      return result.mediaId ?? mediaId;
    }
    const form = new FormData();
    form.append("file", blob, name);
    const result = await responseData(
      await fetch(`${endpoint}/media${query}`, { method: "POST", body: form }),
    );
    return result.mediaId;
  }

  async function backup(take: LocalTake, blobOverride?: Blob) {
    setUploading(take.id);
    setError("");
    let current = take;
    let recordingBlob = blobOverride;
    try {
      const blob = blobOverride ?? (await getTakeBlob(take));
      recordingBlob = blob;
      if (!blob.size)
        throw new Error("This take is empty. Please record another take.");
      if (!current.mediaId) {
        current = {
          ...current,
          mediaId: await uploadMedia(blob, `${take.questionId}-${take.id}`),
        };
        try {
          await putLocalTake({
            ...current,
            state: "local",
            updatedAt: new Date().toISOString(),
          });
        } catch {
          /* Keep the in-memory copy and finish the server backup. */
        }
      }
      if (onMediaSavedRef.current && current.mediaId) {
        const mediaId = current.mediaId;
        current = {
          ...current,
          state: "backed_up",
          updatedAt: new Date().toISOString(),
        };
        try {
          await putLocalTake(current);
        } catch {
          /* The media upload is confirmed. */
        }
        onMediaSavedRef.current({
          mediaId,
          kind,
          durationSeconds: current.durationSeconds,
          localTakeId: current.id,
        });
        if (mounted.current) {
          setTakes((previous) => [
            ...previous.filter((item) => item.id !== current.id),
            current,
          ]);
          setStorageWarning((previous) =>
            previous === NOT_SAVED_WARNING ? "" : previous,
          );
          setMessage(
            "Your recording is backed up. Review it, then choose Send my message when you are ready.",
          );
        }
        return;
      }
      current = {
        ...current,
        state: "backed_up",
        transcriptionStatus: current.text ? "ready" : "pending",
        updatedAt: new Date().toISOString(),
      };
      await responseData(
        await fetch(`${endpoint}${query}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save_take",
            take: answerFromLocal(current),
          }),
        }),
      );
      onSavedRef.current?.(answerFromLocal(current));
      try {
        await putLocalTake(current);
      } catch {
        /* The server copy is already saved. */
      }
      if (mounted.current) {
        setTakes((previous) => [
          ...previous.filter((item) => item.id !== current.id),
          current,
        ]);
        setStorageWarning((previous) =>
          previous === NOT_SAVED_WARNING ? "" : previous,
        );
        setMessage(
          "Your take is backed up. You can replay it below, record another, or continue.",
        );
      }
      try {
        if (!current.text) {
          // Transcribe the small audio-only sidecar, never the full-size video.
          if (current.audioMimeType && !current.audioMediaId) {
            const speech = await getTakeBlob({
              id: `${current.id}_audio`,
              mimeType: current.audioMimeType,
            });
            current = {
              ...current,
              audioMediaId: await uploadMedia(speech, `${current.id}-speech`),
            };
            try {
              await putLocalTake(current);
            } catch {
              /* Both media uploads are already backed up. */
            }
          }
          const transcription = await responseData(
            await fetch(`${endpoint}/transcribe${query}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mediaId: current.audioMediaId ?? current.mediaId,
              }),
            }),
          );
          current = {
            ...current,
            text: transcription.text,
            transcriptionStatus: "ready",
          };
          await responseData(
            await fetch(`${endpoint}${query}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "save_take",
                take: answerFromLocal(current),
              }),
            }),
          );
          onSavedRef.current?.(answerFromLocal(current));
        }
      } catch {
        current = { ...current, transcriptionStatus: "failed" };
        await fetch(`${endpoint}${query}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save_take",
            take: answerFromLocal(current),
          }),
        })
          .then(responseData)
          .then(() => onSavedRef.current?.(answerFromLocal(current)))
          .catch(() => undefined);
        if (mounted.current)
          setMessage(
            "Your recording is backed up. Check its transcription status below.",
          );
      }
      try {
        await putLocalTake(current);
      } catch {
        /* Server persistence is confirmed above. */
      }
      if (mounted.current)
        setTakes((previous) => [
          ...previous.filter((item) => item.id !== current.id),
          current,
        ]);
    } catch (error) {
      const durable = await hasDurableLocalCopy(current, recordingBlob?.size);
      if (mounted.current) {
        setLocalCopies((previous) => ({ ...previous, [current.id]: durable }));
        if (!durable && recordingBlob?.size) {
          const copy = recordingBlob;
          setFallbacks((previous) => ({ ...previous, [current.id]: copy }));
        }
        setError(
          durable
            ? `${friendlyRecordingError(error)} Your recording is saved on this device. You can retry the backup.`
            : recordingBlob?.size
              ? NOT_SAVED_WARNING
              : "We could not find a saved recording for this take. Please record another take.",
        );
        setTakes((previous) => [
          ...previous.filter((item) => item.id !== current.id),
          { ...current, state: "local" },
        ]);
      }
    } finally {
      if (mounted.current) setUploading(null);
    }
  }

  async function start() {
    setError("");
    setMessage("");
    setStorageWarning("");
    setPhase("starting");
    setSeconds(0);
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "This browser does not support recording. Try an updated browser, or type your answer.",
        );
      const persistent = await requestRecordingStorage();
      if (!persistent)
        setStorageWarning(
          "Your browser may clear device storage. Keep this tab open until the take says Backed up, and download a backup for important recordings.",
        );
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video:
          kind === "video"
            ? {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user",
              }
            : false,
      });
      stream.current = mediaStream;
      if (!mounted.current) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return;
      }
      if (video.current) video.current.srcObject = mediaStream;
      const mimeType = mimeTypeFor(kind);
      const mediaRecorder = new MediaRecorder(mediaStream, {
        ...(mimeType ? { mimeType } : {}),
        ...(kind === "video" ? { videoBitsPerSecond: 1_500_000 } : {}),
        audioBitsPerSecond: 96_000,
      });
      const speechMime =
        kind === "video" && !onMediaSaved ? mimeTypeFor("voice") : undefined;
      const speechRecorder = speechMime
        ? new MediaRecorder(new MediaStream(mediaStream.getAudioTracks()), {
            mimeType: speechMime,
            audioBitsPerSecond: 96_000,
          })
        : null;
      audioRecorder.current = speechRecorder;
      let speechStopped: Promise<void> = Promise.resolve();
      let speechFinished = () => {};
      if (speechRecorder)
        speechStopped = new Promise<void>((resolve) => {
          speechFinished = resolve;
        });
      const now = new Date().toISOString();
      const take: LocalTake = {
        id: crypto.randomUUID(),
        collectionId,
        questionId,
        prompt,
        kind,
        text: "",
        createdAt: now,
        updatedAt: now,
        mimeType:
          mediaRecorder.mimeType ||
          mimeType ||
          (kind === "video" ? "video/webm" : "audio/webm"),
        state: "recording",
        ...(speechRecorder
          ? { audioMimeType: speechRecorder.mimeType || speechMime }
          : {}),
      };
      await putLocalTake(take);
      active.current = take;
      chunks.current = [];
      writeQueue.current = Promise.resolve();
      recorder.current = mediaRecorder;
      let sequence = 0;
      mediaRecorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        chunks.current.push(event.data);
        const index = sequence++;
        writeQueue.current = writeQueue.current
          .then(() =>
            appendTakeChunk(
              take.id,
              index,
              event.data,
              Math.min(
                limit,
                Math.round((Date.now() - startedAt.current) / 1000),
              ),
            ),
          )
          .catch((error) => {
            if (mounted.current)
              setStorageWarning(friendlyRecordingError(error));
            if (mediaRecorder.state === "recording") mediaRecorder.stop();
          });
      };
      if (speechRecorder) {
        let speechSequence = 0;
        speechRecorder.ondataavailable = (event) => {
          if (!event.data.size) return;
          const index = speechSequence++;
          writeQueue.current = writeQueue.current
            .then(() => appendTakeChunk(`${take.id}_audio`, index, event.data))
            .catch(() => {
              // The original video stays intact even if the transcription copy cannot save.
              if (mounted.current)
                setStorageWarning(
                  "The copy used for automatic transcription could not be saved. Check your recording status below.",
                );
            });
        };
        speechRecorder.onstop = speechFinished;
        speechRecorder.onerror = () => {
          if (speechRecorder.state !== "inactive") speechRecorder.stop();
          else speechFinished();
        };
      }
      mediaRecorder.onerror = () => {
        if (mounted.current)
          setError(
            "Recording was interrupted. We are saving the part already recorded. Please review it before continuing.",
          );
        if (mediaRecorder.state !== "inactive") mediaRecorder.stop();
      };
      mediaRecorder.onstop = async () => {
        if (mounted.current) setPhase("saving");
        if (speechRecorder?.state === "recording") speechRecorder.stop();
        await speechStopped;
        mediaStream.getTracks().forEach((track) => track.stop());
        await writeQueue.current;
        const blob = new Blob(chunks.current, { type: take.mimeType });
        const complete: LocalTake = {
          ...take,
          durationSeconds: Math.min(
            limit,
            Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)),
          ),
          state: "local",
          updatedAt: new Date().toISOString(),
        };
        try {
          await putLocalTake(complete);
        } catch {
          // Verify the stored copy below before claiming it is saved.
        }
        const durable = await hasDurableLocalCopy(complete, blob.size);
        if (mounted.current) {
          setLocalCopies((previous) => ({
            ...previous,
            [complete.id]: durable,
          }));
          setTakes((previous) => [
            ...previous.filter((item) => item.id !== complete.id),
            complete,
          ]);
          if (!durable && blob.size) {
            setFallbacks((previous) => ({ ...previous, [complete.id]: blob }));
            setStorageWarning(NOT_SAVED_WARNING);
          }
          setPhase("idle");
        }
        active.current = null;
        // Keep the original chunks on this device even after a successful backup.
        if (blob.size && mounted.current) await backup(complete, blob);
      };
      startedAt.current = Date.now();
      speechRecorder?.start(1000);
      mediaRecorder.start(1000);
      setPhase("recording");
    } catch (error) {
      if (audioRecorder.current?.state === "recording")
        audioRecorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
      if (mounted.current) {
        setError(friendlyRecordingError(error));
        setPhase("idle");
      }
    }
  }

  const pending = takes.filter(
    (take) => onMediaSaved || take.state !== "backed_up",
  );
  return (
    <div className="space-y-5">
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
        <p className="text-base text-ink-700">{suggestedDuration}</p>
        <p className="mt-2 text-sm text-ink-400">
          Each clip saves on this device while you record, then backs up to your
          collection after you stop. Recording stops automatically at{" "}
          {Math.floor(limit / 60)} minutes. Your other takes stay available to
          replay.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          {phase === "recording" ? (
            <button
              type="button"
              className={primary}
              onClick={() => recorder.current?.stop()}
            >
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
          <p className="mt-4 text-sm text-ink-400">
            Keep this tab open while recording and saving.
          </p>
        )}
      </div>
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
            onClick={() => {
              if (take.state === "backed_up" && take.mediaId && onMediaSaved) {
                onMediaSaved({
                  mediaId: take.mediaId,
                  kind,
                  durationSeconds: take.durationSeconds,
                  localTakeId: take.id,
                });
                setMessage(
                  "This recording is selected. Choose Send my message when you are ready.",
                );
              } else
                void backup({ ...take, state: "local" }, fallbacks[take.id]);
            }}
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
