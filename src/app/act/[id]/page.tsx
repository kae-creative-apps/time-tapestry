'use client';

import { useState } from 'react';
import { Logo } from '@/components/Logo';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

const actions = [
  {
    value: 'continue',
    label: 'Keep the conversation going',
    description: 'Ask another question or request another story.'
  },
  {
    value: 'serve',
    label: 'Serve alongside them',
    description: 'Find a way to volunteer with a cause they love.'
  },
  {
    value: 'give',
    label: 'Give in their honor',
    description: 'Make a gift to one of the causes they named.'
  }
];

export default function ActPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  return <ActPageInner params={params} />;
}

function ActPageInner({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState<string | null>(null);
  const [selected, setSelected] = useState('');
  const [submitted, setSubmitted] = useState(false);

  params.then((p) => setId(p.id));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !selected) return;
    await fetch('/api/reply/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: id,
        type: 'text',
        content: `Action chosen: ${selected}`
      })
    });
    setSubmitted(true);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <Logo className="mb-8" />
        <Card>
          <h1 className="mb-4 font-serif text-3xl text-ink">
            What feels like your next step?
          </h1>
          <p className="mb-8 text-ink-500">
            No pressure. Choose what is true for you right now.
          </p>
          {submitted ? (
            <div>
              <p className="mb-4 text-ink">Thank you. Your choice has been kept.</p>
              <Button onClick={() => window.history.back()}>Go back</Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {actions.map((action) => (
                <label
                  key={action.value}
                  className={`flex cursor-pointer flex-col rounded-sm border p-4 transition-colors ${
                    selected === action.value
                      ? 'border-oxblood bg-paper-100'
                      : 'border-warmgray-300 bg-paper-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="action"
                      value={action.value}
                      checked={selected === action.value}
                      onChange={() => setSelected(action.value)}
                      className="h-5 w-5 accent-oxblood"
                    />
                    <span className="font-serif text-lg text-ink">
                      {action.label}
                    </span>
                  </div>
                  <span className="mt-1 pl-8 font-sans text-sm text-ink-400">
                    {action.description}
                  </span>
                </label>
              ))}
              <Button type="submit" className="w-full" disabled={!selected}>
                Confirm
              </Button>
            </form>
          )}
        </Card>
      </main>
      <Footer />
    </div>
  );
}
