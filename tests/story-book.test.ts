import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import {
  PDFDocument,
  PDFRawStream,
  PDFDict,
  PDFName,
  PDFArray,
  decodePDFRawStream,
} from "pdf-lib";
import {
  renderStoryBook,
  storyBookSnapshot,
  StoryBookError,
  wrapBookText,
} from "../src/lib/collection/story-book";
import { syntheticFilmCollection } from "./film-fixture";

/** Decode each font's own Unicode map; mixed scripts may reuse glyph numbers. */
async function readPdf(bytes: Uint8Array) {
  const document = await PDFDocument.load(bytes);
  const lines: string[] = [];
  const decode = (stream: PDFRawStream) =>
    Buffer.from(decodePDFRawStream(stream).decode()).toString("utf8");
  for (const page of document.getPages()) {
    const fonts = page.node.Resources()!.lookup(PDFName.of("Font"), PDFDict);
    const maps = new Map<string, Map<string, string>>();
    for (const [name, ref] of fonts.entries()) {
      const font = document.context.lookup(ref, PDFDict);
      const cmap = decode(font.lookup(PDFName.of("ToUnicode")) as PDFRawStream);
      const mapping = new Map<string, string>();
      for (const block of cmap.matchAll(
        /beginbfchar\s+([\s\S]*?)\s+endbfchar/g,
      ))
        for (const pair of block[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>/gi))
          mapping.set(
            pair[1].toUpperCase(),
            pair[2]
              .match(/.{4}/g)!
              .map((unit) => String.fromCharCode(parseInt(unit, 16)))
              .join(""),
          );
      maps.set(name.asString().slice(1), mapping);
    }
    const contents = page.node.Contents();
    const streams =
      contents instanceof PDFArray
        ? contents
            .asArray()
            .map((ref) => document.context.lookup(ref) as PDFRawStream)
        : contents
          ? [contents as PDFRawStream]
          : [];
    let current = new Map<string, string>();
    for (const stream of streams)
      for (const token of decode(stream).matchAll(
        /\/([^\s]+)\s+[\d.]+\s+Tf|<([0-9a-f]+)>\s+Tj/gi,
      )) {
        if (token[1]) current = maps.get(token[1])!;
        else
          lines.push(
            token[2]
              .match(/.{4}/g)!
              .map((code) => current.get(code.toUpperCase()) ?? "")
              .join(""),
          );
      }
  }
  return {
    document,
    text: lines
      .filter(
        (line) =>
          !/^TIME TAPESTRY  \/  STORY \d+$/.test(line) &&
          !/^(?:Kindness|Faith|Generosity|Encouragement)$/.test(line) &&
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
  assert.equal(document.getPageCount(), 6);
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

test("each chapter opens with the question asked for that chapter", () => {
  const c = syntheticFilmCollection();
  c.status = "approved";
  c.interviews = [
    {
      id: "session",
      provider: "guided",
      status: "completed",
      startedAt: c.createdAt,
      turns: [
        {
          id: "ask-1",
          sequence: 1,
          role: "agent",
          text: "Tell me about kindness.",
          chapterId: "q1",
          capturedAt: c.createdAt,
          timing: "unaligned",
        },
        {
          id: "answer-1",
          sequence: 2,
          role: "user",
          text: "A neighbor helped.",
          chapterId: "q1",
          capturedAt: c.createdAt,
          timing: "unaligned",
        },
        {
          id: "follow-1",
          sequence: 3,
          role: "agent",
          text: "What did that help mean to you?",
          chapterId: "q1",
          capturedAt: c.createdAt,
          timing: "unaligned",
        },
        {
          id: "ask-2",
          sequence: 4,
          role: "agent",
          text: "Tell me about a decision you made while following Jesus.",
          chapterId: "q2",
          capturedAt: c.createdAt,
          timing: "unaligned",
        },
        {
          id: "answer-2",
          sequence: 5,
          role: "user",
          text: "I stayed.",
          chapterId: "q2",
          capturedAt: c.createdAt,
          timing: "unaligned",
        },
      ],
      segments: [],
      excludedTurnIds: [],
    },
  ];
  const book = storyBookSnapshot(c, "Sam Example");
  assert.equal(book.chapters[0].question, "Tell me about kindness.");
  assert.equal(
    book.chapters[1].question,
    "Tell me about a decision you made while following Jesus.",
  );
  assert.equal(book.chapters[0].label, "Kindness");
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
  const get = (key = "", token = "", draft = false) =>
    GET(
      new NextRequest(
        `https://book.example.test/api/collection/${c.id}/book?${new URLSearchParams({ ...(key ? { key } : {}), ...(draft ? { draft: "1" } : {}) })}`,
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
    const primaryToken = await login(c.recipient.email);
    assert.equal((await get("", primaryToken)).status, 403);
    assert.equal((await get("", primaryToken, true)).status, 403);
    assert.equal((await get(c.requesterKey, "", true)).status, 403);
    assert.equal((await get("", "", true)).status, 403);
    const draft = await get(c.ownerKey, "", true);
    assert.equal(draft.status, 200);
    assert.equal(draft.headers.get("Cache-Control"), "private, no-store");
    assert.match(
      (await readPdf(new Uint8Array(await draft.arrayBuffer()))).text,
      /Private draft for your review/,
    );
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in prior)) delete process.env[key];
    Object.assign(process.env, prior);
    await rm(directory, { recursive: true, force: true });
  }
});

test("mixed Chinese, Japanese, Korean and Latin names and story text remain complete in the PDF", async () => {
  const c = syntheticFilmCollection();
  c.status = "approved";
  c.storyteller.name = "王明 Élodie";
  c.recipient.name = "田中あかり 민준";
  c.chapters[0].content =
    "祖母教我善良。家族の思い出。할머니의 사랑. A memory to keep.";
  const { text, document } = await readPdf(
    await renderStoryBook(storyBookSnapshot(c, c.recipient.name)),
  );
  const compact = text.replace(/\s/g, "");
  for (const value of [
    c.storyteller.name,
    c.recipient.name,
    c.chapters[0].content,
  ])
    assert.ok(compact.includes(value.replace(/\s/g, "")), value);
  assert.equal(document.getPageCount(), 6);
});

test("new editions append only published stories, retain real quotes, and keep the original book available", async () => {
  const c = syntheticFilmCollection();
  c.status = "approved";
  c.livingStory = {
    batches: [],
    moments: [
      {
        id: "later",
        batchId: "batch",
        promptId: "faith-01",
        category: "faith",
        title: "An evening prayer",
        question: "What prayer has stayed with you?",
        status: "published",
        sourceMediaId: "source-2",
        videoMediaId: "film-2",
        content: "I remember the words we prayed together in the kitchen.",
        sourceQuote:
          "We prayed together in the kitchen every evening before supper.",
        createdAt: "2026-10-07T12:00:00.000Z",
        publishedAt: "2026-10-07T12:00:00.000Z",
      },
      {
        id: "earlier",
        batchId: "batch",
        promptId: "character-01",
        category: "character",
        title: "Keeping my promise",
        question: "When did a promise matter?",
        status: "published",
        sourceMediaId: "source-1",
        videoMediaId: "film-1",
        content: "A memory of keeping a promise to my neighbor.",
        createdAt: "2026-10-06T12:00:00.000Z",
        publishedAt: "2026-10-06T12:00:00.000Z",
      },
      {
        id: "draft",
        batchId: "batch",
        promptId: "health-01",
        category: "health",
        title: "PRIVATE DRAFT TITLE",
        question: "PRIVATE DRAFT QUESTION",
        status: "processing",
        content: "PRIVATE DRAFT WORDS",
        createdAt: c.createdAt,
      },
    ],
  };
  const current = storyBookSnapshot(c, "Riley Example");
  assert.deepEqual(
    current.chapters.map((chapter) => chapter.id),
    ["q1", "q2", "q3", "q4", "earlier", "later"],
  );
  assert.equal(
    storyBookSnapshot(c, "Riley Example", { originalOnly: true }).chapters
      .length,
    4,
  );
  assert.equal(
    storyBookSnapshot(c, "Riley Example", {
      through: "2026-10-06T12:00:00.000Z",
    }).chapters.length,
    5,
  );
  assert.equal(
    storyBookSnapshot(c, "Riley Example", { draft: true }).chapters.length,
    4,
  );
  assert.throws(
    () => storyBookSnapshot(c, "Riley Example", { through: "not-a-date" }),
    /edition is unavailable/,
  );
  const { text, document } = await readPdf(await renderStoryBook(current));
  assert.match(text, /The stories inside/);
  assert.ok(text.includes(c.livingStory.moments[0].sourceQuote!));
  assert.ok(text.includes(c.livingStory.moments[0].content!));
  assert.equal(text.includes("PRIVATE DRAFT"), false);
  assert.equal(document.getPageCount(), 8);
});
