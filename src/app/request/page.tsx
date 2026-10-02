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
          initiationPath: 'request',
          grandchild: { name: requesterName, email: requesterEmail },
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

      setSessionId(data.session.id);
      setSubmitted(true);
    } catch (err) {
      console.error('Request form error:', err);
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
          <h1 className="mb-3 font-serif text-2xl text-ink">Request a story</h1>
          <p className="mb-8 text-base leading-relaxed text-ink-500">
            Send a quiet invitation to someone whose story you want to keep.
          </p>
          {submitted ? (
            <div>
              <p className="mb-4 text-ink">
                The invitation has been prepared. Share this link with{' '}
                {olderPersonName}:
              </p>
              <p className="mb-6 break-all rounded-md bg-paper-200 p-4 font-sans text-sm text-ink">
                {typeof window !== 'undefined'
                  ? `${window.location.origin}/interview/${sessionId}`
                  : `/interview/${sessionId}`}
              </p>
              <Button onClick={() => window.location.reload()}>
                Start over
              </Button>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <p className="rounded-md bg-red-50 p-4 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}
            <div>
              <label htmlFor="requesterName" className="mb-2 block font-sans text-xs font-medium uppercase tracking-[0.12em] text-ink-500">
                Your name
              </label>
              <input
                id="requesterName"
                type="text"
                required
                value={requesterName}
                disabled={isSubmitting}
                placeholder="e.g., David Miller"
                onChange={(e) => setRequesterName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="requesterEmail" className="mb-2 block font-sans text-xs font-medium uppercase tracking-[0.12em] text-ink-500">
                Your email
              </label>
              <input
                id="requesterEmail"
                type="email"
                required
                value={requesterEmail}
                disabled={isSubmitting}
                placeholder="you@example.com"
                onChange={(e) => setRequesterEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="olderPersonName" className="mb-2 block font-sans text-xs font-medium uppercase tracking-[0.12em] text-ink-500">
                Whose story do you want?
              </label>
              <input
                id="olderPersonName"
                type="text"
                required
                value={olderPersonName}
                disabled={isSubmitting}
                placeholder="e.g., Your grandmother"
                onChange={(e) => setOlderPersonName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="olderPersonEmail" className="mb-2 block font-sans text-xs font-medium uppercase tracking-[0.12em] text-ink-500">
                Their email
              </label>
              <input
                id="olderPersonEmail"
                type="email"
                required
                value={olderPersonEmail}
                disabled={isSubmitting}
                placeholder="them@example.com"
                onChange={(e) => setOlderPersonEmail(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Sending invitation...' : 'Send the invitation'}
            </Button>
          </form>
          )}
        </Card>
      </main>
      <Footer />
    </div>
  );
}
