import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import Link from "next/link";

const title = "Invite your donors | Time Tapestry";
const description =
  "Ministries, nonprofits, foundations, and advancement teams can invite major donors to pass the story of their generosity to their children and grandchildren. No payment details are needed.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    url: "https://timetapestry.app/pricing",
  },
};

export default function Pricing() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Logo />
      <h1 className="mb-6 mt-12 font-serif text-4xl">
        Invite the donors you serve.
      </h1>
      <p className="mb-6 text-lg leading-relaxed">
        Time Tapestry helps a major donor record why they give, what it has
        meant, and what they hope their children and grandchildren carry.
        Ministries, nonprofits, foundations, advancement teams, and donor
        advisors can offer it. No card or payment details are needed.
      </p>
      <p className="mb-6 leading-relaxed text-ink-500">
        Donors are never asked about gift size. They review their collection
        before anyone in their family can open it. Physical postcards and
        automatic email delivery are still being tested and are not promised
        yet.
      </p>
      <Link
        href="/for-organizations#invite-donors"
        className="inline-flex min-h-12 items-center rounded-md bg-oxblood px-6 py-3 text-white"
      >
        Invite your donors
      </Link>
    </main>
  );
}
