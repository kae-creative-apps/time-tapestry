import { StoryDisplay } from '@/components/StoryDisplay';
import { Logo } from '@/components/Logo';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getSession } from '@/lib/session';
import { demoStory } from '@/lib/mock-data';
import Link from 'next/link';

export default async function KeepsakePage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession(id);
  const story = session?.story ?? {
    welcomeNote: demoStory.welcomeNote,
    chapters: demoStory.chapters,
    causes: demoStory.causes,
    values: demoStory.values,
    keyQuotes: demoStory.keyQuotes
  };
  const grandparentName = session?.grandparent.name ?? demoStory.grandparent.name;
  const grandchildName = session?.grandchild.name ?? demoStory.grandchild.name;

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <Logo className="mb-8" />
        <Card className="mb-8 text-center">
          <h1 className="mb-4 font-serif text-3xl text-ink sm:text-4xl">
            A story from {grandparentName}
          </h1>
          <p className="mb-3 font-serif text-xl text-ink-500">
            Kept for {grandchildName}, to read and return to.
          </p>
          <p className="mb-6 text-sm text-ink-400">
            This can be a grandparent, great-aunt, mentor, family friend, or any person whose story you want to keep.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Link href={`/act/${id}`} className="w-full sm:w-auto">
              <Button className="w-full">Choose a next step</Button>
            </Link>
            <Link href={`/postcards/${id}`} className="w-full sm:w-auto">
              <Button variant="secondary" className="w-full">
                See the postcards
              </Button>
            </Link>
          </div>
        </Card>

        <StoryDisplay
          welcome={story.welcomeNote}
          chapters={story.chapters}
          causes={story.causes}
          values={story.values}
          grandparentName={grandparentName}
          grandchildName={grandchildName}
          quotes={story.keyQuotes}
        />

        <footer className="mt-12 border-t border-warmgray-300 py-6 text-center">
          <p className="font-sans text-sm text-warmgray-500">
            We don&apos;t sell data. Your family&apos;s stories belong to your family.
          </p>
        </footer>
      </main>
      <Footer />
    </div>
  );
}
