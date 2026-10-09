import { Resend } from "resend";
import { brandedEmail, emailLogoSrc } from "./email-layout";

const apiKey = process.env.RESEND_API_KEY;
export const fromEmail =
  process.env.RESEND_FROM_EMAIL || "noreply@timetapestry.app";
export const appUrl =
  process.env.NEXT_PUBLIC_APP_URL || "https://timetapestry.app";

export const resend = apiKey ? new Resend(apiKey) : null;

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

const mockOutbox: Array<{ to: string; subject: string }> = [];

/** Test-only record of messages that were not handed to Resend. */
export function mockOutboxSnapshot() {
  return mockOutbox.map((item) => ({ ...item }));
}

export function clearMockOutbox() {
  mockOutbox.length = 0;
}

export async function sendEmail({ to, subject, html, text }: EmailOptions) {
  if (process.env.RESEND_TEST_FAIL === "1")
    return { success: false, error: { message: "Mailbox unavailable" } };
  if (!resend) {
    mockOutbox.push({ to, subject });
    console.log("[EMAIL - MOCK MODE]", { to, subject });
    return { success: true, mock: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
      text: text || stripHtml(html),
    });

    if (error) {
      console.error("[EMAIL ERROR]", error);
      return { success: false, error };
    }

    return { success: true, id: data?.id };
  } catch (error) {
    console.error("[EMAIL EXCEPTION]", error);
    return { success: false, error };
  }
}

function logoSrc() {
  return emailLogoSrc(appUrl);
}

export function donorInvitationEmail(
  donorName: string,
  organizationName: string,
  interviewUrl: string,
  recipientName?: string,
) {
  const withRecipient = recipientName?.trim()
    ? ` with ${recipientName.trim()}`
    : "";
  const subject = `${organizationName} invited you to share the story of your generosity`;
  return {
    subject,
    ...brandedEmail({
      title: subject,
      logoSrc: logoSrc(),
      greeting: `Dear ${donorName},`,
      paragraphs: [
        `${organizationName} invited you to share the story of your generosity${withRecipient}.`,
        "A short conversation about why you give.",
      ],
      action: { href: interviewUrl, label: "Start your conversation" },
    }),
  };
}

export function invitationEmail(
  grandparentName: string,
  grandchildName: string,
  interviewUrl: string,
) {
  const subject = `${grandchildName} invited you to share your story`;
  return {
    subject,
    ...brandedEmail({
      title: subject,
      logoSrc: logoSrc(),
      greeting: `Dear ${grandparentName},`,
      paragraphs: [
        `${grandchildName} invited you to share your story.`,
        "A short conversation about your life and generosity.",
      ],
      action: { href: interviewUrl, label: "Start your conversation" },
    }),
  };
}

export function storyReadyEmail(
  grandchildName: string,
  grandparentName: string,
  keepsakeUrl: string,
) {
  const subject = `${grandparentName} has shared a story with you`;
  return {
    subject,
    ...brandedEmail({
      title: subject,
      logoSrc: logoSrc(),
      greeting: `Dear ${grandchildName},`,
      paragraphs: [
        `${grandparentName} has shared a story with you.`,
        "It takes a few minutes to read.",
      ],
      action: { href: keepsakeUrl, label: "Read their story" },
    }),
  };
}

export function nudgeEmail(
  grandchildName: string,
  grandparentName: string,
  keepsakeUrl: string,
) {
  const subject = `A reminder about ${grandparentName}'s story`;
  return {
    subject,
    ...brandedEmail({
      title: subject,
      logoSrc: logoSrc(),
      greeting: `Dear ${grandchildName},`,
      paragraphs: [
        `${grandparentName} shared a story with you.`,
        "No reply is needed. They would love to hear from you.",
      ],
      action: { href: keepsakeUrl, label: "Read their story" },
    }),
  };
}
