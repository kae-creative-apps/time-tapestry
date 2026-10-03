"use client";
import { useCallback, useEffect, useState } from "react";
import { collectionRequest } from "@/lib/collection/client-request";
import type { CollectionView } from "@/lib/collection/types";
import type { PostcardProofSnapshot } from "@/lib/collection/postcard-proofs";
import {
  publicPostcardMessage,
  PUBLIC_POSTCARD_MESSAGE_LIMIT,
} from "@/lib/collection/postcard-public-message";
import { PortalError, portalPrimary, portalSecondary } from "./PortalUI";
import { PostcardFace } from "./PostcardFace";

type ProofResponse = {
  proof: PostcardProofSnapshot;
  approvedProof: PostcardProofSnapshot | null;
  current: boolean;
  readiness: { ready: boolean; reasons: string[] };
  publicMessages: Record<string, string>;
};
const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
export function PostcardProof({
  collection: c,
  accessKey,
  disabled,
}: {
  collection: CollectionView;
  accessKey: string;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ProofResponse>();
  const [active, setActive] = useState(0);
  const [fits, setFits] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [messages, setMessages] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      c.chapters.map((chapter) => [
        chapter.id,
        publicPostcardMessage(c, chapter.id),
      ]),
    ),
  );
  const [savedMessages, setSavedMessages] = useState(messages);
  const [publicApproved, setPublicApproved] = useState(false);
  const [notice, setNotice] = useState("");
  const endpoint = `/api/collection/${encodeURIComponent(c.id)}/postcard-proof?key=${encodeURIComponent(accessKey)}`;
  const version = JSON.stringify([
    c.address,
    c.addressConfirmed,
    c.postcardProof?.hash,
    c.postcardPublicMessages,
  ]);
  useEffect(() => {
    setFits({});
    setResult(undefined);
    if (!open || disabled || !c.addressConfirmed) return;
    const controller = new AbortController();
    setBusy(true);
    setError("");
    void collectionRequest<ProofResponse>(endpoint, {
      signal: controller.signal,
    })
      .then((body) => {
        if (!controller.signal.aborted) {
          setResult(body);
          setMessages(body.publicMessages);
          setSavedMessages(body.publicMessages);
          setPublicApproved(false);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "The print preview could not be opened.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [endpoint, open, version, c.addressConfirmed, disabled, reload]);
  const setFit = useCallback(
    (key: string, fits: boolean) =>
      setFits((old) => (old[key] === fits ? old : { ...old, [key]: fits })),
    [],
  );
  const proof = result?.proof;
  const card = proof?.cards[active];
  const saved = Boolean(
    proof && result?.current && result.approvedProof?.hash === proof.hash,
  );
  const overflow = Object.values(fits).some((value) => !value);
  const dirty = JSON.stringify(messages) !== JSON.stringify(savedMessages);
  const allChecked = Boolean(
    proof &&
    proof.cards.every(
      (item) =>
        fits[`${item.chapterId}:front`] && fits[`${item.chapterId}:back`],
    ),
  );
  async function saveMessages() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await collectionRequest<{
        publicMessages: Record<string, string>;
      }>(endpoint, {
        method: "POST",
        body: JSON.stringify({ action: "save_messages", messages }),
      });
      setSavedMessages(response.publicMessages);
      setPublicApproved(false);
      setNotice(
        "Your public messages are saved. Review all four cards below, then approve them for mailing.",
      );
      setReload((value) => value + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The postcard messages could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function approvePublicCards() {
    if (!proof || dirty || !publicApproved || !allChecked || overflow) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await collectionRequest<{
        readiness: { ready: boolean };
      }>(endpoint, {
        method: "POST",
        body: JSON.stringify({
          action: "approve",
          proofHash: proof.hash,
          firstMailingAt: proof.firstMailingAt,
          reviewed: true,
          publicMessageApproved: true,
        }),
      });
      setNotice(
        response.readiness.ready
          ? "Your postcards are approved for automatic mailing."
          : "Your public postcards are approved. Mailing will wait until delivery and secure recipient sign-in are connected.",
      );
      setReload((value) => value + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The postcards could not be approved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="mt-6 border-t border-warmgray-200 pt-5"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="min-h-12 cursor-pointer text-lg font-semibold">
        Review the words on your postcards
      </summary>
      <p className="mt-3 max-w-3xl text-base leading-8 text-ink-500">
        A postcard is open mail. Anyone handling it can read the words and names
        printed on it. These short messages are separate from your private
        stories, recordings and personal encouragement. The QR code asks your
        recipient to verify their email before opening the stories.
      </p>
      {disabled && (
        <p role="status" className="mt-4 text-base text-ink-500">
          Save and confirm the address above to see the current print version.
        </p>
      )}
      <PortalError message={error} />
      {notice && (
        <p
          role="status"
          className="mt-4 rounded-xl bg-sage-50 p-4 text-base leading-7"
        >
          {notice}
        </p>
      )}
      {error && (
        <button
          type="button"
          className={portalSecondary}
          onClick={() => setReload((value) => value + 1)}
        >
          Try opening the print preview again
        </button>
      )}
      {open && !disabled && (
        <>
          <div className="mt-5 rounded-2xl border border-warmgray-300 bg-white p-5">
            <h3 className="text-xl font-semibold">
              A little encouragement in the mail
            </h3>
            <p className="mt-2 text-base leading-7 text-ink-500">
              Keep the suggested words or write your own. You can add a short
              Scripture and its reference here if you want it printed. Leave
              financial details and personal stories on the private story page.
            </p>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              {c.chapters.map((item, index) => (
                <div key={item.id}>
                  <label
                    className="block text-base font-semibold"
                    htmlFor={`public-postcard-${item.id}`}
                  >
                    Card {index + 1}: public message
                  </label>
                  <textarea
                    id={`public-postcard-${item.id}`}
                    rows={4}
                    maxLength={PUBLIC_POSTCARD_MESSAGE_LIMIT}
                    disabled={busy}
                    value={messages[item.id] || ""}
                    onChange={(event) => {
                      setMessages((old) => ({
                        ...old,
                        [item.id]: event.target.value,
                      }));
                      setPublicApproved(false);
                    }}
                    className="mt-2 w-full rounded-xl border border-warmgray-300 bg-white p-4 text-lg leading-7 text-espresso focus:outline-espresso"
                  />
                  <p className="mt-1 text-sm text-ink-500">
                    {(messages[item.id] || "").length} of{" "}
                    {PUBLIC_POSTCARD_MESSAGE_LIMIT} characters
                  </p>
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled={busy || !dirty}
              className={`${portalSecondary} mt-4`}
              onClick={() => void saveMessages()}
            >
              Save postcard words
            </button>
            {dirty && (
              <p role="status" className="mt-3 text-base">
                Save your changes to update the print preview.
              </p>
            )}
          </div>
        </>
      )}
      {busy && !proof && (
        <p role="status" className="mt-5 text-base">
          Opening the print preview…
        </p>
      )}
      {proof && !disabled && (
        <>
          <div className="mt-5 grid gap-5 rounded-2xl bg-paper p-5 sm:grid-cols-2">
            <div>
              <h3 className="text-lg font-semibold">Saved mailing address</h3>
              <address className="mt-3 whitespace-pre-line text-base not-italic leading-7">
                {[
                  proof.address.name,
                  proof.address.line1,
                  proof.address.line2,
                  `${proof.address.city}, ${proof.address.region} ${proof.address.postalCode}`,
                  proof.address.country,
                ]
                  .filter(Boolean)
                  .join("\n")}
              </address>
            </div>
            <div>
              <h3 className="text-lg font-semibold">Planned dates</h3>
              <ol className="mt-3 space-y-2 text-base leading-7">
                {proof.cards.map((item, index) => (
                  <li key={item.chapterId}>
                    Card {index + 1}: {dateLabel(item.scheduledFor)}{" "}
                    <span className="text-ink-500">(month {index * 3})</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-sm leading-7 text-ink-500">
                All four stories open from the first card. If mailing is
                delayed, later cards move too, keeping at least three months
                between confirmed mailings.
              </p>
            </div>
          </div>
          <nav
            aria-label="Choose a postcard preview"
            className="my-5 grid grid-cols-2 gap-3 sm:grid-cols-4"
          >
            {proof.cards.map((item, index) => (
              <button
                key={item.chapterId}
                type="button"
                aria-current={active === index ? "step" : undefined}
                className={`${active === index ? portalPrimary : portalSecondary} text-base`}
                onClick={() => setActive(index)}
              >
                Card {index + 1}
              </button>
            ))}
          </nav>
          {card && (
            <div key={`${proof.hash}:${card.chapterId}`}>
              <h3 className="mb-4 text-xl font-semibold">{card.title}</h3>
              <div className="grid gap-5 xl:grid-cols-2">
                <div>
                  <p className="mb-2 text-base font-medium">Front</p>
                  <PostcardFace
                    html={card.front}
                    title={`Card ${active + 1} front print preview`}
                    onFit={(value) => setFit(`${card.chapterId}:front`, value)}
                  />
                </div>
                <div>
                  <p className="mb-2 text-base font-medium">Back</p>
                  <PostcardFace
                    html={card.back}
                    title={`Card ${active + 1} back print preview`}
                    onFit={(value) => setFit(`${card.chapterId}:back`, value)}
                  />
                </div>
              </div>
              <p className="mt-3 text-sm leading-7 text-ink-500">
                The blank area on the back is reserved for the mailing service
                to print the saved address and postage. The preview includes the
                print bleed around the edges.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  className={portalSecondary}
                  onClick={() => setActive((active + 1) % 4)}
                >
                  Next card
                </button>
                {c.links?.collection && (
                  <a
                    className={portalSecondary}
                    href={`/collection/${encodeURIComponent(c.id)}/chapter/${encodeURIComponent(card.chapterId)}?key=${encodeURIComponent(accessKey)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Preview this card’s story
                  </a>
                )}
              </div>
            </div>
          )}
          {overflow && (
            <p
              role="alert"
              className="mt-5 rounded-xl bg-clay-50 p-4 text-base leading-7"
            >
              Some wording may extend beyond the print area. The team needs to
              check this layout before mailing.
            </p>
          )}
          <p className="mt-5 text-base leading-7 text-ink-500">
            {saved
              ? "This saved print version fixes the wording, address, artwork and QR links."
              : "This is a preview of the current approved wording and saved address."}{" "}
            {result?.approvedProof?.releaseStatus === "released" &&
            result.current
              ? "The postcards are on the automatic mailing schedule."
              : "Mailing is on hold until the public messages are approved and delivery is ready."}
          </p>
          {!saved && (
            <div className="mt-5 rounded-2xl border border-espresso/20 bg-paper p-5">
              <label className="flex min-h-12 cursor-pointer items-start gap-3 text-base leading-7">
                <input
                  type="checkbox"
                  checked={publicApproved}
                  disabled={busy || dirty}
                  onChange={(event) => setPublicApproved(event.target.checked)}
                  className="mt-1.5 h-6 w-6 shrink-0 accent-espresso"
                />
                <span>
                  I reviewed all four cards, the address and the dates. I
                  approve the printed messages and names for anyone handling the
                  mail to read.
                </span>
              </label>
              <button
                type="button"
                className={`${portalPrimary} mt-4`}
                disabled={
                  busy || dirty || !publicApproved || !allChecked || overflow
                }
                onClick={() => void approvePublicCards()}
              >
                {busy ? "Saving…" : "Approve postcards for automatic mailing"}
              </button>
              {!allChecked && (
                <p className="mt-3 text-base leading-7">
                  Open each of the four card previews above before approving.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </details>
  );
}
