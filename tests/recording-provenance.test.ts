import assert from "node:assert/strict";
import { before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { prepareCollection } from "../src/lib/collection/create";
import { draftChapters } from "../src/lib/collection/content";
import type { Collection, StoredMedia } from "../src/lib/collection/types";
import { isStoredOwnerRecording } from "../src/lib/collection/recording-validation";

let store: typeof import("../src/lib/collection/store");
let media: typeof import("../src/lib/collection/media");
let collectionPost: typeof import("../src/app/api/collection/[id]/route").POST;
let interviewPost: typeof import("../src/app/api/collection/[id]/interview/route").POST;
let uploadPost: typeof import("../src/app/api/collection/[id]/media/upload/route").POST;
let mediaGet: typeof import("../src/app/api/collection/[id]/media/[mediaId]/route").GET;
let plans: typeof import("../src/lib/collection/films/original-plan");
before(async () => {
  for (const key of [
    "VERCEL",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "GLOO_API_KEY",
    "OPENAI_API_KEY",
    "ELEVENLABS_API_KEY",
  ])
    delete process.env[key];
  Object.assign(process.env, {
    NODE_ENV: "test",
    SECURITY_TEST_BYPASS: "true",
    SECURITY_LOCAL_BYPASS: "true",
    BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_fixture_synthetic",
    COLLECTION_DATA_DIR: await mkdtemp(
      path.join(os.tmpdir(), "recording-provenance-"),
    ),
  });
  store = await import("../src/lib/collection/store");
  media = await import("../src/lib/collection/media");
  collectionPost = (await import("../src/app/api/collection/[id]/route")).POST;
  interviewPost = (
    await import("../src/app/api/collection/[id]/interview/route")
  ).POST;
  uploadPost = (
    await import("../src/app/api/collection/[id]/media/upload/route")
  ).POST;
  mediaGet = (
    await import("../src/app/api/collection/[id]/media/[mediaId]/route")
  ).GET;
  plans = await import("../src/lib/collection/films/original-plan");
});
const params = (c: Collection) => ({ params: Promise.resolve({ id: c.id }) });
const request = (c: Collection, suffix: string, body: unknown) =>
  new NextRequest(
    `http://localhost/api/collection/${c.id}${suffix}?key=${c.ownerKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
async function fixture() {
  const c = prepareCollection({
    initiationPath: "share",
    storyteller: { name: "Storyteller", email: "story@example.test" },
    recipient: { name: "Recipient", email: "recipient@example.test" },
  });
  await store.putCollection(c);
  const original = await media.saveLocalMedia(
    c.id,
    "owner",
    new File(["synthetic original recording"], "story-1-ai-narration.mp4", {
      type: "video/mp4",
    }),
  );
  for (let i = 1; i <= 4; i++) {
    const take = {
      id: randomUUID(),
      questionId: `q${i}`,
      kind: "video" as const,
      prompt: "A memory",
      text: `My recorded memory ${i}.`,
      mediaId: original.id,
      createdAt: c.createdAt,
    };
    c.takes.push(take);
    c.selectedTakeIds[take.questionId] = take.id;
  }
  c.chapters = await draftChapters(c);
  c.status = "draft";
  await store.putCollection(c);
  return { c, original };
}
function artifact(c: Collection, mediaId: string) {
  return {
    jobId: `film_${"a".repeat(64)}`,
    chapterId: "q1",
    mediaId,
    narrationKind: "ai_interviewer" as const,
    sourceTakeIds: [c.takes[0].id],
    sourceSha256: "b".repeat(64),
    scriptSha256: "c".repeat(64),
    audioSha256: "d".repeat(64),
    outputSha256: "e".repeat(64),
    voiceId: "historical-voice",
    modelId: "historical-model",
    durationSeconds: 10,
    createdAt: c.createdAt,
  };
}
function tokenBody(c: Collection, id: string) {
  return {
    type: "blob.generate-client-token",
    payload: {
      pathname: `collections/${c.id}/${id}`,
      multipart: false,
      clientPayload: JSON.stringify({
        mediaId: id,
        mimeType: "video/mp4",
        bytes: 64,
        name: "recording.mp4",
        provenance: "uploaded_recording",
      }),
    },
  };
}

test("uploaded and older original recordings remain valid while generated provenance and legacy output IDs are rejected", async () => {
  const { c, original } = await fixture();
  assert.equal(original.provenance, "uploaded_recording");
  assert.equal(
    isStoredOwnerRecording(original, c, "video"),
    true,
    "Client filenames do not determine provenance",
  );
  const legacy = { ...original, provenance: undefined };
  await store.putMedia(legacy);
  assert.equal(isStoredOwnerRecording(legacy, c, "video"), true);
  assert.equal((await plans.originalFilmSources(c)).length, 1);
  assert.equal((await plans.prepareAutomaticJob(c)).chapters.length, 4);
  for (const generated of [
    { ...original, id: randomUUID(), provenance: "generated_film" as const },
    { ...original, id: `filmmedia_${"f".repeat(48)}`, provenance: undefined },
  ]) {
    await store.putMedia(generated);
    assert.equal(isStoredOwnerRecording(generated, c, "video"), false);
    const response = await collectionPost(
      request(c, "", {
        action: "save_take",
        take: {
          ...c.takes[0],
          id: randomUUID(),
          mediaId: generated.id,
          provenance: "uploaded_recording",
        },
      }),
      params(c),
    );
    assert.equal(response.status, 400);
  }
  assert.equal((await store.getCollection(c.id))!.takes.length, 4);
});

test("legacy artifact references in current chapters and draft history block reuse while preserving playback", async () => {
  for (const historical of [false, true]) {
    const { c, original } = await fixture();
    const generated: StoredMedia = {
      ...original,
      id: randomUUID(),
      provenance: undefined,
    };
    await store.putMedia(generated);
    const savedChapter = {
      ...c.chapters[0],
      film: artifact(c, generated.id),
      videoMediaId: generated.id,
      videoStatus: "ready" as const,
    };
    if (historical)
      c.draftHistory = [
        {
          savedAt: c.createdAt,
          chapters: [savedChapter],
          chapterBlessings: {},
        },
      ];
    else c.chapters[0] = savedChapter;
    await store.putCollection(c);
    assert.equal(isStoredOwnerRecording(generated, c), false);
    const take = { ...c.takes[0], mediaId: generated.id };
    assert.equal(
      (
        await collectionPost(
          request(c, "", { action: "save_take", take }),
          params(c),
        )
      ).status,
      400,
    );
    const sessionId = randomUUID();
    assert.equal(
      (
        await interviewPost(
          request(c, "/interview", { action: "start", sessionId }),
          params(c),
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await interviewPost(
          request(c, "/interview", {
            action: "attach_segment",
            sessionId,
            segment: {
              id: randomUUID(),
              mediaId: generated.id,
              kind: "video",
              startMs: 0,
              durationMs: 1000,
            },
          }),
          params(c),
        )
      ).status,
      400,
    );
    // An older malformed source association is also rejected at generation and film preparation.
    await store.mutateCollection(c.id, (current) => {
      current.takes[0].mediaId = generated.id;
      return current;
    });
    const current = (await store.getCollection(c.id))!;
    assert.equal(
      (
        await collectionPost(
          request(c, "", { action: "generate", regenerate: true }),
          params(c),
        )
      ).status,
      400,
    );
    assert.ok(
      !(await plans.originalFilmSources(current)).some(
        (source) => source.mediaId === generated.id,
      ),
    );
    await assert.rejects(
      plans.prepareAutomaticJob(current),
      /saved original recording/,
    );
    const playback = await mediaGet(
      new NextRequest(
        `http://localhost/api/collection/${c.id}/media/${generated.id}?key=${c.ownerKey}`,
      ),
      { params: Promise.resolve({ id: c.id, mediaId: generated.id }) },
    );
    assert.equal(playback.status, 200);
    assert.equal(await playback.text(), "synthetic original recording");
    assert.deepEqual(
      (await store.getCollection(c.id))!.draftHistory,
      current.draftHistory,
    );
  }
});

test("upload requests cannot relabel or replace generated media and assign provenance on the server", async (t) => {
  const { c, original } = await fixture();
  const generated: StoredMedia = {
    ...original,
    id: randomUUID(),
    provenance: undefined,
  };
  await store.putMedia(generated);
  c.draftHistory = [
    {
      savedAt: c.createdAt,
      chapters: [{ ...c.chapters[0], film: artifact(c, generated.id) }],
      chapterBlessings: {},
    },
  ];
  await store.putCollection(c);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new Error("Rejected uploads must not call storage providers");
  });
  for (const id of [generated.id, `filmmedia_${"1".repeat(48)}`]) {
    const response = await uploadPost(
      request(c, "/media/upload", tokenBody(c, id)),
      params(c),
    );
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /Completed films/);
  }
  await assert.rejects(
    media.finalizeCloudMedia(generated.id),
    /Completed films/,
  );
  assert.equal(calls, 0);
  assert.deepEqual(
    await store.getMedia(generated.id),
    JSON.parse(JSON.stringify(generated)),
  );
  const id = randomUUID();
  const acceptedBody = tokenBody(c, id);
  acceptedBody.payload.clientPayload = JSON.stringify({
    ...JSON.parse(acceptedBody.payload.clientPayload),
    provenance: "generated_film",
  });
  const accepted = await uploadPost(
    request(c, "/media/upload", acceptedBody),
    params(c),
  );
  assert.equal(accepted.status, 200);
  assert.equal((await store.getMedia(id))!.provenance, "uploaded_recording");
});

test("retired film and story editing preserves imported outputs and cannot turn them into original recordings", async () => {
  for (const action of ["change_words", "remove_film", "replace_film"]) {
    const { c, original } = await fixture();
    const generated: StoredMedia = {
      ...original,
      id: randomUUID(),
      provenance: undefined,
    };
    await store.putMedia(generated);
    c.chapters[0].film = artifact(c, generated.id);
    c.chapters[0].videoMediaId = generated.id;
    c.chapters[0].videoStatus = "ready";
    await store.putCollection(c);
    const chapter = c.chapters[0];
    const body =
      action === "replace_film"
        ? {
            action: "attach_video",
            chapterId: chapter.id,
            mediaId: original.id,
            durationSeconds: 10,
          }
        : {
            action: "edit_chapter",
            chapterId: chapter.id,
            title: chapter.title,
            content:
              chapter.content +
              (action === "change_words" ? " A correction." : ""),
            postcardNote: chapter.postcardNote,
            ...(action === "remove_film"
              ? { videoStatus: "not_requested" }
              : {}),
          };
    assert.equal(
      (await collectionPost(request(c, "", body), params(c))).status,
      410,
      action,
    );
    const current = (await store.getCollection(c.id))!;
    assert.deepEqual(current, JSON.parse(JSON.stringify(c)));
    const preserved = (await store.getMedia(generated.id))!;
    assert.deepEqual(preserved, JSON.parse(JSON.stringify(generated)));
    assert.equal(isStoredOwnerRecording(preserved, current), false);
    assert.equal(
      (
        await collectionPost(
          request(c, "", {
            action: "save_take",
            take: { ...c.takes[0], mediaId: generated.id },
          }),
          params(c),
        )
      ).status,
      400,
    );
  }
});

test("a queued original source fails validation if its provenance is later recognized as a film", async () => {
  const { c, original } = await fixture();
  const prepared = await plans.prepareAutomaticJob(c);
  const job = {
    mode: "original",
    preparation: "automatic",
    collectionId: c.id,
    originalSources: prepared.snapshots,
  } as import("../src/lib/collection/films/types").StoryFilmJob;
  assert.equal(await plans.originalJobInputsCurrent(job), true);
  await store.putMedia({ ...original, provenance: "generated_film" });
  assert.equal(await plans.originalJobInputsCurrent(job), false);
});
