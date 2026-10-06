"use client";
import { useEffect, useRef, useState } from "react";
import type { PostalAddress } from "@/lib/collection/types";
import type { AddressVerificationResult } from "@/lib/lob/address-verification-types";
import { collectionRequest } from "@/lib/collection/client-request";

const empty: PostalAddress = {
  name: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "US",
};
const signature = (a: PostalAddress) =>
  JSON.stringify([
    a.line1,
    a.line2 || "",
    a.city,
    a.region,
    a.postalCode,
    a.country,
  ]);

export default function AddressForm({
  collectionId,
  accessKey = "",
  initial,
  onSave,
  busy = false,
  onDirtyChange,
  automaticPostcards = true,
  mailingStarted = false,
}: {
  collectionId: string;
  accessKey?: string;
  initial?: PostalAddress;
  onSave: (a: PostalAddress, verificationId: string) => Promise<unknown>;
  busy?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  automaticPostcards?: boolean;
  mailingStarted?: boolean;
}) {
  const [a, setA] = useState<PostalAddress>(initial || empty);
  const [base, setBase] = useState(signature(initial || empty));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [verification, setVerification] =
    useState<AddressVerificationResult | null>(null);
  const [acceptedId, setAcceptedId] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [retry, setRetry] = useState(0);
  const acceptedSignature = useRef("");
  const current = signature(initial || empty);
  const candidate = signature(a);
  const dirty = candidate !== current;
  const endpoint = `/api/lob/verify-address?collectionId=${encodeURIComponent(collectionId)}${accessKey ? `&key=${encodeURIComponent(accessKey)}` : ""}`;

  useEffect(() => {
    if (current !== base) {
      if (signature(a) === base || signature(a) === current)
        setA(initial || empty);
      setBase(current);
    }
  }, [current, base, a, initial]);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (acceptedSignature.current === candidate && acceptedId) return;
    setVerification(null);
    setAcceptedId("");
    setCheckError("");
    const address = JSON.parse(candidate) as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    if (
      !address[0].trim() ||
      !address[2].trim() ||
      !address[3].trim() ||
      !/^\d{5}(?:-\d{4})?$/.test(address[4])
    ) {
      setChecking(false);
      return;
    }
    const controller = new AbortController();
    setChecking(true);
    const timer = setTimeout(() => {
      void collectionRequest<AddressVerificationResult>(
        endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            address: {
              line1: address[0],
              line2: address[1],
              city: address[2],
              region: address[3],
              postalCode: address[4],
              country: address[5],
            },
          }),
        },
        15000,
      )
        .then((result) => {
          if (!controller.signal.aborted) setVerification(result);
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted)
            setCheckError(
              cause instanceof Error
                ? cause.message
                : "Your address could not be checked. Please try again.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setChecking(false);
        });
    }, 800);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [candidate, endpoint, retry, acceptedId]);

  function acceptSuggestion() {
    if (!verification?.address || !verification.verificationId) return;
    acceptedSignature.current = signature(verification.address);
    setA(verification.address);
    setAcceptedId(verification.verificationId);
    setNotice("");
  }

  return (
    <form
      className="space-y-5 text-base"
      onSubmit={async (event) => {
        event.preventDefault();
        if (
          busy ||
          saving ||
          !acceptedId ||
          acceptedSignature.current !== candidate
        )
          return;
        setSaving(true);
        setNotice("");
        setError("");
        try {
          const saved = await onSave(a, acceptedId);
          if (saved)
            setNotice(
              verification?.mode === "test"
                ? "The test address is saved. Real mailing stays on hold until a live address check succeeds."
                : mailingStarted && dirty
                  ? "Your address is saved. The Time Tapestry team must review changes to an approved mailing. A postcard already sent for printing may still go to the previous address."
                  : "Your verified mailing address is saved and confirmed.",
            );
          else
            setError(
              "Your address could not be saved. Your changes are still here. Please try again.",
            );
        } catch (cause: unknown) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Your address could not be saved. Your changes are still here. Please try again.",
          );
        } finally {
          setSaving(false);
        }
      }}
    >
      <fieldset disabled={busy || saving} className="space-y-5">
        <legend className="sr-only">US mailing address</legend>
        {(
          [
            ["line1", "Street address", "address-line1"],
            ["line2", "Apartment or suite (optional)", "address-line2"],
            ["city", "City", "address-level2"],
            ["region", "State", "address-level1"],
            ["postalCode", "ZIP code", "postal-code"],
          ] as const
        ).map(([key, label, autoComplete]) => (
          <label className="block" key={key}>
            {label}
            <input
              required={key !== "line2"}
              autoComplete={autoComplete}
              maxLength={key === "postalCode" ? 10 : 200}
              className="mt-2 min-h-12 w-full rounded-xl border border-warmgray-300 bg-white px-4 py-3 text-base"
              value={a[key] || ""}
              onChange={(event) => {
                setNotice("");
                setError("");
                setAcceptedId("");
                acceptedSignature.current = "";
                setA({ ...a, [key]: event.target.value });
              }}
            />
          </label>
        ))}
        <p className="text-sm leading-7 text-ink-500">
          {mailingStarted
            ? "Changes after printing begins pause future postcards until the team reviews the mailing."
            : automaticPostcards
              ? "US delivery. Mailing begins after story approval, address verification, and your separate approval of the printed cards."
              : "US delivery. Saving an address does not select postcard delivery."}
        </p>
        {checking && <p role="status">Checking the mailing address…</p>}
        {checkError && (
          <div className="rounded-xl bg-clay-50 p-4">
            <p role="alert" className="leading-7">
              {checkError}
            </p>
            <button
              type="button"
              onClick={() => setRetry((value) => value + 1)}
              className="brand-button-secondary mt-3 min-h-12 px-5 py-3"
            >
              Try address check again
            </button>
          </div>
        )}
        {verification && (
          <div className="rounded-xl border border-sage-200 bg-sage-50 p-4">
            <p role="status" className="leading-7">
              {verification.message}
            </p>
            {verification.deliverable && verification.address && (
              <>
                <address className="my-3 whitespace-pre-line not-italic leading-7">
                  {[
                    verification.address.name,
                    verification.address.line1,
                    verification.address.line2,
                    `${verification.address.city}, ${verification.address.region} ${verification.address.postalCode}`,
                  ]
                    .filter(Boolean)
                    .join("\n")}
                </address>
                <button
                  type="button"
                  disabled={Boolean(acceptedId)}
                  onClick={acceptSuggestion}
                  className="brand-button-secondary min-h-12 px-5 py-3 disabled:opacity-60"
                >
                  {acceptedId
                    ? "Suggested address selected"
                    : "Use this address"}
                </button>
                {acceptedId && (
                  <button
                    type="button"
                    className="ml-3 min-h-12 underline underline-offset-4"
                    onClick={() => {
                      setAcceptedId("");
                      acceptedSignature.current = "";
                      setRetry((value) => value + 1);
                    }}
                  >
                    Check address again
                  </button>
                )}
              </>
            )}
          </div>
        )}
        <button
          disabled={busy || saving || checking || !acceptedId}
          className="brand-button-primary min-h-12 px-5 py-3 disabled:opacity-50"
        >
          {busy || saving ? "Saving…" : "Save and confirm address"}
        </button>
        {!acceptedId && (
          <p className="text-sm leading-7 text-ink-500">
            Check the complete address and select the suggested address before
            saving.
          </p>
        )}
        {dirty && (
          <p role="status" className="text-base text-ink-500">
            Save these changes to update the mailing address.
          </p>
        )}
      </fieldset>
      {error && (
        <p role="alert" className="text-base leading-7 text-oxblood">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-base leading-7 text-sage-700">
          {notice}
        </p>
      )}
    </form>
  );
}
