import { Logo } from "@/components/Logo";
import Link from "next/link";
export default function Pricing() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Logo />
      <h1 className="mb-6 mt-12 font-serif text-4xl">
        Your story is a gift. Start for free.
      </h1>
      <p className="mb-6 text-lg leading-relaxed">
        Capture your stories, save your recordings and gather them on a personal
        page for the people you choose. This pilot is free, including group gifts
        for churches and nonprofits. No card or payment details are needed.
      </p>
      <p className="mb-6 leading-relaxed text-ink-500">
        We collect contact details so each story can reach the right people.
        Storytellers review their collection before sharing. Physical postcards
        and automatic email delivery are still being tested and are not promised
        as part of the free pilot.
      </p>
      <Link
        href="/share"
        className="inline-flex min-h-12 items-center rounded-md bg-oxblood px-6 py-3 text-white"
      >
        Share my story for free
      </Link>
      <Link href="/for-organizations" className="mt-6 block text-oxblood underline underline-offset-4">
        Create gifts for your church or organization
      </Link>
    </main>
  );
}
