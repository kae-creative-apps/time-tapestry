import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSession } from '@/lib/session';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(async () => {
      const form = await req.formData();
      return Object.fromEntries(form.entries());
    });
    const { sessionId, videoBase64 } = body;
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

    const videoUrl = videoBase64
      ? `data:video/webm;base64,${videoBase64}`
      : 'mock:video-url';

    await updateSession(sessionId, (s) => ({
      ...s,
      videoUrl
    }));

    return NextResponse.json({ videoUrl });
  } catch (err) {
    console.error('video/upload error', err);
    return NextResponse.json({ error: 'Video upload failed' }, { status: 500 });
  }
}
