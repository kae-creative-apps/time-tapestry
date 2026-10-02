import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSession } from '@/lib/session';
import { mockTranscribe, transcribeAudio } from '@/lib/whisper-client';
import { chat } from '@/lib/gloo-client';
import { interviewerSystemPrompt } from '@/prompts/interviewer-system';
import {
  CORE_QUESTIONS,
  OPTIONAL_QUESTIONS,
  detectPauseIntent,
  detectStopIntent
} from '@/lib/interview-state';

export async function POST(req: NextRequest) {
  try {
    const { sessionId, questionIndex, audioBase64: rawAudioBase64, mimeType } = await req.json();
    if (!sessionId || questionIndex === undefined) {
      return NextResponse.json(
        { error: 'Missing sessionId or questionIndex' },
        { status: 400 }
      );
    }

    const session = await getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const audioBase64 = rawAudioBase64 as string | undefined;
    const audioBlob = audioBase64
      ? new Blob(
          [Buffer.from(audioBase64.split(',')[1] ?? audioBase64, 'base64')],
          { type: mimeType || 'audio/webm' }
        )
      : null;
    const transcript = audioBlob
      ? await transcribeAudio(audioBlob)
      : await mockTranscribe();

    if (detectPauseIntent(transcript) || detectStopIntent(transcript)) {
      await updateSession(sessionId, (s) => ({
        ...s,
        interview: {
          ...s.interview,
          currentQuestion: questionIndex,
          transcript: [
            ...s.interview.transcript,
            { role: 'grandparent' as const, content: transcript, timestamp: new Date().toISOString() }
          ]
        }
      }));
      return NextResponse.json({
        transcript,
        aiResponse: 'I have saved your place. Come back whenever you are ready.',
        paused: true
      });
    }

    const allQuestions = [...CORE_QUESTIONS, ...OPTIONAL_QUESTIONS];
    const question = allQuestions[questionIndex];
    const questionText = question?.text.replace(
      /\[grandchildName\]/g,
      session.grandchild.name
    );

    const messages = [
      { role: 'system', content: interviewerSystemPrompt },
      { role: 'assistant', content: questionText || '' },
      { role: 'user', content: transcript }
    ];

    const response: any = await chat(messages);
    const aiResponse =
      response?.choices?.[0]?.message?.content ||
      'Thank you for sharing that. Take your time. I am listening.';

    await updateSession(sessionId, (s) => ({
      ...s,
      status: 'interview_started',
      interview: {
        ...s.interview,
        currentQuestion: questionIndex,
        startedAt: s.interview.startedAt || new Date().toISOString(),
        transcript: [
          ...s.interview.transcript,
          { role: 'ai' as const, content: questionText || '', timestamp: new Date().toISOString() },
          { role: 'grandparent' as const, content: transcript, timestamp: new Date().toISOString() },
          { role: 'ai' as const, content: aiResponse, timestamp: new Date().toISOString() }
        ]
      }
    }));

    const isMock = !process.env.GLOO_API_KEY || !process.env.OPENAI_API_KEY;
    return NextResponse.json({ transcript, aiResponse, mimeType, mock: isMock });
  } catch (err) {
    console.error('interview/turn error', err);
    return NextResponse.json(
      { error: 'Interview turn failed' },
      { status: 500 }
    );
  }
}
