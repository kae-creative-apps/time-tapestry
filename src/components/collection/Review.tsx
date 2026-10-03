"use client";
import { useState, useEffect, useCallback } from "react";
import { upload } from "@vercel/blob/client";
import { QRCodeSVG } from "qrcode.react";
import { Logo } from "@/components/Logo";
import { BrandPattern } from "@/components/BrandPattern";
import type { ChapterPackage, CollectionView } from "@/lib/collection/types";
import { useCollection } from "./useCollection";
import AddressForm from "./AddressForm";
import { interviewAnswers } from "@/lib/collection/interview";
const field =
  "mt-2 w-full rounded-md border border-warmgray-300 bg-white p-3 text-base leading-relaxed transition-colors hover:border-taupe";
const primary = "brand-button-primary min-h-12 px-5 py-3 disabled:opacity-50";
const secondary =
  "brand-button-secondary min-h-12 px-4 py-3 disabled:opacity-50";
function ChapterEditor({
  chapter,
  c,
  accessKey,
  act,
  busy,
  onDirty,
}: {
  chapter: ChapterPackage;
  c: CollectionView;
  accessKey: string;
  act: (v: unknown) => Promise<CollectionView | null>;
  busy: boolean;
  onDirty: (id: string, dirty: boolean) => void;
}) {
  const [title, setTitle] = useState(chapter.title),
    [content, setContent] = useState(chapter.content),
    [note, setNote] = useState(chapter.postcardNote),
    [reviewed, setReviewed] = useState(chapter.editorialReviewed),
    [blessing, setBlessing] = useState(
      c.chapterBlessings[chapter.id] || {
        encouragement: "",
        scriptureReference: "",
        scriptureText: "",
        scriptureTranslation: "",
      },
    ),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  const sources = [...c.takes, ...interviewAnswers(c, chapter.id)].filter((t) =>
    chapter.sourceTakeIds.includes(t.id),
  );
  const liveOriginals = new Map<
    string,
    { mediaId: string; kind: "voice" | "video" }
  >();
  for (const source of sources) {
    if (!source.liveSource) continue;
    const session = c.interviews?.find(
      (item) => item.id === source.liveSource!.sessionId,
    );
    for (const range of source.liveSource.sourceRanges) {
      const segment = session?.segments.find(
        (item) => item.id === range.segmentId,
      );
      liveOriginals.set(range.mediaId, {
        mediaId: range.mediaId,
        kind: segment?.kind ?? (source.kind === "video" ? "video" : "voice"),
      });
    }
  }
  const mediaUrl = (id: string) =>
    `/api/collection/${c.id}/media/${id}?key=${encodeURIComponent(accessKey)}`;
  useEffect(() => {
    onDirty(
      chapter.id,
      uploading ||
        title !== chapter.title ||
        content !== chapter.content ||
        note !== chapter.postcardNote ||
        reviewed !== chapter.editorialReviewed ||
        JSON.stringify(blessing) !==
          JSON.stringify(
            c.chapterBlessings[chapter.id] || {
              encouragement: "",
              scriptureReference: "",
              scriptureText: "",
              scriptureTranslation: "",
            },
          ),
    );
  }, [
    title,
    content,
    note,
    reviewed,
    blessing,
    chapter,
    c.chapterBlessings,
    onDirty,
    uploading,
  ]);
  const cardLength = note.length + Object.values(blessing).join("").length;
  async function save() {
    if (cardLength > 1000) {
      setError(
        "Keep the postcard note and encouragement within 1,000 characters.",
      );
      return;
    }
    setError("");
    await act({
      action: "edit_chapter",
      chapterId: chapter.id,
      title,
      content,
      postcardNote: note,
      editorialReviewed: reviewed,
      blessing,
    });
  }
  async function attach(file: File) {
    setUploading(true);
    setReviewed(false);
    setError("");
    try {
      const duration = await new Promise<number>((resolve, reject) => {
        const v = document.createElement("video");
        const u = URL.createObjectURL(file);
        v.preload = "metadata";
        v.onloadedmetadata = () => {
          const d = v.duration;
          URL.revokeObjectURL(u);
          resolve(d);
        };
        v.onerror = () => {
          URL.revokeObjectURL(u);
          reject(new Error("This video could not be read. Try an MP4 file."));
        };
        v.src = u;
      });
      if (!Number.isFinite(duration) || duration <= 0 || duration > 3600)
        throw new Error("Each finished video must be one hour or shorter.");
      let mediaId = crypto.randomUUID();
      if (c.capabilities.directUpload) {
        await upload(`collections/${c.id}/${mediaId}`, file, {
          access: "private",
          handleUploadUrl: `/api/collection/${c.id}/media/upload?key=${encodeURIComponent(accessKey)}`,
          clientPayload: JSON.stringify({
            mediaId,
            mimeType: file.type,
            name: file.name,
          }),
          multipart: true,
        });
        const r = await fetch(
          `/api/collection/${c.id}/media?key=${encodeURIComponent(accessKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mediaId }),
          },
        );
        if (!r.ok) throw new Error((await r.json()).error);
      } else {
        const form = new FormData();
        form.set("file", file);
        const r = await fetch(
          `/api/collection/${c.id}/media?key=${encodeURIComponent(accessKey)}`,
          { method: "POST", body: form },
        );
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
        mediaId = b.mediaId;
      }
      await act({
        action: "attach_video",
        chapterId: chapter.id,
        mediaId,
        durationSeconds: duration,
      });
      setReviewed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Video could not be attached.");
    } finally {
      setUploading(false);
    }
  }
  return (
    <section className="my-8 rounded-2xl border border-warmgray-200 border-t-4 border-t-sage bg-white p-5 shadow-soft sm:p-8">
      <p className="brand-eyebrow text-oxblood">
        Story {chapter.id.slice(1)} of 4
      </p>
      <label className="mt-4 block">
        Story title
        <input
          className={field}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setReviewed(false);
          }}
        />
      </label>
      <label className="mt-5 block">
        Written story
        <textarea
          rows={8}
          maxLength={100000}
          className={field}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setReviewed(false);
          }}
        />
      </label>
      <p className="mt-2 text-sm text-ink-500">
        {chapter.generatedWith === "gloo"
          ? "AI draft based on your selected answers."
          : "Your selected words, kept as a draft."}{" "}
        Check names, facts and whether the meaning sounds like you.
      </p>
      <details className="my-6">
        <summary className="cursor-pointer font-medium">
          Compare with my original answers
        </summary>
        <div className="mt-4 space-y-5">
          {sources.map((s) => (
            <div key={s.id}>
              <p className="mb-2 text-sm text-ink-500">{s.prompt}</p>
              {s.mediaId &&
                !s.liveSource &&
                (s.kind === "video" ? (
                  <video
                    className="w-full rounded-md bg-black"
                    controls
                    playsInline
                    src={mediaUrl(s.mediaId)}
                  />
                ) : (
                  <audio
                    controls
                    className="w-full"
                    src={mediaUrl(s.mediaId)}
                  />
                ))}
              <p className="mt-3 whitespace-pre-wrap leading-relaxed">
                {s.text}
              </p>
            </div>
          ))}
          {liveOriginals.size > 0 && (
            <div className="border-t border-warmgray-300 pt-5">
              <h4 className="font-medium">Original conversation recordings</h4>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                These are the full, unedited recordings used for this story.
                They may include other answers and the interviewer&apos;s
                questions. Review the finished story video separately below.
              </p>
              <div className="mt-4 space-y-5">
                {[...liveOriginals.values()].map((original, index) => (
                  <div key={original.mediaId}>
                    <p className="mb-2 text-sm font-medium">
                      Full original recording {index + 1}
                    </p>
                    {original.kind === "video" ? (
                      <video
                        className="w-full rounded-md bg-black"
                        controls
                        playsInline
                        preload="metadata"
                        aria-label={`Full unedited conversation recording ${index + 1}`}
                        src={mediaUrl(original.mediaId)}
                      />
                    ) : (
                      <audio
                        controls
                        preload="metadata"
                        className="w-full"
                        aria-label={`Full unedited conversation recording ${index + 1}`}
                        src={mediaUrl(original.mediaId)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </details>
      <h3 className="mb-4 font-serif text-2xl">Video for this story</h3>
      {chapter.videoMediaId ? (
        <video
          className="w-full rounded-md bg-black"
          controls
          playsInline
          src={mediaUrl(chapter.videoMediaId)}
        />
      ) : (
        <p className="rounded-md bg-paper-200 p-4 leading-relaxed">
          {chapter.videoStatus === "awaiting_edit"
            ? "Your original recording is saved. A video editor still needs to finish the video for you to review."
            : "Your written story is ready to review. You can also add a finished video below."}
        </p>
      )}
      <label className="mt-4 block text-sm">
        Add the finished video
        <input
          type="file"
          accept="video/mp4,video/webm"
          disabled={busy || uploading}
          className="mt-2 block w-full text-base"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void attach(f);
          }}
        />
      </label>
      {uploading && (
        <p role="status" className="mt-3">
          Backing up the finished video...
        </p>
      )}
      {chapter.videoStatus === "awaiting_edit" && (
        <button
          type="button"
          className="my-4 text-sm text-oxblood underline"
          onClick={() =>
            act({
              action: "edit_chapter",
              chapterId: chapter.id,
              title,
              content,
              postcardNote: note,
              editorialReviewed: false,
              videoStatus: "not_requested",
            })
          }
        >
          Share this story without a video
        </button>
      )}
      <h3 className="mb-4 mt-8 font-serif text-2xl">
        The postcard they receive
      </h3>
      <label className="block">
        Introduce this story
        <textarea
          rows={3}
          className={field}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setReviewed(false);
          }}
          maxLength={400}
        />
      </label>
      <label className="mt-5 block">
        A word for {c.recipient.name} (optional)
        <textarea
          rows={3}
          className={field}
          value={blessing.encouragement}
          onChange={(e) => {
            setBlessing({ ...blessing, encouragement: e.target.value });
            setReviewed(false);
          }}
        />
      </label>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label>
          Scripture reference (optional)
          <input
            className={field}
            value={blessing.scriptureReference}
            onChange={(e) => {
              setBlessing({ ...blessing, scriptureReference: e.target.value });
              setReviewed(false);
            }}
            placeholder="Book, chapter and verse"
          />
        </label>
        <label>
          Translation (optional)
          <input
            className={field}
            value={blessing.scriptureTranslation}
            onChange={(e) => {
              setBlessing({
                ...blessing,
                scriptureTranslation: e.target.value,
              });
              setReviewed(false);
            }}
          />
        </label>
      </div>
      <label className="mt-5 block">
        Exact Scripture wording you want to share (optional)
        <textarea
          className={field}
          rows={3}
          value={blessing.scriptureText}
          onChange={(e) => {
            setBlessing({ ...blessing, scriptureText: e.target.value });
            setReviewed(false);
          }}
        />
      </label>
      <p
        className={`mt-2 text-sm ${cardLength > 1000 ? "text-red-800" : "text-ink-500"}`}
      >
        {cardLength} / 1,000 postcard characters. Check any Scripture against
        your chosen Bible translation.
      </p>
      <div className="my-6 rounded-xl border border-clay-100 bg-clay-50 p-6 sm:p-8">
        <p className="font-serif text-2xl">{title}</p>
        <p className="mt-4 leading-relaxed">{note}</p>
        {blessing.encouragement && (
          <p className="mt-4 leading-relaxed">{blessing.encouragement}</p>
        )}
        {blessing.scriptureText && (
          <blockquote className="mt-4 border-l-2 border-oxblood pl-4">
            {blessing.scriptureText}
          </blockquote>
        )}
        <p className="mt-2 text-sm">
          {blessing.scriptureReference} {blessing.scriptureTranslation}
        </p>
        <div className="mt-6 flex items-center gap-4">
          <QRCodeSVG
            size={76}
            value={`${typeof window === "undefined" ? "" : window.location.origin}${c.links?.collection?.split("?")[0]}/chapter/${chapter.id}?${c.links?.collection?.split("?")[1] || ""}`}
          />
          <p className="text-sm">
            A story and encouragement from {c.storyteller.name}.<br />
            Scan to open this story and explore the others.
          </p>
        </div>
        <p className="mt-4 text-xs text-ink-500">
          Content preview. Print layout is checked before mailing.
        </p>
      </div>
      <label className="flex items-start gap-3">
        <input
          className="mt-1"
          type="checkbox"
          checked={reviewed}
          onChange={(e) => setReviewed(e.target.checked)}
        />
        <span>
          I have checked this story, its video if included, the postcard wording
          and any Scripture. They say what I want to share.
        </span>
      </label>
      {error && (
        <p role="alert" className="mt-4 text-red-800">
          {error}
        </p>
      )}
      <button
        type="button"
        className={`${primary} mt-6`}
        disabled={busy || uploading || cardLength > 1000}
        onClick={() => void save()}
      >
        Save story review
      </button>
    </section>
  );
}
export default function Review({
  id,
  accessKey,
}: {
  id: string;
  accessKey: string;
}) {
  const { collection: c, error, busy, act } = useCollection(id, accessKey);
  const [activeChapter, setActiveChapter] = useState("q1");
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const onDirty = useCallback(
    (id: string, value: boolean) =>
      setDirty((old) => (old[id] === value ? old : { ...old, [id]: value })),
    [],
  );
  if (!c)
    return (
      <main className="brand-page-shell mx-auto max-w-4xl px-5 py-8 sm:px-8">
        <Logo className="[&_svg]:h-11" />
        <p className="mt-10" role="status">
          {error || "Loading your review..."}
        </p>
      </main>
    );
  if (c.role !== "owner")
    return (
      <main className="brand-page-shell mx-auto max-w-4xl px-6 py-12">
        Please use the storyteller review link.
      </main>
    );
  return (
    <main className="brand-page-shell mx-auto max-w-4xl px-5 py-6 sm:px-8 sm:py-8">
      <Logo className="[&_svg]:h-11" />
      <header className="brand-gradient-clay relative mt-8 overflow-hidden rounded-2xl p-6 sm:p-9">
        <BrandPattern
          variant="weave"
          className="pointer-events-none absolute -right-24 -top-16 h-96 w-96 text-espresso opacity-[0.07]"
        />
        <div className="relative">
          <p className="brand-eyebrow text-espresso">
            Your stories, in your own words
          </p>
          <h1 className="mb-4 mt-3 max-w-xl font-serif text-3xl text-espresso sm:text-4xl">
            Review your stories before sharing.
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-espresso">
            Read each story, watch any included video, and check the postcard
            message. {c.recipient.name} can open all four approved stories from
            the first postcard. The next three cards are planned for months 3, 6
            and 9.
          </p>
        </div>
      </header>
      {c.status === "approved" ? (
        <div className="mt-8 rounded-2xl border border-sage-200 bg-white p-6 shadow-soft sm:p-8">
          <h2 className="font-serif text-2xl">Your gift is approved.</h2>
          <p className="my-4">
            This approved version cannot be changed in the pilot, so every visit
            returns the same stories and encouragement. Check postcard and email
            progress on your story page.
          </p>
          <a className={primary} href={`/collection/${id}?key=${accessKey}`}>
            Open my stories
          </a>
        </div>
      ) : (
        <>
          <a
            className="mt-6 inline-block text-oxblood underline"
            href={`/record/${id}?key=${accessKey}`}
          >
            Return to my answers
          </a>
          {c.draftOutdated && (
            <div className="my-6 rounded-xl border border-clay-100 bg-clay-50 p-5">
              <p className="mb-3">
                You changed your selected answers after these drafts were made.
                Create new drafts to include those changes. Your earlier drafts
                and their attached videos stay in the draft history.
              </p>
              <button
                className={secondary}
                disabled={busy}
                onClick={() => act({ action: "generate", regenerate: true })}
              >
                Create new drafts from my answers
              </button>
            </div>
          )}
          {Boolean(c.draftHistory?.length) && (
            <details className="my-6 rounded-xl border border-warmgray-200 bg-white p-5">
              <summary>Saved draft history ({c.draftHistory?.length})</summary>
              {c.draftHistory?.map((v, i) => (
                <div
                  key={v.savedAt}
                  className="my-4 rounded-lg border border-warmgray-200 bg-paper p-4"
                >
                  <p>
                    Draft {i + 1}, saved {new Date(v.savedAt).toLocaleString()}
                  </p>
                  {v.chapters.map((ch) => (
                    <details key={ch.id} className="mt-3">
                      <summary>{ch.title}</summary>
                      <p className="mt-3 whitespace-pre-wrap">{ch.content}</p>
                      <p className="mt-3">{ch.postcardNote}</p>
                      {ch.videoMediaId && (
                        <video
                          controls
                          className="mt-3 w-full"
                          src={`/api/collection/${id}/media/${ch.videoMediaId}?key=${encodeURIComponent(accessKey)}`}
                        />
                      )}
                    </details>
                  ))}
                </div>
              ))}
            </details>
          )}
          {!c.chapters.length ? (
            <div className="my-8 rounded-2xl border border-sage-200 bg-white p-6 shadow-soft">
              <p className="mb-5">
                Save an answer in each of the four interview parts, then create
                your story drafts. You will review everything before sharing.
              </p>
              <button
                className={primary}
                disabled={busy}
                onClick={() => act({ action: "generate" })}
              >
                Create my story drafts
              </button>
            </div>
          ) : (
            <>
              <nav
                aria-label="Story review"
                className="my-7 grid grid-cols-2 gap-3 rounded-xl bg-sage-100 p-3 sm:grid-cols-4"
              >
                {c.chapters.map((ch, i) => (
                  <button
                    type="button"
                    key={ch.id}
                    aria-current={activeChapter === ch.id ? "step" : undefined}
                    disabled={
                      busy ||
                      (activeChapter !== ch.id &&
                        Object.values(dirty).some(Boolean))
                    }
                    className={activeChapter === ch.id ? primary : secondary}
                    onClick={() => setActiveChapter(ch.id)}
                  >
                    {ch.editorialReviewed ? "✓ " : ""}Story {i + 1}
                  </button>
                ))}
              </nav>
              <p className="text-sm text-ink-500">
                Review one story at a time. Save any changes before moving to
                another story.
              </p>
              {c.chapters.map((ch) => (
                <div key={ch.id} hidden={activeChapter !== ch.id}>
                  <ChapterEditor
                    key={`${ch.id}-${c.draftHistory?.length || 0}`}
                    chapter={ch}
                    c={c}
                    accessKey={accessKey}
                    act={act}
                    busy={busy}
                    onDirty={onDirty}
                  />
                </div>
              ))}
            </>
          )}
          <section className="my-10 rounded-2xl border border-warmgray-200 bg-white p-6 shadow-soft sm:p-8">
            <h2 className="mb-4 font-serif text-2xl">
              Delivery to {c.recipient.name}
            </h2>
            <p className="mb-4">{c.recipient.email}</p>
            {c.addressConfirmed ? (
              <>
                <p>
                  {c.address?.line1}
                  <br />
                  {c.address?.city}, {c.address?.region} {c.address?.postalCode}
                </p>
                <details className="mt-4">
                  <summary>Change mailing address</summary>
                  <AddressForm
                    initial={c.address}
                    busy={busy}
                    onSave={(address) => act({ action: "address", address })}
                  />
                </details>
              </>
            ) : (
              <>
                <AddressForm
                  busy={busy}
                  onSave={(address) => act({ action: "address", address })}
                />
                <button
                  className={`${secondary} mt-4`}
                  disabled={busy}
                  onClick={() => act({ action: "request_address" })}
                >
                  Ask {c.recipient.name} for their address
                </button>
                <p className="mt-2 text-sm text-ink-500">
                  This prepares an email asking for their address. It does not
                  share your unfinished stories.
                </p>
              </>
            )}
          </section>
          {error && (
            <p
              role="alert"
              className="my-5 rounded-md bg-red-50 p-4 text-red-800"
            >
              {error}
            </p>
          )}
          <section className="mb-12 rounded-2xl border border-sage-200 bg-sage-100 p-6 sm:p-8">
            <h2 className="font-serif text-2xl">Ready to approve your gift?</h2>
            <p className="my-4 leading-relaxed">
              Approving makes all four stories available at the private gift
              link and schedules the postcards. The approved stories cannot be
              changed in this pilot. Anyone with the link can open them.
            </p>
            <p className="mb-5 text-sm leading-relaxed">
              The first postcard introduces the gift. A follow-up email with the
              link is planned for two weeks after confirmed mailing, unless
              follow-ups are turned off or no longer needed. Scheduled postcards
              and emails have not necessarily been sent.
            </p>
            <p className="mb-5 text-sm">
              {Object.values(dirty).some(Boolean)
                ? "Save your latest edits before approving. "
                : ""}
              {c.chapters.filter((ch) => ch.editorialReviewed).length} of 4
              stories reviewed.{" "}
              {c.addressConfirmed
                ? "Mailing address confirmed."
                : "Mailing address still needed."}
            </p>
            <button
              className={primary}
              disabled={
                busy ||
                Boolean(c.draftOutdated) ||
                Object.values(dirty).some(Boolean) ||
                c.chapters.length !== 4 ||
                c.chapters.some(
                  (ch) =>
                    !ch.editorialReviewed || ch.videoStatus === "awaiting_edit",
                ) ||
                !c.addressConfirmed
              }
              onClick={() => act({ action: "approve" })}
            >
              {busy ? "Saving..." : "Approve my gift and schedule postcards"}
            </button>
          </section>
        </>
      )}
    </main>
  );
}
