"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import type { ChapterPackage, CollectionView } from "@/lib/collection/types";
import { getTextDraft, saveTextDraft } from "@/lib/collection/local-takes";
import { interviewAnswers } from "@/lib/collection/interview";
import { AppIcon } from "@/components/icons";
import { StoryOriginalPreview } from "./StoryOriginalPreview";
import {
  emptyStoryBlessing,
  recoverStoryDraft,
  reconcileStoryDraft,
  retainStoryDraft,
  sameStoryDraft,
  storyDraftSignature,
  type DeviceStoryDraft,
  type RetainedStoryDraft,
  type StoryDraft,
} from "./portal-drafts";
import {
  PortalError,
  isNarratedFilm,
  mediaPath,
  portalField,
  portalPrimary,
  portalSecondary,
} from "./PortalUI";

type Draft = StoryDraft;
const serverDraft = (chapter: ChapterPackage, c: CollectionView): Draft => ({
  title: chapter.title,
  content: chapter.content,
  postcardNote: chapter.postcardNote,
  blessing: c.chapterBlessings[chapter.id] || emptyStoryBlessing,
});

export function StoryReviewPanel({
  chapter,
  collection: c,
  accessKey,
  active,
  busy,
  locked,
  allowWrittenOnly,
  onState,
  act,
  onNext,
}: {
  chapter: ChapterPackage;
  collection: CollectionView;
  accessKey: string;
  active: boolean;
  busy: boolean;
  locked: boolean;
  allowWrittenOnly: boolean;
  onState: (id: string, dirty: boolean, ready: boolean) => void;
  act: (body: unknown) => Promise<CollectionView | null>;
  onNext: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => serverDraft(chapter, c));
  const [base, setBase] = useState<Draft>(() => serverDraft(chapter, c));
  const [recovery, setRecovery] = useState<Draft>();
  const [history, setHistory] = useState<RetainedStoryDraft[]>([]);
  const [reviewed, setReviewed] = useState(chapter.editorialReviewed);
  const [baseReviewed, setBaseReviewed] = useState(chapter.editorialReviewed);
  const [editing, setEditing] = useState(false);
  const [ready, setReady] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const section = useRef<HTMLElement>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  // Regenerated source sets use separate retained drafts, never overwriting older edits.
  const storageKey = `portal-review:${chapter.id}:${chapter.sourceTakeIds.join(",")}`;
  const currentServer = serverDraft(chapter, c);
  const serverSignature = storyDraftSignature(currentServer);
  const dirty =
    Boolean(recovery) ||
    !sameStoryDraft(draft, currentServer) ||
    reviewed !== chapter.editorialReviewed;
  const scriptChanged =
    draft.title !== chapter.title || draft.content !== chapter.content;
  const envelope: DeviceStoryDraft = {
    version: 2,
    draft,
    base,
    reviewed,
    history,
    recovery,
    videoMediaId: chapter.videoMediaId,
    reviewedFilmSha256: chapter.film?.outputSha256,
  };
  const latest = useRef({ envelope, dirty, ready });
  latest.current = { envelope, dirty, ready };
  const persist = useCallback(
    (value: string) => {
      const next = queue.current
        .catch(() => {})
        .then(() => saveTextDraft(c.id, storageKey, value));
      queue.current = next;
      return next;
    },
    [c.id, storageKey],
  );

  useEffect(() => {
    let alive = true;
    void getTextDraft(c.id, storageKey)
      .then((value) => {
        if (!alive || !value) return;
        const result = recoverStoryDraft(value, serverDraft(chapter, c), {
          videoMediaId: chapter.videoMediaId,
          outputSha256: chapter.film?.outputSha256,
        });
        setHistory(result.history);
        setDraft(result.draft);
        setBase(serverDraft(chapter, c));
        setRecovery(result.recovery);
        setReviewed(
          result.kind === "clean"
            ? chapter.editorialReviewed || result.reviewed
            : result.kind === "restore"
              ? result.reviewed
              : chapter.editorialReviewed,
        );
        if (result.kind === "restore") {
          setEditing(true);
          setNotice(
            "Your device changes have been restored. Review and save them to your collection.",
          );
        }
      })
      .catch(() => {
        if (alive)
          setDeviceStatus(
            "The device copy could not be opened. Your saved collection is unchanged.",
          );
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
      const state = latest.current;
      if (state.ready && (state.dirty || state.envelope.history.length))
        void persist(JSON.stringify(state.envelope)).catch(() => {});
    };
    // Restore once per source version, not after each server save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.id, storageKey, persist]);

  useEffect(() => {
    if (!ready || sameStoryDraft(base, currentServer)) return;
    // A background refresh must update a clean editor, never turn old server text into a local edit.
    if (
      reconcileStoryDraft(base, draft, currentServer) === "conflict" &&
      !recovery
    ) {
      setRecovery(draft);
      setNotice("");
    } else if (recovery) {
      setHistory((copies) =>
        retainStoryDraft(
          copies,
          base,
          "Earlier saved story",
          crypto.randomUUID(),
          new Date().toISOString(),
        ),
      );
    }
    setDraft(currentServer);
    setBase(currentServer);
    setReviewed(chapter.editorialReviewed);
    setBaseReviewed(chapter.editorialReviewed);
    setEditing(false);
    // The local state is read from this render when the saved server version changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSignature, ready]);

  useEffect(() => {
    onState(chapter.id, dirty || uploading, ready);
  }, [chapter.id, dirty, uploading, ready, onState]);
  useEffect(() => {
    if (!ready || (!dirty && !history.length)) return;
    if (dirty && !recovery) setDeviceStatus("Saving a copy on this device…");
    const timer = setTimeout(() => {
      void persist(JSON.stringify(latest.current.envelope))
        .then(() => {
          if (latest.current.dirty && !latest.current.envelope.recovery)
            setDeviceStatus(
              "Changes saved on this device. Save below to update your collection.",
            );
        })
        .catch(() =>
          setDeviceStatus(
            "A device copy is unavailable. Save changes before leaving this page.",
          ),
        );
    }, 300);
    return () => clearTimeout(timer);
  }, [draft, base, reviewed, recovery, history, ready, dirty, persist]);
  useEffect(() => {
    if (reviewed === baseReviewed) setReviewed(chapter.editorialReviewed);
    setBaseReviewed(chapter.editorialReviewed);
    // Preserve only a deliberate local checkbox change when the server review flag changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter.editorialReviewed]);
  useEffect(() => {
    setReviewed(chapter.editorialReviewed);
    setBaseReviewed(chapter.editorialReviewed);
  }, [chapter.videoMediaId, chapter.film?.outputSha256]);
  useEffect(() => {
    if (!active)
      section.current
        ?.querySelectorAll("video,audio")
        .forEach((media) => (media as HTMLMediaElement).pause());
  }, [active]);

  function chooseVersion(useDevice: boolean) {
    if (!recovery) return;
    const retained = retainStoryDraft(
      history,
      useDevice ? currentServer : recovery,
      useDevice
        ? "Saved story before device recovery"
        : "Device changes kept for reference",
      crypto.randomUUID(),
      new Date().toISOString(),
    );
    const next = useDevice ? recovery : currentServer;
    const checked = useDevice ? false : chapter.editorialReviewed;
    setHistory(retained);
    setRecovery(undefined);
    setDraft(next);
    setBase(currentServer);
    setReviewed(checked);
    setBaseReviewed(chapter.editorialReviewed);
    setEditing(useDevice);
    setNotice(
      useDevice
        ? "Your device changes are open for editing. The saved version is kept below. Save when you are ready."
        : "The saved story is open. Your device changes are kept below.",
    );
    void persist(
      JSON.stringify({
        ...envelope,
        draft: next,
        base: currentServer,
        reviewed: checked,
        recovery: undefined,
        history: retained,
      }),
    ).catch(() =>
      setError(
        "Your chosen version is open, but the device copies could not be backed up. Download them below before leaving this page.",
      ),
    );
  }
  function restoreCopy(copy: RetainedStoryDraft) {
    const retained = retainStoryDraft(
      history,
      currentServer,
      "Saved story before restoring a copy",
      crypto.randomUUID(),
      new Date().toISOString(),
    );
    setHistory(retained);
    setDraft(copy.draft);
    setBase(currentServer);
    setReviewed(false);
    setEditing(true);
    setNotice(
      "This earlier copy is open. Your saved version is kept below. Review the changes before saving.",
    );
  }
  function downloadCopy(copy: RetainedStoryDraft) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(copy.draft, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `time-tapestry-${chapter.id}-device-copy.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function change(update: Partial<Draft>) {
    setDraft((old) => ({ ...old, ...update }));
    setReviewed(false);
    setNotice("");
  }
  const cardLength =
    draft.postcardNote.length + Object.values(draft.blessing).join("").length;
  async function save() {
    if (!draft.title.trim() || !draft.content.trim()) {
      setError("Add a title and the complete written story before saving.");
      return;
    }
    if (cardLength > 1000) {
      setError(
        "Keep the optional postcard message and encouragement within 1,000 characters.",
      );
      return;
    }
    if (recovery) {
      setError("Choose which version to use before saving.");
      return;
    }
    setError("");
    const result = await act({
      action: "edit_chapter",
      chapterId: chapter.id,
      ...draft,
      editorialReviewed: reviewed,
      ...(reviewed && chapter.film
        ? { reviewedFilmSha256: chapter.film.outputSha256 }
        : {}),
    });
    if (!result) return;
    const next = result.chapters.find((item) => item.id === chapter.id);
    if (!next) return;
    const saved = serverDraft(next, result);
    const savedEnvelope: DeviceStoryDraft = {
      version: 2,
      draft: saved,
      base: saved,
      reviewed: next.editorialReviewed,
      videoMediaId: next.videoMediaId,
      reviewedFilmSha256: next.film?.outputSha256,
      history,
    };
    setDraft(saved);
    setBase(saved);
    setReviewed(next.editorialReviewed);
    setBaseReviewed(next.editorialReviewed);
    latest.current = { envelope: savedEnvelope, dirty: false, ready: true };
    let deviceSaved = true;
    await persist(JSON.stringify(savedEnvelope)).catch(() => {
      deviceSaved = false;
    });
    setDeviceStatus("");
    setNotice(
      !deviceSaved
        ? "Your collection is saved. Earlier device copies could not be backed up; download them below before leaving."
        : next.editorialReviewed
          ? "Story review saved to your collection."
          : "Your story changes are saved to your collection.",
    );
    setEditing(false);
  }

  async function attach(file: File) {
    setUploading(true);
    setError("");
    setReviewed(false);
    try {
      const duration = await new Promise<number>((resolve, reject) => {
        const video = document.createElement("video");
        const url = URL.createObjectURL(file);
        video.preload = "metadata";
        video.onloadedmetadata = () => {
          URL.revokeObjectURL(url);
          resolve(video.duration);
        };
        video.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("This video could not be read. Try an MP4 file."));
        };
        video.src = url;
      });
      if (!Number.isFinite(duration) || duration <= 0 || duration > 3600)
        throw new Error("Each finished video must be one hour or shorter.");
      let mediaId = crypto.randomUUID();
      let response: Response;
      if (c.capabilities.directUpload) {
        await upload(`collections/${c.id}/${mediaId}`, file, {
          access: "private",
          handleUploadUrl: `/api/collection/${c.id}/media/upload?key=${encodeURIComponent(accessKey)}`,
          clientPayload: JSON.stringify({
            mediaId,
            mimeType: file.type,
            name: file.name,
            bytes: file.size,
          }),
          multipart: true,
        });
        response = await fetch(
          `/api/collection/${c.id}/media?key=${encodeURIComponent(accessKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mediaId }),
          },
        );
      } else {
        const form = new FormData();
        form.set("file", file);
        response = await fetch(
          `/api/collection/${c.id}/media?key=${encodeURIComponent(accessKey)}`,
          { method: "POST", body: form },
        );
      }
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "This video could not be uploaded.");
      mediaId = result.mediaId || mediaId;
      const saved = await act({
        action: "attach_video",
        chapterId: chapter.id,
        mediaId,
        durationSeconds: duration,
      });
      if (saved)
        setNotice(
          "Your finished video is attached. Watch it before marking this story reviewed.",
        );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "This video could not be attached.",
      );
    } finally {
      setUploading(false);
    }
  }
  const sources = [...c.takes, ...interviewAnswers(c, chapter.id)].filter(
    (take) => chapter.sourceTakeIds.includes(take.id),
  );
  const disabled = busy || locked || uploading || !ready || Boolean(recovery);

  return (
    <section
      ref={section}
      hidden={!active}
      className="min-w-0"
      aria-label={`Review ${chapter.title}`}
      onPlayCapture={(event) => {
        section.current?.querySelectorAll("video,audio").forEach((media) => {
          if (media !== event.target) (media as HTMLMediaElement).pause();
        });
      }}
    >
      {recovery && (
        <section
          className="mb-6 rounded-2xl border border-clay-300 bg-clay-50 p-5 sm:p-7"
          aria-label="Choose a recovered draft"
        >
          <h2 className="text-2xl font-semibold">
            Two versions of this story are saved.
          </h2>
          <p className="mt-3 text-base leading-8">
            Your collection and this device have different changes. Choose which
            version to continue with. The other copy will be kept below.
          </p>
          <details className="mt-4">
            <summary className="min-h-12 cursor-pointer text-base font-medium">
              Compare the two versions
            </summary>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl bg-white p-4">
                <h3 className="font-semibold">Saved in your collection</h3>
                <p className="mt-3 font-medium">{currentServer.title}</p>
                <p className="mt-3 whitespace-pre-wrap text-base leading-7">
                  {currentServer.content}
                </p>
                <div className="mt-4 border-t border-warmgray-200 pt-3">
                  <p className="text-sm font-medium">
                    Personal message and postcard wording
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-base leading-7">
                    {[
                      currentServer.postcardNote,
                      ...Object.values(currentServer.blessing),
                    ]
                      .filter(Boolean)
                      .join("\n\n") || "No personal message added."}
                  </p>
                </div>
              </div>
              <div className="rounded-xl bg-white p-4">
                <h3 className="font-semibold">Changes from this device</h3>
                <p className="mt-3 font-medium">{recovery.title}</p>
                <p className="mt-3 whitespace-pre-wrap text-base leading-7">
                  {recovery.content}
                </p>
                <div className="mt-4 border-t border-warmgray-200 pt-3">
                  <p className="text-sm font-medium">
                    Personal message and postcard wording
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-base leading-7">
                    {[
                      recovery.postcardNote,
                      ...Object.values(recovery.blessing),
                    ]
                      .filter(Boolean)
                      .join("\n\n") || "No personal message added."}
                  </p>
                </div>
              </div>
            </div>
          </details>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              className={portalPrimary}
              disabled={busy || locked}
              onClick={() => chooseVersion(false)}
            >
              Use saved story
            </button>
            <button
              type="button"
              className={portalSecondary}
              disabled={busy || locked}
              onClick={() => chooseVersion(true)}
            >
              Use device changes
            </button>
          </div>
        </section>
      )}
      <div className="grid items-start gap-7 xl:grid-cols-[1.05fr_.95fr]">
        <div className="min-w-0 rounded-2xl border border-warmgray-200 bg-white p-5 sm:p-7">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="brand-eyebrow text-taupe-600">
                Story {chapter.id.slice(1)} of 4
              </p>
              <h2 className="mt-2 text-2xl font-semibold">The written story</h2>
            </div>
            <button
              type="button"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium underline underline-offset-4"
              disabled={disabled}
              onClick={() => setEditing(!editing)}
            >
              <AppIcon name="edit" size={17} />
              {editing ? "Read story" : "Edit wording"}
            </button>
          </div>
          {editing ? (
            <fieldset disabled={disabled} className="space-y-5">
              <legend className="sr-only">Edit your complete story</legend>
              <label className="block text-base font-medium">
                Story title
                <input
                  value={draft.title}
                  maxLength={120}
                  className={portalField}
                  onChange={(event) => change({ title: event.target.value })}
                />
              </label>
              <label className="block text-base font-medium">
                Complete story
                <textarea
                  rows={16}
                  maxLength={100000}
                  value={draft.content}
                  className={portalField}
                  onChange={(event) => change({ content: event.target.value })}
                />
              </label>
            </fieldset>
          ) : (
            <div>
              <h3 className="font-display text-2xl font-medium leading-snug">
                {draft.title}
              </h3>
              <div className="mt-5 whitespace-pre-wrap text-[17px] leading-8 text-ink-600">
                {draft.content}
              </div>
            </div>
          )}
          <p className="mt-5 border-t border-warmgray-200 pt-4 text-sm leading-7 text-ink-500">
            {chapter.generatedWith === "gloo"
              ? "This draft was shaped from your selected answers with AI assistance."
              : "This draft uses your selected words."}{" "}
            Check names, details and meaning. Your written corrections do not
            change your original recordings.
          </p>
          <details className="mt-5">
            <summary className="min-h-11 cursor-pointer text-sm font-medium">
              Compare with the answers used here
            </summary>
            <div className="mt-3 space-y-5">
              {sources.map((source) => (
                <div key={source.id} className="rounded-xl bg-paper p-4">
                  <p className="text-sm font-medium text-ink-500">
                    {source.prompt}
                  </p>
                  <p className="mt-3 whitespace-pre-wrap text-base leading-7">
                    {source.text}
                  </p>
                </div>
              ))}
            </div>
          </details>
        </div>
        <div className="min-w-0 space-y-5">
          {chapter.videoMediaId && (
            <section
              className="overflow-hidden rounded-2xl border border-warmgray-200 bg-white"
              aria-label="Attached film for review"
            >
              <div className="p-5">
                <h3 className="text-lg font-semibold">
                  {isNarratedFilm(chapter)
                    ? "Your AI narrated version"
                    : "Your story film"}
                </h3>
                <p className="mt-2 text-base leading-7 text-ink-500">
                  {isNarratedFilm(chapter)
                    ? "An AI voice reads your saved story. Your original recording is kept below. Watch this whole version before approving it for sharing."
                    : "Watch this whole video before approving it for sharing."}
                </p>
              </div>
              <video
                key={chapter.videoMediaId}
                controls
                playsInline
                preload="none"
                className="aspect-video w-full bg-espresso"
                aria-label={`Attached film for ${chapter.title}`}
                src={mediaPath(c.id, chapter.videoMediaId, accessKey)}
              />
            </section>
          )}
          {chapter.videoMediaId ? (
            <details className="rounded-2xl border border-warmgray-200 bg-white p-5">
              <summary className="min-h-12 cursor-pointer text-base font-medium">
                Listen to the original recording
              </summary>
              <StoryOriginalPreview
                collection={c}
                chapter={chapter}
                accessKey={accessKey}
              />
            </details>
          ) : (
            <StoryOriginalPreview
              collection={c}
              chapter={chapter}
              accessKey={accessKey}
            />
          )}
          <details className="rounded-2xl border border-warmgray-200 bg-white p-5">
            <summary className="min-h-11 cursor-pointer text-base font-medium">
              Personal message and postcard wording
            </summary>
            <fieldset disabled={disabled} className="mt-3 space-y-4">
              <legend className="sr-only">Optional story message</legend>
              <label className="block text-sm font-medium">
                Introduce this story
                <textarea
                  rows={3}
                  maxLength={400}
                  className={portalField}
                  value={draft.postcardNote}
                  onChange={(event) =>
                    change({ postcardNote: event.target.value })
                  }
                />
              </label>
              <label className="block text-sm font-medium">
                A word for {c.recipient.name} (optional)
                <textarea
                  rows={3}
                  className={portalField}
                  value={draft.blessing.encouragement}
                  onChange={(event) =>
                    change({
                      blessing: {
                        ...draft.blessing,
                        encouragement: event.target.value,
                      },
                    })
                  }
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Scripture reference
                  <input
                    className={portalField}
                    value={draft.blessing.scriptureReference}
                    onChange={(event) =>
                      change({
                        blessing: {
                          ...draft.blessing,
                          scriptureReference: event.target.value,
                        },
                      })
                    }
                  />
                </label>
                <label className="block text-sm font-medium">
                  Translation
                  <input
                    className={portalField}
                    value={draft.blessing.scriptureTranslation}
                    onChange={(event) =>
                      change({
                        blessing: {
                          ...draft.blessing,
                          scriptureTranslation: event.target.value,
                        },
                      })
                    }
                  />
                </label>
              </div>
              <label className="block text-sm font-medium">
                Exact Scripture wording (optional)
                <textarea
                  rows={3}
                  className={portalField}
                  value={draft.blessing.scriptureText}
                  onChange={(event) =>
                    change({
                      blessing: {
                        ...draft.blessing,
                        scriptureText: event.target.value,
                      },
                    })
                  }
                />
              </label>
              <p
                className={`text-sm leading-6 ${cardLength > 1000 ? "text-oxblood" : "text-ink-500"}`}
              >
                {cardLength} / 1,000 characters. Check Scripture against your
                chosen translation.
              </p>
            </fieldset>
          </details>
          <details className="rounded-2xl border border-warmgray-200 bg-white p-5">
            <summary className="min-h-11 cursor-pointer text-sm font-medium">
              Use an existing finished video
            </summary>
            <p className="my-3 text-sm leading-6 text-ink-500">
              Save any wording changes first. Uploading a video replaces the
              film for this story and requires a fresh review.
            </p>
            <label className="block text-sm">
              Finished video
              <input
                type="file"
                accept="video/mp4,video/webm"
                disabled={disabled || dirty}
                className="mt-3 block w-full text-sm"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void attach(file);
                }}
              />
            </label>
            {uploading && (
              <p role="status" className="mt-3 text-sm">
                Backing up your finished video…
              </p>
            )}
          </details>
        </div>
      </div>
      {history.length > 0 && (
        <details className="mt-6 rounded-2xl border border-warmgray-200 bg-white p-5">
          <summary className="min-h-12 cursor-pointer text-base font-medium">
            Earlier device copies ({history.length})
          </summary>
          <p className="mt-2 text-sm leading-7 text-ink-500">
            These copies are kept on this device. Restoring one opens it for
            review and does not change your collection until you save.
          </p>
          <div className="mt-4 space-y-4">
            {history
              .slice()
              .reverse()
              .map((copy) => (
                <details key={copy.id} className="rounded-xl bg-paper p-4">
                  <summary className="min-h-12 cursor-pointer text-base font-medium">
                    {copy.label} · {new Date(copy.savedAt).toLocaleString()}
                  </summary>
                  <h3 className="mt-3 font-semibold">{copy.draft.title}</h3>
                  <p className="mt-3 whitespace-pre-wrap text-base leading-7">
                    {copy.draft.content}
                  </p>
                  <div className="mt-4 border-t border-warmgray-200 pt-3">
                    <p className="text-sm font-medium">
                      Personal message and postcard wording
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-base leading-7">
                      {[
                        copy.draft.postcardNote,
                        ...Object.values(copy.draft.blessing),
                      ]
                        .filter(Boolean)
                        .join("\n\n") || "No personal message added."}
                    </p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      className={portalSecondary}
                      disabled={disabled || dirty}
                      onClick={() => restoreCopy(copy)}
                    >
                      Restore this copy
                    </button>
                    <button
                      type="button"
                      className="min-h-12 px-3 text-base underline underline-offset-4"
                      onClick={() => downloadCopy(copy)}
                    >
                      Download this copy
                    </button>
                  </div>
                </details>
              ))}
          </div>
        </details>
      )}
      <PortalError message={error} />
      <div className="mt-6 rounded-2xl border border-sage-200 bg-sage-50 p-5 sm:p-6">
        <label className="flex items-start gap-3 text-base leading-7">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0"
            disabled={
              disabled ||
              scriptChanged ||
              (!chapter.videoMediaId && !allowWrittenOnly)
            }
            checked={reviewed}
            onChange={(event) => {
              setReviewed(event.target.checked);
              setNotice("");
            }}
          />
          <span>
            {chapter.videoMediaId
              ? "I have checked the written story, watched the film and reviewed the personal message."
              : "I have checked the written story and personal message. They say what I want to share."}
          </span>
        </label>
        {scriptChanged && (
          <p className="mt-2 text-base leading-7 text-ink-500">
            Save your wording changes first. Then review the saved story and any
            attached film.
          </p>
        )}
        {!chapter.videoMediaId && !allowWrittenOnly && (
          <p className="mt-2 text-sm leading-6 text-ink-500">
            You can share your written stories without creating AI films. Choose
            that option below to review the words, or attach a finished video
            for review.
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-xl text-sm leading-6 text-ink-500">
            <div role="status">
              <p>{notice}</p>
              <p>
                {dirty
                  ? deviceStatus
                  : !notice
                    ? "Your saved version is up to date."
                    : ""}
              </p>
            </div>
            {locked && (
              <p>
                Film generation is running. Editing opens again when it
                finishes.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={disabled || !dirty || cardLength > 1000}
              className={portalPrimary}
              onClick={() => void save()}
            >
              {busy
                ? "Saving…"
                : reviewed
                  ? "Save story review"
                  : "Save changes"}
            </button>
            <button
              type="button"
              className={portalSecondary}
              disabled={disabled || dirty}
              onClick={onNext}
            >
              Next story
              <AppIcon name="arrowRight" size={17} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
