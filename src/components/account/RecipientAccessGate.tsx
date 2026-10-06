"use client";

import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { AppIcon } from "@/components/icons";
import CollectionHome from "@/components/collection/CollectionHome";
import LivingStoriesPage from "@/components/collection/LivingStoriesPage";
import AddressPage from "@/components/collection/AddressPage";
import { HumanVerification } from "@/components/security/HumanVerification";
import { collectionRequest } from "@/lib/collection/client-request";
import {
  PortalError,
  PortalShell,
  portalField,
  portalPrimary,
  portalSecondary,
} from "@/components/collection/PortalUI";

type Session = { authenticated: boolean; emailLoginAvailable: boolean };

/** The locator alone must never render collection details or identify its recipient. */
export function RecipientAccessGate({
  id,
  chapterId,
  view,
  accessKey,
}: {
  id: string;
  chapterId?: string;
  view?: "address" | "stories";
  accessKey: string;
}) {
  const emailId = useId();
  const scope = `${id}/${view || ""}/${chapterId || ""}/${accessKey}`;
  const [authorized, setAuthorized] = useState<{
    scope: string;
    accessKey: string;
  } | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [humanToken, setHumanToken] = useState("");
  const [humanReady, setHumanReady] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [retry, setRetry] = useState(0);
  const validLocator =
    /^[a-zA-Z0-9_-]{8,80}$/.test(id) &&
    (view === undefined ||
      ((view === "address" || view === "stories") &&
        chapterId === undefined)) &&
    (chapterId === undefined || /^q[1-4]$/.test(chapterId));

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let disposed = false;
    setLoading(true);
    setAuthorized(null);
    setSession(null);
    setError("");
    void (async () => {
      try {
        if (validLocator) {
          const response = await fetch(
            `/api/collection/${encodeURIComponent(id)}${accessKey ? `?key=${encodeURIComponent(accessKey)}` : ""}`,
            {
              cache: "no-store",
              credentials: "same-origin",
              signal: controller.signal,
            },
          );
          if (response.status === 200) {
            const result = await response.json();
            if (
              result?.collection?.id !== id ||
              !["owner", "recipient", "requester"].includes(
                result.collection.role,
              )
            )
              throw new Error();
            if (view === "stories" && result.collection.role === "requester") {
              const next = await collectionRequest<Session>(
                "/api/account/session",
                { signal: controller.signal, credentials: "same-origin" },
              );
              if (!disposed) setSession(next);
              return;
            }
            if (!disposed)
              setAuthorized({
                scope,
                accessKey:
                  result.collection.role === "recipient" ? "" : accessKey,
              });
            return;
          }
          // Existing, missing and unauthorized locators share the same sign-in screen.
          if (response.status !== 401 && response.status !== 404)
            throw new Error();
        }
        const next = await collectionRequest<Session>("/api/account/session", {
          signal: controller.signal,
          credentials: "same-origin",
        });
        if (!disposed) setSession(next);
      } catch {
        if (!disposed)
          setError("We could not check access right now. Please try again.");
      } finally {
        clearTimeout(timer);
        if (!disposed) setLoading(false);
      }
    })();
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [id, chapterId, view, accessKey, scope, retry, validLocator]);

  const switchEmail = useCallback(async () => {
    if (working) return;
    setWorking(true);
    setError("");
    try {
      await collectionRequest("/api/account/logout", { method: "POST" }, 20000);
      setSent(false);
      setEmail("");
      setSession((current) =>
        current ? { ...current, authenticated: false } : null,
      );
      setResetKey((value) => value + 1);
    } catch {
      setError("We could not sign you out. Please try again.");
    } finally {
      setWorking(false);
    }
  }, [working]);

  async function requestLink(event: FormEvent) {
    event.preventDefault();
    if (
      working ||
      !humanReady ||
      !session?.emailLoginAvailable ||
      !validLocator
    )
      return;
    setWorking(true);
    setError("");
    try {
      await collectionRequest(
        "/api/account/request-link",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            humanToken,
            recipientLocator: {
              collectionId: id,
              ...(chapterId ? { chapterId } : {}),
              ...(view === "address" || view === "stories" ? { view } : {}),
            },
          }),
        },
        20000,
      );
      setSent(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We could not send your sign-in link.",
      );
    } finally {
      setWorking(false);
      setResetKey((value) => value + 1);
    }
  }

  if (authorized?.scope === scope)
    return view === "stories" ? (
      <LivingStoriesPage id={id} accessKey={authorized.accessKey} />
    ) : view === "address" ? (
      <AddressPage id={id} accessKey={authorized.accessKey} />
    ) : (
      <CollectionHome
        id={id}
        chapterId={chapterId}
        accessKey={authorized.accessKey}
      />
    );

  return (
    <PortalShell>
      <section className="mx-auto my-10 max-w-xl rounded-[28px] border border-warmgray-200 bg-white p-7 sm:p-10">
        <AppIcon name="shield" size={34} className="text-sage-700" />
        <h1 className="mt-6 font-display text-4xl font-medium">
          Open your stories.
        </h1>
        {loading ? (
          <p role="status" className="mt-5 text-lg leading-8 text-ink-500">
            Checking access…
          </p>
        ) : !validLocator ? (
          <p className="mt-5 text-lg leading-8 text-ink-500">
            This link could not be opened. Check the address and try again.
          </p>
        ) : session ? (
          <>
            {session.authenticated ? (
              <>
                <p className="mt-5 text-lg leading-8 text-ink-500">
                  This account cannot open this link. Try the email used for
                  your invitation, or check that you have the right link.
                </p>
                <button
                  type="button"
                  onClick={() => void switchEmail()}
                  disabled={working}
                  className={`${portalSecondary} mt-6 w-full`}
                >
                  {working ? "Signing out…" : "Use a different email"}
                </button>
              </>
            ) : sent ? (
              <>
                <p
                  role="status"
                  className="mt-5 text-lg leading-8 text-ink-500"
                >
                  Check {email.trim()} for a sign-in link. Open it in this
                  browser within 15 minutes to continue.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSent(false);
                    setError("");
                  }}
                  className={`${portalSecondary} mt-6 w-full`}
                >
                  Use a different email or request a new link
                </button>
              </>
            ) : session.emailLoginAvailable ? (
              <form onSubmit={requestLink} className="mt-5 space-y-5">
                <p className="text-lg leading-8 text-ink-500">
                  Sign in with the email used for your invitation. We will send
                  a link to verify it before opening any stories.
                </p>
                <label
                  htmlFor={emailId}
                  className="block text-base font-medium"
                >
                  Your email address
                  <input
                    id={emailId}
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    maxLength={254}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className={`${portalField} mt-2`}
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
                  disabled={working || !humanReady || !email.trim()}
                  className={`${portalPrimary} w-full`}
                >
                  {working ? "Sending your link…" : "Email me a sign-in link"}
                  <AppIcon name="arrowRight" size={19} />
                </button>
              </form>
            ) : null}
            {!session.emailLoginAvailable && (
              <p role="status" className="mt-5 text-lg leading-8 text-ink-500">
                Email sign-in is temporarily unavailable. Please try again when
                email setup is complete.
              </p>
            )}
          </>
        ) : null}
        <PortalError message={error} />
        {!loading && !session && (
          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
            className={`${portalSecondary} mt-5 w-full`}
          >
            Try again
          </button>
        )}
      </section>
    </PortalShell>
  );
}
