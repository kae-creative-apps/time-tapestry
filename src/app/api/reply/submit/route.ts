import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSession } from '@/lib/session';

export async function POST(req: NextRequest) {
  try {
    const { sessionId, type, content, mediaBase64 } = await req.json();
    if (!sessionId || !type || !content) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const session = await getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const mediaUrl = mediaBase64
      ? `data:audio/webm;base64,${mediaBase64}`
      : undefined;

    await updateSession(sessionId, (s) => ({
      ...s,
      status: 'delivered',
      grandchildReply: {
        type,
        content,
        mediaUrl,
        submittedAt: new Date().toISOString()
      }
    }));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('reply/submit error', err);
    return NextResponse.json({ error: 'Reply failed' }, { status: 500 });
  }
}
