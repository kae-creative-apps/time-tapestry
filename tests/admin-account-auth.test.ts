import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { syntheticFilmCollection } from "./film-fixture";
import type { InterviewPreparationJob } from "../src/lib/collection/interview-preparation-types";
let directory: string;
let accounts: typeof import("../src/lib/accounts/service");
let auth: typeof import("../src/lib/admin-auth");
let store: typeof import("../src/lib/collection/store");
let login: typeof import("../src/app/api/admin/login/route").POST;
let list: typeof import("../src/app/api/admin/collections/route").GET;
let book: typeof import("../src/app/api/admin/collections/[id]/book/route").GET;
let retry: typeof import("../src/app/api/admin/collections/[id]/retry/route").POST;
let adminCookie: string;
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (
  url: string,
  cookie = "",
  body?: unknown,
  origin = "http://localhost",
) =>
  new NextRequest(`http://localhost${url}`, {
    method: body ? "POST" : "GET",
    headers: {
      cookie,
      ...(body ? { origin, "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
async function signIn(email: string, destination?: string, now = Date.now()) {
  const nonce = accounts.randomCredential();
  let token = "";
  await accounts.beginAccountLogin(
    email,
    nonce,
    {
      now,
      sendMail: async ({ url }) => {
        token = new URLSearchParams(new URL(url).hash.slice(1)).get("token")!;
      },
    },
    undefined,
    destination,
  );
  return accounts.confirmAccountLogin(token, nonce, now);
}
before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "admin-account-"));
  Object.assign(process.env, {
    NODE_ENV: "test",
    COLLECTION_DATA_DIR: directory,
    SECURITY_LOCAL_BYPASS: "true",
    SECURITY_TEST_BYPASS: "true",
    NEXT_PUBLIC_APP_URL: "https://admin-fixture.example.test",
    COLLECTION_EMAIL_ENABLED: "false",
    COLLECTION_DELIVERY_ENABLED: "false",
  });
  for (const name of [
    "VERCEL",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "RESEND_API_KEY",
    "LOB_API_KEY",
    "ELEVENLABS_API_KEY",
    "GLOO_API_KEY",
    "OPENAI_API_KEY",
  ])
    delete process.env[name];
  accounts = await import("../src/lib/accounts/service");
  auth = await import("../src/lib/admin-auth");
  store = await import("../src/lib/collection/store");
  login = (await import("../src/app/api/admin/login/route")).POST;
  list = (await import("../src/app/api/admin/collections/route")).GET;
  book = (await import("../src/app/api/admin/collections/[id]/book/route")).GET;
  retry = (await import("../src/app/api/admin/collections/[id]/retry/route"))
    .POST;
  adminCookie = `tt_account_session=${(await signIn("team@foronestudios.com")).sessionToken}`;
});
after(async () => {
  await rm(directory, { recursive: true, force: true });
});

test("only verified exact allowlisted accounts can enter admin, never a typed email or old secret", async () => {
  for (const email of ["team@foronestudios.com", "kbrooks@gloo.us"]) {
    const signed = await signIn(email, "/admin/collections/collection_123");
    assert.equal(signed.nextUrl, "/admin/collections/collection_123");
    assert.equal(
      (await auth.adminFromSession(signed.sessionToken))?.account.email,
      email,
    );
  }
  const ordinary = await signIn("member@gloo.us");
  for (const cookie of [
    "",
    "admin_token=old-shared-secret",
    "tt_account_session=team@foronestudios.com",
    `tt_account_session=${ordinary.sessionToken}`,
  ]) {
    const req = request("/api/admin/collections", cookie);
    assert.equal((await list(req)).status, 401);
    assert.equal((await book(req, params("collection_123"))).status, 401);
    assert.equal(
      (
        await retry(
          request("/api/admin/collections/collection_123/retry", cookie, {
            action: "retry_preparation",
          }),
          params("collection_123"),
        )
      ).status,
      401,
    );
  }
  assert.equal(
    await auth.adminForRequest(
      request(`/api/admin/collections?${adminCookie}`),
    ),
    null,
  );
});

test("expired and revoked verified admin sessions immediately lose access", async () => {
  const expired = await signIn(
    "kbrooks@gloo.us",
    undefined,
    Date.now() - 31 * 86400_000,
  );
  assert.equal(
    (
      await list(
        request(
          "/api/admin/collections",
          `tt_account_session=${expired.sessionToken}`,
        ),
      )
    ).status,
    401,
  );
  const active = await signIn("kbrooks@gloo.us");
  assert.ok(await auth.adminFromSession(active.sessionToken));
  await accounts.revokeAccountSession(active.sessionToken);
  assert.equal(await auth.adminFromSession(active.sessionToken), null);
  assert.equal(
    (
      await book(
        request(
          "/api/admin/collections/collection_123/book",
          `tt_account_session=${active.sessionToken}`,
        ),
        params("collection_123"),
      )
    ).status,
    401,
  );
});

test("admin magic-link destinations are server-stored and cannot redirect to credentials or another site", async () => {
  const signed = await signIn(
    "kbrooks@gloo.us",
    "https://attacker.test/?key=private",
  );
  assert.equal(signed.nextUrl, "/admin/collections");
  await assert.rejects(
    signIn("stranger@example.test", "/admin/collections"),
    /approved team email/,
  );
});

test("admin login rejects shared secrets, non-admin identities and cross-origin requests without contacting a provider", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new Error("No provider calls in this test");
  });
  assert.equal(
    (
      await login(
        request("/api/admin/login", "", { secret: "old-shared-secret" }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await login(
        request("/api/admin/login", "", { email: "not-admin@gloo.us" }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await login(
        request(
          "/api/admin/login",
          "",
          { email: "team@foronestudios.com" },
          "https://attacker.test",
        ),
      )
    ).status,
    403,
  );
  assert.equal(calls, 0);
});

test("admin PDF remains a private draft until approval, and export preserves long stories without links or lease tokens", async () => {
  const c = syntheticFilmCollection();
  c.chapters[0].content = "A complete family memory. ".repeat(100);
  await store.putCollection(c);
  const response = await book(
    request(`/api/admin/collections/${c.id}/book`, adminCookie),
    params(c.id),
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition") || "", /draft-book/);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  assert.equal(
    Buffer.from(await response.arrayBuffer())
      .subarray(0, 4)
      .toString(),
    "%PDF",
  );
  const admin = await import("../src/lib/admin-collections");
  const detail = await admin.adminCollectionDetail(c.id);
  assert.equal(
    detail?.collection.chapters[0].content.length,
    c.chapters[0].content.length,
  );
  const safe = admin.redactAdminSecrets({
    leaseId: "secret-lease",
    nested: {
      url: "https://private.test/asset",
      ownerKey: "owner-secret",
      error: "Failed https://private.test/?key=owner-secret",
    },
  });
  assert.equal(JSON.stringify(safe).includes("secret-lease"), false);
  assert.equal(JSON.stringify(safe).includes("private.test"), false);
  assert.equal(JSON.stringify(safe).includes("owner-secret"), false);
});

test("preparation retry preserves consent and originals, rejects stale or approved work, and cannot resend mail", async (t) => {
  const c = syntheticFilmCollection();
  c.status = "recording";
  c.takes = [];
  c.selectedTakeIds = {};
  c.chapters = [];
  const mediaId = `original_${randomUUID()}`;
  await store.putMedia({
    id: mediaId,
    collectionId: c.id,
    role: "owner",
    mimeType: "audio/webm",
    originalName: "synthetic.webm",
    bytes: 1024,
    createdAt: c.createdAt,
    provenance: "uploaded_recording",
    url: "https://private.example.test/synthetic.webm",
  });
  c.interviews = [
    {
      id: `session_${randomUUID()}`,
      provider: "elevenlabs",
      status: "completed",
      startedAt: c.createdAt,
      endedAt: c.createdAt,
      turns: [],
      excludedTurnIds: [],
      segments: [
        {
          id: `segment_${randomUUID()}`,
          mediaId,
          kind: "voice",
          startMs: 0,
          durationMs: 40000,
          createdAt: c.createdAt,
        },
      ],
    },
  ];
  await store.putCollection(c);
  // No original owner submission/consent, even an administrator cannot start processing.
  assert.equal(
    (
      await retry(
        request("/api/admin/retry", adminCookie, {
          action: "retry_preparation",
          expectedUpdatedAt: c.updatedAt,
        }),
        params(c.id),
      )
    ).status,
    409,
  );
  const preparation =
    await import("../src/lib/collection/interview-preparation");
  const queued = await preparation.enqueueInterviewPreparation(c.id, {
    processingApproved: true,
  });
  const job = await preparation.getInterviewPreparationJob(
    queued.preparation.id,
  );
  await store.writeRecord(job!.id, {
    ...job!,
    status: "needs_attention",
    attempts: 1,
    error: "Synthetic transient failure",
  } satisfies InterviewPreparationJob);
  const current = (await store.getCollection(c.id))!;
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new Error("Only queue work, never send in this test");
  });
  assert.equal(
    (
      await retry(
        request("/api/admin/retry", adminCookie, {
          action: "retry_preparation",
          expectedUpdatedAt: "outdated",
        }),
        params(c.id),
      )
    ).status,
    409,
  );
  const response = await retry(
    request("/api/admin/retry", adminCookie, {
      action: "retry_preparation",
      expectedUpdatedAt: current.updatedAt,
    }),
    params(c.id),
  );
  assert.equal(response.status, 202);
  const saved = (await store.getCollection(c.id))!;
  assert.deepEqual(saved.interviews, current.interviews);
  assert.deepEqual(saved.deliveries, current.deliveries);
  assert.equal(
    (await preparation.getInterviewPreparationJob(job!.id))!
      .processingApprovedAt,
    job!.processingApprovedAt,
  );
  // Duplicate requests are stale, not additional processing jobs.
  assert.equal(
    (
      await retry(
        request("/api/admin/retry", adminCookie, {
          action: "retry_preparation",
          expectedUpdatedAt: current.updatedAt,
        }),
        params(c.id),
      )
    ).status,
    409,
  );
  await store.putCollection({ ...saved, status: "approved" });
  assert.equal(
    (
      await retry(
        request("/api/admin/retry", adminCookie, {
          action: "retry_preparation",
          expectedUpdatedAt: saved.updatedAt,
        }),
        params(c.id),
      )
    ).status,
    409,
  );
  assert.equal(calls, 0);
});

test("admin override retries a held film job with a logged reason and keeps originals", async () => {
  const { syntheticRecordedFilmCollection } = await import("./film-fixture");
  const films = await import("../src/lib/collection/films/jobstore");
  const preparation = await import(
    "../src/lib/collection/interview-preparation"
  );
  const c = await syntheticRecordedFilmCollection();
  await store.putCollection(c);
  const queued = await preparation.enqueueInterviewPreparation(c.id, {
    processingApproved: true,
  });
  const filmJob = await films.enqueueAutomaticOriginalFilms(c, {
    processingApproved: true,
  });
  await store.writeRecord(queued.preparation.id, {
    ...(await preparation.getInterviewPreparationJob(queued.preparation.id))!,
    status: "films_queued",
    filmJobId: filmJob.id,
  });
  await store.mutateCollection(c.id, (current) => {
    current.interviewPreparation = {
      ...current.interviewPreparation!,
      status: "films_queued",
      filmJobId: filmJob.id,
    };
    return current;
  });
  await store.mutateRecord(filmJob.id, (job) => ({
    ...job!,
    status: "failed",
    attempts: 3,
    error: "Synthetic render failure",
  }));
  const current = (await store.getCollection(c.id))!;
  const originals = current.takes.map((take) => take.mediaId);
  assert.equal(
    (
      await retry(
        request("/api/admin/retry", adminCookie, {
          action: "retry_preparation",
          expectedUpdatedAt: current.updatedAt,
        }),
        params(c.id),
      )
    ).status,
    400,
  );
  const response = await retry(
    request("/api/admin/retry", adminCookie, {
      action: "retry_preparation",
      expectedUpdatedAt: current.updatedAt,
      reason: "Worker was out of disk.",
    }),
    params(c.id),
  );
  assert.equal(response.status, 202, await response.clone().text());
  const retried = await films.getFilmJob(filmJob.id);
  assert.equal(retried?.status, "queued");
  assert.equal(retried?.adminRetryOverride?.reason, "Worker was out of disk.");
  assert.equal(retried?.adminRetryOverride?.email, "team@foronestudios.com");
  const saved = (await store.getCollection(c.id))!;
  assert.deepEqual(
    saved.takes.map((take) => take.mediaId),
    originals,
  );
  const events = (
    await Promise.all(
      (await readdir(path.join(directory, "audit"))).map((name) =>
        readFile(path.join(directory, "audit", name), "utf8"),
      ),
    )
  ).join("");
  assert.ok(events.includes("Worker was out of disk."));
  assert.ok(events.includes("team@foronestudios.com"));
  assert.equal(events.includes(c.storyteller.email), false);
});

test("admin HTTP email verification issues only a browser-bound request until confirmation and sign-out revokes access", async (t) => {
  let token = "";
  Object.assign(process.env, {
    RESEND_API_KEY: "synthetic_not_sent",
    RESEND_FROM_EMAIL: "Time Tapestry <no-reply@example.test>",
  });
  t.after(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
  });
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, options?: RequestInit) => {
      assert.equal(String(url), "https://api.resend.com/emails");
      const payload = JSON.parse(String(options?.body));
      assert.deepEqual(payload.to, ["team@foronestudios.com"]);
      token = /#token=([a-f0-9]{64})/.exec(payload.text)![1];
      return Response.json({ id: "synthetic-email-accepted" });
    },
  );
  const response = await login(
    request("/api/admin/login", "", {
      email: "team@foronestudios.com",
      redirect: "/admin/collections",
    }),
  );
  assert.equal(response.status, 202);
  const nonceCookie = response.headers.get("set-cookie")!.split(";")[0];
  assert.match(nonceCookie, /^tt_login_request=/);
  assert.equal((await response.text()).includes(token), false);
  assert.equal(
    await auth.adminForRequest(request("/api/admin/collections", nonceCookie)),
    null,
  );
  const confirm = (await import("../src/app/api/account/verify/route")).POST;
  assert.equal(
    (await confirm(request("/api/account/verify", "", { token }))).status,
    400,
  );
  const verified = await confirm(
    request("/api/account/verify", nonceCookie, { token }),
  );
  assert.equal(verified.status, 200);
  assert.equal((await verified.json()).nextUrl, "/admin/collections");
  const cookie = /tt_account_session=[a-f0-9]{64}/.exec(
    verified.headers.get("set-cookie")!,
  )![0];
  assert.ok(
    await auth.adminForRequest(request("/api/admin/collections", cookie)),
  );
  const logout = (await import("../src/app/api/admin/logout/route")).POST;
  assert.equal(
    (await logout(request("/api/admin/logout", cookie, {}))).status,
    200,
  );
  assert.equal(
    await auth.adminForRequest(request("/api/admin/collections", cookie)),
    null,
  );
});
