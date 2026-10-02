import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import {
  getAdminTokenFromRequest,
  verifyAdminToken
} from '@/lib/admin-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getAdminTokenFromRequest(request);
  if (!verifyAdminToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const session = await getSession(id);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    return NextResponse.json({ session });
  } catch (error) {
    console.error('Error reading session:', error);
    return NextResponse.json({ error: 'Failed to read session' }, { status: 500 });
  }
}
