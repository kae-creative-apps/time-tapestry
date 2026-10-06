"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { collectionRequest } from "@/lib/collection/client-request";
import type { CollectionView } from "@/lib/collection/types";
import type { PostcardProofSnapshot } from "@/lib/collection/postcard-proofs";
import {
  publicPostcardMessage,
  PUBLIC_POSTCARD_MESSAGE_LIMIT,
} from "@/lib/collection/postcard-public-message";
import { PortalError, portalPrimary, portalSecondary } from "./PortalUI";
import { PostcardFace } from "./PostcardFace";
import { mergePostcardDrafts, postcardDraftsEqual } from "./postcard-drafts";
import { postcardCadenceLabel } from "@/lib/collection/postcard-cadence";

type ProofResponse = {
  proof: PostcardProofSnapshot;
  previewOnly?: boolean;
  approvedProof: PostcardProofSnapshot | null;
  current: boolean;
  readiness: {
    ready: boolean;
    reasons: string[];
    mode: "test" | "live" | "unconfigured";
  };
  publicMessages: Record<string, string>;
};
const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

export function PostcardProof({
  collection: c,
  accessKey,
  disabled,
  draftOnly = false,
  onPendingChange,
  onRefresh,
}: {
  collection: CollectionView;
  accessKey: string;
  disabled: boolean;
  draftOnly?: boolean;
  onPendingChange?: (pending: boolean) => void;
  onRefresh?: () => Promise<unknown>;
}) {
  const [result, setResult] = useState<ProofResponse>();
  const [active, setActive] = useState(0);
  const [fits, setFits] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
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
  const messagesRef = useRef(messages);
  const baselineRef = useRef(savedMessages);
  const savingRef = useRef(false);
  const mounted = useRef(true);
  messagesRef.current = messages;
  baselineRef.current = savedMessages;
  const [publicApproved, setPublicApproved] = useState(false);
  const [notice, setNotice] = useState("");
  const endpoint = `/api/collection/${encodeURIComponent(c.id)}/postcard-proof?key=${encodeURIComponent(accessKey)}`;
  const previewEndpoint = `${endpoint}${draftOnly ? "&preview=1" : ""}`;
  const version = JSON.stringify([
    c.address,
    c.addressConfirmed,
    c.postcardProof?.hash,
  ]);
  const mailingStarted = c.deliveries.some(
    (delivery) => delivery.providerId || (delivery.dispatch?.attempts || 0) > 0,
  );
  const dirty = !postcardDraftsEqual(messages, savedMessages);
  const valid = Object.values(messages).every(
    (value) =>
      value.trim().length > 0 &&
      value.trim().length <= PUBLIC_POSTCARD_MESSAGE_LIMIT,
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setChecking(true);
    setError("");
    void collectionRequest<ProofResponse>(previewEndpoint, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((body) => {
        if (controller.signal.aborted) return;
        setResult(body);
        // A proof/address refresh can arrive while the storyteller is typing.
        if (!savingRef.current) {
          const merged = mergePostcardDrafts(
            messagesRef.current,
            baselineRef.current,
            body.publicMessages,
          );
          messagesRef.current = merged;
          baselineRef.current = body.publicMessages;
          setMessages(merged);
          setSavedMessages(body.publicMessages);
        }
        setFits({});
        setPublicApproved(false);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "The postcard preview could not be opened.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [previewEndpoint, version, reload]);

  const saveMessages = useCallback(async () => {
    if (savingRef.current || mailingStarted || disabled) return;
    const snapshot = { ...messagesRef.current };
    if (
      postcardDraftsEqual(snapshot, baselineRef.current) ||
      Object.values(snapshot).some(
        (value) =>
          !value.trim() || value.trim().length > PUBLIC_POSTCARD_MESSAGE_LIMIT,
      )
    )
      return;
    savingRef.current = true;
    setSaving(true);
    setSaveError("");
    try {
      const response = await collectionRequest<{
        publicMessages: Record<string, string>;
      }>(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_messages", messages: snapshot }),
      });
      if (!mounted.current) return;
      const merged = mergePostcardDrafts(
        messagesRef.current,
        snapshot,
        response.publicMessages,
      );
      messagesRef.current = merged;
      baselineRef.current = response.publicMessages;
      setMessages(merged);
      setSavedMessages(response.publicMessages);
      setPublicApproved(false);
      setReload((value) => value + 1);
    } catch (cause) {
      if (mounted.current)
        setSaveError(
          cause instanceof Error
            ? cause.message
            : "Your postcard words could not be saved. Keep this page open and try again.",
        );
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  }, [endpoint, mailingStarted, disabled]);
  useEffect(() => {
    if (!dirty || !valid || saving || saveError || mailingStarted) return;
    const timer = setTimeout(() => void saveMessages(), 700);
    return () => clearTimeout(timer);
  }, [messages, dirty, valid, saving, saveError, mailingStarted, saveMessages]);
  useEffect(() => {
    onPendingChange?.(dirty || saving);
  }, [dirty, saving, onPendingChange]);
  useEffect(() => {
    if (!dirty && !saving) return;
    const preventLoss = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [dirty, saving]);
  useEffect(() => {
    const online = () => {
      setSaveError("");
      void saveMessages();
    };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [saveMessages]);
  const setFit = useCallback(
    (key: string, value: boolean) =>
      setFits((old) => (old[key] === value ? old : { ...old, [key]: value })),
    [],
  );
  const proof = result?.proof;
  const card = proof?.cards[active];
  const chapter = c.chapters[active];
  const previewOnly =
    draftOnly ||
    result?.previewOnly ||
    c.status !== "approved" ||
    !c.addressConfirmed;
  const saved = Boolean(
    proof && result?.current && result.approvedProof?.hash === proof.hash,
  );
  const overflow = Object.values(fits).some((value) => !value);
  const allChecked = Boolean(
    proof &&
    proof.cards.every(
      (item) =>
        fits[`${item.chapterId}:front`] && fits[`${item.chapterId}:back`],
    ),
  );
  async function approvePublicCards() {
    if (
      !proof ||
      previewOnly ||
      dirty ||
      !publicApproved ||
      !allChecked ||
      overflow ||
      disabled ||
      approving
    )
      return;
    setApproving(true);
    setError("");
    setNotice("");
    try {
      const response = await collectionRequest<{
        readiness: { ready: boolean; mode: "test" | "live" | "unconfigured" };
      }>(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
          : response.readiness.mode === "test"
            ? "Your designs are approved and saved. Test mode is on, so nothing will be mailed."
            : "Your designs are approved and saved. Mailing is on hold until setup is complete.",
      );
      setReload((value) => value + 1);
      const refreshed = await onRefresh?.();
      if (refreshed === null)
        setError(
          "Your approval was saved. Delivery status could not refresh. Check your connection and refresh the status.",
        );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The postcards could not be approved.",
      );
    } finally {
      setApproving(false);
    }
  }

  return (
    <section
      className="rounded-2xl border border-warmgray-200 bg-white p-5 sm:p-7"
      aria-labelledby={
        draftOnly ? "postcard-draft-heading" : "postcard-proof-heading"
      }
    >
      <h2
        id={draftOnly ? "postcard-draft-heading" : "postcard-proof-heading"}
        className="text-2xl font-semibold"
      >
        A little encouragement in the mail
      </h2>
      <p className="mt-3 max-w-3xl text-base leading-7 text-ink-600">
        Keep the suggested words or add your own encouragement for{" "}
        {c.recipient.name}. Anyone handling a postcard can read its words and
        names. Your stories stay private behind email verification.
      </p>
      <nav
        aria-label="Choose a postcard"
        className="my-5 grid grid-cols-4 gap-2"
      >
        {c.chapters.map((item, index) => (
          <button
            key={item.id}
            type="button"
            aria-current={active === index ? "true" : undefined}
            className={`${active === index ? portalPrimary : portalSecondary} !px-2 text-sm sm:text-base`}
            onClick={() => setActive(index)}
          >
            Card {index + 1}
          </button>
        ))}
      </nav>
      {chapter && (
        <div className="mb-5">
          <label
            className="text-base font-semibold"
            htmlFor={`public-postcard-${chapter.id}`}
          >
            Card {active + 1}: encouragement for {c.recipient.name}
          </label>
          <textarea
            id={`public-postcard-${chapter.id}`}
            rows={3}
            maxLength={PUBLIC_POSTCARD_MESSAGE_LIMIT}
            disabled={disabled || mailingStarted || approving}
            value={messages[chapter.id] || ""}
            onChange={(event) => {
              const next = {
                ...messagesRef.current,
                [chapter.id]: event.target.value,
              };
              messagesRef.current = next;
              setMessages(next);
              setPublicApproved(false);
              setSaveError("");
            }}
            onBlur={() => void saveMessages()}
            className="mt-2 w-full rounded-xl border border-warmgray-300 bg-white p-4 text-lg leading-7 text-espresso focus:outline-espresso"
            aria-describedby="postcard-save-status"
          />
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm text-ink-600">
            <p>
              {(messages[chapter.id] || "").length} of{" "}
              {PUBLIC_POSTCARD_MESSAGE_LIMIT} characters
            </p>
            <p id="postcard-save-status" role="status">
              {saving
                ? "Saving your words…"
                : dirty
                  ? valid
                    ? "Changes waiting to save"
                    : "Add a short message to save this card."
                  : "Your words are saved securely."}
            </p>
          </div>
          {saveError && (
            <>
              <p role="alert" className="mt-3 text-base text-oxblood">
                {saveError}
              </p>
              <button
                type="button"
                className={`${portalSecondary} mt-3`}
                disabled={saving || !valid}
                onClick={() => void saveMessages()}
              >
                Try saving again
              </button>
            </>
          )}
          {mailingStarted && (
            <p className="mt-3 text-sm leading-6">
              These words are fixed because mailing has started. Your approved
              print version is preserved.
            </p>
          )}
        </div>
      )}
      <PortalError message={error} />
      {error && (
        <button
          type="button"
          className={`${portalSecondary} mt-3`}
          onClick={() => {
            setReload((value) => value + 1);
            void onRefresh?.();
          }}
        >
          Refresh postcard preview
        </button>
      )}
      {checking && !proof && (
        <p role="status" className="my-5 text-base">
          Opening your postcards…
        </p>
      )}
      {card && (
        <div key={`${proof?.hash}:${card.chapterId}`}>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-base font-medium">Front</h3>
              <PostcardFace
                html={card.front}
                title={`Card ${active + 1} front`}
                onFit={(value) => setFit(`${card.chapterId}:front`, value)}
              />
            </div>
            <div>
              <h3 className="mb-2 text-base font-medium">Back</h3>
              <PostcardFace
                html={card.back}
                title={`Card ${active + 1} back`}
                onFit={(value) => setFit(`${card.chapterId}:back`, value)}
              />
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-ink-600">
            {dirty || saving
              ? "The preview shows your last saved wording. It updates after your changes are saved."
              : previewOnly
                ? "Design preview. The sample QR code does not open a story. The mailing version is prepared after your gift is approved and the address is confirmed."
                : "Print preview, including the bleed. The mailing service adds the confirmed address and postage to the reserved area."}
          </p>
        </div>
      )}
      {previewOnly ? (
        <p className="mt-5 rounded-xl bg-sage-50 p-4 text-base leading-7">
          Your four cards are planned {postcardCadenceLabel(c)}. You’ll confirm
          the address and approve the mailing version separately. Your digital
          gift can be shared first.
        </p>
      ) : (
        proof &&
        result && (
          <>
            <div className="mt-5 grid gap-4 rounded-xl bg-paper p-4 sm:grid-cols-2">
              <div>
                <h3 className="font-semibold">Mailing to {c.recipient.name}</h3>
                <address className="mt-2 whitespace-pre-line text-sm not-italic leading-6">
                  {[
                    proof.address.name,
                    proof.address.line1,
                    proof.address.line2,
                    `${proof.address.city}, ${proof.address.region} ${proof.address.postalCode}`,
                  ]
                    .filter(Boolean)
                    .join("\n")}
                </address>
              </div>
              <div>
                <h3 className="font-semibold">Planned dates</h3>
                <ol className="mt-2 text-sm leading-6">
                  {proof.cards.map((item, index) => (
                    <li key={item.chapterId}>
                      Card {index + 1}: {dateLabel(item.scheduledFor)}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            {!result.readiness.ready && (
              <p
                role="status"
                className="mt-4 rounded-xl bg-sage-50 p-4 text-base leading-7"
              >
                {result.readiness.mode === "test"
                  ? "Test mode is on. No postcards will be mailed."
                  : "Mailing is on hold while delivery is connected."}{" "}
                You can approve and save the designs. Digital access is
                separate.
              </p>
            )}
            {overflow && (
              <p
                role="alert"
                className="mt-4 rounded-xl bg-clay-50 p-4 text-base leading-7"
              >
                The print layout or font needs checking. Refresh the preview.
                Mailing approval will stay on hold until the layout fits.
              </p>
            )}
            {notice && (
              <p
                role="status"
                className="mt-4 rounded-xl bg-sage-50 p-4 text-base leading-7"
              >
                {notice}
              </p>
            )}
            {saved ? (
              <p className="mt-5 font-medium">
                Your approved print version is saved.
              </p>
            ) : (
              <div className="mt-5 border-t border-warmgray-200 pt-5">
                <label className="flex items-start gap-3 text-base leading-7">
                  <input
                    type="checkbox"
                    className="mt-1.5 h-5 w-5 shrink-0 accent-espresso"
                    checked={publicApproved}
                    disabled={dirty || saving || approving || disabled}
                    onChange={(event) =>
                      setPublicApproved(event.target.checked)
                    }
                  />
                  <span>
                    I reviewed all four cards, the address and dates. I approve
                    the printed words and names for anyone handling the mail to
                    read.
                  </span>
                </label>
                <button
                  type="button"
                  className={`${portalPrimary} mt-4`}
                  disabled={
                    disabled ||
                    dirty ||
                    saving ||
                    approving ||
                    checking ||
                    !publicApproved ||
                    !allChecked ||
                    overflow
                  }
                  onClick={() => void approvePublicCards()}
                >
                  {approving
                    ? "Saving approval…"
                    : result.readiness.ready
                      ? "Approve postcards for mailing"
                      : "Approve and save designs"}
                </button>
                {!allChecked && (
                  <p className="mt-3 text-sm leading-6 text-ink-600">
                    Open all four postcard previews before approving the print
                    version.
                  </p>
                )}
              </div>
            )}
          </>
        )
      )}
    </section>
  );
}
