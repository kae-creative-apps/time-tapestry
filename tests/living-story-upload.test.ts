import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createHmac, randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { getPayloadFromClientToken } from "@vercel/blob/client";
import { prepareCollection } from "../src/lib/collection/create";
import type { Collection, StoredMedia } from "../src/lib/collection/types";
import { pcmWavFixture } from "./pcm-wav-fixture";
import { verifiedRecipientCookie } from "./verified-recipient-fixture";
import { storyTraceId } from "../src/lib/observability/pipeline-logger";

let store: typeof import("../src/lib/collection/store");
let mediaRoute: typeof import("../src/app/api/collection/[id]/media/route");
let uploadRoute: typeof import("../src/app/api/collection/[id]/media/upload/route");
const blobToken = "vercel_blob_rw_fixture_livingstorysynthetic";

before(async () => {
  for (const key of ["VERCEL", "KV_REST_API_URL", "KV_REST_API_TOKEN"])
    delete process.env[key];
  Object.assign(process.env, {
    NODE_ENV: "test",
    SECURITY_TEST_BYPASS: "true",
    SECURITY_LOCAL_BYPASS: "true",
    BLOB_READ_WRITE_TOKEN: blobToken,
    VERCEL_BLOB_CALLBACK_URL: "https://stories.example.test",
    COLLECTION_DATA_DIR: await mkdtemp(
      path.join(os.tmpdir(), "living-story-upload-"),
    ),
  });
  store = await import("../src/lib/collection/store");
  mediaRoute = await import("../src/app/api/collection/[id]/media/route");
  uploadRoute =
    await import("../src/app/api/collection/[id]/media/upload/route");
});

async function fixture(approved = true) {
  const c = prepareCollection({
    initiationPath: "share",
    storyteller: { name: "Storyteller", email: "story@example.test" },
    recipient: { name: "Recipient", email: "recipient@example.test" },
  });
  c.status = approved ? "approved" : "draft";
  const batchId = randomUUID();
  c.livingStory = {
    batches: [
      {
        id: batchId,
        requestId: randomUUID(),
        source: "owner",
        requestedByName: "Storyteller",
        promptIds: ["synthetic-prompt"],
        createdAt: c.createdAt,
      },
    ],
    moments: [
      {
        id: randomUUID(),
        batchId,
        promptId: "synthetic-prompt",
        category: "character",
        title: "A memory",
        question: "What do you remember?",
        status: "draft",
        createdAt: c.createdAt,
      },
    ],
  };
  await store.putCollection(c);
  return { c, momentId: c.livingStory.moments[0].id };
}

const params = (c: Collection) => ({ params: Promise.resolve({ id: c.id }) });
function request(
  c: Collection,
  suffix: string,
  body: unknown,
  cookie?: string,
) {
  return new NextRequest(
    `http://localhost/api/collection/${c.id}${suffix}${cookie ? "" : `?key=${c.ownerKey}`}`,
    {
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body),
      headers: {
        ...(body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...(cookie ? { cookie } : {}),
      },
    },
  );
}
function recordingForm(momentId?: string) {
  const form = new FormData();
  form.set(
    "file",
    new File([pcmWavFixture()], "memory.wav", { type: "audio/wav" }),
  );
  if (momentId !== undefined) form.set("momentId", momentId);
  return form;
}
function tokenBody(c: Collection, mediaId: string, momentId?: unknown) {
  return {
    type: "blob.generate-client-token",
    payload: {
      pathname: `collections/${c.id}/${mediaId}`,
      multipart: false,
      clientPayload: JSON.stringify({
        mediaId,
        mimeType: "audio/wav",
        bytes: 64,
        name: "memory.wav",
        ...(momentId !== undefined ? { momentId } : {}),
      }),
    },
  };
}
async function placeholder(
  c: Collection,
  momentId?: string,
  generated = false,
) {
  const media: StoredMedia = {
    id: randomUUID(),
    collectionId: c.id,
    role: "owner",
    provenance: generated ? "generated_film" : "uploaded_recording",
    ...(momentId ? { livingStoryMomentId: momentId } : {}),
    mimeType: "audio/wav",
    originalName: "memory.wav",
    bytes: 0,
    createdAt: c.createdAt,
  };
  await store.putMedia(media);
  return media;
}
function completion(c: Collection, mediaId: string, momentId?: string) {
  const body = {
    type: "blob.upload-completed",
    payload: {
      blob: {
        url: `https://fixture.private.blob.vercel-storage.com/collections/${c.id}/${mediaId}`,
      },
      tokenPayload: JSON.stringify({
        id: mediaId,
        collectionId: c.id,
        ...(momentId ? { momentId } : {}),
      }),
    },
  };
  return new NextRequest(
    `http://localhost/api/collection/${c.id}/media/upload`,
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        "x-vercel-signature": createHmac("sha256", blobToken)
          .update(JSON.stringify(body))
          .digest("hex"),
      },
    },
  );
}

test("approved owner local uploads bind new recordings to one editable memory", async () => {
  const { c, momentId } = await fixture();
  const response = await mediaRoute.POST(
    request(c, "/media", recordingForm(momentId)),
    params(c),
  );
  assert.equal(
    response.status,
    200,
    JSON.stringify(await response.clone().json()),
  );
  const stored = await store.getMedia((await response.json()).mediaId);
  assert.equal(stored!.livingStoryMomentId, momentId);
  assert.equal(stored!.provenance, "uploaded_recording");
  assert.equal(stored!.role, "owner");
  assert.deepEqual(
    await store.getCollection(c.id),
    JSON.parse(JSON.stringify(c)),
  );
});

test("direct upload tokens preserve the moment binding and prohibit overwrites", async () => {
  const { c, momentId } = await fixture();
  const id = randomUUID();
  const response = await uploadRoute.POST(
    request(c, "/media/upload", tokenBody(c, id, momentId)),
    params(c),
  );
  assert.equal(
    response.status,
    200,
    JSON.stringify(await response.clone().json()),
  );
  const token = getPayloadFromClientToken((await response.json()).clientToken);
  assert.equal(token.allowOverwrite, false);
  assert.equal(token.addRandomSuffix, false);
  assert.equal(
    JSON.parse(token.onUploadCompleted!.tokenPayload!).momentId,
    momentId,
  );
  assert.equal((await store.getMedia(id))!.livingStoryMomentId, momentId);
});

test("concurrent upload tokens cannot bind the same recording to different memories", async () => {
  const { c, momentId } = await fixture();
  const otherMomentId = randomUUID();
  c.livingStory!.moments.push({
    ...c.livingStory!.moments[0],
    id: otherMomentId,
  });
  await store.putCollection(c);
  const id = randomUUID();
  const results = await Promise.all(
    [momentId, otherMomentId].map(async (selected) => ({
      selected,
      response: await uploadRoute.POST(
        request(c, "/media/upload", tokenBody(c, id, selected)),
        params(c),
      ),
    })),
  );
  assert.deepEqual(
    results.map(({ response }) => response.status).sort(),
    [200, 400],
  );
  assert.equal(
    (await store.getMedia(id))!.livingStoryMomentId,
    results.find(({ response }) => response.status === 200)!.selected,
  );
});

test("approved owner uploads require an existing editable memory on both upload paths", async () => {
  const { c, momentId } = await fixture();
  for (const id of [undefined, "", randomUUID()]) {
    assert.equal(
      (
        await mediaRoute.POST(
          request(c, "/media", recordingForm(id)),
          params(c),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await uploadRoute.POST(
          request(c, "/media/upload", tokenBody(c, randomUUID(), id)),
          params(c),
        )
      ).status,
      400,
    );
  }
  for (const status of ["processing", "published", "declined"] as const) {
    c.livingStory!.moments[0].status = status;
    await store.putCollection(c);
    assert.equal(
      (
        await mediaRoute.POST(
          request(c, "/media", recordingForm(momentId)),
          params(c),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await uploadRoute.POST(
          request(c, "/media/upload", tokenBody(c, randomUUID(), momentId)),
          params(c),
        )
      ).status,
      400,
    );
  }
  c.livingStory!.moments[0].status = "needs_attention";
  await store.putCollection(c);
  assert.equal(
    (
      await mediaRoute.POST(
        request(c, "/media", recordingForm(momentId)),
        params(c),
      )
    ).status,
    200,
  );
});

test("original draft and recipient uploads cannot claim a living-story moment", async () => {
  const draft = await fixture(false);
  assert.equal(
    (
      await mediaRoute.POST(
        request(draft.c, "/media", recordingForm(draft.momentId)),
        params(draft.c),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await uploadRoute.POST(
        request(
          draft.c,
          "/media/upload",
          tokenBody(draft.c, randomUUID(), draft.momentId),
        ),
        params(draft.c),
      )
    ).status,
    400,
  );
  const { c, momentId } = await fixture();
  const cookie = await verifiedRecipientCookie(c.recipient.email);
  assert.equal(
    (
      await mediaRoute.POST(
        request(c, "/media", recordingForm(momentId), cookie),
        params(c),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await uploadRoute.POST(
        request(
          c,
          "/media/upload",
          tokenBody(c, randomUUID(), momentId),
          cookie,
        ),
        params(c),
      )
    ).status,
    400,
  );
  const ordinaryReply = await mediaRoute.POST(
    request(c, "/media", recordingForm(), cookie),
    params(c),
  );
  assert.equal(ordinaryReply.status, 200);
  assert.equal(
    (await store.getMedia((await ordinaryReply.json()).mediaId))!
      .livingStoryMomentId,
    undefined,
  );
});

test("upload and finalize cannot reuse chapter media, generated films or another memory's media", async (t) => {
  const { c, momentId } = await fixture();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new Error("Rejected requests must not contact Blob storage");
  });
  for (const original of [
    await placeholder(c),
    await placeholder(c, randomUUID()),
    await placeholder(c, momentId, true),
  ]) {
    const before = await store.getMedia(original.id);
    assert.equal(
      (
        await uploadRoute.POST(
          request(c, "/media/upload", tokenBody(c, original.id, momentId)),
          params(c),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await mediaRoute.POST(
          request(c, "/media", { mediaId: original.id, momentId }),
          params(c),
        )
      ).status,
      400,
    );
    assert.deepEqual(await store.getMedia(original.id), before);
  }
  assert.equal(calls, 0);
});

test("signed provider callbacks reject mismatched bindings and memories locked after token issuance", async (t) => {
  const { c, momentId } = await fixture();
  const original = await placeholder(c);
  const bound = await placeholder(c, momentId);
  const diagnostics: string[] = [];
  t.mock.method(console, "error", (line: unknown) => {
    diagnostics.push(String(line));
  });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new Error("Rejected completions must not contact Blob storage");
  });
  for (const [mediaId, tokenMoment, expected] of [
    [original.id, momentId, /Invalid recording for this memory/],
    [bound.id, undefined, /Choose a draft memory/],
    [bound.id, randomUUID(), /recording could not finish uploading/],
  ] as const) {
    const response = await uploadRoute.POST(
      completion(c, mediaId, tokenMoment),
      params(c),
    );
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: string; traceId: string };
    assert.match(body.error, expected);
    assert.equal(body.traceId, storyTraceId(c.id));
  }
  c.livingStory!.moments[0].status = "published";
  await store.putCollection(c);
  const publishedCallback = await uploadRoute.POST(
    completion(c, bound.id, momentId),
    params(c),
  );
  assert.equal(publishedCallback.status, 400);
  const callbackBody = (await publishedCallback.json()) as {
    error: string;
    traceId: string;
  };
  assert.match(callbackBody.error, /recording could not finish uploading/);
  assert.equal(callbackBody.traceId, storyTraceId(c.id));
  const events = diagnostics.map(
    (line) =>
      JSON.parse(line) as {
        stage: string;
        status: string;
        traceId: string;
        error: { stack: string };
      },
  );
  assert.ok(events.length >= 4);
  assert.ok(
    events.every(
      (event) =>
        event.stage === "RECORDING_UPLOAD" &&
        event.status === "failed" &&
        event.traceId === callbackBody.traceId,
    ),
  );
  assert.ok(
    events.some((event) =>
      /assertLivingStoryUpload|momentFor/.test(event.error.stack),
    ),
    "redacted diagnostics retain the validation call site",
  );
  assert.ok(
    diagnostics.every(
      (line) =>
        !line.includes(blobToken) &&
        !line.includes(c.ownerKey) &&
        !line.includes(c.storyteller.email),
    ),
  );
  assert.equal(
    (
      await mediaRoute.POST(
        request(c, "/media", { mediaId: bound.id, momentId }),
        params(c),
      )
    ).status,
    400,
  );
  assert.deepEqual(
    await store.getMedia(bound.id),
    JSON.parse(JSON.stringify(bound)),
  );
  assert.equal(calls, 0);
});
