import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';

const codes = new Map<string, string>();

export async function POST(req: NextRequest) {
  try {
    const { orgName, code, emails } = await req.json();

    if (orgName) {
      const newCode = nanoid(8).toUpperCase();
      codes.set(newCode, orgName);
      return NextResponse.json({ code: newCode, orgName });
    }

    if (code && emails) {
      console.log('[MOCK ORG] Prepare invitations', { code, emails });
      return NextResponse.json({ success: true, code, count: emails.length });
    }

    return NextResponse.json(
      { error: 'Provide orgName or code+emails' },
      { status: 400 }
    );
  } catch (err) {
    console.error('org/codes error', err);
    return NextResponse.json(
      { error: 'Organization code request failed' },
      { status: 500 }
    );
  }
}
