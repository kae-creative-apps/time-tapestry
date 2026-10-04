"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import type {
  adminCollectionList,
  adminCollectionDetail,
} from "@/lib/admin-collections";

type Listing = Awaited<ReturnType<typeof adminCollectionList>>;
type Detail = NonNullable<Awaited<ReturnType<typeof adminCollectionDetail>>>;
const bytes = (n: number) =>
  n >= 1024 ** 3
    ? `${(n / 1024 ** 3).toFixed(2)} GiB`
    : `${(n / 1024 ** 2).toFixed(1)} MiB`;
const date = (s: string) => new Date(s).toLocaleString();
const button =
  "inline-flex min-h-12 items-center justify-center rounded-full border border-warmgray-300 bg-white px-5 py-3 text-base font-medium hover:bg-sage-100 disabled:opacity-50";
const panel = "rounded-2xl border border-warmgray-200 bg-white p-5 sm:p-7";

function useAdminData<T>(url: string, returnPath: string) {
  const router = useRouter();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(url, { cache: "no-store", signal });
        if (response.status === 401) {
          router.replace(
            `/admin/login?redirect=${encodeURIComponent(returnPath)}`,
          );
          return;
        }
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "These records could not be opened.");
        if (!signal?.aborted) setData(result);
      } catch (e) {
        if (!signal?.aborted)
          setError(e instanceof Error ? e.message : "Please try again.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [url, returnPath, router],
  );
  useEffect(() => {
    const c = new AbortController();
    void load(c.signal);
    return () => c.abort();
  }, [load]);
  return { data, loading, error, reload: () => void load() };
}

export function CollectionAdminList() {
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const { data, loading, error, reload } = useAdminData<Listing>(
    `/api/admin/collections?offset=${offset}&limit=50`,
    "/admin/collections",
  );
  const items =
    data?.items.filter((item) =>
      `${item.storytellerName} ${item.storytellerEmail} ${item.recipientName} ${item.id}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) || [];
  return (
    <div className="min-h-screen bg-paper">
      <AdminNav />
      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-sm text-ink-600">Private team workspace</p>
            <h1 className="mt-2 text-3xl sm:text-4xl">
              Stories and recordings
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-ink-600">
              Find a tester, check their saved work, and download a recovery
              copy. Opening records and recordings is logged.
            </p>
          </div>
          <button className={button} disabled={loading} onClick={reload}>
            {loading ? "Refreshing…" : "Refresh records"}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-6 rounded-xl bg-clay-50 p-4">
            {error}
          </p>
        )}
        {data && (
          <>
            <section aria-label="Storage readiness" className={`${panel} mt-8`}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 className="text-xl">Storage and protection</h2>
                <span className="rounded-full bg-sage-100 px-4 py-2 text-sm">
                  {data.total} collections
                </span>
              </div>
              <dl className="mt-5 grid gap-5 text-base sm:grid-cols-3">
                <div>
                  <dt className="text-ink-600">Stories and contact details</dt>
                  <dd className="mt-1 font-medium">
                    {data.health.durableMetadataConfigured
                      ? "Cloud database configured"
                      : "Local files"}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-600">Original recordings</dt>
                  <dd className="mt-1 font-medium">
                    {data.health.mediaStoreConfigured
                      ? "Private cloud storage configured"
                      : "Local files"}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-600">Public site protection</dt>
                  <dd className="mt-1 font-medium">
                    {data.health.protectionConfigured
                      ? "Configured"
                      : "Setup needed before public testing"}
                  </dd>
                </div>
              </dl>
              {data.health.temporaryLocalStorage && (
                <p
                  role="status"
                  className="mt-5 rounded-xl border border-clay/50 bg-clay-50 p-4 leading-7"
                >
                  This preview saves recordings in a temporary folder on this
                  computer. Schedule a stopped-server migration and a verified
                  backup before inviting a group to test.
                </p>
              )}
              <details className="mt-5 border-t border-warmgray-200 pt-4">
                <summary className="min-h-10 cursor-pointer font-medium">
                  Backup and capacity details
                </summary>
                <p className="mt-3 leading-7">
                  Cloud storage configuration is not proof of a separate backup.
                  Check the backup manifest and restore test before promising
                  recovery. Browser copies are recovery aids and may be cleared
                  by the browser.
                </p>
                <p className="mt-3 leading-7">
                  Pilot allowance:{" "}
                  {data.health.limits.collectionBytes
                    ? bytes(data.health.limits.collectionBytes)
                    : "configuration needed"}{" "}
                  per collection, {bytes(data.health.limits.fileBytes)} per
                  upload, and {data.health.limits.sessionMinutes} minutes per
                  live connection. A person can return for another session
                  before approval.
                </p>
                <p className="mt-3 leading-7">{data.health.retention}</p>
                {data.health.caveats.map((note) => (
                  <p key={note} className="mt-3 text-sm leading-6 text-ink-600">
                    {note}
                  </p>
                ))}
              </details>
            </section>
            <section
              aria-label="Automatic processing readiness"
              className={`${panel} mt-5`}
            >
              <h2 className="text-xl">Automatic processing</h2>
              <p className="mt-3 text-base leading-7 text-ink-600">
                These checks show configuration and the latest worker heartbeat.
                A connected service still needs an end-to-end delivery test.
              </p>
              <dl className="mt-5 grid gap-5 text-base sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-ink-600">Film worker</dt>
                  <dd className="mt-1 font-medium">
                    {data.automation.workerOnline ? "Online" : "Offline"}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-600">Original audio transcription</dt>
                  <dd className="mt-1 font-medium">
                    {data.automation.originalTranscriptionConfigured
                      ? "Configured"
                      : "Setup needed"}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-600">Account email</dt>
                  <dd className="mt-1 font-medium">
                    {data.automation.accountEmailConfigured
                      ? "Configured"
                      : "Setup needed"}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-600">Notification sending</dt>
                  <dd className="mt-1 font-medium">
                    {data.automation.notificationsEnabled
                      ? "Enabled"
                      : "Disabled"}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-600">
                    Scheduled delivery authentication
                  </dt>
                  <dd className="mt-1 font-medium">
                    {data.automation.schedulerAuthenticated
                      ? "Configured"
                      : "Setup needed"}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-600">Postcard mailing</dt>
                  <dd className="mt-1 font-medium">
                    {data.automation.postcards.ready ? "Configured" : "On hold"}
                  </dd>
                </div>
              </dl>
              {!data.automation.postcards.ready && (
                <ul className="mt-5 space-y-2 text-sm leading-6 text-ink-600">
                  {data.automation.postcards.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}
            </section>
            <label className="mt-8 block text-base font-medium">
              Find a person on this page
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, email or collection ID"
                className="mt-2 w-full bg-white sm:max-w-lg"
              />
            </label>
            <div className="mt-5 grid gap-4">
              {items.map((item) => (
                <Link
                  key={item.id}
                  href={`/admin/collections/${item.id}`}
                  className={`${panel} block transition-colors hover:border-espresso/50`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl">{item.storytellerName}</h2>
                      <p className="mt-1 break-words text-base text-ink-600">
                        {item.storytellerEmail}
                      </p>
                      <p className="mt-2 text-sm text-ink-600">
                        A story for {item.recipientName}
                      </p>
                    </div>
                    <span className="rounded-full bg-sage-100 px-4 py-2 text-sm capitalize">
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-600">
                    <span>{item.mediaCount} saved files</span>
                    <span>{bytes(item.usage.usedBytes)} stored</span>
                    <span>Films: {item.filmStatus || "not started"}</span>
                    <span>Updated {date(item.updatedAt)}</span>
                  </div>
                  {item.failureCount > 0 && (
                    <p className="mt-3 font-medium text-oxblood">
                      {item.failureCount} issue
                      {item.failureCount === 1 ? "" : "s"} to review
                    </p>
                  )}
                  <p className="mt-4 text-base font-medium underline underline-offset-4">
                    Open saved work
                  </p>
                </Link>
              ))}
            </div>
            {!items.length && (
              <p className="py-10 text-ink-600">
                No matching collections on this page.
              </p>
            )}
            <div className="mt-6 flex items-center justify-between gap-4">
              <button
                className={button}
                disabled={offset === 0 || loading}
                onClick={() => setOffset(Math.max(0, offset - 50))}
              >
                Previous
              </button>
              <p className="text-sm">
                {data.total ? offset + 1 : 0}–
                {Math.min(offset + 50, data.total)} of {data.total}
              </p>
              <button
                className={button}
                disabled={offset + 50 >= data.total || loading}
                onClick={() => setOffset(offset + 50)}
              >
                Next
              </button>
            </div>
          </>
        )}
        {loading && !data && (
          <p role="status" className="py-12">
            Opening saved collections…
          </p>
        )}
      </main>
    </div>
  );
}

function RecordingRow({
  media,
  collectionId,
}: {
  media: Detail["media"][number];
  collectionId: string;
}) {
  const [opened, setOpened] = useState(false);
  const source = `/api/admin/collections/${collectionId}/media/${media.id}`;
  return (
    <article className="border-b border-warmgray-200 py-5 last:border-0">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="break-all font-medium">{media.originalName}</p>
          <p className="mt-1 text-sm text-ink-600">
            {media.kind === "film" ? "Generated film" : "Original recording"} ·{" "}
            {bytes(media.bytes)} · {date(media.createdAt)}
          </p>
          <p className="mt-1 text-sm text-ink-600">
            {media.availability === "cloud-unverified"
              ? "Cloud copy recorded. Open to verify availability."
              : media.availability === "local-ready"
                ? "Local copy found"
                : media.availability === "missing"
                  ? "File missing. Recovery needed."
                  : "Upload incomplete"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {media.available && (
            <>
              <button onClick={() => setOpened(!opened)} className={button}>
                {opened ? "Close player" : "Play recording"}
              </button>
              <a href={`${source}?download=1`} className={button}>
                Download
              </a>
            </>
          )}
        </div>
      </div>
      {opened &&
        (media.mimeType.startsWith("video/") ? (
          <video
            src={source}
            controls
            playsInline
            preload="metadata"
            className="mt-4 max-h-96 w-full rounded-xl bg-espresso"
          />
        ) : (
          <audio
            src={source}
            controls
            preload="metadata"
            className="mt-4 w-full"
          />
        ))}
    </article>
  );
}

export function CollectionAdminDetail({ id }: { id: string }) {
  const { data, loading, error, reload } = useAdminData<Detail>(
    `/api/admin/collections/${id}`,
    `/admin/collections/${id}`,
  );
  return (
    <div className="min-h-screen bg-paper">
      <AdminNav />
      <main className="mx-auto max-w-6xl px-5 py-9 sm:px-8">
        <Link
          href="/admin/collections"
          className="inline-flex min-h-12 items-center text-base underline underline-offset-4"
        >
          All collections
        </Link>
        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-clay-50 p-4">
            {error}
          </p>
        )}
        {loading && !data && (
          <p className="py-8" role="status">
            Opening saved work…
          </p>
        )}
        {data && (
          <>
            <div className="mt-4 flex flex-wrap items-start justify-between gap-5">
              <div>
                <h1 className="text-3xl sm:text-4xl">
                  {data.collection.storyteller.name}’s collection
                </h1>
                <p className="mt-2 text-base text-ink-600">
                  For {data.collection.recipient.name} ·{" "}
                  {data.collection.status}
                </p>
                <p className="mt-2 text-sm text-ink-600">
                  Updated {date(data.collection.updatedAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button className={button} disabled={loading} onClick={reload}>
                  Refresh
                </button>
                <a
                  href={`/api/admin/collections/${id}?download=1`}
                  className={button}
                >
                  Download recovery manifest
                </a>
              </div>
            </div>
            <p className="mt-5 text-sm leading-6 text-ink-600">
              The recovery manifest contains saved words, contacts and file
              references. Download the recordings separately. It does not
              contain private access keys.
            </p>
            <section className={`${panel} mt-7`}>
              <h2 className="text-xl">Processing and storage</h2>
              <div className="mt-4 grid gap-5 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-ink-600">Originals and films</p>
                  <p className="mt-1 text-2xl">{data.media.length} files</p>
                </div>
                <div>
                  <p className="text-sm text-ink-600">Stored</p>
                  <p className="mt-1 text-2xl">{bytes(data.usage.usedBytes)}</p>
                  <p className="text-sm text-ink-600">
                    of {bytes(data.usage.limitBytes)} allowance
                  </p>
                </div>
                <div>
                  <p className="text-sm text-ink-600">Film generation</p>
                  <p className="mt-1 text-2xl capitalize">
                    {data.filmJob?.status || "Not started"}
                  </p>
                </div>
              </div>
              {data.filmJob?.error && (
                <p role="alert" className="mt-4 rounded-xl bg-clay-50 p-4">
                  {data.filmJob.error}
                </p>
              )}
              {data.collection.postcardPreparation && (
                <p className="mt-4 rounded-xl bg-paper p-4 text-base leading-7">
                  Postcards: {data.collection.postcardPreparation.message}
                </p>
              )}
              {data.collection.draftOutdated && (
                <p className="mt-4 text-oxblood">
                  Answers changed after drafting. The storyteller needs to
                  prepare a new draft.
                </p>
              )}
              {data.filmJob && (
                <ul className="mt-5 space-y-2">
                  {data.filmJob.chapters.map((ch) => (
                    <li key={ch.chapterId} className="text-base">
                      {ch.title}: {ch.status}
                      {ch.error ? `. ${ch.error}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className={`${panel} mt-5`}>
              <h2 className="text-xl">Saved recordings</h2>
              <p className="mt-2 text-base leading-7 text-ink-600">
                Original files stay separate from generated films. A missing
                upload cannot be recovered from this admin page if its only copy
                is still on the storyteller’s device.
              </p>
              {data.media.map((m) => (
                <RecordingRow key={m.id} media={m} collectionId={id} />
              ))}
              {!data.media.length && (
                <p className="py-7 text-ink-600">
                  No files have reached server storage yet.
                </p>
              )}
            </section>
            <details className={`${panel} mt-5`}>
              <summary className="min-h-10 cursor-pointer text-xl font-medium">
                Stories and saved words
              </summary>
              {data.collection.chapters.map((ch) => (
                <article
                  key={ch.id}
                  className="mt-5 border-t border-warmgray-200 pt-5"
                >
                  <h3 className="text-lg">{ch.title}</h3>
                  <p className="mt-2 whitespace-pre-wrap leading-7">
                    {ch.content}
                  </p>
                  <p className="mt-3 text-sm text-ink-600">
                    {ch.editorialReviewed
                      ? "Reviewed by storyteller"
                      : "Needs review"}
                    {ch.film?.narrationKind === "original_recording"
                      ? " · Original voice or video"
                      : ch.film
                        ? " · AI interviewer narration"
                        : ""}
                  </p>
                </article>
              ))}
              {data.collection.interviews.map((session) => (
                <details
                  key={session.id}
                  className="mt-5 rounded-xl bg-paper p-4"
                >
                  <summary className="min-h-10 cursor-pointer font-medium">
                    Conversation from {date(session.startedAt)},{" "}
                    {session.turns.length} saved turns
                  </summary>
                  {session.turns.map((turn) => (
                    <div key={turn.id} className="mt-4">
                      <p className="text-sm font-medium text-ink-600">
                        {turn.role === "agent" ? "Interviewer" : "Storyteller"}
                        {session.excludedTurnIds.includes(turn.id)
                          ? " · Excluded from story"
                          : ""}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap leading-7">
                        {turn.text}
                      </p>
                    </div>
                  ))}
                </details>
              ))}
              {data.collection.takes.map((take) => (
                <article
                  key={take.id}
                  className="mt-5 border-t border-warmgray-200 pt-4"
                >
                  <h3 className="text-base">{take.prompt}</h3>
                  <p className="mt-2 whitespace-pre-wrap leading-7">
                    {take.text || "Recording saved without written words."}
                  </p>
                </article>
              ))}
            </details>
            <details className={`${panel} mt-5`}>
              <summary className="min-h-10 cursor-pointer text-xl font-medium">
                Contact and delivery details
              </summary>
              <div className="mt-4 grid gap-6 sm:grid-cols-2">
                {[data.collection.storyteller, data.collection.recipient].map(
                  (contact, i) => (
                    <div key={i}>
                      <h3 className="text-base">
                        {i ? "Recipient" : "Storyteller"}
                      </h3>
                      <p className="mt-2">{contact.name}</p>
                      <p className="break-words">{contact.email}</p>
                      {contact.phone && <p>{contact.phone}</p>}
                    </div>
                  ),
                )}
              </div>
              {data.collection.address && (
                <p className="mt-4 leading-7">
                  {data.collection.address.line1}{" "}
                  {data.collection.address.line2},{" "}
                  {data.collection.address.city},{" "}
                  {data.collection.address.region}{" "}
                  {data.collection.address.postalCode}
                </p>
              )}
              <h3 className="mt-6 text-lg">Email status</h3>
              {data.collection.notifications.map((n) => (
                <div key={n.id} className="mt-3 rounded-xl bg-paper p-4">
                  <p>{n.subject}</p>
                  <p className="mt-1 text-sm">
                    {n.status} · Due {date(n.dueAt)}
                  </p>
                  {n.error && <p className="mt-2 text-oxblood">{n.error}</p>}
                </div>
              ))}
              <h3 className="mt-6 text-lg">Postcard status</h3>
              {data.collection.deliveries.length ? (
                data.collection.deliveries.map((d) => (
                  <p key={d.chapterId} className="mt-3 leading-7">
                    {d.chapterId}: {d.status}, {date(d.scheduledFor)}
                    {d.error ? `. ${d.error}` : ""}
                  </p>
                ))
              ) : (
                <p className="mt-2 text-ink-600">No postcards scheduled.</p>
              )}
            </details>
          </>
        )}
      </main>
    </div>
  );
}
