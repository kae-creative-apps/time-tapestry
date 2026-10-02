"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret }),
    });

    if (res.ok) {
      const redirect = searchParams.get("redirect") ?? "/admin";
      router.push(
        /^\/admin(?:\/[a-zA-Z0-9_/-]*)?$/.test(redirect) ? redirect : "/admin",
      );
      return;
    }

    setError("Invalid admin secret.");
    setSubmitting(false);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-20">
      <div className="w-full max-w-sm rounded-lg border border-warmgray-300 bg-paper-50 p-8 shadow-soft">
        <h1 className="mb-2 font-serif text-2xl text-ink">Admin access</h1>
        <p className="mb-6 font-sans text-sm text-ink-500">
          Enter the shared admin secret to continue.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label htmlFor="secret" className="sr-only">
            Admin secret
          </label>
          <input
            id="secret"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Admin secret"
            required
            autoFocus
          />

          {error && (
            <p className="font-sans text-sm text-oxblood" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !secret}
            className="inline-flex min-h-[48px] items-center justify-center rounded-md bg-oxblood px-6 py-2.5 font-sans text-sm font-medium tracking-wide text-paper transition-all hover:bg-oxblood-600 disabled:opacity-50"
          >
            {submitting ? "Checking..." : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}

function LoginSkeleton() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-20">
      <div className="w-full max-w-sm rounded-lg border border-warmgray-300 bg-paper-50 p-8 shadow-soft">
        <h1 className="mb-2 font-serif text-2xl text-ink">Admin access</h1>
        <p className="font-sans text-sm text-ink-500">Loading...</p>
      </div>
    </main>
  );
}
