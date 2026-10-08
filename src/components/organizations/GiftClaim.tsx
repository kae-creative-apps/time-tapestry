"use client";

import { useEffect, useState, type FormEvent } from "react";
import { HumanVerification } from "@/components/security/HumanVerification";
import { AppIcon } from "@/components/icons";
import { BrandPattern } from "@/components/BrandPattern";
import {
  FormError,
  OrganizationShell,
  errorMessage,
  inputClass,
  navigateTo,
  primaryClass,
  requestJson,
  secondaryClass,
} from "./shared";

import type { GiftView } from "@/lib/organizations/types";

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
      setError("Open the full invitation link you were given.");
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
        "Allow this site to store session data, then try again.",
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
    await redeem({
      initiationPath: "share",
      designatedRecipientConfirmed:
        form.get("designatedRecipientConfirmed") === "on",
      storyteller,
      recipient: {
        name: text("recipientName"),
        email: text("recipientEmail"),
      },
      requester: storyteller,
    });
  }

  if (!gift) {
    return (
      <OrganizationShell>
        <main className="mx-auto max-w-2xl px-5 py-16 sm:px-8">
          <p className="brand-eyebrow mb-4 text-taupe-600">A gift</p>
          <h1 className="mb-6 text-4xl font-medium">Your invitation</h1>
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
              <AppIcon name="handHeart" size={32} className="mb-6" />
              <p className="brand-eyebrow mb-4 text-paper">
                A gift from {gift.organizationName}
              </p>
              <h1 className="break-words font-display text-4xl font-medium leading-[1.12] tracking-[-.03em] sm:text-5xl">
                Share why you give.
              </h1>
              <p className="mt-5 text-lg leading-8 text-paper">
                A short conversation for someone you love. Never about amounts.
              </p>
            </div>
            <p className="mt-4 px-1 text-sm leading-6 text-ink-500">
              Your stories stay private. {gift.organizationName} can’t read
              them.
            </p>
          </div>

          <section
            className="rounded-[28px] border border-warmgray-200 bg-white p-6 shadow-sm sm:p-9"
            aria-labelledby="claim-heading"
          >
            {gift.status === "revoked" ? (
              <>
                <h2 id="claim-heading" className="text-3xl font-semibold">
                  This link has ended.
                </h2>
                <p className="mt-4 text-base leading-8 text-ink-500">
                  Ask {gift.organizationName} for a new one.
                </p>
              </>
            ) : alreadyStarted ? (
              <>
                <h2 id="claim-heading" className="text-3xl font-semibold">
                  {gift.status === "redeeming"
                    ? "Starting your story."
                    : "This story has started."}
                </h2>
                <p className="mt-4 text-base leading-8 text-ink-500">
                  {savedToken
                    ? "Continue below."
                    : `Open the link you saved, or ask ${gift.organizationName} for a new one.`}
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
                    {busy ? "Opening…" : "Continue"}
                    <AppIcon name="arrowRight" size={20} />
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy || loading}
                  onClick={() => setRevision((value) => value + 1)}
                  className="mt-4 min-h-11 py-2 text-sm text-ink-500 underline underline-offset-4"
                >
                  {loading ? "Refreshing…" : "Refresh"}
                </button>
                <p className="sr-only" role="status">
                  {busy ? "Opening. Please wait." : ""}
                </p>
              </>
            ) : (
              <>
                <h2 id="claim-heading" className="text-3xl font-semibold">
                  Let's begin.
                </h2>
                <form
                  onSubmit={submit}
                  aria-busy={busy}
                  className="mt-6 space-y-5"
                >
                  <FormError message={error} />
                  <fieldset disabled={busy} className="space-y-4">
                    <legend className="sr-only">You</legend>
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
                    className="space-y-4 border-t border-warmgray-200 pt-5"
                  >
                    <legend className="mb-3 text-base font-semibold">
                      Who it's for
                    </legend>
                    <label className="block text-base font-medium">
                      Their name
                      <input
                        name="recipientName"
                        defaultValue={gift.designatedRecipient?.name}
                        readOnly={Boolean(gift.designatedRecipient)}
                        autoComplete="section-recipient name"
                        required
                        maxLength={120}
                        className={inputClass}
                      />
                    </label>
                    <label className="block text-base font-medium">
                      Their email
                      <input
                        name="recipientEmail"
                        defaultValue={gift.designatedRecipient?.email}
                        readOnly={Boolean(gift.designatedRecipient)}
                        type="email"
                        autoComplete="section-recipient email"
                        required
                        maxLength={254}
                        className={inputClass}
                      />
                    </label>
                    {gift.designatedRecipient && (
                      <label className="flex items-start gap-3 text-base leading-7">
                        <input
                          name="designatedRecipientConfirmed"
                          type="checkbox"
                          required
                          className="mt-1 h-5 w-5 shrink-0 accent-espresso"
                        />
                        <span>
                          These stories are for {gift.designatedRecipient.name}.
                        </span>
                      </label>
                    )}
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
                    {busy ? "Starting…" : "Start my story"}
                    {!busy && <AppIcon name="arrowRight" size={20} />}
                  </button>
                  <p className="sr-only" role="status">
                    {busy ? "Starting. Please wait." : ""}
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
