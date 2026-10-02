'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Logo } from '@/components/Logo';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FadeIn } from '@/components/ui/FadeIn';
import { Stagger, StaggerItem } from '@/components/ui/Stagger';

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
        <FadeIn className="mb-8">
          <Logo />
        </FadeIn>
        <FadeIn delay={0.1}>
          <Card>
            <h1 className="mb-3 font-serif text-2xl tracking-tight text-ink">Share my story</h1>
            <p className="mb-8 text-base leading-relaxed text-ink-500">
              Begin your Legacy Season and hand it down to someone you love.
            </p>
            <AnimatePresence mode="wait">
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="mb-5 rounded-md bg-red-50 p-4 text-sm text-red-700"
                  role="alert"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
            <form onSubmit={handleSubmit} className="space-y-6">
              <Stagger stagger={0.05} delay={0.15}>
                <StaggerItem>
                  <FloatingLabelInput
                    id="olderPersonName"
                    label="Your name"
                    type="text"
                    required
                    disabled={isSubmitting}
                    value={olderPersonName}
                    placeholder="e.g., Margaret Thompson"
                    onChange={(e) => setOlderPersonName(e.target.value)}
                  />
                </StaggerItem>
                <StaggerItem>
                  <FloatingLabelInput
                    id="olderPersonEmail"
                    label="Your email"
                    type="email"
                    required
                    disabled={isSubmitting}
                    value={olderPersonEmail}
                    placeholder="you@example.com"
                    onChange={(e) => setOlderPersonEmail(e.target.value)}
                  />
                </StaggerItem>
                <StaggerItem>
                  <FloatingLabelInput
                    id="recipientName"
                    label="Share this with"
                    type="text"
                    required
                    disabled={isSubmitting}
                    value={recipientName}
                    placeholder="e.g., Your granddaughter"
                    onChange={(e) => setRecipientName(e.target.value)}
                  />
                </StaggerItem>
                <StaggerItem>
                  <FloatingLabelInput
                    id="recipientEmail"
                    label="Their email"
                    type="email"
                    required
                    disabled={isSubmitting}
                    value={recipientEmail}
                    placeholder="them@example.com"
                    onChange={(e) => setRecipientEmail(e.target.value)}
                  />
                </StaggerItem>
                <StaggerItem>
                  <Button type="submit" className="w-full" loading={isSubmitting}>
                    Begin my story
                  </Button>
                </StaggerItem>
              </Stagger>
            </form>
          </Card>
        </FadeIn>
      </main>
      <Footer />
    </div>
  );
}

function FloatingLabelInput({
  id,
  label,
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { id: string; label: string }) {
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="mb-2 block font-sans text-xs font-medium uppercase tracking-[0.12em] text-ink-500"
      >
        {label}
      </label>
      <input id={id} {...props} />
    </div>
  );
}
