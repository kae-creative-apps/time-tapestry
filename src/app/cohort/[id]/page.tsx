import { StoryDisplay } from '@/components/StoryDisplay';
import { Logo } from '@/components/Logo';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getSession } from '@/lib/session';
import { demoStory } from '@/lib/mock-data';
import { listSessions } from '@/lib/session';

export default async function CohortPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sessions = await listSessions();
  const orgSessions = sessions.filter((s) => s.orgId === id);
  const delivered = orgSessions.filter((s) => s.status === 'delivered').length;
  const started = orgSessions.filter(
    (s) => s.status === 'interview_started' || s.status === 'interview_complete'
  ).length;

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <Logo className="mb-8" />
        <Card className="mb-8">
          <h1 className="mb-4 font-serif text-3xl text-ink">
            Cohort overview
          </h1>
          <p className="mb-6 text-ink-500">
            A quiet look at how many stories are being kept.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-sm bg-paper-100 p-4 text-center">
              <p className="font-serif text-3xl text-oxblood">
                {orgSessions.length}
              </p>
              <p className="font-sans text-sm text-ink-400">Started</p>
            </div>
            <div className="rounded-sm bg-paper-100 p-4 text-center">
              <p className="font-serif text-3xl text-oxblood">{started}</p>
              <p className="font-sans text-sm text-ink-400">In progress</p>
            </div>
            <div className="rounded-sm bg-paper-100 p-4 text-center">
              <p className="font-serif text-3xl text-oxblood">{delivered}</p>
              <p className="font-sans text-sm text-ink-400">Delivered</p>
            </div>
          </div>
        </Card>
        <div className="space-y-6">
          {orgSessions.map((session) => (
            <Card key={session.id}>
              <p className="font-serif text-lg text-ink">
                {session.grandparent.name} &rarr; {session.grandchild.name}
              </p>
              <p className="font-sans text-sm text-warmgray-500">
                {session.status}
              </p>
            </Card>
          ))}
          {orgSessions.length === 0 && (
            <p className="text-center text-ink-400">
              No sessions for this cohort yet.
            </p>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
