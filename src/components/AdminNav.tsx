'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function AdminNav() {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');

  return (
    <nav className="border-b border-warmgray-200 bg-paper-50 px-6 py-3">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <Link href="/admin" className="font-serif text-lg text-oxblood">
          Time Tapestry Admin
        </Link>
        <div className="flex items-center gap-4 font-sans text-sm">
          <Link href="/admin" className="text-ink-500 hover:text-oxblood">
            Dashboard
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
