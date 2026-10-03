"use client";
import { Logo } from "@/components/Logo";
import { BrandPattern } from "@/components/BrandPattern";
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
    <main className="brand-page-shell mx-auto max-w-4xl px-5 py-6 sm:px-8 sm:py-8">
      <Logo className="[&_svg]:h-11" />
      <header className="brand-gradient-sage relative mt-8 overflow-hidden rounded-2xl p-7 sm:p-10">
        <BrandPattern
          variant="ribbon"
          className="pointer-events-none absolute -right-12 -top-12 h-80 w-80 text-espresso opacity-[0.08]"
        />
        <div className="relative max-w-xl">
          <h1 className="mb-4 font-serif text-3xl text-espresso sm:text-4xl">
            A place for your postcards.
          </h1>
          <p className="text-lg leading-relaxed text-espresso">
            {c?.storyteller.name || "Someone you know"} is making a gift for
            you. Confirm where you would like the postcards sent.
          </p>
        </div>
      </header>
      <div className="mx-auto mt-6 max-w-2xl rounded-2xl border border-warmgray-200 bg-white p-6 shadow-soft sm:p-9">
        {error && (
          <p role="alert" className="mb-5 text-red-800">
            {error}
          </p>
        )}
        {c?.addressConfirmed ? (
          <div className="rounded-lg border border-sage-200 bg-sage-50 p-6">
            <h2 className="font-serif text-xl">Your address is saved.</h2>
            <p className="mt-3">
              The first postcard will introduce your gift after it is approved.
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
      </div>
    </main>
  );
}
