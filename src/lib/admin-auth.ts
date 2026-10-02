import { NextRequest } from 'next/server';

const ADMIN_COOKIE = 'admin_token';

export function getAdminSecret(): string {
  return process.env.ADMIN_SECRET ?? '';
}

export function verifyAdminToken(token: string | undefined): boolean {
  if (!token) return false;
  const secret = getAdminSecret();
  if (!secret) return false;
  return token === secret;
}

export function getAdminTokenFromRequest(request: NextRequest): string | undefined {
  return (
    request.cookies.get(ADMIN_COOKIE)?.value ||
    request.nextUrl.searchParams.get('admin_token') ||
    undefined
  );
}

export function adminUnauthorizedResponse(): Response {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
