import Link from 'next/link';

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-4 ${className || ''}`}>
      <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-oxblood bg-paper shadow-sm">
        <span className="font-serif text-2xl font-medium text-oxblood">TT</span>
      </div>
      <div>
        <p className="font-serif text-2xl font-medium leading-tight text-ink">
          Time Tapestry
        </p>
        <p className="font-sans text-sm text-ink-400">
          Weaving the stories that matter.
        </p>
      </div>
    </Link>
  );
}
