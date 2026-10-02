import { StoryDisplay } from '@/components/StoryDisplay';
import { Logo } from '@/components/Logo';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getSession } from '@/lib/session';
import { demoStory } from '@/lib/mock-data';
import Link from 'next/link';

export default async function ReviewPage({
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
    keyQuotes: demoStory.keyQuotes
  };

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <Logo className="mb-8" />
        <Card className="mb-8 text-center">
          <h1 className="mb-4 font-serif text-3xl text-ink">Review your story</h1>
          <p className="mb-6 text-ink-500">
            Read it over. When you are ready, approve it to be handed down.
          </p>
          <form action={`/api/story/generate`} method="POST">
            <input type="hidden" name="sessionId" value={id} />
            <Button type="submit" className="w-full sm:w-auto">
              Approve and share
            </Button>
          </form>
        </Card>
        <StoryDisplay
          welcome={story.welcomeNote}
          chapters={story.chapters}
          causes={story.causes}
          grandparentName={session?.grandparent.name ?? demoStory.grandparent.name}
          grandchildName={session?.grandchild.name ?? demoStory.grandchild.name}
          quotes={story.keyQuotes}
        />
      </main>
      <Footer />
    </div>
  );
}
