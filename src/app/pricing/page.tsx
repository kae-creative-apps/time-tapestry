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
        The pilot brings four written stories, optional videos, four
        postcards and a way to reply together in one gift.
      </p>
      <p className="mb-6 leading-relaxed text-ink-500">
        Pilot pricing and delivery costs are still being confirmed. You cannot
        purchase a gift in this pilot yet. Churches and organizations may eventually
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
