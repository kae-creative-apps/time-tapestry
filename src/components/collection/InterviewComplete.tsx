"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { BrandPattern } from "@/components/BrandPattern";
import { AppIcon } from "@/components/icons";
import { collectionRequest } from "@/lib/collection/client-request";
import type { CollectionView } from "@/lib/collection/types";
import type { InterviewPreparationView } from "@/lib/collection/interview-preparation-types";

const primary =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-espresso px-6 py-3 text-base font-medium text-white hover:bg-espresso-600 disabled:opacity-50";
const secondary =
  "inline-flex min-h-12 items-center justify-center rounded-full border border-warmgray-200 bg-white px-5 py-3 text-base font-medium text-ink-700 hover:bg-paper-200 disabled:opacity-50";

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

  const ready = preparation?.ready === true;
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

  return (
    <main className="mx-auto max-w-4xl px-5 pb-12 pt-5 text-ink-700 sm:px-8 sm:pt-8">
      <header className="mb-8 border-b border-warmgray-200 pb-5">
        <Logo />
      </header>
      <section className="overflow-hidden rounded-2xl border border-warmgray-200 bg-white shadow-soft">
        <div className="brand-gradient-chocolate relative isolate overflow-hidden p-7 text-white sm:p-10">
          <BrandPattern
            variant="ribbon"
            className="pointer-events-none absolute -bottom-20 -right-28 -z-10 h-96 w-96 text-white opacity-[0.07]"
          />
          <p className="mb-5 text-sm font-medium uppercase tracking-[0.14em] text-paper">
            A gift of your stories
          </p>
          <h1 className="max-w-2xl font-serif text-3xl leading-tight sm:text-4xl">
            {heading}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-paper sm:text-lg">
            {description}
          </p>
          {preparation && (
            <p
              role="status"
              aria-live="polite"
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/25 px-4 py-2 text-base"
            >
              <AppIcon name={ready ? "check" : "conversation"} size={20} />
              {preparationLabel(preparation)}
            </p>
          )}
        </div>
        <div className="p-7 sm:p-10">
          {error && (
            <p
              role="alert"
              className="mb-6 rounded-xl border border-clay-300 bg-clay-50 p-4 text-base leading-7"
            >
              {error}
            </p>
          )}
          {needsAttention && (
            <div className="mb-6 rounded-xl bg-paper-100 p-5 text-base leading-7">
              <p>{preparation.error || "Please check preparation again."}</p>
              {Boolean(preparation.missingAreas?.length) && (
                <p className="mt-3">
                  Continue the conversation to share a little more for{" "}
                  {preparation.missingAreas
                    ?.map((area) => area.title)
                    .join(", ")}
                  .
                </p>
              )}
            </div>
          )}
          {accepted && (
            <>
              <h2 className="text-xl font-medium">
                You decide when it is ready to share.
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-7 text-ink-500">
                {ready
                  ? "Read each story, watch each video, and review the postcard drafts. Nothing is mailed until you approve your gift."
                  : collection?.capabilities.email
                    ? "We’ll email you when everything is ready to review. Nothing is mailed until you approve your gift."
                    : "Return here through your private link to check progress and review everything when it is ready. Email notifications are not available on this page yet. Nothing is mailed until you approve your gift."}
              </p>
            </>
          )}
          <div className="mt-7 flex flex-wrap gap-3">
            {ready ? (
              <Link
                className={primary}
                href={`/collection/${encodeURIComponent(collectionId)}/review${query}`}
              >
                Review your stories and videos
                <AppIcon name="arrowRight" size={20} />
              </Link>
            ) : needsAttention && !preparation.missingAreas?.length ? (
              <button
                type="button"
                className={primary}
                disabled={busy || checking}
                onClick={() => void retryPreparation()}
              >
                {busy ? "Requesting preparation…" : "Retry preparation"}
              </button>
            ) : null}
            {(!accepted || needsAttention) && !loading && (
              <Link
                className={secondary}
                href={`/record/${encodeURIComponent(collectionId)}${query}`}
              >
                Continue conversation
              </Link>
            )}
            {!ready && (
              <button
                type="button"
                className={secondary}
                disabled={checking || busy}
                onClick={() => setRevision((value) => value + 1)}
              >
                {checking ? "Checking progress…" : "Check preparation"}
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
