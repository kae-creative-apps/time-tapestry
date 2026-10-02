import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getSession, updateSession } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    const { sessionId, videoBase64, contentType, filename } = await request.json();

    if (!sessionId || !videoBase64) {
      return NextResponse.json({ error: 'Missing sessionId or videoBase64' }, { status: 400 });
    }

    const session = await getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // deliberate: legacy fallback for small videos when direct browser upload is unavailable
    const base64Data = videoBase64.replace(/^data:video\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const blob = new Blob([buffer], { type: contentType || 'video/webm' });

    const blobResult = await put(
      `videos/${sessionId}-${Date.now()}.webm`,
      blob,
      {
        access: 'public',
        contentType: contentType || 'video/webm',
        token: process.env.BLOB_READ_WRITE_TOKEN
      }
    );

    await updateSession(sessionId, (s) => ({ ...s, videoUrl: blobResult.url }));

    return NextResponse.json({
      success: true,
      videoUrl: blobResult.url,
      size: blob.size
    });
  } catch (error) {
    console.error('[video/upload] error:', error);
    return NextResponse.json(
      { error: 'Video upload failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
