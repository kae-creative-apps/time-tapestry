"use client";

import { useEffect, useRef, useState } from "react";
import { AppIcon } from "@/components/icons";
import { useCollection } from "./useCollection";
import { CollectionSharing } from "./CollectionSharing";
import { OwnerReplies } from "./OwnerReplies";
import { FilmGenerationPanel } from "./FilmGenerationPanel";
import { StoryReviewPanel } from "./StoryReviewPanel";
import { ApprovedStories } from "./ApprovedStories";
import { PostcardProof } from "./PostcardProof";
import { storyOriginals } from "./story-originals";
import { collectionRequest } from "@/lib/collection/client-request";
import {
  ContactSummary,
  PortalError,
  PortalShell,
  SourceArchive,
  portalPrimary,
  portalSecondary,
} from "./PortalUI";

const steps = [
  "Review your gift",
  "Personalize postcards",
  "Approve and share",
];

export default function Review({
  id,
  accessKey,
}: {
  id: string;
  accessKey: string;
}) {
  const {
    collection: c,
    error,
    busy,
    act,
    load,
  } = useCollection(id, accessKey);
  const [activeChapter, setActiveChapter] = useState("q1");
  const [step, setStep] = useState(0);
  const [working, setWorking] = useState(false);
  const [generatingFilms, setGeneratingFilms] = useState(false);
  const [approvedPlayback, setApprovedPlayback] = useState(false);
  const [postcardPending, setPostcardPending] = useState(false);
  const [issuesPending, setIssuesPending] = useState(false);
  const [issueCheckFailed, setIssueCheckFailed] = useState(false);
  const [issueRevision, setIssueRevision] = useState(0);
  const [chapterHashes, setChapterHashes] = useState<Record<string, string>>(
    {},
  );
  const [localError, setLocalError] = useState("");
  const [notice, setNotice] = useState("");
  const flowTop = useRef<HTMLDivElement>(null);
  const recordPath = `/record/${encodeURIComponent(id)}?key=${encodeURIComponent(accessKey)}`;
  const filmSignature = JSON.stringify(
    c?.chapters.map((chapter) => [
      chapter.id,
      chapter.videoMediaId,
      chapter.film?.outputSha256,
    ]),
  );
  useEffect(
    () => setApprovedPlayback(false),
    [filmSignature, c?.draftOutdated],
  );
  useEffect(() => {
    if (c?.role !== "owner" || c.status === "approved") return;
    const controller = new AbortController();
    void collectionRequest<{
      issues: Array<{ status?: string; resolvedAt?: string }>;
      chapters?: Array<{ id: string; hash: string }>;
    }>(
      `/api/collection/${encodeURIComponent(id)}/story-issues?key=${encodeURIComponent(accessKey)}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) {
          setIssuesPending(
            data.issues.some((issue) => issue.status === "open"),
          );
          setIssueCheckFailed(false);
          setChapterHashes(
            Object.fromEntries(
              (data.chapters || []).map((chapter) => [
                chapter.id,
                chapter.hash,
              ]),
            ),
          );
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setIssueCheckFailed(true);
      });
    return () => controller.abort();
  }, [id, accessKey, c?.role, c?.status, filmSignature, issueRevision]);
  const blocked = busy || working;
  const hasOriginals = Boolean(
    c &&
    (c.chapters.some((chapter) => storyOriginals(c, chapter).length > 0) ||
      c.takes.some((take) => take.kind !== "text" && take.mediaId) ||
      c.interviews?.some((interview) =>
        interview.segments.some((segment) => segment.mediaId),
      )),
  );

  function changeStep(next: number) {
    setStep(next);
    flowTop.current?.scrollIntoView({ block: "start", behavior: "auto" });
    setLocalError("");
  }
  async function prepare(regenerate = false) {
    if (blocked || generatingFilms || !hasOriginals) return;
    setWorking(true);
    setLocalError("");
    const result = await act({
      action: "generate",
      prepareFilms: true,
      processingApproved: true,
      ...(regenerate ? { regenerate: true } : {}),
    });
    if (result) {
      setActiveChapter("q1");
      setApprovedPlayback(false);
      setNotice(
        "Your recordings are saved. We’re preparing your four films. Nothing is shared until you approve.",
      );
    }
    setWorking(false);
  }
  async function approve() {
    if (
      blocked ||
      !approvedPlayback ||
      !c ||
      c.draftOutdated ||
      issuesPending ||
      postcardPending ||
      issueCheckFailed
    )
      return;
    setWorking(true);
    setLocalError("");
    const result = await act({
      action: "approve",
      deliveryMode: "digital",
      autoPostcards: true,
      recordingsReviewed: true,
      reviewedFilmHashes: Object.fromEntries(
        c.chapters.map((chapter) => [chapter.id, chapter.film?.outputSha256]),
      ),
    });
    if (result) {
      setNotice("");
      flowTop.current?.scrollIntoView({ block: "start", behavior: "auto" });
    } else
      setLocalError(
        "We could not confirm your approval. Your recordings are saved. Check your connection and try again.",
      );
    setWorking(false);
  }
  if (!c)
    return (
      <PortalShell>
        <h1 className="text-3xl font-medium">Your saved gift</h1>
        <PortalError message={error} />
        {!error ? (
          <p role="status" className="mt-5 text-lg">
            Opening your recordings…
          </p>
        ) : (
          <button className={portalSecondary} onClick={() => void load()}>
            Try again
          </button>
        )}
      </PortalShell>
    );
  if (c.role !== "owner")
    return (
      <PortalShell>
        <h1 className="text-3xl font-medium">
          This is the storyteller’s workspace.
        </h1>
        <a
          className={`${portalPrimary} mt-6`}
          href={`/collection/${encodeURIComponent(id)}?key=${encodeURIComponent(accessKey)}`}
        >
          Open your collection
        </a>
      </PortalShell>
    );
  const approved = c.status === "approved";
  const filmsReady =
    c.chapters.length === 4 &&
    c.chapters.every(
      (chapter) =>
        chapter.videoMediaId &&
        chapter.film?.mediaId === chapter.videoMediaId &&
        chapter.film.narrationKind === "original_recording" &&
        chapter.film.outputSha256,
    );
  const activeIndex = Math.max(
    0,
    c.chapters.findIndex((chapter) => chapter.id === activeChapter),
  );
  const canApprove =
    !blocked &&
    !generatingFilms &&
    !c.draftOutdated &&
    filmsReady &&
    approvedPlayback &&
    !postcardPending &&
    !issuesPending &&
    !issueCheckFailed;

  return (
    <div
      onPlayCapture={(event) =>
        event.currentTarget
          .querySelectorAll<HTMLMediaElement>("video,audio")
          .forEach((media) => {
            if (media !== event.target) media.pause();
          })
      }
    >
      <PortalShell
        collectionPath={`/collection/${encodeURIComponent(id)}?key=${encodeURIComponent(accessKey)}`}
      >
        <div ref={flowTop} className="scroll-mt-5">
          <header className="mb-5">
            <p className="brand-eyebrow text-taupe-600">
              {approved ? "Your gift is approved" : "Your recordings are saved"}
            </p>
            <h1 className="mt-2 font-display text-3xl font-medium sm:text-4xl">
              {approved ? `For ${c.recipient.name}, from you.` : steps[step]}
            </h1>
            <p className="mt-2 max-w-3xl text-base leading-7 text-ink-600">
              {approved
                ? "Your own voice, preserved for someone you love."
                : "Your original recordings stay saved. Nothing is shared until your final approval."}
            </p>
          </header>
          {!approved && c.chapters.length > 0 && (
            <nav
              aria-label="Finish your gift"
              className="mb-5 grid grid-cols-3 gap-2"
            >
              {steps.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => changeStep(index)}
                  disabled={blocked}
                  aria-current={step === index ? "step" : undefined}
                  className={`min-h-12 rounded-xl border px-2 py-2 text-sm font-medium sm:text-base ${step === index ? "border-espresso bg-espresso text-white" : "border-warmgray-200 bg-white"}`}
                >
                  <span className="block sm:inline">{index + 1}. </span>
                  {label}
                </button>
              ))}
            </nav>
          )}
          <PortalError message={localError || error} />
          {notice && (
            <p
              role="status"
              className="mb-5 rounded-xl bg-sage-50 p-4 text-base leading-7"
            >
              {notice}
            </p>
          )}
        </div>
        {approved ? (
          <>
            <CollectionSharing
              collection={c}
              busy={busy}
              act={act}
              onRefresh={load}
            />
            <details className="mt-6 rounded-2xl border border-warmgray-200 bg-white p-5">
              <summary className="min-h-12 cursor-pointer text-lg font-semibold">
                Watch your approved stories
              </summary>
              <div className="mt-4">
                <ApprovedStories collection={c} accessKey={accessKey} />
              </div>
            </details>
            <OwnerReplies
              collection={c}
              accessKey={accessKey}
              busy={busy}
              onRefresh={() => void load()}
            />
          </>
        ) : !c.chapters.length ? (
          <section className="rounded-2xl border border-warmgray-200 bg-white p-6">
            <h2 className="text-2xl font-semibold">
              Your recordings are saved.
            </h2>
            <p className="mt-3 max-w-2xl text-lg leading-8">
              We’ll prepare four films and a written story from your own
              recordings. You’ll review them before sharing.
            </p>
            {hasOriginals ? (
              <button
                className={`${portalPrimary} mt-5`}
                disabled={blocked}
                onClick={() => void prepare()}
              >
                {working ? "Submitting recordings…" : "Prepare my gift"}
              </button>
            ) : (
              <a className={`${portalPrimary} mt-5`} href={recordPath}>
                Continue my interview
              </a>
            )}
          </section>
        ) : (
          <>
            {c.draftOutdated && (
              <section className="mb-5 rounded-xl bg-clay-50 p-5">
                <h2 className="text-xl font-semibold">
                  Updated recordings are ready to prepare.
                </h2>
                <p className="mt-2 text-base leading-7">
                  Your earlier recordings stay saved. Prepare the updated gift
                  before approval.
                </p>
                <button
                  className={`${portalPrimary} mt-4`}
                  disabled={blocked || generatingFilms}
                  onClick={() => void prepare(true)}
                >
                  Prepare updated gift
                </button>
              </section>
            )}
            <div hidden={step !== 0}>
              <nav
                aria-label="Choose a chapter"
                className="mb-3 grid grid-cols-4 gap-2"
              >
                {c.chapters.map((chapter, index) => (
                  <button
                    type="button"
                    key={chapter.id}
                    disabled={blocked}
                    onClick={() => setActiveChapter(chapter.id)}
                    aria-current={
                      activeChapter === chapter.id ? "true" : undefined
                    }
                    aria-label={`Chapter ${index + 1}: ${chapter.title}`}
                    className={`min-h-12 rounded-xl border px-2 py-2 text-sm font-medium ${activeChapter === chapter.id ? "border-espresso bg-espresso text-white" : "border-warmgray-200 bg-white"}`}
                  >
                    <span>Chapter {index + 1}</span>
                    <span className="mt-1 hidden text-sm font-normal lg:block">
                      {chapter.title}
                    </span>
                  </button>
                ))}
              </nav>
              {c.chapters.map((chapter) => (
                <StoryReviewPanel
                  key={`${chapter.id}:${chapter.sourceTakeIds.join(",")}`}
                  chapter={chapter}
                  collection={c}
                  accessKey={accessKey}
                  expectedChapterHash={chapterHashes[chapter.id]}
                  active={activeChapter === chapter.id && step === 0}
                  onIssueReported={() => {
                    setIssuesPending(true);
                    setIssueRevision((value) => value + 1);
                    void load();
                  }}
                />
              ))}
              <nav
                aria-label="Move between chapters"
                className="my-4 flex items-center justify-between gap-2"
              >
                <button
                  type="button"
                  className={portalSecondary}
                  disabled={blocked || activeIndex === 0}
                  onClick={() =>
                    setActiveChapter(c.chapters[activeIndex - 1].id)
                  }
                >
                  Previous
                </button>
                <span className="text-sm">{activeIndex + 1} of 4</span>
                <button
                  type="button"
                  className={portalSecondary}
                  disabled={blocked}
                  onClick={() =>
                    activeIndex < c.chapters.length - 1
                      ? setActiveChapter(c.chapters[activeIndex + 1].id)
                      : changeStep(1)
                  }
                >
                  {activeIndex < c.chapters.length - 1
                    ? "Next chapter"
                    : "Continue"}
                </button>
              </nav>
              <a
                className="inline-flex min-h-12 items-center gap-2 text-base font-medium underline underline-offset-4"
                href={`/api/collection/${encodeURIComponent(id)}/book?key=${encodeURIComponent(accessKey)}&draft=1`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <AppIcon name="download" size={18} /> Preview the complete story
                book (PDF)
              </a>
              {!filmsReady && (
                <div className="mt-5">
                  <FilmGenerationPanel
                    collection={c}
                    accessKey={accessKey}
                    disabled={blocked || Boolean(c.draftOutdated)}
                    onActiveChange={setGeneratingFilms}
                    onComplete={load}
                  />
                </div>
              )}
              <div className="mt-5">
                <button
                  type="button"
                  className={portalPrimary}
                  disabled={blocked}
                  onClick={() => changeStep(1)}
                >
                  Continue to postcards <AppIcon name="arrowRight" size={18} />
                </button>
              </div>
            </div>
            <div hidden={step !== 1}>
              <PostcardProof
                collection={c}
                accessKey={accessKey}
                disabled={blocked}
                draftOnly
                onPendingChange={setPostcardPending}
              />
              <div className="mt-5 flex flex-wrap justify-between gap-3">
                <button
                  type="button"
                  className={portalSecondary}
                  onClick={() => changeStep(0)}
                >
                  Back to my gift
                </button>
                <button
                  type="button"
                  className={portalPrimary}
                  disabled={blocked || postcardPending}
                  onClick={() => changeStep(2)}
                >
                  Continue to approval <AppIcon name="arrowRight" size={18} />
                </button>
              </div>
              <p className="mt-3 text-sm leading-6 text-ink-600">
                You can keep the suggested encouragement. A mailing address is
                not needed to share your digital gift.
              </p>
            </div>
            <section
              hidden={step !== 2}
              className="rounded-2xl border border-sage-200 bg-white p-5 sm:p-8"
              aria-labelledby="approval-heading"
            >
              <h2 id="approval-heading" className="text-2xl font-semibold">
                Ready to share with {c.recipient.name}?
              </h2>
              <p className="mt-3 text-base leading-7 text-ink-600">
                Your gift includes four films in your own recorded voice, four
                written chapters and a printable story book.
              </p>
              <div className="mt-5 rounded-xl bg-sage-50 p-4">
                <p className="font-semibold">Digital invitation</p>
                <p className="mt-1 break-words text-base">
                  {c.recipient.name} · {c.recipient.email}
                </p>
                <p className="mt-2 text-sm leading-6">
                  {c.capabilities.email
                    ? "After approval, their email invitation is queued. They verify this email address to open your gift."
                    : "Email delivery is not connected yet. Approval saves your gift, and you can share its secure link while delivery is being connected."}
                </p>
              </div>
              <div className="mt-3 rounded-xl bg-paper p-4">
                <p className="font-semibold">Physical postcards</p>
                <p className="mt-2 text-sm leading-6">
                  Only {c.recipient.name} receives postcards. Mailing needs a
                  confirmed address, your separate approval of the print designs
                  and connected delivery. It does not hold up your digital gift.
                </p>
              </div>
              {issuesPending && (
                <p
                  role="status"
                  className="mt-4 rounded-xl bg-clay-50 p-4 text-base leading-7"
                >
                  A chapter you flagged needs checking before this gift can be
                  shared. Your recordings and postcard words remain saved.
                </p>
              )}
              {issueCheckFailed && (
                <div role="alert" className="mt-4 rounded-xl bg-clay-50 p-4">
                  <p>
                    We could not check whether a chapter needs attention. Your
                    recordings are saved.
                  </p>
                  <button
                    className={`${portalSecondary} mt-3`}
                    onClick={() => setIssueRevision((value) => value + 1)}
                  >
                    Check again
                  </button>
                </div>
              )}
              <label className="mt-5 flex items-start gap-3 text-base leading-7">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 shrink-0"
                  disabled={blocked || !filmsReady || Boolean(c.draftOutdated)}
                  checked={approvedPlayback}
                  onChange={(event) =>
                    setApprovedPlayback(event.target.checked)
                  }
                />
                <span>
                  I have reviewed all four films and the written story. I
                  approve this gift for {c.recipient.name}.
                </span>
              </label>
              {!filmsReady && (
                <p className="mt-3 text-base leading-7 text-ink-600">
                  Approval opens when all four films are ready. You can leave
                  and return to your saved gift.
                </p>
              )}
              {postcardPending && (
                <p role="status" className="mt-3 text-base leading-7">
                  Your postcard words still need saving. Return to postcards to
                  finish saving them.
                </p>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  className={portalSecondary}
                  disabled={blocked}
                  onClick={() => changeStep(1)}
                >
                  Back to postcards
                </button>
                <button
                  type="button"
                  className={portalPrimary}
                  disabled={!canApprove}
                  onClick={() => void approve()}
                >
                  {working
                    ? "Saving approval…"
                    : `Approve and share with ${c.recipient.name}`}
                  <AppIcon name="arrowRight" size={18} />
                </button>
              </div>
            </section>
          </>
        )}
        <div className="mt-8 space-y-4">
          <SourceArchive collection={c} accessKey={accessKey} />
          <details className="rounded-2xl border border-warmgray-200 bg-white p-5">
            <summary className="min-h-12 cursor-pointer text-base font-semibold">
              Your people and saved account
            </summary>
            <div className="mt-3">
              <ContactSummary collection={c} />
              <a
                href="/account"
                className="mt-3 inline-flex min-h-12 items-center text-base font-medium underline underline-offset-4"
              >
                Return through My stories
              </a>
            </div>
          </details>
        </div>
      </PortalShell>
    </div>
  );
}
