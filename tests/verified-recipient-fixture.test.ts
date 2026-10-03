import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { verifiedRecipientCookie } from "./verified-recipient-fixture";

test("recipient fixture signs in under the CI localhost origin and restores the caller environment on success or failure", async (t) => {
  const previous = { ...process.env };
  const directory = await mkdtemp(path.join(os.tmpdir(), "recipient-fixture-"));
  for (const name of ["VERCEL", "KV_REST_API_URL", "KV_REST_API_TOKEN"])
    delete process.env[name];
  Object.assign(process.env, {
    NODE_ENV: "test",
    COLLECTION_DATA_DIR: directory,
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  });
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("The synthetic sign-in must not contact a provider.");
  });
  try {
    const cookie = await verifiedRecipientCookie("recipient@example.test");
    assert.equal(process.env.NEXT_PUBLIC_APP_URL, "http://localhost:3000");
    const { accountFromSession } = await import("../src/lib/accounts/service");
    const account = await accountFromSession(cookie.split("=")[1]);
    assert.equal(account?.account.email, "recipient@example.test");
    await assert.rejects(
      verifiedRecipientCookie("invalid-email"),
      /valid email/,
    );
    assert.equal(process.env.NEXT_PUBLIC_APP_URL, "http://localhost:3000");

    delete process.env.NEXT_PUBLIC_APP_URL;
    await verifiedRecipientCookie("another-recipient@example.test");
    assert.equal(process.env.NEXT_PUBLIC_APP_URL, undefined);
    await assert.rejects(
      verifiedRecipientCookie("still-invalid"),
      /valid email/,
    );
    assert.equal(process.env.NEXT_PUBLIC_APP_URL, undefined);
  } finally {
    for (const name of Object.keys(process.env))
      if (!(name in previous)) delete process.env[name];
    Object.assign(process.env, previous);
    await rm(directory, { recursive: true, force: true });
  }
});
