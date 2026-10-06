"use client";

import Link from "next/link";
import { Logo } from "@/components/Logo";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CHAPTERS,
  NEUTRAL_DECISION_QUESTION,
  getChapterQuestion,
} from "@/lib/interview-state";
import type { AnswerTake, CollectionView } from "@/lib/collection/types";
import { getTakeBlob, listLocalTakes } from "@/lib/collection/local-takes";
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
  transcriptionAvailable,
  automaticTranscriptionActive,
  retrying,
  onSelect,
  onRetryTranscription,
  onRerecord,
}: {
  take: AnswerTake;
  selected: boolean;
  index: number;
  disabled: boolean;
  mediaUrl?: string;
  transcriptionAvailable: boolean;
  automaticTranscriptionActive: boolean;
  retrying: boolean;
  onSelect: () => void;
  onRetryTranscription: () => void;
  onRerecord: () => void;
}) {
  const recorded = take.kind !== "text" && Boolean(take.mediaId);
  const transcribing =
    transcriptionAvailable &&
    (retrying ||
      (take.transcriptionStatus === "pending" && automaticTranscriptionActive));
  return (
    <article
      className={`space-y-4 rounded-lg border p-5 ${selected ? "border-oxblood bg-paper-50" : "border-warmgray-300"}`}
    >
      <h3 className="text-xl">
        Take {index + 1}
        {take.kind === "text"
          ? ", earlier written answer"
          : take.kind === "video"
            ? ", video with sound"
            : ", audio only"}
      </h3>
      <p className="text-sm text-ink-400">
        Backed up. Listen before keeping this answer.
      </p>
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
            aria-label={`Play audio take ${index + 1}`}
          />
        ))}
      {recorded && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            aria-pressed={selected}
            onClick={onSelect}
            disabled={disabled || selected}
            className={secondary}
          >
            {selected ? "Answer kept" : "Keep this answer"}
          </button>
          <button
            type="button"
            onClick={onRerecord}
            disabled={disabled}
            className={secondary}
          >
            Record again
          </button>
        </div>
      )}
      {recorded && !take.text.trim() && (
        <div className="space-y-3">
          <p className="text-sm text-ink-400" role="status">
            {transcribing
              ? "Preparing the transcript automatically. Your recording is saved."
              : "Your recording is saved. Its automatic transcript is not ready yet."}
          </p>
          {transcriptionAvailable && !transcribing && (
            <button
              type="button"
              className={secondary}
              disabled={disabled}
              onClick={onRetryTranscription}
            >
              Retry automatic transcript
            </button>
          )}
        </div>
      )}
      {take.text.trim() && (
        <details className="rounded-md border border-warmgray-300 px-4 py-2">
          <summary className="cursor-pointer py-2 text-sm font-medium text-oxblood">
            Read the transcript
          </summary>
          <p className="whitespace-pre-wrap pb-3 text-base leading-7 text-ink-700">
            {take.text}
          </p>
        </details>
      )}
      {mediaUrl && (
        <a
          href={mediaUrl}
          download
          className="inline-flex items-center text-sm text-oxblood underline underline-offset-4"
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
}: {
  value: Blessing;
  onSave: (value: Blessing) => Promise<void>;
  disabled: boolean;
}) {
  const [encouragement, setEncouragement] = useState(value.encouragement);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return (
    <details className="rounded-lg border border-warmgray-300 p-5">
      <summary className="cursor-pointer font-medium text-ink-700">
        Postcard encouragement, optional
      </summary>
      <div className="mt-5 space-y-4">
        <label className="block text-base font-medium text-ink-700">
          A short encouragement for the postcard
          <textarea
            rows={3}
            maxLength={1000}
            value={encouragement}
            disabled={disabled || saving}
            onChange={(event) => {
              setEncouragement(event.target.value);
              setMessage("");
            }}
            className="mt-2 w-full text-base"
          />
        </label>
        <button
          type="button"
          className={secondary}
          disabled={disabled || saving}
          onClick={async () => {
            setSaving(true);
            setError("");
            try {
              await onSave({ ...value, encouragement });
              setMessage("Postcard encouragement saved.");
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "This encouragement could not be saved.",
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving…" : "Save postcard encouragement"}
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
  const [neutralDecision, setNeutralDecision] = useState(false);
  const [mode, setMode] = useState<"video" | "voice">("video");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recordingsApproved, setRecordingsApproved] = useState(false);
  const submitting = useRef(false);
  const recorderArea = useRef<HTMLDivElement>(null);
  const [recorderBusy, setRecorderBusy] = useState(false);
  const [transcribingTakeId, setTranscribingTakeId] = useState<string | null>(
    null,
  );
  const transcriptionRequest = useRef<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [voiceUnavailable, setVoiceUnavailable] = useState(false);
  const [notice, setNotice] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef("");
  const speechRequest = useRef(0);
  const speechAbort = useRef<AbortController | null>(null);
  const initialLoaded = useRef(false);
  const chapter = CHAPTERS[chapterIndex];
  const followUps = collection?.followUps[chapter.id] ?? [];
  const questionId =
    followUpIndex === null ? chapter.id : `${chapter.id}-f${followUpIndex + 1}`;
  const prompt =
    followUpIndex === null
      ? chapter.id === "q2" && neutralDecision
        ? NEUTRAL_DECISION_QUESTION
        : getChapterQuestion(chapter.id, {
            recipientName: collection?.recipient.name,
            faithFraming: collection?.faithFraming,
          })
      : (followUps[followUpIndex] ?? chapter.question);
  const allBusy = busy || recorderBusy || Boolean(transcribingTakeId);
  const questionTakes =
    collection?.takes
      .filter((take) => take.questionId === questionId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)) ?? [];
  const completed = CHAPTERS.filter(
    (item) =>
      collection?.takes.some(
        (take) =>
          take.id === collection.selectedTakeIds[item.id] &&
          take.kind !== "text" &&
          Boolean(take.mediaId) &&
          Boolean(take.text.trim()),
      ) ||
      collection?.interviews?.some(
        (session) =>
          session.segments.length > 0 &&
          session.turns.some(
            (turn) =>
              turn.role === "user" &&
              turn.chapterId === item.id &&
              turn.text.trim() &&
              !session.excludedTurnIds.includes(turn.id),
          ),
      ),
  ).length;
  const selectedRecordingIds = JSON.stringify(
    collection?.selectedTakeIds ?? {},
  );
  useEffect(() => setRecordingsApproved(false), [selectedRecordingIds]);
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

  async function speak() {
    if (speaking) {
      stopSpeaking();
      return;
    }
    cancelSpeech();
    const requestId = speechRequest.current;
    setError("");
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
          "The interviewer voice is unavailable right now. Please try again. You can still read the question above.",
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
        if (requestId !== speechRequest.current) return;
        stopSpeaking();
        setVoiceUnavailable(true);
        setError(
          "The interviewer audio could not play. Please try again. The question is still on screen.",
        );
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

  async function retryTranscription(take: AnswerTake) {
    if (!take.mediaId || transcriptionRequest.current) return;
    transcriptionRequest.current = take.id;
    setTranscribingTakeId(take.id);
    setError("");
    try {
      const response = await fetch(`${endpoint}/transcribe${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaId: take.audioMediaId ?? take.mediaId,
          takeId: take.id,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error ||
            "The automatic transcript could not finish. Your recording is saved.",
        );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The automatic transcript could not finish. Your recording is saved.",
      );
    } finally {
      transcriptionRequest.current = null;
      setTranscribingTakeId(null);
    }
  }

  async function generate() {
    if (submitting.current || !recordingsApproved) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    stopSpeaking();
    try {
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
                `part ${take.questionId[1]}, ${take.kind === "voice" ? "Audio only" : "Video with sound"}`,
            ),
          ),
        ].join("; ");
        throw new Error(
          `You have ${pending.length} recording${pending.length === 1 ? "" : "s"} saved only on this device (${places}). Open those answers and back them up before preparing your story.`,
        );
      }
      await act({
        action: "generate",
        regenerate: Boolean(
          collection?.chapters.length && collection.draftOutdated,
        ),
        prepareFilms: true,
        processingApproved: true,
      });
      router.push(
        `/collection/${encodeURIComponent(collectionId)}/review${query}`,
      );
    } catch (error) {
      submitting.current = false;
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
        <h1 className="font-serif text-4xl">
          This link cannot be used to record an interview.
        </h1>
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
          Your approved story and original recordings are saved. The shared
          version stays unchanged.
        </p>
        <Link
          href={`/collection/${collectionId}${query}`}
          className={`${primary} mt-6 inline-flex items-center`}
        >
          Open your stories
        </Link>
      </main>
    );

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-8 text-ink-700 sm:px-8 sm:pt-12">
      <header className="border-b border-warmgray-300 pb-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Logo />
          <span className="text-sm text-ink-400">
            {collection.storyteller.name}’s interview
          </span>
        </div>
        <h1 className="mt-6 max-w-2xl font-serif text-4xl leading-tight sm:text-5xl">
          Your stories, in your own words.
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-ink-400">
          Four parts to help you share your life, your walk with Jesus, and what
          you hope {collection.recipient.name} carries forward. Start with one
          moment you remember. You can take a break and review everything before
          sharing.
        </p>
        <div className="mt-6 flex items-center justify-between gap-4 text-sm">
          <span>{completed} of 4 recorded answers are ready</span>
        </div>
        <div
          role="progressbar"
          aria-label="Recorded answers ready"
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
        aria-label="Interview parts"
        className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {CHAPTERS.map((item, index) => {
          const answered = collection.takes.some(
            (take) =>
              take.id === collection.selectedTakeIds[item.id] &&
              take.kind !== "text" &&
              take.mediaId &&
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
                {answered ? "✓ " : ""}PART {index + 1}
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
          Part {chapterIndex + 1} of 4 ·{" "}
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
        {chapter.id === "q2" && followUpIndex === null && (
          <aside className="mt-5 rounded-xl border border-warmgray-300 bg-paper-100 p-4 text-base leading-7">
            <p>
              Faith is optional. You can share a decision that mattered to you
              without discussing faith. This recorded answer can be your second
              story.
            </p>
            <button
              type="button"
              className={`${secondary} mt-3`}
              disabled={allBusy}
              aria-pressed={neutralDecision}
              onClick={() => {
                stopSpeaking();
                setNeutralDecision(!neutralDecision);
              }}
            >
              {neutralDecision
                ? "Use the faith question"
                : "Use the general decision question"}
            </button>
          </aside>
        )}
        <button
          type="button"
          disabled={recorderBusy}
          className="mt-3 text-sm font-medium text-oxblood underline underline-offset-4 disabled:opacity-50"
          onClick={() => void speak()}
        >
          {speaking
            ? "Stop listening"
            : voiceUnavailable
              ? "Retry interview voice"
              : "Listen to the question"}
        </button>
        {!collection.capabilities.tts && (
          <p className="mt-2 text-sm text-ink-600">
            The interviewer voice is unavailable. You can read the question here
            and try listening again later.
          </p>
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
          {(["video", "voice"] as const).map((item) => (
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
              {item === "video" ? "Video with sound" : "Audio only"}
            </button>
          ))}
        </div>
        <div ref={recorderArea} tabIndex={-1} className="mt-5">
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
                Listen to your recording. Keep it if you are happy with it, or
                record it again. Earlier takes stay saved. Approve and submit
                your chosen recordings after all four parts.
              </p>
            </div>
            {questionTakes.map((take, index) => (
              <TakeCard
                key={take.id}
                take={take}
                index={index}
                selected={collection.selectedTakeIds[questionId] === take.id}
                disabled={allBusy}
                transcriptionAvailable={collection.capabilities.transcription}
                automaticTranscriptionActive={recorderBusy}
                retrying={transcribingTakeId === take.id}
                onRetryTranscription={() => void retryTranscription(take)}
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
                onRerecord={() => {
                  setRecordingsApproved(false);
                  recorderArea.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  });
                  recorderArea.current?.focus({ preventScroll: true });
                }}
              />
            ))}
          </section>
        )}
        {followUpIndex === null && (
          <div className="mt-8">
            <ChapterBlessing
              key={chapter.id}
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
        {chapterIndex === CHAPTERS.length - 1 && (
          <label className="mt-8 flex items-start gap-3 rounded-xl bg-paper-100 p-4 text-base leading-7">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={recordingsApproved}
              disabled={allBusy || completed < 4}
              onChange={(event) => setRecordingsApproved(event.target.checked)}
            />
            <span>
              I listened to my chosen recordings and approve using them to
              create my stories and films.
            </span>
          </label>
        )}
        <div className="mt-8 flex flex-wrap gap-3 border-t border-warmgray-300 pt-6">
          {chapterIndex < CHAPTERS.length - 1 ? (
            <button
              type="button"
              className={primary}
              disabled={allBusy}
              onClick={() => void goTo(chapterIndex + 1)}
            >
              {collection.selectedTakeIds[chapter.id]
                ? "Keep answer and continue"
                : "Come back to this part"}
            </button>
          ) : (
            <button
              type="button"
              className={primary}
              disabled={allBusy || completed < 4 || !recordingsApproved}
              onClick={() => void generate()}
            >
              {busy
                ? "Submitting recordings…"
                : "Approve and submit recordings"}
            </button>
          )}
        </div>
        {chapterIndex === CHAPTERS.length - 1 && completed < 4 && (
          <p className="mt-3 text-sm text-ink-400">
            Each of the four stories needs a recorded answer and its transcript
            before we can prepare the collection. You can return to any part you
            left for later. For part 2, you can choose the general decision
            question without discussing faith. Check any recording still waiting
            for transcription, or record the answer again.
          </p>
        )}
        <p className="mt-6 text-sm leading-6 text-ink-400">
          Need a break? Finish saving your take, then return using this same
          link. Device drafts stay in this browser. Recordings marked Backed up
          are saved with your interview.
        </p>
      </section>
    </main>
  );
}
