'use client';

import { motion } from 'framer-motion';
import { Logo } from './Logo';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mt-auto border-t border-warmgray-200 py-10 text-center">
      <div className="mb-4 inline-flex">
        <Logo variant="mark" className="text-warmgray-500" />
      </div>
      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="mb-2 font-sans text-xs uppercase tracking-[0.16em] text-warmgray-500"
      >
        Stories woven together
      </motion.p>
      <motion.nav
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-sans text-sm text-oxblood"
      >
        <Link href="/about" className="transition-colors hover:text-oxblood-700">
          About
        </Link>
        <Link href="/pricing" className="transition-colors hover:text-oxblood-700">
          Pricing
        </Link>
        <Link href="/privacy" className="transition-colors hover:text-oxblood-700">
          Privacy
        </Link>
        <Link href="/admin" className="transition-colors hover:text-oxblood-700">
          Admin
        </Link>
      </motion.nav>
      <p className="mt-5 font-sans text-[11px] tracking-wide text-warmgray-400">
        &copy; 2026 time tapestry
      </p>
    </footer>
  );
}
