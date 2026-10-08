"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { AppIcon } from "@/components/icons";
import { StorytellerDashboard } from "@/components/collection/StorytellerDashboard";
import { collectionRequest } from "@/lib/collection/client-request";
import { CHAPTERS } from "@/lib/interview-state";
import type { CollectionView } from "@/lib/collection/types";
import type { InterviewPreparationView } from "@/lib/collection/interview-preparation-types";
import dash from "@/components/collection/StorytellerDashboard.module.css";

const primary =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-espresso px-6 py-3 text-base font-medium text-white hover:bg-espresso-600 disabled:opacity-50";

function preparationLabel(preparation: InterviewPreparationView) {
  if (preparation.ready) return "Ready for your review";
  if (preparation.status === "queued") return "Queued for preparation";
  if (preparation.status === "preparing") return "Preparing your stories";
  if (preparation.status === "films_queued") return "Preparing your videos";
  return "Needs attention";
}

export default function InterviewComplete({
  collectionId,
  accessKey,
}: {
  collectionId: string;
  accessKey: string;
}) {
  const query = `?key=${encodeURIComponent(accessKey)}`;
  const endpoint = `/api/collection/${encodeURIComponent(collectionId)}`;
  const [collection, setCollection] = useState<CollectionView | null>(null);
  const [preparation, setPreparation] =
    useState<InterviewPreparationView | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    setLoading(true);
    setCollection(null);
    setPreparation(null);
    setError("");
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    const controller = new AbortController();
    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      if (timer) clearTimeout(timer);
      setChecking(true);
      let keepChecking = true;
      try {
        const [view, progress] = await Promise.all([
          collectionRequest<{ collection: CollectionView }>(endpoint + query, {
            signal: controller.signal,
          }),
          collectionRequest<{
            preparation: InterviewPreparationView | null;
          }>(endpoint + "/preparation" + query, {
            signal: controller.signal,
          }),
        ]);
        if (!alive) return;
        if (view.collection.role !== "owner")
          throw new Error("Open your private storyteller link to continue.");
        setCollection(view.collection);
        setPreparation(progress.preparation);
        setError("");
        keepChecking = Boolean(
          progress.preparation &&
          !progress.preparation.ready &&
          progress.preparation.status !== "needs_attention",
        );
      } catch (cause) {
        if (alive)
          setError(
            !navigator.onLine
              ? "You are offline. We cannot check preparation right now. Reconnect and check again."
              : cause instanceof Error
                ? cause.message
                : "Preparation progress is unavailable right now. Please check again.",
          );
      } finally {
        inFlight = false;
        if (alive) {
          setLoading(false);
          setChecking(false);
          if (keepChecking) timer = setTimeout(() => void refresh(), 12_000);
        }
      }
    }
    const reconnect = () => void refresh();
    const offline = () =>
      setError(
        "You are offline. We cannot check preparation right now. Reconnect and check again.",
      );
    void refresh();
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", offline);
    return () => {
      alive = false;
      controller.abort();
      if (timer) clearTimeout(timer);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", offline);
    };
  }, [endpoint, query, revision]);

  async function retryPreparation() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await collectionRequest<{
        collection: CollectionView;
        preparation: InterviewPreparationView;
      }>(endpoint + query, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_interview",
          processingApproved: true,
          retry: true,
        }),
      });
      if (!result.preparation?.id)
        throw new Error(
          "We could not confirm preparation. Please check again.",
        );
      setCollection(result.collection);
      setPreparation(result.preparation);
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Preparation could not be restarted. Your recordings are kept.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function restoreFullInterview() {
    if (busy || !latestFullInterview || !collection || !canUseFullInterview)
      return;
    const sessionId = latestFullInterview.id;
    setBusy(true);
    setError("");
    try {
      // Read the saved version at click time. A page left open can otherwise
      // send an older updatedAt after mail or preparation has been saved.
      const latest = await collectionRequest<{ collection: CollectionView }>(
        endpoint + query,
      );
      if (latest.collection.role !== "owner")
        throw new Error("Open your private storyteller link to continue.");
      if (
        !(latest.collection.interviews ?? []).some(
          (session) => session.id === sessionId,
        )
      )
        throw new Error(
          "Your full interview could not be selected. Your recordings are kept.",
        );
      setCollection(latest.collection);
      const result = await collectionRequest<{
        collection: CollectionView;
        preparation: InterviewPreparationView;
      }>(endpoint + query, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "restore_interview",
          sessionId,
          expectedUpdatedAt: latest.collection.updatedAt,
          processingApproved: true,
        }),
      });
      if (!result.preparation?.id)
        throw new Error(
          "We could not confirm preparation. Please check again.",
        );
      setCollection(result.collection);
      setPreparation(result.preparation);
      setRevision((value) => value + 1);
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Your full interview could not be selected. Your recordings are kept.";
      // A stale-source rejection needs a fresh version before another choice.
      try {
        const [view, progress] = await Promise.all([
          collectionRequest<{ collection: CollectionView }>(endpoint + query),
          collectionRequest<{ preparation: InterviewPreparationView | null }>(
            endpoint + "/preparation" + query,
          ),
        ]);
        if (view.collection.role === "owner") {
          setCollection(view.collection);
          setPreparation(progress.preparation);
        }
      } catch {
        // The failed request never authorizes changing the saved source.
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  const latestFullInterview = [...(collection?.interviews ?? [])]
    .filter(
      (session) =>
        session.provider === "elevenlabs" &&
        session.status === "completed" &&
        session.segments.some((segment) => Boolean(segment.mediaId)) &&
        !session.turns.some(
          (turn) => turn.role === "user" && turn.supersedesTurnId,
        ) &&
        CHAPTERS.every((chapter) =>
          session.turns.some(
            (turn) =>
              turn.role === "user" &&
              turn.chapterId === chapter.id &&
              turn.text.trim(),
          ),
        ),
    )
    .sort((first, second) => first.startedAt.localeCompare(second.startedAt))
    .at(-1);
  const canUseFullInterview = Boolean(latestFullInterview);

  const ready =
    preparation?.ready === true || collection?.status === "approved";
  const needsAttention = preparation?.status === "needs_attention";
  const accepted = Boolean(preparation);
  const heading = loading
    ? "Checking your interview"
    : error
      ? "We could not check preparation"
      : ready
        ? "Your stories and videos are ready"
        : needsAttention
          ? "Your interview needs another look"
          : accepted
            ? "Your interview is saved"
            : "Your interview has not been submitted yet";
  const description = loading
    ? "One moment while we check your saved recording and preparation status."
    : error
      ? accepted
        ? "Your interview was accepted for preparation. Reconnect and check progress before reviewing your stories and videos."
        : "Check your connection and try again. Use your private conversation link if you need to return."
      : ready
        ? "Your four stories, four videos, and postcard drafts are ready for you to review. You can make changes before sharing."
        : needsAttention
          ? "Your saved recording is kept. Preparation needs attention before your stories and videos can be finished."
          : preparation?.status === "queued"
            ? "Your interview is queued to prepare four stories, four videos, and postcard drafts from your recording. You can leave this page while preparation is queued."
            : accepted
              ? "Your four stories, four videos, and postcard drafts are being prepared from your recording. You can leave this page and return through your private link."
              : "Return to your conversation to finish saving and submitting your recording.";

  const preparationActions = (
    <>
      {ready ? (
        <Link
          className={dash.heroPrimary}
          href={`/collection/${encodeURIComponent(collectionId)}/review${query}`}
        >
          Review your stories and videos
          <AppIcon name="arrowRight" size={20} />
        </Link>
      ) : needsAttention &&
        preparation.canRetry !== false &&
        !canUseFullInterview &&
        !preparation.missingAreas?.length ? (
        <button
          type="button"
          className={dash.heroPrimary}
          disabled={busy || checking}
          onClick={() => void retryPreparation()}
        >
          {busy ? "Requesting preparation…" : "Retry preparation"}
        </button>
      ) : null}
      {(!accepted || needsAttention) && !loading && (
        <Link
          className={dash.heroSecondary}
          href={`/record/${encodeURIComponent(collectionId)}${query}${preparation?.missingAreas?.[0] ? `&classic=1&chapter=${encodeURIComponent(preparation.missingAreas[0].id)}` : ""}`}
        >
          Continue conversation
        </Link>
      )}
      {!ready && (
        <button
          type="button"
          className={dash.heroSecondary}
          disabled={checking || busy}
          onClick={() => setRevision((value) => value + 1)}
        >
          {checking ? "Checking progress…" : "Check preparation"}
        </button>
      )}
    </>
  );

  return (
    <main className="mx-auto max-w-5xl px-5 pb-16 pt-5 text-ink-700 sm:px-8 sm:pt-8">
      <header className="mb-8">
        <Logo />
      </header>
      {error && (
        <p role="alert" className={`${dash.alert} mb-5`}>
          {error}
        </p>
      )}
      {needsAttention && (
        <div className={`${dash.card} mb-5 text-base leading-7`}>
          <p>{preparation.error || "Please check preparation again."}</p>
          {preparation.canRetry === false &&
            !preparation.missingAreas?.length && (
              <p className="mt-3">
                Automatic attempts have stopped. Contact the Time Tapestry team
                with your private collection link so they can check preparation.
                Your saved recordings do not need to be submitted again.
              </p>
            )}
          {canUseFullInterview ? (
            <div className="mt-4 border-t border-warmgray-200 pt-4">
              <p>
                Your full interview is saved. You can prepare it instead of the
                later recordings.
              </p>
              <p className="mt-3">
                Use every answer from your saved interview, including answers
                previously left out. Your later recordings will stay saved. You
                review the stories and videos before sharing.
              </p>
              <button
                type="button"
                className={`${primary} mt-4`}
                disabled={busy || checking}
                onClick={() => void restoreFullInterview()}
              >
                {busy
                  ? "Selecting your full interview…"
                  : "Use my full interview"}
              </button>
            </div>
          ) : (
            Boolean(preparation.missingAreas?.length) && (
              <p className="mt-3">
                Continue the conversation to share a little more for{" "}
                {preparation.missingAreas?.map((area) => area.title).join(", ")}
                .
              </p>
            )
          )}
        </div>
      )}
      {collection ? (
        <StorytellerDashboard
          collection={collection}
          accessKey={accessKey}
          preparation={preparation}
        >
          {preparation && (
            <p role="status" aria-live="polite" className={dash.heroSecondary}>
              <AppIcon name={ready ? "check" : "conversation"} size={18} />
              {preparationLabel(preparation)}
            </p>
          )}
          {accepted && (
            <p className={dash.heroSecondary}>
              {ready
                ? "Nothing is mailed until you approve your gift."
                : collection.capabilities.email
                  ? "We’ll email you when everything is ready to review."
                  : "Return through your private link to check progress."}
            </p>
          )}
          {preparationActions}
        </StorytellerDashboard>
      ) : (
        <section className={dash.hero} aria-busy={loading}>
          <p className={dash.eyebrow}>What’s left to do</p>
          <h1 className={dash.title}>{heading}</h1>
          <p className={dash.lede}>{description}</p>
          <div className={dash.actions}>{preparationActions}</div>
        </section>
      )}
    </main>
  );
}
