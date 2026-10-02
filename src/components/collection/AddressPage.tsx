"use client";
import { Logo } from "@/components/Logo";
import { useCollection } from "./useCollection";
import AddressForm from "./AddressForm";
export default function AddressPage({
  id,
  accessKey,
}: {
  id: string;
  accessKey: string;
}) {
  const { collection: c, error, busy, act } = useCollection(id, accessKey);
  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <Logo />
      <h1 className="mb-4 mt-10 font-serif text-3xl">
        A place for your postcards.
      </h1>
      <p className="mb-8 text-lg text-ink-500">
        {c?.storyteller.name || "Someone you know"} is making a gift for you.
        Confirm where you would like the postcards sent.
      </p>
      {error && (
        <p role="alert" className="mb-5 text-red-800">
          {error}
        </p>
      )}
      {c?.addressConfirmed ? (
        <div className="rounded-lg border border-warmgray-300 p-6">
          <h2 className="font-serif text-xl">Your address is saved.</h2>
          <p className="mt-3">
            The first postcard will introduce your story collection after it is
            approved.
          </p>
          <details className="mt-6">
            <summary>Update my address</summary>
            <AddressForm
              initial={c.address}
              busy={busy}
              onSave={(address) => act({ action: "address", address })}
            />
          </details>
        </div>
      ) : (
        c && (
          <AddressForm
            initial={c.address}
            busy={busy}
            onSave={(address) => act({ action: "address", address })}
          />
        )
      )}
    </main>
  );
}
