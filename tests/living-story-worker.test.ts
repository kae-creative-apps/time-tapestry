import assert from "node:assert/strict";
import { before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prepareCollection } from "../src/lib/collection/create";
import { chapterDurationFrames, VIDEO_FPS } from "../src/lib/video-plan";
import type { Collection, StoredMedia } from "../src/lib/collection/types";
import type { StoryEditorRequest } from "../src/lib/collection/story-editorial";
import type { renderOriginalFilm } from "../src/lib/collection/films/original-render";
import type { transcribeOriginal } from "../src/lib/collection/films/transcription";

const exec = promisify(execFile);
let store: typeof import("../src/lib/collection/store");
let media: typeof import("../src/lib/collection/media");
let worker: typeof import("../src/lib/collection/living-story-worker");
let render: typeof import("../src/lib/collection/films/render");
let scratch: string;
before(async () => {
  for (const key of [
    "VERCEL",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "BLOB_READ_WRITE_TOKEN",
    "ELEVENLABS_API_KEY",
    "GLOO_API_KEY",
  ])
    delete process.env[key];
  scratch = await mkdtemp(path.join(os.tmpdir(), "living-story-worker-"));
  Object.assign(process.env, {
    NODE_ENV: "test",
    SECURITY_TEST_BYPASS: "true",
    SECURITY_LOCAL_BYPASS: "true",
    STORY_FILM_MIN_FREE_BYTES: "1",
    COLLECTION_DATA_DIR: path.join(scratch, "collections"),
  });
  store = await import("../src/lib/collection/store");
  media = await import("../src/lib/collection/media");
  worker = await import("../src/lib/collection/living-story-worker");
  render = await import("../src/lib/collection/films/render");
});

const transcription: typeof transcribeOriginal = async (_file, mediaId) =>
  ["I", "remember", "my", "mother", "listening."].map((text, index) => ({
    text,
    mediaId,
    startMs: 100 + index * 150,
    endMs: 200 + index * 150,
    speakerId: "speaker_0",
    languageCode: "en",
  }));
const edit: StoryEditorRequest = async (messages) => {
  const input = JSON.parse(messages[1].content);
  const ids = input.answers.map((answer: { id: string }) => answer.id);
  return {
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: JSON.stringify({
            paragraphs: [
              { text: "I remember my mother listening.", sourceIds: ids },
            ],
            postcardNote: "I remember my mother listening.",
            postcardSourceIds: ids,
          }),
        },
      },
    ],
  };
};

async function fixture(video = false) {
  const c = prepareCollection({
    initiationPath: "share",
    storyteller: { name: "Synthetic Storyteller", email: "story@example.test" },
    recipient: { name: "Synthetic Recipient", email: "recipient@example.test" },
  });
  c.status = "approved";
  c.chapters = [1, 2, 3, 4].map((index) => ({
    id: `q${index}`,
    title: `Approved story ${index}`,
    content: `Frozen original story ${index}.`,
    postcardNote: "Frozen note",
    sourceTakeIds: [`original-${index}`],
    videoStatus: "not_requested",
    editorialReviewed: true,
    generatedWith: "source_text",
  }));
  const momentId = randomUUID();
  const batchId = randomUUID();
  c.livingStory = {
    batches: [
      {
        id: batchId,
        requestId: randomUUID(),
        source: "owner",
        requestedByName: c.storyteller.name,
        promptIds: ["synthetic"],
        createdAt: c.createdAt,
      },
    ],
    moments: [
      {
        id: momentId,
        batchId,
        promptId: "synthetic",
        category: "character",
        title: "Someone who listened",
        question: "Who taught you to listen?",
        status: "draft",
        createdAt: c.createdAt,
      },
    ],
  };
  await store.putCollection(c);
  const source = path.join(scratch, `${randomUUID()}.${video ? "mp4" : "wav"}`);
  await exec("ffmpeg", [
    "-v",
    "error",
    ...(video ? ["-f", "lavfi", "-i", "color=c=blue:s=160x90:r=30:d=1"] : []),
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=1",
    ...(video
      ? ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac"]
      : ["-c:a", "pcm_s16le"]),
    source,
  ]);
  const stored = await media.saveLocalMedia(
    c.id,
    "owner",
    new File([await readFile(source)], video ? "memory.mp4" : "memory.wav", {
      type: video ? "video/mp4" : "audio/wav",
    }),
    undefined,
    momentId,
  );
  c.livingStory.moments[0].sourceMediaId = stored.id;
  c.livingStory.moments[0].kind = video ? "video" : "voice";
  c.livingStory.moments[0].status = "processing";
  c.livingStory.moments[0].processingApprovedAt = c.createdAt;
  c.livingStory.moments[0].processing = { state: "queued", attempts: 0 };
  await store.putCollection(c);
  return {
    c,
    stored,
    originalHash: await render.fileHash(stored.localPath!),
    chapters: structuredClone(c.chapters),
  };
}

function syntheticRender(
  options: {
    silent?: boolean;
    after?: () => Promise<void>;
    inspect?: (prepared: Parameters<typeof renderOriginalFilm>[0]) => void;
  } = {},
): typeof renderOriginalFilm {
  return async (prepared, output, _progress, assertCurrent) => {
    options.inspect?.(prepared);
    await assertCurrent();
    const duration = chapterDurationFrames(prepared.plan) / VIDEO_FPS;
    await exec("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      `color=c=blue:s=160x90:r=30:d=${duration}`,
      ...(!options.silent
        ? [
            "-f",
            "lavfi",
            "-i",
            `sine=frequency=440:sample_rate=48000:duration=${duration}`,
            "-c:a",
            "aac",
          ]
        : []),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-t",
      String(duration),
      output,
    ]);
    await options.after?.();
    return {
      schemaVersion: 1,
      status: "rendered-awaiting-review",
      narrationKind: "original_recording",
      outputSha256: await render.fileHash(output),
      planSha256: "a".repeat(64),
      durationSeconds: duration,
      sourceAssets: prepared.sourceAssets,
      captions: "source-word-timed",
      releaseEligible: false,
    };
  };
}

test("audio and camera memories prepare complete original-source films and written stories without changing the original gift", async (t) => {
  for (const video of [false, true])
    await t.test(video ? "camera" : "audio", async () => {
      const { c, stored, originalHash, chapters } = await fixture(video);
      const result = await worker.runLivingStoryWorkerOnce("synthetic", {
        transcribe: transcription,
        edit,
        render:
          process.env.LIVING_STORY_REAL_RENDER === "1"
            ? undefined
            : syntheticRender({
                inspect: ({ plan }) => {
                  assert.equal(
                    plan.promptQuestion,
                    c.livingStory!.moments[0].question,
                  );
                  assert.equal(plan.sources.length, 1);
                  assert.equal(plan.sources[0].assetId, stored.id);
                  assert.equal(plan.clips[0].kind, video ? "video" : "audio");
                  assert.equal(plan.clips[0].inMs, 0);
                  assert.ok(plan.clips[0].outMs >= 1000);
                },
              }),
      });
      assert.equal(result?.status, "published");
      assert.equal(result!.sourceMediaId, stored.id);
      assert.equal(result!.sourceSha256, originalHash);
      assert.equal(result!.content, "I remember my mother listening.");
      const output = (await store.getMedia(result!.videoMediaId!))!;
      assert.equal(output.provenance, "generated_film");
      assert.equal(output.livingStoryMomentId, result!.id);
      assert.equal(output.originalSourceMediaId, stored.id);
      assert.deepEqual(
        (await render.probeFilm(output.localPath!)).types.sort(),
        ["audio", "video"],
      );
      assert.equal(await render.fileHash(stored.localPath!), originalHash);
      assert.deepEqual((await store.getCollection(c.id))!.chapters, chapters);
      assert.deepEqual(
        await store.getMedia(stored.id),
        JSON.parse(JSON.stringify(stored)),
      );
    });
});

test("invalid written drafts and silent rendered outputs fail without publishing", async () => {
  for (const failure of ["written", "audio"] as const) {
    const { c, chapters } = await fixture();
    let renders = 0;
    const result = await worker.runLivingStoryWorkerOnce("synthetic", {
      transcribe: transcription,
      edit:
        failure === "written"
          ? async () => ({
              choices: [
                { finish_reason: "length", message: { content: "{}" } },
              ],
            })
          : edit,
      render: async (...args) => {
        renders++;
        return syntheticRender({ silent: failure === "audio" })(...args);
      },
    });
    assert.equal(result?.status, "needs_attention");
    assert.equal(result!.videoMediaId, undefined);
    assert.equal(result!.content, undefined);
    assert.equal(result!.processing!.attempts, 1);
    assert.equal(renders, failure === "written" ? 0 : 1);
    assert.deepEqual((await store.getCollection(c.id))!.chapters, chapters);
  }
});

test("source bytes changed during rendering cannot be published", async () => {
  const { c, stored } = await fixture();
  const result = await worker.runLivingStoryWorkerOnce("synthetic", {
    transcribe: transcription,
    edit,
    render: syntheticRender({
      after: async () => {
        const bytes = await readFile(stored.localPath!);
        bytes[bytes.length - 1] ^= 127;
        await writeFile(stored.localPath!, bytes);
      },
    }),
  });
  assert.equal(result?.status, "needs_attention");
  assert.equal(
    (await store.getCollection(c.id))!.livingStory!.moments[0].videoMediaId,
    undefined,
  );
});

test("camera recordings without audio stop before transcription or publication", async () => {
  const { c, stored, chapters } = await fixture(true);
  const silent = path.join(scratch, `${randomUUID()}.mp4`);
  await exec("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=160x90:r=30:d=1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    silent,
  ]);
  const bytes = await readFile(silent);
  await writeFile(stored.localPath!, bytes);
  await store.putMedia({ ...stored, bytes: bytes.length });
  let transcriptions = 0;
  const result = await worker.runLivingStoryWorkerOnce("synthetic", {
    transcribe: async (...args) => {
      transcriptions++;
      return transcription(...args);
    },
    edit,
    render: async () => {
      throw new Error("A silent source must never reach the renderer");
    },
  });
  assert.equal(result?.status, "needs_attention");
  assert.equal(result!.videoMediaId, undefined);
  assert.equal(transcriptions, 0);
  assert.deepEqual((await store.getCollection(c.id))!.chapters, chapters);
});

test("a replacement lease cannot be completed or failed by the previous worker", async () => {
  const { c } = await fixture();
  const replacement = randomUUID();
  await worker.runLivingStoryWorkerOnce("synthetic", {
    transcribe: transcription,
    edit,
    render: syntheticRender({
      after: async () => {
        await store.mutateCollection(c.id, (current) => {
          current.livingStory!.moments[0].processing!.leaseId = replacement;
          return current;
        });
      },
    }),
  });
  const moment = (await store.getCollection(c.id))!.livingStory!.moments[0];
  assert.equal(moment.status, "processing");
  assert.equal(moment.processing!.leaseId, replacement);
  assert.equal(moment.videoMediaId, undefined);
  // Retire this synthetic replacement so subsequent queue tests select their fixture.
  await store.mutateCollection(c.id, (current) => {
    current.livingStory!.moments[0].status = "declined";
    return current;
  });
});

test("a bounded retry reuses verified caches even when the editor is no longer configured", async () => {
  const { c } = await fixture();
  let transcriptions = 0,
    edits = 0;
  const options = {
    transcribe: async (...args: Parameters<typeof transcribeOriginal>) => {
      transcriptions++;
      return transcription(...args);
    },
    edit: async (...args: Parameters<StoryEditorRequest>) => {
      edits++;
      return edit(...args);
    },
  };
  assert.equal(
    (
      await worker.runLivingStoryWorkerOnce("synthetic", {
        ...options,
        render: async () => {
          throw new Error("Synthetic interruption");
        },
      })
    )?.status,
    "needs_attention",
  );
  await store.mutateCollection(c.id, (current) => {
    current.livingStory!.moments[0].status = "processing";
    return current;
  });
  assert.equal(
    (
      await worker.runLivingStoryWorkerOnce("synthetic", {
        transcribe: options.transcribe,
        render: syntheticRender(),
      })
    )?.status,
    "published",
  );
  assert.equal(transcriptions, 1);
  assert.equal(edits, 1);
});

test("an unconfigured editor stops fresh work before a transcription provider is called", async () => {
  const { c } = await fixture();
  assert.equal(process.env.GLOO_API_KEY, undefined);
  let transcriptions = 0,
    renders = 0;
  const result = await worker.runLivingStoryWorkerOnce("unconfigured", {
    transcribe: async (...args) => {
      transcriptions++;
      return transcription(...args);
    },
    render: async (...args) => {
      renders++;
      return syntheticRender()(...args);
    },
  });
  assert.equal(result?.status, "needs_attention");
  assert.equal(transcriptions, 0);
  assert.equal(renders, 0);
  assert.equal(
    (await store.getCollection(c.id))!.livingStory!.moments[0].videoMediaId,
    undefined,
  );
});

test("a stopped worker leaves queued memories unclaimed", async () => {
  const { c } = await fixture();
  assert.equal(
    await worker.runLivingStoryWorkerOnce("stopped", {
      shouldStop: () => true,
    }),
    null,
  );
  const moment = (await store.getCollection(c.id))!.livingStory!.moments[0];
  assert.equal(moment.processing!.state, "queued");
  assert.equal(moment.processing!.attempts, 0);
});
