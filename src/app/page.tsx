import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-20">
      <div className="mb-10">
        <Logo variant="mark" className="text-oxblood" />
      </div>

      <Card className="max-w-xl text-center">
        <h1 className="mb-5 font-serif text-3xl leading-[1.15] text-ink sm:text-4xl">
          Preserve the story. Pass it down.
        </h1>
        <p className="mb-10 mx-auto max-w-md font-sans text-base leading-relaxed text-ink-500">
          A quiet interview that turns a life of faith, family, and generosity into a keepsake.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/share" className="w-full sm:w-auto">
            <Button className="w-full">Try the live interview &rarr;</Button>
          </Link>
          <Link href="/request" className="w-full sm:w-auto">
            <Button variant="secondary" className="w-full">
              Request a story
            </Button>
          </Link>
        </div>

        <p className="mt-9 font-serif text-base italic text-ink-400">
          Faith, family, generosity, hard lessons, love.
        </p>
      </Card>

      <p className="mt-7 font-sans text-xs uppercase tracking-[0.18em] text-warmgray-500">
        Coming soon for organizations
      </p>
    </main>
  );
}
