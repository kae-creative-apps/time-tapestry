"use client";
import { Logo } from "@/components/Logo";
import { BrandPattern } from "@/components/BrandPattern";
import { useCollection } from "./useCollection";
import AddressForm from "./AddressForm";
import { portalSecondary } from "./PortalUI";
export default function AddressPage({
  id,
  accessKey,
}: {
  id: string;
  accessKey: string;
}) {
  const {
    collection: c,
    error,
    busy,
    act,
    load,
  } = useCollection(id, accessKey);
  const automaticPostcards = Boolean(c?.autoPostcards || c?.deliveries.length);
  const mailingStarted = Boolean(
    c?.deliveries.some((delivery) => delivery.providerId),
  );
  const digitalRecipient = c?.role === "recipient" && !c.isPrimaryRecipient;
  return (
    <main className="brand-page-shell mx-auto max-w-4xl px-5 py-6 sm:px-8 sm:py-8">
      <Logo className="[&_svg]:h-11" />
      <header className="brand-gradient-sage relative mt-8 overflow-hidden rounded-2xl p-7 sm:p-10">
        <BrandPattern
          variant="ribbon"
          className="pointer-events-none absolute -right-12 -top-12 h-80 w-80 text-espresso opacity-[0.08]"
        />
        <div className="relative max-w-xl rounded-2xl bg-paper p-5 sm:p-6">
          <h1 className="mb-4 font-serif text-3xl text-espresso sm:text-4xl">
            {digitalRecipient
              ? "Your shared stories."
              : "A place for your postcards."}
          </h1>
          <p className="text-lg leading-relaxed text-espresso">
            {digitalRecipient
              ? `You can read ${c.storyteller.name}’s stories and send a private reply.`
              : `${c?.storyteller.name || "Someone you know"} is making a gift for you. Confirm where you would like the postcards sent.`}
          </p>
        </div>
      </header>
      <div className="mx-auto mt-6 max-w-2xl rounded-2xl border border-warmgray-200 bg-white p-6 shadow-soft sm:p-9">
        {error && (
          <p role="alert" className="mb-5 text-red-800">
            {error}
          </p>
        )}
        {!c &&
          (!error ? (
            <p role="status" className="text-lg leading-8">
              Opening the saved address…
            </p>
          ) : (
            <button
              type="button"
              className={portalSecondary}
              onClick={() => void load()}
            >
              Try opening again
            </button>
          ))}
        {digitalRecipient ? (
          <div>
            <p className="text-lg leading-8">
              The mailing address belongs to the person receiving the postcards.
              Your invitation gives you access to the stories and replies.
            </p>
            <a
              href={`/collection/${encodeURIComponent(id)}`}
              className={`${portalSecondary} mt-6`}
            >
              Open my stories
            </a>
          </div>
        ) : c?.addressConfirmed ? (
          <div className="rounded-lg border border-sage-200 bg-sage-50 p-6">
            <h2 className="font-serif text-xl">Your address is saved.</h2>
            <p className="mt-3">
              {mailingStarted
                ? "Address changes after printing begins pause future postcards until the Time Tapestry team reviews them. A postcard already sent for printing may still go to the previous address."
                : automaticPostcards
                  ? "Check and confirm the address below before mailing. Postcards also need the storyteller’s approval of the printed cards."
                  : "You can update this address here. Postcards will only be prepared if the storyteller chooses postcard delivery."}
            </p>
            <details open className="mt-6">
              <summary className="min-h-12 cursor-pointer text-base font-medium">
                Check or update my address
              </summary>
              <AddressForm
                collectionId={id}
                accessKey={accessKey}
                initial={c.address}
                busy={busy}
                automaticPostcards={automaticPostcards}
                mailingStarted={mailingStarted}
                onSave={(address, verificationId) =>
                  act({ action: "address", address, verificationId })
                }
              />
            </details>
          </div>
        ) : (
          c && (
            <AddressForm
              collectionId={id}
              accessKey={accessKey}
              initial={c.address}
              busy={busy}
              automaticPostcards={automaticPostcards}
              mailingStarted={mailingStarted}
              onSave={(address, verificationId) =>
                act({ action: "address", address, verificationId })
              }
            />
          )
        )}
        {c?.role === "recipient" &&
          c.isPrimaryRecipient &&
          c.addressConfirmed && (
            <a
              href={`/collection/${encodeURIComponent(id)}`}
              className={`${portalSecondary} mt-6`}
            >
              Open my stories
            </a>
          )}
      </div>
    </main>
  );
}
