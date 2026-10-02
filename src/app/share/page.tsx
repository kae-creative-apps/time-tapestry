'use client';

import { useState } from 'react';
import { Logo } from '@/components/Logo';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export default function SharePage() {
  const [olderPersonName, setOlderPersonName] = useState('');
  const [olderPersonEmail, setOlderPersonEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [sessionId, setSessionId] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/session/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initiationPath: 'share',
        grandchild: { name: recipientName, email: recipientEmail },
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
          <h1 className="mb-4 font-serif text-3xl text-ink">Share my story</h1>
          <p className="mb-2 text-ink-500">
            Begin your Legacy Season and hand it down to someone you love.
          </p>
          <p className="mb-8 text-sm text-ink-400">
            This can be shared with a grandchild, child, young person in your life, or any loved one.
          </p>
          {submitted ? (
            <div>
              <p className="mb-4 text-ink">
                Your keepsake link is ready. You can start the interview now:
              </p>
              <Button onClick={() => (window.location.href = `/interview/${sessionId}`)}>
                Begin interview
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="olderPersonName" className="mb-1 block font-sans text-sm text-ink-500">
                  Your name
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
                  Your email
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
              <div>
                <label htmlFor="recipientName" className="mb-1 block font-sans text-sm text-ink-500">
                  The person you&apos;d like to receive it
                </label>
                <input
                  id="recipientName"
                  type="text"
                  required
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full rounded-sm border border-warmgray-300 bg-paper-50 p-4 font-sans text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-oxblood"
                />
              </div>
              <div>
                <label htmlFor="recipientEmail" className="mb-1 block font-sans text-sm text-ink-500">
                  Their email
                </label>
                <input
                  id="recipientEmail"
                  type="email"
                  required
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className="w-full rounded-sm border border-warmgray-300 bg-paper-50 p-4 font-sans text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-oxblood"
                />
              </div>
              <Button type="submit" className="w-full">
                Start my story
              </Button>
            </form>
          )}
        </Card>
      </main>
      <Footer />
    </div>
  );
}
