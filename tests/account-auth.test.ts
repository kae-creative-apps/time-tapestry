import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

const hash = (v: string) => createHash("sha256").update(v).digest("hex");
test("verified email accounts require single-use, browser-bound proof and keep private library roles isolated", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tapestry-accounts-"));
  for (const key of [
    "VERCEL",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
  ])
    delete process.env[key];
  Object.assign(process.env, {
    NODE_ENV: "test",
    COLLECTION_DATA_DIR: directory,
    NEXT_PUBLIC_APP_URL: "https://example.test",
    SECURITY_LOCAL_BYPASS: "true",
    SECURITY_TEST_BYPASS: "true",
  });
  const service = await import("../src/lib/accounts/service");
  const { prepareCollection } = await import("../src/lib/collection/create");
  const store = await import("../src/lib/collection/store");
  const { GET: view } =
    await import("../src/app/api/account/verification/route");
  const { POST: confirm } = await import("../src/app/api/account/verify/route");
  const { GET: library } = await import("../src/app/api/account/library/route");
  const { GET: open } =
    await import("../src/app/api/account/library/[id]/open/route");
  const { POST: requestLink } =
    await import("../src/app/api/account/request-link/route");
  const { sendAccountLink } = await import("../src/lib/accounts/mail");
  const mailLinks: string[] = [];
  const fakeSend = async (m: { url: string }) => {
    mailLinks.push(m.url);
  };
  const tokenFromLink = () =>
    new URLSearchParams(new URL(mailLinks.at(-1)!).hash.slice(1)).get("token")!;
  const nonce = service.randomCredential();
  const now = Date.now();
  const start = async (email: string, at = now) => {
    const result = await service.beginAccountLogin(email, nonce, {
      sendMail: fakeSend,
      now: at,
    });
    assert.deepEqual(Object.keys(result).sort(), ["message", "ok"]);
    assert.equal(new URL(mailLinks.at(-1)!).search, "");
    return tokenFromLink();
  };
  const rawRecords = async () =>
    (
      await Promise.all(
        (await readdir(directory))
          .filter((n) => n.endsWith(".json"))
          .map((n) => readFile(path.join(directory, n), "utf8")),
      )
    ).join("\n");
  const req = (url: string, body?: unknown, cookies?: string, headers = {}) =>
    new NextRequest(`http://localhost${url}`, {
      ...(body === undefined
        ? {}
        : { method: "POST", body: JSON.stringify(body) }),
      headers: {
        "content-type": "application/json",
        ...(cookies ? { cookie: cookies } : {}),
        ...headers,
      },
    });
  try {
    await assert.rejects(
      service.beginAccountLogin("owner@example.test", nonce),
      /Email sign-in is not connected/,
    );
    const missing = await requestLink(
      req("/api/account/request-link", { email: "setup@example.test" }),
    );
    assert.equal(missing.status, 503);
    assert.match(missing.headers.get("cache-control")!, /no-store/);
    const token = await start(" OWNER@example.test ");
    const stored = await rawRecords();
    assert.equal(stored.includes(token), false);
    assert.equal(stored.includes(nonce), false);
    assert.equal(
      (await service.verificationView(token, "f".repeat(64))).reason,
      "different_browser",
    );
    assert.equal(
      (await service.verificationView(token, nonce)).canConfirm,
      true,
    );
    await assert.rejects(
      service.confirmAccountLogin(token, "f".repeat(64)),
      /browser/,
    );
    const query = await view(
      req(
        `/api/account/verification?token=${token}`,
        undefined,
        `tt_login_request=${nonce}`,
      ),
    );
    assert.equal(
      query.status,
      400,
      "Tokens are accepted only in headers, not access-log query strings",
    );
    for (let count = 0; count < 2; count++) {
      const response = await view(
        req(
          "/api/account/verification",
          undefined,
          `tt_login_request=${nonce}`,
          { "X-Account-Verification": token },
        ),
      );
      const body = await response.json();
      assert.equal(body.canConfirm, true);
      assert.equal(body.emailHint, "o****@example.test");
      assert.equal(JSON.stringify(body).includes(token), false);
    }
    const concurrent = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        service.confirmAccountLogin(token, nonce, now),
      ),
    );
    assert.equal(concurrent.filter((r) => r.status === "fulfilled").length, 1);
    const success = concurrent.find(
      (r) => r.status === "fulfilled",
    ) as PromiseFulfilledResult<
      Awaited<ReturnType<typeof service.confirmAccountLogin>>
    >;
    assert.equal(success.value.account.email, "owner@example.test");
    assert.equal(
      (await rawRecords()).includes(success.value.sessionToken),
      false,
    );
    assert.equal(
      (await service.accountFromSession(success.value.sessionToken, now))
        ?.account.email,
      "owner@example.test",
    );
    assert.equal(
      (await service.verificationView(token, nonce)).reason,
      "already_used",
    );
    assert.equal(
      await service.accountFromSession(
        success.value.sessionToken,
        now + service.ACCOUNT_SESSION_SECONDS * 1000,
      ),
      null,
    );
    const expired = await start("expired@example.test", now - 901000);
    await assert.rejects(
      service.confirmAccountLogin(expired, nonce, now),
      /expired/,
    );
    let rejectedToken = "";
    await assert.rejects(
      service.beginAccountLogin("failure@example.test", nonce, {
        sendMail: async (m) => {
          rejectedToken = new URLSearchParams(new URL(m.url).hash.slice(1)).get(
            "token",
          )!;
          throw new Error("Fixture rejection");
        },
      }),
      /Fixture rejection/,
    );
    await assert.rejects(
      service.confirmAccountLogin(rejectedToken, nonce),
      /expired/,
    );

    const make = (email: string) =>
      prepareCollection({
        initiationPath: "share",
        storyteller: { name: "Narrator", email },
        recipient: { name: "Recipient", email: "recipient@example.test" },
        requester: { name: "Requester", email: "requester@example.test" },
      });
    const mine = make("owner@example.test"),
      foreign = make("someone-else@example.test");
    await store.writeRecord(mine.id, mine);
    await store.writeRecord(foreign.id, foreign);
    const list = await service.accountLibrary(success.value.account);
    assert.equal(list.total, 1);
    assert.equal(list.items[0].role, "owner");
    for (const secret of [mine.ownerKey, mine.recipientKey, mine.requesterKey])
      assert.equal(JSON.stringify(list).includes(secret), false);
    const unauthorized = await library(
      req(
        "/api/account/library",
        undefined,
        "tt_account_session=owner@example.test",
      ),
    );
    assert.equal(unauthorized.status, 401);
    const ownerPath = await service.accountCollectionPath(
      success.value.account,
      mine.id,
    );
    assert.equal(ownerPath, `/record/${mine.id}?key=${mine.ownerKey}`);
    await assert.rejects(
      service.accountCollectionPath(success.value.account, foreign.id),
      /not found/,
    );
    const denied = await open(
      req(
        "/api/account/library",
        undefined,
        `tt_account_session=${success.value.sessionToken}`,
      ),
      { params: Promise.resolve({ id: foreign.id }) },
    );
    assert.equal(denied.status, 404);
    const redirect = await open(
      req(
        "/api/account/library",
        undefined,
        `tt_account_session=${success.value.sessionToken}`,
      ),
      { params: Promise.resolve({ id: mine.id }) },
    );
    assert.equal(redirect.status, 303);
    assert.equal(redirect.headers.get("location"), ownerPath);
    const additional = Array.from({ length: 31 }, () =>
      make("owner@example.test"),
    );
    await Promise.all(
      additional.map((item) => store.writeRecord(item.id, item)),
    );
    const pilotLibrary = await service.accountLibrary(success.value.account);
    assert.equal(pilotLibrary.total, 32);
    assert.equal(new Set(pilotLibrary.items.map((item) => item.id)).size, 32);
    assert.ok(pilotLibrary.items.every((item) => item.role === "owner"));
    const recipientToken = await start("recipient@example.test");
    const recipient = await service.confirmAccountLogin(recipientToken, nonce);
    const recipientItems = await service.accountLibrary(recipient.account);
    assert.ok(
      recipientItems.items.every(
        (i) =>
          i.role === "recipient" &&
          i.storyCount === 0 &&
          i.recordingCount === 0,
      ),
    );
    assert.equal(
      await service.accountCollectionPath(recipient.account, mine.id),
      `/collection/${mine.id}`,
    );
    const requesterToken = await start("requester@example.test");
    const requester = await service.confirmAccountLogin(requesterToken, nonce);
    assert.equal(
      (await service.accountLibrary(requester.account)).items[0].role,
      "requester",
    );
    assert.equal(
      await service.accountCollectionPath(requester.account, mine.id),
      `/collection/${mine.id}?key=${mine.requesterKey}`,
    );

    const apiToken = await start("api@example.test");
    const response = await confirm(
      req(
        "/api/account/verify",
        { token: apiToken },
        `tt_login_request=${nonce}`,
      ),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, nextUrl: "/account" });
    assert.match(response.headers.get("set-cookie")!, /HttpOnly/);
    assert.match(response.headers.get("set-cookie")!, /SameSite=lax/i);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    await service.revokeAccountSession(success.value.sessionToken);
    assert.equal(
      await service.accountFromSession(success.value.sessionToken),
      null,
    );

    const originalFetch = globalThis.fetch;
    process.env.RESEND_API_KEY = "fixture-never-sent";
    process.env.RESEND_FROM_EMAIL = "fixture@example.test";
    let calls = 0;
    globalThis.fetch = async (input, options) => {
      calls++;
      assert.equal(input, "https://api.resend.com/emails");
      assert.equal(
        new Headers(options?.headers).get("Idempotency-Key"),
        `account-login/${hash(apiToken)}`,
      );
      assert.equal(options?.redirect, "error");
      return new Response(JSON.stringify({ id: "fixture-email-accepted" }), {
        status: 200,
      });
    };
    try {
      await sendAccountLink({
        email: "fixture@example.test",
        url: mailLinks.at(-1)!,
        tokenId: hash(apiToken),
      });
      assert.equal(calls, 1);
      await assert.rejects(
        sendAccountLink({
          email: "fixture@example.test",
          url: "https://untrusted.test/account/verify#token=fixture",
          tokenId: "fixture",
        }),
        /safely/,
      );
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
