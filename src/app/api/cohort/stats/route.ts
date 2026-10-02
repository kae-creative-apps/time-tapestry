import { NextRequest, NextResponse } from 'next/server';
import { listSessions } from '@/lib/session';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const sessions = await listSessions();
    const orgSessions = sessions.filter((s) => s.orgId === id);

    const stats = {
      total: orgSessions.length,
      created: orgSessions.filter((s) => s.status === 'created').length,
      interviewStarted: orgSessions.filter((s) => s.status === 'interview_started')
        .length,
      interviewComplete: orgSessions.filter((s) => s.status === 'interview_complete')
        .length,
      approved: orgSessions.filter((s) => s.status === 'approved').length,
      delivered: orgSessions.filter((s) => s.status === 'delivered').length
    };

    return NextResponse.json({ orgId: id, stats });
  } catch (err) {
    console.error('cohort/stats error', err);
    return NextResponse.json(
      { error: 'Cohort stats failed' },
      { status: 500 }
    );
  }
}
