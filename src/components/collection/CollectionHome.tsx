"use client";
import { useCallback, useState } from "react";
import { Logo } from "@/components/Logo";
import { useCollection } from "./useCollection";
import SavedRecorder from "./SavedRecorder";
import type { ChapterPackage, CollectionView } from "@/lib/collection/types";
const primary =
  "inline-flex min-h-12 items-center justify-center rounded-md bg-oxblood px-5 py-3 text-white disabled:opacity-50";
const secondary =
  "inline-flex min-h-12 items-center justify-center rounded-md border border-warmgray-300 px-5 py-3 text-ink disabled:opacity-50";
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
    <section className="mt-8 border-t border-warmgray-300 pt-6">
      <h3 className="font-serif text-2xl">
        Send a message to {c.storyteller.name}.
      </h3>
      <p className="my-4 leading-relaxed text-ink-500">
        What would you like them to know after hearing this? A memory, a
        question or a simple thank-you is enough.
      </p>
      {sent && (
        <p role="status" className="mb-4 rounded-md bg-paper-200 p-4">
          Your message is saved. An email notification is queued for{" "}
          {c.storyteller.name}.
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
          Finish saving the recording in the other chapter before opening this
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
  const { collection: c, error, act } = useCollection(id, accessKey);
  const [all, setAll] = useState(!chapterId),
    [seen, setSeen] = useState<string[]>([]),
    [activeRecorderChapter, setActiveRecorderChapter] = useState<string | null>(
      null,
    ),
    [recordingChapter, setRecordingChapter] = useState<string | null>(null);
  const handleRecorderBusyChange = useCallback(
    (chapter: string, busy: boolean) => {
      setRecordingChapter((current) =>
        busy ? chapter : current === chapter ? null : current,
      );
    },
    [],
  );
  const url = (mediaId: string) =>
    `/api/collection/${id}/media/${mediaId}?key=${encodeURIComponent(accessKey)}`;
  if (!c)
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <Logo />
        <p className="mt-10" role="status">
          {error || "Opening your story..."}
        </p>
      </main>
    );
  if (c.role === "requester")
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <Logo />
        <h1 className="mt-10 font-serif text-3xl">
          Your story request is saved.
        </h1>
        <p className="my-5 text-lg leading-relaxed">
          The invitation for {c.storyteller.name} is queued.{" "}
          {c.capabilities.email
            ? "The delivery worker will send it."
            : "Email setup is still needed before the invitation can be sent."}
        </p>
        <p className="my-5">
          They will review their stories before sharing. The first postcard
          introduces the complete collection to {c.recipient.name}.
        </p>
        <p className="text-sm text-ink-500">
          Current status: {c.status}. This page tracks the request; it does not
          grant access to their unfinished interview.
        </p>
      </main>
    );
  if (c.status !== "approved")
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <Logo />
        <h1 className="mt-10 font-serif text-3xl">
          {c.role === "owner"
            ? "Your story is taking shape."
            : "Your story collection is being prepared."}
        </h1>
        <p className="my-5 text-lg">
          The complete collection appears here after the storyteller approves
          it.
        </p>
        {c.role === "owner" && (
          <a href={c.links?.review} className={primary}>
            Review my collection
          </a>
        )}
      </main>
    );
  const selected = all
    ? c.chapters
    : c.chapters.filter((ch) => ch.id === chapterId);
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Logo />
      <header className="mb-12 mt-12 border-b border-warmgray-300 pb-10">
        <p className="text-sm uppercase tracking-widest text-oxblood">
          A story from {c.storyteller.name}
        </p>
        <h1 className="mb-5 mt-4 max-w-2xl font-serif text-4xl leading-tight sm:text-5xl">
          For {c.recipient.name},<br />
          from a life worth sharing.
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-ink-500">
          Four stories, the values behind them, and encouragement to carry into
          your own life. The whole collection is here for you now.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <button
            className={primary}
            onClick={() => {
              setAll(true);
              document
                .getElementById("chapters")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Watch all now
          </button>
          <a
            href="#chapters"
            className={secondary}
            onClick={() => setAll(true)}
          >
            Read the four chapters
          </a>
        </div>
        <p className="mt-4 text-sm text-ink-500">
          You do not need to wait for the next postcard. Every card returns to
          this same collection.
        </p>
      </header>
      {c.role === "owner" && (
        <section className="mb-10 rounded-xl border border-warmgray-300 bg-paper-50 p-6">
          <h2 className="font-serif text-2xl">Your gift’s journey</h2>
          <p className="my-4 text-sm leading-relaxed">
            Approval schedules the first card, then months 3, 6 and 9. Confirmed
            mailing starts the two-week follow-up email. A schedule or print
            submission does not confirm delivery.
          </p>
          <ol className="space-y-3">
            {c.deliveries.map((d, i) => (
              <li
                key={d.chapterId}
                className="flex flex-wrap justify-between gap-3 border-t border-warmgray-200 pt-3"
              >
                <span>
                  Card {i + 1} · {date(d.scheduledFor)}
                </span>
                <span className="font-medium">
                  {d.status}
                  {d.mailedAt ? ` ${date(d.mailedAt)}` : ""}
                </span>
                {d.error && (
                  <p className="w-full text-sm text-red-800">{d.error}</p>
                )}
              </li>
            ))}
          </ol>
          {(!c.capabilities.mail || !c.capabilities.email) && (
            <p className="mt-5 rounded-md bg-paper-200 p-4 text-sm">
              Provider setup is incomplete.{" "}
              {c.capabilities.mail
                ? ""
                : "Postcard delivery needs Lob configuration. "}
              {c.capabilities.email ? "" : "Email needs Resend configuration. "}
              Scheduled items have not been sent.
            </p>
          )}
          <details className="mt-5">
            <summary>Private recipient link</summary>
            <p className="mt-3 break-all text-sm">
              {typeof window === "undefined" ? "" : window.location.origin}
              {c.links?.collection}
            </p>
            <p className="mt-2 text-sm">
              The first postcard normally introduces this link. Anyone you share
              it with can open the collection.
            </p>
          </details>
          <details className="mt-5">
            <summary>Email status</summary>
            <ul className="mt-3 space-y-2 text-sm">
              {c.notifications.map((n) => (
                <li key={n.id}>
                  {n.subject}: {n.status}
                  {n.error ? ` (${n.error})` : ""}
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
      <nav
        aria-label="Story chapters"
        className="mb-10 grid gap-3 sm:grid-cols-2"
      >
        {c.chapters.map((ch, i) => (
          <a
            key={ch.id}
            href={`/collection/${id}/chapter/${ch.id}?key=${encodeURIComponent(accessKey)}`}
            className="rounded-lg border border-warmgray-300 px-5 py-4"
          >
            <span className="text-sm text-oxblood">Chapter {i + 1}</span>
            <span className="mt-1 block font-serif text-xl">{ch.title}</span>
          </a>
        ))}
      </nav>
      <div id="chapters" className="space-y-12">
        {selected.length === 0 && (
          <p>
            This chapter could not be found. Choose one of the four chapters
            above.
          </p>
        )}
        {selected.map((ch) => {
          const b = c.chapterBlessings[ch.id];
          return (
            <article
              id={ch.id}
              key={ch.id}
              className="scroll-mt-8 rounded-xl border border-warmgray-300 bg-paper-50 p-5 sm:p-8"
            >
              <p className="text-sm uppercase tracking-widest text-oxblood">
                Chapter {ch.id.slice(1)}
              </p>
              <h2 className="mb-5 mt-3 font-serif text-3xl">{ch.title}</h2>
              {ch.videoMediaId ? (
                <video
                  className="mb-6 w-full rounded-md bg-black"
                  controls
                  playsInline
                  preload="metadata"
                  src={url(ch.videoMediaId)}
                  onPlay={() => {
                    if (!seen.includes(ch.id)) {
                      setSeen([...seen, ch.id]);
                      void act({ action: "view_chapter", chapterId: ch.id });
                    }
                  }}
                />
              ) : (
                <p className="mb-6 rounded-md bg-paper-200 p-4 text-sm">
                  This chapter was shared as a written story.
                </p>
              )}
              {normalizedCopy(ch.postcardNote) &&
                normalizedCopy(ch.postcardNote) !==
                  normalizedCopy(ch.content) && (
                  <p className="mb-6 text-lg leading-relaxed text-ink-500">
                    {ch.postcardNote}
                  </p>
                )}
              <div className="whitespace-pre-wrap font-serif text-xl leading-relaxed">
                {ch.content}
              </div>
              {b &&
                (b.encouragement ||
                  b.scriptureText ||
                  b.scriptureReference) && (
                  <aside className="mt-8 border-l-2 border-oxblood pl-5">
                    <p className="mb-3 text-sm uppercase tracking-widest text-oxblood">
                      A word for you
                    </p>
                    {b.encouragement && (
                      <p className="mb-4 text-lg leading-relaxed">
                        {b.encouragement}
                      </p>
                    )}
                    {b.scriptureText && (
                      <blockquote className="font-serif text-xl leading-relaxed">
                        {b.scriptureText}
                      </blockquote>
                    )}
                    <p className="mt-3 text-sm text-ink-500">
                      {b.scriptureReference} {b.scriptureTranslation}
                    </p>
                  </aside>
                )}
              {c.role === "recipient" && (
                <ReplyForm
                  c={c}
                  chapter={ch}
                  accessKey={accessKey}
                  act={act}
                  activeRecorderChapter={activeRecorderChapter}
                  recordingChapter={recordingChapter}
                  onOpenRecorder={setActiveRecorderChapter}
                  onRecorderBusyChange={handleRecorderBusyChange}
                />
              )}{" "}
              {c.replies
                .filter((r) => r.chapterId === ch.id)
                .map((r) => (
                  <section
                    key={r.id}
                    className="mt-8 border-t border-warmgray-300 pt-6"
                  >
                    <h3 className="font-serif text-xl">
                      A reply from {c.recipient.name}
                    </h3>
                    <p className="mb-3 mt-2 text-sm text-ink-500">
                      {date(r.createdAt)}
                    </p>
                    {r.mediaId && (
                      <video
                        controls
                        playsInline
                        className="w-full rounded-md bg-black"
                        src={url(r.mediaId)}
                      />
                    )}
                    <p className="mt-4 whitespace-pre-wrap leading-relaxed">
                      {r.text}
                    </p>
                  </section>
                ))}
            </article>
          );
        })}
      </div>
      {error && (
        <p className="my-6 text-red-800" role="alert">
          {error}
        </p>
      )}
      {c.role === "recipient" && (
        <label className="my-10 flex items-start gap-3 text-sm">
          <input
            className="mt-1"
            type="checkbox"
            checked={c.replyRemindersEnabled}
            onChange={(e) =>
              act({ action: "reply_preferences", enabled: e.target.checked })
            }
          />
          Send me a follow-up link after each postcard, with an invitation to
          reply.
        </label>
      )}
      <footer className="mt-12 border-t border-warmgray-300 py-8 text-sm text-ink-500">
        This collection is shared through a private link. Keep it with people
        you trust.
      </footer>
    </main>
  );
}
