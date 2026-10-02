import { NextRequest, NextResponse } from 'next/server';
import { createSession, InitiationPath } from '@/lib/session';
import { appUrl, invitationEmail, sendEmail } from '@/lib/resend-client';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { initiationPath, grandchild, grandparent, familyId, familyName, invite } = body;

    if (!initiationPath || !grandchild?.name || !grandparent?.name) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const session = await createSession({
      initiationPath: initiationPath as InitiationPath,
      grandchild: {
        name: grandchild.name,
        email: grandchild.email || ''
      },
      grandparent: {
        name: grandparent.name,
        email: grandparent.email || ''
      },
      familyId: familyId || undefined,
      familyName: familyName || undefined,
      invite: invite
        ? {
            name: invite.name || '',
            email: invite.email || '',
            note: invite.note || ''
          }
        : undefined
    });

    if (session.initiationPath === 'request' && session.grandparent.email) {
      const { subject, html } = invitationEmail(
        session.grandparent.name,
        session.grandchild.name,
        `${appUrl}/interview/${session.id}`
      );
      const emailResult = await sendEmail({
        to: session.grandparent.email,
        subject,
        html,
      });
      console.log('[session/create] invitation email result:', emailResult);
    }

    return NextResponse.json({ session }, { status: 201 });
  } catch (err) {
    console.error('session/create error', err);
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    );
  }
}
