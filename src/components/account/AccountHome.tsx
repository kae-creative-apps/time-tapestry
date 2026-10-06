"use client";

import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { AppIcon } from "@/components/icons";
import { BrandPattern } from "@/components/BrandPattern";
import { HumanVerification } from "@/components/security/HumanVerification";
import { collectionRequest } from "@/lib/collection/client-request";
import {
  clearCollectionReturn,
  privateCollectionPath,
  readCollectionReturn,
} from "@/lib/accounts/client-navigation";
import type { LibraryItem } from "@/lib/accounts/types";
import {
  PortalError,
  PortalShell,
  portalField,
  portalPrimary,
  portalSecondary,
} from "@/components/collection/PortalUI";

type Session = {
  authenticated: boolean;
  email?: string;
  emailLoginAvailable: boolean;
};
function jsonRequest<T = any>(path: string, options?: RequestInit) {
  return collectionRequest<T>(path, options, 20000);
}

function SavedPrivateLink() {
  const inputId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    // Browser Back/Forward may restore this form with its pre-navigation state.
    const restore = () => setOpening(false);
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);
  function open(event: FormEvent) {
    event.preventDefault();
    const path = privateCollectionPath(value, window.location.origin);
    if (!path) {
      setError(
        "Paste the complete interview, collection or postcard link from this Time Tapestry site.",
      );
      return;
    }
    setError("");
    setOpening(true);
    window.location.assign(path);
  }
  return (
    <form onSubmit={open} className="space-y-4 text-left">
      <label htmlFor={inputId} className="block text-lg font-semibold text-ink">
        Open a saved story link
      </label>
      <p id={`${inputId}-help`} className="text-base leading-7 text-ink-500">
        Paste the Time Tapestry link you saved. Recipient collections require a
        verified email before stories can open.
      </p>
      <input
        id={inputId}
        type="text"
        inputMode="url"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        required
        maxLength={4096}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setError("");
          setOpening(false);
        }}
        aria-describedby={`${inputId}-help${error ? ` ${inputId}-error` : ""}`}
        aria-invalid={Boolean(error)}
        className={portalField}
        placeholder="Paste your story link"
      />
      {error && (
        <p
          id={`${inputId}-error`}
          role="alert"
          className="rounded-xl border border-clay-300 bg-clay-50 p-4 text-base leading-7"
        >
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={opening || !value.trim()}
        className={`${portalPrimary} w-full`}
      >
        {opening ? "Opening your collection…" : "Open my collection"}
        <AppIcon name="arrowRight" size={19} />
      </button>
    </form>
  );
}

export function AccountHome() {
  const [session, setSession] = useState<Session | null>(null);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [humanToken, setHumanToken] = useState("");
  const [humanReady, setHumanReady] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [returnPath, setReturnPath] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const next = await jsonRequest<Session>("/api/account/session", {
        signal,
      });
      if (signal?.aborted) return;
      setSession(next);
      if (next.authenticated) {
        const library = await jsonRequest<{ items: LibraryItem[] }>(
          "/api/account/library",
          { signal },
        );
        if (signal?.aborted) return;
        setItems(library.items || []);
      } else setItems([]);
    } catch (cause) {
      if (signal?.aborted) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "We could not open your account.",
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    try {
      const saved = readCollectionReturn(
        window.sessionStorage,
        window.location.origin,
      );
      if (!saved) return;
      setReturnPath(saved.path);
      const timer = setTimeout(() => {
        clearCollectionReturn(window.sessionStorage);
        setReturnPath("");
      }, saved.expiresAt - Date.now());
      return () => clearTimeout(timer);
    } catch {
      /* Private browsing can disable session storage. */
    }
  }, []);

  async function requestLink(event: FormEvent) {
    event.preventDefault();
    if (working || !humanReady) return;
    setWorking(true);
    setError("");
    try {
      await jsonRequest("/api/account/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), humanToken }),
      });
      setSentTo(email.trim());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "We could not send your link.",
      );
    } finally {
      setWorking(false);
      setResetKey((value) => value + 1);
    }
  }
  async function logout() {
    setWorking(true);
    setError("");
    setReturnPath("");
    try {
      clearCollectionReturn(window.sessionStorage);
    } catch {
      /* Optional tab navigation. */
    }
    try {
      await jsonRequest("/api/account/logout", { method: "POST" });
      setItems([]);
      setSentTo("");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We could not sign you out. Please try again.",
      );
    } finally {
      setWorking(false);
    }
  }
  const visible = items.filter(
    (item) =>
      (filter === "all" ||
        (filter === "mine" ? item.role === "owner" : item.role !== "owner")) &&
      `${item.storytellerName} ${item.recipientName}`
        .toLowerCase()
        .includes(query.toLowerCase().trim()),
  );
  return (
    <PortalShell backToCollection={returnPath}>
      {loading ? (
        <section className="mx-auto max-w-xl py-16 text-center">
          <h1 className="font-display text-4xl font-medium">
            Your stories, together.
          </h1>
          <p role="status" className="mt-5 text-lg text-ink-500">
            Opening your account…
          </p>
        </section>
      ) : session?.authenticated ? (
        <>
          <header className="brand-gradient-chocolate relative isolate overflow-hidden rounded-[28px] p-6 text-white sm:p-10">
            <BrandPattern
              variant="ribbon"
              className="absolute -right-24 -top-16 -z-10 w-[550px] max-w-none text-white opacity-[0.07]"
            />
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <p className="brand-eyebrow text-paper">
                  Stories woven together
                </p>
                <h1 className="mt-4 font-display text-4xl font-medium text-white sm:text-5xl">
                  Your story collections
                </h1>
                <p className="mt-4 max-w-2xl text-lg leading-8 text-paper">
                  Open a collection to find your written stories, original
                  recordings and finished story films.
                </p>
              </div>
              <Link
                href="/#begin"
                className="inline-flex min-h-12 items-center gap-3 rounded-xl bg-paper px-5 py-3 text-base font-medium text-espresso"
              >
                Start a story <AppIcon name="arrowRight" size={18} />
              </Link>
            </div>
          </header>
          <div className="my-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-base">
            <p className="min-w-0 break-all text-ink-500">
              Signed in as {session.email}
            </p>
            <button
              onClick={() => void logout()}
              disabled={working}
              className="min-h-12 font-medium underline underline-offset-4"
            >
              {working ? "Signing out…" : "Sign out"}
            </button>
          </div>
          <PortalError message={error} />
          {error && (
            <button
              type="button"
              onClick={() => void load()}
              className={`${portalSecondary} mb-6`}
            >
              Try loading my stories again
            </button>
          )}
          {items.length > 0 ? (
            <>
              <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div
                  aria-label="Show collections"
                  className="flex flex-wrap gap-2"
                >
                  {[
                    ["all", "All collections"],
                    ["mine", "My stories"],
                    ["shared", "Gifts and requests"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={filter === value}
                      onClick={() => setFilter(value)}
                      className={`min-h-12 rounded-full border px-5 py-3 text-base ${filter === value ? "border-espresso bg-espresso text-white" : "border-warmgray-200 bg-white"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {items.length > 4 && (
                  <label className="text-sm font-medium">
                    Find a person
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      className={portalField}
                      placeholder="Search by name"
                    />
                  </label>
                )}
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                {visible.map((item) => {
                  const approved = item.status === "approved";
                  const mine = item.role === "owner";
                  const label = mine
                    ? approved
                      ? "Open my collection"
                      : item.interviewState === "preparing"
                        ? "Check preparation"
                        : item.storyCount
                          ? "Review my gift"
                          : "Continue my interview"
                    : item.role === "recipient" && approved
                      ? "Open this gift"
                      : "View progress";
                  return (
                    <article
                      key={item.id}
                      className="flex flex-col overflow-hidden rounded-[24px] border border-warmgray-200 bg-white"
                    >
                      <div
                        className={`relative isolate overflow-hidden px-6 py-7 sm:px-7 ${mine ? "bg-sage-100" : "bg-clay-50"}`}
                      >
                        <BrandPattern
                          variant="ribbon"
                          className="absolute -right-20 -top-12 -z-10 w-80 max-w-none text-espresso opacity-[0.06]"
                        />
                        <p className="text-sm font-medium text-ink-500">
                          {mine
                            ? "Your stories"
                            : item.role === "recipient"
                              ? "A gift for you"
                              : "Your story request"}
                        </p>
                        <h2 className="mt-3 font-display text-2xl font-semibold">
                          {mine
                            ? `For ${item.recipientName}`
                            : `Stories from ${item.storytellerName}`}
                        </h2>
                        <p className="mt-3 text-base text-ink-500">
                          {mine
                            ? `Told by ${item.storytellerName}`
                            : `For ${item.recipientName}`}
                        </p>
                      </div>
                      <div className="flex flex-1 flex-col p-6 sm:p-7">
                        <p className="flex items-center gap-2 text-base font-medium">
                          <AppIcon
                            name={approved ? "check" : "collection"}
                            size={19}
                          />
                          {approved
                            ? "Approved and ready to share"
                            : item.interviewState === "preparing"
                              ? "Recordings saved, preparing your gift"
                              : item.status === "draft"
                                ? "Your gift is ready to review"
                                : "Your interview is saved here"}
                        </p>
                        {mine && (
                          <>
                            <dl className="mt-5 grid grid-cols-2 gap-3">
                              <div className="rounded-xl bg-paper p-4">
                                <dt className="flex items-center gap-2 text-sm font-medium text-ink-500">
                                  <AppIcon name="collection" size={18} />
                                  Written stories
                                </dt>
                                <dd className="mt-2 text-2xl font-semibold">
                                  {item.storyCount}
                                </dd>
                              </div>
                              <div className="rounded-xl bg-sage-50 p-4">
                                <dt className="flex items-center gap-2 text-sm font-medium text-ink-500">
                                  <AppIcon name="video" size={18} />
                                  Original files
                                </dt>
                                <dd className="mt-2 text-2xl font-semibold">
                                  {item.recordingCount}
                                </dd>
                              </div>
                            </dl>
                            <p className="mt-4 text-base leading-7 text-ink-500">
                              {item.recordingCount > 0
                                ? "Your saved audio and video recordings are inside. Finished story films appear there when they are ready."
                                : "No original recordings are saved yet. Open your collection to continue your story."}
                            </p>
                          </>
                        )}
                        {item.role === "recipient" && approved && (
                          <p className="mt-3 text-base leading-7 text-ink-500">
                            {item.storyCount} written{" "}
                            {item.storyCount === 1 ? "story" : "stories"} ·{" "}
                            {item.recordingCount} shared{" "}
                            {item.recordingCount === 1 ? "film" : "films"}
                          </p>
                        )}
                        {mine &&
                          item.postcards &&
                          (item.postcards.scheduled > 0 ||
                            item.postcards.mailed > 0) && (
                            <p className="mt-2 text-sm leading-6 text-ink-500">
                              Postcards: {item.postcards.mailed} mailed
                              {item.postcards.scheduled > 0
                                ? `, ${item.postcards.scheduled} scheduled`
                                : ""}
                              .
                            </p>
                          )}
                        {mine && item.postcards?.needsAttention > 0 && (
                          <p className="mt-2 text-sm text-oxblood">
                            A postcard delivery needs attention. Open the
                            collection to see what happened.
                          </p>
                        )}
                        <a
                          href={item.openUrl}
                          className={`${portalSecondary} mt-6 self-start`}
                        >
                          {label}
                          <AppIcon name="arrowRight" size={18} />
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>
              {!visible.length && (
                <p role="status" className="rounded-2xl bg-white p-8 text-lg">
                  No collections match this view. Try another name or choose all
                  collections.
                </p>
              )}
            </>
          ) : (
            !error && (
              <section className="mx-auto max-w-2xl rounded-[28px] border border-warmgray-200 bg-white p-8 text-center sm:p-12">
                <AppIcon
                  name="collection"
                  size={38}
                  className="mx-auto text-sage-700"
                />
                <h2 className="mt-5 font-display text-3xl font-medium">
                  There is room for your story.
                </h2>
                <p className="mt-4 text-lg leading-8 text-ink-500">
                  No collections are connected to this email yet. Start your own
                  story, or use the email address on your invitation.
                </p>
                <Link href="/#begin" className={`${portalPrimary} mt-6`}>
                  Start a story
                  <AppIcon name="arrowRight" size={18} />
                </Link>
                <div className="mt-8 border-t border-warmgray-200 pt-7">
                  <SavedPrivateLink />
                </div>
              </section>
            )
          )}
        </>
      ) : (
        <section className="grid items-start gap-6 lg:grid-cols-[.95fr_1.05fr] lg:gap-8">
          <header className="brand-gradient-chocolate relative isolate overflow-hidden rounded-[28px] p-7 text-white sm:p-10">
            <BrandPattern
              variant="ribbon"
              className="absolute -bottom-16 -right-24 -z-10 w-[530px] max-w-none text-white opacity-[.06]"
            />
            <p className="brand-eyebrow text-paper">My stories</p>
            <h1 className="mt-5 max-w-md font-display text-4xl font-medium leading-tight text-white sm:text-5xl">
              Come back to the stories you saved.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-paper">
              Your recordings live inside your collection. Open it to listen,
              watch and pick up where you left off.
            </p>
            <div className="mt-9 space-y-6 border-t border-white/25 pt-7">
              <div className="flex items-start gap-4">
                <AppIcon name="video" size={25} className="mt-1" />
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Original recordings
                  </h2>
                  <p className="mt-2 text-base leading-7 text-paper">
                    The unedited video and audio you recorded.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <AppIcon name="play" size={25} className="mt-1" />
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Finished story films
                  </h2>
                  <p className="mt-2 text-base leading-7 text-paper">
                    Edited films appear in your collection when preparation is
                    complete. Your originals stay separate.
                  </p>
                </div>
              </div>
            </div>
          </header>
          <div className="rounded-[28px] border border-warmgray-200 bg-white p-6 sm:p-9">
            {sentTo ? (
              <>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-sage-100 text-sage-700">
                  <AppIcon name="check" size={25} />
                </span>
                <h2 className="mt-5 text-3xl font-medium">
                  Your sign-in link is on its way.
                </h2>
                <p className="mt-5 text-lg leading-8 text-ink-500">
                  Check{" "}
                  <strong className="break-all font-medium text-ink">
                    {sentTo}
                  </strong>{" "}
                  for a sign-in link. It lasts 15 minutes.
                </p>
                <p className="mt-4 text-base leading-7 text-ink-500">
                  Open the link in this browser. If you do not see it, check
                  your spam folder.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSentTo("");
                    setError("");
                  }}
                  className={`${portalSecondary} mt-6`}
                >
                  Use another email or send again
                </button>
              </>
            ) : session?.emailLoginAvailable === true ? (
              <>
                <h2 className="text-3xl font-medium">
                  Sign in to your library
                </h2>
                <p className="mt-4 text-base leading-7 text-ink-500">
                  Use the email on your stories or invitation. We’ll send a
                  secure link, with no password to remember.
                </p>
                <form
                  onSubmit={(event) => void requestLink(event)}
                  className="mt-6 space-y-5"
                >
                  <label className="block text-base font-medium">
                    Your email
                    <input
                      type="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                      maxLength={254}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className={portalField}
                      placeholder="you@example.com"
                    />
                  </label>
                  <HumanVerification
                    action="account_login"
                    onToken={setHumanToken}
                    onReady={setHumanReady}
                    resetKey={resetKey}
                  />
                  <button
                    type="submit"
                    disabled={working || !humanReady}
                    className={`${portalPrimary} w-full`}
                  >
                    {working ? "Sending your link…" : "Email me a sign-in link"}
                    <AppIcon name="arrowRight" size={19} />
                  </button>
                </form>
              </>
            ) : (
              <div className="mb-7 rounded-2xl border border-sage-200 bg-sage-50 p-5">
                <h2 className="text-xl font-semibold">
                  Email sign-in is unavailable.
                </h2>
                <p className="mt-3 text-base leading-7 text-ink-500">
                  {session?.emailLoginAvailable === false
                    ? "Recipient stories need verified email access. Please try again when email sign-in is available."
                    : "We could not check email sign-in. Please check your connection and try again."}
                </p>
              </div>
            )}
            <PortalError message={error} />
            {!session && error && (
              <button
                type="button"
                onClick={() => void load()}
                className={`${portalSecondary} mb-6`}
              >
                Check sign-in again
              </button>
            )}
            <div
              className={
                sentTo || session?.emailLoginAvailable
                  ? "mt-8 border-t border-warmgray-200 pt-7"
                  : ""
              }
            >
              <SavedPrivateLink />
            </div>
            <p className="mt-6 flex items-start gap-2 text-sm leading-6 text-ink-500">
              <AppIcon name="shield" size={17} className="mt-1" />
              Recipient collections and your full library require a verified
              email. Keep private storyteller and requester links secure.
            </p>
          </div>
          <p className="text-base leading-7 text-ink-500 lg:col-span-2">
            Starting something new?{" "}
            <Link
              href="/share"
              className="font-medium text-espresso underline underline-offset-4"
            >
              Share your story
            </Link>{" "}
            or{" "}
            <Link
              href="/request"
              className="font-medium text-espresso underline underline-offset-4"
            >
              invite someone to share theirs
            </Link>
            .
          </p>
        </section>
      )}
    </PortalShell>
  );
}
