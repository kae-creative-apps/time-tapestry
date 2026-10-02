'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

export function Logo({
  variant = 'full',
  className = '',
  href = '/'
}: {
  variant?: 'mark' | 'full' | 'light' | 'dark';
  className?: string;
  href?: string;
}) {
  // deliberate: mark is inline SVG so it is resolution-independent without a separate asset.
  const Mark = ({ className: markClass = 'w-8 h-8', color = 'currentColor' }: { className?: string; color?: string }) => (
    <svg
      viewBox="0 0 48 48"
      className={markClass}
      fill={color}
      aria-hidden="true"
    >
      {/* Folded-thread weave: two angular paths that cross at right angles, interlocking like folded rope */}
      <path d="M8 8 h14 v6 h-10 v10 h10 v6 h-14 z" />
      <path d="M26 8 h14 v14 h-6 v-8 h-8 z" />
      <path d="M8 26 h14 v14 h-14 z" opacity="0.9" />
      <path d="M26 26 h6 v6 h8 v6 h-14 z" opacity="0.82" />
    </svg>
  );

  if (variant === 'mark') {
    return (
      <Link href={href} className={`inline-block text-oxblood ${className}`}>
        <Mark />
      </Link>
    );
  }

  if (variant === 'dark') {
    return (
      <Link
        href={href}
        className={`inline-flex items-center gap-3 rounded-2xl bg-oxblood p-5 text-paper ${className}`}
      >
        <Mark className="h-10 w-10" color="#faf6ef" />
        <div>
          <div className="font-serif text-xl lowercase tracking-tight">time tapestry</div>
          <div className="font-sans text-[10px] uppercase leading-none tracking-[0.22em] opacity-75">
            Stories woven together
          </div>
        </div>
      </Link>
    );
  }

  if (variant === 'light') {
    return (
      <Link
        href={href}
        className={`inline-flex items-center gap-3 text-paper ${className}`}
      >
        <Mark className="h-6 w-6" />
        <div>
          <div className="font-serif text-base tracking-tight">time tapestry</div>
          <div className="font-sans text-[10px] uppercase leading-none tracking-[0.22em] opacity-80">
            Stories woven together
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-3 text-ink ${className}`}
    >
      <motion.div
        initial={{ rotate: -2, opacity: 0 }}
        animate={{ rotate: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <Mark />
      </motion.div>
      <div>
        <div className="font-serif text-lg lowercase tracking-tight text-ink sm:text-xl">
          time tapestry
        </div>
        <div className="font-sans text-[10px] uppercase leading-none tracking-[0.22em] text-warmgray-500">
          Stories woven together
        </div>
      </div>
    </Link>
  );
}
