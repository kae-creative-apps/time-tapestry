import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { after, before, test } from "node:test";

// Runs the real storage code against a throwaway local Redis when one is installed.
const available =
  spawnSync("redis-server", ["--version"], { stdio: "ignore" }).status === 0;
const port = 6390 + Math.floor(Math.random() * 500);
let server: ChildProcess | undefined;
const saved = { ...process.env };

before(async () => {
  if (!available) return;
  server = spawn(
    "redis-server",
    ["--port", String(port), "--save", "", "--appendonly", "no"],
    { stdio: "ignore" },
  );
  await new Promise((r) => setTimeout(r, 400));
  process.env.REDIS_URL = `redis://127.0.0.1:${port}`;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  process.env.VERCEL = "1";
});
after(() => {
  server?.kill();
  process.env = saved;
  setTimeout(() => process.exit(0), 50).unref();
});

test("REDIS_URL stores, lists, locks and mutates collection records", { skip: !available }, async () => {
  const { readRecord, writeRecord, listCollections, mutateRecord } =
    await import("../src/lib/collection/store");
  const { kv, kvConfigured, usesRedisUrl } = await import("../src/lib/kv-client");
  assert.ok(kvConfigured() && usesRedisUrl());
  await writeRecord("redis-test-0001", { id: "redis-test-0001", schemaVersion: 2, name: "Gigi" });
  assert.deepEqual(await readRecord("redis-test-0001"), { id: "redis-test-0001", schemaVersion: 2, name: "Gigi" });
  assert.equal(await readRecord("missing-record"), null);
  // Strings are stored raw (lock tokens), objects as JSON, matching @vercel/kv.
  await kv.set("raw-token", "abc-123");
  assert.equal(await kv.get("raw-token"), "abc-123");
  assert.equal(await kv.set("raw-token", "other", { nx: true, ex: 30 }), null);
  const listed = await listCollections();
  assert.ok(listed.some((c) => c.id === "redis-test-0001"));
  // Concurrent mutations are serialized by the Redis lock and Lua compare-and-set.
  await Promise.all(
    Array.from({ length: 8 }, () =>
      mutateRecord<{ count: number }>("redis-counter", (r) => ({ count: (r?.count || 0) + 1 })),
    ),
  );
  assert.deepEqual(await readRecord("redis-counter"), { count: 8 });
  assert.equal(await kv.get("collection-v2:lock:redis-counter"), null);
  assert.equal(await kv.del("raw-token"), 1);
});

test("REDIS_URL backs the activity rate limiter", { skip: !available }, async () => {
  const { consumeLimit } = await import("../src/lib/security/rate-limit");
  await consumeLimit("redis-test-identity", 2, 60);
  await consumeLimit("redis-test-identity", 2, 60);
  await assert.rejects(consumeLimit("redis-test-identity", 2, 60), /take a moment/);
});
