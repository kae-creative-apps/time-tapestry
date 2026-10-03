"use client";

import { useState, type FormEvent } from "react";
import { AppIcon } from "@/components/icons";
import {
  FormError,
  errorMessage,
  inputClass,
  navigateTo,
  primaryClass,
  requestJson,
} from "./shared";

export function OrganizationSetup() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setError("");
    setBusy(true);
    try {
      const result = await requestJson<{ nextUrl: string }>(
        "/api/organizations",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationName: String(form.get("organizationName") || "").trim(),
            organizationType: form.get("organizationType"),
            contactName: String(form.get("contactName") || "").trim(),
            contactEmail: String(form.get("contactEmail") || "").trim(),
            quantity: Number(form.get("quantity")),
          }),
        },
      );
      navigateTo(result.nextUrl);
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      aria-busy={busy}
      className="rounded-[28px] border border-warmgray-200 bg-white p-6 shadow-sm sm:p-9"
    >
      <div className="mb-7 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold sm:text-3xl">
            Set up your group.
          </h2>
          <p className="mt-2 text-base leading-7 text-ink-500">
            Choose how many people you’d like to invite.
          </p>
        </div>
        <span className="rounded-full bg-sage-100 px-3 py-1.5 text-sm font-medium text-sage-700">
          Free pilot
        </span>
      </div>
      <FormError message={error} />
      <fieldset disabled={busy} className="mt-5 space-y-5">
        <legend className="sr-only">
          Your organization and contact details
        </legend>
        <label className="block text-base font-medium">
          Organization name
          <input
            name="organizationName"
            autoComplete="organization"
            required
            maxLength={180}
            className={inputClass}
          />
        </label>
        <label className="block text-base font-medium">
          Organization type
          <select
            name="organizationType"
            defaultValue="church"
            required
            className={inputClass}
          >
            <option value="church">Church</option>
            <option value="nonprofit">Nonprofit</option>
            <option value="other">Other organization</option>
          </select>
        </label>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-base font-medium">
            Your name
            <input
              name="contactName"
              autoComplete="name"
              required
              maxLength={120}
              className={inputClass}
            />
          </label>
          <label className="block text-base font-medium">
            Your email
            <input
              name="contactEmail"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              className={inputClass}
            />
          </label>
        </div>
        <div className="rounded-2xl bg-paper p-5">
          <label
            htmlFor="gift-quantity"
            className="block text-base font-medium"
          >
            Number of free gifts
          </label>
          <div className="mt-2 flex items-center gap-4">
            <input
              id="gift-quantity"
              name="quantity"
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              step={1}
              defaultValue={10}
              required
              aria-describedby="quantity-help"
              className="min-h-12 w-24 rounded-xl border border-warmgray-300 bg-white px-4 py-3 text-lg font-medium"
            />
            <p id="quantity-help" className="text-sm leading-6 text-ink-500">
              1 to 100 gifts.
              <br />
              One storyteller per gift.
            </p>
          </div>
        </div>
        <button className={`${primaryClass} w-full`} type="submit">
          {busy ? "Creating your group…" : "Create free group"}
          {!busy && <AppIcon name="arrowRight" size={20} />}
        </button>
      </fieldset>
      <p className="mt-4 text-sm leading-6 text-ink-500">
        No payment details needed. You’ll add names and share individual gift
        links from your private dashboard.
      </p>
      <p className="sr-only" role="status">
        {busy ? "Creating your group. Please wait." : ""}
      </p>
    </form>
  );
}
