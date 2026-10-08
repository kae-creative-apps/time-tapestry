import { Logo } from "./Logo";
import { BrandPattern } from "./BrandPattern";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="brand-gradient-chocolate relative isolate mt-auto overflow-hidden px-6 py-12 text-white sm:px-10 sm:py-16">
      <BrandPattern
        variant="ribbon"
        className="absolute -right-12 -top-12 -z-10 h-full min-h-[320px] w-auto text-white opacity-[.06]"
      />
      <div className="mx-auto flex max-w-[1250px] flex-col justify-between gap-10 sm:flex-row sm:items-end">
        <div>
          <Logo variant="light" />
          <p className="mt-5 text-base text-paper">
            A donor’s generosity, passed on.
          </p>
        </div>
        <div>
          <nav
            aria-label="Footer"
            className="flex flex-wrap items-center gap-6 text-sm"
          >
            <Link
              href="/for-organizations"
              className="inline-flex items-center hover:underline"
            >
              For organizations
            </Link>
            <Link
              href="/about"
              className="inline-flex items-center hover:underline"
            >
              About
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center hover:underline"
            >
              Pricing
            </Link>
            <Link
              href="/privacy"
              className="inline-flex items-center hover:underline"
            >
              Privacy
            </Link>
          </nav>
          <p className="mt-5 text-xs text-paper sm:text-right">
            &copy; 2026 time tapestry
          </p>
        </div>
      </div>
    </footer>
  );
}
