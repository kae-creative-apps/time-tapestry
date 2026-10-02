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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
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

      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      if (!data.session?.id) {
        throw new Error('Session was not created. Please try again.');
      }

      window.location.href = `/interview/${data.session.id}`;
    } catch (err) {
      console.error('Share form error:', err);
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
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
            Your grandchild, a child, a niece, a mentee — anyone who&apos;d want to hear your story.
          </p>
          {error && (
            <p className="mb-5 rounded-sm bg-red-50 p-4 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="olderPersonName" className="mb-1 block font-sans text-sm text-ink-500">
                What&apos;s your name?
              </label>
              <input
                id="olderPersonName"
                type="text"
                required
                disabled={isSubmitting}
                value={olderPersonName}
                onChange={(e) => setOlderPersonName(e.target.value)}
                className="w-full rounded-sm border border-warmgray-300 bg-paper-50 p-4 font-sans text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-oxblood disabled:opacity-50"
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
                disabled={isSubmitting}
                value={olderPersonEmail}
                onChange={(e) => setOlderPersonEmail(e.target.value)}
                className="w-full rounded-sm border border-warmgray-300 bg-paper-50 p-4 font-sans text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-oxblood disabled:opacity-50"
              />
            </div>
            <div>
              <label htmlFor="recipientName" className="mb-1 block font-sans text-sm text-ink-500">
                Whom would you like to share this with?
              </label>
              <input
                id="recipientName"
                type="text"
                required
                disabled={isSubmitting}
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                className="w-full rounded-sm border border-warmgray-300 bg-paper-50 p-4 font-sans text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-oxblood disabled:opacity-50"
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
                disabled={isSubmitting}
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className="w-full rounded-sm border border-warmgray-300 bg-paper-50 p-4 font-sans text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-oxblood disabled:opacity-50"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Starting...' : 'Begin my story'}
            </Button>
          </form>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
