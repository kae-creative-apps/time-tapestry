"use client";

import { useEffect, useRef, useState } from "react";
import { BrandPattern } from "@/components/BrandPattern";
import { AppIcon } from "@/components/icons";
import { useCollection } from "./useCollection";
import { CollectionSharing } from "./CollectionSharing";
import { OwnerReplies } from "./OwnerReplies";
import { FilmGenerationPanel } from "./FilmGenerationPanel";
import { StoryReviewPanel } from "./StoryReviewPanel";
import { ApprovedStories } from "./ApprovedStories";
import { storyOriginals } from "./story-originals";
import {
  ContactSummary,
  PortalError,
  PortalShell,
  PrivateLink,
  SourceArchive,
  portalPrimary,
  portalSecondary,
} from "./PortalUI";

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
  const [working, setWorking] = useState(false);
  const [generatingFilms, setGeneratingFilms] = useState(false);
  const [approvedPlayback, setApprovedPlayback] = useState(false);
  const [localError, setLocalError] = useState("");
  const [notice, setNotice] = useState("");
  const playbackTop = useRef<HTMLDivElement>(null);
  const originalsSection = useRef<HTMLDivElement>(null);
  const approvalHeading = useRef<HTMLHeadingElement>(null);
  const recordPath = `/record/${encodeURIComponent(id)}?key=${encodeURIComponent(accessKey)}`;
  const hasOriginals = Boolean(
    c &&
    (c.chapters.length
      ? c.chapters.some((chapter) => storyOriginals(c, chapter).length > 0)
      : c.takes.some((take) => take.kind !== "text" && take.mediaId) ||
        c.interviews?.some((interview) =>
          interview.segments.some((segment) => segment.mediaId),
        )),
  );
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
  const blocked = busy || working;

  async function prepare(regenerate = false) {
    if (blocked || generatingFilms) return;
    if (!hasOriginals) {
      setLocalError(
        "Record your answers before submitting your interview. Earlier saved material is kept.",
      );
      return;
    }
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
        "Your recordings are submitted. We’ll prepare your four films using your own voice. Nothing is shared until you approve.",
      );
    }
    setWorking(false);
  }

  async function recordAnother(chapterId: string) {
    if (blocked || !c) return;
    const index = c.chapters.findIndex((chapter) => chapter.id === chapterId);
    const result = await act({
      action: "progress",
      currentQuestion: Math.max(0, index),
    });
    if (result) window.location.assign(`${recordPath}&classic=1`);
  }

  async function approve() {
    if (blocked || !approvedPlayback || !c || c.draftOutdated) return;
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
    if (result)
      setNotice(
        "Your approved collection is ready. Your postcard encouragement is the next step.",
      );
    else
      setLocalError(
        "We could not confirm your approval. Your recordings are saved. Check your connection and try again.",
      );
    setWorking(false);
  }

  function chooseStory(index: number) {
    if (!c || blocked) return;
    if (index >= c.chapters.length) {
      approvalHeading.current?.focus();
      approvalHeading.current?.scrollIntoView({
        behavior: "auto",
        block: "start",
      });
      return;
    }
    if (index < 0) return;
    setActiveChapter(c.chapters[index].id);
    playbackTop.current?.scrollIntoView({ behavior: "auto", block: "start" });
  }

  if (!c)
    return (
      <PortalShell>
        <h1 className="mt-10 text-3xl font-medium">Your recordings</h1>
        <PortalError message={error} />
        {!error ? (
          <p role="status" className="mt-5 text-lg text-ink-600">
            Opening your saved recordings…
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
        <p className="mt-5 text-lg leading-8 text-ink-600">
          Open your private collection link to see the stories shared with you.
        </p>
        <a
          className={`${portalPrimary} mt-6`}
          href={`/collection/${encodeURIComponent(id)}?key=${encodeURIComponent(accessKey)}`}
        >
          Open the collection
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
    approvedPlayback;

  return (
    <div
      onPlayCapture={(event) => {
        event.currentTarget
          .querySelectorAll<HTMLMediaElement>("video,audio")
          .forEach((media) => {
            if (media !== event.target) media.pause();
          });
      }}
    >
      <PortalShell
        collectionPath={`/collection/${encodeURIComponent(id)}?key=${encodeURIComponent(accessKey)}`}
      >
        <header className="brand-gradient-chocolate relative isolate overflow-hidden rounded-[28px] p-6 text-white sm:p-9">
          <BrandPattern
            variant="ribbon"
            className="absolute -right-40 -top-20 -z-10 w-[600px] max-w-none text-white opacity-[0.06]"
          />
          <p className="brand-eyebrow text-paper">
            {approved
              ? "Stories woven together"
              : "Your own voice, kept for someone you love"}
          </p>
          <h1 className="mt-4 max-w-3xl font-display text-3xl font-medium leading-tight text-white sm:text-5xl">
            {approved
              ? `Your stories are ready for ${c.recipient.name}.`
              : filmsReady
                ? "Listen, then approve when you’re ready."
                : "Your recordings are saved."}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-paper">
            {approved
              ? "Your collection and postcard options are below. Your original recordings stay saved."
              : "You don’t need to edit a transcript or write your story again. We prepare the films from your recordings. You choose when they are ready to share."}
          </p>
          {!approved && (
            <a
              href={recordPath}
              className="mt-6 inline-flex min-h-12 items-center gap-3 rounded-xl border border-white/35 px-5 py-3 text-base font-medium text-white hover:bg-white/10"
            >
              Return to my interview <AppIcon name="arrowRight" size={18} />
            </a>
          )}
        </header>
        <nav
          aria-label="Jump to a section on this page"
          className="my-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-warmgray-200 bg-white px-5 py-3"
        >
          <a
            href={approved ? "#saved-stories" : "#story-review"}
            className="inline-flex min-h-12 items-center gap-2 text-base font-medium underline underline-offset-4"
          >
            <span aria-hidden="true">↓</span>{" "}
            {approved ? "My stories" : "Listen to my recordings"}
          </a>
          <a
            href="#original-recordings"
            className="inline-flex min-h-12 items-center gap-2 text-base font-medium underline underline-offset-4"
            onClick={() => {
              const archive =
                originalsSection.current?.querySelector("details");
              if (archive) archive.open = true;
            }}
          >
            <span aria-hidden="true">↓</span> All original recordings
          </a>
          <a
            href={approved ? "#sharing-and-postcards" : "#film-preparation"}
            className="inline-flex min-h-12 items-center gap-2 text-base font-medium underline underline-offset-4"
          >
            <span aria-hidden="true">↓</span>{" "}
            {approved ? "Postcards and sharing" : "Film progress"}
          </a>
        </nav>
        <PortalError message={localError || error} />
        {notice && (
          <p
            role="status"
            className="mb-5 rounded-xl bg-sage-50 p-4 text-base leading-7 text-ink-700"
          >
            {notice}
          </p>
        )}

        {approved ? (
          <>
            <ApprovedStories collection={c} accessKey={accessKey} />
            <div id="sharing-and-postcards" className="scroll-mt-6">
              <CollectionSharing collection={c} busy={busy} act={act} />
            </div>
            <OwnerReplies
              collection={c}
              accessKey={accessKey}
              busy={busy}
              onRefresh={() => void load()}
            />
          </>
        ) : !c.chapters.length ? (
          <section
            id="story-review"
            className="rounded-2xl border border-warmgray-200 bg-white p-6 sm:p-8"
          >
            <h2 className="text-2xl font-semibold">
              Ready to submit your recordings?
            </h2>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-ink-600">
              Listen to your saved recordings below. If you want to say
              something differently, return to the interview before submitting.
            </p>
            <p className="mt-4 max-w-2xl text-base leading-7 text-ink-600">
              Submitting allows us to transcribe and prepare four films from
              your recordings. Your own voice is preserved. You’ll see the
              finished films before anything is shared.
            </p>
            {hasOriginals ? (
              <button
                className={`${portalPrimary} mt-6`}
                disabled={blocked}
                onClick={() => void prepare()}
              >
                {working
                  ? "Submitting your recordings…"
                  : "Submit my recordings"}
                <AppIcon name="arrowRight" size={18} />
              </button>
            ) : (
              <a className={`${portalPrimary} mt-6`} href={recordPath}>
                Record my answers <AppIcon name="arrowRight" size={18} />
              </a>
            )}
          </section>
        ) : (
          <>
            {c.draftOutdated && (
              <section className="mb-6 rounded-2xl border border-clay-300 bg-clay-50 p-5">
                <h2 className="text-xl font-semibold">
                  You have new recordings.
                </h2>
                <p className="mt-3 text-base leading-7 text-ink-600">
                  Submit your updated recordings to prepare a new collection.
                  Your earlier recordings stay saved.
                </p>
                <button
                  className={`${portalPrimary} mt-4`}
                  disabled={blocked || generatingFilms}
                  onClick={() => void prepare(true)}
                >
                  {working ? "Submitting…" : "Submit updated recordings"}
                </button>
              </section>
            )}
            {!filmsReady && (
              <p className="mb-5 rounded-xl bg-sage-50 p-4 text-base leading-7">
                Your films are not ready yet. You can listen to the originals
                now and return here for your finished collection.
              </p>
            )}
            <div id="story-review" ref={playbackTop} className="scroll-mt-6">
              <h2 className="mb-5 text-2xl font-semibold">
                {filmsReady ? "Your four films" : "Your saved stories"}
              </h2>
              <nav
                aria-label="Choose a recording or film"
                className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
              >
                {c.chapters.map((chapter, index) => (
                  <button
                    type="button"
                    key={chapter.id}
                    disabled={blocked}
                    onClick={() => setActiveChapter(chapter.id)}
                    aria-current={
                      activeChapter === chapter.id ? "page" : undefined
                    }
                    className={`min-h-24 rounded-2xl border p-4 text-left ${activeChapter === chapter.id ? "border-espresso bg-espresso text-white" : "border-warmgray-200 bg-white hover:border-taupe"}`}
                  >
                    <span className="text-sm">Story {index + 1}</span>
                    <span className="mt-2 block text-lg font-semibold leading-6">
                      {chapter.title}
                    </span>
                    <span className="mt-2 block text-sm">
                      {chapter.videoMediaId
                        ? "Film ready"
                        : "Original recording"}
                    </span>
                  </button>
                ))}
              </nav>
            </div>
            {c.chapters.map((chapter) => (
              <StoryReviewPanel
                key={`${chapter.id}:${chapter.sourceTakeIds.join(",")}`}
                chapter={chapter}
                collection={c}
                accessKey={accessKey}
                active={activeChapter === chapter.id}
                busy={blocked || generatingFilms}
                onRecord={() => void recordAnother(chapter.id)}
              />
            ))}
            <nav
              aria-label="Move between your stories"
              className="my-5 flex flex-wrap items-center justify-between gap-3"
            >
              <button
                type="button"
                className={portalSecondary}
                disabled={blocked || activeIndex === 0}
                onClick={() => chooseStory(activeIndex - 1)}
              >
                Previous story
              </button>
              <span className="text-base font-medium">
                {activeIndex + 1} of {c.chapters.length}
              </span>
              <button
                type="button"
                className={portalSecondary}
                disabled={blocked}
                onClick={() => chooseStory(activeIndex + 1)}
              >
                {activeIndex === c.chapters.length - 1
                  ? "Go to approval"
                  : "Next story"}
              </button>
            </nav>
            <div id="film-preparation" className="mt-8 scroll-mt-6">
              <FilmGenerationPanel
                collection={c}
                accessKey={accessKey}
                disabled={blocked || Boolean(c.draftOutdated)}
                onActiveChange={setGeneratingFilms}
                onComplete={load}
              />
            </div>
            <section
              className="mt-7 rounded-2xl border border-sage-200 bg-sage-50 p-6 sm:p-8"
              aria-labelledby="approval-heading"
            >
              <h2
                ref={approvalHeading}
                tabIndex={-1}
                id="approval-heading"
                className="scroll-mt-5 text-2xl font-semibold"
              >
                Ready to share with {c.recipient.name}?
              </h2>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-ink-600">
                Once you have watched or listened to all four films, approve the
                collection here. Your original recordings stay saved. Next, you
                can choose the encouragement printed on your postcards.
              </p>
              <label className="mt-5 flex items-start gap-3 text-base leading-7">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 shrink-0"
                  disabled={
                    blocked ||
                    generatingFilms ||
                    !filmsReady ||
                    Boolean(c.draftOutdated)
                  }
                  checked={approvedPlayback}
                  onChange={(event) =>
                    setApprovedPlayback(event.target.checked)
                  }
                />
                <span>
                  I have listened to all four films and want to share this
                  collection.
                </span>
              </label>
              {!filmsReady && (
                <p className="mt-3 text-base leading-7 text-ink-600">
                  Approval will be available when all four films are ready.
                </p>
              )}
              <button
                type="button"
                disabled={!canApprove}
                className={`${portalPrimary} mt-5`}
                onClick={() => void approve()}
              >
                {working ? "Saving your approval…" : "Approve my collection"}
                <AppIcon name="arrowRight" size={18} />
              </button>
              <p className="mt-4 text-base leading-7 text-ink-600">
                Your private stories are not printed automatically. Only the
                public encouragement you approve appears on a postcard.
              </p>
            </section>
          </>
        )}
        <div className="mt-8 space-y-5">
          <div
            id="original-recordings"
            ref={originalsSection}
            className="scroll-mt-6"
          >
            <SourceArchive collection={c} accessKey={accessKey} />
          </div>
          <details className="rounded-2xl border border-warmgray-200 bg-white p-5 sm:p-6">
            <summary className="min-h-12 cursor-pointer text-lg font-semibold">
              Your people and private return link
            </summary>
            <div className="mt-3 space-y-5">
              <ContactSummary collection={c} />
              <PrivateLink
                path={`/collection/${encodeURIComponent(id)}/review?key=${encodeURIComponent(accessKey)}`}
                label="Save your private workspace link"
                description="Use this link to return. Anyone with it can access your workspace, so keep it for yourself."
              />
            </div>
          </details>
        </div>
      </PortalShell>
    </div>
  );
}
