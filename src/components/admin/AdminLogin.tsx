"use client";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { HumanVerification } from "@/components/security/HumanVerification";

export default function AdminLogin({ redirect }: { redirect: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [humanToken, setHumanToken] = useState("");
  const [humanReady, setHumanReady] = useState(false);
  const [reset, setReset] = useState(0);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, redirect, humanToken }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || "We could not send a sign-in link. Please try again.",
        );
      setMessage(result.message);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Check your connection and try again.",
      );
    } finally {
      setBusy(false);
      setReset((value) => value + 1);
    }
  }
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-paper px-5 py-12">
      <Logo className="mb-8" />
      <section className="w-full max-w-md rounded-2xl border border-warmgray-200 bg-white p-6 sm:p-8">
        <h1 className="text-3xl">Team sign-in</h1>
        <p className="mt-3 leading-7 text-ink-600">
          Use your approved team email. We’ll send a private link to open in
          this browser.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-5">
          <label className="block font-medium" htmlFor="admin-email">
            Email address
          </label>
          <input
            id="admin-email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full"
          />
          <HumanVerification
            action="account_login"
            onToken={setHumanToken}
            onReady={setHumanReady}
            resetKey={reset}
          />
          {error && (
            <p role="alert" className="rounded-xl bg-clay-50 p-4 leading-7">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="rounded-xl bg-sage-100 p-4 leading-7">
              {message}
            </p>
          )}
          <button
            disabled={busy || !humanReady || !email.trim()}
            className="min-h-[52px] w-full rounded-full bg-espresso px-5 py-3 font-medium text-white disabled:opacity-50"
          >
            {busy
              ? "Sending link…"
              : message
                ? "Send another sign-in link"
                : "Email me a sign-in link"}
          </button>
        </form>
      </section>
    </main>
  );
}
