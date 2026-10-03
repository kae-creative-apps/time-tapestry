import { legacyPageAllowed } from "@/lib/legacy-access";
import LegacyAccessNotice from "@/components/LegacyAccessNotice";
import { StoryDisplay } from "@/components/StoryDisplay";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getSession } from "@/lib/session";
import Link from "next/link";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await legacyPageAllowed())) return <LegacyAccessNotice />;
  const { id } = await params;
  const session = await getSession(id);

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col">
        <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
          <Logo className="mb-8" />
          <Card className="text-center">
            <h1 className="mb-4 font-serif text-3xl text-ink">
              Session not found
            </h1>
            <p className="text-ink-500">
              We couldn&apos;t find this session. Please check your link.
            </p>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  const story = session.story;
  const hasStory = story && story.chapters.length > 0;

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <Logo className="mb-8" />
        <Card className="mb-8 text-center">
          <h1 className="mb-3 font-serif text-2xl text-ink">
            Review your story
          </h1>
          <p className="mb-6 leading-relaxed text-ink-500">
            Read it over. When you are ready, approve it to be handed down.
          </p>
          <form action={`/api/story/generate`} method="POST">
            <input type="hidden" name="sessionId" value={id} />
            <Button type="submit" className="w-full sm:w-auto">
              Approve and share
            </Button>
          </form>
        </Card>
        {hasStory ? (
          <StoryDisplay
            welcome={story.welcomeNote}
            chapters={story.chapters}
            causes={story.causes}
            grandparentName={session.grandparent.name}
            grandchildName={session.grandchild.name}
            quotes={story.keyQuotes}
            videoUrl={session.videoUrl}
          />
        ) : (
          <Card className="text-center">
            <p className="text-ink-500">
              Your story hasn&apos;t been generated yet. Finish the interview
              and come back here to review it.
            </p>
          </Card>
        )}
      </main>
      <Footer />
    </div>
  );
}
