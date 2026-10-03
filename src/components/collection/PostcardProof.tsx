"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CollectionView } from "@/lib/collection/types";
import type { PostcardProofSnapshot } from "@/lib/collection/postcard-proofs";
import { PortalError, portalPrimary, portalSecondary } from "./PortalUI";

type ProofResponse = {
  proof: PostcardProofSnapshot;
  approvedProof: PostcardProofSnapshot | null;
  current: boolean;
  readiness: { ready: boolean; reasons: string[] };
};
const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
function ProofFace({
  html,
  title,
  onFit,
}: {
  html: string;
  title: string;
  onFit: (fits: boolean) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const resize = new ResizeObserver(([entry]) =>
      setScale(entry.contentRect.width / 600),
    );
    if (container.current) resize.observe(container.current);
    return () => resize.disconnect();
  }, []);
  return (
    <div
      ref={container}
      className="relative aspect-[600/408] w-full overflow-hidden border border-warmgray-300 bg-white"
    >
      <iframe
        title={title}
        sandbox="allow-same-origin"
        referrerPolicy="no-referrer"
        srcDoc={html}
        className="absolute left-0 top-0 border-0"
        style={{
          width: 600,
          height: 408,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
        onLoad={async (event) => {
          const doc = event.currentTarget.contentDocument;
          if (!doc) return onFit(false);
          await doc.fonts.ready;
          const content = doc.querySelector(".content");
          onFit(
            Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight) <=
              410 &&
              (!content || content.getBoundingClientRect().bottom <= 384),
          );
        }}
      />
    </div>
  );
}
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
  const endpoint = `/api/collection/${encodeURIComponent(c.id)}/postcard-proof?key=${encodeURIComponent(accessKey)}`;
  const version = JSON.stringify([
    c.address,
    c.addressConfirmed,
    c.postcardProof?.hash,
  ]);
  useEffect(() => {
    setFits({});
    setResult(undefined);
    if (!open || disabled || !c.addressConfirmed) return;
    const controller = new AbortController();
    setBusy(true);
    setError("");
    void fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            body.error || "The print preview could not be opened.",
          );
        if (!controller.signal.aborted) setResult(body);
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
  return (
    <details
      className="mt-6 border-t border-warmgray-200 pt-5"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="min-h-12 cursor-pointer text-lg font-semibold">
        See the postcard print preview
      </summary>
      <p className="mt-3 max-w-3xl text-base leading-8 text-ink-500">
        Your story approval starts postcard preparation automatically once the
        address is ready. This optional view shows the front and back prepared
        for printing. There is nothing else to approve or schedule here.
      </p>
      {disabled && (
        <p role="status" className="mt-4 text-base text-ink-500">
          Save and confirm the address above to see the current print version.
        </p>
      )}
      <PortalError message={error} />
      {error && (
        <button
          type="button"
          className={portalSecondary}
          onClick={() => setReload((value) => value + 1)}
        >
          Try opening the print preview again
        </button>
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
                  <ProofFace
                    html={card.front}
                    title={`Card ${active + 1} front print preview`}
                    onFit={(value) => setFit(`${card.chapterId}:front`, value)}
                  />
                </div>
                <div>
                  <p className="mb-2 text-base font-medium">Back</p>
                  <ProofFace
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
                    href={`${c.links.collection.split("?")[0]}/chapter/${card.chapterId}?${c.links.collection.split("?")[1]}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open this card’s story link
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
              : "Mailing has not been released. Delivery setup is handled by the Time Tapestry team."}
          </p>
        </>
      )}
    </details>
  );
}
