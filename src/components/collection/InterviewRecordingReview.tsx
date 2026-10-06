"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import type { CollectionView } from "@/lib/collection/types";
import { collectionRequest } from "@/lib/collection/client-request";
import {
  interviewRecordingReview,
  interviewRerecordPath,
  unassignedInterviewRecordings,
  type InterviewReviewChapter,
} from "@/lib/collection/interview-recording-review";
import { requireInterviewReviewBackup } from "@/lib/collection/interview-review-backup";
import { StoryMediaPlayer } from "./StoryOriginalPreview";
import { mediaPath, portalPrimary, portalSecondary } from "./PortalUI";

export function RecordingReviewChapter({
  chapter,
  collectionId,
  accessKey,
  busy,
  onRerecord,
}: {
  chapter: InterviewReviewChapter;
  collectionId: string;
  accessKey: string;
  busy: boolean;
  onRerecord: () => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const source =
    chapter.recordings.find((item) => item.mediaId === selectedId) ??
    chapter.recordings[0];
  const recordingArea = useRef<HTMLElement>(null);
  useEffect(() => {
    const players = Array.from(
      recordingArea.current?.querySelectorAll<HTMLMediaElement>(
        "audio, video",
      ) ?? [],
    );
    return () => {
      players.forEach((player) => player.pause());
    };
  }, [source?.mediaId]);
  return (
    <section
      ref={recordingArea}
      className="rounded-2xl border border-warmgray-200 bg-white p-5 sm:p-7"
      aria-labelledby={`review-${chapter.id}`}
    >
      <p className="text-sm font-medium text-ink-500">
        Part {chapter.id.slice(1)} of 4
      </p>
      <h2
        id={`review-${chapter.id}`}
        className="mt-1 text-2xl font-semibold text-espresso"
      >
        {chapter.title}
      </h2>
      {source ? (
        <div className="mt-5 space-y-4">
          {chapter.recordings.length > 1 && (
            <label className="block text-base font-medium">
              Saved recording
              <select
                className="mt-2 min-h-12 w-full rounded-xl border border-warmgray-300 bg-white px-3 text-base"
                value={source.mediaId}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                {chapter.recordings.map((item, index) => (
                  <option key={item.mediaId} value={item.mediaId}>
                    Recording {index + 1} of {chapter.recordings.length}
                  </option>
                ))}
              </select>
            </label>
          )}
          <StoryMediaPlayer
            key={`${chapter.id}-${source.mediaId}`}
            src={`${mediaPath(collectionId, source.mediaId, accessKey)}${source.approximateStartSeconds ? `#t=${source.approximateStartSeconds}` : ""}`}
            kind={source.kind === "video" ? "video" : "audio"}
            label={`${chapter.awaitingChapterMatch ? "Original interview" : chapter.title}, your saved ${source.kind === "video" ? "video" : "audio"}`}
          />
          <p className="text-base leading-7 text-ink-500">
            {chapter.awaitingChapterMatch
              ? "Your interview is saved. We’ll check your saved interview for this section when you submit."
              : source.fromInterview
                ? source.approximateStartSeconds !== undefined
                  ? "Playback starts near this answer in your full interview."
                  : "Your full interview plays here. We’ll separate it into four videos after submission."
                : "This plays the complete answer you recorded. Your original stays saved."}
          </p>
          {!chapter.ready && !chapter.awaitingChapterMatch && (
            <p role="status" className="text-base leading-7">
              Your recording is saved. Its automatic transcript is not ready
              yet.
            </p>
          )}
        </div>
      ) : (
        <p className="mt-4 text-base leading-7 text-ink-500">
          This part still needs a recorded answer.
        </p>
      )}
      {chapter.transcript && (
        <details className="mt-4 border-t border-warmgray-200 pt-2">
          <summary className="min-h-12 cursor-pointer py-3 text-base font-medium">
            Read the automatic transcript
          </summary>
          <p className="whitespace-pre-wrap text-base leading-7">
            {chapter.transcript}
          </p>
          <p className="mt-3 text-sm leading-6 text-ink-500">
            This is a reading aid. Your recording is the original; it cannot be
            changed by typing.
          </p>
        </details>
      )}
      <button
        type="button"
        className={`${portalSecondary} mt-5`}
        disabled={busy}
        onClick={onRerecord}
      >
        {source ? "Record again" : "Record this part"}
      </button>
      {source && !chapter.awaitingChapterMatch && (
        <p className="mt-2 text-sm leading-6 text-ink-500">
          Your original stays saved until your new answer is ready.
        </p>
      )}
    </section>
  );
}

/** A single mounted player keeps different parts from talking over each other. */
export function RecordingReviewParts({
  chapters,
  selectedChapterId,
  collectionId,
  accessKey,
  busy,
  onSelect,
  onRerecord,
}: {
  chapters: InterviewReviewChapter[];
  selectedChapterId: string;
  collectionId: string;
  accessKey: string;
  busy: boolean;
  onSelect: (id: string) => void;
  onRerecord: (id: string) => void;
}) {
  const chapter =
    chapters.find((item) => item.id === selectedChapterId) ?? chapters[0];
  return (
    <>
      <nav
        className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4"
        aria-label="Choose a recorded part"
      >
        {chapters.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={chapter?.id === item.id}
            disabled={busy}
            onClick={() => onSelect(item.id)}
            className={`min-h-14 rounded-xl border px-4 py-3 text-left text-base ${chapter?.id === item.id ? "border-espresso bg-paper-100 font-semibold" : "border-warmgray-200 bg-white"}`}
          >
            <span className="block text-sm">Part {item.id.slice(1)}</span>
            {item.title}
          </button>
        ))}
      </nav>
      {chapter && (
        <div className="mt-5">
          <RecordingReviewChapter
            key={chapter.id}
            chapter={chapter}
            collectionId={collectionId}
            accessKey={accessKey}
            busy={busy}
            onRerecord={() => onRerecord(chapter.id)}
          />
        </div>
      )}
    </>
  );
}

export default function InterviewRecordingReview({
  collectionId,
  accessKey,
  initialChapterId,
}: {
  collectionId: string;
  accessKey: string;
  initialChapterId?: string;
}) {
  const router = useRouter();
  const endpoint = `/api/collection/${encodeURIComponent(collectionId)}`;
  const query = `?key=${encodeURIComponent(accessKey)}`;
  const interviewPath = `/record/${encodeURIComponent(collectionId)}${query}`;
  const completePath = `/collection/${encodeURIComponent(collectionId)}/complete${query}`;
  const [collection, setCollection] = useState<CollectionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedChapterId, setSelectedChapterId] = useState(
    initialChapterId && /^q[1-4]$/.test(initialChapterId)
      ? initialChapterId
      : "q1",
  );
  const submitting = useRef(false);
  const errorBox = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    const result = await collectionRequest<{ collection: CollectionView }>(
      endpoint + query,
    );
    setCollection(result.collection);
    return result.collection;
  }, [endpoint, query]);
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    collectionRequest<{ collection: CollectionView }>(endpoint + query, {
      signal: controller.signal,
    })
      .then((result) => {
        if (alive) setCollection(result.collection);
      })
      .catch((cause) => {
        if (alive)
          setError(
            cause instanceof Error
              ? cause.message
              : "Your recordings could not open. Please try again.",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [endpoint, query]);
  useEffect(() => {
    if (error) errorBox.current?.focus();
  }, [error]);

  async function finish() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      let current = await load();
      if (current.role !== "owner" || current.status === "approved")
        throw new Error("Open your storyteller account to continue.");
      await requireInterviewReviewBackup(current);
      if (current.interviews?.some((session) => session.status === "active"))
        throw new Error(
          "Pause the interview in your recording tab before submitting. This keeps its latest recording safe.",
        );
      for (const session of current.interviews ?? []) {
        if (session.status !== "completed")
          await collectionRequest(endpoint + "/interview" + query, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "set_status",
              sessionId: session.id,
              status: session.segments.length ? "completed" : "interrupted",
            }),
          });
      }
      current = await load();
      if (
        interviewRecordingReview(current).some((chapter) => !chapter.ready) &&
        !unassignedInterviewRecordings(current).length
      )
        throw new Error(
          "Finish recording all four parts and let their automatic transcripts save before submitting. Your recordings are kept.",
        );
      const result = await collectionRequest(endpoint + query, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_interview",
          processingApproved: true,
        }),
      });
      if (!result.preparation?.id)
        throw new Error(
          "We could not confirm submission. Check your interview status before trying again. Your recordings are kept.",
        );
      router.push(completePath);
    } catch (cause) {
      submitting.current = false;
      setError(
        cause instanceof Error
          ? cause.message
          : "Your interview could not be submitted. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const chapters =
    collection?.role === "owner" ? interviewRecordingReview(collection) : [];
  const submitted = Boolean(
    collection?.interviewPreparation &&
    !collection.draftOutdated &&
    !collection.interviewPreparation.missingAreas?.length,
  );
  return (
    <main className="mx-auto max-w-4xl px-5 pb-20 pt-8 text-ink-700 sm:px-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-warmgray-200 pb-6">
        <Logo />
        <Link
          href="/account"
          className="inline-flex min-h-12 items-center text-base underline underline-offset-4"
        >
          My stories
        </Link>
      </header>
      <h1 className="font-display text-4xl font-medium text-espresso">
        Review your four stories.
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-8">
        Watch or listen. Happy with your answers? Submit your interview.
      </p>
      {error && (
        <div
          ref={errorBox}
          tabIndex={-1}
          role="alert"
          className="mt-5 rounded-xl border border-oxblood/30 p-4 text-base leading-7"
        >
          {error}
          <p className="mt-2">
            <Link className="underline underline-offset-4" href={interviewPath}>
              Return to your interview
            </Link>
          </p>
        </div>
      )}
      {loading ? (
        <p role="status" className="mt-8">
          Opening your saved recordings…
        </p>
      ) : !collection ? (
        <button
          type="button"
          className={`${portalSecondary} mt-6`}
          onClick={() => {
            setError("");
            void load().catch((cause) => setError(cause.message));
          }}
        >
          Try again
        </button>
      ) : collection.role !== "owner" ? (
        <p className="mt-8 text-lg leading-8">
          Use your storyteller invitation or sign in to My stories with your
          verified email to review this interview.
        </p>
      ) : collection.status === "approved" || submitted ? (
        <div className="mt-8 space-y-4">
          <p className="text-lg leading-8">
            Your interview has already been submitted. Your original recordings
            stay saved.
          </p>
          <Link
            href={
              collection.status === "approved"
                ? `/collection/${encodeURIComponent(collectionId)}${query}`
                : completePath
            }
            className={`${portalPrimary} inline-flex items-center`}
          >
            Open your stories
          </Link>
        </div>
      ) : (
        <>
          <p className="mt-3 text-base leading-7 text-ink-500">
            Your recordings are saved. Your microphone and camera are off.
          </p>
          <RecordingReviewParts
            chapters={chapters}
            selectedChapterId={selectedChapterId}
            collectionId={collectionId}
            accessKey={accessKey}
            busy={busy}
            onSelect={setSelectedChapterId}
            onRerecord={(id) => {
              if (!busy)
                router.push(interviewRerecordPath(collectionId, accessKey, id));
            }}
          />
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              className={portalPrimary}
              disabled={busy}
              onClick={() => void finish()}
            >
              {busy ? "Submitting recordings…" : "Submit my interview"}
            </button>
          </div>
          <p className="mt-4 text-base leading-7 text-ink-500">
            We’ll prepare your four videos and storybook, then email you when
            they’re ready. You can still personalize your postcards.
          </p>
        </>
      )}
    </main>
  );
}
