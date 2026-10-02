'use client';

import { Logo } from '@/components/Logo';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import Link from 'next/link';

export default function DemoPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <Logo className="mb-8" />

        <Card className="mb-8 text-center">
          <h1 className="mb-4 font-serif text-3xl text-ink">
            Judges: start the demo here
          </h1>
          <p className="mb-6 text-ink-500">
            Time Tapestry weaves an older person&apos;s generosity story into a legacy for the next generation. Below are the key pages.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
            <Link href="/keepsake/demo-gigi" className="w-full sm:w-auto">
              <Button className="w-full">See Gigi&apos;s story</Button>
            </Link>
            <Link href="/share" className="w-full sm:w-auto">
              <Button variant="secondary" className="w-full">
                Start a live interview
              </Button>
            </Link>
            <Link href="/postcards-demo" className="w-full sm:w-auto">
              <Button variant="secondary" className="w-full">
                See the postcards
              </Button>
            </Link>
            <Link href="/org" className="w-full sm:w-auto">
              <Button variant="secondary" className="w-full">
                See the org view
              </Button>
            </Link>
          </div>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href="/family/demo-family" className="font-sans text-sm text-oxblood hover:underline">
              Family tapestry
            </Link>
            <span className="hidden text-warmgray-400 sm:inline">·</span>
            <Link href="/privacy" className="font-sans text-sm text-oxblood hover:underline">
              Privacy promise
            </Link>
          </div>
        </Card>

        <Card className="mb-8">
          <h2 className="mb-4 font-serif text-2xl text-ink">How to demo in 90 seconds</h2>
          <ol className="space-y-4 text-ink-500">
            <li className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-oxblood font-serif text-sm text-paper">1</span>
              <span>Open the landing page and point to the two paths: request a story, or share my own.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-oxblood font-serif text-sm text-paper">2</span>
              <span>Go to /share and start a session as Eleanor. Show the AI interviewer greeting her and asking warm follow-ups.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-oxblood font-serif text-sm text-paper">3</span>
              <span>Skip to Gigi&apos;s keepsake to show the four chapters, values, and causes.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-oxblood font-serif text-sm text-paper">4</span>
              <span>Show /postcards-demo and /family/demo-family to explain the physical and shared-tapestry concept.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-oxblood font-serif text-sm text-paper">5</span>
              <span>End on /org: nonprofits sponsor these, see aggregate engagement, never personal stories.</span>
            </li>
          </ol>
        </Card>

        <Card className="mb-8 text-center">
          <h2 className="mb-3 font-serif text-xl text-ink">Reset demo</h2>
          <p className="mb-5 text-sm text-ink-400">
            Clear the browser demo state and start fresh.
          </p>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => {
              if (typeof window !== 'undefined') {
                localStorage.clear();
                window.location.href = '/';
              }
            }}
          >
            Reset demo session
          </Button>
        </Card>
      </main>
      <Footer />
    </div>
  );
}

