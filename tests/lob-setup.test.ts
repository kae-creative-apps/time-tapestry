import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import {
  LOB_SETUP_LIFETIME_MS,
  startLobBrowserSetup,
} from "../scripts/configure-lob.mjs";

test("Lob setup lasts four hours and keeps its saved confirmation without rewriting the key", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "lob-setup-test-"));
  const file = path.join(directory, ".env.local");
  await writeFile(file, "COLLECTION_DELIVERY_ENABLED=false\nOTHER_SETTING=retained\n");
  let expire = () => {};
  let scheduledDuration = 0;
  const now = Date.UTC(2026, 9, 3, 22);
  const setup = await startLobBrowserSetup(file, false, {
    now: () => now,
    scheduleExpiry: ((callback: () => void, duration: number) => {
      expire = callback;
      scheduledDuration = duration;
      return setTimeout(() => {}, duration).unref();
    }) as typeof setTimeout,
  });
  t.after(async () => {
    setup.server.close();
    setup.server.closeAllConnections();
    await rm(directory, { recursive: true, force: true });
  });
  assert.equal(scheduledDuration, 4 * 60 * 60_000);
  assert.equal(LOB_SETUP_LIFETIME_MS, scheduledDuration);
  assert.equal(setup.expiresAt.getTime(), now + scheduledDuration);
  const form = await fetch(setup.url);
  const html = await form.text();
  assert.equal(form.status, 200);
  assert.equal(form.headers.get("cache-control"), "no-store");
  assert.match(html, /2026-10-04T02:00:00.000Z/);
  const csrf = html.match(/name="csrf" value="([^"]+)"/)?.[1];
  assert.ok(csrf);
  const key = "test_" + "a".repeat(32);
  const submit = (value: string) => fetch(setup.url, {
    method: "POST",
    redirect: "manual",
    headers: {
      Origin: new URL(setup.url).origin,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: new URLSearchParams({ csrf, key: value }),
  });
  const saved = await submit(key);
  assert.equal(saved.status, 303);
  assert.equal(saved.headers.get("location"), new URL(setup.url).pathname);
  const contents = await readFile(file, "utf8");
  const savedStat = await stat(file);
  assert.equal(savedStat.mode & 0o777, 0o600);
  assert.equal(contents, `COLLECTION_DELIVERY_ENABLED=false\nOTHER_SETTING=retained\nLOB_API_KEY=${key}\n`);
  const confirmation = await (await fetch(setup.url)).text();
  assert.match(confirmation, /Your Lob test key is saved/);
  assert.match(confirmation, /2026-10-04T02:00:00.000Z/);
  assert.ok(!confirmation.includes(key));
  assert.ok(!confirmation.includes("name=\"key\""));
  assert.equal((await submit("test_" + "b".repeat(32))).status, 303);
  assert.equal(await readFile(file, "utf8"), contents);
  assert.equal((await stat(file)).mtimeMs, savedStat.mtimeMs);
  const closed = once(setup.server, "close");
  expire();
  await closed;
  assert.equal(setup.server.listening, false);
  await assert.rejects(fetch(setup.url));
});

test("Lob setup retains request checks and refuses live keys before any save", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "lob-setup-security-"));
  const file = path.join(directory, ".env.local");
  const setup = await startLobBrowserSetup(file);
  t.after(async () => {
    setup.server.close();
    setup.server.closeAllConnections();
    await rm(directory, { recursive: true, force: true });
  });
  const html = await (await fetch(setup.url)).text();
  const csrf = html.match(/name="csrf" value="([^"]+)"/)?.[1];
  assert.ok(csrf);
  const request = (headers: Record<string, string>, body: URLSearchParams) =>
    fetch(setup.url, { method: "POST", headers, body, redirect: "manual" });
  const validHeaders = {
    Origin: new URL(setup.url).origin,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  const validFields = new URLSearchParams({ csrf, key: "test_" + "a".repeat(32) });
  const wrongHostStatus = await new Promise<number | undefined>((resolve, reject) => {
    const req = httpRequest(setup.url, { headers: { Host: "attacker.example" } }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    req.on("error", reject);
    req.end();
  });
  assert.equal(wrongHostStatus, 404);
  assert.equal((await request({ ...validHeaders, Origin: "https://attacker.example" }, validFields)).status, 403);
  assert.equal((await request(validHeaders, new URLSearchParams({ csrf: "wrong", key: "test_" + "a".repeat(32) }))).status, 403);
  assert.equal((await request(validHeaders, new URLSearchParams({ csrf, key: "live_" + "a".repeat(32) }))).status, 400);
  assert.equal((await request(validHeaders, new URLSearchParams({ csrf, key: "a".repeat(5000) }))).status, 413);
  await assert.rejects(readFile(file), { code: "ENOENT" });
  assert.equal((await fetch(setup.url)).status, 200);
});
