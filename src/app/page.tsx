import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/Button';
import { FadeIn } from '@/components/ui/FadeIn';
import { Stagger, StaggerItem } from '@/components/ui/Stagger';
import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-20">
      <Stagger className="flex max-w-2xl flex-col items-center text-center" stagger={0.12}>
        <StaggerItem>
          <div className="mb-10 text-oxblood">
            <Logo variant="dark" className="shadow-lift" />
          </div>
        </StaggerItem>

        <StaggerItem>
          <h1 className="mb-6 font-serif text-3xl leading-[1.1] tracking-tight text-ink sm:text-4xl">
            Preserve the story. Pass it down.
          </h1>
        </StaggerItem>

        <StaggerItem>
          <p className="mb-12 max-w-md font-sans text-base leading-relaxed text-ink-500">
            A quiet interview that turns a life of faith, family, and generosity into a keepsake.
          </p>
        </StaggerItem>

        <StaggerItem>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:justify-center">
            <Link href="/share" className="w-full sm:w-auto">
              <Button className="w-full">Try the live interview &rarr;</Button>
            </Link>
            <Link href="/request" className="w-full sm:w-auto">
              <Button variant="secondary" className="w-full">
                Request a story
              </Button>
            </Link>
          </div>
        </StaggerItem>

        <StaggerItem>
          <p className="mt-10 font-serif text-base italic text-ink-400">
            Faith, family, generosity, hard lessons, love.
          </p>
        </StaggerItem>

        <StaggerItem>
          <p className="mt-10 font-sans text-xs uppercase tracking-[0.18em] text-warmgray-500">
            Coming soon for organizations
          </p>
        </StaggerItem>
      </Stagger>
    </main>
  );
}
