import assert from "node:assert/strict";
import { before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { prepareCollection } from "../src/lib/collection/create";
import { draftChapters } from "../src/lib/collection/content";
import type { Collection, StoredMedia } from "../src/lib/collection/types";
import { verifiedRecipientCookie } from "./verified-recipient-fixture";

let store: typeof import("../src/lib/collection/store");
let jobs: typeof import("../src/lib/collection/films/jobstore");
let playback: typeof import("../src/lib/collection/playback");
let media: typeof import("../src/lib/collection/media");
let post: typeof import("../src/app/api/collection/[id]/route").POST;
let exportsRoute: typeof import("../src/app/api/collection/[id]/exports/route");
let delivery: typeof import("../src/lib/collection/delivery");
let publicView: typeof import("../src/lib/collection/access").publicView;
before(async () => {
  for (const key of [
    "GLOO_API_KEY",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "BLOB_READ_WRITE_TOKEN",
    "VERCEL",
    "OPENAI_API_KEY",
  ])
    delete process.env[key];
  Object.assign(process.env, {
    NODE_ENV: "test",
    SECURITY_TEST_BYPASS: "true",
    SECURITY_LOCAL_BYPASS: "true",
    NEXT_PUBLIC_APP_URL: "http://localhost",
    COLLECTION_DATA_DIR: await mkdtemp(
      path.join(os.tmpdir(), "chapter-playback-"),
    ),
  });
  store = await import("../src/lib/collection/store");
  jobs = await import("../src/lib/collection/films/jobstore");
  playback = await import("../src/lib/collection/playback");
  media = await import("../src/lib/collection/media");
  post = (await import("../src/app/api/collection/[id]/route")).POST;
  exportsRoute = await import("../src/app/api/collection/[id]/exports/route");
  delivery = await import("../src/lib/collection/delivery");
  publicView = (await import("../src/lib/collection/access")).publicView;
});
const ctx = (c: Collection) => ({ params: Promise.resolve({ id: c.id }) });
const request = (
  c: Collection,
  body?: unknown,
  route = "",
  key = c.ownerKey,
  cookie = "",
) =>
  new NextRequest(
    `http://localhost/api/collection/${c.id}${route}?key=${key}`,
    {
      ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
    },
  );
async function fixture() {
  const c = prepareCollection({
    initiationPath: "share",
    storyteller: { name: "Alex Example", email: "alex@example.test" },
    recipient: { name: "Sam Example", email: "sam@example.test" },
  });
  await store.putCollection(c);
  for (let index = 1; index <= 4; index++) {
    const source = await media.saveLocalMedia(
      c.id,
      "owner",
      new File(["synthetic source"], "answer.webm", { type: "audio/webm" }),
    );
    const id = randomUUID();
    const questionId = `q${index}`;
    c.takes.push({
      id,
      questionId,
      kind: "voice",
      mediaId: source.id,
      text: `These are my original recorded words for chapter ${index}.`,
      prompt: "Tell your story.",
      createdAt: c.createdAt,
    });
    c.selectedTakeIds[questionId] = id;
  }
  c.chapters = await draftChapters(c);
  c.status = "draft";
  await store.putCollection(c);
  const job = await jobs.enqueueAutomaticOriginalFilms(c, {
    processingApproved: true,
    presentation: "audio",
    outputMode: "interactive",
  });
  job.status = "ready";
  for (const chapter of job.chapters) {
    const p = {
      schemaVersion: 1 as const,
      jobId: job.id,
      chapterId: chapter.chapterId,
      mediaId: "",
      sourceTakeIds: chapter.sourceTakeIds,
      sourceSha256: chapter.sourceSha256,
      planSha256: "a".repeat(64),
      outputSha256: String(chapter.chapterNumber).repeat(64),
      durationMs: 1000,
      words: [{ text: "Recorded", startMs: 0, endMs: 900 }],
      createdAt: c.createdAt,
    };
    p.mediaId = playback.playbackMediaId(p);
    const localPath = path.join(store.dataRoot, "media", `${p.mediaId}.m4a`);
    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(localPath, "synthetic chapter derivative");
    await store.putMedia({
      id: p.mediaId,
      collectionId: c.id,
      role: "owner",
      provenance: "chapter_playback",
      mimeType: "audio/mp4",
      originalName: "chapter.m4a",
      bytes: 28,
      localPath,
      createdAt: c.createdAt,
    });
    chapter.playback = p;
    chapter.status = "ready";
    chapter.progress = 1;
  }
  await store.mutateRecord(job.id, () => job);
  await jobs.attachReadyFilms(job);
  return { c: (await store.getCollection(c.id))!, job };
}
const review = (c: Collection) => ({
  action: "approve",
  deliveryMode: "digital",
  recordingsReviewed: true,
  reviewedPlaybackHashes: Object.fromEntries(
    c.chapters.map((chapter) => [chapter.id, chapter.playback!.outputSha256]),
  ),
});

test("chapter readiness requires exact saved timeline, derived identity and private storage", async () => {
  const { c, job } = await fixture();
  assert.equal(await playback.playbackReady(c, job), true);
  const edited = structuredClone(c);
  edited.chapters[0].playback!.words[0].text = "Changed after preparation";
  assert.equal(await playback.playbackReady(edited, job), false);
  const raw = structuredClone(c);
  raw.chapters[0].playback!.mediaId = c.takes[0].mediaId!;
  assert.equal(await playback.playbackReady(raw, job), false);
  const duplicate = structuredClone(c);
  duplicate.chapters[3] = duplicate.chapters[0];
  assert.equal(await playback.playbackReady(duplicate, job), false);
  const notice = c.notifications.find((n) =>
    n.id.includes(":playback-ready:"),
  )!;
  assert.equal(
    await delivery.currentNotificationSuppressionReason(c, notice),
    null,
  );
  assert.match(
    (await delivery.currentNotificationSuppressionReason(edited, notice))!,
    /verified/,
  );
});

test("finished chapter audio can attach after a retry left those chapters preparing", async () => {
  const { c, job } = await fixture();
  await store.mutateCollection(c.id, (current) => {
    for (const chapter of current.chapters) {
      chapter.playback = undefined;
      chapter.editorialReviewed = false;
    }
    return current;
  });
  for (const chapter of job.chapters.slice(0, 3)) {
    chapter.status = "preparing";
    chapter.progress = 0;
    chapter.error = "Chapter playback storage verification failed.";
  }
  await store.mutateRecord(job.id, () => job);
  assert.equal(
    await playback.playbackReady((await store.getCollection(c.id))!, job),
    false,
  );
  const finished = jobs.withFinishedChaptersReady(job);
  assert.ok(finished.chapters.every((chapter) => chapter.status === "ready"));
  await jobs.attachReadyFilms(finished);
  const saved = (await store.getCollection(c.id))!;
  assert.equal(await playback.playbackReady(saved, finished), true);
  assert.ok(saved.chapters.every((chapter) => chapter.playback?.mediaId));
});

test("reattaching an identical playback checkpoint retains review marks", async () => {
  const { c, job } = await fixture();
  const reviewed = await store.mutateCollection(c.id, (current) => {
    for (const chapter of current.chapters) {
      chapter.editorialReviewed = true;
      chapter.reviewedPlaybackSha256 = chapter.playback!.outputSha256;
    }
    return current;
  });
  await jobs.attachReadyFilms(job);
  assert.deepEqual(
    (await store.getCollection(c.id))!.chapters,
    reviewed.chapters,
  );
  const changed = structuredClone(job);
  changed.chapters[0].playback!.words[0].text = "An updated timeline";
  await store.mutateRecord(job.id, () => changed);
  await jobs.attachReadyFilms(changed);
  const replaced = (await store.getCollection(c.id))!;
  assert.equal(replaced.chapters[0].editorialReviewed, false);
  assert.equal(replaced.chapters[0].reviewedPlaybackSha256, undefined);
  assert.equal(replaced.chapters[1].editorialReviewed, true);
});

test("approval binds all four reviewed chapter hashes and recipients never receive original recordings", async () => {
  const { c } = await fixture();
  const derivative = (await store.getMedia(c.chapters[0].playback!.mediaId))!;
  assert.equal(media.mediaAllowed(c, "recipient", derivative), false);
  const bad = review(c);
  bad.reviewedPlaybackHashes.q3 = "f".repeat(64);
  assert.equal((await post(request(c, bad), ctx(c))).status, 400);
  const approved = await post(request(c, review(c)), ctx(c));
  assert.equal(approved.status, 200, JSON.stringify(await approved.json()));
  const saved = (await store.getCollection(c.id))!;
  assert.equal(
    saved.chapters[0].reviewedPlaybackSha256,
    saved.chapters[0].playback!.outputSha256,
  );
  assert.equal(media.mediaAllowed(saved, "recipient", derivative), true);
  assert.equal(media.mediaAllowed(saved, "requester", derivative), false);
  const source = (await store.getMedia(c.takes[0].mediaId!))!;
  assert.equal(media.mediaAllowed(saved, "recipient", source), false);
  assert.equal(
    media.mediaAllowed(saved, "recipient", {
      ...derivative,
      provenance: "uploaded_recording",
    }),
    false,
  );
  const view = publicView(saved, "recipient");
  assert.deepEqual(view.chapters[0].playback!.sourceTakeIds, []);
  assert.equal(view.chapters[0].playback!.sourceSha256, "");
  assert.equal(view.chapters[0].playback!.planSha256, "");
  assert.deepEqual(view.takes, []);
  assert.deepEqual(view.interviews, undefined);
  const { GET: readMedia } =
    await import("../src/app/api/collection/[id]/media/[mediaId]/route");
  const cookie = await verifiedRecipientCookie(saved.recipient.email);
  const call = (m: StoredMedia, key: string, cookieValue = "") =>
    readMedia(request(saved, undefined, `/media/${m.id}`, key, cookieValue), {
      params: Promise.resolve({ id: saved.id, mediaId: m.id }),
    });
  assert.equal((await call(derivative, saved.recipientKey)).status, 404);
  assert.equal((await call(source, saved.recipientKey, cookie)).status, 404);
  assert.equal(
    (await call(derivative, saved.recipientKey, cookie)).status,
    200,
  );
  const again = await post(request(saved, review(saved)), ctx(saved));
  assert.equal(again.status, 200);
});

test("exports are owner requested, idempotent and bound to approved playback without replacing it", async () => {
  const { c } = await fixture();
  assert.equal((await post(request(c, review(c)), ctx(c))).status, 200);
  const approved = (await store.getCollection(c.id))!;
  const before = structuredClone(approved.chapters);
  assert.equal(
    (
      await exportsRoute.POST(
        request(
          approved,
          { action: "request" },
          "/exports",
          approved.recipientKey,
        ),
        ctx(c),
      )
    ).status,
    403,
  );
  const cookie = await verifiedRecipientCookie(approved.recipient.email);
  assert.equal(
    (
      await exportsRoute.POST(
        request(approved, { action: "request" }, "/exports", "", cookie),
        ctx(c),
      )
    ).status,
    403,
  );
  await jobs.writeWorkerHeartbeat("synthetic-playback-worker");
  const first = await exportsRoute.POST(
    request(approved, { action: "request" }, "/exports"),
    ctx(c),
  );
  assert.equal(first.status, 202, JSON.stringify(await first.clone().json()));
  const { job: initial } = await first.json();
  const repeated = await exportsRoute.POST(
    request(approved, { action: "request" }, "/exports"),
    ctx(c),
  );
  assert.equal((await repeated.json()).job.id, initial.id);
  assert.deepEqual((await store.getCollection(c.id))!.chapters, before);
  const exported = (await jobs.getFilmJob(initial.id))!;
  exported.status = "ready";
  for (const chapter of exported.chapters) {
    const p = {
      ...chapter.playback!,
      exportSha256: String(chapter.chapterNumber + 4).repeat(64),
    };
    const mediaId = playback.playbackExportMediaId(p)!;
    await store.putMedia({
      id: mediaId,
      collectionId: c.id,
      role: "owner",
      provenance: "generated_film",
      mimeType: "video/mp4",
      originalName: "export.mp4",
      bytes: 10,
      localPath: "/synthetic-export",
      createdAt: c.createdAt,
    });
    chapter.artifact = {
      jobId: exported.id,
      chapterId: chapter.chapterId,
      mediaId,
      narrationKind: "original_recording",
      presentation: "audio",
      sourceTakeIds: chapter.sourceTakeIds,
      sourceSha256: chapter.sourceSha256,
      outputSha256: p.exportSha256,
      planSha256: "a".repeat(64),
      durationSeconds: 1,
      createdAt: c.createdAt,
      sourceRanges: [],
      sourceAssets: [],
    };
    chapter.status = "ready";
  }
  await store.mutateRecord(exported.id, () => exported);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost/";
  try {
    await jobs.attachReadyFilms(exported);
  } finally {
    process.env.NEXT_PUBLIC_APP_URL = appUrl;
  }
  const saved = (await store.getCollection(c.id))!;
  assert.equal(saved.status, "approved");
  assert.equal(saved.approvedAt, approved.approvedAt);
  assert.equal(await playback.playbackExportReady(saved, exported), true);
  assert.equal(await playback.playbackReady(saved), true);
  for (const chapter of saved.chapters) {
    const previous = before.find((item) => item.id === chapter.id)!;
    const { exportMediaId, exportSha256, ...original } = chapter.playback!;
    assert.deepEqual(original, previous.playback);
    assert.equal(
      chapter.reviewedPlaybackSha256,
      previous.reviewedPlaybackSha256,
    );
    assert.ok(exportSha256);
    assert.equal(
      media.mediaAllowed(
        saved,
        "recipient",
        (await store.getMedia(exportMediaId!))!,
      ),
      true,
    );
  }
  const notice = saved.notifications.find((n) =>
    n.id.includes(":export-ready:"),
  )!;
  assert.equal(
    notice.url,
    `http://localhost/collection/${c.id}/review?key=${c.ownerKey}`,
  );
  assert.equal(
    await delivery.currentNotificationSuppressionReason(saved, notice),
    null,
  );
  const changed = structuredClone(saved);
  changed.chapters[0].playback!.exportSha256 = "f".repeat(64);
  assert.equal(await playback.playbackExportReady(changed, exported), false);
  assert.equal(
    media.mediaAllowed(
      changed,
      "recipient",
      (await store.getMedia(saved.chapters[0].playback!.exportMediaId!))!,
    ),
    false,
  );
});
