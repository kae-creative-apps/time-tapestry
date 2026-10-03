import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

/** Synthetic local concurrency exercise, not a hosted capacity or provider latency benchmark. */
test("32 concurrent synthetic families can create, save media metadata and read back without cross-family access", async () => {
  for (const name of [
    "VERCEL",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "BLOB_READ_WRITE_TOKEN",
    "ELEVENLABS_API_KEY",
    "OPENAI_API_KEY",
    "GLOO_API_KEY",
    "RESEND_API_KEY",
    "LOB_API_KEY",
  ])
    delete process.env[name];
  Object.assign(process.env, {
    NODE_ENV: "test",
    SECURITY_LOCAL_BYPASS: "true",
    SECURITY_TEST_BYPASS: "true",
  });
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "tapestry-pilot-load-"),
  );
  process.env.COLLECTION_DATA_DIR = directory;
  try {
    const create = (await import("../src/app/api/collection/route")).POST;
    const read = (await import("../src/app/api/collection/[id]/route")).GET;
    const store = await import("../src/lib/collection/store");
    const { saveLocalMedia, mediaAllowed } =
      await import("../src/lib/collection/media");
    const { mediaBytes } = await import("../src/lib/collection/media");
    const requests = Array.from(
      { length: 32 },
      (_, index) =>
        new NextRequest("http://localhost/api/collection", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            initiationPath: "share",
            storyteller: {
              name: `Fixture ${index}`,
              email: `fixture${index}@example.test`,
            },
            recipient: {
              name: `Recipient ${index}`,
              email: `recipient${index}@example.test`,
            },
          }),
        }),
    );
    const created = await Promise.all(
      requests.map((request) => create(request)),
    );
    assert.ok(created.every((response) => response.status === 201));
    const views = await Promise.all(created.map((response) => response.json()));
    const collections = await Promise.all(
      views.map((value) => store.getCollection(value.collection.id)),
    );
    assert.equal(new Set(collections.map((c) => c!.id)).size, 32);
    const bytes = new Uint8Array(64 * 1024).fill(42);
    const media = await Promise.all(
      collections.map((c) =>
        saveLocalMedia(
          c!.id,
          "owner",
          new File([bytes], "synthetic.webm", { type: "video/webm" }),
        ),
      ),
    );
    const readbacks = await Promise.all(
      collections.map(async (c) => {
        const response = await read(
          new NextRequest(
            `http://localhost/api/collection/${c!.id}?key=${c!.ownerKey}`,
          ),
          { params: Promise.resolve({ id: c!.id }) },
        );
        assert.equal(response.status, 200);
        return response.json();
      }),
    );
    assert.ok(
      readbacks.every(
        (value) => value.collection.usage.usedBytes === bytes.length,
      ),
    );
    const contents = await Promise.all(media.map((item) => mediaBytes(item)));
    assert.ok(
      contents.every(
        (value) => Buffer.compare(Buffer.from(value), Buffer.from(bytes)) === 0,
      ),
    );
    for (let i = 0; i < collections.length; i++) {
      const c = collections[i]!,
        foreign = collections[(i + 1) % collections.length]!;
      assert.equal(mediaAllowed(c, "recipient", media[i]), false);
      assert.equal(mediaAllowed(foreign, "owner", media[i]), false);
      const response = await read(
        new NextRequest(
          `http://localhost/api/collection/${c.id}?key=${foreign.ownerKey}`,
        ),
        { params: Promise.resolve({ id: c.id }) },
      );
      assert.equal(response.status, 404);
    }
    await mkdir(path.join(directory, "backups", "private-copy"), {
      recursive: true,
    });
    await writeFile(
      path.join(directory, "backups", "private-copy", "duplicate.json"),
      JSON.stringify(collections[0]),
    );
    assert.equal(
      (await store.listCollections()).length,
      32,
      "Backup directories are excluded from active collection scans",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
