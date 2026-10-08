"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { AppIcon } from "@/components/icons";
import { progressLabels } from "@/lib/organizations/progress";
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
  const [assignRecipient, setAssignRecipient] = useState(false);
  const [confirmReplacement, setConfirmReplacement] = useState("");
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
        invitationDelivery?: { status: "sent" | "failed"; error?: string };
      }>(`${endpoint}/gifts${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: String(form.get("email") || "").trim(),
          ...(assignRecipient
            ? {
                designatedRecipient: {
                  name: String(form.get("recipientName") || "").trim(),
                  email: String(form.get("recipientEmail") || "").trim(),
                },
              }
            : {}),
        }),
      });
      setOrganization(result.organization);
      setNewGift({ name, url: result.giftUrl });
      setNotice(
        result.invitationDelivery?.status === "sent"
          ? `Invitation emailed to ${name}. You can also copy the link below.`
          : `The invitation for ${name} is saved, but the email could not be sent. Copy the link below.`,
      );
      formElement.reset();
      setAssignRecipient(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy("");
    }
  }

  async function replaceLink(gift: OrganizationGift) {
    if (busy || loading) return;
    setBusy(gift.id);
    setError("");
    try {
      const result = await requestJson<{
        organization: Organization;
        giftUrl: string;
      }>(`${endpoint}/gifts${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "replace_link", giftId: gift.id }),
      });
      setOrganization(result.organization);
      setNewGift({ name: gift.name, url: result.giftUrl });
      setConfirmReplacement("");
      setNotice(
        `A new link is ready for ${gift.name}. It has not been emailed. Their previous link no longer works.`,
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy("");
    }
  }

  async function resend(gift: OrganizationGift) {
    if (busy || loading) return;
    setBusy(`resend:${gift.id}`);
    setError("");
    setNotice("");
    try {
      const result = await requestJson<{ organization: Organization }>(
        `${endpoint}/gifts${query}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "resend_invitation",
            giftId: gift.id,
          }),
        },
      );
      setOrganization(result.organization);
      const delivery = result.organization.gifts.find(
        (item) => item.id === gift.id,
      )?.invitationDelivery;
      setNotice(
        delivery?.status === "sent"
          ? `Invitation emailed to ${gift.name} again.`
          : `The invitation for ${gift.name} could not be emailed again.`,
      );
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
            Donor invitations
          </p>
          <h1 className="mb-6 text-4xl font-medium">Your donor invitations</h1>
          {loading ? (
            <p role="status" className="text-lg text-ink-500">
              Opening your invitations…
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
                Invite your donors
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
              Donor invitations
            </p>
            <h1 className="break-words font-display text-4xl font-medium leading-tight sm:text-5xl">
              {organization.organizationName}
            </h1>
            <p className="mt-4 text-base leading-7 text-ink-500">
              {organization.seats.total} donor invitations for your
              organization.
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
                with someone helping you organize the group. Chapter and mailing
                status appear below. Family stories and recordings are not shown
                here.
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
                Invite a donor.
              </h2>
              <p className="mt-2 text-base leading-7 text-ink-500">
                Add the donor who will tell the story of their generosity. They
                can choose a child or grandchild, or you can name that person
                for this invitation.
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
                <div className="md:col-span-3">
                  <label className="flex items-start gap-3 text-base leading-7">
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5 accent-espresso"
                      checked={assignRecipient}
                      onChange={(event) =>
                        setAssignRecipient(event.target.checked)
                      }
                    />
                    Assign a recipient for this gift
                  </label>
                  {assignRecipient && (
                    <div className="mt-4 grid gap-4 rounded-xl bg-paper p-4 sm:grid-cols-2">
                      <label>
                        Recipient name
                        <input
                          name="recipientName"
                          required
                          maxLength={120}
                          className={inputClass}
                        />
                      </label>
                      <label>
                        Recipient email
                        <input
                          name="recipientEmail"
                          type="email"
                          required
                          maxLength={254}
                          className={inputClass}
                        />
                      </label>
                      <p className="text-sm leading-6 sm:col-span-2">
                        The storyteller will confirm this person before
                        starting. Their stories stay private from the group
                        organizer.
                      </p>
                    </div>
                  )}
                </div>
                <button className={`${primaryClass} w-full`} type="submit">
                  {busy === "invite" ? "Creating…" : "Create donor invitation"}
                  <AppIcon name="arrowRight" size={18} />
                </button>
              </fieldset>
              <p className="mt-4 text-sm leading-6 text-ink-500">
                We’ll email this invitation. You can also copy the link and
                share it yourself.
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
              Your donor invitations
            </h2>
            <p className="mt-2 text-base leading-7 text-ink-500">
              Follow each storyteller’s four chapters. Completed means the
              storyteller has approved the story. Postcard Shipped means mailing
              has been confirmed.
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
                Your first invitation can begin a donor’s collection for their family.
              </p>
              <p className="mt-2 text-base leading-7 text-ink-500">
                Add a donor above when you’re ready.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-warmgray-200 bg-white">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <caption className="sr-only">
                  Storyteller progress across four chapters
                </caption>
                <thead className="bg-paper text-ink-500">
                  <tr>
                    <th scope="col" className="p-5">
                      Storyteller
                    </th>
                    {[1, 2, 3, 4].map((number) => (
                      <th key={number} scope="col" className="p-4">
                        Chapter {number}
                      </th>
                    ))}
                    <th scope="col" className="p-5">
                      Invitation
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {organization.gifts.map((gift) => (
                    <tr
                      key={gift.id}
                      className="border-t border-warmgray-200 align-top"
                    >
                      <th scope="row" className="max-w-56 p-5 font-normal">
                        <p className="break-words text-base font-semibold">
                          {gift.name}
                        </p>
                        <p className="break-all leading-6 text-ink-500">
                          {gift.email}
                        </p>
                        {gift.designatedRecipient && (
                          <p className="mt-2 leading-6 text-ink-500">
                            For {gift.designatedRecipient.name}
                          </p>
                        )}
                      </th>
                      {gift.progress.map((chapter) => (
                        <td key={chapter.chapterId} className="p-4">
                          <span
                            className={`inline-block rounded-full px-3 py-1.5 ${chapter.status === "completed" || chapter.status === "postcard_shipped" ? "bg-sage-100 text-sage-700" : "bg-paper text-ink-500"}`}
                          >
                            {progressLabels[chapter.status]}
                          </span>
                          {chapter.mailingAttention && (
                            <p className="mt-2 text-oxblood">
                              Mailing needs attention
                            </p>
                          )}
                        </td>
                      ))}
                      <td className="max-w-64 p-5">
                        <p className="font-medium">
                          {statusLabels[gift.status]}
                        </p>
                        {gift.invitationDelivery?.status === "sent" && (
                          <p className="mt-2 leading-6 text-ink-500">
                            Emailed{" "}
                            {new Date(gift.invitationDelivery.at).toLocaleString(
                              undefined,
                              {
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              },
                            )}
                          </p>
                        )}
                        {gift.invitationDelivery?.status === "failed" && (
                          <p className="mt-2 leading-6 text-oxblood">
                            Email was not sent. {gift.invitationDelivery.error}
                          </p>
                        )}
                        {gift.status === "issued" && !gift.invitationDelivery && (
                          <p className="mt-2 leading-6 text-ink-500">
                            This link has not been emailed.
                          </p>
                        )}
                        {gift.status === "issued" && (
                          <div className="mt-2 space-y-2">
                            {confirmReplacement === gift.id ? (
                              <div className="rounded-xl bg-paper p-3">
                                <p className="leading-6">
                                  Replace this invitation? The previous link
                                  will stop working.
                                </p>
                                <button
                                  type="button"
                                  disabled={!!busy || loading}
                                  onClick={() => void replaceLink(gift)}
                                  className={`${secondaryClass} mt-2`}
                                >
                                  Create new link
                                </button>
                                <button
                                  type="button"
                                  className="block min-h-11 underline underline-offset-4"
                                  onClick={() => setConfirmReplacement("")}
                                >
                                  Keep existing link
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  disabled={!!busy || loading}
                                  onClick={() => void resend(gift)}
                                  className="block min-h-11 underline underline-offset-4"
                                >
                                  {busy === `resend:${gift.id}`
                                    ? "Sending…"
                                    : "Resend invitation"}
                                </button>
                                <button
                                  type="button"
                                  disabled={!!busy || loading}
                                  onClick={() => setConfirmReplacement(gift.id)}
                                  className="block min-h-11 underline underline-offset-4"
                                >
                                  Replace invitation link
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              disabled={!!busy || loading}
                              aria-label={`Revoke gift for ${gift.name}`}
                              onClick={() => void revoke(gift)}
                              className="block min-h-11 text-ink-500 underline underline-offset-4"
                            >
                              {busy === gift.id
                                ? "Saving…"
                                : "Revoke unused gift"}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
