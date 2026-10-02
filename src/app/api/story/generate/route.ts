import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSession } from '@/lib/session';
import { generateStoryFromTranscript } from '@/lib/story-engine';
import { appUrl, sendEmail, storyReadyEmail } from '@/lib/resend-client';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(async () => {
      const form = await req.formData();
      return Object.fromEntries(form.entries());
    });
    const sessionId = body.sessionId;
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing sessionId' },
        { status: 400 }
      );
    }

    const session = await getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const transcriptText = session.interview.transcript
      .filter((t) => t.role === 'grandparent')
      .map((t) => t.content)
      .join('\n\n');

    const generated = generateStoryFromTranscript(transcriptText);

    const updated = await updateSession(sessionId, (s) => ({
      ...s,
      status: 'approved',
      story: {
        ...generated,
        generatedAt: new Date().toISOString(),
        approvedAt: new Date().toISOString()
      },
      interview: {
        ...s.interview,
        completedAt: new Date().toISOString()
      }
    }));

    if (updated && updated.grandchild.email) {
      const { subject, html } = storyReadyEmail(
        updated.grandchild.name,
        updated.grandparent.name,
        `${appUrl}/keepsake/${updated.id}`
      );
      const emailResult = await sendEmail({
        to: updated.grandchild.email,
        subject,
        html,
      });
      console.log('[story/generate] story ready email result:', emailResult);
    }

    return NextResponse.redirect(
      new URL(`/keepsake/${sessionId}`, req.url),
      303
    );
  } catch (err) {
    console.error('story/generate error', err);
    return NextResponse.json(
      { error: 'Story generation failed' },
      { status: 500 }
    );
  }
}
