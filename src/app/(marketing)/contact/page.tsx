'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export default function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, message })
    });
    setSubmitting(false);
    setSubmitted(true);
  };

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <Card className="mb-8 text-center">
        <h1 className="mb-4 font-serif text-4xl leading-tight text-ink sm:text-5xl">
          Get in touch
        </h1>
        <p className="font-serif text-xl text-ink-500">
          Send us a note. We read every one.
        </p>
      </Card>

      <Card>
        {submitted ? (
          <div className="text-center">
            <h2 className="mb-3 font-serif text-2xl text-ink">Thank you</h2>
            <p className="text-ink-500">
              We received your message and will be in touch soon.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="name" className="mb-1 block font-sans text-sm text-ink-500">
                Name
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-sm border border-warmgray-300 bg-paper-50 p-4 font-sans text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-oxblood"
              />
            </div>
            <div>
              <label htmlFor="email" className="mb-1 block font-sans text-sm text-ink-500">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-sm border border-warmgray-300 bg-paper-50 p-4 font-sans text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-oxblood"
              />
            </div>
            <div>
              <label htmlFor="message" className="mb-1 block font-sans text-sm text-ink-500">
                Message
              </label>
              <textarea
                id="message"
                rows={5}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-sm border border-warmgray-300 bg-paper-50 p-4 font-sans text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-oxblood"
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Sending...' : 'Send us a note'}
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}
