"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { AppIcon } from "@/components/icons";

import type { OrganizationView } from "@/lib/organizations/types";
export type Organization = OrganizationView;
export type OrganizationGift = OrganizationView["gifts"][number];

export const inputClass =
  "mt-2 min-h-12 w-full rounded-xl border border-warmgray-300 bg-white px-4 py-3 text-base text-ink transition-colors hover:border-taupe disabled:opacity-60";
export const primaryClass =
  "brand-button-primary min-h-12 px-6 py-3 font-medium disabled:cursor-wait disabled:opacity-60";
export const secondaryClass =
  "brand-button-secondary min-h-12 px-5 py-3 disabled:cursor-wait disabled:opacity-60";

export async function requestJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, { ...options, cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "We couldn’t complete that. Please try again.",
    );
  }
  if (!data)
    throw new Error("We couldn’t read the response. Please try again.");
  return data as T;
}

export function navigateTo(nextUrl: string) {
  // The API returns a same-origin path. Keep gift and management keys on this site.
  if (
    typeof nextUrl !== "string" ||
    !nextUrl.startsWith("/") ||
    nextUrl.startsWith("//")
  ) {
    throw new Error("Your next page could not be opened. Please try again.");
  }
  const target = new URL(nextUrl, window.location.origin);
  if (target.origin !== window.location.origin) {
    throw new Error("Your next page could not be opened. Please try again.");
  }
  window.location.assign(target.href);
}

export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "We couldn’t complete that. Please try again.";
}

export function OrganizationShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-5 px-5 py-6 sm:px-8">
        <Logo className="[&_svg]:h-10 sm:[&_svg]:h-12" />
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium sm:text-base"
        >
          Home <AppIcon name="arrowUpRight" size={18} />
        </Link>
      </header>
      {children}
      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-10 text-sm text-ink-500 sm:px-8">
        <p>Time Tapestry · Donor legacy pilot</p>
        <Link
          href="/privacy"
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Privacy
        </Link>
      </footer>
    </div>
  );
}

export function FormError({ message }: { message: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (message) ref.current?.focus();
  }, [message]);
  if (!message) return null;
  return (
    <p
      ref={ref}
      tabIndex={-1}
      role="alert"
      className="rounded-xl border border-clay-300 bg-clay-50 px-4 py-3 text-base leading-7 text-ink"
    >
      {message}
    </p>
  );
}

export function CopyLink({
  path,
  label = "Copy link",
  accessibleLabel,
  showLink = false,
}: {
  path: string;
  label?: string;
  accessibleLabel?: string;
  showLink?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setUrl(new URL(path, window.location.origin).href);
    setCopied(false);
    setManual(false);
  }, [path]);
  useEffect(() => {
    if (manual) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [manual]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setManual(false);
    } catch {
      setManual(true);
      setCopied(false);
    }
  }
  return (
    <div className="min-w-0">
      <div
        className={`flex gap-3 ${showLink ? "flex-col sm:flex-row" : "flex-wrap"}`}
      >
        {(showLink || manual) && (
          <input
            ref={ref}
            type="text"
            readOnly
            value={url}
            aria-label={`${accessibleLabel || label}: shareable address`}
            onFocus={(event) => event.currentTarget.select()}
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-warmgray-300 bg-white px-3 py-2 text-sm text-ink"
          />
        )}
        <button
          type="button"
          onClick={copy}
          disabled={!url}
          aria-label={accessibleLabel}
          className={`${secondaryClass} shrink-0 text-sm`}
        >
          {copied && <AppIcon name="check" size={17} />}
          {copied ? "Copied" : label}
        </button>
      </div>
      <p role="status" className="mt-1 text-sm leading-6 text-ink-500">
        {manual
          ? "Select and copy the address above to share it."
          : copied
            ? "Link copied. It’s ready to share."
            : ""}
      </p>
    </div>
  );
}
