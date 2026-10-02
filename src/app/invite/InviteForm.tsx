'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export function InviteSuccess() {
  return (
    <Card className="text-center">
      <h1 className="mb-4 font-serif text-3xl text-ink">Invitation ready</h1>
      <p className="mb-6 text-ink-500">
        When we are live, this will send an email invitation. For now, it has been recorded.
      </p>
      <Link href="/" className="font-sans text-sm text-oxblood hover:underline">
        Return home
      </Link>
    </Card>
  );
}

export function InviteFormContent({ family }: { family: string }) {
  const [theirName, setTheirName] = useState('');
  const [theirEmail, setTheirEmail] = useState('');
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/session/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initiationPath: 'invite',
        grandchild: { name: '', email: '' },
        grandparent: { name: theirName, email: theirEmail },
        familyId: family || undefined,
        invite: { name: theirName, email: theirEmail, note }
      })
    });
    setSubmitted(true);
  };

  if (submitted) {
    return <InviteSuccess />;
  }

  return (
    <Card>
      <h1 className="mb-4 font-serif text-3xl text-ink">Invite someone to add their story</h1>
      <p className="mb-8 text-ink-500">
        Every voice in a family adds something. Send a quiet invitation to someone whose story you would like to keep.
      </p>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="theirName" className="mb-1 block font-sans text-sm text-ink-500">
            Their name
          </label>
          <input
            id="theirName"
            type="text"
            required
            value={theirName}
            onChange={(e) => setTheirName(e.target.value)}
            className="w-full rounded-sm border border-warmgray-300 bg-paper-50 p-4 font-sans text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-oxblood"
          />
        </div>
        <div>
          <label htmlFor="theirEmail" className="mb-1 block font-sans text-sm text-ink-500">
            Their email
          </label>
          <input
            id="theirEmail"
            type="email"
            value={theirEmail}
            onChange={(e) => setTheirEmail(e.target.value)}
            className="w-full rounded-sm border border-warmgray-300 bg-paper-50 p-4 font-sans text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-oxblood"
          />
        </div>
        <div>
          <label htmlFor="note" className="mb-1 block font-sans text-sm text-ink-500">
            A short note (optional, will be included in the invitation)
          </label>
          <textarea
            id="note"
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-sm border border-warmgray-300 bg-paper-50 p-4 font-sans text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-oxblood"
          />
        </div>
        <Button type="submit" className="w-full">
          Send the invitation
        </Button>
      </form>
    </Card>
  );
}
