"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { CollectionView } from "@/lib/collection/types";
import { AppIcon } from "@/components/icons";
import AddressForm from "./AddressForm";
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
}: {
  collection: CollectionView;
  busy: boolean;
  act: (body: unknown) => Promise<CollectionView | null>;
}) {
  const [url, setUrl] = useState("");
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
            Your stories are ready to share with {c.recipient.name}.
          </h2>
        </div>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-ink-500">
          You can now share these four stories with {c.recipient.name}. This
          approved version is fixed in the pilot, so the same stories open every
          time.
        </p>
        <div className="mt-6 grid items-start gap-7 md:grid-cols-[1fr_210px]">
          <div className="min-w-0">
            {c.links?.collection && (
              <PrivateLink
                path={c.links.collection}
                label={`Link to share with ${c.recipient.name}`}
                description="Anyone with this link can open the approved stories. Share it only with the people you choose."
              />
            )}
            <a href={c.links?.collection} className={`${portalPrimary} mt-5`}>
              Preview their collection
              <AppIcon name="arrowUpRight" size={19} />
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
      </section>
      <details className="rounded-2xl border border-warmgray-200 bg-white p-5 sm:p-7">
        <summary className="min-h-11 cursor-pointer text-lg font-semibold">
          Postcards and delivery (optional)
        </summary>
        <p className="mt-3 max-w-3xl text-base leading-7 text-ink-500">
          Your digital collection is already available. You can add a mailing
          address and plan postcards separately. Scheduling a card does not mean
          it has been printed or mailed.
        </p>
        {c.deliveries.length > 0 ? (
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
        ) : (
          <div className="mt-5 max-w-2xl">
            <h3 className="mb-4 text-lg font-semibold">
              Mailing address for {c.recipient.name}
            </h3>
            <AddressForm
              initial={c.address}
              busy={busy}
              onSave={(address) => act({ action: "address", address })}
            />
            {c.addressConfirmed && (
              <p className="mt-4 text-sm text-sage-700">
                Mailing address saved.
              </p>
            )}
            <button
              type="button"
              className={`${portalSecondary} mt-5`}
              disabled={busy || !c.addressConfirmed}
              onClick={() => void act({ action: "schedule_postcards" })}
            >
              Schedule the four postcards
            </button>
          </div>
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
