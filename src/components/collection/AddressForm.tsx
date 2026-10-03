"use client";
import { useEffect, useState } from "react";
import type { PostalAddress } from "@/lib/collection/types";
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
  initial,
  onSave,
  busy = false,
  onDirtyChange,
  automaticPostcards = true,
}: {
  initial?: PostalAddress;
  onSave: (a: PostalAddress) => Promise<unknown>;
  busy?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  automaticPostcards?: boolean;
}) {
  const [a, setA] = useState<PostalAddress>(initial || empty);
  const [base, setBase] = useState(signature(initial || empty));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const current = signature(initial || empty);
  const dirty = signature(a) !== current;
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
  return (
    <form
      className="space-y-5 text-base"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || saving) return;
        setSaving(true);
        setNotice("");
        setError("");
        try {
          const saved = await onSave(a);
          if (saved) setNotice("Your mailing address is saved and confirmed.");
          else
            setError(
              "Your address could not be saved. Your changes are still here. Please try again.",
            );
        } catch {
          setError(
            "Your address could not be saved. Your changes are still here. Please try again.",
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
              maxLength={key === "postalCode" ? 30 : 200}
              className="mt-2 min-h-12 w-full rounded-xl border border-warmgray-300 bg-white px-4 py-3 text-base"
              value={a[key] || ""}
              onChange={(event) => {
                setNotice("");
                setA({ ...a, [key]: event.target.value });
              }}
            />
          </label>
        ))}
        <p className="text-sm leading-7 text-ink-500">
          {automaticPostcards
            ? "US delivery. Postcards are prepared automatically after the storyteller approves the stories and this address is saved."
            : "US delivery. This saves the address. Postcard delivery has not been selected for this collection."}
        </p>
        <button
          disabled={busy || saving}
          className="brand-button-primary min-h-12 px-5 py-3 disabled:opacity-50"
        >
          {busy || saving ? "Saving…" : "Save and confirm address"}
        </button>
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
