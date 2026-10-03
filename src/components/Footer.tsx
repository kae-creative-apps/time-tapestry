"use client";

import { motion } from "framer-motion";
import { Logo } from "./Logo";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-warmgray-200 bg-paper-50 px-6 py-12 text-center">
      <div className="mb-4 inline-flex">
        <Logo />
      </div>
      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="mb-5 font-sans text-sm text-ink-500"
      >
        What you gave lives on.
      </motion.p>
      <motion.nav
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-sans text-sm text-oxblood"
      >
        <Link
          href="/about"
          className="transition-colors hover:text-oxblood-700"
        >
          About
        </Link>
        <Link
          href="/pricing"
          className="transition-colors hover:text-oxblood-700"
        >
          Pilot
        </Link>
        <Link
          href="/privacy"
          className="transition-colors hover:text-oxblood-700"
        >
          Privacy
        </Link>
      </motion.nav>
      <p className="mt-5 font-sans text-[11px] tracking-wide text-ink-500">
        &copy; 2026 time tapestry
      </p>
    </footer>
  );
}
