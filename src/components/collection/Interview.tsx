"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CHAPTERS,
  MAX_FOLLOW_UPS,
  getChapterQuestion,
} from "@/lib/interview-state";
import type { AnswerTake, CollectionView } from "@/lib/collection/types";
import {
  getTakeBlob,
  getTextDraft,
  listLocalTakes,
  saveTextDraft,
} from "@/lib/collection/local-takes";
import SavedRecorder from "./SavedRecorder";

const primary =
  "min-h-12 rounded-md bg-oxblood px-5 py-3 font-medium text-white disabled:opacity-50";
const secondary =
  "min-h-12 rounded-md border border-warmgray-300 bg-paper-50 px-4 py-3 font-medium text-ink-700 disabled:opacity-50";
const emptyBlessing = {
  encouragement: "",
  scriptureReference: "",
  scriptureText: "",
  scriptureTranslation: "",
};
type Blessing = typeof emptyBlessing;

function TakeCard({
  take,
  selected,
  index,
  disabled,
  mediaUrl,
  onSelect,
  onTranscript,
}: {
  take: AnswerTake;
  selected: boolean;
  index: number;
  disabled: boolean;
  mediaUrl?: string;
  onSelect: () => void;
  onTranscript: (text: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(take.text);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!editing) setText(take.text);
  }, [take.text, editing]);
  return (
    <article
      className={`space-y-4 rounded-lg border p-5 ${selected ? "border-oxblood bg-paper-50" : "border-warmgray-300"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl">
            Take {index + 1}
            {take.kind === "text" ? ", written" : `, ${take.kind}`}
          </h3>
          <p className="mt-1 text-sm text-ink-400">
            Backed up
            {take.durationSeconds
              ? ` · ${Math.floor(take.durationSeconds / 60)}:${String(Math.round(take.durationSeconds % 60)).padStart(2, "0")}`
              : ""}
          </p>
        </div>
        <button
          type="button"
          aria-pressed={selected}
          onClick={onSelect}
          disabled={disabled || selected}
          className={
            selected
              ? "min-h-12 px-3 py-3 text-sm font-semibold text-oxblood"
              : secondary
          }
        >
          {selected ? "✓ Selected for your story" : "Use this take"}
        </button>
      </div>
      {mediaUrl &&
        (take.kind === "video" ? (
          <video
            src={mediaUrl}
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full rounded-md bg-ink-800"
            aria-label={`Play video take ${index + 1}`}
          />
        ) : (
          <audio
            src={mediaUrl}
            controls
            preload="metadata"
            className="w-full"
            aria-label={`Play voice take ${index + 1}`}
          />
        ))}
      {take.text && !editing && (
        <p className="whitespace-pre-wrap text-base leading-7 text-ink-700">
          {take.text}
        </p>
      )}
      {!take.text && !editing && (
        <p className="text-sm text-ink-400">
          {take.transcriptionStatus === "pending"
            ? "The transcript is being prepared. Your original recording is saved."
            : "Add the words from this recording so they can be included in your written chapter."}
        </p>
      )}
      {editing ? (
        <div className="space-y-3">
          <label
            className="block text-sm font-medium text-ink-700"
            htmlFor={`transcript-${take.id}`}
          >
            Your words
          </label>
          <textarea
            id={`transcript-${take.id}`}
            maxLength={30000}
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={5}
            className="w-full text-base"
          />
          <p className="text-sm text-ink-400">
            Correct names or transcription mistakes. This changes the written
            transcript, while your original recording stays saved.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={secondary}
              disabled={!text.trim() || saving}
              onClick={async () => {
                setSaving(true);
                setError("");
                try {
                  await onTranscript(text.trim());
                  setEditing(false);
                } catch (error) {
                  setError(
                    error instanceof Error
                      ? error.message
                      : "The transcript could not be saved.",
                  );
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Saving…" : "Save words"}
            </button>
            <button
              type="button"
              className="min-h-12 px-3 text-ink-400"
              onClick={() => {
                setText(take.text);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-oxblood">
              {error}
            </p>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="text-sm font-medium text-oxblood underline underline-offset-4"
          disabled={disabled}
          onClick={() => setEditing(true)}
        >
          {take.text ? "Correct these words" : "Add a transcript"}
        </button>
      )}
      {mediaUrl && (
        <a
          href={mediaUrl}
          download
          className="ml-4 inline-flex items-center text-sm text-oxblood underline underline-offset-4"
        >
          Download original
        </a>
      )}
    </article>
  );
}

function ChapterBlessing({
  value,
  onSave,
  disabled,
  collectionId,
  questionId,
}: {
  value: Blessing;
  onSave: (value: Blessing) => Promise<void>;
  disabled: boolean;
  collectionId: string;
  questionId: string;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const initialValue = useRef(value);
  useEffect(() => {
    let active = true;
    getTextDraft(collectionId, `${questionId}-blessing`)
      .then((saved) => {
        if (!active) return;
        if (saved) {
          try {
            const recovered = JSON.parse(saved);
            if (
              Object.keys(emptyBlessing).every(
                (key) => typeof recovered[key] === "string",
              )
            )
              setDraft(recovered);
          } catch {
            setDraft(initialValue.current);
          }
        }
      })
      .catch(() => {
        if (active)
          setError(
            "Device drafts are unavailable. Save these words before leaving the chapter.",
          );
      })
      .finally(() => {
        if (active) setDraftReady(true);
      });
    return () => {
      active = false;
    };
  }, [collectionId, questionId]);
  function change(field: keyof Blessing, text: string) {
    const next = { ...draft, [field]: text };
    setDraft(next);
    setMessage("Saving draft…");
    void saveTextDraft(
      collectionId,
      `${questionId}-blessing`,
      JSON.stringify(next),
    )
      .then(() =>
        setMessage(
          "Draft saved on this device. Save for this chapter when you are ready.",
        ),
      )
      .catch(() =>
        setError(
          "Device drafts are unavailable. Save these words before leaving the chapter.",
        ),
      );
  }
  return (
    <details className="rounded-lg border border-warmgray-300 p-5">
      <summary className="cursor-pointer font-medium text-ink-700">
        Add a personal encouragement or Scripture, optional
      </summary>
      <div className="mt-5 space-y-4">
        <p className="text-sm text-ink-400">
          Include something you want them to carry from this chapter. You will
          review it before it is shared.
        </p>
        <label className="block text-sm font-medium text-ink-700">
          Your encouragement
          <textarea
            rows={3}
            maxLength={1000}
            value={draft.encouragement}
            disabled={!draftReady}
            onChange={(event) => change("encouragement", event.target.value)}
            className="mt-2 w-full text-base"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-ink-700">
            Scripture reference
            <input
              maxLength={120}
              value={draft.scriptureReference}
              disabled={!draftReady}
              onChange={(event) =>
                change("scriptureReference", event.target.value)
              }
              className="mt-2 w-full text-base"
            />
          </label>
          <label className="block text-sm font-medium text-ink-700">
            Translation
            <input
              maxLength={60}
              value={draft.scriptureTranslation}
              disabled={!draftReady}
              onChange={(event) =>
                change("scriptureTranslation", event.target.value)
              }
              className="mt-2 w-full text-base"
            />
          </label>
        </div>
        <label className="block text-sm font-medium text-ink-700">
          Scripture text
          <textarea
            rows={3}
            maxLength={2000}
            value={draft.scriptureText}
            disabled={!draftReady}
            onChange={(event) => change("scriptureText", event.target.value)}
            className="mt-2 w-full text-base"
          />
        </label>
        <p className="text-sm text-ink-400">
          Use the wording and translation you want included. Please check the
          reference and text before saving.
        </p>
        <button
          type="button"
          className={secondary}
          disabled={disabled || saving || !draftReady}
          onClick={async () => {
            setSaving(true);
            setError("");
            setMessage("");
            try {
              await onSave(draft);
              await saveTextDraft(
                collectionId,
                `${questionId}-blessing`,
                "",
              ).catch(() => undefined);
              setMessage("Saved for this chapter.");
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "This could not be saved.",
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving…" : "Save for this chapter"}
        </button>
        {message && (
          <p role="status" className="text-sm text-ink-700">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-oxblood">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}

export default function Interview({
  collectionId,
  accessKey,
}: {
  collectionId: string;
  accessKey: string;
}) {
  const router = useRouter();
  const endpoint = `/api/collection/${encodeURIComponent(collectionId)}`;
  const query = `?key=${encodeURIComponent(accessKey)}`;
  const [collection, setCollection] = useState<CollectionView | null>(null);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [followUpIndex, setFollowUpIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<"video" | "voice" | "text">("video");
  const [text, setText] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recorderBusy, setRecorderBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceUnavailable, setVoiceUnavailable] = useState(false);
  const [notice, setNotice] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef("");
  const speechRequest = useRef(0);
  const speechAbort = useRef<AbortController | null>(null);
  const draftQueue = useRef<Promise<void>>(Promise.resolve());
  const initialLoaded = useRef(false);
  const chapter = CHAPTERS[chapterIndex];
  const followUps = collection?.followUps[chapter.id] ?? [];
  const questionId =
    followUpIndex === null ? chapter.id : `${chapter.id}-f${followUpIndex + 1}`;
  const prompt =
    followUpIndex === null
      ? getChapterQuestion(chapter.id, {
          recipientName: collection?.recipient.name,
          faithFraming: collection?.faithFraming,
        })
      : (followUps[followUpIndex] ?? chapter.question);
  const allBusy = busy || recorderBusy;
  const questionTakes =
    collection?.takes
      .filter((take) => take.questionId === questionId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)) ?? [];
  const selectedTake = questionTakes.find(
    (take) => take.id === collection?.selectedTakeIds[questionId],
  );
  const completed = CHAPTERS.filter((item) =>
    collection?.takes.some(
      (take) =>
        take.id === collection.selectedTakeIds[item.id] &&
        Boolean(take.text.trim()),
    ),
  ).length;
  const progress = Math.min(
    100,
    Math.max(0, (completed / CHAPTERS.length) * 100),
  );

  const load = useCallback(async () => {
    const response = await fetch(`${endpoint}${query}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Your interview could not be opened.");
    setCollection(data.collection);
    if (!initialLoaded.current) {
      initialLoaded.current = true;
      setChapterIndex(
        Math.min(
          CHAPTERS.length - 1,
          Math.max(0, data.collection.currentQuestion || 0),
        ),
      );
    }
    return data.collection as CollectionView;
  }, [endpoint, query]);

  useEffect(() => {
    let alive = true;
    load()
      .catch((error) => {
        if (alive)
          setError(
            error instanceof Error
              ? error.message
              : "Could not open the interview.",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [load]);
  useEffect(() => {
    let active = true;
    setDraftReady(false);
    setDraftStatus("");
    setText("");
    getTextDraft(collectionId, questionId)
      .then((draft) => {
        if (active) {
          setText(draft);
          setDraftReady(true);
          if (draft) setDraftStatus("Draft saved on this device");
        }
      })
      .catch(() => {
        if (active) {
          setDraftReady(true);
          setDraftStatus(
            "Device storage is unavailable. Save your answer before leaving this page.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [collectionId, questionId]);
  const cancelSpeech = useCallback(() => {
    // Invalidate asynchronous work before pausing so its callbacks cannot restart audio.
    speechRequest.current += 1;
    speechAbort.current?.abort();
    speechAbort.current = null;
    if (audio.current) {
      audio.current.onended = null;
      audio.current.onerror = null;
      audio.current.pause();
      audio.current.removeAttribute("src");
      audio.current.load();
      audio.current = null;
    }
    if (audioUrl.current) {
      URL.revokeObjectURL(audioUrl.current);
      audioUrl.current = "";
    }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  useEffect(() => () => cancelSpeech(), [cancelSpeech]);
  useEffect(() => {
    cancelSpeech();
    setSpeaking(false);
  }, [prompt, cancelSpeech]);

  function stopSpeaking() {
    cancelSpeech();
    setSpeaking(false);
  }

  async function act(
    body: Record<string, unknown>,
  ): Promise<{ collection: CollectionView; question?: string | null }> {
    const response = await fetch(`${endpoint}${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        data.error || "This change could not be saved. Please try again.",
      );
    if (data.collection) setCollection(data.collection);
    return data;
  }

  async function goTo(index: number) {
    if (allBusy) return;
    stopSpeaking();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await draftQueue.current;
      await act({ action: "progress", currentQuestion: index });
      setChapterIndex(index);
      setFollowUpIndex(null);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Your place could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function speak(useDevice = false) {
    if (speaking) {
      stopSpeaking();
      return;
    }
    cancelSpeech();
    const requestId = speechRequest.current;
    setError("");
    if (useDevice) {
      if (!("speechSynthesis" in window)) {
        setError(
          "This browser cannot read the question aloud. The question is written above.",
        );
        return;
      }
      const speech = new SpeechSynthesisUtterance(prompt);
      speech.rate = 0.95;
      speech.onend = () => {
        if (requestId === speechRequest.current) setSpeaking(false);
      };
      speech.onerror = () => {
        if (requestId === speechRequest.current) setSpeaking(false);
      };
      setSpeaking(true);
      window.speechSynthesis.speak(speech);
      return;
    }
    const controller = new AbortController();
    speechAbort.current = controller;
    setSpeaking(true);
    try {
      const response = await fetch(`${endpoint}/speak${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: prompt }),
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(
          "The interview voice is unavailable right now. You can try it again or choose the device voice.",
        );
      const blob = await response.blob();
      if (controller.signal.aborted || requestId !== speechRequest.current)
        return;
      audioUrl.current = URL.createObjectURL(blob);
      const player = new Audio(audioUrl.current);
      audio.current = player;
      player.onended = () => {
        if (requestId === speechRequest.current) setSpeaking(false);
      };
      player.onerror = () => {
        if (requestId === speechRequest.current) setSpeaking(false);
      };
      await player.play();
      if (requestId === speechRequest.current) setVoiceUnavailable(false);
    } catch (error) {
      if (controller.signal.aborted || requestId !== speechRequest.current)
        return;
      setSpeaking(false);
      setVoiceUnavailable(true);
      setError(
        error instanceof Error
          ? error.message
          : "The question could not be read aloud.",
      );
    } finally {
      if (speechAbort.current === controller) speechAbort.current = null;
    }
  }

  const handleRecorderBusy = useCallback(
    (value: boolean) => {
      setRecorderBusy(value);
      if (value) {
        cancelSpeech();
        setSpeaking(false);
      }
    },
    [cancelSpeech],
  );

  async function saveText() {
    if (!text.trim()) return;
    setBusy(true);
    setError("");
    const take: AnswerTake = {
      id: crypto.randomUUID(),
      questionId,
      prompt,
      kind: "text",
      text: text.trim(),
      createdAt: new Date().toISOString(),
      transcriptionStatus: "ready",
    };
    try {
      await act({ action: "save_take", take });
      setNotice(
        "Your answer is backed up. You can add detail or move to the next chapter.",
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Your answer could not be backed up. The draft stays on this device.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function askFollowUp() {
    setBusy(true);
    setError("");
    stopSpeaking();
    try {
      const result = await act({ action: "followup", questionId: chapter.id });
      if (result.question)
        setFollowUpIndex(
          (result.collection.followUps[chapter.id]?.length ?? 1) - 1,
        );
      else
        setNotice(
          "You have answered the follow-ups for this chapter. You can continue when you are ready.",
        );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "A follow-up could not be prepared.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    setBusy(true);
    setError("");
    stopSpeaking();
    try {
      await draftQueue.current;
      const local = await listLocalTakes(collectionId).catch(() => []);
      const candidates = local.filter(
        (take) =>
          take.state !== "backed_up" &&
          !collection?.takes.some((saved) => saved.id === take.id),
      );
      const checked = await Promise.all(
        candidates.map(async (take) => {
          try {
            return (await getTakeBlob(take)).size ? take : null;
          } catch {
            return null;
          }
        }),
      );
      const pending = checked.filter((take): take is NonNullable<typeof take> =>
        Boolean(take),
      );
      if (pending.length) {
        const places = [
          ...new Set(
            pending.map(
              (take) =>
                `chapter ${take.questionId[1]}, ${take.kind === "voice" ? "Voice only" : "Video"}`,
            ),
          ),
        ].join("; ");
        throw new Error(
          `You have ${pending.length} recording${pending.length === 1 ? "" : "s"} saved only on this device (${places}). Open those answers and back them up before preparing your story.`,
        );
      }
      await act({ action: "generate" });
      router.push(
        `/collection/${encodeURIComponent(collectionId)}/review${query}`,
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Your draft could not be prepared yet.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading)
    return (
      <main className="mx-auto max-w-3xl px-5 py-20">
        <p role="status">Opening your saved interview…</p>
      </main>
    );
  if (!collection)
    return (
      <main className="mx-auto max-w-3xl px-5 py-20">
        <h1 className="font-serif text-4xl">
          We could not open this interview.
        </h1>
        <p className="mt-5" role="alert">
          {error || "Open the interview link from your invitation."}
        </p>
        <button
          className={`${secondary} mt-6`}
          onClick={() => {
            setLoading(true);
            void load()
              .catch((error) => setError(error.message))
              .finally(() => setLoading(false));
          }}
        >
          Try again
        </button>
      </main>
    );
  if (collection.role !== "owner")
    return (
      <main className="mx-auto max-w-3xl px-5 py-20">
        <h1 className="font-serif text-4xl">This link is for the recipient.</h1>
        <p className="mt-5">
          Use the storyteller’s invitation to record the interview.
        </p>
        <Link
          href={`/collection/${collectionId}${query}`}
          className="mt-6 inline-flex items-center text-oxblood underline"
        >
          Open the story page
        </Link>
      </main>
    );
  if (collection.status === "approved")
    return (
      <main className="mx-auto max-w-3xl px-5 py-20">
        <h1 className="font-serif text-4xl">Your story has been approved.</h1>
        <p className="mt-5">
          Your approved chapters and original recordings are saved. The shared
          version stays unchanged.
        </p>
        <Link
          href={`/collection/${collectionId}${query}`}
          className={`${primary} mt-6 inline-flex items-center`}
        >
          Open your collection
        </Link>
      </main>
    );

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-8 text-ink-700 sm:px-8 sm:pt-12">
      <header className="border-b border-warmgray-300 pb-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a
            href="/"
            className="inline-flex items-center font-serif text-xl text-oxblood"
          >
            Time Tapestry
          </a>
          <span className="text-sm text-ink-400">
            {collection.storyteller.name}’s interview
          </span>
        </div>
        <h1 className="mt-6 max-w-2xl font-serif text-4xl leading-tight sm:text-5xl">
          A story only you can tell.
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-ink-400">
          Four chapters for {collection.recipient.name}. Answer in your own
          words, take a break when you need one, and review everything before
          sharing.
        </p>
        <div className="mt-6 flex items-center justify-between gap-4 text-sm">
          <span>{completed} of 4 chapters have a saved answer</span>
          <span>Your place is saved</span>
        </div>
        <div
          role="progressbar"
          aria-label="Chapters with saved answers"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-warmgray-200"
        >
          <div
            className="h-full bg-oxblood"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>
      <nav
        aria-label="Interview chapters"
        className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {CHAPTERS.map((item, index) => {
          const answered = collection.takes.some(
            (take) =>
              take.id === collection.selectedTakeIds[item.id] &&
              take.text.trim(),
          );
          return (
            <button
              key={item.id}
              type="button"
              aria-current={index === chapterIndex ? "step" : undefined}
              disabled={allBusy}
              onClick={() => void goTo(index)}
              className={`min-h-20 rounded-md border px-3 py-3 text-left disabled:opacity-50 ${index === chapterIndex ? "border-oxblood bg-paper-50" : "border-warmgray-300"}`}
            >
              <span
                className={`block text-xs font-semibold ${index === chapterIndex ? "text-oxblood" : "text-ink-400"}`}
              >
                {answered ? "✓ " : ""}CHAPTER {index + 1}
              </span>
              <span className="mt-1 block text-sm leading-5">{item.title}</span>
            </button>
          );
        })}
      </nav>
      <section
        className="mx-auto mt-10 max-w-3xl"
        aria-labelledby="interview-question"
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-warmgray-300 pb-4">
          <button
            className={`min-h-11 px-3 text-sm ${followUpIndex === null ? "font-semibold text-oxblood" : "text-ink-400"}`}
            disabled={allBusy}
            onClick={() => {
              stopSpeaking();
              setFollowUpIndex(null);
            }}
          >
            Main question
          </button>
          {followUps.map((_, index) => (
            <button
              key={index}
              className={`min-h-11 px-3 text-sm ${followUpIndex === index ? "font-semibold text-oxblood" : "text-ink-400"}`}
              disabled={allBusy}
              onClick={() => {
                stopSpeaking();
                setFollowUpIndex(index);
              }}
            >
              Follow-up {index + 1}
            </button>
          ))}
        </div>
        <p className="mt-7 text-sm font-semibold uppercase tracking-wide text-oxblood">
          {followUpIndex === null
            ? chapter.title
            : "A little more about that memory"}
        </p>
        <h2
          id="interview-question"
          className="mt-3 font-serif text-3xl leading-snug sm:text-4xl"
        >
          {prompt}
        </h2>
        <button
          type="button"
          disabled={recorderBusy}
          className="mt-3 text-sm font-medium text-oxblood underline underline-offset-4 disabled:opacity-50"
          onClick={() => void speak(!collection.capabilities.tts)}
        >
          {speaking
            ? "Stop listening"
            : !collection.capabilities.tts
              ? "Listen with device voice"
              : voiceUnavailable
                ? "Retry interview voice"
                : "Listen to the question"}
        </button>
        {collection.capabilities.tts && voiceUnavailable && !speaking && (
          <button
            type="button"
            disabled={recorderBusy}
            className="ml-4 mt-3 text-sm font-medium text-oxblood underline underline-offset-4 disabled:opacity-50"
            onClick={() => void speak(true)}
          >
            Listen with device voice
          </button>
        )}
        <p className="mt-3 text-base leading-7 text-ink-400">
          Start with one moment you remember. There is no right answer, and you
          can leave out anything you prefer to keep private.
        </p>
        <div
          className="mt-7 flex flex-wrap gap-2"
          role="group"
          aria-label="How would you like to answer?"
        >
          {(["video", "voice", "text"] as const).map((item) => (
            <button
              type="button"
              key={item}
              aria-pressed={mode === item}
              disabled={allBusy}
              onClick={() => {
                stopSpeaking();
                setMode(item);
                setNotice("");
              }}
              className={`min-h-12 rounded-md border px-5 py-3 font-medium disabled:opacity-50 ${mode === item ? "border-oxblood bg-oxblood text-white" : "border-warmgray-300 bg-paper-50 text-ink-700"}`}
            >
              {item === "video"
                ? "Video"
                : item === "voice"
                  ? "Voice only"
                  : "Type"}
            </button>
          ))}
        </div>
        <div className="mt-5">
          {mode === "text" ? (
            <div className="space-y-3">
              <label
                htmlFor="written-answer"
                className="block text-sm font-medium"
              >
                Your answer
              </label>
              <textarea
                id="written-answer"
                maxLength={30000}
                value={text}
                disabled={!draftReady}
                rows={7}
                className="w-full text-lg leading-8"
                onChange={(event) => {
                  const value = event.target.value;
                  setText(value);
                  setDraftStatus("Saving draft…");
                  draftQueue.current = draftQueue.current
                    .then(() => saveTextDraft(collectionId, questionId, value))
                    .then(() => setDraftStatus("Draft saved on this device"))
                    .catch(() =>
                      setDraftStatus(
                        "Device storage is unavailable. Save your answer before leaving this page.",
                      ),
                    );
                }}
              />
              <p className="text-sm text-ink-400" role="status">
                {draftStatus ||
                  "You can write as much or as little as you need."}
              </p>
              <button
                type="button"
                className={primary}
                disabled={
                  allBusy ||
                  !text.trim() ||
                  (selectedTake?.kind === "text" &&
                    selectedTake.text === text.trim())
                }
                onClick={() => void saveText()}
              >
                {busy ? "Saving…" : "Save this answer"}
              </button>
            </div>
          ) : (
            <SavedRecorder
              key={`${questionId}-${mode}`}
              collectionId={collectionId}
              accessKey={accessKey}
              questionId={questionId}
              kind={mode}
              prompt={prompt}
              directUpload={collection.capabilities.directUpload}
              onBusyChange={handleRecorderBusy}
              onSaved={() => {
                void load().catch((error) => setError(error.message));
              }}
            />
          )}
        </div>
        {error && (
          <p
            role="alert"
            className="mt-5 rounded-md border border-oxblood/30 p-4 text-oxblood"
          >
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-4 text-sm text-ink-700">
            {notice}
          </p>
        )}
        {questionTakes.length > 0 && (
          <section
            aria-labelledby="saved-takes-heading"
            className="mt-8 space-y-4"
          >
            <div>
              <h2 id="saved-takes-heading" className="font-serif text-2xl">
                Your saved answers
              </h2>
              <p className="mt-2 text-sm leading-6 text-ink-400">
                Choose the take you want in your story. Until you choose, the
                latest backed-up take is selected. The others stay saved.
                Nothing is shared until you approve it.
              </p>
            </div>
            {questionTakes.map((take, index) => (
              <TakeCard
                key={take.id}
                take={take}
                index={index}
                selected={collection.selectedTakeIds[questionId] === take.id}
                disabled={allBusy}
                mediaUrl={
                  take.mediaId
                    ? `${endpoint}/media/${take.mediaId}${query}`
                    : undefined
                }
                onSelect={() => {
                  setBusy(true);
                  setError("");
                  void act({
                    action: "select_take",
                    questionId,
                    takeId: take.id,
                  })
                    .catch((error) => setError(error.message))
                    .finally(() => setBusy(false));
                }}
                onTranscript={async (value) => {
                  await act({
                    action: "save_take",
                    take: {
                      ...take,
                      text: value,
                      transcriptionStatus: "ready",
                    },
                  });
                }}
              />
            ))}
          </section>
        )}
        {followUpIndex === null && (
          <div className="mt-8">
            <ChapterBlessing
              key={chapter.id}
              collectionId={collectionId}
              questionId={chapter.id}
              value={collection.chapterBlessings?.[chapter.id] ?? emptyBlessing}
              disabled={allBusy}
              onSave={async (value) => {
                await act({
                  action: "blessing",
                  questionId: chapter.id,
                  value,
                });
              }}
            />
          </div>
        )}
        <div className="mt-8 flex flex-wrap gap-3 border-t border-warmgray-300 pt-6">
          {selectedTake?.text.trim() && followUps.length < MAX_FOLLOW_UPS && (
            <button
              type="button"
              className={secondary}
              disabled={allBusy}
              onClick={() => void askFollowUp()}
            >
              Help me add more detail
            </button>
          )}
          {chapterIndex < CHAPTERS.length - 1 ? (
            <button
              type="button"
              className={primary}
              disabled={allBusy}
              onClick={() => void goTo(chapterIndex + 1)}
            >
              {collection.selectedTakeIds[chapter.id]
                ? "Next chapter"
                : "Skip this chapter for now"}
            </button>
          ) : (
            <button
              type="button"
              className={primary}
              disabled={allBusy || completed < 4}
              onClick={() => void generate()}
            >
              {busy ? "Preparing your chapters…" : "Prepare my four chapters"}
            </button>
          )}
        </div>
        {chapterIndex === CHAPTERS.length - 1 && completed < 4 && (
          <p className="mt-3 text-sm text-ink-400">
            Save an answer with written words or a transcript in each chapter
            before preparing your story. You can return to any chapter above.
          </p>
        )}
        <p className="mt-6 text-sm leading-6 text-ink-400">
          Need a break? Finish saving your take, then return using this same
          link. Device drafts stay in this browser. Recordings marked Backed up
          are saved to your collection.
        </p>
      </section>
    </main>
  );
}
