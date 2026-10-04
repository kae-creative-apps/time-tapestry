import { legacyPageAllowed } from "@/lib/legacy-access";
import LegacyAccessNotice from "@/components/LegacyAccessNotice";
import { StoryDisplay } from "@/components/StoryDisplay";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getSession } from "@/lib/session";
import Link from "next/link";

export default async function KeepsakePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await legacyPageAllowed())) return <LegacyAccessNotice />;
  const { id } = await params;
  const session = await getSession(id);
  const story = session?.story;
  const grandparentName = session?.grandparent.name ?? "A beloved storyteller";
  const grandchildName = session?.grandchild.name ?? "you";

  if (!session || !story || story.chapters.length === 0) {
    return (
      <div className="flex min-h-screen flex-col">
        <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
          <Logo className="mb-8" />
          <Card className="text-center">
            <h1 className="mb-4 font-serif text-3xl text-ink">
              Story not found
            </h1>
            <p className="text-ink-500">
              We couldn&apos;t find a finished story for this link. Please
              finish the interview and approve your story first.
            </p>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <Logo className="mb-8" />
        <Card className="mb-8 text-center">
          <p className="mb-3 font-sans text-xs uppercase tracking-[0.14em] text-oxblood-400">
            A story from {grandparentName}
          </p>
          <h1 className="mb-4 font-serif text-2xl leading-snug text-ink sm:text-3xl">
            Kept for {grandchildName}, to read and return to.
          </h1>
          <p className="mb-8 text-base leading-relaxed text-ink-500">
            This can be a grandparent, great-aunt, mentor, family friend, or any
            person whose story you want to keep.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
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
          videoUrl={session.videoUrl}
        />

        <footer className="mt-12 border-t border-warmgray-300 py-6 text-center">
          <p className="font-sans text-sm text-warmgray-500">
            We don&apos;t sell data. Your family&apos;s stories belong to your
            family.
          </p>
        </footer>
      </main>
      <Footer />
    </div>
  );
}
