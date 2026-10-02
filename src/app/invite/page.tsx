'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { Footer } from '@/components/Footer';
import { Card } from '@/components/ui/Card';
import { InviteFormContent } from './InviteForm';

function InviteForm() {
  const searchParams = useSearchParams();
  const family = searchParams.get('family') || '';
  return <InviteFormContent family={family} />;
}

export default function InvitePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <Logo className="mb-8" />
        <Suspense
          fallback={
            <Card>
              <h1 className="mb-4 font-serif text-3xl text-ink">Invite someone to add their story</h1>
              <p className="text-ink-500">Loading...</p>
            </Card>
          }
        >
          <InviteForm />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
