import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import type { Account, EmailVerification } from "../src/lib/accounts/types";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

test("recipient sign-in stores only a validated locator and returns to it after browser-bound verification", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "tapestry-recipient-login-"),
  );
  const prior = { ...process.env };
  const originalFetch = globalThis.fetch;
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
  const store = await import("../src/lib/collection/store");
  const { POST: requestLink } =
    await import("../src/app/api/account/request-link/route");
  const { POST: verify } = await import("../src/app/api/account/verify/route");
  const { GET: library } = await import("../src/app/api/account/library/route");
  const { GET: open } =
    await import("../src/app/api/account/library/[id]/open/route");
  const { prepareCollection } = await import("../src/lib/collection/create");
  const request = (route: string, body?: unknown, cookie?: string) =>
    new NextRequest(`http://localhost${route}`, {
      ...(body === undefined
        ? {}
        : { method: "POST", body: JSON.stringify(body) }),
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
    });
  const locator = { collectionId: "recipient-story-123", chapterId: "q2" };
  const nonce = service.randomCredential();
  try {
    assert.deepEqual(service.normalizeRecipientLocator(locator), locator);
    for (const invalid of [
      null,
      [],
      "/collection/recipient-story-123",
      {},
      { collectionId: "short" },
      { collectionId: "../recipient-story-123" },
      { collectionId: "recipient%2fstory-123" },
      { collectionId: "https://outside.test" },
      { collectionId: "a".repeat(81) },
      { ...locator, chapterId: "q5" },
      { ...locator, chapterId: "../q1" },
      { ...locator, chapterId: "q2?key=secret" },
      { ...locator, chapterId: null },
      { ...locator, view: "address" },
      { collectionId: locator.collectionId, view: "review" },
      { collectionId: locator.collectionId, view: "/address" },
      { collectionId: locator.collectionId, view: "../address" },
      { collectionId: locator.collectionId, view: "address?key=secret" },
      { collectionId: locator.collectionId, view: "https://outside.test" },
      { collectionId: locator.collectionId, view: null },
      { ...locator, key: "private-key" },
      { ...locator, nextUrl: "https://outside.test" },
    ]) {
      assert.throws(
        () => service.normalizeRecipientLocator(invalid),
        /not valid/,
      );
      const response = await requestLink(
        request("/api/account/request-link", {
          email: "invalid@example.test",
          recipientLocator: invalid,
        }),
      );
      assert.equal(response.status, 400);
    }

    const unavailable = await requestLink(
      request("/api/account/request-link", {
        email: "unavailable@example.test",
        recipientLocator: locator,
      }),
    );
    assert.equal(unavailable.status, 503);
    const unavailableBody = await unavailable.json();
    assert.match(unavailableBody.error, /temporarily unavailable/);
    assert.doesNotMatch(unavailableBody.error, /private.*link|key|bearer/i);

    let token = "";
    await service.beginAccountLogin(
      "recipient@example.test",
      nonce,
      {
        sendMail: async ({ url }) => {
          const link = new URL(url);
          token = new URLSearchParams(link.hash.slice(1)).get("token")!;
          assert.equal(link.pathname, "/account/verify");
          assert.equal(link.search, "");
          assert.equal(url.includes(locator.collectionId), false);
        },
      },
      locator,
    );
    const record = await store.readRecord<EmailVerification>(
      `login-${hash(token)}`,
    );
    assert.deepEqual(record?.recipientLocator, locator);
    assert.equal(JSON.stringify(record).includes(token), false);
    assert.equal(JSON.stringify(record).includes(nonce), false);
    assert.equal(
      (await service.verificationView(token, "f".repeat(64))).canConfirm,
      false,
    );
    await assert.rejects(
      service.confirmAccountLogin(token, "f".repeat(64)),
      /browser/,
    );
    const response = await verify(
      request(
        "/api/account/verify",
        {
          token,
          nextUrl: "https://outside.test",
          recipientLocator: {
            collectionId: "changed-story-123",
            chapterId: "q1",
          },
        },
        `tt_login_request=${nonce}`,
      ),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      nextUrl: "/collection/recipient-story-123/chapter/q2",
    });
    assert.match(response.headers.get("set-cookie")!, /HttpOnly/);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    await assert.rejects(
      service.confirmAccountLogin(token, nonce),
      /already used/,
    );

    // Exercise the real request route while intercepting all provider traffic.
    process.env.RESEND_API_KEY = "fixture-never-sent";
    process.env.RESEND_FROM_EMAIL = "fixture@example.test";
    let providerCalls = 0;
    let routeToken = "";
    globalThis.fetch = async (input, options) => {
      providerCalls++;
      assert.equal(input, "https://api.resend.com/emails");
      const payload = JSON.parse(String(options?.body));
      routeToken = payload.text.match(/#token=([a-f0-9]{64})/)[1];
      return new Response(JSON.stringify({ id: "fixture-only" }), {
        status: 200,
      });
    };
    const requested = await requestLink(
      request("/api/account/request-link", {
        email: "route@example.test",
        recipientLocator: { collectionId: locator.collectionId },
      }),
    );
    assert.equal(requested.status, 202);
    assert.equal(providerCalls, 1);
    assert.deepEqual(Object.keys(await requested.json()).sort(), [
      "message",
      "ok",
    ]);
    const routeNonce = requested.cookies.get("tt_login_request")!.value;
    const stored = await store.readRecord<EmailVerification>(
      `login-${hash(routeToken)}`,
    );
    assert.deepEqual(stored?.recipientLocator, {
      collectionId: locator.collectionId,
    });
    const login = await service.confirmAccountLogin(routeToken, routeNonce);
    assert.equal(login.nextUrl, `/collection/${locator.collectionId}`);

    const addressLocator = {
      collectionId: locator.collectionId,
      view: "address",
    };
    assert.deepEqual(
      service.normalizeRecipientLocator(addressLocator),
      addressLocator,
    );
    const addressRequest = await requestLink(
      request("/api/account/request-link", {
        email: "address@example.test",
        recipientLocator: addressLocator,
      }),
    );
    assert.equal(addressRequest.status, 202);
    assert.equal(providerCalls, 2);
    const addressNonce = addressRequest.cookies.get("tt_login_request")!.value;
    const addressRecord = await store.readRecord<EmailVerification>(
      `login-${hash(routeToken)}`,
    );
    assert.deepEqual(addressRecord?.recipientLocator, addressLocator);
    const addressVerified = await verify(
      request(
        "/api/account/verify",
        {
          token: routeToken,
          nextUrl: "https://outside.test",
          view: "review",
        },
        `tt_login_request=${addressNonce}`,
      ),
    );
    assert.equal(addressVerified.status, 200);
    assert.deepEqual(await addressVerified.json(), {
      ok: true,
      nextUrl: `/collection/${locator.collectionId}/address`,
    });

    const c = prepareCollection({
      initiationPath: "share",
      storyteller: { name: "Narrator", email: "owner@example.test" },
      recipient: { name: "Recipient", email: "route@example.test" },
      requester: { name: "Requester", email: "requester@example.test" },
    });
    await store.writeRecord(c.id, c);
    const opened = await open(
      request(
        "/api/account/library",
        undefined,
        `tt_account_session=${login.sessionToken}`,
      ),
      { params: Promise.resolve({ id: c.id }) },
    );
    assert.equal(opened.status, 303);
    assert.equal(opened.headers.get("location"), `/collection/${c.id}`);
    assert.equal(opened.headers.get("location")!.includes("key="), false);

    // A session record is insufficient when its account has no verified email proof.
    for (const verifiedAt of ["", "invalid-date"]) {
      await store.writeRecord(`account-${login.account.id}`, {
        ...login.account,
        verifiedAt,
      } as Account);
      assert.equal(await service.accountFromSession(login.sessionToken), null);
      assert.equal(
        (
          await library(
            request(
              "/api/account/library",
              undefined,
              `tt_account_session=${login.sessionToken}`,
            ),
          )
        ).status,
        401,
      );
      assert.equal(
        (
          await open(
            request(
              "/api/account/library",
              undefined,
              `tt_account_session=${login.sessionToken}`,
            ),
            { params: Promise.resolve({ id: c.id }) },
          )
        ).status,
        401,
      );
    }
    await store.writeRecord(`account-${login.account.id}`, login.account);
    assert.ok(await service.accountFromSession(login.sessionToken));
    await service.revokeAccountSession(login.sessionToken);
    assert.equal(await service.accountFromSession(login.sessionToken), null);
    assert.equal(
      (
        await library(
          request(
            "/api/account/library",
            undefined,
            `tt_account_session=${login.sessionToken}`,
          ),
        )
      ).status,
      401,
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env))
      if (!(key in prior)) delete process.env[key];
    Object.assign(process.env, prior);
    await rm(directory, { recursive: true, force: true });
  }
});
