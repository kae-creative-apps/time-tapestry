/** Completes the real browser-bound account flow using synthetic mail captured in memory. */
const sessions = new Map<string, string>();
export async function verifiedRecipientCookie(email: string) {
  const key = `${process.env.COLLECTION_DATA_DIR}:${email.toLowerCase()}`;
  if (sessions.has(key)) return sessions.get(key)!;
  const service = await import("../src/lib/accounts/service");
  const previousOrigin = process.env.NEXT_PUBLIC_APP_URL;
  // Production sign-in correctly rejects localhost. This synthetic mail flow
  // needs its own secure origin without changing the caller's API environment.
  process.env.NEXT_PUBLIC_APP_URL = "https://recipient-fixture.example.test";
  try {
    const nonce = service.randomCredential();
    let token = "";
    await service.beginAccountLogin(email, nonce, {
      sendMail: async ({ url }) => {
        token = new URLSearchParams(new URL(url).hash.slice(1)).get("token")!;
      },
    });
    const result = await service.confirmAccountLogin(token, nonce);
    const cookie = `tt_account_session=${result.sessionToken}`;
    sessions.set(key, cookie);
    return cookie;
  } finally {
    if (previousOrigin === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previousOrigin;
  }
}
