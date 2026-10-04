"use client";

import { useEffect, useRef, useState } from "react";
import { AppIcon } from "@/components/icons";
import {
  PortalError,
  PortalShell,
  portalPrimary,
  portalSecondary,
} from "./PortalUI";
import {
  getTakeBlob,
  listAllLocalDrafts,
  listAllLocalTakes,
  recordingExtension,
  type LocalTake,
} from "@/lib/collection/local-takes";

type Preview = { takeId: string; url: string; bytes: number; filename: string };
const statusLabels: Record<LocalTake["state"], string> = {
  recording: "Recording was not finalized",
  local: "Saved on this device",
  backed_up: "Previously marked as backed up",
};
function recordingDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}
function duration(seconds?: number) {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0)
    return "Duration not recorded";
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")} recorded`;
}

/** This screen never fetches collection data, uploads, edits or deletes a take. */
export function DeviceRecordingRecovery() {
  const [takes, setTakes] = useState<LocalTake[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [recordingError, setRecordingError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playError, setPlayError] = useState("");
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [draftDownload, setDraftDownload] = useState<{
    url: string;
    count: number;
  } | null>(null);
  const media = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const objectUrl = useRef<string | null>(null);
  const operation = useRef(0);
  const draftOperation = useRef(0);
  const draftUrl = useRef<string | null>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);

  function closePreview() {
    media.current?.pause();
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    setPreview(null);
    setPlaying(false);
    setPlayError("");
  }
  useEffect(
    () => () => {
      operation.current += 1;
      draftOperation.current += 1;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
      if (draftUrl.current) URL.revokeObjectURL(draftUrl.current);
      draftUrl.current = null;
    },
    [],
  );
  useEffect(() => {
    if (preview) previewHeading.current?.focus();
  }, [preview]);

  async function findRecordings() {
    if (searching || opening) return;
    const current = ++operation.current;
    setSearching(true);
    setError("");
    setRecordingError(null);
    try {
      const found = await listAllLocalTakes();
      if (current === operation.current) setTakes(found);
    } catch {
      if (current === operation.current)
        setError(
          "This browser could not open its saved recordings. Try again in a regular browser window using the same site address you used to record.",
        );
    } finally {
      if (current === operation.current) setSearching(false);
    }
  }
  async function openRecording(take: LocalTake) {
    if (opening || searching) return;
    const current = ++operation.current;
    setOpening(take.id);
    setRecordingError(null);
    try {
      const blob = await getTakeBlob(take);
      if (current !== operation.current) return;
      if (!blob.size) throw new Error("Empty recording");
      closePreview();
      const nextUrl = URL.createObjectURL(blob);
      objectUrl.current = nextUrl;
      const safeId = take.id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
      setPreview({
        takeId: take.id,
        url: nextUrl,
        bytes: blob.size,
        filename: `time-tapestry-original-${safeId}.${recordingExtension(take.mimeType)}`,
      });
    } catch {
      if (current === operation.current)
        setRecordingError({
          id: take.id,
          message:
            "A saved entry was found, but its recording data could not be opened in this browser. Nothing has been changed. Try the browser and site address you used to record.",
        });
    } finally {
      if (current === operation.current) setOpening(null);
    }
  }
  async function play() {
    setPlayError("");
    if (playing) {
      media.current?.pause();
      return;
    }
    try {
      await media.current?.play();
    } catch {
      setPlayError(
        "This browser could not play this recording. Download the original and try opening it in a media player. An interrupted recording may be incomplete.",
      );
    }
  }
  async function prepareDraftDownload() {
    if (draftBusy) return;
    const current = ++draftOperation.current;
    setDraftBusy(true);
    setDraftError("");
    try {
      const drafts = await listAllLocalDrafts();
      if (current !== draftOperation.current) return;
      const blob = new Blob(
        [
          JSON.stringify(
            {
              format: "time-tapestry-device-drafts-v1",
              exportedAt: new Date().toISOString(),
              siteAddress: window.location.origin,
              drafts,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      );
      if (draftUrl.current) URL.revokeObjectURL(draftUrl.current);
      const url = URL.createObjectURL(blob);
      draftUrl.current = url;
      setDraftDownload({ url, count: drafts.length });
    } catch {
      if (current === draftOperation.current)
        setDraftError(
          "Saved written drafts could not be read in this browser. Nothing has been changed. Try again using the browser and site address where you wrote them.",
        );
    } finally {
      if (current === draftOperation.current) setDraftBusy(false);
    }
  }

  return (
    <PortalShell>
      <div className="mx-auto max-w-3xl text-espresso">
        <header className="rounded-3xl border border-warmgray-300 bg-white p-6 sm:p-9">
          <p className="brand-eyebrow text-espresso">Your device copies</p>
          <h1 className="mt-4 text-3xl font-semibold leading-tight sm:text-4xl">
            Find your saved recordings
          </h1>
          <p className="mt-5 text-lg leading-8">
            You can look for recordings saved in this browser even if your story
            collection will not open.
          </p>
          <p className="mt-4 text-base leading-7">
            Each browser and site address keeps separate copies. Use the same
            browser, device and site address you used when recording.
          </p>
          <button
            type="button"
            disabled={searching || Boolean(opening)}
            onClick={() => void findRecordings()}
            className={`${portalPrimary} mt-6 inline-flex min-h-14 items-center gap-3 text-lg`}
          >
            <AppIcon name="collection" size={23} />
            {searching
              ? "Looking on this device…"
              : "Find recordings on this device"}
          </button>
          <p className="mt-4 text-base leading-7">
            This page only reads device copies. It does not upload, change or
            delete recordings. Server backup status cannot be verified here.
          </p>
        </header>
        <section
          className="mt-6 rounded-2xl border border-warmgray-300 bg-white p-5 sm:p-7"
          aria-labelledby="written-recovery-heading"
        >
          <h2 id="written-recovery-heading" className="text-2xl font-semibold">
            Save your written drafts, too
          </h2>
          <p className="mt-3 text-base leading-7">
            Save a file containing the written drafts this browser kept,
            including unfinished answers or messages. This does not restore
            access to a collection.
          </p>
          <button
            type="button"
            disabled={draftBusy}
            onClick={() => void prepareDraftDownload()}
            className={`${portalSecondary} mt-4 min-h-14 text-lg`}
          >
            {draftBusy
              ? "Reading written drafts…"
              : "Find saved written drafts"}
          </button>
          <PortalError message={draftError} />
          {draftDownload && (
            <div className="mt-4">
              <p role="status" className="text-base leading-7">
                {draftDownload.count === 0
                  ? "No written drafts were found in this browser at this site address."
                  : `${draftDownload.count} saved ${draftDownload.count === 1 ? "draft" : "drafts"} found. The file contains your original saved text.`}
              </p>
              {draftDownload.count > 0 && (
                <a
                  href={draftDownload.url}
                  download="time-tapestry-written-drafts.json"
                  className={`${portalPrimary} mt-4 inline-flex min-h-14 items-center gap-2 text-lg`}
                >
                  <AppIcon name="download" size={22} />
                  Download written drafts
                </a>
              )}
            </div>
          )}
        </section>
        <PortalError message={error} />
        {searching && (
          <p role="status" className="mt-6 text-lg">
            Looking for saved recordings in this browser…
          </p>
        )}
        {takes !== null && (
          <section
            className="mt-8"
            aria-label="Recordings found on this device"
          >
            <h2 className="text-2xl font-semibold" role="status">
              {takes.length === 0
                ? "No saved recordings found here"
                : `${takes.length} saved ${takes.length === 1 ? "recording" : "recordings"} found`}
            </h2>
            {!takes.length ? (
              <p className="mt-4 rounded-2xl border border-warmgray-300 bg-white p-5 text-lg leading-8">
                Try the browser and exact site address you used to record. A
                different browser or address has a separate storage area. This
                result does not tell us whether a server backup exists.
              </p>
            ) : (
              <p className="mt-3 text-base leading-7">
                Open a recording to preview it and download the original.
                Opening another recording closes the current preview.
              </p>
            )}
            <div className="mt-5 space-y-5">
              {takes.map((take, index) => {
                const selected = preview?.takeId === take.id ? preview : null;
                const isVideo =
                  take.kind === "video" || take.mimeType.startsWith("video/");
                const shared = selected
                  ? {
                      src: selected.url,
                      controls: true,
                      preload: "metadata" as const,
                      onPlay: () => setPlaying(true),
                      onPause: () => setPlaying(false),
                      onEnded: () => setPlaying(false),
                      onError: () =>
                        setPlayError(
                          "This recording could not play in this browser. You can still download the original. An interrupted recording may be incomplete.",
                        ),
                      "aria-label": `Recording ${index + 1} preview`,
                    }
                  : null;
                return (
                  <article
                    key={take.id}
                    className="rounded-2xl border border-warmgray-300 bg-white p-5 sm:p-7"
                  >
                    <h3 className="flex items-center gap-3 text-2xl font-semibold">
                      <AppIcon
                        name={isVideo ? "video" : "conversation"}
                        size={26}
                      />
                      Recording {index + 1}: {isVideo ? "video" : "audio"}
                    </h3>
                    <p className="mt-3 text-base leading-7">
                      {recordingDate(take.createdAt)} ·{" "}
                      {duration(take.durationSeconds)}
                    </p>
                    <p className="mt-3 inline-block rounded-lg bg-paper-200 px-3 py-2 text-base font-medium">
                      {statusLabels[take.state] || "Saved recording entry"}
                    </p>
                    {take.prompt && (
                      <p className="mt-4 break-words text-base leading-7">
                        {take.prompt}
                      </p>
                    )}
                    {take.state === "recording" && (
                      <p className="mt-3 text-base leading-7">
                        An unfinished recording may contain only the part saved
                        before it stopped.
                      </p>
                    )}
                    {!selected && (
                      <button
                        type="button"
                        className={`${portalSecondary} mt-5 min-h-14 text-lg`}
                        disabled={Boolean(opening) || searching}
                        onClick={() => void openRecording(take)}
                      >
                        {opening === take.id
                          ? "Opening recording…"
                          : "Preview or download"}
                      </button>
                    )}
                    {recordingError?.id === take.id && (
                      <PortalError message={recordingError.message} />
                    )}
                    {selected && shared && (
                      <div className="mt-5 border-t border-warmgray-300 pt-5">
                        <h4
                          ref={previewHeading}
                          tabIndex={-1}
                          className="text-xl font-semibold"
                        >
                          Recording preview
                        </h4>
                        {isVideo ? (
                          <video
                            key={selected.url}
                            ref={(element) => {
                              media.current = element;
                            }}
                            {...shared}
                            playsInline
                            className="mt-4 aspect-video w-full rounded-xl bg-espresso"
                          />
                        ) : (
                          <audio
                            key={selected.url}
                            ref={(element) => {
                              media.current = element;
                            }}
                            {...shared}
                            className="mt-4 w-full"
                          />
                        )}
                        <div className="mt-5 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => void play()}
                            className={`${portalSecondary} inline-flex min-h-14 items-center gap-2 text-lg`}
                          >
                            <AppIcon
                              name={playing ? "pause" : "play"}
                              size={22}
                            />
                            {playing ? "Pause" : "Play recording"}
                          </button>
                          <a
                            href={selected.url}
                            download={selected.filename}
                            className={`${portalPrimary} inline-flex min-h-14 items-center gap-2 text-lg`}
                          >
                            <AppIcon name="download" size={22} />
                            Download original
                          </a>
                        </div>
                        <p className="mt-3 text-base leading-7">
                          Original file ·{" "}
                          {(selected.bytes / 1024 / 1024).toFixed(1)} MB.
                          Downloading leaves the device copy in place.
                        </p>
                        <PortalError message={playError} />
                        <button
                          type="button"
                          onClick={closePreview}
                          className="mt-3 min-h-12 text-base font-medium underline underline-offset-4"
                        >
                          Close preview
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </PortalShell>
  );
}
