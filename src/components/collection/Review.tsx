"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrandPattern } from "@/components/BrandPattern";
import { AppIcon } from "@/components/icons";
import { useCollection } from "./useCollection";
import { CollectionSharing } from "./CollectionSharing";
import { OwnerReplies } from "./OwnerReplies";
import { FilmGenerationPanel } from "./FilmGenerationPanel";
import { StoryReviewPanel } from "./StoryReviewPanel";
import { StoryMediaPlayer } from "./StoryOriginalPreview";
import { ApprovedStories } from "./ApprovedStories";
import { GenerosityNotes, useGenerosityNotesEditor } from "./GenerosityNotes";
import { storyOriginals } from "./story-originals";
import {
  ContactSummary,
  PortalError,
  PortalShell,
  PrivateLink,
  SourceArchive,
  mediaPath,
  portalPrimary,
  portalSecondary,
} from "./PortalUI";

const themes = [
  "Kindness received",
  "A life of faith",
  "What you sowed",
  "What I hope you carry",
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
  const notesEditor = useGenerosityNotesEditor();
  const [editorStates, setEditorStates] = useState<
    Record<string, { dirty: boolean; ready: boolean }>
  >({});
  const [localError, setLocalError] = useState("");
  const [approvalError, setApprovalError] = useState("");
  const [approving, setApproving] = useState(false);
  const [generatingFilms, setGeneratingFilms] = useState(false);
  const [writtenOnlyChoice, setWrittenOnlyChoice] = useState<boolean | null>(
    null,
  );
  const [hasFilmJob, setHasFilmJob] = useState<boolean | null>(null);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const editorTop = useRef<HTMLDivElement>(null);
  const originalsSection = useRef<HTMLDivElement>(null);
  const approvalHeading = useRef<HTMLHeadingElement>(null);
  const hasOriginals = Boolean(
    c &&
    (c.chapters.length
      ? c.chapters.some((chapter) => storyOriginals(c, chapter).length > 0)
      : c.takes.some((take) => take.kind !== "text" && take.mediaId) ||
        c.interviews?.some((interview) =>
          interview.segments.some((segment) => segment.mediaId),
        )),
  );
  const hasAttachedFilms = Boolean(
    c?.chapters.some((chapter) => chapter.videoMediaId),
  );
  // Automatic defaults can follow saved sources; an explicit choice always wins.
  const writtenOnly =
    writtenOnlyChoice ??
    Boolean(
      c?.chapters.length &&
      !hasOriginals &&
      !hasAttachedFilms &&
      hasFilmJob === false,
    );
  const onEditorState = useCallback(
    (chapterId: string, dirty: boolean, ready: boolean) =>
      setEditorStates((old) =>
        old[chapterId]?.dirty === dirty && old[chapterId]?.ready === ready
          ? old
          : { ...old, [chapterId]: { dirty, ready } },
      ),
    [],
  );
  const onApprovedNotesDirty = useCallback(
    (dirty: boolean) => onEditorState("giving-notes", dirty, true),
    [onEditorState],
  );
  const dirty = Object.values(editorStates).some((state) => state.dirty);
  const editorsReady =
    Boolean(c?.chapters.length) &&
    c!.chapters.every((chapter) => editorStates[chapter.id]?.ready);
  const blocked = busy || working || dirty || generatingFilms;
  const activeDirty = Boolean(editorStates[activeChapter]?.dirty);
  const navigationBlocked = busy || working || activeDirty;
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  async function prepare(regenerate = false) {
    if (blocked) return;
    setWorking(true);
    setLocalError("");
    const result = await act({
      action: "generate",
      prepareFilms: hasOriginals,
      processingApproved: hasOriginals,
      ...(regenerate ? { regenerate: true } : {}),
    });
    if (result) {
      setEditorStates({});
      setActiveChapter("q1");
      setNotice(
        hasOriginals
          ? "Your story drafts are saved. Check film preparation below while you read your stories."
          : "Your four written stories are ready. Read each one and save its review before approving your collection.",
      );
    }
    setWorking(false);
  }
  async function approve() {
    if (blocked || !editorsReady) return;
    setLocalError("");
    setApprovalError("");
    setApproving(true);
    const result = await act({
      action: "approve",
      deliveryMode: "digital",
      autoPostcards: true,
      ...(writtenOnly ? { allowWrittenOnly: true } : {}),
    });
    if (result) {
      setEditorStates({});
      setNotice("Your approved collection is ready to share.");
    } else {
      setApprovalError(
        "We could not confirm your approval. Your stories are saved. Check your connection and try again.",
      );
    }
    setApproving(false);
  }
  function nextStory() {
    if (!c || navigationBlocked) return;
    const index = c.chapters.findIndex(
      (chapter) => chapter.id === activeChapter,
    );
    if (index === c.chapters.length - 1) {
      approvalHeading.current?.focus();
      approvalHeading.current?.scrollIntoView({
        behavior: "auto",
        block: "start",
      });
      return;
    }
    setActiveChapter(c.chapters[index + 1].id);
    editorTop.current?.scrollIntoView({ behavior: "auto", block: "start" });
  }
  if (!c)
    return (
      <PortalShell>
        <h1 className="mt-10 text-3xl font-medium">Your story collection</h1>
        <PortalError message={error} />
        {!error ? (
          <p role="status" className="mt-5 text-lg text-ink-500">
            Opening your saved stories…
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
        <p className="mt-5 text-lg leading-8 text-ink-500">
          Open your private collection link to read the stories shared with you.
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
    c.chapters.every((chapter) => Boolean(chapter.videoMediaId));
  const reviewedCount = c.chapters.filter(
    (chapter) => chapter.editorialReviewed,
  ).length;
  const canApprove =
    !blocked &&
    editorsReady &&
    !c.draftOutdated &&
    c.chapters.length === 4 &&
    reviewedCount === 4 &&
    (filmsReady || writtenOnly);
  const stage = approved
    ? 3
    : filmsReady || writtenOnly
      ? 2
      : c.chapters.length
        ? 1
        : 0;

  return (
    <div
      onPlayCapture={(event) => {
        event.currentTarget
          .querySelectorAll<HTMLMediaElement>("video,audio")
          .forEach((media) => {
            if (media !== event.target) media.pause();
          });
      }}
      onClickCapture={(event) => {
        if (dirty && (event.target as Element).closest("a[href]")) {
          event.preventDefault();
          event.stopPropagation();
          setLocalError(
            "Save your latest changes before opening another page. Private notes have their own Save privately button.",
          );
        }
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
            {approved ? "Stories woven together" : "Your private workspace"}
          </p>
          <h1 className="mt-4 max-w-3xl font-display text-3xl font-medium leading-tight text-white sm:text-5xl">
            {approved
              ? `Your stories are ready to share with ${c.recipient.name}.`
              : "Does this sound like you?"}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-paper">
            {approved
              ? `Your four stories are approved for ${c.recipient.name}. Your private link and delivery status are below.`
              : "Read one story at a time. You can change any names, details or words before you approve it."}
          </p>
          {!approved && (
            <a
              href={`/record/${encodeURIComponent(id)}?key=${encodeURIComponent(accessKey)}`}
              className="mt-6 inline-flex min-h-12 items-center gap-3 rounded-xl border border-white/35 px-5 py-3 text-base font-medium text-white hover:bg-white/10"
            >
              Continue my interview
              <AppIcon name="arrowRight" size={18} />
            </a>
          )}
        </header>
        <nav
          aria-label="Open part of your collection"
          className="mt-5 flex flex-wrap gap-3"
        >
          <a
            href={approved ? "#saved-stories" : "#story-review"}
            className={portalPrimary}
          >
            <AppIcon name="video" size={19} />
            {hasAttachedFilms
              ? `Stories and videos (${c.chapters.filter((chapter) => chapter.videoMediaId).length})`
              : "Read my stories"}
          </a>
          <a
            href="#original-recordings"
            className={portalSecondary}
            onClick={() => {
              const archive =
                originalsSection.current?.querySelector("details");
              if (archive) archive.open = true;
            }}
          >
            Original recordings
          </a>
          <a
            href={
              approved
                ? "#sharing-and-postcards"
                : c.chapters.length
                  ? "#film-preparation"
                  : "#story-review"
            }
            className={portalSecondary}
          >
            {approved ? "Sharing and postcards" : "Video preparation"}
          </a>
        </nav>
        <nav aria-label="Collection progress" className="my-7">
          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              "Your answers",
              "Read your stories",
              "Review and approve",
              "Share the collection",
            ].map((label, index) => (
              <li
                key={label}
                aria-current={stage === index ? "step" : undefined}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm leading-6 ${stage === index ? "bg-sage-100 font-semibold text-ink" : "bg-white text-ink-500"}`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${stage >= index ? "bg-espresso text-white" : "bg-paper-200"}`}
                >
                  {stage > index ? (
                    <AppIcon name="check" size={15} />
                  ) : (
                    index + 1
                  )}
                </span>
                {label}
              </li>
            ))}
          </ol>
        </nav>
        <PortalError message={localError || error} />
        <p role="status" className="mb-4 text-base leading-7 text-sage-700">
          {notice}
        </p>

        {approved ? (
          <>
            <ApprovedStories collection={c} accessKey={accessKey} />
            <GenerosityNotes
              collection={c}
              accessKey={accessKey}
              disabled={busy}
              addDisabled
              canAddToStory={false}
              editor={notesEditor}
              onDirty={onApprovedNotesDirty}
              onSaved={load}
            />
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
        ) : (
          <>
            {!c.chapters.length ? (
              <section
                id="story-review"
                className="scroll-mt-6 rounded-2xl border border-warmgray-200 bg-white p-6 sm:p-8"
              >
                <h2 className="text-2xl font-semibold">
                  Your answers become four stories.
                </h2>
                <p className="mt-4 max-w-2xl text-lg leading-8 text-ink-500">
                  Save an answer in each interview part. We’ll prepare a written
                  draft for every story, then you can check the words alongside
                  your original recordings before choosing what to share.
                </p>
                <ol className="mt-6 grid gap-3 sm:grid-cols-2">
                  {themes.map((theme, index) => (
                    <li
                      key={theme}
                      className="rounded-xl bg-paper p-4 text-base"
                    >
                      <span className="mr-3 text-taupe-600">0{index + 1}</span>
                      {theme}
                    </li>
                  ))}
                </ol>
                <p className="mt-5 text-base leading-7 text-ink-500">
                  {hasOriginals
                    ? "Preparation uses ElevenLabs to transcribe your original audio and assemble the films. Nothing is shared until you approve."
                    : "Your typed answers will become four written stories. You can share them without making films. Nothing is shared until you approve."}
                </p>
                <button
                  className={`${portalPrimary} mt-6`}
                  disabled={blocked}
                  onClick={() => void prepare()}
                >
                  {working
                    ? "Preparing your stories…"
                    : "Prepare my four stories"}
                  <AppIcon name="arrowRight" size={18} />
                </button>
              </section>
            ) : (
              <>
                {c.draftOutdated && (
                  <section className="mb-6 rounded-2xl border border-clay-300 bg-clay-50 p-5">
                    <h2 className="text-lg font-semibold">
                      Your answers have changed.
                    </h2>
                    <p className="mt-2 text-base leading-7 text-ink-500">
                      Save any open edits, then prepare new drafts from your
                      current answers. Your earlier saved drafts and attached
                      films remain in the history below.
                    </p>
                    <button
                      className={`${portalSecondary} mt-4`}
                      disabled={blocked || !editorsReady}
                      onClick={() => void prepare(true)}
                    >
                      {working
                        ? "Preparing new drafts…"
                        : "Prepare updated stories"}
                    </button>
                  </section>
                )}
                <div id="story-review" ref={editorTop} className="scroll-mt-5">
                  {writtenOnly && !hasAttachedFilms && (
                    <p className="mb-5 rounded-xl bg-sage-50 p-4 text-base leading-7">
                      Your written stories are ready to review. Read each story,
                      check its review box and save. Recordings and films are
                      optional.
                    </p>
                  )}
                  {generatingFilms && (
                    <p
                      role="status"
                      className="mb-5 rounded-xl bg-sage-50 p-4 text-base leading-7"
                    >
                      Your films are being prepared. You can read each saved
                      story while you wait. Editing and final review will open
                      when preparation finishes.
                    </p>
                  )}
                  <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                    <h2 className="text-2xl font-semibold">
                      Your four stories
                    </h2>
                    <p className="text-sm text-ink-500">
                      {reviewedCount} of 4 final reviews saved
                    </p>
                  </div>
                  <nav
                    aria-label="Choose a story to review"
                    className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
                  >
                    {c.chapters.map((chapter, index) => (
                      <button
                        type="button"
                        key={chapter.id}
                        disabled={navigationBlocked || !editorsReady}
                        onClick={() => {
                          setActiveChapter(chapter.id);
                          setLocalError("");
                        }}
                        aria-current={
                          activeChapter === chapter.id ? "step" : undefined
                        }
                        className={`min-h-28 rounded-2xl border p-4 text-left transition-colors disabled:cursor-not-allowed ${activeChapter === chapter.id ? "border-espresso bg-espresso text-white" : "border-warmgray-200 bg-white hover:border-taupe"}`}
                      >
                        <span
                          className={`text-xs font-medium uppercase tracking-[.12em] ${activeChapter === chapter.id ? "text-paper" : "text-taupe-600"}`}
                        >
                          Story {index + 1}
                        </span>
                        <span className="mt-2 block font-display text-lg font-semibold leading-6">
                          {chapter.title}
                        </span>
                        <span
                          className={`mt-3 flex items-center gap-2 text-xs ${activeChapter === chapter.id ? "text-paper" : "text-ink-600"}`}
                        >
                          {chapter.editorialReviewed &&
                            !editorStates[chapter.id]?.dirty && (
                              <AppIcon name="check" size={14} />
                            )}
                          {editorStates[chapter.id]?.dirty
                            ? "Unsaved changes"
                            : chapter.editorialReviewed
                              ? "Review saved"
                              : chapter.videoMediaId
                                ? "Film ready to review"
                                : "Story ready to review"}
                        </span>
                      </button>
                    ))}
                  </nav>
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      className={portalSecondary}
                      disabled={
                        navigationBlocked ||
                        !editorsReady ||
                        activeChapter === c.chapters[0]?.id
                      }
                      onClick={() => {
                        const index = c.chapters.findIndex(
                          (chapter) => chapter.id === activeChapter,
                        );
                        if (index > 0)
                          setActiveChapter(c.chapters[index - 1].id);
                      }}
                    >
                      Previous story
                    </button>
                    <span className="text-base font-medium">
                      Story{" "}
                      {c.chapters.findIndex(
                        (chapter) => chapter.id === activeChapter,
                      ) + 1}{" "}
                      of {c.chapters.length}
                    </span>
                    <button
                      type="button"
                      className={portalSecondary}
                      disabled={navigationBlocked || !editorsReady}
                      onClick={nextStory}
                    >
                      {activeChapter === c.chapters.at(-1)?.id
                        ? "Go to approval"
                        : "Next story"}
                    </button>
                  </div>
                </div>
                {c.chapters.map((chapter) => (
                  <StoryReviewPanel
                    key={`${chapter.id}:${c.draftHistory?.length || 0}:${chapter.sourceTakeIds.join(",")}`}
                    chapter={chapter}
                    collection={c}
                    accessKey={accessKey}
                    active={activeChapter === chapter.id}
                    busy={busy || working}
                    locked={generatingFilms}
                    allowWrittenOnly={writtenOnly}
                    onState={onEditorState}
                    onNotesSaved={load}
                    notesEditor={notesEditor}
                    act={act}
                    onNext={nextStory}
                    nextLabel={
                      chapter.id === c.chapters.at(-1)?.id
                        ? "Continue to approval"
                        : "Next story"
                    }
                  />
                ))}
                <div id="film-preparation" className="mt-9 scroll-mt-6">
                  <FilmGenerationPanel
                    collection={c}
                    accessKey={accessKey}
                    disabled={
                      busy ||
                      working ||
                      dirty ||
                      !editorsReady ||
                      Boolean(c.draftOutdated)
                    }
                    onActiveChange={setGeneratingFilms}
                    onComplete={load}
                    writtenOnly={writtenOnly}
                    onWrittenOnly={setWrittenOnlyChoice}
                    hasOriginals={hasOriginals}
                    onJobPresence={setHasFilmJob}
                  />
                </div>
                <section
                  className="mt-7 rounded-2xl border border-warmgray-200 bg-white p-6 sm:p-8"
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
                  <p className="mt-4 max-w-3xl text-base leading-8 text-ink-500">
                    Approve only when all four stories and any included films
                    say what you want to share. This saves a fixed version,
                    opens your private family page for your verified recipient.
                    Next, review the separate encouragement printed on your
                    postcards. Private stories are never printed automatically.
                  </p>
                  <p className="mt-4 text-base font-medium">
                    {reviewedCount} of 4 story reviews saved.
                  </p>
                  {dirty && (
                    <p className="mt-2 text-sm text-ink-500">
                      Save your latest changes first.
                    </p>
                  )}
                  {!filmsReady && !writtenOnly && (
                    <p className="mt-2 text-base leading-7 text-ink-500">
                      {generatingFilms
                        ? "Your films are still being prepared. You can return to review them when they are ready."
                        : "Review your finished films, or choose written stories in Other ways to share above."}
                    </p>
                  )}
                  {reviewedCount < 4 && !generatingFilms && !dirty && (
                    <p className="mt-2 text-base leading-7 text-ink-500">
                      Open each story above, check its review box, then save the
                      review.
                    </p>
                  )}
                  <PortalError message={approvalError} />
                  <button
                    type="button"
                    disabled={!canApprove}
                    className={`${portalPrimary} mt-5`}
                    onClick={() => void approve()}
                  >
                    {approving
                      ? "Saving your approval…"
                      : "Approve my collection"}
                    <AppIcon name="arrowRight" size={18} />
                  </button>
                  <p className="mt-3 text-sm leading-6 text-ink-500">
                    Approval queues a confirmation email for you when email is
                    connected. After you approve the public postcard messages
                    and confirm the address, the four-card mailing can run
                    automatically. Approved stories cannot be edited in this
                    pilot.
                  </p>
                </section>
              </>
            )}
          </>
        )}

        <div className="mt-8 space-y-5">
          <details className="rounded-2xl border border-warmgray-200 bg-white p-5 sm:p-6">
            <summary className="min-h-11 cursor-pointer text-lg font-semibold">
              Your people and return link
            </summary>
            <div className="mt-3 space-y-5">
              <ContactSummary collection={c} />
              <PrivateLink
                path={`/collection/${encodeURIComponent(id)}/review?key=${encodeURIComponent(accessKey)}`}
                label="Save your private workspace link"
                description="Use this link to return to your stories. Anyone with it can access your workspace, so keep it for yourself."
              />
            </div>
          </details>
          <div
            id="original-recordings"
            ref={originalsSection}
            className="scroll-mt-6"
          >
            <SourceArchive collection={c} accessKey={accessKey} />
          </div>
          {Boolean(c.draftHistory?.length) && (
            <details
              className="rounded-2xl border border-warmgray-200 bg-white p-5 sm:p-6"
              onToggle={(event) => {
                if (!event.currentTarget.open)
                  event.currentTarget
                    .querySelectorAll<HTMLMediaElement>("video,audio")
                    .forEach((media) => media.pause());
              }}
            >
              <summary className="min-h-11 cursor-pointer text-lg font-semibold">
                Earlier saved drafts ({c.draftHistory?.length})
              </summary>
              <p className="mt-2 text-sm leading-7 text-ink-500">
                These earlier versions remain available for reference. They are
                not the version being shared.
              </p>
              {c.draftHistory?.map((version, index) => (
                <details
                  key={version.savedAt}
                  className="mt-4 border-t border-warmgray-200 pt-4"
                  onToggle={(event) => {
                    if (!event.currentTarget.open)
                      event.currentTarget
                        .querySelectorAll<HTMLMediaElement>("video,audio")
                        .forEach((media) => media.pause());
                  }}
                >
                  <summary className="min-h-11 cursor-pointer font-medium">
                    Draft {index + 1} ·{" "}
                    {new Date(version.savedAt).toLocaleDateString()}
                  </summary>
                  {version.chapters.map((chapter) => (
                    <section
                      key={chapter.id}
                      className="my-5 rounded-xl bg-paper p-5"
                    >
                      <h3 className="text-xl font-semibold">{chapter.title}</h3>
                      <p className="mt-4 whitespace-pre-wrap text-base leading-8">
                        {chapter.content}
                      </p>
                      {chapter.videoMediaId && (
                        <StoryMediaPlayer
                          className="mt-4"
                          label={`Earlier film: ${chapter.title}`}
                          src={mediaPath(id, chapter.videoMediaId, accessKey)}
                        />
                      )}
                    </section>
                  ))}
                </details>
              ))}
            </details>
          )}
        </div>
      </PortalShell>
    </div>
  );
}
