"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { AppIcon } from "@/components/icons";
import type { ChapterPackage, CollectionView } from "@/lib/collection/types";

export const portalPrimary =
  "brand-button-primary min-h-12 px-5 py-3 disabled:cursor-not-allowed disabled:opacity-50";
export const portalSecondary =
  "brand-button-secondary min-h-12 px-5 py-3 disabled:cursor-not-allowed disabled:opacity-50";
export const portalField =
  "mt-2 min-h-12 w-full rounded-xl border border-warmgray-300 bg-white px-4 py-3 text-base leading-7 text-ink";
export const mediaPath = (id: string, mediaId: string, key: string) =>
  `/api/collection/${encodeURIComponent(id)}/media/${encodeURIComponent(mediaId)}?key=${encodeURIComponent(key)}`;
export const isNarratedFilm = (chapter: ChapterPackage) =>
  Boolean(
    (chapter as ChapterPackage & { film?: { narrationKind?: string } }).film
      ?.narrationKind === "ai_interviewer",
  );

export function PortalShell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto min-h-screen max-w-[1320px] px-5 pb-10 pt-6 sm:px-8 lg:px-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
        <Logo className="[&_svg]:h-10 sm:[&_svg]:h-12" />
        <nav
          aria-label="Your collection"
          className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1"
        >
          <Link
            href="/account"
            className="inline-flex min-h-12 items-center text-base font-medium underline underline-offset-4"
          >
            My stories
          </Link>
          <Link
            href="/privacy"
            className="inline-flex min-h-11 items-center gap-2 text-sm text-ink-500"
          >
            <AppIcon name="shield" size={16} />
            Private collection
          </Link>
        </nav>
      </header>
      {children}
    </main>
  );
}

export function PortalError({ message }: { message: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (message) ref.current?.focus();
  }, [message]);
  return message ? (
    <p
      ref={ref}
      tabIndex={-1}
      role="alert"
      className="my-5 rounded-xl border border-clay-300 bg-clay-50 p-4 text-base leading-7"
    >
      {message}
    </p>
  ) : null;
}

export function PrivateLink({
  path,
  label,
  description,
}: {
  path: string;
  label: string;
  description?: string;
}) {
  const inputId = useId();
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setUrl(new URL(path, window.location.origin).href);
    setMessage("");
  }, [path]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Link copied.");
    } catch {
      ref.current?.focus();
      ref.current?.select();
      setMessage("Select and copy the address to save it.");
    }
  }
  return (
    <div className="min-w-0">
      <label htmlFor={inputId} className="block text-base font-medium">
        {label}
      </label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <input
          id={inputId}
          ref={ref}
          value={url}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-warmgray-300 bg-white px-3 text-base text-ink"
        />
        <button
          type="button"
          className={portalSecondary}
          disabled={!url}
          onClick={copy}
        >
          Copy link
        </button>
      </div>
      {description && (
        <p className="mt-2 text-sm leading-6 text-ink-500">{description}</p>
      )}
      <p role="status" className="mt-1 text-sm text-sage-700">
        {message}
      </p>
    </div>
  );
}

export function SourceArchive({
  collection: c,
  accessKey,
}: {
  collection: CollectionView;
  accessKey: string;
}) {
  const originals = new Map<
    string,
    { id: string; kind: "video" | "voice"; label: string }
  >();
  c.takes.forEach((take) => {
    if (take.mediaId && take.kind !== "text")
      originals.set(take.mediaId, {
        id: take.mediaId,
        kind: take.kind,
        label: take.prompt || "Original answer",
      });
  });
  c.interviews?.forEach((interview, sessionIndex) =>
    interview.segments.forEach((segment, index) => {
      originals.set(segment.mediaId, {
        id: segment.mediaId,
        kind: segment.kind,
        label: `Conversation ${sessionIndex + 1}, recording ${index + 1}`,
      });
    }),
  );
  return (
    <details className="rounded-2xl border border-warmgray-200 bg-white p-5 sm:p-6">
      <summary className="min-h-11 cursor-pointer text-lg font-semibold">
        Your original recordings{" "}
        <span className="ml-2 text-sm font-normal text-ink-500">
          {originals.size} saved
        </span>
      </summary>
      <p className="mt-2 max-w-3xl text-sm leading-7 text-ink-500">
        These are your unedited recordings. They may include the interviewer and
        other answers. The narrated films are separate versions, and do not
        replace these originals.
      </p>
      {c.usage && (
        <div className="mt-4 rounded-xl bg-paper p-4 text-sm leading-7 text-ink-500">
          <p>
            Collection storage:{" "}
            {(c.usage.usedBytes / 1024 / 1024).toLocaleString(undefined, {
              maximumFractionDigits: 1,
            })}{" "}
            MB used of{" "}
            {(c.usage.limitBytes / 1024 / 1024 / 1024).toLocaleString(
              undefined,
              { maximumFractionDigits: 1 },
            )}{" "}
            GB.
          </p>
          {c.usage.reservedBytes > 0 && (
            <p>Uploads in progress also reserve some of this space.</p>
          )}
          {c.usage.nearLimit && (
            <p className="mt-2 font-medium text-oxblood">
              Your collection is close to its storage limit. Existing recordings
              are kept. A new upload may need to be smaller.
            </p>
          )}
        </div>
      )}
      <div className="mt-5 grid gap-6 md:grid-cols-2">
        {[...originals.values()].map((source) => (
          <section key={source.id} className="min-w-0 rounded-xl bg-paper p-4">
            <h3 className="mb-3 text-base font-medium">{source.label}</h3>
            {source.kind === "video" ? (
              <video
                controls
                playsInline
                preload="none"
                className="aspect-video w-full rounded-lg bg-espresso"
                aria-label={source.label}
                src={mediaPath(c.id, source.id, accessKey)}
              />
            ) : (
              <audio
                controls
                preload="none"
                className="w-full"
                aria-label={source.label}
                src={mediaPath(c.id, source.id, accessKey)}
              />
            )}
            <a
              href={mediaPath(c.id, source.id, accessKey)}
              download
              className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-medium underline underline-offset-4"
            >
              <AppIcon name="download" size={16} />
              Download original
            </a>
          </section>
        ))}
      </div>
      {!originals.size && (
        <p className="mt-4 text-base text-ink-500">
          No original audio or video has been saved for this collection. Written
          answers are available with each story.
        </p>
      )}
    </details>
  );
}

export function ContactSummary({
  collection: c,
}: {
  collection: CollectionView;
}) {
  return (
    <dl className="grid gap-5 rounded-2xl border border-warmgray-200 bg-white p-5 sm:grid-cols-2 sm:p-6">
      <div>
        <dt className="text-xs font-medium uppercase tracking-[.12em] text-ink-500">
          Storyteller
        </dt>
        <dd className="mt-2 text-lg font-semibold">{c.storyteller.name}</dd>
        <dd className="mt-1 break-all text-sm text-ink-500">
          {c.storyteller.email}
        </dd>
      </div>
      <div>
        <dt className="text-xs font-medium uppercase tracking-[.12em] text-ink-500">
          Sharing with
        </dt>
        <dd className="mt-2 text-lg font-semibold">{c.recipient.name}</dd>
        <dd className="mt-1 break-all text-sm text-ink-500">
          {c.recipient.email}
        </dd>
        {c.recipient.phone && (
          <dd className="mt-1 text-sm text-ink-500">{c.recipient.phone}</dd>
        )}
      </div>
    </dl>
  );
}
