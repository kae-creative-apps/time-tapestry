'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Logo } from '@/components/Logo';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/Button';
import { FloatingInput } from '@/components/ui/FloatingInput';

type ShareData = {
  olderPersonName: string;
  olderPersonEmail: string;
  recipientName: string;
  recipientEmail: string;
};

export default function SharePage() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<ShareData>({
    olderPersonName: '',
    olderPersonEmail: '',
    recipientName: '',
    recipientEmail: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canContinue = () => {
    if (step === 1) return data.olderPersonName.trim().length > 0;
    if (step === 2) return data.recipientName.trim().length > 0;
    if (step === 3) {
      return (
        data.olderPersonEmail.trim().length > 0 &&
        data.recipientEmail.trim().length > 0
      );
    }
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
          initiationPath: 'share',
          grandchild: { name: data.recipientName, email: data.recipientEmail },
          grandparent: { name: data.olderPersonName, email: data.olderPersonEmail }
        })
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || `Request failed (${res.status})`);
      }

      if (!json.session?.id) {
        throw new Error('Session was not created. Please try again.');
      }

      window.location.href = `/interview/${json.session.id}`;
    } catch (err) {
      console.error('Share form error:', err);
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  };

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
                title="Before we begin..."
                inputId="olderPersonName"
                label="Your name"
                placeholder="What do they call you? (your name)"
                helper="So we know what to call you."
                value={data.olderPersonName}
                onChange={(value) => setData((d) => ({ ...d, olderPersonName: value }))}
                onContinue={handleNext}
                canContinue={canContinue()}
              />
            )}

            {step === 2 && (
              <Step
                key="step2"
                title={`Nice to meet you, ${data.olderPersonName}.`}
                headline="And who are you sharing this with?"
                inputId="recipientName"
                label="Their name"
                placeholder="Their name — your grandchild, a child, a niece, a mentor"
                helper="We'll weave this story for them."
                value={data.recipientName}
                onChange={(value) => setData((d) => ({ ...d, recipientName: value }))}
                onContinue={handleNext}
                canContinue={canContinue()}
              />
            )}

            {step === 3 && (
              <Step
                key="step3"
                title="And where can we reach you both?"
                fields={[
                  {
                    id: 'olderPersonEmail',
                    label: 'Your email',
                    placeholder: 'Where can we reach you?',
                    value: data.olderPersonEmail,
                    type: 'email',
                    onChange: (value) => setData((d) => ({ ...d, olderPersonEmail: value }))
                  },
                  {
                    id: 'recipientEmail',
                    label: 'Their email',
                    placeholder: 'And where should we send their invitation?',
                    value: data.recipientEmail,
                    type: 'email',
                    onChange: (value) => setData((d) => ({ ...d, recipientEmail: value }))
                  }
                ]}
                helper="We only use this to send your story where it belongs."
                onContinue={handleNext}
                canContinue={canContinue()}
              />
            )}

            {step === 4 && (
              <StepMoment
                key="step4"
                recipientName={data.recipientName}
                onBegin={handleSubmit}
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

interface SingleField {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  type?: string;
  onChange: (value: string) => void;
}

interface StepProps {
  title: string;
  headline?: string;
  inputId?: string;
  label?: string;
  placeholder?: string;
  helper?: string;
  value?: string;
  type?: string;
  onChange?: (value: string) => void;
  fields?: SingleField[];
  onContinue: () => void;
  canContinue: boolean;
}

function Step({
  title,
  headline,
  inputId,
  label,
  placeholder,
  helper,
  value,
  type = 'text',
  onChange,
  fields,
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
      <h1 className="mb-2 text-center font-serif text-3xl leading-tight tracking-tight text-ink md:text-4xl">
        {title}
      </h1>
      {headline && (
        <h2 className="mb-8 text-center font-serif text-2xl leading-snug text-ink-400 md:text-3xl">
          {headline}
        </h2>
      )}

      <div className="space-y-5">
        {fields ? (
          fields.map((field, index) => (
            <FloatingInput
              key={field.id}
              id={field.id}
              label={field.label}
              type={field.type || 'text'}
              placeholder={field.placeholder}
              value={field.value}
              onChange={(e) => field.onChange(e.target.value)}
              inputRef={index === 0 ? inputRef : undefined}
              autoComplete={field.type === 'email' ? 'email' : 'off'}
            />
          ))
        ) : (
          <FloatingInput
            id={inputId!}
            label={label!}
            type={type}
            placeholder={placeholder!}
            value={value || ''}
            onChange={(e) => onChange?.(e.target.value)}
            inputRef={inputRef}
            autoComplete={type === 'email' ? 'email' : 'name'}
          />
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.35 }}
        >
          {helper && <p className="text-center text-sm text-warmgray-500">{helper}</p>}
        </motion.div>
      </div>

      <div className="mt-10 flex justify-center">
        <Button
          onClick={onContinue}
          disabled={!canContinue}
          className="min-w-[160px]"
        >
          Continue
        </Button>
      </div>
    </motion.div>
  );
}

interface StepMomentProps {
  recipientName: string;
  onBegin: () => void;
  isSubmitting: boolean;
  error: string;
}

function StepMoment({ recipientName, onBegin, isSubmitting, error }: StepMomentProps) {
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
          You&apos;ll have a conversation with a gentle interviewer. About 8–10 minutes. Just
          speak naturally.
        </p>
        <p>
          When you&apos;re finished, we&apos;ll gather your story into something beautiful and send
          it to {recipientName || 'someone you love'}.
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

      <Button onClick={onBegin} loading={isSubmitting} className="min-w-[180px]">
        I&apos;m ready
      </Button>
    </motion.div>
  );
}
