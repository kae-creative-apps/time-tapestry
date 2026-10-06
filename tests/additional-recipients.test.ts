import assert from "node:assert/strict";
import { before, test } from "node:test";
import { mkdtemp, rename } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import {
  syntheticFilmCollection,
  syntheticOriginalFilmArtifact,
} from "./film-fixture";
import { verifiedRecipientCookie } from "./verified-recipient-fixture";
import type { Collection } from "../src/lib/collection/types";
import { pcmWavFixture } from "./pcm-wav-fixture";

let store: typeof import("../src/lib/collection/store");
let accounts: typeof import("../src/lib/accounts/service");
let media: typeof import("../src/lib/collection/media");
let delivery: typeof import("../src/lib/collection/delivery");
let collectionRoute: typeof import("../src/app/api/collection/[id]/route");
let inviteRoute: typeof import("../src/app/api/collection/[id]/recipients/route");
let mediaRoute: typeof import("../src/app/api/collection/[id]/media/route");
let uploadRoute: typeof import("../src/app/api/collection/[id]/media/upload/route");
let playbackRoute: typeof import("../src/app/api/collection/[id]/media/[mediaId]/route");
before(async () => {
  for (const key of [
    "VERCEL",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "RESEND_API_KEY",
    "LOB_API_KEY",
  ])
    delete process.env[key];
  Object.assign(process.env, {
    NODE_ENV: "test",
    SECURITY_TEST_BYPASS: "true",
    SECURITY_LOCAL_BYPASS: "true",
    COLLECTION_DATA_DIR: await mkdtemp(
      path.join(os.tmpdir(), "additional-recipients-"),
    ),
    NEXT_PUBLIC_APP_URL: "https://stories.example.test",
    COLLECTION_DELIVERY_ENABLED: "false",
    COLLECTION_EMAIL_ENABLED: "false",
    BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_synthetic_test_only",
  });
  store = await import("../src/lib/collection/store");
  accounts = await import("../src/lib/accounts/service");
  media = await import("../src/lib/collection/media");
  delivery = await import("../src/lib/collection/delivery");
  collectionRoute = await import("../src/app/api/collection/[id]/route");
  inviteRoute = await import("../src/app/api/collection/[id]/recipients/route");
  mediaRoute = await import("../src/app/api/collection/[id]/media/route");
  uploadRoute =
    await import("../src/app/api/collection/[id]/media/upload/route");
  playbackRoute =
    await import("../src/app/api/collection/[id]/media/[mediaId]/route");
});
const params = (c: Collection) => ({ params: Promise.resolve({ id: c.id }) });
function request(
  c: Collection,
  suffix: string,
  body?: unknown,
  cookie?: string,
  owner = false,
) {
  return new NextRequest(
    `http://localhost/api/collection/${c.id}${suffix}${owner ? `?key=${c.ownerKey}` : ""}`,
    {
      ...(body === undefined
        ? {}
        : {
            method: "POST",
            body: body instanceof FormData ? body : JSON.stringify(body),
          }),
      headers: {
        ...(body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...(cookie ? { cookie } : {}),
      },
    },
  );
}
const invite = (
  c: Collection,
  recipients: unknown[],
  owner = true,
  cookie?: string,
) =>
  inviteRoute.POST(
    request(c, "/recipients", { action: "invite", recipients }, cookie, owner),
    params(c),
  );
async function view(c: Collection, cookie?: string, owner = false) {
  const response = await collectionRoute.GET(
    request(c, "", undefined, cookie, owner),
    params(c),
  );
  return { status: response.status, body: await response.json() };
}
async function act(c: Collection, body: unknown, cookie: string) {
  const response = await collectionRoute.POST(
    request(c, "", body, cookie),
    params(c),
  );
  return { status: response.status, body: await response.json() };
}
const readMedia = (c: Collection, mediaId: string, cookie: string) =>
  playbackRoute.GET(request(c, `/media/${mediaId}`, undefined, cookie), {
    params: Promise.resolve({ id: c.id, mediaId }),
  });

test("additional recipients have unlimited membership, isolated verified access, and revocable branded invitations", async (t) => {
  const c = syntheticFilmCollection();
  c.recipient = { name: "Primary Person", email: "primary@example.test" };
  c.address = {
    name: "Primary Person",
    line1: "Private primary street",
    city: "Denver",
    region: "CO",
    postalCode: "80000",
    country: "US",
  };
  c.addressConfirmed = true;
  c.deliveries = c.chapters.map((chapter, index) => ({
    chapterId: chapter.id,
    scheduledFor: `2027-01-${String(1 + index * 2).padStart(2, "0")}T00:00:00.000Z`,
    status: "scheduled",
  }));
  await store.putCollection(c);
  assert.equal(
    (await invite(c, [{ email: "one@example.test" }])).status,
    400,
    "unapproved collections cannot invite",
  );
  c.status = "approved";
  c.approvedAt = c.createdAt;
  const film = await media.saveLocalMedia(
    c.id,
    "owner",
    new File(["approved film"], "film.webm", { type: "video/webm" }),
  );
  c.chapters[0].videoMediaId = film.id;
  c.chapters[0].videoStatus = "ready";
  c.chapters[0].film = syntheticOriginalFilmArtifact(
    c,
    c.chapters[0].id,
    film.id,
  );
  const legacy = await media.saveLocalMedia(
    c.id,
    "recipient",
    new File(["primary private reply"], "reply.webm", { type: "video/webm" }),
  );
  delete legacy.recipientId;
  await store.putMedia(legacy);
  c.replies = [
    {
      id: "legacy-primary-reply",
      chapterId: "q1",
      text: "Primary private words",
      mediaId: legacy.id,
      createdAt: c.createdAt,
    },
  ];
  await store.putCollection(c);
  const primaryCookie = await verifiedRecipientCookie(c.recipient.email);
  const alphaCookie = await verifiedRecipientCookie("alpha@example.test");
  const betaCookie = await verifiedRecipientCookie("beta@example.test");
  assert.equal(
    (
      await invite(
        c,
        [{ email: "stranger@example.test" }],
        false,
        primaryCookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (await view(c, alphaCookie)).status,
    404,
    "verified account alone is not membership",
  );

  await t.test(
    "normalize and deduplicate without a five-recipient cap or changing primary mail",
    async () => {
      const response = await invite(c, [
        { email: " ALPHA@EXAMPLE.TEST ", name: "Alpha" },
        { email: "alpha@example.test", name: "Duplicate" },
        { email: "beta@example.test", name: "Beta" },
        { email: c.recipient.email },
        ...Array.from({ length: 6 }, (_, i) => ({
          email: `extra-${i}@example.test`,
        })),
      ]);
      assert.equal(response.status, 200, await response.clone().text());
      let saved = (await store.getCollection(c.id))!;
      assert.equal(saved.additionalRecipients!.length, 8);
      assert.equal(
        saved.notifications.filter((n) => n.kind === "recipient_invitation")
          .length,
        8,
      );
      assert.equal(
        (await invite(c, [{ email: "alpha@example.test" }])).status,
        200,
      );
      assert.equal(
        (
          await invite(
            c,
            Array.from({ length: 25 }, (_, i) => ({
              email: `batch-${i}@example.test`,
            })),
          )
        ).status,
        200,
      );
      saved = (await store.getCollection(c.id))!;
      assert.equal(saved.additionalRecipients!.length, 33);
      assert.equal(
        (
          await invite(
            c,
            Array.from({ length: 26 }, (_, i) => ({
              email: `too-many-${i}@example.test`,
            })),
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await invite(c, [
            { email: "valid-new@example.test" },
            { email: "invalid" },
          ])
        ).status,
        400,
      );
      assert.equal(
        (await store.getCollection(c.id))!.additionalRecipients!.length,
        33,
        "invalid batches never save partial membership",
      );
      assert.deepEqual(saved.address, c.address);
      assert.deepEqual(saved.deliveries, c.deliveries);
      assert.deepEqual(saved.recipient, c.recipient);
      for (const n of saved.notifications.filter(
        (n) => n.kind === "recipient_invitation",
      )) {
        assert.equal(
          n.url,
          `${process.env.NEXT_PUBLIC_APP_URL}/collection/${c.id}`,
        );
        assert.ok(n.recipientId);
        assert.equal(delivery.notificationSuppressionReason(saved, n), null);
        assert.ok(
          delivery.notificationSuppressionReason(
            { ...saved, status: "draft" },
            n,
          ),
        );
        assert.ok(
          delivery.notificationSuppressionReason(saved, {
            ...n,
            to: "another@example.test",
          }),
        );
      }
    },
  );

  const saved = (await store.getCollection(c.id))!;
  const alpha = saved.additionalRecipients!.find(
    (member) => member.email === "alpha@example.test",
  )!;
  const beta = saved.additionalRecipients!.find(
    (member) => member.email === "beta@example.test",
  )!;
  let alphaMediaId = "";
  await t.test(
    "each verified recipient sees only their own contact, replies, recordings, and preferences",
    async () => {
      const alphaView = await view(c, alphaCookie);
      assert.equal(alphaView.status, 200);
      assert.equal(alphaView.body.collection.recipientId, alpha.id);
      assert.equal(alphaView.body.collection.isPrimaryRecipient, false);
      assert.equal(alphaView.body.collection.recipient.email, alpha.email);
      assert.equal(alphaView.body.collection.address, undefined);
      assert.deepEqual(alphaView.body.collection.deliveries, []);
      assert.deepEqual(alphaView.body.collection.replies, []);
      assert.equal(alphaView.body.collection.additionalRecipients, undefined);
      for (const hidden of [
        c.recipient.email,
        c.address!.line1,
        "Primary private words",
        beta.email,
      ])
        assert.equal(JSON.stringify(alphaView.body).includes(hidden), false);
      assert.equal((await readMedia(c, legacy.id, alphaCookie)).status, 404);
      assert.equal((await readMedia(c, film.id, alphaCookie)).status, 200);
      const form = new FormData();
      form.set(
        "file",
        new File([pcmWavFixture()], "reply.wav", {
          type: "audio/wav",
        }),
      );
      form.set("recipientId", beta.id);
      const upload = await mediaRoute.POST(
        request(c, "/media", form, alphaCookie),
        params(c),
      );
      assert.equal(upload.status, 200);
      alphaMediaId = (await upload.json()).mediaId;
      assert.equal(
        (await store.getMedia(alphaMediaId))!.recipientId,
        alpha.id,
        "identity comes from the verified account",
      );
      const replyId = randomUUID();
      const reply = {
        action: "reply",
        chapterId: "q1",
        replyId,
        recipientId: beta.id,
        mediaId: alphaMediaId,
        text: "Alpha private words",
      };
      assert.equal((await act(c, reply, alphaCookie)).status, 200);
      assert.equal((await act(c, reply, alphaCookie)).status, 200);
      const recordingPath = (await store.getMedia(alphaMediaId))!.localPath!;
      await rename(recordingPath, recordingPath + ".unavailable");
      try {
        assert.equal(
          (await act(c, reply, alphaCookie)).status,
          200,
          "saved replies remain idempotent even when playback storage is temporarily unavailable",
        );
        const unavailable = await act(
          c,
          { ...reply, replyId: randomUUID() },
          alphaCookie,
        );
        assert.equal(unavailable.status, 400);
        assert.match(
          unavailable.body.error,
          /reply recording could not be read/i,
        );
        assert.equal(
          JSON.stringify(unavailable.body).includes(recordingPath),
          false,
        );
        const unchanged = (await store.getCollection(c.id))!;
        assert.equal(
          unchanged.replies.filter((item) => item.recipientId === alpha.id)
            .length,
          1,
        );
        assert.equal(
          unchanged.notifications.filter(
            (item) => item.id === `${c.id}:reply:${replyId}`,
          ).length,
          1,
        );
      } finally {
        await rename(recordingPath + ".unavailable", recordingPath);
      }
      assert.equal((await act(c, reply, betaCookie)).status, 400);
      assert.equal(
        (await act(c, { ...reply, replyId: randomUUID() }, betaCookie)).status,
        400,
      );
      assert.equal((await readMedia(c, alphaMediaId, betaCookie)).status, 404);
      assert.equal(
        (await readMedia(c, alphaMediaId, primaryCookie)).status,
        404,
      );
      assert.equal((await readMedia(c, alphaMediaId, alphaCookie)).status, 200);
      const token = await uploadRoute.POST(
        request(
          c,
          "/media/upload",
          {
            type: "blob.generate-client-token",
            payload: {
              pathname: `collections/${c.id}/${alphaMediaId}`,
              clientPayload: JSON.stringify({
                mediaId: alphaMediaId,
                mimeType: "video/webm",
                bytes: 8,
              }),
            },
          },
          betaCookie,
        ),
        params(c),
      );
      assert.equal(token.status, 400);
      assert.match((await token.json()).error, /Invalid recording/);
      const finish = await mediaRoute.POST(
        request(c, "/media", { mediaId: alphaMediaId }, betaCookie),
        params(c),
      );
      assert.equal(finish.status, 400);
      assert.equal(
        (await act(c, { action: "address", address: c.address }, alphaCookie))
          .status,
        400,
      );
      await act(c, { action: "view_chapter", chapterId: "q1" }, alphaCookie);
      await act(
        c,
        { action: "reply_preferences", enabled: false },
        alphaCookie,
      );
      const after = (await store.getCollection(c.id))!;
      assert.deepEqual(
        after.recipientViewedChapters,
        c.recipientViewedChapters,
      );
      assert.equal(after.replyRemindersEnabled, c.replyRemindersEnabled);
      assert.equal(
        after.replies.find((r) => r.id === replyId)!.recipientId,
        alpha.id,
      );
      const owner = (await view(c, undefined, true)).body.collection;
      assert.equal(
        owner.replies.find((r: { id: string }) => r.id === replyId).authorName,
        "Alpha",
      );
      assert.equal(
        owner.replies.find(
          (r: { id: string }) => r.id === "legacy-primary-reply",
        ).authorEmail,
        c.recipient.email,
      );
      assert.deepEqual((await view(c, betaCookie)).body.collection.replies, []);
      assert.equal(
        (await view(c, primaryCookie)).body.collection.replies.length,
        1,
      );
      const account = (await accounts.accountFromSession(
        alphaCookie.split("=")[1],
      ))!.account;
      assert.equal(accounts.accountRole(after, account.email), "recipient");
      const item = (await accounts.accountLibrary(account)).items.find(
        (item) => item.id === c.id,
      )!;
      assert.equal(item.recipientName, "Alpha");
      assert.equal(item.postcards.scheduled, 0);
      assert.equal(
        await accounts.accountCollectionPath(account, c.id),
        `/collection/${c.id}`,
      );
    },
  );

  await t.test(
    "revocation immediately removes access and suppresses unsent mail; reinvites remain idempotent",
    async () => {
      const response = await inviteRoute.POST(
        request(
          c,
          "/recipients",
          { action: "revoke", recipientId: alpha.id },
          undefined,
          true,
        ),
        params(c),
      );
      assert.equal(response.status, 200);
      const revoked = (await store.getCollection(c.id))!;
      assert.equal((await view(c, alphaCookie)).status, 404);
      assert.equal((await readMedia(c, film.id, alphaCookie)).status, 404);
      assert.equal((await readMedia(c, alphaMediaId, alphaCookie)).status, 404);
      assert.equal(
        (
          await act(
            c,
            { action: "reply", chapterId: "q1", text: "Should not save" },
            alphaCookie,
          )
        ).status,
        404,
      );
      assert.equal(accounts.accountRole(revoked, alpha.email), null);
      const account = (await accounts.accountFromSession(
        alphaCookie.split("=")[1],
      ))!.account;
      assert.equal(
        (await accounts.accountLibrary(account)).items.some(
          (item) => item.id === c.id,
        ),
        false,
      );
      await assert.rejects(
        () => accounts.accountCollectionPath(account, c.id),
        /not found/,
      );
      const invitation = revoked.notifications.find(
        (n) => n.recipientId === alpha.id && n.kind === "recipient_invitation",
      )!;
      assert.equal(invitation.status, "suppressed");
      assert.ok(delivery.notificationSuppressionReason(revoked, invitation));
      // Mark unrelated fictional notifications settled so this delivery check only
      // exercises the remaining Beta invite, without sending any real email.
      await store.mutateCollection(c.id, (current) => {
        for (const n of current.notifications)
          if (n.recipientId !== beta.id && n.status !== "suppressed")
            n.status = "sent";
        return current;
      });
      process.env.COLLECTION_EMAIL_ENABLED = "true";
      process.env.RESEND_API_KEY = "synthetic-test-key";
      process.env.RESEND_FROM_EMAIL = "Time Tapestry <test@example.test>";
      const calls: { to: string[]; html: string }[] = [];
      t.mock.method(
        globalThis,
        "fetch",
        async (
          input: Parameters<typeof fetch>[0],
          init?: Parameters<typeof fetch>[1],
        ) => {
          const req = new Request(input, init);
          assert.equal(req.url, "https://api.resend.com/emails");
          calls.push(await req.json());
          return Response.json({ id: "synthetic-email-accepted" });
        },
      );
      await delivery.processDeliveryJobs();
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0].to, [beta.email]);
      assert.match(calls[0].html, /time-tapestry-lockup\.png/);
      assert.match(calls[0].html, /Watch the collection/);
      assert.equal(calls[0].html.includes("?key="), false);
      assert.equal((await invite(c, [{ email: alpha.email }])).status, 200);
      assert.equal(
        (await invite(c, [{ email: alpha.email.toUpperCase() }])).status,
        200,
      );
      const restored = (await store.getCollection(c.id))!;
      const member = restored.additionalRecipients!.find(
        (item) => item.email === alpha.email,
      )!;
      assert.equal(member.id, alpha.id);
      assert.equal(member.invitationVersion, 2);
      assert.equal(
        restored.notifications.filter(
          (n) =>
            n.kind === "recipient_invitation" &&
            n.recipientId === alpha.id &&
            n.status === "pending",
        ).length,
        1,
      );
      assert.equal((await view(c, alphaCookie)).status, 200);
      assert.deepEqual(restored.address, c.address);
      assert.deepEqual(restored.deliveries, c.deliveries);
    },
  );
});
