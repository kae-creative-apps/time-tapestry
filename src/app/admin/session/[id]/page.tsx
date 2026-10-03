'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AdminNav } from '@/components/AdminNav';

type Session = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  initiationPath: string;
  familyName?: string;
  grandparent: { name: string; email: string };
  grandchild: { name: string; email: string };
  invite?: { name?: string; email?: string; note?: string };
  voiceIntroUrl?: string;
  videoUrl?: string;
  interview?: {
    transcript: Array<{ role: 'ai' | 'grandparent'; content: string; timestamp: string }>;
    currentQuestion: number;
    startedAt?: string;
    completedAt?: string;
  };
  story?: {
    chapters: Array<{ title: string; content: string; audioUrl?: string }>;
    welcomeNote: string;
    causes: string[];
    values: string[];
    keyQuotes: string[];
    generatedAt?: string;
    approvedAt?: string;
  };
  grandchildReply?: {
    type: string;
    content: string;
    mediaUrl?: string;
    submittedAt: string;
  };
  grandchildAction?: {
    action: string;
    submittedAt: string;
  };
  postcardsScheduled?: Array<{
    pscId: string;
    sendDate: string;
    chapterIndex: number;
  }>;
};

export default function AdminSessionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/sessions/${params.id}`)
      .then((res) => {
        if (res.status === 401) {
          router.push(`/admin/login?redirect=/admin/session/${params.id}`);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data && 'session' in data) {
          setSession(data.session);
        } else if (data && 'error' in data) {
          setError(data.error);
        }
      })
      .catch(() => setError('Failed to load session'))
      .finally(() => setLoading(false));
  }, [params.id, router]);

  async function copyId() {
    if (!session) return;
    await navigator.clipboard.writeText(session.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-paper-texture">
        <AdminNav />
        <main className="mx-auto max-w-4xl px-6 py-10">
          <p className="text-ink-500">Loading session...</p>
        </main>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-paper-texture">
        <AdminNav />
        <main className="mx-auto max-w-4xl px-6 py-10">
          <p className="text-ink-500">{error || 'Session not found.'}</p>
        </main>
      </div>
    );
  }

  const steps = [
    { label: 'Created', at: session.createdAt },
    { label: 'Interview started', at: session.interview?.startedAt },
    { label: 'Interview complete', at: session.interview?.completedAt },
    { label: 'Story generated', at: session.story?.generatedAt },
    { label: 'Story approved', at: session.story?.approvedAt },
    { label: 'Last updated', at: session.updatedAt }
  ];

  return (
    <div className="min-h-screen bg-paper-texture">
      <AdminNav />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-sans text-xs uppercase tracking-wide text-ink-500">
              Session detail
            </p>
            <h1 className="font-serif text-2xl text-ink sm:text-3xl">
              {session.grandparent.name || 'Unnamed storyteller'}
            </h1>
            {session.familyName && (
              <p className="font-sans text-sm text-ink-500">{session.familyName}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <CopyButton onClick={copyId} copied={copied} />
            <AdminLink href={`/keepsake/${session.id}`}>Keepsake</AdminLink>
            <AdminLink href={`/postcards/${session.id}`}>Postcards</AdminLink>
            <AdminLink href={`/review/${session.id}`}>Review</AdminLink>
            <AdminLink href={`/interview/${session.id}`}>Interview</AdminLink>
          </div>
        </div>

        <section className="mb-8 rounded-lg border border-warmgray-300 bg-paper-50 p-6">
          <h2 className="mb-4 font-serif text-xl text-ink">People</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Grandparent" value={session.grandparent.name} />
            <Field label="Grandparent email" value={session.grandparent.email} />
            <Field label="Grandchild" value={session.grandchild.name} />
            <Field label="Grandchild email" value={session.grandchild.email} />
            {session.invite && (
              <>
                <Field label="Invitee" value={session.invite.name || '—'} />
                <Field label="Invitee email" value={session.invite.email || '—'} />
                <Field label="Invite note" value={session.invite.note || '—'} />
              </>
            )}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Status" value={session.status} />
            <Field label="Initiation path" value={session.initiationPath} />
            <Field label="Session ID" value={session.id} />
          </div>
        </section>

        <section className="mb-8 rounded-lg border border-warmgray-300 bg-paper-50 p-6">
          <h2 className="mb-4 font-serif text-xl text-ink">Timeline</h2>
          <dl className="grid gap-3 sm:grid-cols-2">
            {steps.map((step) => (
              <div key={step.label}>
                <dt className="font-sans text-xs uppercase tracking-wide text-ink-400">
                  {step.label}
                </dt>
                <dd className="text-ink-700">{formatTimestamp(step.at)}</dd>
              </div>
            ))}
          </dl>
        </section>

        {session.interview && session.interview.transcript.length > 0 && (
          <section className="mb-8 rounded-lg border border-warmgray-300 bg-paper-50 p-6">
            <h2 className="mb-4 font-serif text-xl text-ink">
              Interview transcript ({session.interview.transcript.length} turns)
            </h2>
            <div className="space-y-4">
              {session.interview.transcript.map((turn, i) => (
                <div key={i} className="rounded border border-warmgray-200 p-4">
                  <p className="mb-1 font-sans text-xs font-medium uppercase tracking-wide text-ink-400">
                    {turn.role} · {formatTimestamp(turn.timestamp)}
                  </p>
                  <p className="whitespace-pre-wrap text-ink-700">{turn.content}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {session.story && session.story.chapters.length > 0 && (
          <section className="mb-8 rounded-lg border border-warmgray-300 bg-paper-50 p-6">
            <h2 className="mb-4 font-serif text-xl text-ink">Generated story</h2>
            <div className="mb-4 rounded border border-warmgray-200 bg-paper p-4">
              <h3 className="mb-2 font-serif text-lg text-ink">Welcome note</h3>
              <p className="whitespace-pre-wrap text-ink-700">{session.story.welcomeNote}</p>
            </div>
            <div className="space-y-4">
              {session.story.chapters.map((chapter, i) => (
                <div key={i} className="rounded border border-warmgray-200 p-4">
                  <h3 className="mb-2 font-serif text-lg text-ink">{chapter.title}</h3>
                  <p className="whitespace-pre-wrap text-ink-700">{chapter.content}</p>
                  {chapter.audioUrl && (
                    <audio controls src={chapter.audioUrl} className="mt-3 w-full" />
                  )}
                </div>
              ))}
            </div>
            {session.story.causes.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 font-serif text-lg text-ink">Causes</h3>
                <ul className="list-disc space-y-1 pl-5 text-ink-700">
                  {session.story.causes.map((cause, i) => (
                    <li key={i}>{cause}</li>
                  ))}
                </ul>
              </div>
            )}
            {session.story.values.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 font-serif text-lg text-ink">Values</h3>
                <ul className="list-disc space-y-1 pl-5 text-ink-700">
                  {session.story.values.map((value, i) => (
                    <li key={i}>{value}</li>
                  ))}
                </ul>
              </div>
            )}
            {session.story.keyQuotes.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 font-serif text-lg text-ink">Key quotes</h3>
                <ul className="list-disc space-y-1 pl-5 text-ink-700">
                  {session.story.keyQuotes.map((quote, i) => (
                    <li key={i}>{quote}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {session.videoUrl && (
          <section className="mb-8 rounded-lg border border-warmgray-300 bg-paper-50 p-6">
            <h2 className="mb-4 font-serif text-xl text-ink">Video</h2>
            <video controls src={session.videoUrl} className="w-full max-w-xl rounded" />
          </section>
        )}

        {session.voiceIntroUrl && (
          <section className="mb-8 rounded-lg border border-warmgray-300 bg-paper-50 p-6">
            <h2 className="mb-4 font-serif text-xl text-ink">Voice intro</h2>
            <audio controls src={session.voiceIntroUrl} className="w-full max-w-xl" />
          </section>
        )}

        {session.postcardsScheduled && session.postcardsScheduled.length > 0 && (
          <section className="mb-8 rounded-lg border border-warmgray-300 bg-paper-50 p-6">
            <h2 className="mb-4 font-serif text-xl text-ink">
              Postcards ({session.postcardsScheduled.length})
            </h2>
            <div className="space-y-3">
              {session.postcardsScheduled.map((pc) => (
                <div
                  key={pc.pscId}
                  className="flex flex-col justify-between gap-2 rounded border border-warmgray-200 p-4 sm:flex-row sm:items-center"
                >
                  <div>
                    <p className="font-sans text-xs uppercase tracking-wide text-ink-400">
                      ID
                    </p>
                    <p className="text-ink-700">{pc.pscId}</p>
                  </div>
                  <div>
                    <p className="font-sans text-xs uppercase tracking-wide text-ink-400">
                      Send date
                    </p>
                    <p className="text-ink-700">{formatTimestamp(pc.sendDate)}</p>
                  </div>
                  <div>
                    <p className="font-sans text-xs uppercase tracking-wide text-ink-400">
                      Chapter
                    </p>
                    <p className="text-ink-700">{pc.chapterIndex}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {session.grandchildReply && (
          <section className="mb-8 rounded-lg border border-warmgray-300 bg-paper-50 p-6">
            <h2 className="mb-4 font-serif text-xl text-ink">Grandchild reply</h2>
            <p className="mb-2 font-sans text-xs uppercase tracking-wide text-ink-400">
              {session.grandchildReply.type} · {formatTimestamp(session.grandchildReply.submittedAt)}
            </p>
            <p className="whitespace-pre-wrap text-ink-700">{session.grandchildReply.content}</p>
            {session.grandchildReply.mediaUrl && (
              <audio controls src={session.grandchildReply.mediaUrl} className="mt-3 w-full max-w-xl" />
            )}
          </section>
        )}

        {session.grandchildAction && (
          <section className="mb-8 rounded-lg border border-warmgray-300 bg-paper-50 p-6">
            <h2 className="mb-4 font-serif text-xl text-ink">Grandchild action</h2>
            <p className="font-sans text-xs uppercase tracking-wide text-ink-400">
              Action
            </p>
            <p className="mb-3 capitalize text-ink-700">{session.grandchildAction.action}</p>
            <p className="font-sans text-xs uppercase tracking-wide text-ink-400">
              Submitted
            </p>
            <p className="text-ink-700">{formatTimestamp(session.grandchildAction.submittedAt)}</p>
          </section>
        )}
      </main>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-sans text-xs uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="text-ink-700">{value || '—'}</dd>
    </div>
  );
}

function CopyButton({ onClick, copied }: { onClick: () => void; copied: boolean }) {
  return (
    <button
      onClick={onClick}
      className="rounded border border-warmgray-300 px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-paper-200"
    >
      {copied ? 'Copied!' : 'Copy ID'}
    </button>
  );
}

function AdminLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded border border-oxblood px-3 py-1.5 text-xs font-medium text-oxblood hover:bg-oxblood-700/10"
    >
      {children}
    </Link>
  );
}

function formatTimestamp(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}
