"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Review from "./Review";
import { AppIcon } from "@/components/icons";
import { PortalError, PortalShell, isNarratedFilm } from "./PortalUI";
import { BrandPattern } from "@/components/BrandPattern";
import { useCollection } from "./useCollection";
import SavedRecorder from "./SavedRecorder";
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
}: {
  c: CollectionView;
  chapter: ChapterPackage;
  accessKey: string;
  act: (v: unknown) => Promise<CollectionView | null>;
  activeRecorderChapter: string | null;
  recordingChapter: string | null;
  onOpenRecorder: (chapterId: string) => void;
  onRecorderBusyChange: (chapterId: string, busy: boolean) => void;
}) {
  const [mode, setMode] = useState<"video" | "text" | null>(null),
    [text, setText] = useState(""),
    [mediaId, setMediaId] = useState(""),
    [replyId, setReplyId] = useState(() => crypto.randomUUID()),
    [busy, setBusy] = useState(false),
    [recording, setRecording] = useState(false),
    [sent, setSent] = useState(false);
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
    setBusy(true);
    const next = await act({
      action: "reply",
      chapterId: chapter.id,
      text,
      mediaId: mediaId || undefined,
      replyId,
    });
    setBusy(false);
    if (next) {
      setSent(true);
      setText("");
      setMediaId("");
      setMode(null);
      setReplyId(crypto.randomUUID());
    }
  }
  return (
    <section className="mt-8 rounded-xl border border-sage-200 bg-sage-50 p-5 sm:p-6">
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
          disabled={recording || anotherRecording}
          onClick={() => {
            setMode("video");
            onOpenRecorder(chapter.id);
          }}
        >
          Record a video
        </button>
        <button
          className={mode === "text" ? primary : secondary}
          disabled={recording}
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
          questionId={`reply-${chapter.id}`}
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
                className="mt-3 text-oxblood underline"
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
  const [seen, setSeen] = useState<string[]>([]);
  const [activeRecorderChapter, setActiveRecorderChapter] = useState<
    string | null
  >(null);
  const [recordingChapter, setRecordingChapter] = useState<string | null>(null);
  const chapters = useRef<HTMLDivElement>(null);
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
  if (c.role === "requester")
    return (
      <PortalShell>
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
      <PortalShell>
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
  return (
    <PortalShell>
      <header className="brand-gradient-chocolate relative isolate overflow-hidden rounded-[28px] p-6 text-white sm:p-9">
        <BrandPattern
          variant="ribbon"
          className="absolute -right-36 -top-20 -z-10 w-[600px] max-w-none text-white opacity-[0.06]"
        />
        <p className="brand-eyebrow text-white/75">
          Stories from {c.storyteller.name}
        </p>
        <h1 className="mt-4 max-w-3xl font-display text-3xl font-medium leading-tight text-white sm:text-5xl">
          {c.recipient.name}, these stories are for you.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-white/85">
          A life is made of many threads. Here are four from{" "}
          {c.storyteller.name}, saved for you to return to in your own time.
        </p>
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
            className={`min-h-28 rounded-2xl border p-4 text-left transition-colors disabled:opacity-60 ${selectedId === chapter.id ? "border-espresso bg-espresso text-white" : "border-warmgray-200 bg-white hover:border-taupe"}`}
          >
            <span
              className={`text-xs font-medium uppercase tracking-[.12em] ${selectedId === chapter.id ? "text-white/70" : "text-taupe-600"}`}
            >
              Story {index + 1}
            </span>
            <span className="mt-2 block font-display text-lg font-semibold leading-7">
              {chapter.title}
            </span>
          </button>
        ))}
      </nav>
      {recordingChapter && (
        <p role="status" className="mb-5 text-sm leading-7 text-ink-500">
          Finish saving your reply recording before moving to another story.
        </p>
      )}
      <div ref={chapters}>
        {c.chapters.map((chapter) => {
          const blessing = c.chapterBlessings[chapter.id];
          return (
            <article
              key={chapter.id}
              hidden={selectedId !== chapter.id}
              aria-label={chapter.title}
            >
              <div className="grid items-start gap-7 lg:grid-cols-[1fr_.9fr]">
                <div className="min-w-0 lg:sticky lg:top-6">
                  <div className="overflow-hidden rounded-2xl border border-warmgray-200 bg-white">
                    {chapter.videoMediaId ? (
                      <>
                        <video
                          className="aspect-video w-full bg-espresso"
                          controls
                          playsInline
                          preload={
                            selectedId === chapter.id ? "metadata" : "none"
                          }
                          aria-label={`Film: ${chapter.title}`}
                          src={url(chapter.videoMediaId)}
                          onPlay={() => {
                            if (!seen.includes(chapter.id)) {
                              setSeen((old) => [...old, chapter.id]);
                              void act({
                                action: "view_chapter",
                                chapterId: chapter.id,
                              });
                            }
                          }}
                        />
                        <p className="p-5 text-sm leading-7 text-ink-500">
                          {isNarratedFilm(chapter)
                            ? `An AI voice reads ${c.storyteller.name}’s approved story. This is a narrated film, not their original recording.`
                            : `A video shared by ${c.storyteller.name}.`}
                        </p>
                      </>
                    ) : (
                      <div className="bg-sage-100 p-8">
                        <AppIcon
                          name="collection"
                          size={32}
                          className="text-sage-700"
                        />
                        <p className="mt-5 font-display text-2xl font-medium">
                          A written story from {c.storyteller.name}.
                        </p>
                        <p className="mt-3 text-base leading-7 text-ink-500">
                          Take your time with the words below.
                        </p>
                      </div>
                    )}
                  </div>
                  <ReplyForm
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
                <div className="min-w-0 rounded-2xl border border-warmgray-200 bg-white p-6 sm:p-8">
                  <p className="brand-eyebrow text-taupe-600">
                    Story {chapter.id.slice(1)} of 4
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
                  <div className="mt-6 whitespace-pre-wrap text-[18px] leading-9 text-ink-600">
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
                          <video
                            controls
                            playsInline
                            preload="none"
                            className="mt-4 aspect-video w-full rounded-xl bg-espresso"
                            src={url(reply.mediaId)}
                          />
                        )}
                        <p className="mt-4 whitespace-pre-wrap text-base leading-8">
                          {reply.text}
                        </p>
                      </section>
                    ))}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <PortalError message={error} />
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
            If postcards are mailed, send me a follow-up link with an invitation
            to reply.
          </span>
        </label>
      </details>
      <footer className="mt-10 border-t border-warmgray-200 py-6 text-sm leading-7 text-ink-500">
        Anyone with this private link can open these approved stories. Share it
        only with people you trust.
      </footer>
    </PortalShell>
  );
}
