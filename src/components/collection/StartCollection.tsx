"use client";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import type { Contact, PostalAddress } from "@/lib/collection/types";
const input =
  "mt-2 min-h-12 w-full rounded-md border border-warmgray-300 bg-white px-4 py-3 text-base text-ink";
const primary =
  "min-h-12 rounded-md bg-oxblood px-6 py-3 font-medium text-white disabled:opacity-50";
const secondary =
  "min-h-12 rounded-md border border-warmgray-300 px-5 py-3 text-ink";
const blank = { name: "", email: "", phone: "" };
export default function StartCollection({
  mode,
}: {
  mode: "share" | "request";
}) {
  const [step, setStep] = useState(0),
    [me, setMe] = useState<Contact>({ ...blank }),
    [other, setOther] = useState<Contact>({ ...blank }),
    [recipient, setRecipient] = useState<Contact>({ ...blank }),
    [recipientIsMe, setRecipientIsMe] = useState(true),
    [addressLater, setAddressLater] = useState(mode === "share"),
    [address, setAddress] = useState<PostalAddress>({
      name: "",
      line1: "",
      line2: "",
      city: "",
      region: "",
      postalCode: "",
      country: "US",
    }),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const receiver = mode === "share" ? other : recipientIsMe ? me : recipient;
  function fields(value: Contact, set: (v: Contact) => void) {
    return (
      <div className="space-y-5">
        <label className="block">
          Full name
          <input
            required
            autoComplete="name"
            className={input}
            value={value.name}
            onChange={(e) => set({ ...value, name: e.target.value })}
          />
        </label>
        <label className="block">
          Email address
          <input
            required
            type="email"
            autoComplete="email"
            className={input}
            value={value.email}
            onChange={(e) => set({ ...value, email: e.target.value })}
          />
        </label>
        <label className="block">
          Phone number <span className="text-sm text-ink-500">(optional)</span>
          <input
            type="tel"
            autoComplete="tel"
            className={input}
            value={value.phone || ""}
            onChange={(e) => set({ ...value, phone: e.target.value })}
          />
          <span className="mt-2 block text-sm text-ink-500">
            For delivery questions if needed. This does not sign you up for
            texts.
          </span>
        </label>
      </div>
    );
  }
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initiationPath: mode,
          storyteller: mode === "share" ? me : other,
          recipient: receiver,
          requester: me,
          address: addressLater
            ? undefined
            : { ...address, name: receiver.name },
          invitationNote: note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.assign(data.nextUrl);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to save. Please try again.",
      );
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Logo />
      <p className="mt-10 text-sm uppercase tracking-widest text-oxblood">
        {mode === "share" ? "Share my story" : "Request a story"} · Step{" "}
        {step + 1} of 4
      </p>
      <h1 className="my-4 font-serif text-3xl leading-tight sm:text-4xl">
        {
          [
            "Let’s begin with you.",
            mode === "share"
              ? "Who is this story for?"
              : "Whose story would you like to hear?",
            "Where should the postcards go?",
            "Check the details.",
          ][step]
        }
      </h1>
      <p className="mb-8 text-lg leading-relaxed text-ink-500">
        {
          [
            "One conversation becomes four written stories, a personal story page and four postcards.",
            mode === "share"
              ? "Choose someone you want to share your stories, faith and encouragement with."
              : "We will invite them to speak, type or record their story. They approve everything before sharing.",
            "The first postcard introduces all four stories. The next three bring a story back at months 3, 6 and 9.",
            "Original recordings stay saved. Stories are only shared and postcards scheduled after the storyteller approves them.",
          ][step]
        }
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (step < 3) setStep(step + 1);
          else void submit();
        }}
        className="space-y-7"
      >
        {step === 0 && fields(me, setMe)}
        {step === 1 && (
          <>
            {fields(other, setOther)}
            {mode === "request" && (
              <>
                <label className="flex min-h-12 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={recipientIsMe}
                    onChange={(e) => setRecipientIsMe(e.target.checked)}
                  />
                  Send the story and postcards to me
                </label>
                {!recipientIsMe && (
                  <section className="border-t border-warmgray-300 pt-6">
                    <h2 className="mb-5 font-serif text-xl">
                      The person receiving the gift
                    </h2>
                    {fields(recipient, setRecipient)}
                  </section>
                )}
                <label className="block">
                  A personal invitation{" "}
                  <span className="text-sm">(optional)</span>
                  <textarea
                    className={input}
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Why would you like to hear their story?"
                  />
                </label>
              </>
            )}
            <p className="text-sm text-ink-500">
              The interview focuses on Christian faith and lived values.
            </p>
          </>
        )}
        {step === 2 && (
          <>
            <label className="flex min-h-12 items-start gap-3">
              <input
                className="mt-1"
                type="checkbox"
                checked={addressLater}
                onChange={(e) => setAddressLater(e.target.checked)}
              />
              <span>
                Collect the address later
                <span className="mt-1 block text-sm text-ink-500">
                  The interview can begin now. We will need a confirmed address
                  before printing.{" "}
                  {mode === "share"
                    ? "You can request the address when reviewing your stories."
                    : "The storyteller can request the address when reviewing their stories."}
                </span>
              </span>
            </label>
            {!addressLater && (
              <>
                <p className="font-medium">Postcards for {receiver.name}</p>
                {(
                  [
                    ["line1", "Street address", "address-line1"],
                    ["line2", "Apartment or suite (optional)", "address-line2"],
                    ["city", "City", "address-level2"],
                    ["region", "State / province", "address-level1"],
                    ["postalCode", "Postal code", "postal-code"],
                  ] as const
                ).map(([field, label, auto]) => (
                  <label className="block" key={field}>
                    {label}
                    <input
                      required={field !== "line2"}
                      autoComplete={auto}
                      className={input}
                      value={address[field] || ""}
                      onChange={(e) =>
                        setAddress({ ...address, [field]: e.target.value })
                      }
                    />
                  </label>
                ))}
                <label className="block">
                  Country
                  <select
                    className={input}
                    value={address.country}
                    onChange={(e) =>
                      setAddress({ ...address, country: e.target.value })
                    }
                  >
                    <option value="US">United States</option>
                  </select>
                </label>
                <p className="text-sm text-ink-500">
                  This pilot supports US postcard delivery.
                </p>
              </>
            )}
          </>
        )}
        {step === 3 && (
          <>
            <dl className="space-y-4 rounded-lg border border-warmgray-300 bg-white p-6">
              <div>
                <dt className="text-sm text-ink-500">Storyteller</dt>
                <dd className="mt-1">
                  {mode === "share" ? me.name : other.name} ·{" "}
                  {mode === "share" ? me.email : other.email}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-ink-500">Gift recipient</dt>
                <dd className="mt-1">
                  {receiver.name} · {receiver.email}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-ink-500">Postcard delivery</dt>
                <dd className="mt-1">
                  {addressLater
                    ? "Address still to be collected"
                    : `${address.line1}, ${address.city}, ${address.region} ${address.postalCode}`}
                </dd>
              </div>
            </dl>
            <p className="text-sm leading-relaxed text-ink-500">
              Anyone with the private gift link can open it, so share it only
              with people you trust. The first postcard introduces the gift. A
              follow-up email is scheduled two weeks after confirmed mailing.
            </p>
            <label className="flex items-start gap-3">
              <input type="checkbox" required className="mt-1" />
              <span>
                I have permission to use these contact details for this gift.
              </span>
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="rounded-md bg-red-50 p-4 text-red-800">
            {error}
          </p>
        )}
        <div className="flex justify-between gap-4">
          {step > 0 ? (
            <button
              className={secondary}
              type="button"
              onClick={() => setStep(step - 1)}
              disabled={busy}
            >
              Back
            </button>
          ) : (
            <a href="/" className={secondary}>
              Back
            </a>
          )}
          <button className={primary} disabled={busy}>
            {busy
              ? "Saving..."
              : step < 3
                ? "Continue"
                : mode === "share"
                  ? "Start my interview"
                  : "Create invitation"}
          </button>
        </div>
      </form>
    </main>
  );
}
