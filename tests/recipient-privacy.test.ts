import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import {
  syntheticFilmCollection,
  syntheticOriginalFilmArtifact,
} from "./film-fixture";
import { pcmWavFixture } from "./pcm-wav-fixture";

test("postcard locators require the intended verified recipient across stories, replies and every media route", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "tapestry-recipient-privacy-"),
  );
  const prior = { ...process.env };
  for (const key of [
    "VERCEL",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "OPENAI_API_KEY",
    "GLOO_API_KEY",
    "ELEVENLABS_API_KEY",
    "LOB_API_KEY",
  ])
    delete process.env[key];
  Object.assign(process.env, {
    NODE_ENV: "test",
    COLLECTION_DATA_DIR: directory,
    NEXT_PUBLIC_APP_URL: "https://example.test",
    SECURITY_LOCAL_BYPASS: "true",
    SECURITY_TEST_BYPASS: "true",
    BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_synthetic_only_no_provider",
  });
  let externalCalls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    externalCalls++;
    throw new Error("External requests are forbidden in this synthetic test.");
  });
  const account = await import("../src/lib/accounts/service");
  const store = await import("../src/lib/collection/store");
  const { saveLocalMedia } = await import("../src/lib/collection/media");
  const { recipientPostcardUrl } =
    await import("../src/lib/collection/postcard-access");
  const { GET: collectionGet, POST: collectionPost } =
    await import("../src/app/api/collection/[id]/route");
  const { GET: mediaGet } =
    await import("../src/app/api/collection/[id]/media/[mediaId]/route");
  const { POST: mediaPost } =
    await import("../src/app/api/collection/[id]/media/route");
  const { POST: uploadToken } =
    await import("../src/app/api/collection/[id]/media/upload/route");
  const login = async (email: string) => {
    const nonce = account.randomCredential();
    let token = "";
    await account.beginAccountLogin(email, nonce, {
      sendMail: async ({ url }) => {
        token = new URLSearchParams(new URL(url).hash.slice(1)).get("token")!;
      },
    });
    return account.confirmAccountLogin(token, nonce);
  };
  type Access = { key?: string; session?: string };
  const request = (pathname: string, access: Access = {}, body?: unknown) =>
    new NextRequest(
      `http://localhost${pathname}${access.key ? `?key=${encodeURIComponent(access.key)}` : ""}`,
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
          ...(access.session
            ? { cookie: `tt_account_session=${access.session}` }
            : {}),
        },
      },
    );
  const uploadForm = (value: string) => {
    const form = new FormData();
    form.set(
      "file",
      new File([value], "synthetic.webm", { type: "video/webm" }),
    );
    return form;
  };
  try {
    const c = syntheticFilmCollection();
    c.status = "approved";
    c.storyteller.name = "Private Narrator Sentinel";
    c.recipient.name = "Private Recipient Sentinel";
    c.requester = {
      name: "Private Requester Sentinel",
      email: "requester-sentinel@example.test",
    };
    const originalBytes = "synthetic original recording sentinel";
    const filmBytes = "synthetic approved chapter film sentinel";
    const original = await saveLocalMedia(
      c.id,
      "owner",
      new File([originalBytes], "original.webm", { type: "video/webm" }),
    );
    const film = await saveLocalMedia(
      c.id,
      "owner",
      new File([filmBytes], "chapter.webm", { type: "video/webm" }),
    );
    c.takes[0].mediaId = original.id;
    c.chapters[0].videoMediaId = film.id;
    c.chapters[0].videoStatus = "ready";
    c.chapters[0].film = syntheticOriginalFilmArtifact(
      c,
      c.chapters[0].id,
      film.id,
    );
    await store.putCollection(c);
    const intended = await login(` ${c.recipient.email.toUpperCase()} `);
    const wrong = await login("wrong-person@example.test");
    const revoked = await login(c.recipient.email);
    await account.revokeAccountSession(revoked.sessionToken);
    const params = { params: Promise.resolve({ id: c.id }) };
    const mediaParams = {
      params: Promise.resolve({ id: c.id, mediaId: film.id }),
    };
    const privateValues = [
      c.storyteller.name,
      c.storyteller.email,
      c.recipient.name,
      c.recipient.email,
      c.requester.name,
      c.requester.email,
      c.invitationNote,
      c.chapters[0].title,
      c.chapters[0].content,
      c.ownerKey,
      c.recipientKey,
      c.requesterKey,
      original.id,
      film.id,
      originalBytes,
      filmBytes,
    ];
    const assertPrivate = (body: string) => {
      for (const value of privateValues)
        assert.equal(
          body.includes(value),
          false,
          `Denied response exposed ${value}`,
        );
    };
    const tokenBody = (collectionId = c.id) => ({
      type: "blob.generate-client-token",
      payload: {
        pathname: `collections/${collectionId}/blocked-upload-123`,
        multipart: false,
        clientPayload: JSON.stringify({
          mediaId: "blocked-upload-123",
          mimeType: "video/webm",
          bytes: 12,
          name: "synthetic.webm",
        }),
      },
    });

    await t.test(
      "anonymous, old QR, wrong email and revoked sessions match missing collection responses",
      async () => {
        const missingParams = {
          params: Promise.resolve({ id: "missing-collection-123" }),
        };
        const missingGet = await collectionGet(
          request("/api/collection/missing-collection-123"),
          missingParams,
        );
        const missingPost = await collectionPost(
          request(
            "/api/collection/missing-collection-123",
            {},
            { action: "reply", chapterId: "q1", text: "Synthetic reply" },
          ),
          missingParams,
        );
        const missingGetBody = await missingGet.text();
        const missingPostBody = await missingPost.text();
        assert.equal(missingGet.status, 404);
        assert.equal(missingPost.status, 404);
        for (const access of [
          {},
          { key: c.recipientKey },
          { session: wrong.sessionToken },
          { key: c.recipientKey, session: wrong.sessionToken },
          { session: revoked.sessionToken },
          { session: c.recipient.email },
        ]) {
          const get = await collectionGet(
            request(`/api/collection/${c.id}`, access),
            params,
          );
          assert.equal(get.status, 404);
          const body = await get.text();
          assert.equal(body, missingGetBody);
          assertPrivate(body);
          assert.match(get.headers.get("cache-control")!, /no-store/);
          const post = await collectionPost(
            request(`/api/collection/${c.id}`, access, {
              action: "reply",
              chapterId: "q1",
              text: "Synthetic reply",
            }),
            params,
          );
          assert.equal(post.status, 404);
          const postBody = await post.text();
          assert.equal(postBody, missingPostBody);
          assertPrivate(postBody);
          const recording = await mediaGet(
            request(`/api/collection/${c.id}/media/${film.id}`, access),
            mediaParams,
          );
          assert.equal(recording.status, 404);
          assert.equal(await recording.text(), "Recording not found");
          const upload = await mediaPost(
            request(
              `/api/collection/${c.id}/media`,
              access,
              uploadForm("unauthorized synthetic upload"),
            ),
            params,
          );
          assert.equal(upload.status, 403);
          assertPrivate(await upload.text());
          const direct = await uploadToken(
            request(
              `/api/collection/${c.id}/media/upload`,
              access,
              tokenBody(),
            ),
            params,
          );
          assert.equal(direct.status, 400);
          const directBody = await direct.text();
          assert.match(directBody, /Upload access denied/);
          assert.equal(directBody.includes("clientToken"), false);
          assertPrivate(directBody);
        }
        assert.equal(await store.getMedia("blocked-upload-123"), null);
        assert.equal((await store.getCollection(c.id))!.replies.length, 0);
        assert.equal(externalCalls, 0);
      },
    );

    await t.test(
      "intended verified email reads approved stories and films without originals or private keys",
      async () => {
        const access = { session: intended.sessionToken };
        const response = await collectionGet(
          request(`/api/collection/${c.id}`, access),
          params,
        );
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.collection.role, "recipient");
        assert.equal(
          body.collection.chapters[0].content,
          c.chapters[0].content,
        );
        assert.deepEqual(body.collection.takes, []);
        assert.deepEqual(body.collection.notifications, []);
        assert.deepEqual(body.collection.chapters[0].sourceTakeIds, []);
        for (const secret of [
          c.ownerKey,
          c.recipientKey,
          c.requesterKey,
          original.id,
        ])
          assert.equal(JSON.stringify(body).includes(secret), false);
        const recording = await mediaGet(
          request(`/api/collection/${c.id}/media/${film.id}`, access),
          mediaParams,
        );
        assert.equal(recording.status, 200);
        assert.equal(await recording.text(), filmBytes);
        const deniedOriginal = await mediaGet(
          request(`/api/collection/${c.id}/media/${original.id}`, access),
          { params: Promise.resolve({ id: c.id, mediaId: original.id }) },
        );
        assert.equal(deniedOriginal.status, 404);
        assert.equal(await deniedOriginal.text(), "Recording not found");
      },
    );

    await t.test(
      "direct recipient playback rejects legacy AI and unverified films while owner archives stay available",
      async () => {
        const recorded = c.chapters[0].film!;
        const unavailableVersions = [
          undefined,
          { ...recorded, mediaId: "different-finished-media" },
          {
            ...recorded,
            narrationKind: "ai_interviewer" as const,
            scriptSha256: "d".repeat(64),
            audioSha256: "e".repeat(64),
            voiceId: "synthetic-legacy-voice",
            modelId: "synthetic-legacy-model",
          },
        ];
        try {
          for (const artifact of unavailableVersions) {
            await store.mutateCollection(c.id, (current) => {
              current.chapters[0].film = artifact;
              return current;
            });
            const denied = await mediaGet(
              request(`/api/collection/${c.id}/media/${film.id}`, {
                session: intended.sessionToken,
              }),
              mediaParams,
            );
            assert.equal(denied.status, 404);
            assert.equal(await denied.text(), "Recording not found");
            const archived = await mediaGet(
              request(`/api/collection/${c.id}/media/${film.id}`, {
                key: c.ownerKey,
              }),
              mediaParams,
            );
            assert.equal(archived.status, 200);
            assert.equal(await archived.text(), filmBytes);
          }
        } finally {
          await store.mutateCollection(c.id, (current) => {
            current.chapters[0].film = recorded;
            return current;
          });
        }
        const originalVoice = await mediaGet(
          request(`/api/collection/${c.id}/media/${film.id}`, {
            session: intended.sessionToken,
          }),
          mediaParams,
        );
        assert.equal(originalVoice.status, 200);
        assert.equal(await originalVoice.text(), filmBytes);
        assert.equal(externalCalls, 0);
      },
    );

    await t.test(
      "authorized recipient can upload and save a reply using only the session",
      async () => {
        const access = { session: intended.sessionToken };
        const replyBytes = pcmWavFixture();
        const form = new FormData();
        form.set(
          "file",
          new File([replyBytes], "synthetic-reply.wav", { type: "audio/wav" }),
        );
        const upload = await mediaPost(
          request(`/api/collection/${c.id}/media`, access, form),
          params,
        );
        assert.equal(upload.status, 200);
        const { mediaId } = await upload.json();
        assert.equal((await store.getMedia(mediaId))!.role, "recipient");
        const reply = await collectionPost(
          request(`/api/collection/${c.id}`, access, {
            action: "reply",
            chapterId: "q1",
            replyId: "synthetic-reply-123",
            text: "A synthetic thank-you",
            mediaId,
          }),
          params,
        );
        assert.equal(reply.status, 200);
        assert.equal(
          (await reply.json()).collection.replies[0].mediaId,
          mediaId,
        );
        const playback = await mediaGet(
          request(`/api/collection/${c.id}/media/${mediaId}`, access),
          { params: Promise.resolve({ id: c.id, mediaId }) },
        );
        assert.equal(playback.status, 200);
        assert.deepEqual(
          new Uint8Array(await playback.arrayBuffer()),
          replyBytes,
        );
        assert.equal(
          (await store.getCollection(c.id))!.notifications.at(-1)!.status,
          "pending",
        );
        assert.equal(externalCalls, 0);
      },
    );

    await t.test(
      "owner and requester capabilities retain their existing scopes",
      async () => {
        const owner = await collectionGet(
          request(`/api/collection/${c.id}`, { key: c.ownerKey }),
          params,
        );
        assert.equal(owner.status, 200);
        assert.equal(
          (await owner.json()).collection.takes[0].mediaId,
          original.id,
        );
        const ownerOriginal = await mediaGet(
          request(`/api/collection/${c.id}/media/${original.id}`, {
            key: c.ownerKey,
          }),
          { params: Promise.resolve({ id: c.id, mediaId: original.id }) },
        );
        assert.equal(ownerOriginal.status, 200);
        assert.equal(await ownerOriginal.text(), originalBytes);
        const requester = await collectionGet(
          request(`/api/collection/${c.id}`, { key: c.requesterKey }),
          params,
        );
        assert.equal(requester.status, 200);
        const requesterBody = await requester.json();
        assert.equal(requesterBody.collection.role, "requester");
        assert.deepEqual(requesterBody.collection.chapters, []);
        assert.deepEqual(requesterBody.collection.takes, []);
        const requesterRecording = await mediaGet(
          request(`/api/collection/${c.id}/media/${film.id}`, {
            key: c.requesterKey,
          }),
          mediaParams,
        );
        assert.equal(requesterRecording.status, 404);
        await requesterRecording.text();
        const requesterUpload = await mediaPost(
          request(
            `/api/collection/${c.id}/media`,
            { key: c.requesterKey },
            uploadForm("synthetic"),
          ),
          params,
        );
        assert.equal(requesterUpload.status, 403);
        const requesterReply = await collectionPost(
          request(
            `/api/collection/${c.id}`,
            { key: c.requesterKey },
            {
              action: "reply",
              chapterId: "q1",
              text: "Synthetic unauthorized reply",
            },
          ),
          params,
        );
        assert.equal(requesterReply.status, 400);
        const draft = syntheticFilmCollection();
        await store.putCollection(draft);
        const draftParams = { params: Promise.resolve({ id: draft.id }) };
        const ownerProgress = await collectionPost(
          request(
            `/api/collection/${draft.id}`,
            { key: draft.ownerKey },
            { action: "progress", currentQuestion: 2 },
          ),
          draftParams,
        );
        assert.equal(ownerProgress.status, 200);
        assert.equal(
          (await ownerProgress.json()).collection.currentQuestion,
          2,
        );
        const ownerUpload = await mediaPost(
          request(
            `/api/collection/${draft.id}/media`,
            { key: draft.ownerKey },
            uploadForm("synthetic owner upload"),
          ),
          draftParams,
        );
        assert.equal(ownerUpload.status, 200);
        assert.equal(
          (await store.getMedia((await ownerUpload.json()).mediaId))!.role,
          "owner",
        );
        const hiddenDraft = await collectionGet(
          request(`/api/collection/${draft.id}`, {
            session: intended.sessionToken,
          }),
          draftParams,
        );
        assert.equal(hiddenDraft.status, 200);
        assert.deepEqual((await hiddenDraft.json()).collection.chapters, []);
      },
    );

    await t.test(
      "unverified account records do not turn a session into access",
      async () => {
        await store.writeRecord(`account-${intended.account.id}`, {
          ...intended.account,
          verifiedAt: "",
        });
        const denied = await collectionGet(
          request(`/api/collection/${c.id}`, {
            session: intended.sessionToken,
          }),
          params,
        );
        assert.equal(denied.status, 404);
        assertPrivate(await denied.text());
        await store.writeRecord(
          `account-${intended.account.id}`,
          intended.account,
        );
      },
    );

    await t.test("postcard URLs contain only the scoped locator", () => {
      const url = new URL(
        recipientPostcardUrl(c.id, "q1", "https://example.test"),
      );
      assert.equal(url.pathname, `/collection/${c.id}/chapter/q1`);
      assert.equal(url.search, "");
      assert.equal(url.hash, "");
      assertPrivate(url.href);
      assert.equal(url.href.includes("key="), false);
      assert.throws(() => recipientPostcardUrl(c.id, "../q1", url.origin));
      assert.throws(() => recipientPostcardUrl("../outside", "q1", url.origin));
    });
    assert.equal(externalCalls, 0);
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in prior)) delete process.env[key];
    Object.assign(process.env, prior);
    await rm(directory, { recursive: true, force: true });
  }
});
