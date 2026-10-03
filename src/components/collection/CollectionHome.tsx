"use client";
import { useCallback, useState } from "react";
import { Logo } from "@/components/Logo";
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
const postcardStatus = {
  scheduled: "Scheduled",
  submitted: "Submitted for printing",
  mailed: "Mailed",
  failed: "Needs attention",
  returned: "Returned by the postal service",
} as const;
const emailStatus = {
  pending: "Waiting to send",
  sent: "Sent",
  failed: "Could not send",
  suppressed: "Not scheduled to send",
} as const;

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
      <main className="brand-page-shell mx-auto max-w-4xl px-5 py-8 sm:px-8">
        <Logo className="[&_svg]:h-11" />
        <p className="mt-10" role="status">
          {error || "Opening your story..."}
        </p>
      </main>
    );
  if (c.role === "requester")
    return (
      <main className="brand-page-shell mx-auto my-6 max-w-2xl rounded-2xl border border-warmgray-200 border-t-8 border-t-sage bg-white px-6 py-8 shadow-soft sm:my-10 sm:px-9">
        <Logo className="[&_svg]:h-11" />
        <h1 className="mt-10 font-serif text-3xl">
          Your request for {c.storyteller.name}’s stories is saved.
        </h1>
        <p className="my-5 text-lg leading-relaxed">
          {c.status === "approved"
            ? `${c.storyteller.name} has approved their stories.`
            : c.status === "draft"
              ? `${c.storyteller.name}’s story drafts are ready for review.`
              : c.status === "recording"
                ? `${c.storyteller.name} has started answering the questions.`
                : `Waiting for ${c.storyteller.name} to begin.`}
        </p>
        <p className="my-5">
          They choose what to share and review everything first. The first
          postcard introduces all four approved stories to {c.recipient.name}.
        </p>
        <p className="text-sm text-ink-500">
          This page shows progress on your request. Their unfinished answers
          remain private. Email delivery status is not available here.
        </p>
        {!c.capabilities.email && (
          <p className="mt-5 rounded-md bg-paper-200 p-4 text-sm">
            Email sending is currently unavailable. The team needs to finish
            email setup before new invitations can be sent.
          </p>
        )}
      </main>
    );
  if (c.status !== "approved")
    return (
      <main className="brand-page-shell mx-auto my-6 max-w-2xl rounded-2xl border border-warmgray-200 border-t-8 border-t-clay bg-white px-6 py-8 shadow-soft sm:my-10 sm:px-9">
        <Logo className="[&_svg]:h-11" />
        <h1 className="mt-10 font-serif text-3xl">
          {c.role === "owner"
            ? "Your stories are taking shape."
            : `${c.storyteller.name} is preparing your gift.`}
        </h1>
        <p className="my-5 text-lg">
          All four stories will appear here after {c.storyteller.name} approves
          them.
        </p>
        {c.role === "owner" && (
          <a href={c.links?.review} className={primary}>
            Review my stories
          </a>
        )}
      </main>
    );
  const selected = all
    ? c.chapters
    : c.chapters.filter((ch) => ch.id === chapterId);
  return (
    <main className="brand-page-shell mx-auto max-w-4xl px-5 py-6 sm:px-8 sm:py-8">
      <Logo className="[&_svg]:h-11" />
      <header className="brand-gradient-chocolate relative mb-9 mt-8 overflow-hidden rounded-2xl p-6 text-white sm:p-10">
        <BrandPattern
          variant="weave"
          className="pointer-events-none absolute -right-40 -top-12 h-[34rem] w-[34rem] text-clay opacity-[0.12]"
        />
        <div className="relative">
          <p className="brand-eyebrow text-white">
            Stories from {c.storyteller.name}
          </p>
          <h1 className="mb-5 mt-4 max-w-2xl font-serif text-4xl leading-tight text-white sm:text-5xl">
            {c.recipient.name},<br />
            these stories are for you.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-white">
            Four stories, the values behind them, and encouragement to carry
            into your own life. All four stories are here for you now.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button
              className="brand-button-secondary min-h-12 bg-white px-5 py-3 text-espresso"
              onClick={() => {
                setAll(true);
                document
                  .getElementById("chapters")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Explore all four stories
            </button>
          </div>
          <p className="mt-4 max-w-xl text-sm text-white">
            You do not need to wait for the next postcard. Every card returns to
            these same stories.
          </p>
        </div>
      </header>
      {c.role === "owner" && (
        <section className="mb-10 rounded-2xl border border-sage-200 bg-sage-50 p-6 sm:p-8">
          <h2 className="font-serif text-2xl">Your postcards and emails</h2>
          <p className="my-4 text-sm leading-relaxed">
            The first postcard is scheduled after approval. Three more are
            planned for months 3, 6 and 9. The follow-up email is planned for
            two weeks after confirmed mailing. Scheduled or submitted for
            printing does not mean mailed or delivered.
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
                  {postcardStatus[d.status]}
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
              Delivery setup is incomplete.{" "}
              {c.capabilities.mail
                ? ""
                : "The team needs to finish postcard setup. "}
              {c.capabilities.email
                ? ""
                : "The team needs to finish email setup. "}
              Check each item’s status above before expecting delivery.
            </p>
          )}
          <details className="mt-5">
            <summary>Private gift link</summary>
            <p className="mt-3 break-all text-sm">
              {typeof window === "undefined" ? "" : window.location.origin}
              {c.links?.collection}
            </p>
            <p className="mt-2 text-sm">
              The first postcard normally introduces this link. Anyone you share
              it with can open these stories.
            </p>
          </details>
          <details className="mt-5">
            <summary>Email status</summary>
            <ul className="mt-3 space-y-2 text-sm">
              {c.notifications.map((n) => (
                <li key={n.id}>
                  {n.subject}: {emailStatus[n.status]}
                  {n.error ? ` (${n.error})` : ""}
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
      <nav
        aria-label="Your four stories"
        className="mb-10 grid gap-3 sm:grid-cols-2"
      >
        {c.chapters.map((ch, i) => (
          <a
            key={ch.id}
            href={`/collection/${id}/chapter/${ch.id}?key=${encodeURIComponent(accessKey)}`}
            className="rounded-xl border border-sage-200 bg-sage-100 px-5 py-5 transition-colors hover:border-sage hover:bg-sage-200"
          >
            <span className="text-sm text-oxblood">Story {i + 1}</span>
            <span className="mt-1 block font-serif text-xl">{ch.title}</span>
          </a>
        ))}
      </nav>
      <div id="chapters" className="space-y-12">
        {selected.length === 0 && (
          <p>
            This story could not be found. Choose one of the four stories above.
          </p>
        )}
        {selected.map((ch) => {
          const b = c.chapterBlessings[ch.id];
          return (
            <article
              id={ch.id}
              key={ch.id}
              className="scroll-mt-8 rounded-2xl border border-warmgray-200 border-t-4 border-t-clay bg-white p-5 shadow-soft sm:p-9"
            >
              <p className="brand-eyebrow text-oxblood">
                Story {ch.id.slice(1)} of 4
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
                <p className="mb-6 rounded-md bg-sage-50 p-4 text-sm">
                  A written story from {c.storyteller.name}.
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
                  <aside className="mt-8 rounded-xl border border-clay-100 bg-clay-50 p-5 sm:p-6">
                    <p className="mb-3 text-sm uppercase tracking-widest text-oxblood">
                      A word for {c.recipient.name}
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
        Anyone with this private link can open these stories. Share it only with
        people you trust.
      </footer>
    </main>
  );
}
