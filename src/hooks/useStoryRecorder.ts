"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { claimRecordingDeviceLock } from "@/lib/collection/recording-device-lock";
import type { AnswerTake } from "@/lib/collection/types";
import {
  listenForCaptureInterruption,
  requireActiveCapture,
  requireInterviewAudioTrack,
} from "@/lib/collection/interview-devices";
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

import {
  confirmSavedMediaSelection,
  latestMediaSelection,
} from "@/lib/collection/saved-media-selection";

import {
  createInputMonitor,
  flushAndStopRecorder,
  type InputMonitor,
  type InputMonitorState,
} from "@/lib/audio/input-monitor";

const MAX_SECONDS = 10 * 60;
export const NOT_SAVED_WARNING =
  "Not saved yet. Keep this tab open and download your recording.";

export type StoryRecorderOptions = {
  collectionId: string;
  accessKey: string;
  kind: "video" | "voice";
  questionId: string;
  momentId?: string;
  prompt: string;
  onSaved?: (take: AnswerTake) => void;
  onMediaSaved?: (media: {
    mediaId: string;
    kind: "video" | "voice";
    durationSeconds?: number;
    localTakeId: string;
  }) => void | Promise<void>;
  onBusyChange?: (busy: boolean) => void;
  onPendingChange?: (pending: boolean) => void;
  disabled?: boolean;
  directUpload?: boolean;
  /** Retained for callers; recovered bytes now always require an explicit Keep choice. */
  autoRecoverBackup?: boolean;
  suggestedDuration?: string;
  maxSeconds?: number;
};

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
    return "Camera or microphone access was not allowed. Enable microphone access in your browser settings and try again. You can choose audio only if you prefer.";
  if (error instanceof DOMException && error.name === "NotFoundError")
    return "No camera or microphone was found. Connect a microphone, then choose audio only if you do not have a camera.";
  return error instanceof Error
    ? error.message
    : "Recording could not start. Check your microphone and browser permissions, then try again.";
}

async function responseData(
  response: Response,
): Promise<{ mediaId?: string; text?: string }> {
  const value: unknown = await response.json().catch(() => null);
  const data =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  if (!response.ok)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "Your recording could not be backed up yet.",
    );
  return {
    ...(typeof data.mediaId === "string" ? { mediaId: data.mediaId } : {}),
    ...(typeof data.text === "string" ? { text: data.text } : {}),
  };
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

export function useStoryRecorder({
  collectionId,
  accessKey,
  kind,
  questionId,
  momentId,
  prompt,
  onSaved,
  onMediaSaved,
  onBusyChange,
  onPendingChange,
  disabled = false,
  directUpload = false,
  maxSeconds = MAX_SECONDS,
}: StoryRecorderOptions) {
  const limit = Math.min(MAX_SECONDS, Math.max(30, maxSeconds));
  const endpoint = `/api/collection/${encodeURIComponent(collectionId)}`;
  const query = `?key=${encodeURIComponent(accessKey)}`;
  const [checkingLocal, setCheckingLocal] = useState(true);
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
  const [inputLevel, setInputLevel] = useState(0);
  const [inputState, setInputState] =
    useState<InputMonitorState>("unavailable");
  const [recoveryIds, setRecoveryIds] = useState<string[]>([]);
  const [deferredRecoveryIds, setDeferredRecoveryIds] = useState<string[]>([]);
  const inputMonitor = useRef<InputMonitor | null>(null);
  const interruptedOnHide = useRef(false);
  const recoveryChoosing = useRef(false);
  const video = useRef<HTMLVideoElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const audioRecorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const active = useRef<LocalTake | null>(null);
  const chunks = useRef<Blob[]>([]);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const startedAt = useRef(0);
  const mounted = useRef(true);
  const deviceLockRelease = useRef<(() => void) | null>(null);
  const capturePending = useRef(false);
  const backupPending = useRef(false);
  const mediaSelection = Boolean(onMediaSaved);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const onMediaSavedRef = useRef(onMediaSaved);
  onMediaSavedRef.current = onMediaSaved;
  const internallyBusy = phase !== "idle" || uploading !== null;
  const busy = internallyBusy || disabled || checkingLocal;
  const memoryOnly = takes.some(
    (take) =>
      take.state !== "backed_up" &&
      fallbacks[take.id] &&
      localCopies[take.id] !== true,
  );

  const refresh = useCallback(async () => {
    try {
      const stored = await listLocalTakes(collectionId, questionId);
      const checks = await Promise.all(
        stored
          .filter(
            (take) =>
              (mediaSelection || take.kind === kind) &&
              take.state !== "backed_up",
          )
          .map(
            async (take) => [take.id, await hasDurableLocalCopy(take)] as const,
          ),
      );
      if (mounted.current) {
        setRecoveryIds(
          stored
            .filter(
              (take) =>
                (mediaSelection || take.kind === kind) &&
                take.state !== "backed_up" &&
                checks.some(([id, durable]) => id === take.id && durable) &&
                take.id !== active.current?.id,
            )
            .map((take) => take.id),
        );
        setDeferredRecoveryIds([]);
      }
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
            ...stored.filter((item) => mediaSelection || item.kind === kind),
            ...memoryOnly,
          ];
        });
    } catch (error) {
      if (mounted.current) setStorageWarning(friendlyRecordingError(error));
    } finally {
      if (mounted.current) setCheckingLocal(false);
    }
  }, [collectionId, questionId, kind, mediaSelection]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);
  const latestSelection = latestMediaSelection(
    takes.filter((take) => !recoveryIds.includes(take.id)),
  );
  const pendingSelection =
    checkingLocal ||
    (mediaSelection &&
      Boolean(latestSelection && latestSelection.state !== "backed_up"));
  useEffect(() => {
    onPendingChange?.(pendingSelection);
  }, [onPendingChange, pendingSelection]);
  useEffect(() => {
    onBusyChange?.(internallyBusy || memoryOnly);
    return () => onBusyChange?.(false);
  }, [internallyBusy, memoryOnly, onBusyChange]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      const memoryOnly = takes.some(
        (take) =>
          take.state !== "backed_up" &&
          fallbacks[take.id] &&
          localCopies[take.id] !== true,
      );
      if (phase !== "idle" || uploading || memoryOnly) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase, uploading, takes, fallbacks, localCopies]);
  useEffect(() => {
    const suspend = () => {
      interruptedOnHide.current = true;
      flushAndStopRecorder(recorder.current);
      flushAndStopRecorder(audioRecorder.current);
      inputMonitor.current?.close();
    };
    window.addEventListener("pagehide", suspend);
    return () => {
      window.removeEventListener("pagehide", suspend);
      suspend();
      stream.current?.getTracks().forEach((track) => track.stop());
      deviceLockRelease.current?.();
      deviceLockRelease.current = null;
    };
  }, []);
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
          ...(momentId ? { momentId } : {}),
        }),
      });
      const result = await responseData(
        await fetch(`${endpoint}/media${query}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaId, ...(momentId ? { momentId } : {}) }),
        }),
      );
      return result.mediaId ?? mediaId;
    }
    const form = new FormData();
    form.append("file", blob, name);
    if (momentId) form.append("momentId", momentId);
    const result = await responseData(
      await fetch(`${endpoint}/media${query}`, { method: "POST", body: form }),
    );
    if (!result.mediaId)
      throw new Error(
        "The recording upload was not confirmed. Your device copy is preserved.",
      );
    return result.mediaId;
  }

  async function backup(take: LocalTake, blobOverride?: Blob) {
    if (backupPending.current || disabled || !mounted.current) return;
    backupPending.current = true;
    setUploading(take.id);
    setError("");
    let current = take;
    let recordingBlob = blobOverride;
    try {
      if (!current.mediaId) {
        const blob = blobOverride ?? (await getTakeBlob(take));
        recordingBlob = blob;
        if (!blob.size)
          throw new Error("This take is empty. Please record another take.");
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
        if (!mounted.current) return;
        current = await confirmSavedMediaSelection(current, async (saved) => {
          if (!mounted.current)
            throw new Error(
              "Reopen this story to finish saving your recording.",
            );
          await onMediaSavedRef.current!({
            mediaId: saved.mediaId!,
            kind: saved.kind as "video" | "voice",
            durationSeconds: saved.durationSeconds,
            localTakeId: saved.id,
          });
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
            momentId
              ? "Your recording is saved to this story. Listen, then submit when you are ready."
              : "Your recording is backed up. Review it, then choose Send my message when you are ready.",
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
            ...(/^q[1-4]$/.test(current.questionId)
              ? { replaceChapterId: current.questionId }
              : {}),
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
          // Link an uploaded audio sidecar before the server transcribes it.
          if (current.audioMediaId) {
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
          }
          const transcription = await responseData(
            await fetch(`${endpoint}/transcribe${query}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mediaId: current.audioMediaId ?? current.mediaId,
                takeId: current.id,
              }),
            }),
          );
          if (typeof transcription.text !== "string")
            throw new Error("Transcription did not return saved words.");
          current = {
            ...current,
            text: transcription.text,
            transcriptionStatus: "ready",
          };
          onSavedRef.current?.(answerFromLocal(current));
        }
      } catch {
        current = { ...current, transcriptionStatus: "failed" };
        onSavedRef.current?.(answerFromLocal(current));
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
              : current.mediaId
                ? `${friendlyRecordingError(error)} The uploaded recording is kept. Try saving it to this story again.`
                : "We could not find a saved recording for this take. Please record another take.",
        );
        setTakes((previous) => [
          ...previous.filter((item) => item.id !== current.id),
          { ...current, state: "local" },
        ]);
      }
    } finally {
      backupPending.current = false;
      if (mounted.current) setUploading(null);
    }
  }

  async function keepRecovered(take: LocalTake) {
    if (busy || recoveryChoosing.current) return;
    recoveryChoosing.current = true;
    setPhase("saving");
    try {
      const release = await claimRecordingDeviceLock(collectionId);
      try {
        if (!mounted.current) return;
        setRecoveryIds((ids) => ids.filter((id) => id !== take.id));
        setDeferredRecoveryIds((ids) => ids.filter((id) => id !== take.id));
        await backup(
          take.state === "recording" ? { ...take, state: "local" } : take,
          fallbacks[take.id],
        );
      } finally {
        release();
      }
    } catch (cause) {
      if (mounted.current) setError(friendlyRecordingError(cause));
    } finally {
      recoveryChoosing.current = false;
      if (mounted.current) setPhase("idle");
    }
  }
  function deferRecovered(takeId: string) {
    setDeferredRecoveryIds((ids) => [...new Set([...ids, takeId])]);
  }
  function reviewRecovered() {
    setDeferredRecoveryIds([]);
  }
  function resumeInputMeter() {
    void inputMonitor.current?.resumeFromGesture();
  }

  async function start() {
    if (capturePending.current || busy) return;
    capturePending.current = true;
    interruptedOnHide.current = false;
    inputMonitor.current?.close();
    inputMonitor.current = createInputMonitor({
      onLevel: (level) => {
        if (mounted.current) setInputLevel(level);
      },
      onState: (state) => {
        if (mounted.current) setInputState(state);
      },
    });
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
          "This browser does not support recording. Open your interview link in an updated browser to record your answer.",
        );
      deviceLockRelease.current ??=
        await claimRecordingDeviceLock(collectionId);
      await requestRecordingStorage();
      if (!mounted.current) throw new Error("Recording was cancelled.");
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
      requireActiveCapture(mediaStream, mounted.current);
      stream.current = mediaStream;
      requireInterviewAudioTrack(mediaStream);
      try {
        inputMonitor.current?.attach(mediaStream);
      } catch {
        setInputState("unavailable");
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
      requireActiveCapture(mediaStream, mounted.current);
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
      const stopObserving = listenForCaptureInterruption(mediaStream, () => {
        if (mediaRecorder.state !== "recording") return;
        if (mounted.current)
          setError(
            "Your microphone or camera stopped. We are saving the recorded portion. Check it before submitting.",
          );
        mediaRecorder.stop();
      });
      mediaRecorder.onstop = async () => {
        stopObserving();
        if (mounted.current) setPhase("saving");
        if (speechRecorder?.state === "recording") speechRecorder.stop();
        await speechStopped;
        mediaStream.getTracks().forEach((track) => track.stop());
        inputMonitor.current?.close();
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
        // A page suspension asks for review on return. Never upload a recovered take before Keep.
        if (interruptedOnHide.current && mounted.current && durable) {
          setRecoveryIds((ids) => [...new Set([...ids, complete.id])]);
          setMessage(
            "Recording paused when the page closed. Review the recovered portion before keeping it.",
          );
        }
        // Keep the original chunks on this device even after a successful backup.
        if (blob.size && mounted.current && !interruptedOnHide.current)
          await backup(complete, blob);
        deviceLockRelease.current?.();
        deviceLockRelease.current = null;
        capturePending.current = false;
      };
      startedAt.current = Date.now();
      speechRecorder?.start(1000);
      mediaRecorder.start(1000);
      setPhase("recording");
    } catch (error) {
      inputMonitor.current?.close();
      if (audioRecorder.current?.state === "recording")
        audioRecorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
      deviceLockRelease.current?.();
      deviceLockRelease.current = null;
      capturePending.current = false;
      if (mounted.current) {
        setError(friendlyRecordingError(error));
        setPhase("idle");
      }
    }
  }

  function stop() {
    if (recorder.current?.state === "recording") {
      setPhase("saving");
      flushAndStopRecorder(recorder.current);
    }
  }
  const pending = takes.filter(
    (take) =>
      !recoveryIds.includes(take.id) &&
      (onMediaSaved || take.state !== "backed_up"),
  );
  const recoveredTakes = takes.filter(
    (take) =>
      recoveryIds.includes(take.id) && !deferredRecoveryIds.includes(take.id),
  );
  return {
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
    deferredRecoveryCount: deferredRecoveryIds.length,
    reviewRecovered,
  };
}
