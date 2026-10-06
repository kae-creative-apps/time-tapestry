import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import {
  renderStoryBook,
  storyBookSnapshot,
  StoryBookError,
  wrapBookText,
} from "../src/lib/collection/story-book";
import { syntheticFilmCollection } from "./film-fixture";

/** Decode the embedded font's Unicode mapping, including ligatures. */
async function readPdf(bytes: Uint8Array) {
  const document = await PDFDocument.load(bytes);
  const streams = document.context
    .enumerateIndirectObjects()
    .flatMap(([, object]) =>
      object instanceof PDFRawStream
        ? [Buffer.from(decodePDFRawStream(object).decode()).toString("utf8")]
        : [],
    );
  const mapping = new Map<string, string>();
  for (const stream of streams.filter((value) => value.includes("begincmap"))) {
    for (const block of stream.matchAll(
      /beginbfchar\s+([\s\S]*?)\s+endbfchar/g,
    )) {
      for (const pair of block[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>/gi)) {
        mapping.set(
          pair[1].toUpperCase(),
          pair[2]
            .match(/.{4}/g)!
            .map((unit) => String.fromCharCode(parseInt(unit, 16)))
            .join(""),
        );
      }
    }
  }
  const lines = streams.flatMap((stream) =>
    [...stream.matchAll(/<([0-9a-f]+)>\s+Tj/gi)].map((match) =>
      match[1]
        .match(/.{4}/g)!
        .map((code) => mapping.get(code.toUpperCase()) ?? "")
        .join(""),
    ),
  );
  return {
    document,
    text: lines
      .filter(
        (line) =>
          !/^TIME TAPESTRY  \/  STORY \d+$/.test(line) &&
          !/^\d+ \/ \d+$/.test(line),
      )
      .join(" ")
      .replace(/\s+/g, " "),
  };
}

test("the printable book contains the cover and all four complete approved chapters without private data", async () => {
  const c = syntheticFilmCollection();
  c.status = "approved";
  c.storyteller.name = "Élodie O’Connor";
  c.recipient.name = "Primary recipient not selected";
  c.invitationNote = "PRIVATE INVITATION";
  c.chapterBlessings.q1 = {
    encouragement: "Keep making room for kindness.",
    scriptureReference: "John 13:34",
    scriptureText: "",
    scriptureTranslation: "",
  };
  const snapshot = storyBookSnapshot(c, "André Example");
  assert.deepEqual(Object.keys(snapshot), [
    "storytellerName",
    "recipientName",
    "chapters",
  ]);
  assert.equal(snapshot.chapters.length, 4);
  const bytes = await renderStoryBook(snapshot);
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), "%PDF-");
  const { document, text } = await readPdf(bytes);
  assert.equal(document.getPageCount(), 5);
  assert.match(text, /From Élodie O’Connor/);
  assert.match(text, /For André Example/);
  for (const chapter of c.chapters) {
    assert.ok(text.includes(chapter.title));
    assert.ok(
      text.includes(chapter.content),
      `Complete text for ${chapter.id}`,
    );
  }
  assert.match(text, /Keep making room for kindness/);
  for (const privateValue of [
    c.ownerKey,
    c.recipientKey,
    c.requesterKey,
    c.storyteller.email,
    c.recipient.email,
    c.invitationNote,
    c.recipient.name,
  ])
    assert.equal(text.includes(privateValue), false);
  assert.equal(document.getAuthor(), "Time Tapestry");
});

test("long stories paginate completely, including the last paragraph", async () => {
  const c = syntheticFilmCollection();
  c.status = "approved";
  const paragraph =
    "I remember the friends who made time for me. We shared meals, listened closely, and learned to offer that same care to someone else.";
  c.chapters[0].content = `${Array(75).fill(paragraph).join("\n\n")}\nThe last memory stays here too.`;
  const { document, text } = await readPdf(
    await renderStoryBook(storyBookSnapshot(c, c.recipient.name)),
  );
  assert.ok(document.getPageCount() > 8);
  assert.equal(text.split(paragraph).length - 1, 75);
  assert.match(text, /The last memory stays here too\./);
  for (const chapter of c.chapters.slice(1))
    assert.ok(text.includes(chapter.content));
});

test("wrapping preserves long words and unsupported characters fail clearly rather than disappear", async () => {
  const source = `Beginning ${"a".repeat(300)} ending`;
  const wrapped = wrapBookText(source, 20, (text) => text.length);
  assert.ok(wrapped.every((line) => line.length <= 20));
  assert.equal(wrapped.join("").replace(/\s/g, ""), source.replace(/\s/g, ""));
  const c = syntheticFilmCollection();
  c.status = "approved";
  c.chapters[0].content += " 🧵";
  await assert.rejects(
    renderStoryBook(storyBookSnapshot(c, c.recipient.name)),
    (error: unknown) =>
      error instanceof StoryBookError && /U\+1F9F5/.test(error.message),
  );
});

test("draft or incomplete collections cannot become a downloadable book", () => {
  const c = syntheticFilmCollection();
  assert.throws(
    () => storyBookSnapshot(c, c.recipient.name),
    /after the collection is approved/,
  );
  c.status = "approved";
  c.chapters[3].content = "";
  assert.throws(
    () => storyBookSnapshot(c, c.recipient.name),
    /All four approved stories/,
  );
});

test("book downloads require approved owner or verified recipient access and personalize only the matching recipient", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tapestry-book-"));
  const prior = { ...process.env };
  for (const key of ["VERCEL", "KV_REST_API_URL", "KV_REST_API_TOKEN"])
    delete process.env[key];
  Object.assign(process.env, {
    NODE_ENV: "test",
    COLLECTION_DATA_DIR: directory,
    NEXT_PUBLIC_APP_URL: "https://book.example.test",
  });
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("No provider calls are allowed for a book download.");
  });
  const store = await import("../src/lib/collection/store");
  const accounts = await import("../src/lib/accounts/service");
  const { GET } = await import("../src/app/api/collection/[id]/book/route");
  const c = syntheticFilmCollection();
  c.status = "approved";
  c.additionalRecipients = [
    {
      id: "extra_member_123",
      name: "Jordan Example",
      email: "jordan@example.test",
      invitedAt: c.createdAt,
    },
  ];
  const login = async (email: string) => {
    const nonce = accounts.randomCredential();
    let token = "";
    await accounts.beginAccountLogin(email, nonce, {
      sendMail: async ({ url }) => {
        token = new URLSearchParams(new URL(url).hash.slice(1)).get("token")!;
      },
    });
    return (await accounts.confirmAccountLogin(token, nonce)).sessionToken;
  };
  const get = (key = "", token = "") =>
    GET(
      new NextRequest(
        `https://book.example.test/api/collection/${c.id}/book${key ? `?key=${key}` : ""}`,
        {
          headers: token ? { cookie: `tt_account_session=${token}` } : {},
        },
      ),
      { params: Promise.resolve({ id: c.id }) },
    );
  try {
    await store.putCollection(c);
    assert.equal((await get()).status, 403);
    assert.equal(
      (await get(c.recipientKey)).status,
      403,
      "A QR or old recipient key is not authorization.",
    );
    assert.equal((await get(c.requesterKey)).status, 403);
    assert.equal(
      (await get("", await login("stranger@example.test"))).status,
      403,
    );
    const owner = await get(c.ownerKey);
    assert.equal(owner.status, 200);
    assert.equal(owner.headers.get("Content-Type"), "application/pdf");
    assert.match(owner.headers.get("Content-Disposition")!, /^attachment;/);
    assert.equal(owner.headers.get("Cache-Control"), "private, no-store");
    const ownerBook = await readPdf(new Uint8Array(await owner.arrayBuffer()));
    assert.ok(ownerBook.text.includes(`For ${c.recipient.name}`));
    const extraToken = await login("jordan@example.test");
    const recipient = await get("", extraToken);
    assert.equal(recipient.status, 200);
    const recipientBook = await readPdf(
      new Uint8Array(await recipient.arrayBuffer()),
    );
    assert.match(recipientBook.text, /For Jordan Example/);
    assert.equal(recipientBook.text.includes(c.recipient.name), false);
    assert.equal(recipientBook.text.includes("jordan@example.test"), false);
    c.additionalRecipients[0].revokedAt = new Date().toISOString();
    await store.putCollection(c);
    assert.equal((await get("", extraToken)).status, 403);
    c.status = "draft";
    await store.putCollection(c);
    assert.equal((await get(c.ownerKey)).status, 403);
    assert.equal((await get("", await login(c.recipient.email))).status, 403);
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in prior)) delete process.env[key];
    Object.assign(process.env, prior);
    await rm(directory, { recursive: true, force: true });
  }
});
