"use client";

import Link from "next/link";
import { Logo } from "./Logo";
import { usePathname } from "next/navigation";

export function AdminNav() {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");

  return (
    <nav className="border-b border-warmgray-200 bg-paper-50 px-6 py-3">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <Logo href="/admin/collections" />
          <span className="rounded-full bg-paper-200 px-3 py-1 text-xs font-medium text-ink-500">
            Admin
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-sans text-sm">
          <Link
            href="/admin/collections"
            className="min-h-12 inline-flex items-center font-medium text-ink"
          >
            Stories & recordings
          </Link>
          <Link href="/admin" className="text-ink-500 hover:text-oxblood">
            Earlier prototype
          </Link>
          <Link href="/" className="text-warmgray-500 hover:text-oxblood">
            Back to site
          </Link>
          {isAdmin && (
            <Link
              href="/api/admin/logout"
              className="text-warmgray-500 hover:text-oxblood"
            >
              Sign out
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
