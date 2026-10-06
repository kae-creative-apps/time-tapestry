"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  appendTakeChunk,
  getTakeBlob,
  listLocalTakes,
  putLocalTake,
  recordingExtension,
  requestRecordingStorage,
} from "@/lib/collection/local-takes";
import {
  acknowledgeArchive,
  ARCHIVE_SEGMENT_MS,
  archiveDurationMs,
  archiveTimelineOffset,
  isArchiveTake,
  isEmptyArchiveAttempt,
  recoverInterruptedArchive,
  type ArchiveLocalTake,
} from "@/lib/collection/archive-utils";
import { claimRecordingDeviceLock } from "@/lib/collection/recording-device-lock";
import type { InterviewSegment } from "@/lib/collection/types";
import {
  interviewCaptureConstraints,
  listenForCaptureInterruption,
  requireInterviewAudioTrack,
  type InterviewDevices,
} from "@/lib/collection/interview-devices";

export type ArchiveRecording = {
  id: string;
  localTakeId: string;
  sessionId: string;
  kind: "voice" | "video";
  startMs: number;
  durationMs: number;
  createdAt: string;
  mimeType: string;
  state: "recording" | "local" | "backed_up";
  mediaId?: string;
  localSaved: boolean;
  empty: boolean;
  recovered: boolean;
  error?: string;
};

type Props = {
  collectionId: string;
  accessKey: string;
  directUpload?: boolean;
  recoveryEnabled?: boolean;
  onSegmentSaved: (
    segment: InterviewSegment,
    sessionId: string,
  ) => Promise<void>;
};

type ActiveSegment = {
  recorder: MediaRecorder;
  take: ArchiveLocalTake;
  chunks: Blob[];
  writes: Promise<void>;
  started: number;
  ended?: number;
  stopDone: Promise<void>;
  finish: () => void;
};

function mimeTypeFor(kind: "voice" | "video") {
  return (
    kind === "video"
      ? ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
      : [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/mp4",
          "audio/ogg;codecs=opus",
        ]
  ).find((mime) => MediaRecorder.isTypeSupported(mime));
}

function friendlyError(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError")
    return "Camera or microphone access was not allowed. You can change permission in your browser settings.";
  if (error instanceof DOMException && error.name === "NotFoundError")
    return "No camera or microphone was found. Connect one, then try again.";
  return error instanceof Error
    ? error.message
    : "Your recording could not be saved. Keep this tab open.";
}

function requestCaptureStream(
  kind: "voice" | "video",
  devices: InterviewDevices = {},
) {
  return navigator.mediaDevices.getUserMedia(
    interviewCaptureConstraints(kind, devices),
  );
}

async function responseData(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.error || "Your recording could not be backed up yet.");
  return data;
}

export function useInterviewArchive({
  collectionId,
  accessKey,
  directUpload = false,
  recoveryEnabled = false,
  onSegmentSaved,
}: Props) {
  const [status, setStatus] = useState<
    "idle" | "starting" | "recording" | "paused" | "stopping"
  >("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recordings, setRecordings] = useState<ArchiveRecording[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [recoveryReady, setRecoveryReady] = useState(false);
  const recoveryAttempts = useRef(new Set<string>());
  const emptyAttempts = useRef(new Set<string>());
  const mounted = useRef(true);
  const deviceLockRelease = useRef<(() => void) | null>(null);
  const transitioning = useRef(false);
  const transitionDone = useRef(Promise.resolve());
  const releaseTransition = useRef<(() => void) | null>(null);
  const active = useRef<ActiveSegment | null>(null);
  const media = useRef<MediaStream | null>(null);
  const removeTrackListeners = useRef<(() => void) | null>(null);
  const session = useRef<{
    id: string;
    kind: "voice" | "video";
    startedAt: string;
    origin: number;
    devices: InterviewDevices;
  } | null>(null);
  const stored = useRef(new Map<string, ArchiveLocalTake>());
  const memory = useRef(new Map<string, Blob>());
  const durable = useRef(new Map<string, boolean>());
  const errors = useRef(new Map<string, string>());
  const uploads = useRef(new Map<string, Promise<void>>());
  const finalizing = useRef(new Set<Promise<void>>());
  const rollover = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callback = useRef(onSegmentSaved);
  callback.current = onSegmentSaved;

  const acquireTransition = useCallback(async () => {
    while (transitioning.current) await transitionDone.current;
    transitioning.current = true;
    transitionDone.current = new Promise((resolve) => {
      releaseTransition.current = resolve;
    });
  }, []);
  const completeTransition = useCallback(() => {
    transitioning.current = false;
    releaseTransition.current?.();
    releaseTransition.current = null;
  }, []);

  const publish = useCallback(() => {
    if (!mounted.current) return;
    setRecordings(
      [...stored.current.values()]
        .map((take) => ({
          id: take.id,
          localTakeId: take.id,
          sessionId: take.archive.sessionId,
          kind: take.kind,
          startMs: take.archive.startMs,
          durationMs: archiveDurationMs(take),
          createdAt: take.createdAt,
          mimeType: take.mimeType,
          state: take.state,
          mediaId: take.mediaId,
          localSaved: durable.current.get(take.id) === true,
          empty: emptyAttempts.current.has(take.id),
          recovered: take.archive.recovered === true,
          error: errors.current.get(take.id),
        }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    );
    setSaving(uploads.current.size > 0 || finalizing.current.size > 0);
  }, []);

  const getBlob = useCallback(
    async (id: string): Promise<Blob> => {
      const fallback = memory.current.get(id);
      if (fallback) return fallback;
      const take = stored.current.get(id);
      if (!take || take.collectionId !== collectionId)
        throw new Error("This recording could not be found on this device.");
      return getTakeBlob(take);
    },
    [collectionId],
  );

  const backup = useCallback(
    async (id: string): Promise<void> => {
      const existing = uploads.current.get(id);
      if (existing) return existing;
      const work = (async () => {
        let take = stored.current.get(id);
        if (
          !take ||
          take.state === "backed_up" ||
          emptyAttempts.current.has(id)
        )
          return;
        if (take.state === "recording")
          throw new Error("This recording is still in progress.");
        errors.current.delete(id);
        try {
          const blob = await getBlob(id);
          if (!blob.size)
            throw new Error(
              "No recorded audio or video was saved for this segment.",
            );
          if (!take.mediaId) {
            const endpoint = `/api/collection/${encodeURIComponent(collectionId)}/media`;
            const query = `?key=${encodeURIComponent(accessKey)}`;
            const name = `interview-${take.id}.${recordingExtension(take.mimeType)}`;
            let mediaId: string;
            if (directUpload) {
              mediaId = crypto.randomUUID();
              const { upload } = await import("@vercel/blob/client");
              await upload(`collections/${collectionId}/${mediaId}`, blob, {
                access: "private",
                multipart: true,
                contentType: blob.type.split(";")[0],
                handleUploadUrl: `${endpoint}/upload${query}`,
                clientPayload: JSON.stringify({
                  bytes: blob.size,
                  mediaId,
                  mimeType: blob.type.split(";")[0],
                  name,
                }),
              });
              const result = await responseData(
                await fetch(`${endpoint}${query}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ mediaId }),
                }),
              );
              mediaId = result.mediaId ?? mediaId;
            } else {
              const form = new FormData();
              form.append("file", blob, name);
              const result = await responseData(
                await fetch(`${endpoint}${query}`, {
                  method: "POST",
                  body: form,
                }),
              );
              mediaId = result.mediaId;
            }
            if (!mediaId)
              throw new Error("The recording upload was not confirmed.");
            take = { ...take, mediaId, updatedAt: new Date().toISOString() };
            // Retain the upload identity even when attachment acknowledgement fails.
            stored.current.set(id, take);
            await putLocalTake(take).catch(() => undefined);
          }
          if (!mounted.current) return;
          const sessionId = take.archive.sessionId;
          take = await acknowledgeArchive(take, (segment) =>
            callback.current(segment, sessionId),
          );
          stored.current.set(id, take);
          await putLocalTake(take).catch(() => undefined);
          if (durable.current.get(id)) memory.current.delete(id);
          if (
            [...memory.current.keys()].every(
              (key) => stored.current.get(key)?.state === "backed_up",
            )
          ) {
            setWarning((previous) =>
              previous.startsWith("Part of this recording") ? "" : previous,
            );
          }
        } catch (cause) {
          const message = friendlyError(cause);
          errors.current.set(id, message);
          if (mounted.current)
            setError(
              durable.current.get(id)
                ? `${message} Your recording is saved on this device. Retry the backup when you are ready.`
                : `${message} Keep this tab open and download your recording.`,
            );
          throw cause;
        } finally {
          // The outer finally removes this operation after the map is populated.
          publish();
        }
      })();
      uploads.current.set(id, work);
      publish();
      try {
        await work;
      } finally {
        uploads.current.delete(id);
        publish();
      }
    },
    [accessKey, collectionId, directUpload, getBlob, publish],
  );

  const clearRollover = useCallback(() => {
    if (rollover.current) clearTimeout(rollover.current);
    rollover.current = null;
  }, []);

  const retry = useCallback(
    async (localTakeId: string) => {
      if (mounted.current) setError("");
      await backup(localTakeId);
    },
    [backup],
  );

  const finishSegment = useCallback(
    async (item: ActiveSegment) => {
      await item.writes;
      const blob = new Blob(item.chunks, { type: item.take.mimeType });
      const elapsed = Math.max(
        0,
        Math.round((item.ended ?? performance.now()) - item.started),
      );
      const complete: ArchiveLocalTake = {
        ...item.take,
        state: "local",
        durationSeconds: elapsed / 1000,
        updatedAt: new Date().toISOString(),
        archive: { ...item.take.archive, durationMs: elapsed },
      };
      stored.current.set(complete.id, complete);
      if (isEmptyArchiveAttempt(complete, blob.size > 0))
        emptyAttempts.current.add(complete.id);
      await putLocalTake(complete).catch(() => undefined);
      let localSaved = false;
      try {
        localSaved =
          (await getTakeBlob(complete)).size === blob.size && blob.size > 0;
      } catch {
        /* Check the in-memory original below. */
      }
      durable.current.set(complete.id, localSaved);
      if (!localSaved && blob.size) {
        memory.current.set(complete.id, blob);
        if (mounted.current)
          setWarning(
            "Part of this recording could not save on this device. Keep this tab open and download it.",
          );
      }
      if (!blob.size)
        errors.current.set(
          complete.id,
          "This recording contains no saved audio or video.",
        );
      item.chunks.length = 0;
      publish();
      // A completed segment backs up independently of the next recording.
      if (blob.size && mounted.current)
        void backup(complete.id).catch(() => undefined);
    },
    [backup, publish],
  );

  const stopSegment = useCallback(async (item: ActiveSegment | null) => {
    if (!item) return;
    if (item.recorder.state !== "inactive") {
      item.ended = performance.now();
      item.recorder.stop();
    }
    await item.stopDone;
  }, []);

  const installStream = useCallback(
    (nextStream: MediaStream) => {
      removeTrackListeners.current?.();
      media.current = nextStream;
      if (mounted.current) setStream(nextStream);
      const interrupted = () => {
        if (media.current !== nextStream) return;
        clearRollover();
        const item = active.current;
        active.current = null;
        nextStream.getTracks().forEach((track) => {
          track.enabled = false;
        });
        if (mounted.current) {
          setStatus("paused");
          setError(
            "Your camera or microphone became unavailable. The part already recorded is being saved. Check your devices, then continue when you are ready.",
          );
        }
        void stopSegment(item).catch((cause) => {
          if (mounted.current) setError(friendlyError(cause));
        });
      };
      removeTrackListeners.current = listenForCaptureInterruption(
        nextStream,
        interrupted,
      );
    },
    [clearRollover, stopSegment],
  );

  const beginSegment = useCallback(async (): Promise<ActiveSegment> => {
    const currentSession = session.current;
    const currentStream = media.current;
    if (!currentSession || !currentStream)
      throw new Error("Start the interview before recording.");
    requireInterviewAudioTrack(currentStream);
    if (currentStream.getTracks().some((track) => track.readyState !== "live"))
      throw new Error(
        "Your camera or microphone disconnected. Continue to reconnect your device.",
      );
    const mimeType = mimeTypeFor(currentSession.kind);
    const recorder = new MediaRecorder(currentStream, {
      ...(mimeType ? { mimeType } : {}),
      ...(currentSession.kind === "video"
        ? { videoBitsPerSecond: 1_500_000 }
        : {}),
      audioBitsPerSecond: 96_000,
    });
    const now = new Date().toISOString();
    const take: ArchiveLocalTake = {
      id: crypto.randomUUID(),
      collectionId,
      questionId: `interview:${currentSession.id}`,
      prompt: "Interview recording",
      kind: currentSession.kind,
      text: "",
      createdAt: now,
      updatedAt: now,
      mimeType:
        recorder.mimeType ||
        mimeType ||
        (currentSession.kind === "video" ? "video/webm" : "audio/webm"),
      state: "recording",
      archive: {
        version: 1,
        sessionId: currentSession.id,
        sessionStartedAt: currentSession.startedAt,
        startMs: Math.max(
          0,
          Math.round(performance.now() - currentSession.origin),
        ),
      },
    };
    // Do not collect someone's story until an initial durable write succeeds.
    await putLocalTake(take);
    if (!mounted.current) throw new Error("Recording was cancelled.");
    const item: ActiveSegment = {
      recorder,
      take,
      chunks: [],
      writes: Promise.resolve(),
      started: 0,
      stopDone: Promise.resolve(),
      finish: () => {},
    };
    item.stopDone = new Promise((resolve) => {
      item.finish = resolve;
    });
    let index = 0;
    recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      item.chunks.push(event.data);
      const chunkIndex = index++;
      const elapsedSeconds = Math.max(
        0,
        (performance.now() - item.started) / 1000,
      );
      item.writes = item.writes
        .then(async () => {
          await appendTakeChunk(
            take.id,
            chunkIndex,
            event.data,
            elapsedSeconds,
          );
          durable.current.set(take.id, true);
          const current = stored.current.get(take.id);
          if (current)
            stored.current.set(take.id, {
              ...current,
              durationSeconds: elapsedSeconds,
            });
          publish();
        })
        .catch(() => {
          durable.current.set(take.id, false);
          if (mounted.current)
            setError(
              "Recording paused because device storage is unavailable. Keep this tab open and download the recording.",
            );
          if (active.current === item) {
            clearRollover();
            active.current = null;
            currentStream.getTracks().forEach((track) => {
              track.enabled = false;
            });
            if (mounted.current) setStatus("paused");
          }
          if (recorder.state !== "inactive") {
            item.ended = performance.now();
            recorder.stop();
          }
        });
    };
    recorder.onerror = () => {
      if (mounted.current)
        setError(
          "Recording was interrupted. Review the saved part before continuing.",
        );
      if (active.current === item) {
        clearRollover();
        active.current = null;
        currentStream.getTracks().forEach((track) => {
          track.enabled = false;
        });
        if (mounted.current) setStatus("paused");
      }
      if (recorder.state !== "inactive") {
        item.ended = performance.now();
        recorder.stop();
      }
    };
    recorder.onstop = () => {
      if (active.current === item) {
        active.current = null;
        clearRollover();
        currentStream.getTracks().forEach((track) => {
          track.enabled = false;
        });
        if (mounted.current) setStatus("paused");
      }
      const work = finishSegment(item).finally(() => {
        finalizing.current.delete(work);
        item.finish();
        publish();
      });
      finalizing.current.add(work);
      publish();
      void work.catch((cause) => {
        if (mounted.current) setError(friendlyError(cause));
      });
    };
    // The initial metadata is already durable. Finalization corrects its start
    // timestamp to the actual recorder start, preserving millisecond timing.
    item.started = performance.now();
    take.archive.startMs = Math.max(
      0,
      Math.round(item.started - currentSession.origin),
    );
    stored.current.set(take.id, take);
    durable.current.set(take.id, false);
    try {
      recorder.start(1000);
    } catch (cause) {
      const failed: ArchiveLocalTake = {
        ...take,
        state: "local",
        archive: { ...take.archive, durationMs: 0 },
      };
      stored.current.set(take.id, failed);
      emptyAttempts.current.add(take.id);
      errors.current.set(
        take.id,
        "This recording could not start. No audio or video was collected.",
      );
      await putLocalTake(failed).catch(() => undefined);
      publish();
      throw cause;
    }
    publish();
    return item;
  }, [clearRollover, collectionId, finishSegment, publish]);

  const scheduleRollover = useCallback(
    function schedule() {
      clearRollover();
      rollover.current = setTimeout(() => {
        void (async () => {
          if (transitioning.current || !active.current) return;
          await acquireTransition();
          const previous = active.current;
          try {
            // Start the next complete file before closing the old one. The small
            // overlap is explicit in session timestamps rather than losing speech.
            const next = await beginSegment();
            active.current = next;
            await stopSegment(previous);
            if (active.current === next) schedule();
          } catch (cause) {
            if (mounted.current)
              setError(
                `${friendlyError(cause)} Your current recording is being preserved.`,
              );
            active.current = null;
            await stopSegment(previous);
            media.current?.getTracks().forEach((track) => {
              track.enabled = false;
            });
            if (mounted.current) setStatus("paused");
          } finally {
            completeTransition();
          }
        })();
      }, ARCHIVE_SEGMENT_MS);
    },
    [
      acquireTransition,
      beginSegment,
      clearRollover,
      completeTransition,
      stopSegment,
    ],
  );

  const start = useCallback(
    async (
      sessionId: string,
      kind: "voice" | "video",
      sessionStartedAt?: string,
      devices: InterviewDevices = {},
    ) => {
      if (transitioning.current || active.current || media.current)
        throw new Error(
          "A recording is already open. Pause or finish it first.",
        );
      await acquireTransition();
      setStatus("starting");
      setError("");
      try {
        if (
          !navigator.mediaDevices?.getUserMedia ||
          typeof MediaRecorder === "undefined"
        )
          throw new Error(
            "This browser cannot record. Try an updated browser.",
          );
        deviceLockRelease.current ??=
          await claimRecordingDeviceLock(collectionId);
        const persistent = await requestRecordingStorage();
        if (!persistent)
          setWarning(
            "This browser may clear device storage. Wait for backup confirmation and download important recordings.",
          );
        const recovered = [...stored.current.values()].find(
          (take) => take.archive.sessionId === sessionId,
        );
        const startedAt =
          sessionStartedAt ??
          recovered?.archive.sessionStartedAt ??
          new Date().toISOString();
        const offset = archiveTimelineOffset(startedAt, Date.now());
        session.current = {
          id: sessionId,
          kind,
          startedAt,
          origin: performance.now() - offset,
          devices: { ...devices },
        };
        const nextStream = await requestCaptureStream(kind, devices);
        if (!mounted.current) {
          nextStream.getTracks().forEach((track) => track.stop());
          throw new Error("Recording was cancelled.");
        }
        installStream(nextStream);
        active.current = await beginSegment();
        setStatus("recording");
        scheduleRollover();
        return nextStream;
      } catch (cause) {
        // installStream updates this ref inside a callback.
        (media.current as MediaStream | null)
          ?.getTracks()
          .forEach((track) => track.stop());
        removeTrackListeners.current?.();
        deviceLockRelease.current?.();
        deviceLockRelease.current = null;
        media.current = null;
        if (mounted.current) {
          setStream(null);
          setStatus("idle");
          setError(friendlyError(cause));
        }
        throw cause;
      } finally {
        completeTransition();
      }
    },
    [
      acquireTransition,
      beginSegment,
      collectionId,
      completeTransition,
      installStream,
      scheduleRollover,
    ],
  );

  const pause = useCallback(async () => {
    // Wait for an in-flight rollover, while immediately silencing capture.
    media.current?.getTracks().forEach((track) => {
      track.enabled = false;
    });
    await acquireTransition();
    if (!media.current) {
      completeTransition();
      return;
    }
    clearRollover();
    const item = active.current;
    active.current = null;
    // Stop incoming camera and microphone content as soon as Pause is pressed.
    media.current.getTracks().forEach((track) => {
      track.enabled = false;
    });
    try {
      await stopSegment(item);
      if (mounted.current) setStatus("paused");
    } finally {
      completeTransition();
    }
  }, [acquireTransition, clearRollover, completeTransition, stopSegment]);

  const resume = useCallback(
    async (devices?: InterviewDevices) => {
      if (transitioning.current || active.current)
        throw new Error("The recording is already running or saving.");
      if (!media.current || !session.current)
        throw new Error("Start the interview to continue recording.");
      await acquireTransition();
      setError("");
      try {
        const nextDevices = devices ?? session.current.devices;
        const changed =
          nextDevices.microphoneId !== session.current.devices.microphoneId ||
          nextDevices.cameraId !== session.current.devices.cameraId;
        if (
          changed ||
          media.current.getTracks().some((track) => track.readyState !== "live")
        ) {
          // The previous segment has finished before changing capture devices.
          media.current.getTracks().forEach((track) => track.stop());
          const nextStream = await requestCaptureStream(
            session.current.kind,
            nextDevices,
          );
          if (!mounted.current) {
            nextStream.getTracks().forEach((track) => track.stop());
            throw new Error("Recording was cancelled.");
          }
          installStream(nextStream);
          session.current.devices = { ...nextDevices };
        }
        // A prior interruption was handled once. Explicit resume rearms it.
        installStream(media.current);
        media.current.getTracks().forEach((track) => {
          track.enabled = true;
        });
        active.current = await beginSegment();
        setStatus("recording");
        scheduleRollover();
        return media.current;
      } catch (cause) {
        media.current?.getTracks().forEach((track) => {
          track.enabled = false;
        });
        if (mounted.current) {
          setStatus("paused");
          setError(friendlyError(cause));
        }
        throw cause;
      } finally {
        completeTransition();
      }
    },
    [
      acquireTransition,
      beginSegment,
      completeTransition,
      installStream,
      scheduleRollover,
    ],
  );

  const stop = useCallback(async () => {
    await acquireTransition();
    clearRollover();
    if (mounted.current) setStatus("stopping");
    const item = active.current;
    active.current = null;
    try {
      await stopSegment(item);
      await Promise.all([...finalizing.current]);
      await Promise.allSettled([...uploads.current.values()]);
    } finally {
      media.current?.getTracks().forEach((track) => track.stop());
      removeTrackListeners.current?.();
      deviceLockRelease.current?.();
      deviceLockRelease.current = null;
      media.current = null;
      if (mounted.current) {
        setStream(null);
        setStatus("idle");
      }
      completeTransition();
    }
  }, [acquireTransition, clearRollover, completeTransition, stopSegment]);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    void (async () => {
      const release = await claimRecordingDeviceLock(collectionId);
      try {
        const takes = (await listLocalTakes(collectionId)).filter(
          isArchiveTake,
        );
        for (const take of takes) {
          if (cancelled) return;
          // Do not overwrite a segment created while recovery was loading.
          if (stored.current.has(take.id)) continue;
          const recovered = recoverInterruptedArchive(take);
          try {
            const hasSavedBytes = (await getTakeBlob(take)).size > 0;
            durable.current.set(take.id, hasSavedBytes);
            if (isEmptyArchiveAttempt(recovered, hasSavedBytes))
              emptyAttempts.current.add(take.id);
          } catch {
            durable.current.set(take.id, false);
          }
          if (recovered.archive.recovered && !durable.current.get(take.id)) {
            errors.current.set(
              take.id,
              "This interrupted recording has no saved content.",
            );
          }
          stored.current.set(take.id, recovered);
          if (take.state === "recording")
            await putLocalTake(recovered).catch(() => undefined);
        }
        publish();
        if (!cancelled) setRecoveryReady(true);
      } finally {
        release();
      }
    })().catch((cause) => {
      if (!cancelled) {
        setWarning(friendlyError(cause));
        setRecoveryReady(true);
      }
    });
    return () => {
      cancelled = true;
      mounted.current = false;
      clearRollover();
      const item = active.current;
      active.current = null;
      if (item?.recorder.state !== "inactive" && item) {
        item.ended = performance.now();
        item.recorder.stop();
      }
      media.current?.getTracks().forEach((track) => track.stop());
      removeTrackListeners.current?.();
      deviceLockRelease.current?.();
      deviceLockRelease.current = null;
      media.current = null;
    };
  }, [clearRollover, collectionId, publish]);

  useEffect(() => {
    if (!recoveryEnabled || !recoveryReady) return;
    let cancelled = false;
    const recover = async () => {
      for (const take of stored.current.values()) {
        if (cancelled) return;
        if (
          take.state !== "local" ||
          emptyAttempts.current.has(take.id) ||
          !durable.current.get(take.id) ||
          recoveryAttempts.current.has(take.id)
        )
          continue;
        recoveryAttempts.current.add(take.id);
        // Upload only after the server has authorized this owner. Capture never
        // restarts automatically, and failed backups keep their local chunks.
        await backup(take.id).catch(() => {});
      }
    };
    const retryOnline = () => {
      recoveryAttempts.current.clear();
      void recover();
    };
    void recover();
    window.addEventListener("online", retryOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", retryOnline);
    };
  }, [backup, recoveryEnabled, recoveryReady]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (
        active.current ||
        uploads.current.size ||
        finalizing.current.size ||
        [...memory.current.keys()].some(
          (id) => stored.current.get(id)?.state !== "backed_up",
        )
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  return {
    start,
    recovering: !recoveryReady,
    pause,
    resume,
    stop,
    retry,
    getBlob,
    stream,
    status,
    recordings,
    error,
    warning,
    saving,
    pendingCount: recordings.filter(
      (take) =>
        take.state !== "backed_up" &&
        !take.empty &&
        (take.durationMs > 0 || take.state === "recording"),
    ).length,
  };
}

export default useInterviewArchive;
