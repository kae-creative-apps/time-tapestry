import { SecurityError } from "../security/policy";
export type AccountMail = { email: string; url: string; tokenId: string };
export type AccountMailer = (message: AccountMail) => Promise<void>;
export function accountOrigin() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_APP_URL || "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new SecurityError(
      "Account email needs a configured secure website address before sign-in can begin.",
      503,
    );
  }
}
export function accountEmailAvailable() {
  try {
    accountOrigin();
    return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
  } catch {
    return false;
  }
}
export function requireAccountMail() {
  if (!accountEmailAvailable())
    throw new SecurityError(
      "Email sign-in is not connected yet. Keep using your saved private story link until the team finishes email setup.",
      503,
    );
}
export const sendAccountLink: AccountMailer = async ({
  email,
  url,
  tokenId,
}) => {
  requireAccountMail();
  const link = new URL(url);
  if (link.origin !== accountOrigin() || link.pathname !== "/account/verify")
    throw new SecurityError(
      "This sign-in link could not be prepared safely.",
      503,
    );
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Idempotency-Key": `account-login/${tokenId}`,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL,
        to: [email],
        subject: "Your Time Tapestry sign-in link",
        text: `Open your Time Tapestry account:\n\n${url}\n\nThis link expires in 15 minutes and works once. Open it in the same browser where you requested it, then confirm the email shown on the page.\n\nIf you did not request this, you can ignore this email. Your stories have not been changed.\n\nTime Tapestry | Stories woven together`,
      }),
      signal: AbortSignal.timeout(12000),
      redirect: "error",
    });
  } catch {
    throw new SecurityError(
      "We could not confirm your sign-in email was sent. Please request a new link in a moment.",
      503,
    );
  }
  if (!response.ok)
    throw new SecurityError(
      "Your sign-in email could not be sent right now. Please request a new link in a moment.",
      503,
    );
  let result: { id?: unknown };
  try {
    result = await response.json();
  } catch {
    throw new SecurityError(
      "We could not confirm your sign-in email was accepted. Please request a new link.",
      503,
    );
  }
  if (typeof result.id !== "string" || !result.id)
    throw new SecurityError(
      "We could not confirm your sign-in email was accepted. Please request a new link.",
      503,
    );
};
