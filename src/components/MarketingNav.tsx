import Link from 'next/link';
import { Logo } from './Logo';
import { Button } from './ui/Button';

const links = [
  { href: '/about', label: 'About' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/org', label: 'For Nonprofits' },
  { href: '/contact', label: 'Contact' }
];

export function MarketingNav() {
  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-warmgray-300 bg-paper-50/95 shadow-sm backdrop-blur-sm">
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <Logo />
        <ul className="hidden items-center gap-6 font-sans text-sm text-ink-500 md:flex">
          {links.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="hover:text-oxblood hover:underline">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-4">
          <Link href="/request" className="hidden sm:inline-flex">
            <Button>Get started</Button>
          </Link>
          <Link href="/request" className="sm:hidden">
            <Button>Start</Button>
          </Link>
        </div>
      </nav>
    </header>
  );
}
