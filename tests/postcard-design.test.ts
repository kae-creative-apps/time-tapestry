import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { postcardArtwork } from "../src/lib/collection/postcard-artwork";
import {
  POSTCARD_LAYOUT,
  renderPostcardDesign,
} from "../src/lib/collection/postcard-design";
import { assertPublicPostcardFits } from "../src/lib/collection/postcard-fit";
import { PUBLIC_POSTCARD_DEFAULTS } from "../src/lib/collection/postcard-public-message";
import type { Collection } from "../src/lib/collection/types";
import { GET as sample } from "../src/app/api/postcards/sample/route";

function privateCollection() {
  return {
    id: "postcard-design-test",
    status: "approved",
    recipientKey: "DO-NOT-PRINT-RECIPIENT-KEY",
    storyteller: {
      name: "Evelyn Example",
      email: "private-sender@example.com",
    },
    recipient: { name: "Anna Example", email: "private-recipient@example.com" },
    chapters: [
      {
        id: "q1",
        editorialReviewed: true,
        title: "PRIVATE-TITLE",
        postcardNote: "PRIVATE-EXCERPT",
        content: "PRIVATE-INTERVIEW",
      },
    ],
    chapterBlessings: { q1: { encouragement: "PRIVATE-BLESSING" } },
  } as unknown as Collection;
}

test("actual print artwork shares safe public text and first names, with exact approved art", async () => {
  const c = privateCollection();
  c.postcardPublicMessages = {
    q1: "You are loved. Keep making room for kindness.",
  };
  const { front, back } = await postcardArtwork(
    c,
    "q1",
    "https://stories.example.com",
  );
  assert.match(back, /Dear Anna,/);
  assert.match(front, /From Evelyn/);
  assert.match(back, /You are loved\. Keep making room for kindness\./);
  for (const html of [front, back]) {
    assert.doesNotMatch(
      html,
      /PRIVATE-|DO-NOT-PRINT|private-sender|private-recipient|Example/,
    );
    assert.match(html, /font\/ttf;base64,/);
    assert.match(html, /script-src 'none'/);
  }
  const thread = await readFile(
    "public/brand/time-tapestry-quiet-flowing-thread-v41.png",
  );
  assert.ok(
    front.includes(`data:image/png;base64,${thread.toString("base64")}`),
  );
  assert.match(back, /width:384px;height:228px/);
  assert.match(back, /Scan to open your story and reply/);
  assert.match(back, /Sign in with the email address linked to this gift/);
});

test("private title, notes and blessings do not affect the public print layout", async () => {
  const c = privateCollection();
  c.chapters[0].title = "W".repeat(500);
  c.chapters[0].postcardNote = "private ".repeat(1000);
  c.chapterBlessings.q1 = {
    encouragement: "private ".repeat(1000),
    scriptureText: "😀".repeat(500),
    scriptureReference: "private",
    scriptureTranslation: "private",
  };
  const { front, back } = await postcardArtwork(
    c,
    "q1",
    "https://stories.example.com",
  );
  assert.ok(back.includes(PUBLIC_POSTCARD_DEFAULTS.q1));
  assert.doesNotMatch(front + back, /PRIVATE-|😀/);
});

test("four public defaults and a full 240-character ordinary message fit without truncation", () => {
  const longest =
    "May you keep finding hope in small things, welcome the people beside you, and remember how deeply you are loved. "
      .repeat(3)
      .slice(0, 240);
  assert.equal(longest.length, 240);
  for (const publicMessage of [
    ...Object.values(PUBLIC_POSTCARD_DEFAULTS),
    ...[90, 91, 160, 161, 240].map((length) => longest.slice(0, length)),
  ])
    assert.doesNotThrow(() =>
      assertPublicPostcardFits({
        publicMessage,
        recipientFirstName: "Anna",
        storytellerFirstName: "Evelyn",
      }),
    );
  assert.throws(
    () =>
      assertPublicPostcardFits({
        publicMessage: "W".repeat(240),
        recipientFirstName: "Anna",
        storytellerFirstName: "Evelyn",
      }),
    /shorter print revision/,
  );
  assert.throws(
    () =>
      assertPublicPostcardFits({
        publicMessage: "Line\n".repeat(30),
        recipientFirstName: "Anna",
        storytellerFirstName: "Evelyn",
      }),
    /shorter print revision/,
  );
});

test("QR and back caption stay outside the official postal region; trim is exactly 6 by 9", () => {
  const layout = POSTCARD_LAYOUT;
  assert.equal(layout.width - layout.bleed * 2, 9 * 96);
  assert.equal(layout.height - layout.bleed * 2, 6 * 96);
  assert.ok(layout.qr.x + layout.qr.width < layout.postal.x);
  assert.ok(layout.caption.x + layout.caption.width < layout.postal.x);
  assert.ok(layout.note.bottom < layout.postal.y);
});

test("pure renderer escapes text and rejects external or injected asset references", () => {
  const content = {
    recipientFirstName: "<Anna>",
    storytellerFirstName: "Evelyn",
    publicMessage: '<script>"hello"</script>{code}',
  };
  const assets = {
    signaturePng: "data:image/png;base64,YQ==",
    signatureLightPng: "data:image/png;base64,YQ==",
    approvedThreadPng: "data:image/png;base64,YQ==",
    qrPng: "data:image/png;base64,YQ==",
    quicksandPrintTtf: "data:font/ttf;base64,YQ==",
  };
  const { front, back } = renderPostcardDesign(content, assets);
  assert.match(back, /Dear &lt;Anna&gt;,/);
  assert.match(
    back,
    /&lt;script&gt;&quot;hello&quot;&lt;\/script&gt;&#123;code&#125;/,
  );
  assert.doesNotMatch(front + back, /<script>/);
  assert.throws(
    () =>
      renderPostcardDesign(content, {
        ...assets,
        qrPng: "https://example.com/image.png",
      }),
    /embedded print assets/,
  );
});

test("public sample route ignores customer identifiers and returns the actual renderer's artwork", async () => {
  const response = await sample();
  assert.equal(response.status, 200);
  const artwork = await response.json();
  assert.match(artwork.back, /Dear Anna,/);
  assert.match(artwork.front, /From Evelyn/);
  assert.ok(artwork.back.includes(PUBLIC_POSTCARD_DEFAULTS.q1));
  assert.doesNotMatch(JSON.stringify(artwork), /SECRET|PRIVATE-NAME/);
  assert.match(artwork.back, /class="ink-free"/);
});
