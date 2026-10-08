"use client";

import Link from "next/link";
import { Logo } from "@/components/Logo";
import { BrandPattern } from "@/components/BrandPattern";
import { AppIcon } from "@/components/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  Conversation,
  MessagePayload,
  PartialOptions,
} from "@elevenlabs/client";
import type {
  CollectionView,
  InterviewSession,
  InterviewTurn,
  InterviewChapterId,
} from "@/lib/collection/types";
import { interviewResumeState } from "@/lib/collection/interview-resume";
import { CHAPTERS, getChapterQuestion } from "@/lib/interview-state";
import { isMeaningfulInterviewSpeech } from "@/lib/collection/interview-speech";
import { canChangeInterviewTheme } from "@/lib/collection/interview-theme-transition";
import {
  detectInterviewThemeFromQuestion,
  interviewChapterTitle,
  nextUnansweredChapterId,
} from "@/lib/collection/interview-progress";
import { collectionRequest } from "@/lib/collection/client-request";
import { interviewSaveNeedsConfirmation } from "@/lib/collection/interview-review-backup";
import { stripConversationPerformanceCues } from "@/lib/collection/conversation-copy";
import { classifyInterviewMessage } from "@/lib/collection/interview-message-identity";
import {
  startConnectionCue,
  type ConnectionCue,
} from "@/lib/collection/connection-cue";
import {
  acknowledgeInterviewCommand,
  appendInterviewCommand,
  readInterviewJournal,
  type InterviewCommand,
} from "@/lib/collection/interview-journal";
import { useInterviewArchive } from "./useInterviewArchive";
import { InterviewPresence } from "./InterviewPresence";
import { InterviewProgress } from "./InterviewProgress";
import { InterviewDeviceSetup } from "./InterviewDeviceSetup";
import RecordingBackupProgress from "./RecordingBackupProgress";
import {
  createInterviewPlayback,
  acceptInterviewConnection,
  restoreInterviewAudio,
  type InterviewPlayback,
} from "@/lib/collection/interview-playback";
import {
  interviewDeviceError,
  isInterviewMicrophoneFailure,
  muteInterviewMicrophone,
  requireInterviewAudioTrack,
  type InterviewDevices,
} from "@/lib/collection/interview-devices";

const primary =
  "min-h-12 rounded-full bg-espresso px-6 py-3 text-base font-medium text-white transition-colors hover:bg-espresso-600 disabled:opacity-50";
const secondary =
  "min-h-12 rounded-full border border-warmgray-200 bg-white px-5 py-3 text-base font-medium text-ink-700 transition-colors hover:bg-paper-200 disabled:opacity-50";
type Phase =
  "ready" | "connecting" | "talking" | "paused" | "interrupted" | "finishing";
type ConnectionStage =
  "saving" | "preparing" | "devices" | "voice" | "confirming";
const connectionStageLabels: Record<ConnectionStage, string> = {
  saving: "Saving your earlier answers",
  preparing: "Preparing your private conversation",
  devices: "Opening your microphone",
  voice: "Connecting audio",
  confirming: "Audio connected",
};
const friendly = (e: unknown) =>
  e instanceof Error ? e.message : "That did not finish. Please try again.";
type InterviewConnection = "webrtc" | "websocket";
let conversationModule:
  Promise<typeof import("@elevenlabs/client")> | undefined;
function loadConversation() {
  conversationModule ??= import("@elevenlabs/client").catch((cause) => {
    conversationModule = undefined;
    throw cause;
  });
  return conversationModule;
}
function warmConversation() {
  void loadConversation().catch(() => {});
}

function CameraPreview({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  if (!stream?.getVideoTracks().length) return null;
  return (
    <video
      ref={ref}
      autoPlay
      muted
      playsInline
      className="aspect-video w-full rounded-xl border border-white/20 bg-ink-800 object-cover shadow-soft"
      aria-label="Your camera preview"
    />
  );
}

export default function LiveInterview({
  collectionId,
  accessKey,
  rerecordChapterId,
}: {
  collectionId: string;
  accessKey: string;
  rerecordChapterId?: InterviewChapterId;
}) {
  const router = useRouter();
  const base = `/api/collection/${encodeURIComponent(collectionId)}`;
  const query = `?key=${encodeURIComponent(accessKey)}`;
  const [collection, setCollection] = useState<CollectionView | null>(null);
  const collectionRef = useRef<CollectionView | null>(null);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<Phase>("ready");
  const [mode, setMode] = useState<"speaking" | "listening">("listening");
  const [sessionId, setSessionId] = useState("");
  const sessionRef = useRef<InterviewSession | null>(null);
  const [kind, setKind] = useState<"video" | "voice">("video");
  const [devices, setDevices] = useState<InterviewDevices>({});
  const [microphoneMuted, setMicrophoneMuted] = useState(false);
  const microphoneMutedRef = useRef(false);
  const interviewerPlayback = useRef<InterviewPlayback | null>(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [connectionTakingLong, setConnectionTakingLong] = useState(false);
  const [connectionStage, setConnectionStage] =
    useState<ConnectionStage>("saving");
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [availabilityNotice, setAvailabilityNotice] = useState("");
  const connectionTypeRef = useRef<InterviewConnection>("webrtc");
  const connectionAttempt = useRef(0);
  const [connectionSound, setConnectionSound] = useState(true);
  const [question, setQuestion] = useState<string>(CHAPTERS[0].question);
  const [pending, setPending] = useState<InterviewCommand[]>([]);
  const [savingWords, setSavingWords] = useState(false);
  const [working, setWorking] = useState(false);
  const [restartConfirm, setRestartConfirm] = useState(false);
  const [leaveNotice, setLeaveNotice] = useState("");
  const [activeChapterId, setActiveChapterId] =
    useState<InterviewChapterId>("q1");
  const theme = useRef<InterviewChapterId>("q1");
  const client = useRef<Conversation | null>(null);
  const connectionCue = useRef<ConnectionCue | null>(null);
  const connectionInFlight = useRef(false);
  const intentionalStop = useRef(false);
  const mounted = useRef(true);
  const sequence = useRef(0);
  const connectionEpoch = useRef("");
  const messages = useRef(new Map<string, InterviewTurn>());
  const controlEchoes = useRef<string[]>([]);
  const requestQueue = useRef<Promise<unknown>>(Promise.resolve());
  const flushing = useRef<Promise<void> | null>(null);
  const localWrites = useRef<Promise<unknown>>(Promise.resolve());
  const queuedLocalWrites = useRef(0);
  const [localWriteCount, setLocalWriteCount] = useState(0);
  const unsavedMemory = useRef<InterviewCommand[]>([]);
  const [memoryWarning, setMemoryWarning] = useState(false);
  const [journalReady, setJournalReady] = useState(false);
  const [journalError, setJournalError] = useState("");
  const [journalChecking, setJournalChecking] = useState(true);
  const submitting = useRef(false);
  const lastMessageAt = useRef(0);
  const restoredPosition = useRef(false);
  const choseKind = useRef(false);
  const heardAnswerSinceQuestion = useRef(false);
  /** User turns heard since the interviewer last spoke (the current answer). */
  const currentAnswerTurnIds = useRef<string[]>([]);
  const liveAnsweredThemes = useRef(new Set<InterviewChapterId>());
  const explicitNextTheme = useRef<InterviewChapterId | null>(null);
  const [inputLevel, setInputLevel] = useState(0);
  const [inputNeedsCheck, setInputNeedsCheck] = useState(false);
  const [inputNotice, setInputNotice] = useState("");

  useEffect(() => {
    setConnectionTakingLong(false);
    if (phase !== "connecting") return;
    const timer = window.setTimeout(() => setConnectionTakingLong(true), 8000);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const apply = useCallback((c: CollectionView) => {
    collectionRef.current = c;
    if (mounted.current) setCollection(c);
    const id = sessionRef.current?.id;
    if (id)
      sessionRef.current =
        c.interviews?.find((s) => s.id === id) ?? sessionRef.current;
  }, []);

  useEffect(() => {
    if (
      collection?.role === "owner" &&
      collection.status !== "approved" &&
      collection.interviewPreparation &&
      !rerecordChapterId &&
      !collection.draftOutdated &&
      !collection.interviewPreparation.missingAreas?.length &&
      phase === "ready"
    ) {
      router.replace(
        `/collection/${encodeURIComponent(collectionId)}/complete${query}`,
      );
    }
  }, [collection, collectionId, phase, query, rerecordChapterId, router]);

  useEffect(() => {
    // Download code while the person reads the introduction. This neither opens
    // a device nor creates a provider session or incurs a conversation charge.
    if (collection?.role === "owner" && collection.capabilities.liveInterview)
      warmConversation();
  }, [collection?.role, collection?.capabilities.liveInterview]);

  const request = useCallback(
    (path: string, body?: unknown) => {
      const work = requestQueue.current
        .catch(() => {})
        .then(async () => {
          const data = await collectionRequest(
            `${base}${path}${query}`,
            body === undefined
              ? { cache: "no-store" }
              : {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body),
                },
          );
          if (data.collection) apply(data.collection);
          return data;
        });
      requestQueue.current = work;
      return work;
    },
    [apply, base, query],
  );

  const flush = useCallback((): Promise<void> => {
    if (flushing.current) return flushing.current;
    const run = async () => {
      setSavingWords(true);
      try {
        for (;;) {
          const commands = await readInterviewJournal(collectionId);
          if (mounted.current) setPending(commands);
          if (!commands.length) break;
          await request("/interview", commands[0].body);
          const remaining = await acknowledgeInterviewCommand(
            collectionId,
            commands[0].id,
          );
          if (mounted.current) setPending(remaining);
        }
      } finally {
        if (mounted.current) setSavingWords(false);
      }
    };
    const promise = run().finally(() => {
      flushing.current = null;
    });
    flushing.current = promise;
    return promise;
  }, [collectionId, request]);

  const openJournal = useCallback(async () => {
    setJournalChecking(true);
    setJournalError("");
    try {
      const commands = await readInterviewJournal(collectionId);
      if (!mounted.current) return;
      setPending(commands);
      setJournalReady(true);
    } catch {
      if (mounted.current)
        setJournalError(
          "Device storage could not open. Close other Time Tapestry tabs and check that this browser allows site storage, then try again. Your existing saved answers will be kept.",
        );
      return;
    } finally {
      if (mounted.current) setJournalChecking(false);
    }
    // Server backup failures do not mean device storage failed to open.
    await flush().catch((e) => {
      if (mounted.current) setError(friendly(e));
    });
  }, [collectionId, flush]);

  const enqueue = useCallback(
    (body: Record<string, unknown>) => {
      const command = { id: crypto.randomUUID(), body };
      queuedLocalWrites.current += 1;
      if (mounted.current) setLocalWriteCount(queuedLocalWrites.current);
      const write = localWrites.current
        .catch(() => {})
        .then(async () => {
          try {
            if (unsavedMemory.current.length)
              throw new Error(
                "Earlier words still need a device backup. Retry backup before continuing.",
              );
            const commands = await appendInterviewCommand(
              collectionId,
              command,
            );
            if (mounted.current) setPending(commands);
          } catch (e) {
            unsavedMemory.current.push(command);
            setMemoryWarning(true);
            throw e;
          }
        });
      const trackedWrite = write.finally(() => {
        queuedLocalWrites.current -= 1;
        if (mounted.current) setLocalWriteCount(queuedLocalWrites.current);
      });
      localWrites.current = trackedWrite;
      return trackedWrite.then(() =>
        flush().catch((e) => {
          if (mounted.current)
            setError(
              `Your words are saved on this device. Their backup needs attention. ${friendly(e)}`,
            );
        }),
      );
    },
    [collectionId, flush],
  );

  const archive = useInterviewArchive({
    collectionId,
    accessKey,
    directUpload: collection?.capabilities.directUpload ?? false,
    recoveryEnabled: collection?.role === "owner",
    onSegmentSaved: async (segment, savedSessionId) => {
      await request("/interview", {
        action: "attach_segment",
        sessionId: savedSessionId,
        segment,
      });
    },
  });
  useEffect(() => {
    if (!collection || collection.role !== "owner" || restoredPosition.current)
      return;
    const saved = interviewResumeState(collection);
    restoredPosition.current = true;
    theme.current = rerecordChapterId ?? saved.chapterId;
    setActiveChapterId(theme.current);
    setQuestion(
      rerecordChapterId
        ? getChapterQuestion(rerecordChapterId, {
            recipientName: collection.recipient.name,
            faithFraming: collection.faithFraming,
          })
        : saved.question,
    );
    setKind(saved.kind);
  }, [collection, rerecordChapterId]);

  useEffect(() => {
    if (phase !== "ready" || choseKind.current) return;
    const recovered = archive.recordings
      .filter((record) => record.recovered)
      .at(-1);
    if (recovered) setKind(recovered.kind);
  }, [archive.recordings, phase]);

  const archiveRef = useRef(archive);
  archiveRef.current = archive;

  const hasExistingRecordings = Boolean(
    collection?.interviews?.some((session) =>
      session.segments.some((segment) => Boolean(segment.mediaId)),
    ) ||
    collection?.takes.some(
      (take) =>
        collection.selectedTakeIds[take.questionId] === take.id &&
        take.kind !== "text" &&
        Boolean(take.mediaId),
    ) ||
    archive.recordings.some((record) => record.durationMs > 0),
  );
  const pendingWordConfirmation = interviewSaveNeedsConfirmation({
    hasSavedProgress: hasExistingRecordings,
    journalReady,
    journalChecking,
    journalError: Boolean(journalError),
    pendingWords: pending.length > 0,
    savingWords,
    memoryOnly: Boolean(memoryWarning),
    queuedWrites: localWriteCount > 0,
  });

  useEffect(() => {
    if (
      archive.status === "paused" &&
      phase === "talking" &&
      !intentionalStop.current
    ) {
      intentionalStop.current = true;
      interviewerPlayback.current?.dispose();
      interviewerPlayback.current = null;
      const interruptedClient = client.current;
      try {
        interruptedClient?.setMicMuted(true);
      } catch {
        // Closing both capture paths below remains necessary after SDK failure.
      }
      void interruptedClient?.endSession().catch(() => {});
      client.current = null;
      setPhase("paused");
      setError(
        "Recording and conversation paused. Check your saved recording before continuing.",
      );
      if (sessionRef.current)
        void enqueue({
          action: "set_status",
          sessionId: sessionRef.current.id,
          status: "paused",
        });
    }
  }, [archive.status, phase, enqueue]);

  useEffect(() => {
    if (!pending.length) return;
    const timer = window.setTimeout(() => void flush().catch(() => {}), 5000);
    return () => window.clearTimeout(timer);
  }, [pending, flush]);

  useEffect(() => {
    mounted.current = true;
    void request("").catch((e) => setError(friendly(e)));
    void openJournal();
    const retry = () => {
      void flush().catch((e) => setError(friendly(e)));
    };
    const silenceCue = () => connectionCue.current?.dispose();
    const suspend = () => {
      silenceCue();
      intentionalStop.current = true;
      connectionAttempt.current += 1;
      connectionInFlight.current = false;
      interviewerPlayback.current?.dispose();
      void client.current?.endSession().catch(() => {});
      client.current = null;
      void archiveRef.current.stop().catch(() => {});
      if (mounted.current) {
        setPhase("paused");
        setWorking(false);
      }
    };
    window.addEventListener("online", retry);
    window.addEventListener("pagehide", suspend);
    return () => {
      mounted.current = false;
      connectionAttempt.current += 1;
      intentionalStop.current = true;
      silenceCue();
      interviewerPlayback.current?.dispose();
      void client.current?.endSession();
      window.removeEventListener("online", retry);
      window.removeEventListener("pagehide", suspend);
    };
  }, [collectionId, flush, openJournal, request]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (
        ["talking", "connecting", "finishing"].includes(phase) ||
        pendingWordConfirmation ||
        queuedLocalWrites.current > 0 ||
        archive.pendingCount ||
        archive.saving
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase, pendingWordConfirmation, archive.pendingCount, archive.saving]);

  async function ensureSession(provider: "elevenlabs") {
    await localWrites.current;
    await flush();
    if (provider === "elevenlabs" && mounted.current)
      setConnectionStage("preparing");
    let c = collectionRef.current;
    if (!c) throw new Error("Your private interview is still opening.");
    // A refreshed page has no sessionRef, but the server can still remember
    // an active conversation. Pause that provider before changing modes.
    for (const previous of c.interviews ?? []) {
      if (previous.status === "active" && previous.provider !== provider) {
        await request("/interview", {
          action: "set_status",
          sessionId: previous.id,
          status: "paused",
        });
      }
    }
    c = collectionRef.current ?? c;
    let s = sessionRef.current;
    if (
      s &&
      (s.provider !== provider || s.replacesChapterId !== rerecordChapterId)
    ) {
      if (s.status === "active")
        await request("/interview", {
          action: "set_status",
          sessionId: s.id,
          status: "paused",
        });
      s = null;
    }
    if (!s || s.status === "completed") {
      s =
        [...(c.interviews ?? [])]
          .reverse()
          .find(
            (x) =>
              x.status !== "completed" &&
              x.provider === provider &&
              x.replacesChapterId === rerecordChapterId,
          ) ?? null;
    }
    if (
      s &&
      (Date.now() - Date.parse(s.startedAt) > 24 * 60 * 60 * 1000 ||
        s.turns.length >= 250 ||
        s.segments.length >= 35)
    ) {
      await request("/interview", {
        action: "set_status",
        sessionId: s.id,
        status: s.segments.length ? "completed" : "interrupted",
      });
      s = null;
    }
    if (!s) {
      const id = crypto.randomUUID();
      const data = await request("/interview", {
        action: "start",
        sessionId: id,
        provider,
        ...(rerecordChapterId ? { replaceChapterId: rerecordChapterId } : {}),
      });
      s = data.collection.interviews.find((x: InterviewSession) => x.id === id);
    }
    if (!s)
      throw new Error("The conversation could not start. Please try again.");
    sessionRef.current = s;
    setSessionId(s.id);
    sequence.current = Math.max(-1, ...s.turns.map((t) => t.sequence)) + 1;
    theme.current =
      [...s.turns].reverse().find((t) => t.role === "user" && t.chapterId)
        ?.chapterId ??
      rerecordChapterId ??
      "q1";
    setActiveChapterId(theme.current);
    return s;
  }

  function receiveMessage(message: MessagePayload) {
    const text = message.message.trim();
    if (!text || !sessionRef.current) return;
    lastMessageAt.current = Date.now();
    if (message.role === "user") {
      const controlIndex = controlEchoes.current.indexOf(text);
      if (controlIndex >= 0) {
        controlEchoes.current.splice(controlIndex, 1);
        return;
      }
      if (!isMeaningfulInterviewSpeech(text)) return;
      heardAnswerSinceQuestion.current = true;
      liveAnsweredThemes.current.add(theme.current);
      setInputNeedsCheck(false);
      setInputNotice("");
    } else {
      heardAnswerSinceQuestion.current = false;
      const spokenWords = stripConversationPerformanceCues(text);
      if (spokenWords) {
        const detectedChapterId = detectInterviewThemeFromQuestion(spokenWords);
        if (
          detectedChapterId &&
          canChangeInterviewTheme(
            theme.current,
            detectedChapterId,
            liveAnsweredThemes.current,
            explicitNextTheme.current,
            rerecordChapterId,
          )
        ) {
          explicitNextTheme.current = null;
          theme.current = detectedChapterId;
          setActiveChapterId(detectedChapterId);
        }
        setQuestion(spokenWords);
      }
    }
    const identity = classifyInterviewMessage(
      connectionEpoch.current,
      { ...message, message: text },
      messages.current,
    );
    if (identity.duplicate) return;
    const s = sessionRef.current;
    const turn: InterviewTurn = {
      id: crypto.randomUUID(),
      role: message.role,
      text,
      sequence: sequence.current++,
      capturedAt: new Date().toISOString(),
      timing: "unaligned",
      ...(message.role === "user" ? { chapterId: theme.current } : {}),
      ...(identity.supersedesTurnId
        ? { supersedesTurnId: identity.supersedesTurnId }
        : {}),
    };
    if (identity.eventKey !== null)
      messages.current.set(identity.eventKey, turn);
    if (message.role === "user") currentAnswerTurnIds.current.push(turn.id);
    else currentAnswerTurnIds.current = [];
    void enqueue({
      action: "append_turns",
      sessionId: s.id,
      turns: [turn],
    }).catch((e) => setError(`Your words need a backup. ${friendly(e)}`));
  }

  function setMicrophoneMute(muted: boolean) {
    client.current?.setMicMuted(muted);
    muteInterviewMicrophone(archiveRef.current.stream, muted);
    microphoneMutedRef.current = muted;
    setMicrophoneMuted(muted);
  }

  async function checkAvailability() {
    if (checkingAvailability || working) return;
    setCheckingAvailability(true);
    setAvailabilityNotice("");
    try {
      const result = await request("");
      if (!mounted.current) return;
      setAvailabilityNotice(
        result.collection?.capabilities.liveInterview
          ? "Voice conversations are available. Choose Start conversation when you are ready."
          : "Voice conversations are still unavailable on this page. Your saved recordings are kept.",
      );
    } catch (cause) {
      if (mounted.current) setAvailabilityNotice(friendly(cause));
    } finally {
      if (mounted.current) setCheckingAvailability(false);
    }
  }

  async function connect(
    connectionType: InterviewConnection = connectionTypeRef.current,
  ) {
    if (
      connectionInFlight.current ||
      !journalReady ||
      archive.recovering ||
      archive.status === "stopping"
    )
      return;
    connectionInFlight.current = true;
    const attempt = ++connectionAttempt.current;
    const isCurrent = () =>
      mounted.current && connectionAttempt.current === attempt;
    let attemptClient: Conversation | null = null;
    let disconnected = false;
    let failureMessage = "";
    interviewerPlayback.current?.dispose();
    const playback = createInterviewPlayback({
      onBlocked: (blocked) => {
        if (isCurrent() && !intentionalStop.current)
          setPlaybackBlocked(blocked);
      },
    });
    interviewerPlayback.current = playback;
    setPlaybackBlocked(false);
    connectionTypeRef.current = connectionType;
    setError("");
    setInputNeedsCheck(false);
    setInputNotice("");
    heardAnswerSinceQuestion.current = false;
    setConnectionFailed(false);
    setConnectionStage("saving");
    setPhase("connecting");
    setWorking(true);
    intentionalStop.current = false;
    // Fetch the client bundle alongside session setup, without opening a device.
    const sdk = loadConversation();
    void sdk.catch(() => {});
    const cue =
      connectionSound &&
      !client.current &&
      (archiveRef.current.status === "idle" ||
        archiveRef.current.status === "paused") &&
      !archiveRef.current.stream
        ?.getAudioTracks()
        .some((track) => track.enabled && track.readyState === "live")
        ? startConnectionCue()
        : null;
    connectionCue.current = cue;
    try {
      const s = await ensureSession("elevenlabs");
      if (!isCurrent()) return;
      const config = await request("/conversation/session", {
        sessionId: s.id,
        connectionType,
      });
      if (!isCurrent()) return;
      liveAnsweredThemes.current = new Set(
        (collectionRef.current?.interviews ?? []).flatMap((saved) =>
          saved.turns
            .filter(
              (turn) =>
                turn.role === "user" &&
                turn.chapterId &&
                isMeaningfulInterviewSpeech(turn.text) &&
                !saved.excludedTurnIds.includes(turn.id),
            )
            .map((turn) => turn.chapterId!),
        ),
      );
      explicitNextTheme.current = null;
      theme.current = config.currentThemeId ?? theme.current;
      setActiveChapterId(theme.current);
      await cue?.finished;
      if (!isCurrent()) return;
      setConnectionStage("devices");
      let capture: MediaStream | null;
      if (archiveRef.current.stream) {
        // A disconnect can still be finalizing its last segment. Wait for that
        // pause before opening the next segment, even if React still says recording.
        await archiveRef.current.pause();
        if (!isCurrent()) return;
        capture = await archiveRef.current.resume(devices);
      } else {
        capture = await archiveRef.current.start(
          s.id,
          kind,
          s.startedAt,
          devices,
        );
      }
      if (!isCurrent()) return;
      requireInterviewAudioTrack(capture);
      muteInterviewMicrophone(capture, microphoneMutedRef.current);
      // Resolve the default device once so both independent capture paths use it.
      const inputDeviceId =
        capture?.getAudioTracks()[0]?.getSettings().deviceId ||
        devices.microphoneId;
      const { Conversation } = await sdk;
      if (!isCurrent()) return;
      setConnectionStage("voice");
      connectionEpoch.current = crypto.randomUUID();
      const transport =
        config.connectionType === "websocket"
          ? {
              signedUrl: config.signedUrl as string,
              connectionType: "websocket" as const,
            }
          : {
              conversationToken: config.conversationToken as string,
              connectionType: "webrtc" as const,
              webRtc: { singlePeerConnection: false },
            };
      const options: PartialOptions = {
        ...transport,
        inputDeviceId,
        overrides: config.overrides,
        dynamicVariables: config.dynamicVariables,
        userId: collectionId,
        onConversationCreated: (conversation) => {
          attemptClient = conversation;
          if (
            !acceptInterviewConnection(
              conversation,
              isCurrent() && !intentionalStop.current,
            )
          )
            return;
          restoreInterviewAudio(conversation, microphoneMutedRef.current);
          void playback.play();
        },
        onDebug: (event) => {
          // WebRTC can attach its playback element after conversation creation.
          if (
            isCurrent() &&
            !intentionalStop.current &&
            event.type === "audio_element_ready"
          ) {
            (client.current ?? attemptClient)?.setVolume({ volume: 1 });
            void playback.play();
          }
        },
        clientTools: {
          set_interview_theme: async ({ themeId }: { themeId: unknown }) => {
            if (!isCurrent())
              throw new Error("This interview connection has ended.");
            if (!CHAPTERS.some((ch) => ch.id === themeId))
              throw new Error("Unknown interview theme.");
            if (rerecordChapterId && themeId !== rerecordChapterId)
              return JSON.stringify({
                accepted: false,
                chapterId: theme.current,
                reason:
                  "Stay with this story only. When its answer is complete, invite the person to select Back to review. Do not ask about other themes.",
              });
            if (
              !canChangeInterviewTheme(
                theme.current,
                themeId as InterviewChapterId,
                liveAnsweredThemes.current,
                explicitNextTheme.current,
                rerecordChapterId,
              )
            )
              return JSON.stringify({
                accepted: false,
                chapterId: theme.current,
                reason:
                  "No spoken answer has been received for the current theme. Stay here and ask gently if the person is still thinking or needs to check their microphone. Do not claim the story was captured.",
              });
            explicitNextTheme.current = null;
            theme.current = themeId as InterviewChapterId;
            setActiveChapterId(theme.current);
            return JSON.stringify({
              accepted: true,
              chapterId: theme.current,
              guidance:
                "Theme updated. Ask one natural question without naming the section.",
            });
          },
        },
        onMessage: (message) => {
          if (isCurrent()) receiveMessage(message);
        },
        onModeChange: ({ mode }) => {
          if (isCurrent()) setMode(mode);
        },
        onError: (message) => {
          failureMessage = message;
          if (isCurrent() && !intentionalStop.current) {
            setConnectionFailed(true);
            if (isInterviewMicrophoneFailure(message)) {
              // onConversationCreated can fire before startSession resolves and
              // before client.current is assigned. Invalidate that continuation
              // first, and close the attempt's SDK client as well as capture.
              const cancelledAttempt = ++connectionAttempt.current;
              cue?.dispose();
              void pause(attemptClient).then(() => {
                if (
                  mounted.current &&
                  connectionAttempt.current === cancelledAttempt
                ) {
                  connectionInFlight.current = false;
                  setError(
                    "We paused the conversation because the microphones could not stay in sync. Your recorded portion is being saved. Check your microphone, then continue.",
                  );
                }
              });
              return;
            }
            setError(
              "The voice connection had a problem. Pause to save this part, then reconnect, try another connection, or record one answer at a time.",
            );
          }
        },
        onDisconnect: () => {
          disconnected = true;
          playback.dispose();
          if (!isCurrent()) return;
          if (client.current === attemptClient) client.current = null;
          if (!intentionalStop.current) {
            setConnectionFailed(true);
            setPhase("interrupted");
            setMode("listening");
            void archiveRef.current.pause().catch((e) => {
              if (isCurrent()) setError(friendly(e));
            });
            setError(
              "The voice connection was lost. This part of your recording is being saved. Reconnect or try another connection to continue.",
            );
            void enqueue({
              action: "set_status",
              sessionId: s.id,
              status: "interrupted",
            }).catch((e) => {
              if (isCurrent()) setError(friendly(e));
            });
          }
        },
      };
      const connected = await Conversation.startSession(options);
      attemptClient = connected;
      if (
        !acceptInterviewConnection(
          connected,
          isCurrent() && !intentionalStop.current,
        )
      )
        return;
      if (disconnected) {
        await connected.endSession();
        if (isCurrent())
          throw new Error(
            failureMessage || "The voice connection was lost while connecting.",
          );
        return;
      }
      client.current = connected;
      restoreInterviewAudio(connected, microphoneMutedRef.current);
      void playback.play();
      setConnectionStage("confirming");
      await request("/interview", {
        action: "set_status",
        sessionId: s.id,
        status: "active",
        providerConversationId: connected.getId(),
      });
      if (!isCurrent() || intentionalStop.current || disconnected) return;
      setPhase("talking");
    } catch (e) {
      playback.dispose();
      cue?.dispose();
      if (!isCurrent()) {
        await (attemptClient as Conversation | null)
          ?.endSession()
          .catch(() => {});
        return;
      }
      intentionalStop.current = true;
      await (attemptClient as Conversation | null)
        ?.endSession()
        .catch(() => {});
      if (client.current === attemptClient) client.current = null;
      await archiveRef.current.pause().catch(() => {});
      if (sessionRef.current)
        await request("/interview", {
          action: "set_status",
          sessionId: sessionRef.current.id,
          status: "paused",
        }).catch(() => {});
      if (isCurrent()) {
        setPhase("paused");
        setConnectionFailed(true);
        const deviceError =
          e instanceof Error &&
          [
            "NotAllowedError",
            "SecurityError",
            "NotFoundError",
            "OverconstrainedError",
            "NotReadableError",
            "AbortError",
          ].includes(e.name);
        setError(
          deviceError
            ? interviewDeviceError(e)
            : "We could not start the voice connection. Check your internet connection, then try again or choose another connection. " +
                friendly(e),
        );
      }
    } finally {
      cue?.dispose();
      if (connectionCue.current === cue) connectionCue.current = null;
      if (connectionAttempt.current === attempt) {
        connectionInFlight.current = false;
        if (mounted.current) setWorking(false);
      }
    }
  }

  async function pause(attemptClient?: Conversation | null) {
    setWorking(true);
    intentionalStop.current = true;
    interviewerPlayback.current?.dispose();
    interviewerPlayback.current = null;
    setPlaybackBlocked(false);
    const current = attemptClient ?? client.current;
    // Silence capture immediately, independently of SDK or save teardown.
    archiveRef.current.stream?.getTracks().forEach((track) => {
      track.enabled = false;
    });
    try {
      current?.setMicMuted(true);
      current?.setVolume({ volume: 0 });
    } catch {
      // Teardown below still runs if an already-disconnected SDK rejects mute.
    }
    try {
      const results = await Promise.allSettled([
        current?.endSession() ?? Promise.resolve(),
        archiveRef.current.pause(),
      ]);
      if (client.current === current) client.current = null;
      if (results[1].status === "rejected") {
        // A failed recorder stop must not leave a live camera or microphone.
        archiveRef.current.stream?.getTracks().forEach((track) => track.stop());
      }
      const failed = results.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
      await localWrites.current;
      if (sessionRef.current)
        await enqueue({
          action: "set_status",
          sessionId: sessionRef.current.id,
          status: "paused",
        });
    } catch (e) {
      setError(friendly(e));
    } finally {
      if (client.current === current) client.current = null;
      setPhase("paused");
      setWorking(false);
    }
  }

  async function finish() {
    if (submitting.current || working) return;
    submitting.current = true;
    setRestartConfirm(false);
    setWorking(true);
    setPhase("finishing");
    intentionalStop.current = true;
    interviewerPlayback.current?.dispose();
    interviewerPlayback.current = null;
    setPlaybackBlocked(false);
    setError("");
    const current = client.current;
    archiveRef.current.stream?.getTracks().forEach((track) => {
      track.enabled = false;
    });
    try {
      current?.setMicMuted(true);
      current?.setVolume({ volume: 0 });
    } catch {
      // Always finish both teardown paths even when SDK controls fail.
    }
    try {
      // Keep the transport briefly alive for final transcript events. The
      // preparation worker recovers the authenticated transcript separately.
      const closeInterviewer = async () => {
        if (!current) return;
        try {
          const started = Date.now();
          lastMessageAt.current = started;
          while (
            Date.now() - started < 5000 &&
            Date.now() - lastMessageAt.current < 1800
          )
            await new Promise((resolve) => setTimeout(resolve, 200));
        } finally {
          try {
            await current.endSession();
          } finally {
            if (client.current === current) client.current = null;
          }
        }
      };
      // Neither a recording error nor an SDK cleanup error may skip the other
      // teardown. They settle before preparation can be accepted.
      const results = await Promise.allSettled([
        archiveRef.current.stop(),
        closeInterviewer(),
      ]);
      const failed = results.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
      await localWrites.current;
      await flush();
      // Submission waits for every recording part to be saved. Slow uploads
      // keep waiting; only a failed part stops so it can be retried.
      while (archiveRef.current.saving || archiveRef.current.pendingCount > 0) {
        if (
          archiveRef.current.recordings.some(
            (record) => record.error && !record.empty,
          )
        )
          throw new Error(
            "Your interview has not been submitted yet. A recording part needs a retry. Choose Retry backup below, then Finish interview again.",
          );
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (
        unsavedMemory.current.length ||
        (await readInterviewJournal(collectionId)).length ||
        archiveRef.current.pendingCount ||
        archiveRef.current.recordings.some(
          (record) => record.error && !record.empty,
        )
      )
        throw new Error(
          "Your interview has not been submitted yet. Back up your remaining recordings and words before finishing.",
        );
      // Missing live transcript text is not proof that the securely saved
      // original lacks an answer, so finishing submits the saved recordings.
      for (const savedSession of collectionRef.current?.interviews ?? []) {
        if (savedSession.status !== "completed")
          await request("/interview", {
            action: "set_status",
            sessionId: savedSession.id,
            status: savedSession.segments.length ? "completed" : "interrupted",
          });
      }
      const result = await request("", {
        action: "submit_interview",
        processingApproved: true,
      });
      if (!result.preparation?.id)
        throw new Error(
          "We could not confirm submission. Your recordings are saved. Please choose Finish interview again.",
        );
      router.push(
        `/collection/${encodeURIComponent(collectionId)}/complete${query}`,
      );
    } catch (e) {
      submitting.current = false;
      setError(friendly(e));
      setPhase("paused");
    } finally {
      setWorking(false);
    }
  }

  async function startAnswerOver() {
    const conversation = client.current;
    const session = sessionRef.current;
    setRestartConfirm(false);
    if (!conversation || !session || working) return;
    const turnIds = [...currentAnswerTurnIds.current];
    currentAnswerTurnIds.current = [];
    heardAnswerSinceQuestion.current = false;
    setInputNeedsCheck(false);
    setInputNotice("");
    // Commands share the device journal, so each exclusion is saved after the
    // words it leaves out. The original recording itself is always kept.
    for (const turnId of turnIds)
      void enqueue({
        action: "select_turn",
        sessionId: session.id,
        turnId,
        included: false,
      }).catch((e) => setError(`Your choice needs a backup. ${friendly(e)}`));
    const text =
      "[Interview control: I’d like to start my last answer over. Please ask the same question again in a few words, and don’t mention what I said before.]";
    controlEchoes.current.push(text);
    conversation.sendUserMessage(text);
  }

  function downloadWords() {
    const snapshot = {
      interviews: collectionRef.current?.interviews,
      pending,
      unsaved: unsavedMemory.current,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(snapshot, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "time-tapestry-interview-backup.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function retryBackup() {
    setWorking(true);
    try {
      await localWrites.current.catch(() => {});
      while (unsavedMemory.current.length) {
        const command = unsavedMemory.current[0];
        const commands = await appendInterviewCommand(collectionId, command);
        unsavedMemory.current.shift();
        setPending(commands);
      }
      setMemoryWarning(false);
      await flush();
      setError("");
    } catch (e) {
      setError(friendly(e));
    } finally {
      setWorking(false);
    }
  }

  const active = phase === "talking" || phase === "interrupted";
  const allSessions = collection?.interviews ?? [];
  const savedTurns = allSessions.flatMap((s) =>
    s.turns.map((turn) => ({ turn, session: s })),
  );
  const pendingTurns = pending.flatMap((command) =>
    command.body.action === "append_turns"
      ? (command.body.turns as InterviewTurn[]).map((turn) => ({
          turn,
          session: allSessions.find((s) => s.id === command.body.sessionId),
        }))
      : [],
  );
  const byId = new Map(savedTurns.map((x) => [x.turn.id, x]));
  pendingTurns.forEach((x) => {
    if (x.session) byId.set(x.turn.id, { turn: x.turn, session: x.session });
  });
  const items = [...byId.values()];
  const superseded = new Set(
    items.map((x) => x.turn.supersedesTurnId).filter(Boolean),
  );
  const userItems = items.filter(
    (x) => x.turn.role === "user" && !superseded.has(x.turn.id),
  );
  const answeredChapterIds = CHAPTERS.filter(
    (chapter) =>
      userItems.some(
        ({ turn, session }) =>
          turn.chapterId === chapter.id &&
          isMeaningfulInterviewSpeech(turn.text) &&
          !session.excludedTurnIds.includes(turn.id),
      ) ||
      collection?.takes.some(
        (take) =>
          (take.questionId === chapter.id ||
            take.questionId.startsWith(`${chapter.id}-f`)) &&
          collection.selectedTakeIds[take.questionId] === take.id &&
          isMeaningfulInterviewSpeech(take.text),
      ),
  ).map((chapter) => chapter.id);
  const nextChapterId = nextUnansweredChapterId(
    activeChapterId,
    answeredChapterIds,
  );
  useEffect(() => {
    if (phase !== "talking" || microphoneMuted) return;
    let lastSignalAt = Date.now();
    const timer = window.setInterval(() => {
      try {
        const volume = client.current?.getInputVolume() ?? 0;
        setInputLevel(
          Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0,
        );
        if (volume > 0.01) lastSignalAt = Date.now();
        if (mode === "speaking") lastSignalAt = Date.now();
        if (mode === "listening" && Date.now() - lastSignalAt > 20_000)
          setInputNeedsCheck(true);
      } catch {
        // An unavailable meter is not evidence that the microphone has failed.
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [phase, mode, microphoneMuted]);

  const visibleStatus =
    phase === "connecting"
      ? connectionStageLabels[connectionStage]
      : phase === "paused"
        ? "Paused"
        : phase === "interrupted"
          ? "Connection lost"
          : phase === "finishing"
            ? "Saving your interview"
            : active
              ? microphoneMuted
                ? "Your microphone is muted"
                : mode === "speaking"
                  ? "Speaking"
                  : "Listening"
              : collection && !collection.capabilities.liveInterview
                ? "Voice conversation unavailable"
                : "Ready when you are";

  if (!collection)
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="font-serif text-3xl">Opening your conversation</h1>
        <p role={error ? "alert" : "status"} className="mt-4">
          {error || "One moment while we find your stories."}
        </p>
        {error && (
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              className={primary}
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
            <Link
              href="/account"
              className={`${secondary} inline-flex items-center`}
            >
              Find my interview by email
            </Link>
          </div>
        )}
      </main>
    );
  if (collection.role !== "owner")
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="font-serif text-3xl">This is a private conversation.</h1>
        <p className="mt-4">
          Use the private link sent to the person sharing their story.
        </p>
      </main>
    );
  if (collection.status === "approved")
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="font-serif text-3xl">Your stories are ready.</h1>
        <p className="my-5">Your approved gift is saved.</p>
        <Link className={primary} href={`/collection/${collectionId}${query}`}>
          Open your stories
        </Link>
      </main>
    );

  const resuming =
    phase === "ready" && interviewResumeState(collection).hasSavedProgress;
  const startControls = (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      {collection.capabilities.liveInterview && (
        <button
          className={primary}
          disabled={
            working ||
            !journalReady ||
            archive.recovering ||
            archive.status === "stopping"
          }
          onClick={() => void connect()}
          onPointerEnter={warmConversation}
          onFocus={warmConversation}
        >
          {rerecordChapterId
            ? "Record this part again"
            : resuming
              ? "Continue recording"
              : "Start conversation"}
        </button>
      )}
      {hasExistingRecordings && !sessionRef.current && (
        <button
          type="button"
          className={secondary}
          disabled={working || !journalReady}
          onClick={() => void finish()}
        >
          Finish interview
        </button>
      )}
    </div>
  );
  const recordingOptions = (
    <div className="space-y-5">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-4 text-base font-medium">
          How would you like to record?
        </legend>
        {(["video", "voice"] as const).map((value) => (
          <label
            key={value}
            className={`flex min-h-[4.5rem] cursor-pointer items-center gap-3 rounded-xl border p-4 text-base transition-colors ${kind === value ? (value === "video" ? "border-sage-300 bg-sage-100" : "border-clay-300 bg-clay-50") : "border-warmgray-200 bg-white hover:bg-paper-100"}`}
          >
            <input
              className="h-5 w-5 shrink-0 p-0 accent-espresso"
              type="radio"
              name="record-kind"
              value={value}
              checked={kind === value}
              disabled={working}
              onChange={() => {
                choseKind.current = true;
                setKind(value);
              }}
            />
            {value === "video" ? "Video with sound" : "Audio only"}
          </label>
        ))}
      </fieldset>
      {!working && (
        <InterviewDeviceSetup
          kind={kind}
          devices={devices}
          onChange={setDevices}
        />
      )}
    </div>
  );

  return (
    <main className="mx-auto max-w-6xl px-5 pb-12 pt-5 text-ink-700 sm:px-8 sm:pt-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-warmgray-200 pb-4">
        <Logo />
        <span className="rounded-full bg-sage-100 px-4 py-2 text-base text-ink-600">
          A story for {collection.recipient.name}
        </span>
      </header>
      <div className="mb-6 mt-7 max-w-3xl sm:mt-8">
        <h1 className="font-serif text-3xl leading-tight sm:text-[2.125rem]">
          {rerecordChapterId
            ? `Record again: ${interviewChapterTitle(rerecordChapterId, collection.faithFraming)}`
            : resuming
              ? "Welcome back."
              : "Take your time. Your story matters."}
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-ink-500">
          {rerecordChapterId
            ? "We’ll ask about just this part, then bring you back to your recordings."
            : resuming
              ? `Continue with part ${activeChapterId.slice(1)} of 4: ${interviewChapterTitle(activeChapterId, collection.faithFraming)}.`
              : `One conversation about your life, your walk with Jesus, and what you hope ${collection.recipient.name} carries forward.`}
        </p>
        {resuming && <div className="mt-5">{startControls}</div>}
      </div>
      {!journalReady && (
        <div
          className="mb-6 rounded-xl border border-clay-300 bg-clay-50 p-5 text-base leading-7"
          role={journalError ? "alert" : "status"}
        >
          <p>
            {journalError ||
              "Checking that your answers can be saved on this device..."}
          </p>
          {journalError && (
            <button
              type="button"
              className={`${secondary} mt-3`}
              disabled={journalChecking}
              onClick={() => void openJournal()}
            >
              {journalChecking
                ? "Checking storage..."
                : "Try device storage again"}
            </button>
          )}
        </div>
      )}
      {(error || archive.error || archive.warning || memoryWarning) && (
        <div
          className="mb-6 rounded-xl border border-clay-300 bg-clay-50 p-5 text-base leading-7"
          role="alert"
        >
          {error && <p>{error}</p>}
          {archive.error && <p className="mt-2">{archive.error}</p>}
          {archive.warning && <p className="mt-2">{archive.warning}</p>}
          {memoryWarning && (
            <p className="mt-2">
              Some words are only in this open page. Download them before
              leaving.
            </p>
          )}
          {(pending.length > 0 || memoryWarning) && (
            <div className="mt-3 flex flex-wrap gap-4">
              <button
                type="button"
                className="text-oxblood underline"
                onClick={() => void retryBackup()}
              >
                Retry backup
              </button>
              <button
                type="button"
                className="text-oxblood underline"
                onClick={downloadWords}
              >
                Download words
              </button>
            </div>
          )}
        </div>
      )}
      <section
        className="overflow-hidden rounded-2xl border border-warmgray-200 bg-white shadow-soft"
        aria-label="Your interview"
      >
        <InterviewProgress
          activeChapterId={activeChapterId}
          answeredChapterIds={answeredChapterIds}
          faithFraming={collection.faithFraming}
          compact={resuming || phase !== "ready"}
          paused={phase === "paused" || phase === "interrupted"}
        />
        <div className="brand-gradient-chocolate relative isolate overflow-hidden p-6 text-white sm:p-8">
          <BrandPattern
            variant="ribbon"
            className="pointer-events-none absolute -bottom-16 -right-20 -z-10 h-80 w-80 text-white opacity-[0.07]"
          />
          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <p
              className="min-h-7 text-base font-medium leading-7 text-white"
              role="status"
            >
              {visibleStatus}
            </p>
          </div>
          <div
            className={`relative mt-7 grid items-start gap-6 ${kind === "video" ? "lg:grid-cols-[144px_minmax(0,1fr)_220px]" : "sm:grid-cols-[144px_minmax(0,1fr)]"}`}
          >
            <div className="flex h-36 items-center justify-center">
              <InterviewPresence
                state={
                  phase === "connecting"
                    ? "connecting"
                    : phase === "talking"
                      ? mode
                      : collection.capabilities.liveInterview
                        ? "paused"
                        : "unavailable"
                }
              />
            </div>
            <div
              className="min-w-0"
              role="region"
              aria-label="Current question"
            >
              <h2 className="max-w-2xl break-words font-serif text-2xl leading-relaxed text-white sm:text-3xl">
                {phase === "connecting"
                  ? `${connectionStageLabels[connectionStage]}.`
                  : phase === "finishing"
                    ? "Saving your interview"
                    : question}
              </h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-white/[0.85]">
                {phase === "connecting"
                  ? connectionStage === "devices"
                    ? kind === "video"
                      ? "Choose Allow if your browser asks to use your microphone and camera. Check the camera or microphone icon beside the address bar if you do not see the request."
                      : "Choose Allow if your browser asks to use your microphone. Check the microphone icon beside the address bar if you do not see the request."
                    : connectionStage === "saving"
                      ? "We are checking that your earlier answers are saved before you continue."
                      : connectionStage === "confirming"
                        ? "You can begin when you hear the first question. We are saving this connection to your private conversation."
                        : connectionTakingLong
                          ? connectionStage === "preparing"
                            ? "Your private conversation is still being prepared. You can begin when you hear the first question."
                            : "This is taking longer than usual. We are still waiting for the voice connection. You can begin when you hear the first question."
                          : "You can begin when you hear the first question."
                  : phase === "finishing"
                    ? "Please keep this page open while your recordings finish saving. This can take a minute on slower connections."
                    : !collection.capabilities.liveInterview
                      ? "Voice conversation is unavailable on this page. Check availability below when you are ready to try again."
                      : phase === "ready"
                        ? resuming
                          ? rerecordChapterId
                            ? "Your camera and microphone stay off until you choose Record this part again."
                            : "Your camera and microphone stay off until you choose Continue recording."
                          : "We will take this one question at a time. You can pause whenever you need to. You review your stories and videos before anything is shared."
                        : phase === "paused"
                          ? "The conversation and recording are paused. Continue when you are ready."
                          : "There is no perfect answer. Start with a moment you remember."}
              </p>
            </div>
            {kind === "video" && (
              <div className="mx-auto w-full max-w-[220px]">
                {archive.stream?.getVideoTracks().length ? (
                  <CameraPreview stream={archive.stream} />
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-center text-sm text-paper">
                    Your camera preview will appear here.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="p-6 sm:p-8">
          {archive.backupProgress.parts.some(
            (part) => part.stage === "failed",
          ) && (
            <RecordingBackupProgress
              progress={archive.backupProgress}
              pendingWords={pendingWordConfirmation}
              safeToClose={
                !working &&
                !["connecting", "talking", "finishing"].includes(phase) &&
                !pendingWordConfirmation
              }
            />
          )}
          {(phase === "ready" ||
            (phase === "paused" && !archive.stream && !sessionRef.current)) && (
            <div className="space-y-5">
              {!collection.capabilities.liveInterview && (
                <div className="rounded-xl bg-sage-100 p-4 text-base leading-7">
                  <p>You can check again when you are ready to continue.</p>
                  <button
                    type="button"
                    className={`${secondary} mt-3`}
                    disabled={checkingAvailability || working}
                    onClick={() => void checkAvailability()}
                  >
                    {checkingAvailability
                      ? "Checking availability…"
                      : "Check voice availability"}
                  </button>
                </div>
              )}
              {availabilityNotice && (
                <p role="status" className="text-base leading-7 text-ink-700">
                  {availabilityNotice}
                </p>
              )}
              {collection.capabilities.liveInterview &&
                (resuming ? (
                  <details className="border-t border-warmgray-200 pt-2">
                    <summary className="min-h-12 cursor-pointer py-3 text-base font-medium">
                      Recording options:{" "}
                      {kind === "video" ? "video with sound" : "audio only"}
                    </summary>
                    <div className="pt-3">{recordingOptions}</div>
                  </details>
                ) : (
                  recordingOptions
                ))}
              {collection.capabilities.liveInterview && !resuming && (
                <p className="max-w-2xl text-base leading-7 text-ink-500">
                  Starting the conversation uses your microphone and records
                  your answers. When you choose Finish interview, we save your
                  recordings and start preparing your stories and videos.
                  Nothing is mailed until you approve your postcards.
                </p>
              )}
              {!resuming && startControls}
            </div>
          )}
          {(active || phase === "paused") && sessionRef.current && (
            <div
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-warmgray-200 bg-paper-100 p-3"
              aria-label="Conversation controls"
            >
              {phase === "paused" || phase === "interrupted" ? (
                <button
                  className={`${primary} inline-flex items-center justify-center gap-2`}
                  disabled={working}
                  onClick={() => void connect()}
                  onPointerEnter={warmConversation}
                  onFocus={warmConversation}
                >
                  <AppIcon name="play" size={20} />
                  {phase === "interrupted" ? "Reconnect" : "Continue recording"}
                </button>
              ) : (
                <button
                  className={`${secondary} inline-flex items-center justify-center gap-2`}
                  disabled={working}
                  onClick={() => void pause()}
                >
                  <AppIcon name="pause" size={20} /> Pause
                </button>
              )}
              {active && (
                <button
                  type="button"
                  className={secondary}
                  disabled={working || !client.current}
                  onClick={() => {
                    if (!heardAnswerSinceQuestion.current) {
                      setInputNeedsCheck(true);
                      setInputNotice(
                        "We haven’t received your spoken answer yet. If you already answered, pause and check your microphone or reconnect. Your saved recording is kept.",
                      );
                      return;
                    }
                    heardAnswerSinceQuestion.current = false;
                    const text =
                      "[Interview control: I have finished this answer. Please continue with one relevant question.]";
                    controlEchoes.current.push(text);
                    client.current?.sendUserMessage(text);
                  }}
                >
                  I’m finished with this answer
                </button>
              )}
              {active &&
                (restartConfirm ? (
                  <span
                    role="group"
                    aria-label="Start this answer over"
                    className="inline-flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2"
                  >
                    <span className="text-base">
                      Leave out this answer and hear the question again?
                    </span>
                    <button
                      type="button"
                      className={secondary}
                      disabled={working || !client.current}
                      onClick={() => void startAnswerOver()}
                    >
                      Yes, start over
                    </button>
                    <button
                      type="button"
                      className="min-h-12 px-3 text-base underline underline-offset-4"
                      onClick={() => setRestartConfirm(false)}
                    >
                      Keep my answer
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className={secondary}
                    disabled={working || !client.current}
                    onClick={() => setRestartConfirm(true)}
                  >
                    Start this answer over
                  </button>
                ))}
              {phase === "talking" && nextChapterId && !rerecordChapterId && (
                <button
                  type="button"
                  className={secondary}
                  disabled={working || mode === "speaking" || !client.current}
                  onClick={() => {
                    const conversation = client.current;
                    if (!conversation || working || mode === "speaking") return;
                    explicitNextTheme.current = nextChapterId;
                    const title = interviewChapterTitle(
                      nextChapterId,
                      collection.faithFraming,
                    );
                    const text = `[Interview control: I’d like to move on to the story area called “${title}”. Please skip any more follow-up questions in this area and ask one question in that next area.]`;
                    controlEchoes.current.push(text);
                    conversation.sendUserMessage(text);
                  }}
                >
                  Next part
                </button>
              )}
              <button
                type="button"
                className={`${secondary} inline-flex items-center justify-center gap-2`}
                disabled={working}
                onClick={() => void finish()}
              >
                <AppIcon name="check" size={20} /> Finish interview
              </button>
              {phase === "talking" && (
                <button
                  type="button"
                  className={`${secondary} inline-flex items-center justify-center gap-2`}
                  aria-pressed={microphoneMuted}
                  disabled={working}
                  onClick={() => {
                    try {
                      setMicrophoneMute(!microphoneMuted);
                    } catch (e) {
                      setError(friendly(e));
                    }
                  }}
                >
                  <AppIcon name="conversation" size={20} />
                  {microphoneMuted ? "Unmute microphone" : "Mute microphone"}
                </button>
              )}
            </div>
          )}
          {connectionFailed &&
            (phase === "paused" || phase === "interrupted") && (
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  className={secondary}
                  disabled={working || !journalReady}
                  onClick={() => void connect("websocket")}
                >
                  Try another connection
                </button>
              </div>
            )}
          {collection.capabilities.liveInterview &&
            !working &&
            (phase === "paused" || phase === "interrupted") &&
            sessionRef.current && (
              <InterviewDeviceSetup
                kind={kind}
                devices={devices}
                onChange={setDevices}
              />
            )}
          {phase === "talking" && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={secondary}
                disabled={working || !client.current}
                onClick={() => {
                  try {
                    client.current?.setVolume({ volume: 1 });
                    void interviewerPlayback.current?.play();
                  } catch (cause) {
                    setError(friendly(cause));
                  }
                }}
              >
                {playbackBlocked ? "Turn sound on" : "Restore sound"}
              </button>
              {playbackBlocked && (
                <p
                  role="status"
                  className="max-w-xl text-base leading-7 text-ink-700"
                >
                  Your browser paused the sound. Choose Turn sound on to hear
                  the next question.
                </p>
              )}
            </div>
          )}
          {phase === "talking" && !microphoneMuted && (
            <div className="mt-4 max-w-xl">
              <div className="flex items-center gap-3 text-sm text-ink-500">
                <span>Microphone</span>
                <meter
                  min={0}
                  max={1}
                  value={inputLevel}
                  aria-label="Sound reaching your interviewer"
                  className="h-3 w-28"
                />
              </div>
              {inputNeedsCheck && (
                <p
                  role="status"
                  className="mt-3 rounded-xl bg-clay-50 p-4 text-base leading-7 text-ink-700"
                >
                  {inputNotice ||
                    "Taking a moment is fine. If you are speaking and this meter is not moving, pause to check your microphone."}
                </p>
              )}
            </div>
          )}
          {phase === "talking" && (
            <p className="mt-4 text-sm leading-6 text-ink-500">
              {microphoneMuted
                ? "Your microphone is muted for both the conversation and your recording. "
                : ""}
              Pause to change your microphone or camera.
            </p>
          )}
          {collection.capabilities.liveInterview &&
            (phase === "ready" ||
              phase === "paused" ||
              phase === "interrupted") && (
              <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-base text-ink-500">
                <input
                  type="checkbox"
                  checked={connectionSound}
                  onChange={(event) => setConnectionSound(event.target.checked)}
                  className="h-5 w-5 shrink-0 p-0 accent-espresso"
                />
                Play a soft sound while connecting
              </label>
            )}
        </div>
      </section>
      {hasExistingRecordings &&
        phase !== "connecting" &&
        phase !== "finishing" && (
          <div className="mt-5">
            <button
              type="button"
              className={secondary}
              disabled={working || !journalReady || archive.recovering}
              onClick={() => void finish()}
            >
              Listen or record again
            </button>
            <p className="mt-2 text-sm leading-6 text-ink-500">
              Optional. Your recording will finish saving before you listen or
              choose a part to record again.
            </p>
          </div>
        )}
      {(!collection.capabilities.liveInterview || connectionFailed) &&
        ["ready", "paused", "interrupted"].includes(phase) &&
        !working &&
        !archive.saving &&
        !archive.pendingCount &&
        !pending.length &&
        !memoryWarning && (
          <section className="mt-6 rounded-xl border border-warmgray-200 bg-white p-5">
            <h2 className="text-lg font-semibold">Record at your own pace</h2>
            <p className="mt-2 text-base leading-7 text-ink-600">
              Read each question and record your answer with video and sound, or
              audio only.
              {collection.capabilities.transcription
                ? ""
                : " Your recordings stay saved while automatic transcription is unavailable."}
            </p>
            <Link
              className={`${secondary} mt-4 inline-flex items-center`}
              href={`/record/${collectionId}${query}&classic=1&chapter=${interviewResumeState(collection).missingChapterIds[0] ?? interviewResumeState(collection).chapterId}`}
            >
              Record one answer at a time
            </Link>
          </section>
        )}
      <details className="mt-8 border-t border-warmgray-200 pt-2">
        <summary className="min-h-12 cursor-pointer py-3 text-base font-medium">
          Saving and returning to your interview
        </summary>
        <p className="text-base leading-7 text-ink-500">
          Recordings marked Backed up are linked to{" "}
          {collection.storyteller.email}. Sign in to{" "}
          <Link
            href="/account"
            className="underline underline-offset-4"
            onClick={(event) => {
              if (
                ["talking", "connecting", "finishing"].includes(phase) ||
                working ||
                pendingWordConfirmation ||
                archive.pendingCount ||
                archive.saving
              ) {
                event.preventDefault();
                setLeaveNotice(
                  "Your recordings are still saving. Pause or finish the interview and wait for saving to complete before leaving this page.",
                );
              }
            }}
          >
            My stories
          </Link>{" "}
          with that email to return on another device.
        </p>
        {leaveNotice && (
          <p role="status" className="mt-2 text-base leading-7 text-oxblood">
            {leaveNotice}
          </p>
        )}
      </details>
      {archive.recordings.some((recording) => recording.recovered) && (
        <p role="status" className="mt-4 text-base leading-7 text-ink-500">
          An earlier recording was interrupted. Check its saved portion and
          backup status below. The last moments before the browser closed may be
          missing.
        </p>
      )}
      {archive.recordings.length > 0 && (
        <details
          open={
            archive.recordings.some(
              (record) => record.error && !record.empty,
            ) ||
            (archive.pendingCount > 0 && archive.status !== "recording")
          }
          className="mt-8 rounded-xl border border-warmgray-200 bg-white p-5"
        >
          <summary className="cursor-pointer text-base font-medium">
            Recording backup ({archive.recordings.length})
          </summary>
          <p className="mt-2 text-sm leading-6">
            Long conversations save in smaller recordings. Keep this browser
            open while they back up.
          </p>
          <div className="mt-4 divide-y divide-warmgray-300">
            {archive.recordings.map((record, index) => (
              <div
                key={record.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div>
                  <p>Recording {index + 1}</p>
                  <p className="mt-1 text-sm">
                    {record.empty
                      ? "Recording did not start. No audio or video was captured."
                      : record.state === "recording"
                        ? "Recording now"
                        : record.state === "backed_up"
                          ? "Backed up"
                          : record.localSaved
                            ? "Saved on this device; backup pending"
                            : "Not yet saved on this device"}
                  </p>
                </div>
                {!record.empty && (
                  <div className="flex gap-4 text-sm text-oxblood">
                    <button
                      type="button"
                      onClick={() =>
                        void archive
                          .getBlob(record.localTakeId)
                          .then((blob) => {
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `time-tapestry-recording-${index + 1}.${record.mimeType.includes("mp4") ? "mp4" : "webm"}`;
                            a.click();
                            setTimeout(() => URL.revokeObjectURL(url), 1000);
                          })
                          .catch((e) => setError(friendly(e)))
                      }
                    >
                      Download original
                    </button>
                    {record.state !== "backed_up" &&
                      record.state !== "recording" && (
                        <button
                          disabled={archive.saving}
                          onClick={() =>
                            void archive
                              .retry(record.localTakeId)
                              .catch((e) => setError(friendly(e)))
                          }
                        >
                          Retry backup
                        </button>
                      )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </main>
  );
}
