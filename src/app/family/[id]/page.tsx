import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { Footer } from '@/components/Footer';
import { Card } from '@/components/ui/Card';
import { getSession, listSessionsByFamilyId } from '@/lib/session';

export default async function FamilyPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sessions = await listSessionsByFamilyId(id);
  const primary = sessions.find((s) => s.familyId === id) || sessions[0];
  const familyName = primary?.familyName || 'This family';

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <Logo className="mb-8" />
        <Card className="mb-8 text-center">
          <h1 className="mb-4 font-serif text-3xl text-ink">{familyName}</h1>
          <p className="text-ink-500">This family&apos;s legacy</p>
        </Card>

        {sessions.length === 0 ? (
          <Card>
            <p className="text-ink-500">
              No stories have been added to this family yet. They will appear here as they are recorded.
            </p>
          </Card>
        ) : (
          <div className="space-y-6">
            {sessions.map((session) => (
              <Card key={session.id}>
                <p className="mb-1 font-serif text-xl text-ink">
                  A story from {session.grandparent.name}
                </p>
                <p className="mb-4 font-sans text-sm text-ink-500">
                  Kept for {session.grandchild.name}
                </p>
                <Link
                  href={`/keepsake/${session.id}`}
                  className="font-sans text-sm text-oxblood hover:underline"
                >
                  Read the keepsake
                </Link>
              </Card>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
