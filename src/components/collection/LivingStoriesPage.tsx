"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCollection } from "./useCollection";
import {
  PortalShell,
  PortalError,
  portalPrimary,
  portalSecondary,
  portalField,
} from "./PortalUI";
import SavedRecorder from "./SavedRecorder";
import { collectionRequest } from "@/lib/collection/client-request";
import {
  FLOURISHING_CATEGORIES,
  FLOURISHING_PROMPTS,
} from "@/lib/collection/flourishing-prompts";
import type { LivingStory } from "@/lib/collection/living-story-types";
import {
  matchesStorySearch,
  storyCatalog,
} from "@/lib/collection/story-catalog";

const empty: LivingStory = { batches: [], moments: [] };
const categoryName = (id: string) =>
  id === "original"
    ? "The original gift"
    : FLOURISHING_CATEGORIES.find((c) => c.id === id)?.name || "A new story";

export default function LivingStoriesPage({
  id,
  accessKey,
}: {
  id: string;
  accessKey: string;
}) {
  const {
    collection: c,
    error: collectionError,
    load: reloadCollection,
  } = useCollection(id, accessKey);
  const [living, setLiving] = useState<LivingStory>(empty);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [promptCategory, setPromptCategory] = useState("character");
  const [promptQuery, setPromptQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [limit, setLimit] = useState(12);
  const [activeId, setActiveId] = useState<string>();
  const [watchAll, setWatchAll] = useState(false);
  const [recordId, setRecordId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    const value = new URL(window.location.href).searchParams.get("moment");
    return value && /^[a-zA-Z0-9_-]{8,80}$/.test(value) ? value : "";
  });
  const [kind, setKind] = useState<"video" | "voice">("video");
  const [recording, setRecording] = useState(false);
  const [pendingRecording, setPendingRecording] = useState(true);
  const [consent, setConsent] = useState(false);
  const [unattached, setUnattached] = useState<{
    momentId: string;
    mediaId: string;
  }>();
  const pending = useRef(false);
  const requestIdentity = useRef<{ selection: string; id: string } | undefined>(
    undefined,
  );
  const generation = useRef(0);
  const player = useRef<HTMLVideoElement>(null);
  const recorderHeading = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const owner = c?.role === "owner";
  const base = `/collection/${encodeURIComponent(id)}`;
  const keyQuery = accessKey ? `?key=${encodeURIComponent(accessKey)}` : "";
  const endpoint = `/api/collection/${encodeURIComponent(id)}/moments${keyQuery}`;
  const mediaUrl = (mediaId: string, download = false) =>
    `/api/collection/${encodeURIComponent(id)}/media/${encodeURIComponent(mediaId)}?${new URLSearchParams({ ...(accessKey ? { key: accessKey } : {}), ...(download ? { download: "1" } : {}) })}`;

  const load = useCallback(async () => {
    if (pending.current) return;
    const version = ++generation.current;
    try {
      const response = await collectionRequest<{ livingStory: LivingStory }>(
        endpoint,
      );
      if (version === generation.current) {
        setLiving(response.livingStory);
        setLoaded(true);
        setError("");
      }
    } catch (cause) {
      if (version === generation.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "We could not open your stories.",
        );
    }
  }, [endpoint]);
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);
  useEffect(() => {
    if (!living.moments.some((m) => m.status === "processing") && owner) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 20000);
    return () => clearInterval(timer);
  }, [living.moments, owner, load]);
  async function act(body: Record<string, unknown>) {
    if (pending.current) return null;
    pending.current = true;
    const version = ++generation.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await collectionRequest<{ livingStory: LivingStory }>(
        endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!mounted.current || version !== generation.current) return null;
      setLiving(response.livingStory);
      setLoaded(true);
      return response.livingStory;
    } catch (cause) {
      if (mounted.current && version === generation.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Your changes could not be saved. Please try again.",
        );
      return null;
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const entries = useMemo(
    () => (c ? storyCatalog(c, living) : []),
    [c, living],
  );
  const filtered = entries.filter(
    (item) =>
      (category === "all" || item.category === category) &&
      matchesStorySearch(item, query),
  );
  const playlist = filtered.filter((item) => item.videoMediaId);
  const active = entries.find((item) => item.id === activeId);
  const moment = living.moments.find(
    (item) =>
      item.id === recordId &&
      ["draft", "needs_attention"].includes(item.status),
  );
  useEffect(() => {
    if (!owner || !loaded) return;
    if (recordId && !moment) setRecordId("");
    const url = new URL(window.location.href);
    if (moment) url.searchParams.set("moment", moment.id);
    else url.searchParams.delete("moment");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [owner, loaded, moment?.id, recordId]);
  useEffect(() => {
    if (moment && owner) recorderHeading.current?.focus();
    else if (returnFocus.current) {
      document.getElementById(returnFocus.current)?.focus();
      returnFocus.current = null;
    }
  }, [moment?.id, owner]);
  useEffect(() => {
    if (!recording && !busy && !unattached) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const preventNavigation = (event: MouseEvent) => {
      const link =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (!link || link.hasAttribute("download")) return;
      event.preventDefault();
      event.stopPropagation();
      setNotice(
        "Finish saving this recording before leaving. Your download remains available below.",
      );
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", preventNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", preventNavigation, true);
    };
  }, [recording, busy, unattached]);
  const openFamily = living.batches.some(
    (batch) => batch.source === "family" && !batch.closedAt,
  );
  const pendingStories = living.moments.filter((m) =>
    ["draft", "processing", "needs_attention"].includes(m.status),
  );
  useEffect(() => {
    if (c?.status !== "approved" || recordId) return;
    const hash = window.location.hash;
    if (hash !== "#new-moments" && hash !== "#story-library") return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [c?.status, recordId, loaded, pendingStories.length]);
  const prompts = FLOURISHING_PROMPTS.filter(
    (p) =>
      (promptCategory === "all" || p.category === promptCategory) &&
      matchesStorySearch(p, promptQuery),
  );

  async function choosePrompts() {
    const selection = [...selected].sort().join(",");
    if (!selected.length || selected.length > 3) return;
    if (requestIdentity.current?.selection !== selection)
      requestIdentity.current = { selection, id: crypto.randomUUID() };
    const result = await act({
      action: owner ? "start" : "request",
      requestId: requestIdentity.current!.id,
      promptIds: selected,
    });
    if (!result) return;
    setSelected([]);
    setChoosing(false);
    requestIdentity.current = undefined;
    setNotice(
      owner
        ? "Your questions are ready. Choose a story below to record."
        : "Your questions are saved. We’ll let you know when the new stories are ready.",
    );
  }
  async function attach(momentId: string, mediaId: string) {
    const target = living.moments.find((item) => item.id === momentId);
    if (
      !owner ||
      !target ||
      !["draft", "needs_attention"].includes(target.status)
    )
      throw new Error(
        "This story is no longer open for a recording. The uploaded file is kept.",
      );
    setUnattached({ momentId, mediaId });
    setConsent(false);
    const result = await act({
      action: "attach",
      momentId,
      mediaId,
      expectedSourceMediaId: target.sourceMediaId || null,
    });
    if (
      !result ||
      result.moments.find((item) => item.id === momentId)?.sourceMediaId !==
        mediaId
    )
      throw new Error(
        "The recording is uploaded but could not be selected. Try saving it to this story again.",
      );
    if (mounted.current) {
      setUnattached(undefined);
      setNotice(
        "Your recording is saved. Listen if you like, then submit your story.",
      );
    }
  }
  async function submit() {
    if (
      !moment?.sourceMediaId ||
      !consent ||
      recording ||
      pendingRecording ||
      unattached
    )
      return;
    if (
      await act({
        action: "submit",
        momentId: moment.id,
        processingApproved: true,
      })
    ) {
      setRecordId("");
      setConsent(false);
      setNotice(
        "Your story is being prepared. We’ll email your family when the film and new book chapter are ready.",
      );
    }
  }

  if (!c)
    return (
      <PortalShell>
        {!collectionError && <p role="status">Opening your story library…</p>}
        <PortalError message={collectionError} />
        {collectionError && (
          <button
            className={`${portalPrimary} mt-4`}
            onClick={() => void reloadCollection()}
          >
            Try again
          </button>
        )}
      </PortalShell>
    );
  if (c.status !== "approved" || !["owner", "recipient"].includes(c.role))
    return (
      <PortalShell>
        <h1 className="font-display text-3xl">
          Finish your original gift first.
        </h1>
        <p className="my-5 text-lg leading-8">
          Once your four stories are complete and shared, you can add new
          memories here.
        </p>
        <a
          className={portalPrimary}
          href={`${base}${owner ? "/review" : ""}${keyQuery}`}
        >
          Return to my gift
        </a>
      </PortalShell>
    );

  return (
    <PortalShell collectionPath={`${base}${keyQuery}`}>
      {!moment && (
        <>
          <a
            className="mb-5 inline-flex min-h-12 items-center underline underline-offset-4"
            href={`${base}${owner ? "/review" : ""}${keyQuery}`}
          >
            Back to the original gift
          </a>
          <header className="mb-7">
            <p className="brand-eyebrow">
              {owner
                ? "Your growing collection"
                : `Stories from ${c.storyteller.name}`}
            </p>
            <h1 className="mt-3 font-display text-4xl font-medium sm:text-5xl">
              A life, one story at a time.
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8">
              {owner
                ? "Add a memory in your own voice. Every new story becomes a film and a chapter in your family’s book."
                : "Return to a favorite memory, or ask what you would love to hear next."}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                className={portalPrimary}
                disabled={
                  !loaded || busy || recording || (!owner && openFamily)
                }
                onClick={() => {
                  setChoosing(!choosing);
                  setError("");
                }}
              >
                {choosing
                  ? "Close questions"
                  : owner
                    ? "Add another story"
                    : "Ask for new stories"}
              </button>
              <a
                className={portalSecondary}
                href={`/api/collection/${encodeURIComponent(id)}/book${keyQuery}`}
              >
                Download the complete book
              </a>
            </div>
            {!owner && openFamily && (
              <p className="mt-3 text-base leading-7">
                There are questions waiting for a response. Choose another set
                when those stories are finished.
              </p>
            )}
          </header>
        </>
      )}
      {moment && owner && (
        <button
          className={`${portalSecondary} mb-5`}
          disabled={recording || busy || !!unattached}
          onClick={() => {
            setRecordId("");
            setConsent(false);
            setNotice("");
          }}
        >
          Return to my library
        </button>
      )}
      <PortalError message={error || collectionError} />
      {notice && (
        <p
          role="status"
          className="mb-5 rounded-2xl bg-sage-50 p-5 text-lg leading-8"
        >
          {notice}
        </p>
      )}
      {!loaded && (
        <button
          className={portalSecondary}
          disabled={busy}
          onClick={() => void load()}
        >
          Check for stories
        </button>
      )}
      {choosing && !moment && (
        <section
          aria-label="Choose story questions"
          className="mb-8 rounded-[28px] border border-warmgray-200 bg-white p-5 sm:p-8"
        >
          <h2 className="font-display text-3xl">
            What would you like to {owner ? "share" : "hear"}?
          </h2>
          <p className="mt-3 text-lg leading-8">
            Choose up to three questions. Every question is optional.
          </p>
          <div className="sticky top-0 z-10 my-5 border-y border-warmgray-200 bg-white py-4">
            <p role="status" className="mb-3 text-lg font-medium">
              {selected.length} of 3 selected
            </p>
            {selected.length > 0 && (
              <ul className="mb-4 flex flex-wrap gap-2">
                {selected.map((promptId) => (
                  <li key={promptId}>
                    <button
                      disabled={busy}
                      className="min-h-12 rounded-full border border-warmgray-300 px-4 text-sm"
                      onClick={() =>
                        setSelected((current) =>
                          current.filter((i) => i !== promptId),
                        )
                      }
                    >
                      Remove{" "}
                      {
                        FLOURISHING_PROMPTS.find((p) => p.id === promptId)
                          ?.title
                      }{" "}
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              disabled={!selected.length || busy}
              className={`${portalPrimary} w-full sm:w-auto`}
              onClick={() => void choosePrompts()}
            >
              {busy
                ? "Saving…"
                : owner
                  ? "Save these questions"
                  : "Send these questions"}
            </button>
          </div>
          <div className="my-5 grid gap-4 sm:grid-cols-2">
            <label className="text-base font-medium">
              Explore a part of life
              <select
                className={`${portalField} mt-2`}
                value={promptCategory}
                disabled={busy}
                onChange={(e) => {
                  setPromptCategory(e.target.value);
                  setLimit(12);
                }}
              >
                <option value="all">All 100 questions</option>
                {FLOURISHING_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-base font-medium">
              Find a question
              <input
                type="search"
                className={`${portalField} mt-2`}
                value={promptQuery}
                onChange={(e) => {
                  setPromptQuery(e.target.value);
                  setLimit(12);
                }}
                placeholder="Try home, friendship, or prayer"
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {prompts.slice(0, limit).map((prompt) => (
              <button
                type="button"
                aria-pressed={selected.includes(prompt.id)}
                key={prompt.id}
                disabled={
                  busy ||
                  (!selected.includes(prompt.id) && selected.length >= 3)
                }
                onClick={() =>
                  setSelected((current) =>
                    current.includes(prompt.id)
                      ? current.filter((i) => i !== prompt.id)
                      : [...current, prompt.id],
                  )
                }
                className={`min-h-28 rounded-2xl border p-5 text-left disabled:opacity-50 ${selected.includes(prompt.id) ? "border-espresso bg-paper-100 ring-2 ring-espresso" : "border-warmgray-300 bg-white hover:bg-paper-50"}`}
              >
                <span className="block text-sm font-medium text-ink-500">
                  {selected.includes(prompt.id)
                    ? "✓ Selected"
                    : categoryName(prompt.category)}
                </span>
                <span className="mt-2 block text-lg leading-7">
                  {prompt.question}
                </span>
              </button>
            ))}
          </div>
          {!prompts.length && (
            <p role="status" className="py-4">
              No questions match. Try a different word or category.
            </p>
          )}
          {prompts.length > limit && (
            <button
              className={`${portalSecondary} mt-4`}
              onClick={() => setLimit((value) => value + 12)}
            >
              Show more questions
            </button>
          )}
        </section>
      )}
      {moment && owner && (
        <section
          className="mb-8 rounded-[28px] border border-warmgray-200 bg-white p-5 sm:p-8"
          aria-label="Record your new story"
        >
          <p className="brand-eyebrow">{categoryName(moment.category)}</p>
          <h2
            ref={recorderHeading}
            tabIndex={-1}
            className="my-4 font-display text-3xl leading-snug outline-none"
          >
            {moment.question}
          </h2>
          <p className="mb-5 text-lg leading-8">
            Share a moment you remember. A short story is enough.
          </p>
          <div className="mb-5 flex flex-wrap gap-3">
            {(["video", "voice"] as const).map((mode) => (
              <button
                key={mode}
                aria-pressed={kind === mode}
                disabled={recording || busy || !!unattached}
                onClick={() => {
                  setKind(mode);
                  setConsent(false);
                }}
                className={kind === mode ? portalPrimary : portalSecondary}
              >
                {mode === "video" ? "Camera and voice" : "Voice only"}
              </button>
            ))}
          </div>
          {moment.processingError && (
            <p
              role="alert"
              className="mb-4 rounded-xl bg-clay-50 p-4 leading-7"
            >
              {moment.processingError} You can check the saved recording below
              or record another take.
            </p>
          )}
          <SavedRecorder
            key={`${moment.id}-${kind}`}
            collectionId={id}
            accessKey={accessKey}
            kind={kind}
            questionId={`moment:${moment.id}`}
            momentId={moment.id}
            prompt={moment.question}
            directUpload={c.capabilities.directUpload}
            disabled={busy}
            autoRecoverBackup={!moment.sourceMediaId}
            onBusyChange={setRecording}
            onPendingChange={setPendingRecording}
            onMediaSaved={(media) => attach(moment.id, media.mediaId)}
          />
          {unattached && (
            <button
              className={`${portalSecondary} mt-4`}
              disabled={busy || recording}
              onClick={() =>
                void attach(unattached.momentId, unattached.mediaId).catch(
                  () => {},
                )
              }
            >
              Save this recording to the story
            </button>
          )}
          {moment.sourceMediaId && !unattached && (
            <div className="mt-6">
              <p className="mb-3 font-medium">Your selected recording</p>
              {moment.kind === "video" ? (
                <video
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full rounded-xl bg-espresso"
                  src={mediaUrl(moment.sourceMediaId)}
                />
              ) : (
                <audio
                  controls
                  preload="metadata"
                  className="w-full"
                  src={mediaUrl(moment.sourceMediaId)}
                />
              )}
              {pendingRecording && !recording && (
                <p role="status" className="mt-4 text-base leading-7">
                  Finish saving your latest take, or choose a backed-up take
                  below, before submitting.
                </p>
              )}
              <label className="my-5 flex gap-3 text-lg leading-8">
                <input
                  type="checkbox"
                  className="mt-2 h-6 w-6 shrink-0 accent-espresso"
                  checked={consent}
                  disabled={busy || recording || pendingRecording}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  Prepare this recording as a film and book chapter, then share
                  it with the people who have access to my collection.
                </span>
              </label>
              <button
                disabled={!consent || busy || recording || pendingRecording}
                className={portalPrimary}
                onClick={() => void submit()}
              >
                {busy ? "Submitting…" : "Submit this story"}
              </button>
            </div>
          )}
          <button
            className={`${portalSecondary} mt-5 sm:ml-3`}
            disabled={recording || busy || !!unattached}
            onClick={() => {
              setRecordId("");
              setConsent(false);
            }}
          >
            Return to my library
          </button>
        </section>
      )}
      {!recordId && (
        <>
          {pendingStories.length > 0 && (
            <section id="new-moments" className="mb-8 scroll-mt-5">
              <h2 className="mb-4 font-display text-2xl">
                {owner ? "Your next stories" : "Questions sent"}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {pendingStories.map((m) => (
                  <article
                    key={m.id}
                    className="rounded-2xl border border-warmgray-200 bg-white p-5"
                  >
                    <p className="text-sm text-ink-500">
                      {categoryName(m.category)}
                    </p>
                    <h3 className="my-3 text-xl leading-8">{m.question}</h3>
                    <p className="text-base leading-7">
                      {m.status === "processing"
                        ? "Preparing the film and book chapter…"
                        : m.status === "needs_attention"
                          ? "This story needs attention. The original recording is saved."
                          : owner
                            ? "Ready whenever you are."
                            : "Waiting for a story."}
                    </p>
                    {owner && m.processingError && (
                      <p
                        role="alert"
                        className="mt-3 rounded-xl bg-clay-50 p-4 text-base leading-7"
                      >
                        {m.processingError}
                      </p>
                    )}
                    {owner && m.status !== "processing" && (
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          disabled={busy}
                          className={portalPrimary}
                          id={`record-moment-${m.id}`}
                          onClick={() => {
                            returnFocus.current = `record-moment-${m.id}`;
                            setPendingRecording(true);
                            setRecordId(m.id);
                            setKind(m.kind || "video");
                            setConsent(false);
                            setNotice("");
                            setChoosing(false);
                            setUnattached(undefined);
                            player.current?.pause();
                            setWatchAll(false);
                          }}
                        >
                          {" "}
                          {m.sourceMediaId
                            ? "Open saved recording"
                            : "Record this story"}
                        </button>
                        <button
                          className={portalSecondary}
                          disabled={busy}
                          onClick={() =>
                            void act({ action: "decline", momentId: m.id })
                          }
                        >
                          Pass on this question
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
          <section
            id="story-library"
            aria-label="Story library"
            className="scroll-mt-5"
          >
            <h2 className="font-display text-3xl">Your story library</h2>
            <div className="my-5 grid gap-4 sm:grid-cols-2">
              <label className="font-medium">
                Search your stories
                <input
                  className={`${portalField} mt-2`}
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setWatchAll(false);
                  }}
                  placeholder="A person, place, or memory"
                />
              </label>
              <label className="font-medium">
                Show stories
                <select
                  className={`${portalField} mt-2`}
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setWatchAll(false);
                  }}
                >
                  <option value="all">Every part of life</option>
                  <option value="original">The original gift</option>
                  {FLOURISHING_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {playlist.length > 1 && (
              <button
                className={`${portalSecondary} mb-5`}
                onClick={() => {
                  setWatchAll(true);
                  setActiveId(playlist[0].id);
                }}
              >
                Watch all {playlist.length} films
              </button>
            )}
            {active && (
              <article className="mb-7 overflow-hidden rounded-[28px] border border-warmgray-200 bg-white">
                <div className="p-5 sm:p-7">
                  <p className="text-sm font-medium">
                    {categoryName(active.category)}
                    {watchAll
                      ? ` · Film ${playlist.findIndex((p) => p.id === active.id) + 1} of ${playlist.length}`
                      : ""}
                  </p>
                  <h3 className="mt-2 font-display text-2xl">{active.title}</h3>
                </div>
                {active.videoMediaId && (
                  <video
                    ref={player}
                    key={active.id}
                    controls
                    playsInline
                    autoPlay={watchAll}
                    preload="metadata"
                    className="aspect-video w-full bg-espresso"
                    src={mediaUrl(active.videoMediaId)}
                    onEnded={() => {
                      if (!watchAll) return;
                      const index = playlist.findIndex(
                        (p) => p.id === active.id,
                      );
                      const next = index >= 0 ? playlist[index + 1] : undefined;
                      if (next) setActiveId(next.id);
                      else {
                        setWatchAll(false);
                        setNotice("You’ve reached the end of these stories.");
                      }
                    }}
                  />
                )}
                <div className="p-5 sm:p-7">
                  {active.videoMediaId && (
                    <a
                      className={portalSecondary}
                      href={mediaUrl(active.videoMediaId, true)}
                      download
                    >
                      Download this film
                    </a>
                  )}
                  <details className="mt-5">
                    <summary className="min-h-12 cursor-pointer text-lg font-medium">
                      Read this chapter
                    </summary>
                    <div className="mt-3 whitespace-pre-line text-lg leading-8">
                      {active.content}
                    </div>
                  </details>
                </div>
              </article>
            )}
            <p role="status" className="mb-4 text-base text-ink-500">
              {filtered.length} {filtered.length === 1 ? "story" : "stories"}
              {query ? " found" : " saved"}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((entry) => (
                <button
                  key={entry.id}
                  aria-pressed={activeId === entry.id}
                  onClick={() => {
                    setWatchAll(false);
                    setActiveId(entry.id);
                  }}
                  className={`min-h-44 rounded-2xl border p-6 text-left ${activeId === entry.id ? "border-espresso bg-paper-100" : "border-warmgray-200 bg-white hover:border-espresso"}`}
                >
                  <span className="text-sm text-ink-500">
                    {categoryName(entry.category)}
                  </span>
                  <span className="my-3 block font-display text-2xl leading-8">
                    {entry.title}
                  </span>
                  <span className="text-base font-medium">
                    {entry.videoMediaId ? "Watch and read" : "Read this story"}{" "}
                    →
                  </span>
                </button>
              ))}
            </div>
            {!filtered.length && (
              <p className="rounded-2xl border border-warmgray-200 p-6 text-lg">
                No stories match yet. Try another word or choose Every part of
                life.
              </p>
            )}
            <details className="mt-6">
              <summary className="min-h-12 cursor-pointer text-base font-medium">
                Earlier book editions
              </summary>
              <a
                className="flex min-h-12 items-center underline"
                href={`/api/collection/${encodeURIComponent(id)}/book?${new URLSearchParams({ edition: "original", ...(accessKey ? { key: accessKey } : {}) })}`}
              >
                Download the original four-chapter book
              </a>
              {living.moments
                .filter((m) => m.status === "published" && m.publishedAt)
                .map((m) => (
                  <a
                    key={m.id}
                    className="flex min-h-12 items-center underline"
                    href={`/api/collection/${encodeURIComponent(id)}/book?${new URLSearchParams({ through: m.publishedAt!, ...(accessKey ? { key: accessKey } : {}) })}`}
                  >
                    Book through “{m.title}”
                  </a>
                ))}
            </details>
          </section>
        </>
      )}
    </PortalShell>
  );
}
