import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <Card className="max-w-2xl text-center">
        <h1 className="mb-6 font-serif text-4xl leading-tight text-ink sm:text-5xl">
          Every life is a thread. We weave them together.
        </h1>
        <p className="mb-10 font-sans text-lg text-ink-500">
          Time Tapestry captures an older person&apos;s story — their faith, their family, the values they lived by — and weaves it into a legacy for the next generation.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Link href="/share" className="w-full sm:w-auto">
            <Button className="w-full text-lg">Try the live interview &rarr;</Button>
          </Link>
          <Link href="/request" className="w-full sm:w-auto">
            <Button variant="secondary" className="w-full text-lg">
              Request a story
            </Button>
          </Link>
        </div>
        <p className="mt-8 font-serif text-base text-ink-500">
          Stories of faith. Stories of family. Stories of generosity. Stories of hard lessons. Stories of love.
        </p>
        <p className="mt-10 font-sans text-sm text-warmgray-500">
          Coming soon: Help your donors preserve and pass on their legacy of faith, family, and generosity.
        </p>
      </Card>
    </main>
  );
}
