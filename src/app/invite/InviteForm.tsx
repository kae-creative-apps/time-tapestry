'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export function InviteSuccess() {
  return (
    <Card className="text-center">
      <h1 className="mb-3 font-serif text-2xl text-ink">Invitation ready</h1>
      <p className="mb-6 leading-relaxed text-ink-500">
        When we are live, this will send an email invitation. For now, it has been recorded.
      </p>
      <Link href="/" className="font-sans text-sm text-oxblood transition hover:text-oxblood-600 hover:underline">
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
      <h1 className="mb-3 font-serif text-2xl text-ink">Invite someone to add their story</h1>
      <p className="mb-8 leading-relaxed text-ink-500">
        Every voice in a family adds something. Send a quiet invitation to someone whose story you would like to keep.
      </p>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="theirName" className="mb-2 block font-sans text-xs font-medium uppercase tracking-[0.12em] text-ink-500">
            Their name
          </label>
          <input
            id="theirName"
            type="text"
            required
            value={theirName}
            placeholder="e.g., Uncle Robert"
            onChange={(e) => setTheirName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="theirEmail" className="mb-2 block font-sans text-xs font-medium uppercase tracking-[0.12em] text-ink-500">
            Their email
          </label>
          <input
            id="theirEmail"
            type="email"
            value={theirEmail}
            placeholder="them@example.com"
            onChange={(e) => setTheirEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="note" className="mb-2 block font-sans text-xs font-medium uppercase tracking-[0.12em] text-ink-500">
            A short note <span className="font-normal normal-case tracking-normal text-warmgray-500">(optional)</span>
          </label>
          <textarea
            id="note"
            rows={4}
            value={note}
            placeholder="Add a personal sentence or two..."
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full">
          Send the invitation
        </Button>
      </form>
    </Card>
  );
}
