import assert from "node:assert/strict";
import { before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import type { Collection } from "../src/lib/collection/types";
import { syntheticRecordedFilmCollection } from "./film-fixture";

let store: typeof import("../src/lib/collection/store");
let media: typeof import("../src/lib/collection/media");
let jobs: typeof import("../src/lib/collection/films/jobstore");
let post: typeof import("../src/app/api/collection/[id]/route").POST;

before(async () => {
  for (const key of [
    "GLOO_API_KEY",
    "OPENAI_API_KEY",
    "ELEVENLABS_API_KEY",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "BLOB_READ_WRITE_TOKEN",
    "VERCEL",
  ])
    delete process.env[key];
  Object.assign(process.env, {
    NODE_ENV: "test",
    SECURITY_TEST_BYPASS: "true",
    SECURITY_LOCAL_BYPASS: "true",
    COLLECTION_DATA_DIR: await mkdtemp(
      path.join(os.tmpdir(), "interview-retake-"),
    ),
  });
  store = await import("../src/lib/collection/store");
  media = await import("../src/lib/collection/media");
  jobs = await import("../src/lib/collection/films/jobstore");
  post = (await import("../src/app/api/collection/[id]/route")).POST;
});

async function act(collection: Collection, body: unknown) {
  const response = await post(
    new NextRequest(
      `http://localhost/api/collection/${collection.id}?key=${collection.ownerKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    ),
    { params: Promise.resolve({ id: collection.id }) },
  );
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  return result;
}

test("submitting an approved recorded retake replaces the draft source and preserves the earlier draft", async () => {
  const collection = await syntheticRecordedFilmCollection("voice");
  const earlierChapters = structuredClone(collection.chapters);
  const earlierTake = collection.takes[0];
  const recording = await media.saveLocalMedia(
    collection.id,
    "owner",
    new File(["Synthetic replacement recording"], "replacement.wav", {
      type: "audio/wav",
    }),
  );
  const recordedWords =
    "This is my replacement recording. A neighbor brought us dinner when our family needed help, and I have remembered that kindness ever since.";
  recording.transcription = {
    text: recordedWords,
    provider: "openai",
    model: "whisper-1",
    completedAt: new Date().toISOString(),
  };
  await store.putMedia(recording);
  const replacementId = randomUUID();
  await act(collection, {
    action: "save_take",
    replaceChapterId: "q1",
    take: {
      id: replacementId,
      questionId: "q1",
      kind: "voice",
      mediaId: recording.id,
      prompt: "Tell me about a kindness you remember.",
      durationSeconds: 12,
      text: "",
    },
  });
  const waiting = (await store.getCollection(collection.id))!;
  assert.equal(waiting.draftOutdated, true);
  assert.deepEqual(
    waiting.chapters,
    earlierChapters.map((chapter) => ({
      ...chapter,
      editorialReviewed: false,
    })),
  );
  assert.equal(waiting.selectedTakeIds.q1, replacementId);

  const result = await act(collection, {
    action: "generate",
    regenerate: true,
    prepareFilms: true,
    processingApproved: true,
  });
  assert.equal(result.filmPreparationError, undefined);
  const submitted = (await store.getCollection(collection.id))!;
  assert.equal(submitted.draftOutdated, false);
  assert.equal(submitted.status, "draft");
  assert.deepEqual(submitted.chapters[0].sourceTakeIds, [replacementId]);
  assert.match(submitted.chapters[0].content, /neighbor brought us dinner/);
  assert.equal(submitted.draftHistory?.length, 1);
  assert.deepEqual(submitted.draftHistory[0].chapters, waiting.chapters);
  assert.deepEqual(
    submitted.takes.find((take) => take.id === earlierTake.id),
    earlierTake,
  );
  assert.ok(await store.getMedia(earlierTake.mediaId!));
  const submittedJob = (await jobs.latestFilmJob(collection.id))!;
  assert.equal(submittedJob.mode, "original");
  assert.deepEqual(submittedJob.chapters[0].sourceTakeIds, [replacementId]);

  await act(collection, {
    action: "generate",
    regenerate: false,
    prepareFilms: true,
    processingApproved: true,
  });
  const repeated = (await store.getCollection(collection.id))!;
  assert.equal(repeated.draftHistory?.length, 1);
  assert.equal((await jobs.latestFilmJob(collection.id))?.id, submittedJob.id);
});
