import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { appUrl, nudgeEmail, sendEmail } from '@/lib/resend-client';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sessionId = body.sessionId;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing sessionId' },
        { status: 400 }
      );
    }

    const session = await getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    if (!session.grandchild.email) {
      return NextResponse.json(
        { error: 'Grandchild email is missing' },
        { status: 400 }
      );
    }

    const { subject, html } = nudgeEmail(
      session.grandchild.name,
      session.grandparent.name,
      `${appUrl}/keepsake/${session.id}`
    );

    const emailResult = await sendEmail({
      to: session.grandchild.email,
      subject,
      html,
    });

    console.log('[email/nudge] nudge email result:', emailResult);

    return NextResponse.json({ success: true, result: emailResult });
  } catch (err) {
    console.error('email/nudge error', err);
    return NextResponse.json(
      { error: 'Failed to send nudge email' },
      { status: 500 }
    );
  }
}
