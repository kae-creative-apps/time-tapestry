import { BRAND_COLORS } from "./brand-art";

const ESPRESSO = BRAND_COLORS.espresso;
const PAPER = BRAND_COLORS.paper;
const TAUPE = BRAND_COLORS.taupe;
const WHITE = "#ffffff";
const FONT = "Arial, Helvetica, sans-serif";

export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) =>
    character === "&"
      ? "&amp;"
      : character === "<"
        ? "&lt;"
        : character === ">"
          ? "&gt;"
          : character === '"'
            ? "&quot;"
            : "&#39;",
  );
}

function visibleHref(html: string) {
  return html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, " ").replace(/<[^>]+>/g, " ");
}

/** Visible HTML must not show the raw destination URL. */
export function htmlShowsRawUrl(html: string, href: string) {
  return visibleHref(html).includes(href);
}

export type BrandedEmail = {
  title: string;
  logoSrc: string;
  greeting?: string;
  paragraphs: string[];
  action: { href: string; label: string };
  openLinkLabel?: string;
  footer?: string;
};

function actionButton(href: string, label: string) {
  const safeHref = escapeEmailHtml(href);
  const safeLabel = escapeEmailHtml(label);
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 8px;">
              <tr>
                <td align="center" bgcolor="${ESPRESSO}" class="email-btn" style="background-color:${ESPRESSO};border-radius:12px;">
                  <a href="${safeHref}" class="email-btn-label" style="display:inline-block;padding:16px 32px;font-family:${FONT};font-size:18px;line-height:22px;font-weight:bold;color:${WHITE} !important;text-decoration:none !important;border-radius:12px;background-color:${ESPRESSO};">${safeLabel}</a>
                </td>
              </tr>
            </table>`;
}

export function brandedEmail({
  title,
  logoSrc,
  greeting,
  paragraphs,
  action,
  openLinkLabel = "Open link",
  footer = "Time Tapestry · Stories woven together",
}: BrandedEmail) {
  const body = paragraphs.map((paragraph) => paragraph.trim()).filter(Boolean);
  const safeTitle = escapeEmailHtml(title);
  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${safeTitle}</title>
    <style>
      :root { color-scheme: light dark; }
      @media (prefers-color-scheme: dark) {
        .email-bg { background-color: #1c1410 !important; }
        .email-card { background-color: ${PAPER} !important; }
        .email-text, .email-greeting { color: ${ESPRESSO} !important; }
        .email-muted, .email-muted a { color: ${TAUPE} !important; }
        .email-btn { background-color: ${ESPRESSO} !important; }
        .email-btn-label { background-color: ${ESPRESSO} !important; color: ${WHITE} !important; }
      }
    </style>
  </head>
  <body class="email-bg" style="margin:0;padding:0;background-color:${PAPER};">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="email-bg" style="background-color:${PAPER};">
      <tr>
        <td align="center" style="padding:24px 16px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="email-card" style="width:100%;max-width:600px;background-color:${PAPER};">
            <tr>
              <td style="padding:8px 8px 0;font-family:${FONT};color:${ESPRESSO};">
                <img src="${escapeEmailHtml(logoSrc)}" alt="Time Tapestry" width="190" height="57" style="display:block;width:190px;max-width:70%;height:auto;margin:0 0 28px;border:0;">
                ${
                  greeting
                    ? `<p class="email-greeting" style="margin:0 0 16px;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:bold;color:${ESPRESSO};">${escapeEmailHtml(greeting)}</p>`
                    : ""
                }
                ${body
                  .map(
                    (paragraph) =>
                      `<p class="email-text" style="margin:0 0 12px;font-family:${FONT};font-size:16px;line-height:1.55;color:${ESPRESSO};">${escapeEmailHtml(paragraph)}</p>`,
                  )
                  .join("")}
                ${actionButton(action.href, action.label)}
                <p class="email-muted" style="margin:20px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;color:${TAUPE};">
                  <a href="${escapeEmailHtml(action.href)}" style="color:${TAUPE};text-decoration:underline;">${escapeEmailHtml(openLinkLabel)}</a>
                </p>
                <p class="email-muted" style="margin:32px 0 0;padding-top:20px;border-top:1px solid #e5e2db;font-family:${FONT};font-size:13px;line-height:1.5;color:${TAUPE};">${escapeEmailHtml(footer)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  const text = [
    greeting,
    "",
    ...body,
    "",
    `${action.label}:`,
    action.href,
    "",
    footer,
  ]
    .filter((line) => line !== undefined)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { html, text };
}

export function emailLogoSrc(origin: string) {
  return `${origin.replace(/\/$/, "")}/brand/time-tapestry-lockup.png`;
}
