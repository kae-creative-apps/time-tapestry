"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppIcon } from "@/components/icons";
import {
  PortalShell,
  PortalError,
  portalPrimary,
  portalSecondary,
} from "@/components/collection/PortalUI";

type Verification = {
  emailHint: string;
  expiresAt: string;
  canConfirm: boolean;
  reason?: string;
};
export function VerifyAccount() {
  const [token, setToken] = useState("");
  const [check, setCheck] = useState<Verification | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const privateToken =
      new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    setToken(privateToken);
    if (!privateToken) {
      setError("This link is incomplete. Request a new sign-in link below.");
      return;
    }
    void fetch("/api/account/verification", {
      cache: "no-store",
      signal: controller.signal,
      headers: { "X-Account-Verification": privateToken },
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "This link is no longer available.");
        if (!controller.signal.aborted) setCheck(result);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "This link could not be checked.",
          );
      });
    return () => controller.abort();
  }, []);
  async function confirm() {
    if (!check?.canConfirm || working) return;
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/account/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error ||
            "Sign-in could not finish. Please request a new link.",
        );
      const nextUrl = result.nextUrl;
      // The server derives this from stored route parts. Refuse any broader path.
      window.location.replace(
        typeof nextUrl === "string" &&
          /^\/collection\/[a-zA-Z0-9_-]{8,80}(?:\/(?:chapter\/q[1-4]|address))?$/.test(
            nextUrl,
          )
          ? nextUrl
          : "/account",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Sign-in could not finish.",
      );
      setWorking(false);
    }
  }
  const reason =
    check?.reason === "different_browser"
      ? "This link was requested in another browser. Open it in that browser, or request a new link here."
      : check?.reason === "already_used"
        ? "This link has already been used. Return to your account, or request a new link if you are signed out."
        : "This link has expired. Request a new one to open your stories.";
  return (
    <PortalShell>
      <section className="mx-auto my-10 max-w-xl rounded-[28px] border border-warmgray-200 bg-white p-7 sm:p-10">
        <AppIcon name="shield" size={34} className="text-sage-700" />
        <h1 className="mt-6 font-display text-4xl font-medium">
          {check?.canConfirm ? "Welcome back." : "Open your stories."}
        </h1>
        {!check && !error && (
          <p role="status" className="mt-5 text-lg text-ink-500">
            Checking your secure link…
          </p>
        )}
        {check?.canConfirm ? (
          <>
            <p className="mt-5 text-lg leading-8 text-ink-500">
              Continue as{" "}
              <strong className="break-all font-medium text-ink">
                {check.emailHint}
              </strong>{" "}
              to see the collections connected to this email.
            </p>
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={working}
              className={`${portalPrimary} mt-7 w-full`}
            >
              {working ? "Opening your stories…" : "Continue to my stories"}
              <AppIcon name="arrowRight" size={19} />
            </button>
          </>
        ) : (
          check && (
            <p className="mt-5 text-lg leading-8 text-ink-500">{reason}</p>
          )
        )}
        <PortalError message={error} />
        <Link
          href="/account"
          className={`${check?.canConfirm ? "inline-flex min-h-12 items-center text-base underline underline-offset-4" : portalSecondary} mt-5`}
        >
          {check?.canConfirm ? "Use a different email" : "Return to sign-in"}
        </Link>
      </section>
    </PortalShell>
  );
}
