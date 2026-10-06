"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { CollectionView } from "@/lib/collection/types";
import { collectionRequest } from "@/lib/collection/client-request";
import { postcardCadenceLabel } from "@/lib/collection/postcard-cadence";
import {
  invitationBatches,
  parseRecipientInvitations,
} from "./recipient-sharing";
import { AppIcon } from "@/components/icons";
import AddressForm from "./AddressForm";
import { PostcardProof } from "./PostcardProof";
import { PrivateLink, portalPrimary, portalSecondary } from "./PortalUI";

const dates = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
const postcardStatus = {
  scheduled: "Scheduled",
  submitted: "Submitted for printing",
  mailed: "Mailed",
  failed: "Needs attention",
  returned: "Returned",
};
const emailStatus = {
  pending: "Waiting to send",
  sent: "Sent",
  failed: "Could not send",
  suppressed: "Not scheduled to send",
};

export function CollectionSharing({
  collection: c,
  busy,
  act,
  onRefresh,
}: {
  collection: CollectionView;
  busy: boolean;
  act: (body: unknown) => Promise<CollectionView | null>;
  onRefresh?: () => Promise<unknown>;
}) {
  const [url, setUrl] = useState("");
  const [addressDirty, setAddressDirty] = useState(false);
  const [inviteText, setInviteText] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteNotice, setInviteNotice] = useState("");
  const [confirmRevokeId, setConfirmRevokeId] = useState("");
  const inviteField = useRef<HTMLTextAreaElement>(null);
  const [recipients, setRecipients] = useState(c.additionalRecipients ?? []);
  const inviteInFlight = useRef(false);
  const postcardsSection = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (inviteError && !inviteBusy && !confirmRevokeId)
      inviteField.current?.focus();
  }, [inviteError, inviteBusy, confirmRevokeId]);
  useEffect(() => {
    if (confirmRevokeId)
      document.getElementById(`keep-reader-${confirmRevokeId}`)?.focus();
  }, [confirmRevokeId]);
  useEffect(
    () => setRecipients(c.additionalRecipients ?? []),
    [c.additionalRecipients],
  );
  const automaticPostcards =
    c.autoPostcards === true ||
    c.postcardProof?.releaseStatus === "released" ||
    c.deliveries.length > 0;
  const ownerKey = c.links?.review
    ? new URL(c.links.review, "https://private.invalid").searchParams.get(
        "key",
      ) || ""
    : "";
  const recipientsEndpoint = `/api/collection/${encodeURIComponent(c.id)}/recipients?key=${encodeURIComponent(ownerKey)}`;
  async function invite() {
    if (inviteInFlight.current) return;
    inviteInFlight.current = true;
    setInviteBusy(true);
    setInviteError("");
    setInviteNotice("");
    let completed = 0;
    let remaining: ReturnType<typeof parseRecipientInvitations> | undefined;
    try {
      remaining = parseRecipientInvitations(inviteText);
      for (const batch of invitationBatches(remaining)) {
        const data = await collectionRequest(recipientsEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "invite", recipients: batch }),
        });
        setRecipients(data.collection.additionalRecipients ?? []);
        completed += batch.length;
        remaining = remaining.slice(batch.length);
        setInviteText(
          remaining
            .map((person) =>
              person.name ? `${person.name} <${person.email}>` : person.email,
            )
            .join("\n"),
        );
      }
      setInviteNotice(
        c.capabilities.email
          ? "Invitations are saved and waiting to send. Existing invitations are kept without duplicate emails."
          : "Invitations are saved. Email sending is not connected yet, so no invitation emails have been sent.",
      );
    } catch (cause) {
      setInviteError(
        `${completed ? `${completed} addresses were saved. The remaining addresses are still here. ` : ""}${cause instanceof Error ? cause.message : "Invitations could not be saved. Please retry."}`,
      );
    } finally {
      inviteInFlight.current = false;
      setInviteBusy(false);
    }
  }
  async function revoke(recipientId: string) {
    if (inviteInFlight.current) return;
    inviteInFlight.current = true;
    setInviteBusy(true);
    setInviteError("");
    setInviteNotice("");
    try {
      const data = await collectionRequest(recipientsEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke", recipientId }),
      });
      setRecipients(data.collection.additionalRecipients ?? []);
      setConfirmRevokeId("");
      setInviteNotice(
        "Their access has been removed. Your primary postcard recipient is unchanged.",
      );
    } catch (cause) {
      setInviteError(
        cause instanceof Error
          ? cause.message
          : "Access could not be updated. Please retry.",
      );
    } finally {
      inviteInFlight.current = false;
      setInviteBusy(false);
    }
  }
  const invitation = [...c.notifications]
    .reverse()
    .find(
      (item) =>
        item.kind === "collection_ready" &&
        item.to.toLowerCase() === c.recipient.email.toLowerCase(),
    );
  const invitationLabel =
    invitation?.status === "sent"
      ? "Invitation sent"
      : invitation?.status === "failed"
        ? "Invitation needs attention"
        : invitation?.status === "pending"
          ? "Invitation queued"
          : "Your gift is approved";
  const qr = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (c.links?.collection)
      setUrl(new URL(c.links.collection, window.location.origin).href);
  }, [c.links?.collection]);
  function downloadQr() {
    const svg = qr.current?.querySelector("svg");
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], {
      type: "image/svg+xml",
    });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "time-tapestry-private-story-qr.svg";
    anchor.click();
    URL.revokeObjectURL(href);
  }
  return (
    <div className="space-y-6">
      <section
        className="rounded-2xl border border-sage-200 bg-white p-6 sm:p-8"
        aria-labelledby="share-heading"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sage-100 text-sage-700">
            <AppIcon name="check" size={24} />
          </span>
          <h2 id="share-heading" className="text-2xl font-semibold">
            {invitationLabel}
          </h2>
        </div>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-ink-500">
          {invitation?.status === "sent"
            ? `The email invitation was sent to ${c.recipient.email}.`
            : invitation?.status === "pending"
              ? `An email invitation for ${c.recipient.email} is waiting to send.`
              : invitation?.status === "failed"
                ? `We could not send the invitation to ${c.recipient.email}. Your approved gift is saved.`
                : `Your approved gift is saved for ${c.recipient.name}.`}{" "}
          Each person verifies their invited email address before opening it.
        </p>
        <div className="mt-4 rounded-xl bg-paper p-4 text-base leading-7">
          <p className="font-semibold">Postcard status</p>
          <p className="mt-1">
            {c.deliveries.some((item) => item.providerId)
              ? "Mailing has started. Check the dates and delivery status below."
              : c.postcardProof?.approvedAt
                ? c.capabilities.mail
                  ? "Your print designs are approved. See the mailing status below."
                  : "Your print designs are approved. Mailing is on hold while delivery is connected."
                : c.addressConfirmed
                  ? "Your address is saved. Review and approve the print designs below."
                  : `Waiting for a confirmed mailing address for ${c.recipient.name}. Your digital gift is available separately.`}
          </p>
          <button
            type="button"
            className="mt-2 inline-flex min-h-12 items-center text-base font-medium underline underline-offset-4"
            onClick={() => {
              if (postcardsSection.current) {
                postcardsSection.current.open = true;
                postcardsSection.current.scrollIntoView({ block: "start" });
              }
            }}
          >
            {c.addressConfirmed
              ? "Review postcard delivery"
              : "Add a mailing address"}
          </button>
        </div>
        {invitation?.status === "failed" && (
          <p role="alert" className="mt-3 text-base leading-7 text-oxblood">
            {invitation.error ||
              "Email delivery needs attention. You can still share the secure link below."}
          </p>
        )}
        {onRefresh && (
          <button
            className={`${portalSecondary} mt-4`}
            type="button"
            onClick={() => void onRefresh()}
            disabled={busy}
          >
            Refresh delivery status
          </button>
        )}
        {c.status === "approved" && c.role === "owner" && (
          <section
            className="mt-7 rounded-2xl border border-clay-200 bg-clay-50 p-5 sm:p-6"
            aria-labelledby="invite-readers-heading"
          >
            <h3 id="invite-readers-heading" className="text-2xl font-semibold">
              Invite more people
            </h3>
            <p className="mt-3 text-base leading-7 text-ink-700">
              Invite as many people as you like. They receive an email
              invitation to read and watch your stories, download the book, and
              send you a private reply. Physical postcards still go only to{" "}
              {c.recipient.name}.
            </p>
            <label className="mt-5 block text-base font-medium">
              Email addresses
              <textarea
                ref={inviteField}
                rows={4}
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={inviteText}
                disabled={busy || inviteBusy}
                onChange={(event) => {
                  setInviteText(event.target.value);
                  setInviteError("");
                }}
                className="mt-2 w-full rounded-xl border border-warmgray-300 bg-white p-4 text-base leading-7"
                aria-invalid={inviteError ? true : undefined}
                aria-describedby={`invite-format${inviteError ? " invite-error" : ""}`}
                placeholder="sam@example.com
Alex <alex@example.com>"
              />
            </label>
            <p
              id="invite-format"
              className="mt-2 text-sm leading-6 text-ink-500"
            >
              One address per line. Names are optional, for example Alex
              &lt;alex@example.com&gt;.
            </p>
            <button
              type="button"
              className={`${portalPrimary} mt-4`}
              disabled={busy || inviteBusy || !inviteText.trim() || !ownerKey}
              onClick={() => void invite()}
            >
              {inviteBusy ? "Saving invitations…" : "Send email invitations"}
            </button>
            {inviteNotice && (
              <p role="status" className="mt-4 text-base leading-7">
                {inviteNotice}
              </p>
            )}
            {inviteError && (
              <p
                id="invite-error"
                role="alert"
                className="mt-4 text-base leading-7 text-oxblood"
              >
                {inviteError}
              </p>
            )}
            {recipients.length > 0 && (
              <details className="mt-5 border-t border-clay-200 pt-4">
                <summary className="min-h-12 cursor-pointer py-2 text-base font-medium">
                  Invited readers (
                  {recipients.filter((person) => !person.revokedAt).length} with
                  access)
                </summary>
                <ul className="divide-y divide-clay-200">
                  {recipients.map((person) => (
                    <li
                      key={person.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-4"
                    >
                      <div className="min-w-0">
                        <p className="break-words font-medium">
                          {person.name || person.email}
                        </p>
                        {person.name && (
                          <p className="break-words text-sm text-ink-500">
                            {person.email}
                          </p>
                        )}
                        <p className="mt-1 text-sm text-ink-500">
                          {person.revokedAt
                            ? "Access removed"
                            : "Invitation saved"}
                        </p>
                      </div>
                      {!person.revokedAt && confirmRevokeId !== person.id && (
                        <button
                          type="button"
                          className={portalSecondary}
                          disabled={busy || inviteBusy}
                          aria-label={`Remove access for ${person.name || person.email}`}
                          onClick={() => setConfirmRevokeId(person.id)}
                        >
                          Remove access
                        </button>
                      )}
                      {!person.revokedAt && confirmRevokeId === person.id && (
                        <div
                          className="w-full rounded-xl border border-clay-200 bg-white p-4"
                          role="group"
                          aria-label={`Confirm removing access for ${person.name || person.email}`}
                        >
                          <p className="text-base leading-7">
                            Remove access for {person.name || person.email}?
                            They will no longer be able to open this gift. You
                            can invite them again later.
                          </p>
                          <div className="mt-3 flex flex-wrap gap-3">
                            <button
                              id={`keep-reader-${person.id}`}
                              type="button"
                              className={portalSecondary}
                              disabled={busy || inviteBusy}
                              onClick={() => setConfirmRevokeId("")}
                            >
                              Keep access
                            </button>
                            <button
                              type="button"
                              className={portalPrimary}
                              disabled={busy || inviteBusy}
                              onClick={() => void revoke(person.id)}
                            >
                              {inviteBusy
                                ? "Removing access…"
                                : "Yes, remove access"}
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        )}
        <details className="mt-6 border-t border-warmgray-200 pt-4">
          <summary className="min-h-12 cursor-pointer py-2 text-base font-semibold">
            Preview your gift, download the book or copy its secure link
          </summary>
          <div className="mt-4 grid items-start gap-7 md:grid-cols-[1fr_210px]">
            <div className="min-w-0">
              {c.links?.collection && (
                <PrivateLink
                  path={c.links.collection}
                  label={`Link to share with ${c.recipient.name}`}
                  description="This link opens a locked page. Your recipient verifies their email before reading or watching the approved stories."
                />
              )}
              <a
                href={
                  ownerKey
                    ? `/collection/${encodeURIComponent(c.id)}/preview?key=${encodeURIComponent(ownerKey)}`
                    : c.links?.collection
                }
                className={`${portalPrimary} mt-5`}
              >
                Preview as {c.recipient.name}
                <AppIcon name="arrowUpRight" size={19} />
              </a>
              <a
                href={`/api/collection/${encodeURIComponent(c.id)}/book?key=${encodeURIComponent(ownerKey)}`}
                className={`${portalSecondary} mt-3 inline-flex items-center gap-2`}
              >
                <AppIcon name="download" size={19} /> Download your story book
                (PDF)
              </a>
            </div>
            <div className="rounded-2xl bg-paper p-5 text-center">
              <div
                ref={qr}
                className="mx-auto flex h-40 w-40 items-center justify-center rounded-xl bg-white p-3"
              >
                {url && (
                  <QRCodeSVG
                    value={url}
                    size={136}
                    level="M"
                    marginSize={4}
                    title="QR code for your approved story collection"
                  />
                )}
              </div>
              <button
                type="button"
                onClick={downloadQr}
                disabled={!url}
                className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-medium underline underline-offset-4"
              >
                <AppIcon name="download" size={17} />
                Download QR code
              </button>
              <p className="mt-1 text-xs leading-5 text-ink-500">
                SVG file for printing or sharing.
              </p>
            </div>
          </div>
        </details>
      </section>
      <details
        ref={postcardsSection}
        className="scroll-mt-5 rounded-2xl border border-warmgray-200 bg-white p-5 sm:p-7"
      >
        <summary className="min-h-11 cursor-pointer text-lg font-semibold">
          Postcards and delivery
        </summary>
        <p className="mt-3 max-w-3xl text-base leading-7 text-ink-500">
          {automaticPostcards
            ? `Only ${c.recipient.name}, your primary recipient, receives physical postcards. Confirm their address and approve the public postcard messages below. The four cards are scheduled ${postcardCadenceLabel(c)} when delivery is connected.`
            : "Your approved digital collection requires recipient email verification. Postcards have not been selected for this collection."}
        </p>
        {c.postcardPreparation && (
          <p
            role="status"
            className="mt-4 rounded-xl bg-sage-50 p-4 text-base leading-7"
          >
            {c.postcardPreparation.message}
          </p>
        )}
        {c.deliveries.length > 0 && (
          <ol className="mt-5 divide-y divide-warmgray-200">
            {c.deliveries.map((delivery, index) => (
              <li
                key={delivery.chapterId}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <span>
                  Card {index + 1} · {dates(delivery.scheduledFor)}
                </span>
                <span className="rounded-full bg-paper px-3 py-1 text-sm font-medium">
                  {postcardStatus[delivery.status]}
                  {delivery.mailedAt ? ` ${dates(delivery.mailedAt)}` : ""}
                </span>
                {delivery.error && (
                  <p className="w-full text-sm text-oxblood">
                    {delivery.error}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
        <div className="mt-5 max-w-2xl">
          <h3 className="mb-4 text-lg font-semibold">
            Mailing address for {c.recipient.name}
          </h3>
          <AddressForm
            collectionId={c.id}
            accessKey={ownerKey || ""}
            initial={c.address}
            busy={busy}
            onDirtyChange={setAddressDirty}
            automaticPostcards={automaticPostcards}
            mailingStarted={c.deliveries.some(
              (delivery) => delivery.providerId,
            )}
            onSave={(address, verificationId) =>
              act({ action: "address", address, verificationId })
            }
          />
          {c.addressConfirmed && !addressDirty && (
            <p className="mt-4 text-base text-sage-700">
              Mailing address saved.
            </p>
          )}
        </div>
        {c.addressConfirmed && ownerKey && (
          <PostcardProof
            collection={c}
            accessKey={ownerKey}
            disabled={busy || addressDirty}
            onRefresh={onRefresh}
          />
        )}
        {(!c.capabilities.mail || !c.capabilities.email) && (
          <p className="mt-5 rounded-xl bg-paper p-4 text-sm leading-7 text-ink-500">
            Delivery setup is incomplete.{" "}
            {!c.capabilities.mail ? "Postcard mailing is not connected. " : ""}
            {!c.capabilities.email ? "Email sending is not connected. " : ""}Use
            the private link above to share your approved collection yourself.
          </p>
        )}
        {c.notifications.length > 0 && (
          <details className="mt-5">
            <summary className="min-h-11 cursor-pointer text-sm font-medium">
              Email delivery status
            </summary>
            <ul className="mt-3 space-y-3 text-sm leading-6">
              {c.notifications.map((notification) => (
                <li key={notification.id}>
                  {notification.subject}: {emailStatus[notification.status]}
                  {notification.error ? ` (${notification.error})` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </details>
    </div>
  );
}
