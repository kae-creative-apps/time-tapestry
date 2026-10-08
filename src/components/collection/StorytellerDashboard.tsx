"use client";

import { useEffect, useState, type ReactNode, type Ref } from "react";
import { AppIcon } from "@/components/icons";
import { BrandPattern } from "@/components/BrandPattern";
import { FadeIn } from "@/components/ui/FadeIn";
import { Stagger, StaggerItem } from "@/components/ui/Stagger";
import { SiriOrb } from "@/components/ui/siri-orb";
import { PostcardFace } from "@/components/collection/PostcardFace";
import { StoryMediaPlayer } from "@/components/collection/StoryOriginalPreview";
import fd from "@/components/marketing/FrontDoor.module.css";
import { collectionRequest } from "@/lib/collection/client-request";
import { publicPostcardMessage } from "@/lib/collection/postcard-public-message";
import {
  STORY_THEMES,
  storytellerTasks,
  type StorytellerTask,
} from "@/lib/collection/storyteller-tasks";
import type { CollectionView } from "@/lib/collection/types";
import type { InterviewPreparationView } from "@/lib/collection/interview-preparation-types";
import type { PostcardProofSnapshot } from "@/lib/collection/postcard-proofs";
import { hasChapterPlayback } from "@/lib/audio/playback-types";
import { hasRecordedVoiceFilm } from "./recorded-films";
import { StoryFilmPlayer } from "./StoryFilmPlayer";
import { mediaPath } from "./PortalUI";
import styles from "./StorytellerDashboard.module.css";

const heroCopy: Record<
  StorytellerTask["id"],
  { title: (name: string) => string; detail: (name: string) => string }
> = {
  saved: {
    title: () => "Finish saving your interview",
    detail: () =>
      "Return to your conversation. Your answers stay private until you approve the gift.",
  },
  prepared: {
    title: () => "Your stories are being prepared",
    detail: () =>
      "Four stories, four videos, and postcard drafts come from your recording. You can leave and come back.",
  },
  approved: {
    title: () => "Review your gift",
    detail: (name) =>
      `Read each story, watch each video, and approve it before ${name} can open it.`,
  },
  address: {
    title: (name) => `Add ${name}'s mailing address`,
    detail: (name) =>
      `Postcards for ${name} wait here until the address is saved. The digital gift can still be shared.`,
  },
  ebook: {
    title: () => "Download your e-book",
    detail: (name) =>
      `Your gift for ${name} is approved and the mailing address is saved.`,
  },
};

function query(accessKey: string) {
  return accessKey ? `?key=${encodeURIComponent(accessKey)}` : "";
}

export function StorytellerDashboard({
  collection,
  accessKey,
  preparation = null,
  headingRef,
  onOpenStep,
  onOpenChapter,
  children,
}: {
  collection: CollectionView;
  accessKey: string;
  preparation?: InterviewPreparationView | null;
  headingRef?: Ref<HTMLHeadingElement>;
  onOpenStep?: (step: 0 | 1 | 2) => void;
  onOpenChapter?: (chapterId: string) => void;
  children?: ReactNode;
}) {
  const name = collection.recipient.name?.trim() || "your recipient";
  const plan = storytellerTasks({
    status: collection.status,
    chapters: collection.chapters,
    addressConfirmed: collection.addressConfirmed,
    recipientName: name,
    preparation,
  });
  const copy = heroCopy[plan.current.id];
  const needsAttention = preparation?.status === "needs_attention";
  const heroTitle = needsAttention
    ? "Your interview needs another look"
    : copy.title(name);
  const heroDetail = needsAttention
    ? preparation?.error ||
      "Your recording is saved. Films need another look."
    : plan.current.id === "prepared" && preparation?.status === "queued"
      ? "Your interview is queued. You can leave this page and return through your private link."
      : copy.detail(name);
  const keyQuery = query(accessKey);
  const reviewBase = `/collection/${encodeURIComponent(collection.id)}/review${keyQuery}`;
  const addressHref = `/collection/${encodeURIComponent(collection.id)}/address${keyQuery}`;
  const previewHref = `/collection/${encodeURIComponent(collection.id)}/preview${keyQuery}`;
  const bookHref = `/api/collection/${encodeURIComponent(collection.id)}/book${keyQuery}${
    collection.status === "approved" ? "" : `${keyQuery ? "&" : "?"}draft=1`
  }`;
  const libraryHref = `/collection/${encodeURIComponent(collection.id)}/stories${keyQuery}`;

  return (
    <div className={`${fd.frontDoor} ${styles.root}`}>
      <FadeIn>
        <section className={styles.hero} aria-labelledby="whats-left-heading">
          <BrandPattern variant="ribbon" className={styles.pattern} />
          <div className={styles.heroCopy}>
            <div className={styles.orbRow}>
              <SiriOrb
                size={76}
                animationDuration={16}
                colors={{
                  bg: "#432e23",
                  c1: "#e5c8bb",
                  c2: "#dadecf",
                  c3: "#c18f7b",
                }}
              />
              <p className={styles.eyebrow}>What’s left to do</p>
            </div>
            <h1
              id="whats-left-heading"
              ref={headingRef}
              tabIndex={-1}
              className={styles.title}
            >
              {heroTitle}
            </h1>
            <p className={styles.lede}>{heroDetail}</p>
          </div>
          <Stagger className={styles.tasks} stagger={0.06}>
            {plan.tasks.map((task, index) => (
              <StaggerItem key={task.id}>
                <TaskRow
                  task={task}
                  index={index}
                  href={taskHref(task, {
                    reviewBase,
                    addressHref,
                    bookHref,
                    onOpenStep,
                  })}
                  onOpenStep={onOpenStep}
                />
              </StaggerItem>
            ))}
          </Stagger>
          {children ? <div className={styles.actions}>{children}</div> : null}
        </section>
      </FadeIn>

      {!collection.addressConfirmed && (
        <FadeIn delay={0.08}>
          <section
            className={styles.callout}
            aria-labelledby="address-callout-heading"
          >
            <div>
              <p className={styles.kicker}>Still needed</p>
              <h2 id="address-callout-heading">
                Add {name}&apos;s mailing address
              </h2>
              <p>
                This is the step that lets postcards leave your hands. Add the
                address, then open the gift the way {name} will see it.
              </p>
              <div className={styles.calloutActions}>
                <a className={fd.primaryButton} href={addressHref}>
                  Add mailing address
                  <AppIcon name="arrowRight" size={18} />
                </a>
                {collection.status === "approved" ? (
                  <a className={fd.secondaryButton} href={previewHref}>
                    See it as {name} will
                    <AppIcon name="arrowUpRight" size={18} />
                  </a>
                ) : onOpenStep ? (
                  <button
                    type="button"
                    className={fd.secondaryButton}
                    onClick={() => onOpenStep(2)}
                  >
                    See it as {name} will
                  </button>
                ) : (
                  <a
                    className={fd.secondaryButton}
                    href={`${reviewBase}#review/approve`}
                  >
                    See it as {name} will
                    <AppIcon name="arrowUpRight" size={18} />
                  </a>
                )}
              </div>
              {collection.status !== "approved" && (
                <p>
                  Their chapter view opens after you approve the gift. This step
                  takes you there next.
                </p>
              )}
            </div>
          </section>
        </FadeIn>
      )}

      <FadeIn delay={0.12}>
        <section
          className={styles.card}
          id="download-ebook"
          aria-labelledby="ebook-heading"
        >
          <p className={styles.kicker}>Your keepsake</p>
          <h2 id="ebook-heading">Download your e-book</h2>
          <p>
            {plan.hasBook
              ? collection.status === "approved"
                ? "A PDF of your stories, with each question, theme, and a way back to the chapter."
                : "Preview the story book while you review. The download updates when you approve."
              : "The e-book is created from your four stories. It will be ready to download here."}
          </p>
          {plan.hasBook ? (
            <div className={styles.calloutActions}>
              <a className={fd.primaryButton} href={bookHref}>
                <AppIcon name="download" size={18} />
                {collection.status === "approved"
                  ? "Download your e-book"
                  : "Download a preview"}
              </a>
            </div>
          ) : null}
        </section>
      </FadeIn>

      <FadeIn delay={0.16}>
        <GiftPreview
          collection={collection}
          accessKey={accessKey}
          libraryHref={libraryHref}
          previewHref={previewHref}
          onOpenStep={onOpenStep}
          onOpenChapter={onOpenChapter}
          reviewBase={reviewBase}
        />
      </FadeIn>
    </div>
  );
}

function taskHref(
  task: StorytellerTask,
  links: {
    reviewBase: string;
    addressHref: string;
    bookHref: string;
    onOpenStep?: (step: 0 | 1 | 2) => void;
  },
) {
  if (task.state === "upcoming") return undefined;
  if (task.id === "address") return links.addressHref;
  if (task.id === "ebook") return links.bookHref;
  if (task.id === "approved" || task.id === "prepared")
    return links.onOpenStep
      ? undefined
      : `${links.reviewBase}#review/chapter/q1`;
  return undefined;
}

function TaskRow({
  task,
  index,
  href,
  onOpenStep,
}: {
  task: StorytellerTask;
  index: number;
  href?: string;
  onOpenStep?: (step: 0 | 1 | 2) => void;
}) {
  const className = `${styles.task} ${styles[task.state] || ""}`;
  const body = (
    <>
      <span className={styles.mark} aria-hidden="true">
        {task.state === "done" ? "✓" : index + 1}
      </span>
      <span>
        <span className={styles.taskTitle}>{task.title}</span>
        <span className={styles.taskDetail}>{task.detail}</span>
      </span>
    </>
  );
  if (
    onOpenStep &&
    (task.id === "approved" || task.id === "prepared") &&
    task.state !== "upcoming"
  ) {
    return (
      <button
        type="button"
        className={className}
        onClick={() => onOpenStep(task.id === "approved" ? 2 : 0)}
      >
        {body}
      </button>
    );
  }
  if (href) {
    return (
      <a className={className} href={href}>
        {body}
      </a>
    );
  }
  return <div className={className}>{body}</div>;
}

function GiftPreview({
  collection,
  accessKey,
  libraryHref,
  previewHref,
  onOpenStep,
  onOpenChapter,
  reviewBase,
}: {
  collection: CollectionView;
  accessKey: string;
  libraryHref: string;
  previewHref: string;
  onOpenStep?: (step: 0 | 1 | 2) => void;
  onOpenChapter?: (chapterId: string) => void;
  reviewBase: string;
}) {
  const [cards, setCards] = useState<PostcardProofSnapshot["cards"] | null>(
    null,
  );
  useEffect(() => {
    if (collection.chapters.length !== 4 || !accessKey) return;
    const controller = new AbortController();
    void collectionRequest<{ proof?: PostcardProofSnapshot }>(
      `/api/collection/${encodeURIComponent(collection.id)}/postcard-proof?key=${encodeURIComponent(accessKey)}&preview=1`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) setCards(result.proof?.cards ?? null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCards(null);
      });
    return () => controller.abort();
  }, [
    accessKey,
    collection.id,
    collection.updatedAt,
    collection.chapters.length,
  ]);

  const chapters = collection.chapters.length ? collection.chapters : [];

  return (
    <section
      className={styles.preview}
      id="gift-preview"
      aria-labelledby="preview-heading"
    >
      <div className={styles.previewHead}>
        <div>
          <p className={styles.kicker}>A look at the gift</p>
          <h2 id="preview-heading">Postcards and stories</h2>
        </div>
        <div className={styles.calloutActions}>
          {collection.status === "approved" && collection.addressConfirmed && (
            <a className={fd.secondaryButton} href={previewHref}>
              See it as {collection.recipient.name?.trim() || "your recipient"}{" "}
              will
            </a>
          )}
          {chapters.length > 0 &&
            (onOpenStep ? (
              <button
                type="button"
                className={fd.secondaryButton}
                onClick={() => onOpenStep(1)}
              >
                Personalize postcards
              </button>
            ) : (
              <a
                className={fd.secondaryButton}
                href={`${reviewBase}#review/postcards`}
              >
                Personalize postcards
              </a>
            ))}
        </div>
      </div>
      <p className={styles.sectionNote}>
        The postcards and films live here, apart from the steps above. Nothing
        is mailed until you approve the printed cards.
      </p>
      {chapters.length === 0 ? (
        <p className={styles.sectionNote}>
          Your postcard drafts and story films will show up in this section when
          preparation finishes.
        </p>
      ) : (
        <>
          <h3 className={styles.sectionLabel}>Postcards</h3>
          <div className={styles.strip}>
            {chapters.map((chapter, index) => {
              const artwork = cards?.find(
                (card) => card.chapterId === chapter.id,
              );
              const message = publicPostcardMessage(collection, chapter.id);
              return (
                <article key={chapter.id} className={styles.tile}>
                  {artwork ? (
                    <div className={styles.face}>
                      <PostcardFace
                        html={artwork.front}
                        title={`${STORY_THEMES[chapter.id] || chapter.title} postcard`}
                        trim
                      />
                    </div>
                  ) : (
                    <div className={styles.filmStage}>
                      <SiriOrb
                        size={64}
                        animationDuration={18}
                        colors={{ bg: "#432e23" }}
                      />
                    </div>
                  )}
                  <div className={styles.tileBody}>
                    <p className={styles.tileLabel}>
                      {STORY_THEMES[chapter.id] || `Postcard ${index + 1}`}
                    </p>
                    <h3 className={styles.tileTitle}>{chapter.title}</h3>
                    <p className={styles.tileNote}>{message}</p>
                  </div>
                </article>
              );
            })}
          </div>
          <h3 className={styles.sectionLabel}>Stories and films</h3>
          <div className={styles.strip}>
            {chapters.map((chapter) => (
              <article key={`${chapter.id}-film`} className={styles.tile}>
                {chapter.playback && hasChapterPlayback(chapter) ? (
                  <StoryFilmPlayer
                    title={chapter.title}
                    storytellerName={collection.storyteller.name}
                    src={mediaPath(
                      collection.id,
                      chapter.playback.mediaId,
                      accessKey,
                    )}
                    playback={chapter.playback}
                    preload="none"
                  />
                ) : hasRecordedVoiceFilm(chapter) ? (
                  <StoryMediaPlayer
                    label={chapter.title}
                    src={mediaPath(
                      collection.id,
                      chapter.videoMediaId,
                      accessKey,
                    )}
                    preload="metadata"
                  />
                ) : (
                  <div className={styles.filmStage}>
                    <SiriOrb
                      size={72}
                      animationDuration={18}
                      colors={{
                        bg: "#432e23",
                        c1: "#e5c8bb",
                        c2: "#dadecf",
                        c3: "#c18f7b",
                      }}
                    />
                  </div>
                )}
                <div className={styles.tileBody}>
                  <p className={styles.tileLabel}>
                    {STORY_THEMES[chapter.id] || "Story"}
                  </p>
                  <h3 className={styles.tileTitle}>{chapter.title}</h3>
                  <a
                    className={styles.library}
                    href={`${reviewBase}#review/chapter/${chapter.id}`}
                    onClick={
                      onOpenChapter
                        ? (event) => {
                            event.preventDefault();
                            onOpenChapter(chapter.id);
                          }
                        : undefined
                    }
                  >
                    Open this story
                  </a>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      {collection.status === "approved" && (
        <a className={styles.library} href={libraryHref}>
          Open my story library
        </a>
      )}
    </section>
  );
}
