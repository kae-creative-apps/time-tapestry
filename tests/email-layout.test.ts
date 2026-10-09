import assert from "node:assert/strict";
import test from "node:test";
import {
  brandedEmail,
  htmlShowsRawUrl,
} from "../src/lib/email-layout";
import {
  donorInvitationEmail,
  invitationEmail,
  storyReadyEmail,
} from "../src/lib/resend-client";

const joinUrl =
  "https://timetapestry.app/join/bbfe6b76-3dfc-463e-b1c1-84b003b444e5.preview";

test("donor invite HTML is short, high-contrast, and hides the raw join URL", () => {
  const mail = donorInvitationEmail(
    "Kaelyn",
    "QUINN",
    joinUrl,
    "Tayloe",
  );
  assert.match(mail.subject, /QUINN invited you to share the story of your generosity/);
  assert.match(mail.html, /Dear Kaelyn,/);
  assert.match(
    mail.html,
    /QUINN invited you to share the story of your generosity with Tayloe\./,
  );
  assert.match(mail.html, /A short conversation about why you give\./);
  assert.doesNotMatch(mail.html, /gift amounts/i);
  assert.doesNotMatch(mail.html, /pilot/i);
  assert.doesNotMatch(mail.html, /capture/i);
  assert.doesNotMatch(mail.html, /tell the story/);
  assert.match(mail.html, /bgcolor="#432e23"/);
  assert.match(mail.html, /color:#ffffff !important/);
  assert.match(mail.html, /font-weight:bold/);
  assert.match(mail.html, /text-decoration:none !important/);
  assert.match(mail.html, />Start your conversation</);
  assert.match(mail.html, />Open link</);
  assert.match(mail.html, /max-width:600px/);
  assert.equal(htmlShowsRawUrl(mail.html, joinUrl), false);
  assert.match(mail.text, new RegExp(joinUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(mail.text, /Start your conversation:/);
});

test("shared story emails keep the same button and Open link fallback", () => {
  const invite = invitationEmail("Alex", "Sam", joinUrl);
  assert.match(invite.html, /Sam invited you to share your story\./);
  assert.match(invite.html, /color:#ffffff !important/);
  assert.equal(htmlShowsRawUrl(invite.html, joinUrl), false);
  assert.match(invite.text, /https:\/\/timetapestry\.app\/join\//);
  const ready = storyReadyEmail("Sam", "Alex", "https://timetapestry.app/collection/example");
  assert.match(ready.html, /Read their story/);
  assert.match(ready.html, />Open link</);
});

test("branded email keeps the destination on the button without showing it", () => {
  const href = "https://timetapestry.app/collection/example?key=secret";
  const mail = brandedEmail({
    title: "Review your stories",
    logoSrc: "https://timetapestry.app/brand/time-tapestry-lockup.png",
    paragraphs: ["Your stories are ready."],
    action: { href, label: "Review your stories" },
  });
  assert.match(mail.html, /href="https:\/\/timetapestry\.app\/collection\/example\?key=secret"/);
  assert.equal(htmlShowsRawUrl(mail.html, href), false);
  assert.match(mail.text, /\?key=secret/);
});
