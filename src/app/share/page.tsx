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
          <h1 className="mb-3 font-serif text-2xl text-ink">Share my story</h1>
          <p className="mb-8 text-base leading-relaxed text-ink-500">
            Begin your Legacy Season and hand it down to someone you love.
          </p>
          {error && (
            <p className="mb-5 rounded-md bg-red-50 p-4 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="olderPersonName" className="mb-2 block font-sans text-xs font-medium uppercase tracking-[0.12em] text-ink-500">
                Your name
              </label>
              <input
                id="olderPersonName"
                type="text"
                required
                disabled={isSubmitting}
                value={olderPersonName}
                placeholder="e.g., Margaret Thompson"
                onChange={(e) => setOlderPersonName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="olderPersonEmail" className="mb-2 block font-sans text-xs font-medium uppercase tracking-[0.12em] text-ink-500">
                Your email
              </label>
              <input
                id="olderPersonEmail"
                type="email"
                required
                disabled={isSubmitting}
                value={olderPersonEmail}
                placeholder="you@example.com"
                onChange={(e) => setOlderPersonEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="recipientName" className="mb-2 block font-sans text-xs font-medium uppercase tracking-[0.12em] text-ink-500">
                Share this with
              </label>
              <input
                id="recipientName"
                type="text"
                required
                disabled={isSubmitting}
                value={recipientName}
                placeholder="e.g., Your granddaughter"
                onChange={(e) => setRecipientName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="recipientEmail" className="mb-2 block font-sans text-xs font-medium uppercase tracking-[0.12em] text-ink-500">
                Their email
              </label>
              <input
                id="recipientEmail"
                type="email"
                required
                disabled={isSubmitting}
                value={recipientEmail}
                placeholder="them@example.com"
                onChange={(e) => setRecipientEmail(e.target.value)}
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
