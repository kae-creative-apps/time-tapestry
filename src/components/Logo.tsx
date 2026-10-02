// The folded thread mark - geometric, angular
// Inline SVG marks the visual anchor for Time Tapestry.

import Link from 'next/link';

export function Logo({
  variant = 'full',
  className = '',
  href = '/'
}: {
  variant?: 'mark' | 'full' | 'light';
  className?: string;
  href?: string;
}) {
  // deliberate: mark is inline SVG so it is resolution-independent without a separate asset.
  const Mark = ({ className: markClass = 'w-8 h-8' }: { className?: string }) => (
    <svg
      viewBox="0 0 40 40"
      className={markClass}
      fill="currentColor"
      aria-hidden="true"
    >
      {/* Folded-thread weave: two angular paths that interlock like folded rope */}
      <path d="M6 6 h12 v8 h-8 v8 h8 v8 h-4 v-8 h-8 v-16 z" />
      <path d="M22 6 h12 v12 h-12 v-4 h8 v-4 h-8 z" opacity="0.92" />
      <path d="M6 26 h12 v8 h-8 v-4 h8 v-4 h-12 z" opacity="0.85" />
      <path d="M22 22 h12 v12 h-12 v-4 h8 v-4 h-8 z" opacity="0.78" />
    </svg>
  );

  if (variant === 'mark') {
    return (
      <Link href={href} className={`inline-block ${className}`}>
        <Mark />
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
          <div className="font-serif text-base tracking-tight">Time Tapestry</div>
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
      <Mark />
      <div>
        <div className="font-serif text-lg tracking-tight text-ink sm:text-xl">
          Time Tapestry
        </div>
        <div className="font-sans text-[10px] uppercase leading-none tracking-[0.22em] text-warmgray-500">
          Stories woven together
        </div>
      </div>
    </Link>
  );
}
