import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import type { StoredMedia } from "../src/lib/collection/types";
import { pcmWavFixture } from "./pcm-wav-fixture";

let directory: string;
let validate: typeof import("../src/lib/collection/reply-media").validateReplyRecording;
before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "reply-media-"));
  process.env.COLLECTION_DATA_DIR = directory;
  for (const key of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "VERCEL"])
    delete process.env[key];
  await mkdir(path.join(directory, "media"));
  validate = (await import("../src/lib/collection/reply-media"))
    .validateReplyRecording;
});
after(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function stored(
  bytes: Uint8Array,
  mimeType = "audio/wav",
): Promise<StoredMedia> {
  const id = randomUUID();
  const localPath = path.join(directory, "media", id);
  await writeFile(localPath, bytes);
  return {
    id,
    localPath,
    bytes: bytes.length,
    mimeType,
    collectionId: "synthetic-reply",
    role: "recipient",
    createdAt: new Date().toISOString(),
    originalName: "reply.wav",
  };
}

test("actual recording packets are required, while unreadable replies return a safe recoverable error", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error(
      "Reply validation must not call providers for local media.",
    );
  });
  const valid = await stored(pcmWavFixture());
  await assert.doesNotReject(validate(valid));
  const incomplete = pcmWavFixture().slice(0, 500);
  const badChunk = pcmWavFixture();
  new DataView(badChunk.buffer).setUint32(40, badChunk.length * 2, true);
  const unavailable = {
    ...valid,
    localPath: path.join(directory, "media", "missing-private-recording"),
  };
  const cases: [string, StoredMedia][] = [
    [
      "MIME spoof with arbitrary text",
      await stored(new TextEncoder().encode("not a recording")),
    ],
    [
      "truncated data with truthful uploaded byte count",
      await stored(incomplete),
    ],
    ["truncated WAV header", await stored(pcmWavFixture().slice(0, 24))],
    ["chunk length outside finalized container", await stored(badChunk)],
    ["stored byte count differs", { ...valid, bytes: valid.bytes + 1 }],
    ["video label without a video track", { ...valid, mimeType: "video/webm" }],
    ["private storage temporarily unavailable", unavailable],
  ];
  for (const [name, media] of cases)
    await t.test(name, async () => {
      await assert.rejects(validate(media), (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /reply recording could not be read/i);
        assert.equal(error.message.includes(directory), false);
        return true;
      });
    });
});
