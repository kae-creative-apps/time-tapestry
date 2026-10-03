"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { AppIcon } from "@/components/icons";
import { BrandPattern } from "@/components/BrandPattern";
import { HumanVerification } from "@/components/security/HumanVerification";
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
type LibraryItem = {
  id: string;
  role: "owner" | "recipient" | "requester";
  status: string;
  storytellerName: string;
  recipientName: string;
  updatedAt: string;
  storyCount: number;
  recordingCount: number;
  postcards: { scheduled: number; mailed: number; needsAttention: number };
  openUrl: string;
};

async function jsonRequest(path: string, options?: RequestInit) {
  const response = await fetch(path, { cache: "no-store", ...options });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || "That did not work. Please try again.");
  return body;
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
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await jsonRequest("/api/account/session");
      setSession(next);
      if (next.authenticated) {
        const library = await jsonRequest("/api/account/library");
        setItems(library.items || []);
      } else setItems([]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We could not open your account.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

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
    <PortalShell>
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
                <p className="brand-eyebrow text-white/75">
                  Stories woven together
                </p>
                <h1 className="mt-4 font-display text-4xl font-medium text-white sm:text-5xl">
                  Your story collections
                </h1>
                <p className="mt-4 max-w-2xl text-lg leading-8 text-white/85">
                  Come back to your own stories, or revisit a gift someone
                  shared with you.
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
                      : item.storyCount
                        ? "Continue reviewing"
                        : "Continue my story"
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
                            : item.storyCount
                              ? "Ready for the storyteller to review"
                              : "Stories in the making"}
                        </p>
                        {mine && (
                          <p className="mt-3 text-base leading-7 text-ink-500">
                            {item.storyCount} written{" "}
                            {item.storyCount === 1 ? "story" : "stories"} ·{" "}
                            {item.recordingCount} original{" "}
                            {item.recordingCount === 1
                              ? "recording"
                              : "recordings"}
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
              </section>
            )
          )}
        </>
      ) : (
        <section className="mx-auto max-w-xl py-6 sm:py-12">
          <div className="rounded-[28px] border border-warmgray-200 bg-white p-6 sm:p-10">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sage-100 text-sage-700">
              <AppIcon name={sentTo ? "check" : "collection"} size={28} />
            </span>
            <p className="brand-eyebrow mt-6 text-ink-500">
              Your private account
            </p>
            <h1 className="mt-3 font-display text-4xl font-medium leading-tight">
              {sentTo
                ? "Your link is on its way."
                : "Come back to your stories."}
            </h1>
            {sentTo ? (
              <>
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
            ) : (
              <>
                <p className="mt-5 text-lg leading-8 text-ink-500">
                  {session?.emailLoginAvailable === false
                    ? "Your stories and gifts have a place of their own."
                    : "Enter the email you used for your stories or invitation. We’ll send a secure link. There is no password to remember."}
                </p>
                {session?.emailLoginAvailable === false ? (
                  <div
                    role="status"
                    className="mt-6 rounded-xl bg-paper p-5 text-base leading-7"
                  >
                    Email sign-in is being connected. For now, use the private
                    workspace or gift link you saved. Your stories remain
                    available through that link.
                  </div>
                ) : (
                  <form
                    onSubmit={(event) => void requestLink(event)}
                    className="mt-7 space-y-5"
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
                      {working
                        ? "Sending your link…"
                        : "Email me a sign-in link"}
                      <AppIcon name="arrowRight" size={19} />
                    </button>
                  </form>
                )}
              </>
            )}
            <PortalError message={error} />
            {!session && error && (
              <button
                type="button"
                onClick={() => void load()}
                className={portalSecondary}
              >
                Try again
              </button>
            )}
            <p className="mt-7 flex items-start gap-2 text-sm leading-6 text-ink-500">
              <AppIcon name="shield" size={17} className="mt-1" />
              Only collections connected to your verified email appear here.
            </p>
          </div>
          <Link
            href="/"
            className="mt-5 inline-flex min-h-12 items-center text-base underline underline-offset-4"
          >
            Back to Time Tapestry
          </Link>
        </section>
      )}
    </PortalShell>
  );
}
