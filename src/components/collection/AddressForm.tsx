"use client";
import { useState } from "react";
import type { PostalAddress } from "@/lib/collection/types";
export default function AddressForm({
  initial,
  onSave,
  busy = false,
}: {
  initial?: PostalAddress;
  onSave: (a: PostalAddress) => Promise<unknown>;
  busy?: boolean;
}) {
  const [a, setA] = useState<PostalAddress>(
    initial || {
      name: "",
      line1: "",
      line2: "",
      city: "",
      region: "",
      postalCode: "",
      country: "US",
    },
  );
  return (
    <form
      className="space-y-5 text-base"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(a);
      }}
    >
      {(
        [
          ["line1", "Street address"],
          ["line2", "Apartment or suite (optional)"],
          ["city", "City"],
          ["region", "State"],
          ["postalCode", "ZIP code"],
        ] as const
      ).map(([key, label]) => (
        <label className="block" key={key}>
          {label}
          <input
            required={key !== "line2"}
            className="mt-2 min-h-12 w-full rounded-md border border-warmgray-300 bg-white px-4 py-3 text-base transition-colors hover:border-taupe"
            value={a[key] || ""}
            onChange={(e) => setA({ ...a, [key]: e.target.value })}
          />
        </label>
      ))}
      <p className="text-sm text-ink-500">
        US delivery. We use this address for the four postcards.
      </p>
      <button
        disabled={busy}
        className="brand-button-primary min-h-12 px-5 py-3 disabled:opacity-50"
      >
        {busy ? "Saving..." : "Confirm mailing address"}
      </button>
    </form>
  );
}
