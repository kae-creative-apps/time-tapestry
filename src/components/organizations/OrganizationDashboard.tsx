"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { AppIcon } from "@/components/icons";
import {
  CopyLink,
  FormError,
  OrganizationShell,
  errorMessage,
  inputClass,
  primaryClass,
  requestJson,
  secondaryClass,
  type Organization,
  type OrganizationGift,
} from "./shared";

const statusLabels: Record<OrganizationGift["status"], string> = {
  issued: "Ready to share",
  redeeming: "Getting started",
  redeemed: "Redeemed",
  revoked: "Revoked",
};

export function OrganizationDashboard({
  id,
  accessKey,
}: {
  id: string;
  accessKey: string;
}) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newGift, setNewGift] = useState<{ name: string; url: string } | null>(
    null,
  );
  const endpoint = `/api/organizations/${encodeURIComponent(id)}`;
  const query = `?key=${encodeURIComponent(accessKey)}`;

  useEffect(() => {
    if (!accessKey) {
      setError(
        "This page needs your private management link. Open the full link you saved when you created the group.",
      );
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    requestJson<{ organization: Organization }>(`${endpoint}${query}`, {
      signal: controller.signal,
    })
      .then((result) => setOrganization(result.organization))
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessKey, endpoint, query, revision]);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || loading) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get("name") || "").trim();
    setBusy("invite");
    setError("");
    setNotice("");
    setNewGift(null);
    try {
      const result = await requestJson<{
        organization: Organization;
        giftUrl: string;
      }>(`${endpoint}/gifts${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: String(form.get("email") || "").trim(),
        }),
      });
      setOrganization(result.organization);
      setNewGift({ name, url: result.giftUrl });
      setNotice(
        `Gift link ready for ${name}. Copy it below and share it with them.`,
      );
      formElement.reset();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy("");
    }
  }

  async function revoke(gift: OrganizationGift) {
    if (busy || loading) return;
    setBusy(gift.id);
    setError("");
    setNotice("");
    try {
      const result = await requestJson<{ organization: Organization }>(
        `${endpoint}/gifts${query}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "revoke", giftId: gift.id }),
        },
      );
      setOrganization(result.organization);
      setNewGift(null);
      setNotice(
        `The gift link for ${gift.name} has been revoked. That gift is available for someone else.`,
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy("");
    }
  }

  if (!organization) {
    return (
      <OrganizationShell>
        <main className="mx-auto max-w-2xl px-5 py-16 sm:px-8">
          <p className="brand-eyebrow mb-4 text-taupe-600">
            Private group dashboard
          </p>
          <h1 className="mb-6 text-4xl font-medium">Your group gifts</h1>
          {loading ? (
            <p role="status" className="text-lg text-ink-500">
              Opening your group…
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
              <Link
                href="/for-organizations"
                className="mt-6 block py-3 underline underline-offset-4"
              >
                About free group gifting
              </Link>
            </>
          )}
        </main>
      </OrganizationShell>
    );
  }

  const unavailable = organization.seats.available < 1;
  return (
    <OrganizationShell>
      <main className="mx-auto max-w-6xl px-5 pb-8 pt-5 sm:px-8 sm:pt-10">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="brand-eyebrow mb-4 text-taupe-600">
              Free group gifting pilot
            </p>
            <h1 className="break-words font-display text-4xl font-medium leading-tight sm:text-5xl">
              {organization.organizationName}
            </h1>
            <p className="mt-4 text-base leading-7 text-ink-500">
              {organization.seats.total} free gifts for the people in your
              community.
            </p>
          </div>
          <button
            type="button"
            disabled={!!busy || loading}
            onClick={() => setRevision((value) => value + 1)}
            className={secondaryClass}
          >
            {loading ? "Refreshing…" : "Refresh status"}
          </button>
        </div>

        <section
          aria-labelledby="management-heading"
          className="mt-8 rounded-2xl border border-sage-200 bg-sage-50 p-5 sm:p-6"
        >
          <div className="flex gap-3">
            <AppIcon
              name="shield"
              size={23}
              className="mt-1 shrink-0 text-sage-700"
            />
            <div className="min-w-0 flex-1">
              <h2 id="management-heading" className="text-lg font-semibold">
                Save your private management link.
              </h2>
              <p className="mb-4 mt-2 max-w-3xl text-sm leading-6 text-ink-500">
                Bookmark this page or copy the link below. Anyone with this link
                can see names and emails and manage your gifts. Share it only
                with someone helping you organize the group. Family stories and
                recordings are not shown here.
              </p>
              <CopyLink
                path={`/organizations/${encodeURIComponent(id)}${query}`}
                label="Copy management link"
                showLink
              />
            </div>
          </div>
        </section>

        <dl className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-5">
          {[
            {
              label: "Available",
              value: organization.seats.available,
              description: "Ready for someone new",
              color: "bg-sage-100",
            },
            {
              label: "Issued",
              value: organization.seats.issued,
              description: "Gift links not yet redeemed",
              color: "bg-paper-200",
            },
            {
              label: "Redeemed",
              value: organization.seats.redeemed,
              description: "Storytellers who have started",
              color: "bg-clay-50",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`rounded-2xl px-6 py-5 ${stat.color}`}
            >
              <dt className="text-sm font-medium text-ink-500">{stat.label}</dt>
              <dd className="mt-2 font-display text-4xl font-semibold">
                {stat.value}
              </dd>
              <dd className="mt-2 text-sm text-ink-500">{stat.description}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-7">
          <FormError message={error} />
        </div>
        <p role="status" className="mt-3 text-base leading-7 text-sage-700">
          {notice}
        </p>

        <section
          aria-labelledby="invite-heading"
          className="mt-6 rounded-[24px] border border-warmgray-200 bg-white p-6 sm:p-8"
        >
          <div className="mb-6 flex items-start gap-3">
            <AppIcon
              name="handHeart"
              size={26}
              className="mt-1 shrink-0 text-taupe-600"
            />
            <div>
              <h2 id="invite-heading" className="text-2xl font-semibold">
                Create a storyteller’s gift link.
              </h2>
              <p className="mt-2 text-base leading-7 text-ink-500">
                Add the person who will share their stories. They’ll choose who
                receives them.
              </p>
            </div>
          </div>
          {unavailable ? (
            <p className="rounded-xl bg-paper px-4 py-4 text-base leading-7 text-ink-500">
              All your gifts are assigned. You can revoke an unused link below
              to make room for someone else.
            </p>
          ) : (
            <form onSubmit={invite} aria-busy={busy === "invite"}>
              <fieldset
                disabled={!!busy || loading}
                className="grid items-end gap-4 md:grid-cols-[1fr_1.2fr_auto]"
              >
                <legend className="sr-only">Storyteller invitation</legend>
                <label className="block text-base font-medium">
                  Name
                  <input
                    name="name"
                    autoComplete="off"
                    required
                    maxLength={120}
                    className={inputClass}
                  />
                </label>
                <label className="block text-base font-medium">
                  Email
                  <input
                    name="email"
                    type="email"
                    autoComplete="off"
                    required
                    maxLength={254}
                    className={inputClass}
                  />
                </label>
                <button className={`${primaryClass} w-full`} type="submit">
                  {busy === "invite" ? "Creating…" : "Create gift link"}
                  <AppIcon name="arrowRight" size={18} />
                </button>
              </fieldset>
              <p className="mt-4 text-sm leading-6 text-ink-500">
                You’ll copy and share the link yourself. Creating a gift link
                does not send an email.
              </p>
            </form>
          )}
          {newGift && (
            <div className="mt-5 rounded-xl bg-sage-50 p-4">
              <p className="mb-3 font-medium">
                Share this gift with {newGift.name}
              </p>
              <CopyLink
                path={newGift.url}
                label="Copy new gift link"
                showLink
              />
            </div>
          )}
        </section>

        <section aria-labelledby="gifts-heading" className="mt-10">
          <div className="mb-5">
            <h2 id="gifts-heading" className="text-2xl font-semibold">
              Your gift invitations
            </h2>
            <p className="mt-2 text-base leading-7 text-ink-500">
              Redeemed means the storyteller has started their collection. It
              does not mean their stories are finished.
            </p>
          </div>
          {organization.gifts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-warmgray-300 px-6 py-10 text-center">
              <AppIcon
                name="postcard"
                size={32}
                className="mx-auto text-taupe-600"
              />
              <p className="mt-4 font-medium">
                Your first invitation can begin a family’s collection.
              </p>
              <p className="mt-2 text-base leading-7 text-ink-500">
                Add a storyteller above when you’re ready.
              </p>
            </div>
          ) : (
            <ul className="overflow-hidden rounded-2xl border border-warmgray-200 bg-white">
              {organization.gifts.map((gift) => (
                <li
                  key={gift.id}
                  className="flex flex-col gap-4 border-b border-warmgray-200 p-5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:p-6"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-paper-200 font-display text-lg font-semibold"
                    >
                      {Array.from(gift.name.trim())[0]?.toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <h3 className="break-words text-lg font-semibold">
                        {gift.name}
                      </h3>
                      <p className="break-all text-sm leading-6 text-ink-500">
                        {gift.email}
                      </p>
                      <span
                        className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-medium ${gift.status === "redeemed" ? "bg-sage-100 text-sage-700" : "bg-paper-200 text-ink-500"}`}
                      >
                        {statusLabels[gift.status]}
                      </span>
                    </div>
                  </div>
                  {gift.status === "issued" && (
                    <div className="flex shrink-0 flex-wrap items-start gap-3">
                      {gift.giftUrl && (
                        <CopyLink
                          path={gift.giftUrl}
                          label={`Copy gift link`}
                          accessibleLabel={`Copy gift link for ${gift.name}`}
                        />
                      )}
                      <button
                        type="button"
                        disabled={!!busy || loading}
                        aria-label={`Revoke gift for ${gift.name}`}
                        onClick={() => revoke(gift)}
                        className="min-h-12 px-3 text-sm text-ink-500 underline underline-offset-4 disabled:opacity-50"
                      >
                        {busy === gift.id ? "Revoking…" : "Revoke"}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-sm leading-6 text-ink-500">
            Revoking an unused gift turns off its link and makes that gift
            available again.
          </p>
        </section>
      </main>
    </OrganizationShell>
  );
}
