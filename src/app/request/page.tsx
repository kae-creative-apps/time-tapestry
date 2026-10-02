'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Logo } from '@/components/Logo';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/Button';
import { FloatingInput } from '@/components/ui/FloatingInput';

type RequestData = {
  requesterName: string;
  requesterEmail: string;
  olderPersonName: string;
  olderPersonEmail: string;
  note: string;
};

export default function RequestPage() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<RequestData>({
    requesterName: '',
    requesterEmail: '',
    olderPersonName: '',
    olderPersonEmail: '',
    note: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [sessionId, setSessionId] = useState('');

  const canContinue = () => {
    if (step === 1) return data.requesterName.trim().length > 0;
    if (step === 2) return data.olderPersonName.trim().length > 0;
    if (step === 3) return data.olderPersonEmail.trim().length > 0;
    if (step === 4) return true;
    return true;
  };

  const handleNext = () => {
    if (!canContinue()) return;
    setStep((s) => s + 1);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/session/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initiationPath: 'request',
          grandchild: { name: data.requesterName, email: data.requesterEmail },
          grandparent: { name: data.olderPersonName, email: data.olderPersonEmail },
          invite: {
            name: data.olderPersonName,
            email: data.olderPersonEmail,
            note: data.note
          }
        })
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || `Request failed (${res.status})`);
      }

      if (!json.session?.id) {
        throw new Error('Session was not created. Please try again.');
      }

      setSessionId(json.session.id);
      setSubmitted(true);
    } catch (err) {
      console.error('Request form error:', err);
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col bg-paper-texture">
        <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <h1 className="mb-4 font-serif text-3xl text-ink">The invitation is ready</h1>
            <p className="mb-6 text-base leading-relaxed text-ink-500">
              Share this link with {data.olderPersonName}:
            </p>
            <p className="mb-8 break-all rounded-md bg-paper-200 p-4 font-sans text-sm text-ink">
              {typeof window !== 'undefined'
                ? `${window.location.origin}/interview/${sessionId}`
                : `/interview/${sessionId}`}
            </p>
            <Button onClick={() => window.location.reload()}>Start over</Button>
          </motion.div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper-texture">
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="mb-10"
        >
          <Logo />
        </motion.div>

        <div className="relative min-h-[360px]">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <Step
                key="step1"
                title="What's your name?"
                inputId="requesterName"
                label="Your name"
                helper="So we can sign the invitation from you."
                value={data.requesterName}
                onChange={(value) => setData((d) => ({ ...d, requesterName: value }))}
                onContinue={handleNext}
                canContinue={canContinue()}
              />
            )}

            {step === 2 && (
              <Step
                key="step2"
                title="Who are you asking?"
                inputId="olderPersonName"
                label="Their name"
                helper="The person whose story you'd like to keep."
                value={data.olderPersonName}
                onChange={(value) => setData((d) => ({ ...d, olderPersonName: value }))}
                onContinue={handleNext}
                canContinue={canContinue()}
              />
            )}

            {step === 3 && (
              <Step
                key="step3"
                title="How can we reach them?"
                inputId="olderPersonEmail"
                label="Their email"
                type="email"
                helper="We'll send them a quiet invitation."
                value={data.olderPersonEmail}
                onChange={(value) => setData((d) => ({ ...d, olderPersonEmail: value }))}
                onContinue={handleNext}
                canContinue={canContinue()}
              />
            )}

            {step === 4 && (
              <StepNote
                key="step4"
                value={data.note}
                onChange={(value) => setData((d) => ({ ...d, note: value }))}
                onContinue={handleNext}
              />
            )}

            {step === 5 && (
              <StepMoment
                key="step5"
                olderPersonName={data.olderPersonName}
                requesterName={data.requesterName}
                onSend={handleSubmit}
                isSubmitting={isSubmitting}
                error={error}
              />
            )}
          </AnimatePresence>
        </div>
      </main>
      <Footer />
    </div>
  );
}

interface StepProps {
  title: string;
  inputId: string;
  label: string;
  helper?: string;
  value: string;
  type?: string;
  onChange: (value: string) => void;
  onContinue: () => void;
  canContinue: boolean;
}

function Step({
  title,
  inputId,
  label,
  helper,
  value,
  type = 'text',
  onChange,
  onContinue,
  canContinue
}: StepProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div
      key={title}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="flex flex-col"
    >
      <h1 className="mb-8 text-center font-serif text-3xl leading-tight tracking-tight text-ink md:text-4xl">
        {title}
      </h1>

      <FloatingInput
        id={inputId}
        label={label}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputRef={inputRef}
        autoComplete={type === 'email' ? 'email' : 'name'}
      />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.35 }}
        className="mt-3"
      >
        {helper && <p className="text-center text-sm text-warmgray-500">{helper}</p>}
      </motion.div>

      <div className="mt-10 flex justify-center">
        <Button onClick={onContinue} disabled={!canContinue} className="min-w-[160px]">
          Continue
        </Button>
      </div>
    </motion.div>
  );
}

interface StepNoteProps {
  value: string;
  onChange: (value: string) => void;
  onContinue: () => void;
}

function StepNote({ value, onChange, onContinue }: StepNoteProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => textareaRef.current?.focus(), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div
      key="note"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="flex flex-col"
    >
      <h1 className="mb-2 text-center font-serif text-3xl leading-tight tracking-tight text-ink md:text-4xl">
        Would you like to leave them a note?
      </h1>
      <p className="mb-8 text-center text-base text-ink-500">
        A few words before they begin. Completely optional.
      </p>

      <div className="relative">
        <textarea
          ref={textareaRef}
          id="note"
          rows={4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Dear..."
          className="w-full resize-none rounded-md border border-warmgray-300 bg-paper-50 px-4 py-3 font-sans text-sm text-ink outline-none transition-all duration-200 focus:border-oxblood focus:shadow-[0_0_0_3px_rgba(122,46,46,0.12)]"
        />
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.35 }}
        className="mt-3"
      >
        <p className="text-center text-sm text-warmgray-500">
          This will be included in their invitation.
        </p>
      </motion.div>

      <div className="mt-10 flex justify-center">
        <Button onClick={onContinue} className="min-w-[160px]">
          Continue
        </Button>
      </div>
    </motion.div>
  );
}

interface StepMomentProps {
  olderPersonName: string;
  requesterName: string;
  onSend: () => void;
  isSubmitting: boolean;
  error: string;
}

function StepMoment({ olderPersonName, requesterName, onSend, isSubmitting, error }: StepMomentProps) {
  return (
    <motion.div
      key="moment"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="flex flex-col items-center text-center"
    >
      <h1 className="mb-4 font-serif text-3xl leading-tight tracking-tight text-ink md:text-4xl">
        Here&apos;s what happens next
      </h1>

      <div className="mb-8 max-w-sm space-y-4 text-base leading-relaxed text-ink-500">
        <p>
          We&apos;ll send {olderPersonName || 'them'} a gentle invitation from {requesterName || 'you'}.
        </p>
        <p>
          They&apos;ll be able to begin their story when they&apos;re ready, in their own time.
        </p>
      </div>

      <AnimatePresence>
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

      <Button onClick={onSend} loading={isSubmitting} className="min-w-[200px]">
        Send the invitation
      </Button>
    </motion.div>
  );
}
