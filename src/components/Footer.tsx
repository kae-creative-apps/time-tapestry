import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-warmgray-300 py-10 text-center">
      <p className="font-serif text-lg text-ink">Time Tapestry</p>
      <p className="mb-4 font-sans text-sm text-warmgray-500">
        Weaving the stories that matter.
      </p>
      <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-sans text-sm text-oxblood">
        <Link href="/about" className="hover:underline">
          About
        </Link>
        <Link href="/pricing" className="hover:underline">
          Pricing
        </Link>
        <Link href="/privacy" className="hover:underline">
          Privacy
        </Link>
      </nav>
      <p className="mt-4 font-sans text-xs text-warmgray-400">
        &copy; 2026 Time Tapestry
      </p>
    </footer>
  );
}
