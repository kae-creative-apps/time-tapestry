'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { ProgressBar } from './ui/ProgressBar';
import { MicPermission } from './ui/MicPermission';
import { VisualCompanion } from './VisualCompanion';
import { VoiceRecorder } from './VoiceRecorder';
import { VideoRecorder } from './VideoRecorder';
import { Session } from '@/lib/session';
import { CORE_QUESTIONS, OPTIONAL_QUESTIONS } from '@/lib/interview-state';

const SILENCE_MS = 10000;

const MOCK_TRANSCRIPT =
  "I think the story that comes to mind is the time we gave away our best coats to a family who needed them more than we did.";

export function InterviewSession({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [phase, setPhase] = useState<'loading' | 'error' | 'expectations' | 'mic_permission' | 'intro' | 'interview' | 'continue_prompt' | 'paused' | 'video_prompt' | 'recording_video' | 'finished'>('loading');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [aiText, setAiText] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [silencePrompt, setSilencePrompt] = useState(false);
  const [textMode, setTextMode] = useState(false);
  const [textAnswer, setTextAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isMockMode, setIsMockMode] = useState(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechSynthRef = useRef<SpeechSynthesisUtterance | null>(null);

  const allQuestions = [...CORE_QUESTIONS, ...OPTIONAL_QUESTIONS];
  const currentQuestion = allQuestions[questionIndex];
  const questionText = currentQuestion?.text.replace(
    /\[grandchildName\]/g,
    session?.grandchild.name ?? 'the person who will keep this'
  );

  useEffect(() => {
    let cancelled = false;
    setError(null);

    Promise.all([
      fetch(`/api/session/${sessionId}`),
      fetch('/api/config')
    ])
      .then(async ([sessionRes, configRes]) => {
        if (!sessionRes.ok) {
          throw new Error(`Session load failed: ${sessionRes.status}`);
        }
        const sessionJson = await sessionRes.json().catch(() => ({}));
        const configJson = await configRes.json().catch(() => ({ mock: false }));
        if (!cancelled) {
          setSession(sessionJson.session ?? null);
          setIsMockMode(Boolean(configJson.mock));
          setPhase(sessionJson.session ? 'expectations' : 'error');
          if (!sessionJson.session) {
            setError('We could not find your session. Please check your link.');
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load interview:', err);
        if (!cancelled) {
          setError('We could not load your session. Please check your link or try again.');
          setPhase('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const speak = useCallback((text: string) => {
    if (!text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.85;
    utterance.pitch = 1.02;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    speechSynthRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, []);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  const handleMicAllowed = useCallback(() => {
    setPhase('intro');
    setAiText(
      "Hello, I'm your Time Tapestry interviewer. Take your time. I'm here to listen."
    );
  }, []);

  const startQuestion = useCallback(() => {
    if (!questionText) return;
    setPhase('interview');
    setAiText(questionText);
  }, [questionText]);

  const startRecording = useCallback(async () => {
    setTextMode(false);
    setTextAnswer('');
    setRecording(true);
    setSilencePrompt(false);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      setSilencePrompt(true);
    }, SILENCE_MS);
  }, []);

  const handleTurnResponse = useCallback(
    (data: { aiResponse?: string; mock?: boolean; paused?: boolean }) => {
      if (data.mock) setIsMockMode(true);
      const responseText =
        data.aiResponse ||
        'Thank you for sharing that. Take your time. I am listening.';
      setAiText(responseText);
      if (data.paused) {
        setPhase('paused');
      } else {
        speak(responseText);
      }
    },
    [speak]
  );

  const stopRecordingFlow = useCallback(
    async (blob: Blob) => {
      setRecording(false);
      setSilencePrompt(false);
      setError(null);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

      setUploading(true);
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onerror = () => {
        setUploading(false);
        setError('Could not read your recording. Please try again.');
      };
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        try {
          const res = await fetch('/api/interview/turn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              questionIndex,
              audioBase64: base64,
              mimeType: 'audio/webm'
            })
          });
          if (!res.ok) throw new Error(`Turn failed: ${res.status}`);
          const data = await res.json().catch(() => ({}));
          handleTurnResponse(data);
        } catch (err) {
          const serverMessage = err instanceof Error ? err.message : 'Unknown error';
          console.error('Recording submission failed:', serverMessage, err);
          setError(`Something went wrong saving your answer. ${serverMessage}`);
        } finally {
          setUploading(false);
        }
      };
    },
    [sessionId, questionIndex, handleTurnResponse]
  );

  const submitTextAnswer = useCallback(async () => {
    if (!textAnswer.trim()) return;
    setUploading(true);
    setError(null);
    try {
      const res = await fetch('/api/interview/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          questionIndex,
          transcript: textAnswer
        })
      });
      if (!res.ok) throw new Error(`Turn failed: ${res.status}`);
      const data = await res.json().catch(() => ({}));
      handleTurnResponse(data);
      setTextAnswer('');
    } catch (err) {
      const serverMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Text answer submission failed:', serverMessage, err);
      setError(`Something went wrong saving your answer. ${serverMessage}`);
    } finally {
      setUploading(false);
    }
  }, [sessionId, questionIndex, textAnswer, handleTurnResponse]);

  const submitMockAnswer = useCallback(async () => {
    setUploading(true);
    setError(null);
    try {
      const res = await fetch('/api/interview/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          questionIndex,
          transcript: MOCK_TRANSCRIPT
        })
      });
      if (!res.ok) throw new Error(`Turn failed: ${res.status}`);
      const data = await res.json().catch(() => ({}));
      setIsMockMode(true);
      handleTurnResponse(data);
    } catch (err) {
      const serverMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Mock answer submission failed:', serverMessage, err);
      setError(`Something went wrong with the sample answer. ${serverMessage}`);
    } finally {
      setUploading(false);
    }
  }, [sessionId, questionIndex, handleTurnResponse]);

  const handleVideoDone = useCallback(async (videoUrl: string) => {
    setSession((prev) => (prev ? { ...prev, videoUrl } : prev));
    setPhase('finished');
    setUploading(false);
  }, []);

  const startVideoUpload = useCallback(() => {
    setUploading(true);
    setError(null);
  }, []);

  const continueToReview = useCallback(() => {
    window.location.href = `/review/${sessionId}`;
  }, [sessionId]);

  const advance = useCallback(() => {
    stopSpeaking();
    if (questionIndex === CORE_QUESTIONS.length - 1) {
      setPhase('continue_prompt');
      setAiText(
        "You've shared a beautiful story. Would you like to keep going with two more questions, or save what you have?"
      );
      return;
    }
    if (questionIndex >= allQuestions.length - 1) {
      setPhase('video_prompt');
      setAiText('');
      return;
    }
    setPhase('interview');
    setQuestionIndex((i) => i + 1);
  }, [questionIndex, stopSpeaking]);

  useEffect(() => {
    if (phase === 'interview' && questionText) {
      setAiText(questionText);
      speak(questionText);
    }
  }, [phase, questionIndex, questionText, speak]);

  const handlePause = useCallback(() => {
    stopSpeaking();
    setRecording(false);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    setPhase('paused');
  }, [stopSpeaking]);

  const remainingCount = () => {
    if (questionIndex < CORE_QUESTIONS.length) return CORE_QUESTIONS.length;
    return allQuestions.length;
  };

  if (phase === 'loading') {
    return (
      <Card className="text-center">
        <p className="text-ink-500">Loading your interview...</p>
      </Card>
    );
  }

  if (phase === 'error') {
    return (
      <Card className="text-center">
        <h2 className="mb-4 font-serif text-2xl text-ink">Something went wrong</h2>
        <p className="mb-6 leading-relaxed text-ink-500">
          {error || 'We could not find your session. Please check your link or ask the person who invited you for help.'}
        </p>
      </Card>
    );
  }

  if (phase === 'mic_permission') {
    return <MicPermission onAllow={handleMicAllowed} />;
  }

  if (phase === 'expectations') {
    return (
      <Card className="text-center">
        <h2 className="mb-2 font-serif text-2xl text-ink">
          Here&apos;s what we&apos;ll make together, {session?.grandparent.name ?? 'friend'}.
        </h2>
        <p className="mb-8 leading-relaxed text-ink-500">
          Time Tapestry weaves your story into keepsakes your family can hold onto.
        </p>
        <div className="mb-8 grid grid-cols-1 gap-4 text-left sm:grid-cols-2">
          <div className="rounded-lg border border-warmgray-200 bg-paper-50 p-5">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-oxblood/10 text-oxblood">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            </div>
            <h3 className="mb-1 font-serif text-lg text-ink">A page just for them</h3>
            <p className="font-sans text-sm leading-relaxed text-ink-500">
              Your story, woven into a keepsake page with audio narration across four chapters.
            </p>
          </div>
          <div className="rounded-lg border border-warmgray-200 bg-paper-50 p-5">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-oxblood/10 text-oxblood">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
            </div>
            <h3 className="mb-1 font-serif text-lg text-ink">A video of your final word</h3>
            <p className="font-sans text-sm leading-relaxed text-ink-500">
              Record a short message at the end... your face, your voice, your advice.
            </p>
          </div>
          <div className="rounded-lg border border-warmgray-200 bg-paper-50 p-5">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-oxblood/10 text-oxblood">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            </div>
            <h3 className="mb-1 font-serif text-lg text-ink">Five postcards in the mail</h3>
            <p className="font-sans text-sm leading-relaxed text-ink-500">
              Sent one at a time over five weeks, each one carrying a piece of the story.
            </p>
          </div>
          <div className="rounded-lg border border-warmgray-200 bg-paper-50 p-5">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-oxblood/10 text-oxblood">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            </div>
            <h3 className="mb-1 font-serif text-lg text-ink">An email to your grandchild</h3>
            <p className="font-sans text-sm leading-relaxed text-ink-500">
              They&apos;ll receive a link to the full keepsake when you&apos;re ready.
            </p>
          </div>
        </div>
        <Button onClick={() => setPhase('mic_permission')}>I&apos;m ready to begin</Button>
      </Card>
    );
  }

  if (phase === 'intro') {
    return (
      <Card className="text-center">
        <h2 className="mb-4 font-serif text-2xl text-ink">
          Hello, {session?.grandparent.name ?? 'friend'}.
        </h2>
        <p className="mb-6 leading-relaxed text-ink-500">
          {session?.initiationPath === 'request' ? (
            <>
              {session?.grandchild.name ?? 'Someone'} has asked you to share your
              story of generosity. I&apos;ll ask you a few questions, one at a time.
              Speak naturally &mdash; there are no wrong answers. Take as long as
              you&apos;d like.
            </>
          ) : (
            <>
              I&apos;ll ask you a few questions, one at a time. Speak naturally
              &mdash; there are no wrong answers. Take as long as you&apos;d like.
            </>
          )}
        </p>
        {session?.voiceIntroUrl && (
          <div className="mb-6">
            <p className="mb-2 font-sans text-xs uppercase tracking-[0.1em] text-ink-500">
              Play {session.grandchild.name}&apos;s voice note first
            </p>
            <audio
              src={session.voiceIntroUrl}
              controls
              className="mx-auto w-full max-w-md"
            />
          </div>
        )}
        <p className="mb-8 font-sans text-sm text-warmgray-500">
          Need help? Ask someone you trust to sit with you.
        </p>
        <Button onClick={startQuestion}>I&apos;m ready</Button>
      </Card>
    );
  }

  if (phase === 'paused') {
    return (
      <Card className="text-center">
        <h2 className="mb-4 font-serif text-2xl text-ink">Your place is saved</h2>
        <p className="mb-8 leading-relaxed text-ink-500">
          Come back whenever you are ready. The link will bring you right back
          here.
        </p>
        <Button onClick={() => setPhase('interview')}>Continue</Button>
      </Card>
    );
  }

  if (phase === 'finished') {
    return (
      <Card className="text-center">
        <h2 className="mb-4 font-serif text-2xl text-ink">
          Thank you, {session?.grandparent.name ?? 'friend'}.
        </h2>
        <p className="mb-4 leading-relaxed text-ink-500">Your story is saved.</p>
        <p className="mb-8 leading-relaxed text-ink-500">
          Next, you&apos;ll have a chance to review it before it goes anywhere.
        </p>
        <Button
          onClick={() =>
            (window.location.href = `/review/${sessionId}`)
          }
        >
          Continue to review
        </Button>
      </Card>
    );
  }

  if (phase === 'continue_prompt') {
    return (
      <Card className="text-center">
        <h2 className="mb-4 font-serif text-2xl text-ink">A beautiful story</h2>
        <p className="mb-8 leading-relaxed text-ink-500">
          Would you like to keep going with two more questions, or save what you
          have?
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button onClick={advance}>Keep going</Button>
          <Button variant="secondary" onClick={() => setPhase('video_prompt')}>
            Save what I have
          </Button>
        </div>
      </Card>
    );
  }

  if (phase === 'video_prompt') {
    return (
      <Card className="text-center">
        <h2 className="mb-4 font-serif text-2xl text-ink">One last keepsake</h2>
        <p className="mb-8 leading-relaxed text-ink-500">
          Would you like to record a short video message for your family? You can
          share a word of encouragement, a blessing, or anything you&apos;d like them
          to see.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button onClick={() => setPhase('recording_video')}>
            Yes, record a video
          </Button>
          <Button variant="secondary" onClick={continueToReview}>
            Skip for now
          </Button>
        </div>
      </Card>
    );
  }

  if (phase === 'recording_video') {
    return (
      <Card className="text-center">
        <h2 className="mb-4 font-serif text-2xl text-ink">A word from you</h2>
        {error && (
          <p className="mb-4 rounded-md bg-red-50 p-3 text-center font-sans text-sm text-red-700">
            {error}
          </p>
        )}
        {uploading ? (
          <p className="font-sans text-ink-400">Saving your video...</p>
        ) : (
          <VideoRecorder
            sessionId={sessionId}
            onDone={(videoUrl) => {
              void handleVideoDone(videoUrl);
            }}
            onStartUpload={startVideoUpload}
          />
        )}
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-5 flex items-start justify-between">
        <ProgressBar
          current={Math.min(questionIndex + 1, allQuestions.length)}
          total={remainingCount()}
        />
        <button
          onClick={handlePause}
          className="ml-4 rounded-md border border-warmgray-300 px-3 py-1.5 font-sans text-xs uppercase tracking-[0.08em] text-ink-500 transition hover:border-warmgray-400 hover:bg-paper-200"
        >
          Pause
        </button>
      </div>

      <VisualCompanion text={aiText} isSpeaking={isSpeaking} />

      {error && (
        <p className="mt-4 rounded-md bg-red-50 p-3 text-center font-sans text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-6 min-h-[80px]">
        {!recording && !uploading && (
          <div className="text-center">
            {textMode ? (
              <div className="space-y-4">
                <textarea
                  rows={4}
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  placeholder="Type your answer here..."
                  className="w-full rounded-md border border-warmgray-300 bg-paper-50 p-4 font-sans text-ink placeholder:text-warmgray-500 focus:border-oxblood focus:outline-none focus:ring-2 focus:ring-oxblood/20"
                />
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <Button onClick={submitTextAnswer} className="w-full sm:flex-1" loading={uploading}>
                    Submit answer
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setTextMode(false)}
                    className="w-full sm:flex-1"
                    disabled={uploading}
                  >
                    Use voice instead
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <Button onClick={startRecording} className="w-full">
                  Answer by voice
                </Button>
                {isMockMode && (
                  <Button
                    variant="secondary"
                    onClick={submitMockAnswer}
                    className="w-full"
                  >
                    Say my next answer
                  </Button>
                )}
                <button
                  onClick={() => setTextMode(true)}
                  className="font-sans text-sm text-ink-400 underline underline-offset-[3px] transition hover:text-oxblood"
                >
                  Type my answer instead
                </button>
              </div>
            )}
          </div>
        )}

        {recording && (
          <div className="text-center">
            <div className="mb-2 flex items-center justify-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-oxblood pulse-dot" />
              <span className="font-sans text-ink-400">Listening...</span>
            </div>
            {silencePrompt && (
              <p className="text-ink-500">Take your time. Whenever you&apos;re ready.</p>
            )}
            <VoiceRecorder
              onDone={(blob) => {
                void stopRecordingFlow(blob);
              }}
            />
          </div>
        )}

        {uploading && (
          <p className="text-center font-sans text-ink-400">
            Turning your voice into words...
          </p>
        )}
      </div>

      {!recording && !uploading && aiText && (
        <div className="mt-6 text-center">
          <Button onClick={advance} className="w-full sm:w-auto">
            Next
          </Button>
        </div>
      )}
    </Card>
  );
}
