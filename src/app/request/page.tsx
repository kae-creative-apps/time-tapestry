'use client';

import { useState } from 'react';
import { Logo } from '@/components/Logo';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export default function RequestPage() {
  const [requesterName, setRequesterName] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [olderPersonName, setOlderPersonName] = useState('');
  const [olderPersonEmail, setOlderPersonEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [sessionId, setSessionId] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/session/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initiationPath: 'request',
        grandchild: { name: requesterName, email: requesterEmail },
        grandparent: { name: olderPersonName, email: olderPersonEmail }
      })
    });
    const data = await res.json();
    if (data.session?.id) {
      setSessionId(data.session.id);
      setSubmitted(true);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <Logo className="mb-8" />
        <Card>
          <h1 className="mb-4 font-serif text-3xl text-ink">Request a story</h1>
          <p className="mb-2 text-ink-500">
            Send an invitation to someone whose story you want to keep.
          </p>
          <p className="mb-8 text-sm text-ink-400">
            We start with generosity because it is at the heart of a life well-lived, but their story can go wherever they would like.
          </p>
          {submitted ? (
            <div>
              <p className="mb-4 text-ink">
                The invitation has been prepared. Share this link with{' '}
                {olderPersonName}:
              </p>
              <p className="mb-6 break-all rounded-sm bg-paper-200 p-4 font-sans text-sm text-ink">
                {typeof window !== 'undefined'
                  ? `${window.location.origin}/interview/${sessionId}`
                  : `/interview/${sessionId}`}
              </p>
              <Button onClick={() => window.location.reload()}>
                Start over
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="requesterName" className="mb-1 block font-sans text-sm text-ink-500">
                  Your name
                </label>
                <input
                  id="requesterName"
                  type="text"
                  required
                  value={requesterName}
                  onChange={(e) => setRequesterName(e.target.value)}
                  className="w-full rounded-sm border border-warmgray-300 bg-paper-50 p-4 font-sans text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-oxblood"
                />
              </div>
              <div>
                <label htmlFor="requesterEmail" className="mb-1 block font-sans text-sm text-ink-500">
                  Your email
                </label>
                <input
                  id="requesterEmail"
                  type="email"
                  required
                  value={requesterEmail}
                  onChange={(e) => setRequesterEmail(e.target.value)}
                  className="w-full rounded-sm border border-warmgray-300 bg-paper-50 p-4 font-sans text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-oxblood"
                />
              </div>
              <div>
                <label htmlFor="olderPersonName" className="mb-1 block font-sans text-sm text-ink-500">
                  The older person&apos;s name
                </label>
                <input
                  id="olderPersonName"
                  type="text"
                  required
                  value={olderPersonName}
                  onChange={(e) => setOlderPersonName(e.target.value)}
                  className="w-full rounded-sm border border-warmgray-300 bg-paper-50 p-4 font-sans text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-oxblood"
                />
              </div>
              <div>
                <label htmlFor="olderPersonEmail" className="mb-1 block font-sans text-sm text-ink-500">
                  Their email
                </label>
                <input
                  id="olderPersonEmail"
                  type="email"
                  required
                  value={olderPersonEmail}
                  onChange={(e) => setOlderPersonEmail(e.target.value)}
                  className="w-full rounded-sm border border-warmgray-300 bg-paper-50 p-4 font-sans text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-oxblood"
                />
              </div>
              <Button type="submit" className="w-full">
                Send invitation
              </Button>
            </form>
          )}
        </Card>
      </main>
      <Footer />
    </div>
  );
}
