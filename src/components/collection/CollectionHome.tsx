"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Review from "./Review";
import { AppIcon } from "@/components/icons";
import { PortalError, PortalShell, isNarratedFilm } from "./PortalUI";
import { BrandPattern } from "@/components/BrandPattern";
import { useCollection } from "./useCollection";
import SavedRecorder from "./SavedRecorder";
import { StoryMediaPlayer } from "./StoryOriginalPreview";
import { recipientReplyDraftKey } from "./recipient-sharing";
import { getTextDraft, saveTextDraft } from "@/lib/collection/local-takes";
import type { ChapterPackage, CollectionView } from "@/lib/collection/types";
const primary =
  "brand-button-primary inline-flex min-h-12 items-center justify-center px-5 py-3 disabled:opacity-50";
const secondary =
  "brand-button-secondary inline-flex min-h-12 items-center justify-center px-5 py-3 disabled:opacity-50";
const date = (s: string) =>
  new Date(s).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
const normalizedCopy = (text: string) =>
  text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
function ReplyForm({
  c,
  chapter,
  accessKey,
  act,
  activeRecorderChapter,
  recordingChapter,
  onOpenRecorder,
  onRecorderBusyChange,
  revealed,
}: {
  c: CollectionView;
  revealed: boolean;
  chapter: ChapterPackage;
  accessKey: string;
  act: (v: unknown) => Promise<CollectionView | null>;
  activeRecorderChapter: string | null;
  recordingChapter: string | null;
  onOpenRecorder: (chapterId: string) => void;
  onRecorderBusyChange: (chapterId: string, busy: boolean) => void;
}) {
  const [mode, setMode] = useState<"video" | "text" | null>("text"),
    [text, setText] = useState(""),
    [mediaId, setMediaId] = useState(""),
    [replyId, setReplyId] = useState(() => crypto.randomUUID()),
    [busy, setBusy] = useState(false),
    [recording, setRecording] = useState(false),
    [sent, setSent] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftNotice, setDraftNotice] = useState("");
  const [sendError, setSendError] = useState("");
  const draftKey = recipientReplyDraftKey(
    c.recipientId,
    c.recipient.email,
    chapter.id,
  );
  const draftQueue = useRef<Promise<void>>(Promise.resolve());
  const persist = useCallback(
    (value: string) => {
      const next = draftQueue.current
        .catch(() => {})
        .then(() => saveTextDraft(c.id, draftKey, value));
      draftQueue.current = next;
      return next;
    },
    [c.id, draftKey],
  );
  const currentDraft = useRef("");
  currentDraft.current = JSON.stringify({ text, mediaId, replyId });
  useEffect(() => {
    let alive = true;
    void getTextDraft(c.id, draftKey)
      .then(
        async (value) =>
          value ||
          (c.isPrimaryRecipient
            ? await getTextDraft(c.id, `recipient-reply:${chapter.id}`)
            : ""),
      )
      .then((value) => {
        if (!alive || !value) return;
        const saved = JSON.parse(value);
        if (
          typeof saved.text !== "string" ||
          saved.text.length > 30000 ||
          typeof saved.mediaId !== "string" ||
          typeof saved.replyId !== "string"
        )
          return;
        if (c.replies.some((reply) => reply.id === saved.replyId)) return;
        if (!saved.text.trim() && !saved.mediaId) return;
        setText(saved.text);
        setMediaId(saved.mediaId);
        setReplyId(saved.replyId);
        setMode(saved.mediaId ? "video" : "text");
        setDraftNotice(
          "Your unfinished message was restored from this device. It has not been sent.",
        );
      })
      .catch(() => {
        if (alive)
          setDraftNotice(
            "A device copy is unavailable. Keep this page open until your message is sent.",
          );
      })
      .finally(() => {
        if (alive) setDraftReady(true);
      });
    return () => {
      alive = false;
    };
    // Restore once, never overwrite text in response to a background collection refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.id, draftKey]);
  useEffect(() => {
    if (!draftReady) return;
    const timer = setTimeout(
      () =>
        void persist(currentDraft.current).catch(() =>
          setDraftNotice(
            "A device copy could not be saved. Keep this page open until your message is sent.",
          ),
        ),
      300,
    );
    return () => clearTimeout(timer);
  }, [text, mediaId, replyId, draftReady, persist]);
  useEffect(() => {
    if (!draftReady) return;
    // Same-app navigation can unmount before the debounce, without a beforeunload event.
    return () => {
      void persist(currentDraft.current).catch(() => {});
    };
  }, [draftReady, persist]);
  useEffect(() => {
    if (!draftReady) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (text.trim() || mediaId || recording || busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [text, mediaId, recording, busy, draftReady]);
  const anotherRecording = Boolean(
    recordingChapter && recordingChapter !== chapter.id,
  );
  const handleRecorderBusy = useCallback(
    (value: boolean) => {
      setRecording(value);
      onRecorderBusyChange(chapter.id, value);
    },
    [chapter.id, onRecorderBusyChange],
  );

  async function send() {
    if (busy || recording || !draftReady || (!text.trim() && !mediaId)) return;
    setBusy(true);
    setSendError("");
    await persist(currentDraft.current).catch(() => {});
    const next = await act({
      action: "reply",
      chapterId: chapter.id,
      text,
      mediaId: mediaId || undefined,
      replyId,
    });
    setBusy(false);
    if (next) {
      const savedReply = next.replies.find((reply) => reply.id === replyId);
      if (
        savedReply &&
        (savedReply.text.trim() !== text.trim() ||
          (savedReply.mediaId || "") !== mediaId)
      ) {
        setReplyId(crypto.randomUUID());
        setSendError(
          "Your earlier message was already saved. Your newer changes are still here. Send them as a new message when you are ready.",
        );
        return;
      }
      setSent(true);
      setText("");
      setMediaId("");
      setMode(null);
      setReplyId(crypto.randomUUID());
      setDraftNotice("");
      await persist("").catch(() => {});
    } else {
      setSendError(
        "Your message could not be confirmed. Your words and recording are still here. Check your connection, then try Send again.",
      );
    }
  }
  return (
    <section
      id={`reply-form-${chapter.id}`}
      hidden={!revealed && !text.trim() && !mediaId && !sent}
      className="mt-8 rounded-xl border border-sage-200 bg-sage-50 p-5 sm:p-6"
      aria-label={`Reply to ${chapter.title}`}
    >
      {revealed && (
        <p role="status" className="sr-only">
          You can now reply to this story.
        </p>
      )}
      <h3 className="font-serif text-2xl">
        Send a message to {c.storyteller.name}.
      </h3>
      <p className="my-4 leading-relaxed text-ink-500">
        What would you like them to know after this story? A memory, a question
        or a simple thank-you is enough.
      </p>
      {sent && (
        <p role="status" className="mb-4 rounded-md bg-paper-200 p-4">
          Your message is saved here. An email notification is waiting to send
          to {c.storyteller.name}.
        </p>
      )}
      <div className="mb-5 flex flex-wrap gap-3">
        <button
          className={mode === "video" ? primary : secondary}
          disabled={!draftReady || busy || recording || anotherRecording}
          onClick={() => {
            setMode("video");
            onOpenRecorder(chapter.id);
          }}
        >
          Record a video
        </button>
        <button
          className={mode === "text" ? primary : secondary}
          disabled={!draftReady || busy || recording}
          onClick={() => setMode("text")}
        >
          Write a message
        </button>
      </div>
      {anotherRecording && (
        <p role="status" className="mb-4 text-sm text-ink-500">
          Finish saving your recording for the other story before opening this
          camera.
        </p>
      )}
      {mode === "video" && activeRecorderChapter === chapter.id && (
        <SavedRecorder
          collectionId={c.id}
          accessKey={accessKey}
          kind="video"
          questionId={`reply-${c.recipientId || c.recipient.email}-${chapter.id}`}
          prompt={`A message for ${c.storyteller.name}`}
          directUpload={c.capabilities.directUpload}
          maxSeconds={180}
          suggestedDuration="A minute or two is enough. You can preview and try again before sending."
          onBusyChange={handleRecorderBusy}
          onMediaSaved={({ mediaId }) => setMediaId(mediaId)}
        />
      )}{" "}
      {mode && (
        <>
          <label className="mt-5 block">
            {mode === "video" ? "Add a note (optional)" : "Your message"}
            <textarea
              rows={4}
              maxLength={30000}
              disabled={busy || !draftReady}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="mt-2 w-full rounded-md border border-warmgray-300 bg-white p-4 text-base"
            />
          </label>
          {mediaId && (
            <div className="my-4 text-sm">
              <p>
                Your selected recording is backed up. It will be shared when you
                send this message.
              </p>
              <button
                type="button"
                className="mt-3 min-h-12 text-base text-oxblood underline"
                disabled={busy}
                onClick={() => setMediaId("")}
              >
                Remove video from this reply
              </button>
            </div>
          )}
          <button
            className={`${primary} mt-4`}
            disabled={busy || recording || (!text.trim() && !mediaId)}
            onClick={() => void send()}
          >
            {busy ? "Sending..." : "Send my message"}
          </button>
        </>
      )}
      <PortalError message={sendError} />
      {draftNotice && (
        <p role="status" className="mt-4 text-base leading-7 text-ink-500">
          {draftNotice}
        </p>
      )}
    </section>
  );
}
export default function CollectionHome({
  id,
  accessKey,
  chapterId,
}: {
  id: string;
  accessKey: string;
  chapterId?: string;
}) {
  const { collection: c, error, act, load } = useCollection(id, accessKey);
  const [activeChapter, setActiveChapter] = useState(chapterId || "q1");
  const [replyRevealed, setReplyRevealed] = useState<Record<string, boolean>>(
    {},
  );
  const seen = useRef(new Set<string>());
  const [activeRecorderChapter, setActiveRecorderChapter] = useState<
    string | null
  >(null);
  const [recordingChapter, setRecordingChapter] = useState<string | null>(null);
  const chapters = useRef<HTMLDivElement>(null);
  const focusSelectedStory = useRef(false);
  // Opening an approved story counts as a visit for readers as well as viewers.
  useEffect(() => {
    if (c?.role !== "recipient" || c.status !== "approved") return;
    const opened =
      c.chapters.find((chapter) => chapter.id === activeChapter)?.id ||
      c.chapters[0]?.id;
    const visitKey = `${c.id}:${c.recipientId || c.recipient.email}:${opened}`;
    if (!opened || seen.current.has(visitKey)) return;
    seen.current.add(visitKey);
    void act({ action: "view_chapter", chapterId: opened }).then((result) => {
      if (!result) seen.current.delete(visitKey);
    });
  }, [
    c?.id,
    c?.recipientId,
    c?.recipient.email,
    c?.role,
    c?.status,
    activeChapter,
    act,
  ]);

  const handleRecorderBusyChange = useCallback(
    (chapter: string, busy: boolean) =>
      setRecordingChapter((current) =>
        busy ? chapter : current === chapter ? null : current,
      ),
    [],
  );
  const url = (mediaId: string) =>
    `/api/collection/${encodeURIComponent(id)}/media/${encodeURIComponent(mediaId)}?key=${encodeURIComponent(accessKey)}`;
  useEffect(() => {
    chapters.current
      ?.querySelectorAll("article[hidden] video,article[hidden] audio")
      .forEach((media) => (media as HTMLMediaElement).pause());
    if (focusSelectedStory.current) {
      focusSelectedStory.current = false;
      const article = chapters.current?.querySelector<HTMLElement>(
        "article:not([hidden])",
      );
      article?.focus({ preventScroll: true });
      article?.scrollIntoView({ block: "start" });
    }
  }, [activeChapter]);
  if (!c)
    return (
      <PortalShell>
        <h1 className="mt-10 text-3xl font-medium">Your story collection</h1>
        <PortalError message={error} />
        {!error ? (
          <p role="status" className="mt-5 text-lg text-ink-500">
            Opening your stories…
          </p>
        ) : (
          <button
            type="button"
            className={secondary}
            onClick={() => void load()}
          >
            Try again
          </button>
        )}
      </PortalShell>
    );
  if (c.role === "owner") return <Review id={id} accessKey={accessKey} />;
  const collectionPath =
    c.role === "recipient"
      ? `/collection/${encodeURIComponent(id)}${c.status === "approved" && /^q[1-4]$/.test(activeChapter) ? `/chapter/${activeChapter}` : ""}`
      : `/collection/${encodeURIComponent(id)}${accessKey ? `?key=${encodeURIComponent(accessKey)}` : ""}`;
  if (c.role === "requester")
    return (
      <PortalShell collectionPath={collectionPath}>
        <section className="mx-auto max-w-2xl rounded-[28px] border border-warmgray-200 bg-white p-6 sm:p-9">
          <p className="brand-eyebrow text-taupe-600">Your invitation</p>
          <h1 className="mt-4 text-3xl font-medium leading-tight">
            Your request for {c.storyteller.name}’s stories is saved.
          </h1>
          <p className="mt-5 text-lg leading-8">
            {c.status === "approved"
              ? `${c.storyteller.name} has approved their collection.`
              : c.status === "draft"
                ? `${c.storyteller.name}’s story drafts are ready for review.`
                : c.status === "recording"
                  ? `${c.storyteller.name} has started answering the questions.`
                  : `Waiting for ${c.storyteller.name} to begin.`}
          </p>
          <p className="mt-4 text-base leading-7 text-ink-500">
            They choose what to share and review everything first. This page
            shows progress on your request. Their unfinished answers remain
            private.
          </p>
        </section>
      </PortalShell>
    );
  if (c.status !== "approved")
    return (
      <PortalShell collectionPath={collectionPath}>
        <section className="mx-auto max-w-2xl rounded-[28px] border border-warmgray-200 bg-white p-6 sm:p-9">
          <p className="brand-eyebrow text-taupe-600">A gift is taking shape</p>
          <h1 className="mt-4 text-3xl font-medium leading-tight">
            {c.storyteller.name} is preparing your stories.
          </h1>
          <p className="mt-5 text-lg leading-8 text-ink-500">
            All four stories will appear here after they have been reviewed and
            approved. You can return to this same private link.
          </p>
          <button className={`${secondary} mt-6`} onClick={() => void load()}>
            Check for approved stories
          </button>
        </section>
      </PortalShell>
    );
  const selectedId = c.chapters.some((chapter) => chapter.id === activeChapter)
    ? activeChapter
    : c.chapters[0]?.id;
  const selectedIndex = c.chapters.findIndex(
    (chapter) => chapter.id === selectedId,
  );
  const filmCount = c.chapters.filter((chapter) => chapter.videoMediaId).length;
  const coverFilm = c.chapters.find(
    (chapter) =>
      chapter.videoMediaId &&
      chapter.film?.narrationKind === "original_recording" &&
      chapter.film.presentation === "video",
  );
  const revealReply = (chapterId: string, focus = false) => {
    setReplyRevealed((current) => ({ ...current, [chapterId]: true }));
    if (focus)
      requestAnimationFrame(() =>
        document
          .getElementById(`reply-form-${chapterId}`)
          ?.querySelector("textarea")
          ?.focus(),
      );
  };
  const openAdjacentStory = (nextId: string) => {
    if (recordingChapter) return;
    focusSelectedStory.current = true;
    setActiveChapter(nextId);
  };
  const storyNavigation = (label: string) => (
    <nav
      aria-label={label}
      className="my-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warmgray-300 bg-white p-4 text-espresso sm:p-5"
    >
      <p className="w-full text-center text-base font-semibold sm:order-2 sm:w-auto">
        Story {selectedIndex + 1} of {c.chapters.length}
      </p>
      <button
        type="button"
        className={`${secondary} flex-1 gap-2 text-base sm:order-1 sm:flex-none`}
        disabled={Boolean(recordingChapter) || selectedIndex <= 0}
        onClick={() => openAdjacentStory(c.chapters[selectedIndex - 1].id)}
      >
        <AppIcon name="arrowRight" size={20} className="rotate-180" />
        Previous story
      </button>
      <button
        type="button"
        className={`${primary} flex-1 gap-2 text-base sm:order-3 sm:flex-none`}
        disabled={
          Boolean(recordingChapter) ||
          selectedIndex < 0 ||
          selectedIndex >= c.chapters.length - 1
        }
        onClick={() => openAdjacentStory(c.chapters[selectedIndex + 1].id)}
      >
        Next story <AppIcon name="arrowRight" size={20} />
      </button>
    </nav>
  );
  return (
    <PortalShell collectionPath={collectionPath}>
      <header className="overflow-hidden rounded-[28px] border border-warmgray-200 bg-paper-100 lg:grid lg:grid-cols-[.8fr_1.2fr]">
        <div className="relative flex min-h-64 items-center justify-center overflow-hidden bg-clay-50 p-8 text-center">
          {coverFilm?.videoMediaId ? (
            <video
              className="absolute inset-0 h-full w-full object-cover"
              src={`${url(coverFilm.videoMediaId)}#t=0.1`}
              muted
              playsInline
              preload="metadata"
              aria-label={`A still from ${c.storyteller.name}'s recorded story`}
            />
          ) : (
            <BrandPattern
              variant="weave"
              className="absolute w-4/5 max-w-sm opacity-20"
            />
          )}
          <div className="relative rounded-2xl bg-paper/95 px-7 py-6 text-espresso">
            <p className="text-sm font-medium uppercase tracking-widest">
              Stories from
            </p>
            <p className="mt-3 font-display text-4xl font-semibold leading-tight sm:text-5xl">
              {c.storyteller.name}
            </p>
          </div>
        </div>
        <div className="p-6 text-espresso sm:p-9">
          <p className="brand-eyebrow text-taupe-600">
            Your private collection
          </p>
          <h1 className="mt-4 max-w-3xl font-display text-3xl font-medium leading-tight sm:text-4xl">
            {c.recipient.name?.trim()
              ? `${c.recipient.name}, these stories are for you.`
              : "These stories are for you."}
          </h1>
          {!c.recipient.name?.trim() && (
            <p className="mt-3 break-words text-base text-ink-500">
              Invited as {c.recipient.email}
            </p>
          )}
          <p className="mt-5 max-w-2xl text-lg leading-8 text-ink-700">
            Four stories from {c.storyteller.name}, saved for you to return to
            in your own time. Watch or listen, then send a message after any
            story.
          </p>
          <p className="mt-5 text-base font-medium">
            {filmCount} {filmCount === 1 ? "film" : "films"} ·{" "}
            {c.chapters.length} stories
          </p>
          <a
            className={`${secondary} mt-6 gap-2`}
            href={`/api/collection/${encodeURIComponent(id)}/book${accessKey ? `?key=${encodeURIComponent(accessKey)}` : ""}`}
          >
            <AppIcon name="download" size={20} /> Download the story book (PDF)
          </a>
        </div>
      </header>
      <nav
        aria-label="Choose a story"
        className="my-7 grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {c.chapters.map((chapter, index) => (
          <button
            type="button"
            key={chapter.id}
            disabled={Boolean(recordingChapter)}
            aria-current={selectedId === chapter.id ? "page" : undefined}
            onClick={() => {
              setActiveChapter(chapter.id);
            }}
            className={`min-h-28 rounded-2xl border p-4 text-left transition-colors disabled:opacity-60 ${selectedId === chapter.id ? "border-espresso bg-espresso text-paper" : "border-warmgray-300 bg-white text-espresso hover:border-espresso"}`}
          >
            <span className="text-base font-medium">Story {index + 1}</span>
            <span className="mt-2 block font-display text-lg font-semibold leading-7">
              {chapter.title}
            </span>
            <span className="mt-3 flex items-center gap-2 text-base">
              <AppIcon
                name={chapter.videoMediaId ? "play" : "collection"}
                size={18}
              />
              {chapter.videoMediaId ? "Video and story" : "Written story"}
            </span>
          </button>
        ))}
      </nav>
      {storyNavigation("Move between stories")}
      {recordingChapter && (
        <p role="status" className="mb-5 text-sm leading-7 text-ink-500">
          Finish saving your reply recording before moving to another story.
        </p>
      )}
      <div ref={chapters}>
        {c.chapters.map((chapter, chapterIndex) => {
          const blessing = c.chapterBlessings[chapter.id];
          return (
            <article
              key={chapter.id}
              hidden={selectedId !== chapter.id}
              tabIndex={-1}
              className="scroll-mt-5 focus:outline-none"
              aria-label={chapter.title}
              onPlayCapture={(event) => {
                chapters.current
                  ?.querySelectorAll("video,audio")
                  .forEach((media) => {
                    if (media !== event.target)
                      (media as HTMLMediaElement).pause();
                  });
              }}
            >
              <div className="grid items-start gap-7 lg:grid-cols-[1fr_.9fr]">
                <div className="min-w-0 lg:sticky lg:top-6">
                  <div className="overflow-hidden rounded-2xl border border-warmgray-200 bg-white">
                    {chapter.videoMediaId ? (
                      <>
                        <h2 className="px-5 pb-4 pt-5 text-2xl font-semibold text-espresso">
                          Watch this story
                        </h2>
                        <StoryMediaPlayer
                          key={chapter.videoMediaId}
                          preload={
                            selectedId === chapter.id ? "metadata" : "none"
                          }
                          label={`Story film: ${chapter.title}`}
                          src={url(chapter.videoMediaId)}
                          onEnded={() => revealReply(chapter.id)}
                        />
                        <p className="p-5 text-base leading-7 text-espresso">
                          {isNarratedFilm(chapter)
                            ? `An AI voice reads ${c.storyteller.name}’s approved story. This is a narrated film, not their original recording.`
                            : `Hear ${c.storyteller.name} in their own recorded voice.`}
                        </p>
                      </>
                    ) : (
                      <div className="bg-paper-200 p-8 text-espresso">
                        <AppIcon
                          name="collection"
                          size={32}
                          className="text-sage-700"
                        />
                        <p className="mt-5 font-display text-2xl font-medium">
                          A written story from {c.storyteller.name}.
                        </p>
                        <p className="mt-3 text-base leading-7 text-espresso">
                          Take your time with the words below.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="min-w-0 rounded-2xl border border-warmgray-200 bg-white p-6 sm:p-8">
                  <p className="brand-eyebrow text-taupe-600">
                    Story {chapterIndex + 1} of {c.chapters.length}
                  </p>
                  <h2 className="mt-4 text-3xl font-medium leading-tight">
                    {chapter.title}
                  </h2>
                  {normalizedCopy(chapter.postcardNote) &&
                    normalizedCopy(chapter.postcardNote) !==
                      normalizedCopy(chapter.content) && (
                      <p className="mt-5 text-lg leading-8 text-ink-500">
                        {chapter.postcardNote}
                      </p>
                    )}
                  <div className="mt-6 whitespace-pre-wrap text-[18px] leading-9 text-espresso">
                    {chapter.content}
                  </div>
                  {blessing &&
                    (blessing.encouragement ||
                      blessing.scriptureText ||
                      blessing.scriptureReference) && (
                      <aside className="mt-7 rounded-2xl bg-clay-50 p-5">
                        <p className="brand-eyebrow text-taupe-600">
                          A word for you
                        </p>
                        {blessing.encouragement && (
                          <p className="mt-4 text-lg leading-8">
                            {blessing.encouragement}
                          </p>
                        )}
                        {blessing.scriptureText && (
                          <blockquote className="mt-4 text-lg leading-8">
                            {blessing.scriptureText}
                          </blockquote>
                        )}
                        <p className="mt-3 text-sm text-ink-500">
                          {blessing.scriptureReference}{" "}
                          {blessing.scriptureTranslation}
                        </p>
                      </aside>
                    )}
                  {c.replies
                    .filter((reply) => reply.chapterId === chapter.id)
                    .map((reply) => (
                      <section
                        key={reply.id}
                        className="mt-7 border-t border-warmgray-200 pt-6"
                      >
                        <h3 className="text-xl font-semibold">Your reply</h3>
                        <p className="mt-2 text-sm text-ink-500">
                          {date(reply.createdAt)}
                        </p>
                        {reply.mediaId && (
                          <StoryMediaPlayer
                            className="mt-4"
                            label={`Your reply about ${chapter.title}`}
                            src={url(reply.mediaId)}
                          />
                        )}
                        <p className="mt-4 whitespace-pre-wrap text-base leading-8">
                          {reply.text}
                        </p>
                      </section>
                    ))}
                </div>
                <div className="min-w-0 lg:col-span-2">
                  {!replyRevealed[chapter.id] && (
                    <div className="mt-5 flex flex-wrap items-center gap-4">
                      <p className="text-base leading-7 text-ink-500">
                        A reply box opens when this film finishes. You can also
                        reply at any time.
                      </p>
                      <button
                        type="button"
                        className={secondary}
                        aria-controls={`reply-form-${chapter.id}`}
                        onClick={() => revealReply(chapter.id, true)}
                      >
                        Reply to this story
                      </button>
                    </div>
                  )}
                  <ReplyForm
                    key={`${c.recipientId || c.recipient.email}:${chapter.id}`}
                    revealed={
                      Boolean(replyRevealed[chapter.id]) ||
                      !chapter.videoMediaId
                    }
                    c={c}
                    chapter={chapter}
                    accessKey={accessKey}
                    act={act}
                    activeRecorderChapter={activeRecorderChapter}
                    recordingChapter={recordingChapter}
                    onOpenRecorder={setActiveRecorderChapter}
                    onRecorderBusyChange={handleRecorderBusyChange}
                  />
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {storyNavigation("Continue through the collection")}
      <PortalError message={error} />
      {c.isPrimaryRecipient && (
        <details className="mt-8 rounded-2xl border border-warmgray-200 bg-white p-5">
          <summary className="min-h-11 cursor-pointer text-base font-medium">
            Reply reminders
          </summary>
          <label className="mt-3 flex items-start gap-3 text-base leading-7">
            <input
              className="mt-1 h-5 w-5"
              type="checkbox"
              checked={c.replyRemindersEnabled}
              onChange={(event) =>
                void act({
                  action: "reply_preferences",
                  enabled: event.target.checked,
                })
              }
            />
            <span>
              If postcards are mailed, send me a follow-up link with an
              invitation to reply.
            </span>
          </label>
        </details>
      )}
      <footer className="mt-10 border-t border-warmgray-200 py-6 text-sm leading-7 text-ink-500">
        This collection is shared with your verified email account. Your replies
        go to {c.storyteller.name}; other invited readers cannot see them.
      </footer>
    </PortalShell>
  );
}
