import { Logo } from "@/components/Logo";
import Link from "next/link";
export default function Pricing() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Logo />
      <h1 className="mb-6 mt-12 font-serif text-4xl">
        Start with one person’s story.
      </h1>
      <p className="mb-6 text-lg leading-relaxed">
        The pilot brings four written chapters, optional legacy videos, four
        postcards and a way to reply together in one collection.
      </p>
      <p className="mb-6 leading-relaxed text-ink-500">
        Pilot pricing and paid fulfillment are still being confirmed. This build
        does not collect payment. Churches and organizations may eventually
        sponsor gifts for families; organization purchasing is not available
        yet.
      </p>
      <Link
        href="/share"
        className="inline-flex min-h-12 items-center rounded-md bg-oxblood px-6 py-3 text-white"
      >
        Explore the pilot
      </Link>
    </main>
  );
}
