"use client";

import Link from "next/link";
import { Logo } from "@/components/Logo";
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
import { CHAPTERS, getChapterQuestion } from "@/lib/interview-state";
import { getTextDraft, saveTextDraft } from "@/lib/collection/local-takes";
import {
  acknowledgeInterviewCommand,
  appendInterviewCommand,
  readInterviewJournal,
  type InterviewCommand,
} from "@/lib/collection/interview-journal";
import { useInterviewArchive } from "./useInterviewArchive";

const primary =
  "min-h-12 rounded-md bg-oxblood px-6 py-3 font-medium text-white disabled:opacity-50";
const secondary =
  "min-h-12 rounded-md border border-warmgray-300 bg-paper-50 px-5 py-3 font-medium text-ink-700 disabled:opacity-50";
type Phase =
  | "ready"
  | "connecting"
  | "talking"
  | "paused"
  | "interrupted"
  | "finishing"
  | "review";
const friendly = (e: unknown) =>
  e instanceof Error ? e.message : "That did not finish. Please try again.";

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
      className="aspect-video w-full rounded-md bg-ink-800 object-cover"
      aria-label="Your camera preview"
    />
  );
}

function OriginalPlayback({
  id,
  kind,
  getBlob,
}: {
  id: string;
  kind: "voice" | "video";
  getBlob: (id: string) => Promise<Blob>;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return (
    <div className="mt-3 w-full">
      {!url ? (
        <button
          className="min-h-10 text-sm text-oxblood underline"
          onClick={() =>
            void getBlob(id)
              .then((blob) => setUrl(URL.createObjectURL(blob)))
              .catch((e) => setError(friendly(e)))
          }
        >
          Play original recording
        </button>
      ) : kind === "video" ? (
        <video
          className="max-h-96 w-full bg-ink-800"
          src={url}
          controls
          playsInline
        />
      ) : (
        <audio className="w-full" src={url} controls />
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

function TurnReview({
  turn,
  included,
  busy,
  onSave,
  onInclude,
}: {
  turn: InterviewTurn;
  included: boolean;
  busy: boolean;
  onSave: (text: string) => Promise<void>;
  onInclude: (included: boolean) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(turn.text);
  const [error, setError] = useState("");
  return (
    <article
      className={`border-b border-warmgray-300 py-5 ${included ? "" : "opacity-60"}`}
    >
      {editing ? (
        <label className="block text-sm">
          Correct names or details
          <textarea
            className="mt-2 w-full rounded-md border border-warmgray-300 bg-white p-3 text-base"
            rows={5}
            maxLength={30000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
      ) : (
        <p className="whitespace-pre-wrap text-base leading-7">{turn.text}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-oxblood">
        {editing ? (
          <>
            <button
              type="button"
              disabled={busy || !text.trim()}
              onClick={async () => {
                try {
                  await onSave(text.trim());
                  setEditing(false);
                } catch (e) {
                  setError(friendly(e));
                }
              }}
            >
              Save correction
            </button>
            <button
              type="button"
              onClick={() => {
                setText(turn.text);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(true)}
          >
            Correct the words
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void onInclude(!included).catch((e) => setError(friendly(e)))
          }
        >
          {included ? "Leave this out of my story" : "Include in my story"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-oxblood">
          {error}
        </p>
      )}
    </article>
  );
}

export default function LiveInterview({
  collectionId,
  accessKey,
}: {
  collectionId: string;
  accessKey: string;
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
  const [typed, setTyped] = useState("");
  const [typing, setTyping] = useState(false);
  const [question, setQuestion] = useState(
    "Tell me about someone whose kindness has stayed with you.",
  );
  const [pending, setPending] = useState<InterviewCommand[]>([]);
  const [savingWords, setSavingWords] = useState(false);
  const [working, setWorking] = useState(false);
  const [guided, setGuided] = useState(false);
  const [guidedIndex, setGuidedIndex] = useState(0);
  const theme = useRef<InterviewChapterId>("q1");
  const client = useRef<Conversation | null>(null);
  const intentionalStop = useRef(false);
  const mounted = useRef(true);
  const sequence = useRef(0);
  const connectionEpoch = useRef("");
  const messages = useRef(new Map<string, InterviewTurn>());
  const typedEchoes = useRef<string[]>([]);
  const controlEchoes = useRef<string[]>([]);
  const requestQueue = useRef<Promise<unknown>>(Promise.resolve());
  const flushing = useRef<Promise<void> | null>(null);
  const localWrites = useRef<Promise<unknown>>(Promise.resolve());
  const unsavedMemory = useRef<InterviewCommand[]>([]);
  const [memoryWarning, setMemoryWarning] = useState(false);
  const [journalReady, setJournalReady] = useState(false);
  const [wordsChecked, setWordsChecked] = useState(false);
  const [missingWords, setMissingWords] = useState("");
  const [missingTheme, setMissingTheme] = useState<InterviewChapterId>("q1");
  const lastMessageAt = useRef(0);

  const apply = useCallback((c: CollectionView) => {
    collectionRef.current = c;
    if (mounted.current) setCollection(c);
    const id = sessionRef.current?.id;
    if (id)
      sessionRef.current =
        c.interviews?.find((s) => s.id === id) ?? sessionRef.current;
  }, []);

  const request = useCallback(
    (path: string, body?: unknown) => {
      const work = requestQueue.current
        .catch(() => {})
        .then(async () => {
          const response = await fetch(
            `${base}${path}${query}`,
            body === undefined
              ? { cache: "no-store" }
              : {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body),
                },
          );
          const data = await response.json();
          if (!response.ok)
            throw new Error(
              data.error || "Your interview could not be saved yet.",
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

  const enqueue = useCallback(
    (body: Record<string, unknown>) => {
      const command = { id: crypto.randomUUID(), body };
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
      localWrites.current = write;
      return write.then(() =>
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
    onSegmentSaved: async (segment, savedSessionId) => {
      await request("/interview", {
        action: "attach_segment",
        sessionId: savedSessionId,
        segment,
      });
    },
  });
  const archiveRef = useRef(archive);
  archiveRef.current = archive;

  useEffect(() => {
    if (
      archive.status === "paused" &&
      phase === "talking" &&
      !guided &&
      !intentionalStop.current
    ) {
      intentionalStop.current = true;
      client.current?.setMicMuted(true);
      void client.current?.endSession().catch(() => {});
      client.current = null;
      setPhase("paused");
      setError(
        "Recording paused, so the interviewer paused too. Check your saved recording before continuing.",
      );
      if (sessionRef.current)
        void enqueue({
          action: "set_status",
          sessionId: sessionRef.current.id,
          status: "paused",
        });
    }
  }, [archive.status, phase, guided, enqueue]);

  useEffect(() => {
    if (!pending.length) return;
    const timer = window.setTimeout(() => void flush().catch(() => {}), 5000);
    return () => window.clearTimeout(timer);
  }, [pending, flush]);

  useEffect(() => {
    mounted.current = true;
    void request("").catch((e) => setError(friendly(e)));
    void readInterviewJournal(collectionId)
      .then((commands) => {
        setPending(commands);
        setJournalReady(true);
        return flush();
      })
      .catch((e) => setError(friendly(e)));
    void getTextDraft(collectionId, "__interview_typed")
      .then(setTyped)
      .catch(() => {});
    const retry = () => {
      void flush().catch((e) => setError(friendly(e)));
    };
    window.addEventListener("online", retry);
    return () => {
      mounted.current = false;
      intentionalStop.current = true;
      void client.current?.endSession();
      window.removeEventListener("online", retry);
    };
  }, [collectionId, flush, request]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (
        ["talking", "connecting", "finishing"].includes(phase) ||
        pending.length ||
        memoryWarning ||
        archive.pendingCount
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase, pending.length, memoryWarning, archive.pendingCount]);

  async function ensureSession(provider: "elevenlabs" | "guided") {
    await localWrites.current;
    await flush();
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
    if (s && s.provider !== provider) {
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
          .find((x) => x.status !== "completed" && x.provider === provider) ??
        null;
    }
    if (!s) {
      const id = crypto.randomUUID();
      const data = await request("/interview", {
        action: "start",
        sessionId: id,
        provider,
      });
      s = data.collection.interviews.find((x: InterviewSession) => x.id === id);
    }
    if (!s) throw new Error("The interview could not start. Please try again.");
    sessionRef.current = s;
    setSessionId(s.id);
    sequence.current = Math.max(-1, ...s.turns.map((t) => t.sequence)) + 1;
    theme.current =
      [...s.turns].reverse().find((t) => t.role === "user" && t.chapterId)
        ?.chapterId ?? "q1";
    return s;
  }

  function addTurn(
    role: "agent" | "user",
    text: string,
    extra: Partial<InterviewTurn> = {},
  ) {
    const s = sessionRef.current;
    if (!s || !text.trim()) return Promise.resolve();
    if (role === "user") setWordsChecked(false);
    const turn: InterviewTurn = {
      id: crypto.randomUUID(),
      role,
      text: text.trim(),
      sequence: sequence.current++,
      capturedAt: new Date().toISOString(),
      timing: "unaligned",
      ...(role === "user" ? { chapterId: theme.current } : {}),
      ...extra,
    };
    return enqueue({ action: "append_turns", sessionId: s.id, turns: [turn] });
  }

  function receiveMessage(message: MessagePayload) {
    const text = message.message.trim();
    if (!text || !sessionRef.current) return;
    lastMessageAt.current = Date.now();
    setWordsChecked(false);
    if (message.role === "user") {
      const typedIndex = typedEchoes.current.indexOf(text);
      if (typedIndex >= 0) {
        typedEchoes.current.splice(typedIndex, 1);
        return;
      }
      const controlIndex = controlEchoes.current.indexOf(text);
      if (controlIndex >= 0) {
        controlEchoes.current.splice(controlIndex, 1);
        return;
      }
    } else setQuestion(text);
    const eventKey = `${connectionEpoch.current}:${message.role}:${message.response_id ?? message.event_id}`;
    const previous = messages.current.get(eventKey);
    if (previous?.text === text) return;
    const s = sessionRef.current;
    const turn: InterviewTurn = {
      id: crypto.randomUUID(),
      role: message.role,
      text,
      sequence: sequence.current++,
      capturedAt: new Date().toISOString(),
      timing: "unaligned",
      ...(message.role === "user" ? { chapterId: theme.current } : {}),
      ...(previous && message.role === "user"
        ? { supersedesTurnId: previous.id }
        : {}),
    };
    messages.current.set(eventKey, turn);
    void enqueue({
      action: "append_turns",
      sessionId: s.id,
      turns: [turn],
    }).catch((e) => setError(`Your words need a backup. ${friendly(e)}`));
  }

  async function connect() {
    setError("");
    setPhase("connecting");
    setWorking(true);
    intentionalStop.current = false;
    try {
      const s = await ensureSession("elevenlabs");
      const config = await request("/conversation/session", {
        sessionId: s.id,
      });
      theme.current = config.currentThemeId ?? theme.current;
      if (archiveRef.current.status === "paused")
        await archiveRef.current.resume();
      else if (archiveRef.current.status !== "recording")
        await archiveRef.current.start(s.id, kind, s.startedAt);
      const { Conversation } = await import("@elevenlabs/client");
      connectionEpoch.current = crypto.randomUUID();
      const options: PartialOptions = {
        conversationToken: config.conversationToken,
        connectionType: "webrtc",
        overrides: config.overrides,
        dynamicVariables: config.dynamicVariables,
        userId: collectionId,
        onConversationCreated: (conversation) => {
          // A resumed connection starts with a new microphone controller.
          // Preserve the person's choice to type before the greeting begins.
          conversation.setMicMuted(typing);
        },
        clientTools: {
          set_interview_theme: async ({ themeId }: { themeId: unknown }) => {
            if (!CHAPTERS.some((ch) => ch.id === themeId))
              throw new Error("Unknown interview theme.");
            theme.current = themeId as InterviewChapterId;
            return "Theme updated. Ask one natural question without naming the section.";
          },
        },
        onMessage: receiveMessage,
        onModeChange: ({ mode }) => {
          if (mounted.current) setMode(mode);
        },
        onError: () => {
          if (mounted.current)
            setError(
              "The interviewer connection had a problem. Your recording is being saved separately. Pause and reconnect when you are ready.",
            );
        },
        onDisconnect: () => {
          client.current = null;
          if (!intentionalStop.current && mounted.current) {
            setPhase("interrupted");
            setMode("listening");
            void archiveRef.current.pause().catch((e) => setError(friendly(e)));
            setError(
              "The interviewer disconnected, so recording is pausing. Check your last answer when you review, then reconnect to continue.",
            );
            void enqueue({
              action: "set_status",
              sessionId: s.id,
              status: "interrupted",
            }).catch((e) => setError(friendly(e)));
          }
        },
      };
      const connected = await Conversation.startSession(options);
      if (!mounted.current) {
        await connected.endSession();
        return;
      }
      client.current = connected;
      await request("/interview", {
        action: "set_status",
        sessionId: s.id,
        status: "active",
        providerConversationId: connected.getId(),
      });
      setGuided(false);
      setPhase("talking");
    } catch (e) {
      intentionalStop.current = true;
      await client.current?.endSession().catch(() => {});
      client.current = null;
      await archiveRef.current.pause().catch(() => {});
      if (sessionRef.current)
        await request("/interview", {
          action: "set_status",
          sessionId: sessionRef.current.id,
          status: "paused",
        }).catch(() => {});
      setPhase("paused");
      setError(friendly(e));
    } finally {
      setWorking(false);
    }
  }

  async function pause() {
    setWorking(true);
    intentionalStop.current = true;
    const current = client.current;
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
    setWorking(true);
    setPhase("finishing");
    intentionalStop.current = true;
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
      // Keep the transport briefly alive for final transcript events. This is
      // not proof of transcript completeness; original playback and review stay required.
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
      // teardown. They settle before completion is persisted or review opens.
      const results = await Promise.allSettled([
        archiveRef.current.stop(),
        closeInterviewer(),
      ]);
      const failed = results.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
      await localWrites.current;
      await flush();
      if (sessionRef.current)
        await request("/interview", {
          action: "set_status",
          sessionId: sessionRef.current.id,
          status: "completed",
        });
      setPhase("review");
      setWordsChecked(false);
    } catch (e) {
      setError(friendly(e));
      setPhase("paused");
    } finally {
      setWorking(false);
    }
  }

  async function startGuided() {
    setWorking(true);
    setError("");
    try {
      const s = await ensureSession("guided");
      const covered = new Set(
        s.turns
          .filter(
            (t) => t.role === "user" && !s.excludedTurnIds?.includes(t.id),
          )
          .map((t) => t.chapterId),
      );
      const index = CHAPTERS.findIndex((ch) => !covered.has(ch.id));
      if (index < 0) {
        setPhase("review");
        return;
      }
      await request("/interview", {
        action: "set_status",
        sessionId: s.id,
        status: "active",
      });
      theme.current = CHAPTERS[index].id;
      setGuidedIndex(index);
      setGuided(true);
      setTyping(true);
      setPhase("talking");
      const q = getChapterQuestion(theme.current, {
        recipientName: collectionRef.current?.recipient.name,
        faithFraming: collectionRef.current?.faithFraming,
      });
      setQuestion(q);
      await addTurn("agent", q);
    } catch (e) {
      setError(friendly(e));
    } finally {
      setWorking(false);
    }
  }

  async function sendTyped() {
    if (!typed.trim()) return;
    setWorking(true);
    setError("");
    try {
      const text = typed.trim();
      await addTurn("user", text);
      await saveTextDraft(collectionId, "__interview_typed", "");
      setTyped("");
      if (guided) {
        const index = guidedIndex + 1;
        if (index >= CHAPTERS.length) {
          await finish();
          return;
        }
        setGuidedIndex(index);
        theme.current = CHAPTERS[index].id;
        const q = getChapterQuestion(theme.current, {
          recipientName: collectionRef.current?.recipient.name,
          faithFraming: collectionRef.current?.faithFraming,
        });
        setQuestion(q);
        await addTurn("agent", q);
      } else if (client.current) {
        typedEchoes.current.push(text);
        client.current.sendUserMessage(text);
      } else
        setError(
          "Your words are saved. Reconnect the interviewer to continue.",
        );
    } catch (e) {
      setError(friendly(e));
    } finally {
      setWorking(false);
    }
  }

  async function prepareStories() {
    setWorking(true);
    setError("");
    try {
      await localWrites.current;
      await flush();
      if (archiveRef.current.pendingCount || memoryWarning)
        throw new Error(
          "Back up your remaining recordings and words before preparing your stories.",
        );
      if (!wordsChecked)
        throw new Error(
          "Check that the words include everything you want to share before preparing your stories.",
        );
      for (const s of collectionRef.current?.interviews ?? []) {
        if (s.status !== "completed")
          await request("/interview", {
            action: "set_status",
            sessionId: s.id,
            status: "completed",
          });
      }
      await request("", {
        action: "generate",
        regenerate: Boolean(collectionRef.current?.chapters.length),
      });
      router.push(`/collection/${collectionId}/review${query}`);
    } catch (e) {
      setError(friendly(e));
    } finally {
      setWorking(false);
    }
  }

  function downloadWords() {
    const snapshot = {
      interviews: collectionRef.current?.interviews,
      pending,
      unsaved: unsavedMemory.current,
      typed,
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
      await saveTextDraft(collectionId, "__interview_typed", typed);
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
  const visibleStatus =
    phase === "connecting"
      ? "Connecting your interviewer"
      : phase === "paused"
        ? "Paused"
        : phase === "interrupted"
          ? "Interviewer disconnected"
          : phase === "review"
            ? "Ready to review"
            : active
              ? guided
                ? "Write at your own pace"
                : mode === "speaking"
                  ? "Your interviewer is speaking"
                  : "Listening to you"
              : "Your AI interviewer";

  if (!collection)
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="font-serif text-3xl">Opening your interview</h1>
        <p role={error ? "alert" : "status"} className="mt-4">
          {error || "One moment while we find your stories."}
        </p>
      </main>
    );
  if (collection.role !== "owner")
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="font-serif text-3xl">This is a private interview.</h1>
        <p className="mt-4">
          Use the interview link sent to the person sharing their story.
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

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-8 text-ink-700 sm:px-8 sm:pt-12">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-warmgray-300 pb-6">
        <Logo />
        <span className="text-sm">A story for {collection.recipient.name}</span>
      </header>
      <div className="mb-9 mt-9 max-w-3xl">
        <h1 className="font-serif text-4xl leading-tight sm:text-5xl">
          {phase === "review"
            ? "Your words, before you share."
            : "Take your time. Your story matters."}
        </h1>
        <p className="mt-4 text-lg leading-8 text-ink-700">
          {phase === "review"
            ? "Read what we captured and correct any names or details. Your original recordings stay saved."
            : "One conversation about your life, your walk with Jesus, and what you hope " +
              collection.recipient.name +
              " carries forward."}
        </p>
      </div>
      {(error || archive.error || archive.warning || memoryWarning) && (
        <div
          className="mb-6 rounded-md border border-oxblood/30 bg-paper-50 p-4"
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
      {phase !== "review" && (
        <section
          className="border-y border-warmgray-300 py-8 sm:py-10"
          aria-label="Your interview"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p
              className="flex items-center gap-3 text-sm font-medium text-oxblood"
              role="status"
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${active && !guided ? "bg-oxblood" : "bg-warmgray-300"}`}
                aria-hidden="true"
              />
              {visibleStatus}
            </p>
            <p className="text-sm text-ink-700" role="status">
              {archive.status === "recording"
                ? archive.recordings.some(
                    (r) => r.state === "recording" && r.localSaved,
                  )
                  ? "Recording · saving on this device"
                  : "Recording · first save in progress"
                : archive.saving
                  ? "Backing up your recording"
                  : savingWords
                    ? "Backing up your words"
                    : pending.length
                      ? `${pending.length} updates waiting for backup`
                      : sessionId
                        ? "Your saved answers are backed up"
                        : ""}
            </p>
          </div>
          <div
            className={`mt-8 grid gap-8 ${archive.stream?.getVideoTracks().length ? "sm:grid-cols-[1fr_220px]" : ""}`}
          >
            <div>
              <h2 className="max-w-3xl font-serif text-3xl leading-snug sm:text-4xl">
                {question}
              </h2>
              <p className="mt-5 text-base leading-7">
                {phase === "ready"
                  ? "Your AI interviewer will ask one question at a time. You can pause whenever you need to, and review everything before sharing."
                  : phase === "paused"
                    ? "The interviewer and recording are paused. Continue when you are ready."
                    : guided
                      ? "These are guided questions. Live AI conversation is not being used."
                      : "There is no perfect answer. Start with a moment you remember."}
              </p>
            </div>
            <CameraPreview stream={archive.stream} />
          </div>
          {(phase === "ready" ||
            (phase === "paused" && !sessionRef.current)) && (
            <div className="mt-8 space-y-5">
              {!collection.capabilities.liveInterview && (
                <p className="rounded-md bg-paper-100 p-4 text-base">
                  Live voice is not connected in this preview. You can write
                  your answers here or record one answer at a time.
                </p>
              )}
              {collection.capabilities.liveInterview && (
                <fieldset className="flex flex-wrap gap-5">
                  <legend className="mb-3 text-sm font-medium">
                    When you start a voice interview, save:
                  </legend>
                  {(["video", "voice"] as const).map((value) => (
                    <label
                      key={value}
                      className="flex min-h-12 items-center gap-2"
                    >
                      <input
                        type="radio"
                        name="record-kind"
                        value={value}
                        checked={kind === value}
                        onChange={() => setKind(value)}
                      />
                      {value === "video" ? "My video and voice" : "My voice"}
                    </label>
                  ))}
                </fieldset>
              )}
              {collection.capabilities.liveInterview && (
                <p className="max-w-2xl text-sm leading-6">
                  Starting the voice interview uses your microphone and records
                  your answers. AI processes the conversation to prepare your
                  stories. You decide what is shared.
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                <button
                  className={primary}
                  disabled={
                    working ||
                    !journalReady ||
                    !collection.capabilities.liveInterview
                  }
                  onClick={() => void connect()}
                >
                  Start my interview
                </button>
                <button
                  className={secondary}
                  disabled={working || !journalReady}
                  onClick={() => void startGuided()}
                >
                  Write my answers
                </button>
                {userItems.length > 0 && (
                  <button
                    className={secondary}
                    disabled={working}
                    onClick={() => {
                      setWordsChecked(false);
                      setPhase("review");
                    }}
                  >
                    Review saved answers
                  </button>
                )}
              </div>
            </div>
          )}
          {(active || phase === "paused") && sessionRef.current && (
            <div className="mt-8 flex flex-wrap gap-3">
              {phase === "paused" || phase === "interrupted" ? (
                <button
                  className={primary}
                  disabled={working}
                  onClick={() => void (guided ? startGuided() : connect())}
                >
                  {phase === "interrupted"
                    ? "Reconnect interviewer"
                    : "Continue interview"}
                </button>
              ) : (
                <button
                  className={secondary}
                  disabled={working}
                  onClick={() => void pause()}
                >
                  Pause for a moment
                </button>
              )}
              {!guided && active && (
                <button
                  className={secondary}
                  disabled={working || !client.current}
                  onClick={() => {
                    const text =
                      "[Interview control: I have finished this answer. Please continue with one relevant question.]";
                    controlEchoes.current.push(text);
                    client.current?.sendUserMessage(text);
                  }}
                >
                  I’m finished with this answer
                </button>
              )}
              <button
                className={secondary}
                disabled={working}
                onClick={() => void finish()}
              >
                Finish and review
              </button>
              {!guided && active && (
                <button
                  className="min-h-12 px-3 text-oxblood underline underline-offset-4"
                  onClick={() => {
                    setTyping(!typing);
                    client.current?.setMicMuted(!typing);
                  }}
                >
                  {" "}
                  {typing ? "Use my microphone" : "Type an answer"}
                </button>
              )}
            </div>
          )}
          {active && typing && (
            <form
              className="mt-7"
              onSubmit={(e) => {
                e.preventDefault();
                void sendTyped();
              }}
            >
              <label htmlFor="interview-answer" className="text-sm font-medium">
                Your answer
              </label>
              <textarea
                id="interview-answer"
                value={typed}
                onChange={(e) => {
                  const value = e.target.value;
                  setTyped(value);
                  client.current?.sendUserActivity();
                  void saveTextDraft(
                    collectionId,
                    "__interview_typed",
                    value,
                  ).catch(() => setMemoryWarning(true));
                }}
                rows={6}
                maxLength={30000}
                className="mt-2 w-full rounded-md border border-warmgray-300 bg-white p-4 text-lg leading-8"
              />
              <button
                className={`${primary} mt-4`}
                disabled={working || !typed.trim()}
              >
                Save answer{guided ? " and continue" : ""}
              </button>
            </form>
          )}
        </section>
      )}
      {phase === "review" && (
        <section aria-label="Review your words">
          <p className="text-sm text-ink-700">
            {userItems.length} saved answers. Corrections change the written
            story, while preserving the original recording.
          </p>
          {userItems.map(({ turn, session }) => (
            <TurnReview
              key={turn.id}
              turn={turn}
              included={!session.excludedTurnIds?.includes(turn.id)}
              busy={working || savingWords}
              onInclude={(included) => {
                setWordsChecked(false);
                return enqueue({
                  action: "select_turn",
                  sessionId: session.id,
                  turnId: turn.id,
                  included,
                });
              }}
              onSave={(text) => {
                setWordsChecked(false);
                sequence.current = Math.max(
                  sequence.current,
                  ...session.turns.map((t) => t.sequence + 1),
                );
                return enqueue({
                  action: "append_turns",
                  sessionId: session.id,
                  turns: [
                    {
                      ...turn,
                      id: crypto.randomUUID(),
                      sequence: sequence.current++,
                      text,
                      capturedAt: new Date().toISOString(),
                      supersedesTurnId: turn.id,
                    },
                  ],
                });
              }}
            />
          ))}
          <details className="mt-6 border border-warmgray-300 p-4">
            <summary className="cursor-pointer text-oxblood">
              Add words that were missed
            </summary>
            <label className="mt-4 block text-sm">
              Which story do these words belong to?
              <select
                className="mt-2 w-full border border-warmgray-300 bg-white p-3"
                value={missingTheme}
                onChange={(e) =>
                  setMissingTheme(e.target.value as InterviewChapterId)
                }
              >
                {CHAPTERS.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block text-sm">
              Your words
              <textarea
                value={missingWords}
                onChange={(e) => setMissingWords(e.target.value)}
                maxLength={30000}
                rows={4}
                className="mt-2 w-full border border-warmgray-300 bg-white p-3 text-base"
              />
            </label>
            <button
              className={`${secondary} mt-3`}
              disabled={working || !missingWords.trim()}
              onClick={async () => {
                setWorking(true);
                try {
                  await ensureSession("guided");
                  theme.current = missingTheme;
                  await addTurn("user", missingWords);
                  setMissingWords("");
                  setWordsChecked(false);
                } catch (e) {
                  setError(friendly(e));
                } finally {
                  setWorking(false);
                }
              }}
            >
              Save these words
            </button>
          </details>
          <label className="mt-6 flex items-start gap-3 rounded-md bg-paper-100 p-4">
            <input
              className="mt-1 h-5 w-5"
              type="checkbox"
              checked={wordsChecked}
              onChange={(e) => setWordsChecked(e.target.checked)}
            />
            <span>
              I checked these words, including the end of my last answer. They
              include what I want in my stories.
            </span>
          </label>
          <div className="mt-7 flex flex-wrap gap-3">
            <button
              className={primary}
              disabled={
                working ||
                archive.saving ||
                archive.pendingCount > 0 ||
                pending.length > 0 ||
                memoryWarning ||
                !wordsChecked ||
                !userItems.length
              }
              onClick={() => void prepareStories()}
            >
              {working ? "Preparing your stories…" : "Prepare my four stories"}
            </button>
            <button
              className={secondary}
              disabled={working}
              onClick={() => {
                sessionRef.current = null;
                setSessionId("");
                setPhase("ready");
              }}
            >
              Add another memory
            </button>
          </div>
          {(archive.pendingCount > 0 || pending.length > 0) && (
            <p className="mt-3 text-sm">
              Finish backing up your recordings and words before preparing your
              stories.
            </p>
          )}
        </section>
      )}
      {archive.recordings.length > 0 && (
        <section className="mt-10">
          <h2 className="font-serif text-2xl">Your original recordings</h2>
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
                    {record.state === "recording"
                      ? "Recording now"
                      : record.state === "backed_up"
                        ? "Backed up"
                        : record.localSaved
                          ? "Saved on this device; backup pending"
                          : "Not yet saved on this device"}
                  </p>
                </div>
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
                {record.state !== "recording" && (
                  <OriginalPlayback
                    id={record.localTakeId}
                    kind={record.kind}
                    getBlob={archive.getBlob}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      {userItems.length > 0 && phase !== "review" && (
        <details className="mt-8 border-b border-warmgray-300 pb-5">
          <summary className="cursor-pointer py-3 text-base text-oxblood">
            Read your saved answers ({userItems.length})
          </summary>
          <div className="max-h-80 space-y-5 overflow-auto py-3">
            {userItems.map(({ turn }) => (
              <p key={turn.id} className="whitespace-pre-wrap leading-7">
                {turn.text}
              </p>
            ))}
          </div>
        </details>
      )}
      {!active && phase !== "connecting" && phase !== "finishing" && (
        <p className="mt-10 text-sm">
          <Link
            className="text-oxblood underline underline-offset-4"
            href={`/record/${collectionId}${query}&classic=1`}
          >
            Record one answer at a time
          </Link>
          {collection.chapters.length > 0 && (
            <>
              {" "}
              ·{" "}
              <Link
                className="text-oxblood underline underline-offset-4"
                href={`/collection/${collectionId}/review${query}`}
              >
                Open your story drafts
              </Link>
            </>
          )}
        </p>
      )}
    </main>
  );
}
