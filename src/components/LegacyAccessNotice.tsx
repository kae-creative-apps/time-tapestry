import Link from "next/link";
import { Logo } from "./Logo";
export default function LegacyAccessNotice() {
  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <Logo />
      <h1 className="mb-5 mt-12 font-serif text-3xl">
        This is an earlier prototype link.
      </h1>
      <p className="mb-5 text-lg leading-relaxed">
        The original records are preserved for the team. They now require admin
        access. Use your private collection link to continue with the current
        experience.
      </p>
      <div className="flex flex-wrap gap-4">
        <Link
          href="/share"
          className="rounded-md bg-oxblood px-5 py-3 text-white"
        >
          Start a new story
        </Link>
        <Link
          href="/admin/login"
          className="rounded-md border border-warmgray-300 px-5 py-3"
        >
          Team access
        </Link>
      </div>
    </main>
  );
}
