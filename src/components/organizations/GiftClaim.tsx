"use client";

import { useEffect, useState, type FormEvent } from "react";
import { HumanVerification } from "@/components/security/HumanVerification";
import { AppIcon } from "@/components/icons";
import { BrandPattern } from "@/components/BrandPattern";
import { InterviewProgress } from "@/components/collection/InterviewProgress";
import {
  FormError,
  OrganizationShell,
  errorMessage,
  inputClass,
  navigateTo,
  primaryClass,
  requestJson,
  secondaryClass,
  type OrganizationGift,
} from "./shared";

type GiftView = {
  organizationName: string;
  name: string;
  email: string;
  status: OrganizationGift["status"];
};

export function GiftClaim({
  organizationId,
  giftId,
  accessKey,
}: {
  organizationId: string;
  giftId: string;
  accessKey: string;
}) {
  const [humanToken, setHumanToken] = useState("");
  const [humanReady, setHumanReady] = useState(false);
  const [humanRevision, setHumanRevision] = useState(0);
  const [gift, setGift] = useState<GiftView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [savedToken, setSavedToken] = useState("");
  const storageKey = `time-tapestry:gift-claim:${organizationId}:${giftId}`;
  const endpoint = `/api/organizations/${encodeURIComponent(organizationId)}/gifts/${encodeURIComponent(giftId)}?key=${encodeURIComponent(accessKey)}`;

  useEffect(() => {
    try {
      setSavedToken(sessionStorage.getItem(storageKey) || "");
    } catch {
      // Browsing the invitation works without storage. Starting requires a saved retry token.
    }
    if (!accessKey) {
      setError(
        "This invitation needs its full gift link. Please open the link your organizer shared with you.",
      );
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    requestJson<GiftView>(endpoint, { signal: controller.signal })
      .then(setGift)
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessKey, endpoint, storageKey, revision]);

  function claimToken() {
    // Persist before redeeming, so a lost redirect can safely resume this same claim.
    // The token stays in this browser session and is never placed in a shareable URL.
    try {
      const existing = sessionStorage.getItem(storageKey);
      const token = existing || crypto.randomUUID();
      sessionStorage.setItem(storageKey, token);
      if (sessionStorage.getItem(storageKey) !== token)
        throw new Error("Storage unavailable");
      setSavedToken(token);
      return token;
    } catch {
      throw new Error(
        "Your browser couldn’t save your place. Please allow this site to store session data, then try again.",
      );
    }
  }

  async function redeem(payload: Record<string, unknown>) {
    if (busy || (gift?.status === "issued" && !humanReady)) return;
    setBusy(true);
    setError("");
    try {
      const token = claimToken();
      const result = await requestJson<{ nextUrl: string }>(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, claimToken: token, humanToken }),
      });
      navigateTo(result.nextUrl);
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
      setHumanRevision((value) => value + 1);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) || "").trim();
    const storyteller = {
      name: text("storytellerName"),
      email: text("storytellerEmail"),
    };
    const phone = text("recipientPhone");
    await redeem({
      initiationPath: "share",
      storyteller,
      recipient: {
        name: text("recipientName"),
        email: text("recipientEmail"),
        ...(phone ? { phone } : {}),
      },
      requester: storyteller,
    });
  }

  if (!gift) {
    return (
      <OrganizationShell>
        <main className="mx-auto max-w-2xl px-5 py-16 sm:px-8">
          <p className="brand-eyebrow mb-4 text-taupe-600">
            A gift of your stories
          </p>
          <h1 className="mb-6 text-4xl font-medium">
            Your Time Tapestry invitation
          </h1>
          {loading ? (
            <p role="status" className="text-lg text-ink-500">
              Opening your invitation…
            </p>
          ) : (
            <>
              <FormError message={error} />
              {accessKey && (
                <button
                  type="button"
                  onClick={() => setRevision((value) => value + 1)}
                  className={`${secondaryClass} mt-5`}
                >
                  Try again
                </button>
              )}
            </>
          )}
        </main>
      </OrganizationShell>
    );
  }

  const alreadyStarted =
    gift.status === "redeemed" || gift.status === "redeeming";
  return (
    <OrganizationShell>
      <main className="mx-auto max-w-6xl px-5 pb-8 pt-5 sm:px-8 sm:pt-10">
        <div className="grid items-start gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
          <div>
            <div className="brand-gradient-chocolate relative isolate overflow-hidden rounded-[28px] p-7 text-white sm:p-9">
              <BrandPattern
                variant="ribbon"
                className="absolute -bottom-14 -right-32 -z-10 w-[560px] max-w-none text-white opacity-[0.07]"
              />
              <AppIcon name="handHeart" size={40} className="mb-9" />
              <p className="brand-eyebrow mb-5 text-paper">
                A gift from {gift.organizationName}
              </p>
              <h1 className="break-words font-display text-4xl font-medium leading-[1.15] tracking-[-.03em] sm:text-5xl">
                Your stories have a place in someone’s life.
              </h1>
              <p className="mt-6 text-lg leading-8 text-paper">
                {gift.organizationName} has invited you to collect stories from
                your life and share them with someone you love.
              </p>
              <span className="mt-7 inline-block rounded-full border border-white/25 px-4 py-2 text-sm font-medium">
                Your gift is free during the pilot.
              </span>
            </div>
            <div className="mt-6 flex gap-3 rounded-2xl bg-sage-100 p-5">
              <AppIcon
                name="shield"
                size={23}
                className="mt-1 shrink-0 text-sage-700"
              />
              <p className="text-sm leading-7 text-ink-500">
                You choose who receives your stories. Your organizer can see
                when you start, but your stories and recordings are not shown on
                their dashboard.
              </p>
            </div>
          </div>

          <section
            className="rounded-[28px] border border-warmgray-200 bg-white p-6 shadow-sm sm:p-9"
            aria-labelledby="claim-heading"
          >
            {gift.status === "revoked" ? (
              <>
                <h2 id="claim-heading" className="text-3xl font-semibold">
                  This gift link is no longer active.
                </h2>
                <p className="mt-4 text-base leading-8 text-ink-500">
                  Please ask your organizer at {gift.organizationName} for a new
                  invitation.
                </p>
              </>
            ) : alreadyStarted ? (
              <>
                <h2 id="claim-heading" className="text-3xl font-semibold">
                  {gift.status === "redeeming"
                    ? "Your gift is getting started."
                    : "This gift has been started."}
                </h2>
                <p className="mt-4 text-base leading-8 text-ink-500">
                  {savedToken
                    ? "If you started this gift in this browser, you can continue to your collection below."
                    : "If this is your collection, open the private collection link you saved when you started. Otherwise, ask your organizer for a new invitation."}
                </p>
                <div className="mt-5">
                  <FormError message={error} />
                </div>
                {savedToken && (
                  <button
                    type="button"
                    disabled={busy || loading}
                    onClick={() => redeem({})}
                    className={`${primaryClass} mt-6 w-full`}
                  >
                    {busy
                      ? "Opening your collection…"
                      : "Continue to my collection"}
                    <AppIcon name="arrowRight" size={20} />
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy || loading}
                  onClick={() => setRevision((value) => value + 1)}
                  className="mt-4 min-h-11 py-2 text-sm text-ink-500 underline underline-offset-4"
                >
                  {loading ? "Refreshing…" : "Refresh invitation status"}
                </button>
                <p className="sr-only" role="status">
                  {busy ? "Opening your collection. Please wait." : ""}
                </p>
              </>
            ) : (
              <>
                <h2 id="claim-heading" className="text-3xl font-semibold">
                  Make this gift yours.
                </h2>
                <p className="mt-3 text-base leading-7 text-ink-500">
                  Start with your details and the person you’d like to share
                  your stories with.
                </p>
                <div className="mt-6 overflow-hidden rounded-2xl border border-warmgray-200">
                  <InterviewProgress variant="intro" />
                  <p className="px-5 py-4 text-base leading-7 text-ink-500 sm:px-8">
                    We’ll take this one question at a time. You can choose video
                    with sound or audio only, and review your stories before
                    anything is shared.
                  </p>
                </div>
                <form
                  onSubmit={submit}
                  aria-busy={busy}
                  className="mt-7 space-y-6"
                >
                  <FormError message={error} />
                  <fieldset disabled={busy} className="space-y-5">
                    <legend className="mb-4 text-lg font-semibold">
                      1. You, the storyteller
                    </legend>
                    <label className="block text-base font-medium">
                      Your name
                      <input
                        name="storytellerName"
                        autoComplete="section-storyteller name"
                        defaultValue={gift.name}
                        required
                        maxLength={120}
                        className={inputClass}
                      />
                    </label>
                    <label className="block text-base font-medium">
                      Your email
                      <input
                        name="storytellerEmail"
                        type="email"
                        autoComplete="section-storyteller email"
                        defaultValue={gift.email}
                        required
                        maxLength={254}
                        className={inputClass}
                      />
                    </label>
                  </fieldset>
                  <fieldset
                    disabled={busy}
                    className="space-y-5 border-t border-warmgray-200 pt-6"
                  >
                    <legend className="float-left mb-4 w-full text-lg font-semibold">
                      2. Who are your stories for?
                    </legend>
                    <div className="clear-both">
                      <p className="mb-4 text-sm leading-6 text-ink-500">
                        Choose the person who will receive your collection.
                      </p>
                      <label className="block text-base font-medium">
                        Their name
                        <input
                          name="recipientName"
                          autoComplete="section-recipient name"
                          required
                          maxLength={120}
                          className={inputClass}
                        />
                      </label>
                    </div>
                    <label className="block text-base font-medium">
                      Their email
                      <input
                        name="recipientEmail"
                        type="email"
                        autoComplete="section-recipient email"
                        required
                        maxLength={254}
                        className={inputClass}
                      />
                    </label>
                    <label className="block text-base font-medium">
                      Their phone{" "}
                      <span className="font-normal text-ink-500">
                        (optional)
                      </span>
                      <input
                        name="recipientPhone"
                        type="tel"
                        autoComplete="section-recipient tel"
                        maxLength={40}
                        className={inputClass}
                      />
                    </label>
                  </fieldset>
                  <HumanVerification
                    action="claim_gift"
                    onToken={setHumanToken}
                    onReady={setHumanReady}
                    resetKey={humanRevision}
                  />
                  <button
                    type="submit"
                    disabled={busy || !humanReady}
                    className={`${primaryClass} w-full`}
                  >
                    {busy
                      ? "Starting your collection…"
                      : "Start my free collection"}
                    {!busy && <AppIcon name="arrowRight" size={20} />}
                  </button>
                  <p className="text-sm leading-6 text-ink-500">
                    You’ll continue to your private collection, where you can
                    add stories and videos at your own pace.
                  </p>
                  <p className="sr-only" role="status">
                    {busy ? "Starting your collection. Please wait." : ""}
                  </p>
                </form>
              </>
            )}
          </section>
        </div>
      </main>
    </OrganizationShell>
  );
}
