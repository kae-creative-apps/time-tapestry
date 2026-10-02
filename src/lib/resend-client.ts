import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY;
export const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@timetapestry.app';
export const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://timetapestry.app';

export const resend = apiKey ? new Resend(apiKey) : null;

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

export async function sendEmail({ to, subject, html, text }: EmailOptions) {
  if (!resend) {
    console.log('[EMAIL - MOCK MODE]', { to, subject });
    console.log('Text:', text || stripHtml(html));
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
      console.error('[EMAIL ERROR]', error);
      return { success: false, error };
    }

    return { success: true, id: data?.id };
  } catch (error) {
    console.error('[EMAIL EXCEPTION]', error);
    return { success: false, error };
  }
}

function emailShell(title: string, bodyHtml: string) {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
      body { font-family: Georgia, 'Times New Roman', serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #faf6ef; color: #3a3530; }
      h1 { font-size: 28px; line-height: 1.3; margin-bottom: 24px; font-weight: normal; }
      p { font-size: 18px; line-height: 1.6; margin-bottom: 16px; }
      .button { display: inline-block; background: #7a2e2e; color: #faf6ef; padding: 16px 32px; text-decoration: none; border-radius: 4px; font-size: 18px; margin: 24px 0; }
      .footer { font-size: 14px; color: #8a7e6e; margin-top: 40px; border-top: 1px solid #d4ccc0; padding-top: 20px; }
    </style>
  </head>
  <body>
    ${bodyHtml}
    <div class="footer">
      <p>Time Tapestry ... Weaving the stories that matter.</p>
    </div>
  </body>
</html>`;
}

export function invitationEmail(grandparentName: string, grandchildName: string, interviewUrl: string) {
  const subject = `${grandchildName} has asked you to share your story`;
  const html = emailShell(
    subject,
    `<h1>Dear ${grandparentName},</h1>
    <p>${grandchildName} has asked you to share your story ... the story of your life, your values, and the generosity that shaped you.</p>
    <p>When you're ready, simply click the link below. I'll be here to ask you a few questions, one at a time. Speak naturally. Take as long as you'd like.</p>
    <p style="text-align: center;">
      <a href="${interviewUrl}" class="button">Begin your story</a>
    </p>
    <p>If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="word-break: break-all; font-size: 14px;">${interviewUrl}</p>
    <p>With care,<br>The Time Tapestry team</p>`
  );
  return { subject, html };
}

export function storyReadyEmail(grandchildName: string, grandparentName: string, keepsakeUrl: string) {
  const subject = `${grandparentName} has shared a story with you`;
  const html = emailShell(
    subject,
    `<h1>Dear ${grandchildName},</h1>
    <p>${grandparentName} has shared a story with you ... a story about their life, their values, and the generosity that shaped them.</p>
    <p>It takes a few minutes to read. When you're ready, click below.</p>
    <p style="text-align: center;">
      <a href="${keepsakeUrl}" class="button">Read their story</a>
    </p>
    <p>If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="word-break: break-all; font-size: 14px;">${keepsakeUrl}</p>`
  );
  return { subject, html };
}

export function nudgeEmail(grandchildName: string, grandparentName: string, keepsakeUrl: string) {
  const subject = `A reminder about ${grandparentName}'s story`;
  const html = emailShell(
    subject,
    `<p>Dear ${grandchildName},</p>
    <p>A few weeks ago, ${grandparentName} shared a story with you. No response is needed, but they'd love to hear from you.</p>
    <p style="text-align: center;">
      <a href="${keepsakeUrl}" class="button">Read their story</a>
    </p>`
  );
  return { subject, html };
}
