import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center px-6 py-12">
      <Card className="max-w-2xl text-center">
        <h1 className="mb-6 font-serif text-4xl leading-tight text-ink sm:text-5xl">
          Every life is a thread. We weave them together.
        </h1>
        <p className="mb-4 font-serif text-xl text-ink-500">
          Leave a legacy of faith, family, generosity, and the things that actually matter.
        </p>
        <p className="mb-10 font-sans text-sm text-ink-400">
          We start with generosity because it&apos;s at the heart of a life well-lived, but your story can go wherever you&apos;d like.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Link href="/request" className="w-full sm:w-auto">
            <Button className="w-full">Request a story</Button>
          </Link>
          <Link href="/share" className="w-full sm:w-auto">
            <Button variant="secondary" className="w-full">
              Share my story
            </Button>
          </Link>
        </div>
        <div className="mt-8 flex flex-col items-center gap-3">
          <Link href="/demo" className="w-full sm:w-auto">
            <Button variant="secondary" className="w-full border-dashed">
              See a sample story
            </Button>
          </Link>
          <Link href="/postcards-demo" className="font-sans text-sm text-oxblood hover:underline">
            See what arrives in the mail
          </Link>
          <Link href="/org" className="font-sans text-sm text-oxblood hover:underline">
            For nonprofits
          </Link>
        </div>
        <p className="mt-6 font-sans text-sm text-ink-400">
          For a grandparent, great-aunt, mentor, family friend, or any older person whose story you want to keep.
        </p>
      </Card>

      <Card className="mb-8 mt-12 max-w-2xl text-center">
        <h2 className="mb-4 font-serif text-2xl text-ink">What is Time Tapestry?</h2>
        <p className="font-serif text-xl leading-relaxed text-ink-500">
          Time Tapestry is a guided interview that helps an older person share their story of generosity and values. The AI listens, asks warm follow-up questions, and weaves their answers into a keepsake for the next generation — a web page they can keep forever, and postcards they can hold in their hands.
        </p>
      </Card>

      <Card className="max-w-2xl text-center">
        <h2 className="mb-4 font-serif text-2xl text-ink">Why it matters</h2>
        <div className="space-y-4 font-serif text-xl leading-relaxed text-ink-500">
          <p>Generosity is a story before it is a gift.</p>
          <p>
            When children hear their grandparent&apos;s story of giving, they&apos;re 20% more likely to give themselves. (Women Give 2013)
          </p>
          <p>Most legacy products end up on a shelf. Time Tapestry hands it forward.</p>
        </div>
      </Card>
    </main>
  );
}
