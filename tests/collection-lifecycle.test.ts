import {
  attachSyntheticOriginalFilms,
  recordedApproval,
} from "./recorded-review-fixture";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import type { Collection } from "../src/lib/collection/types";
import { verifiedRecipientCookie } from "./verified-recipient-fixture";
import { pcmWavFixture } from "./pcm-wav-fixture";

/** One continuous journey through real route handlers. Only external transport and rendered-film bytes are fixtures. */
test("requested gift lifecycle preserves sources, exact approval, private delivery and biweekly replies", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "tapestry-lifecycle-"),
  );
  for (const name of [
    "VERCEL",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "BLOB_READ_WRITE_TOKEN",
    "GLOO_API_KEY",
    "OPENAI_API_KEY",
    "ELEVENLABS_API_KEY",
    "ELEVENLABS_AGENT_ID",
  ])
    delete process.env[name];
  Object.assign(process.env, {
    NODE_ENV: "test",
    SECURITY_LOCAL_BYPASS: "true",
    SECURITY_TEST_BYPASS: "true",
    COLLECTION_DATA_DIR: directory,
    NEXT_PUBLIC_APP_URL: "https://example.com",
    COLLECTION_EMAIL_ENABLED: "true",
    COLLECTION_DELIVERY_ENABLED: "false",
    CRON_SECRET: "fixture-lifecycle-scheduler",
    RESEND_API_KEY: "fixture-mail-key",
    RESEND_FROM_EMAIL: "fixture@example.com",
    LOB_API_KEY: "live_fixture_never_sent",
    LOB_FROM_ADDRESS_ID: "adr_fixture",
    LOB_WEBHOOK_SECRET: "fixture-lifecycle-signing-secret",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "fixture-lifecycle-site-key",
    TURNSTILE_SECRET_KEY: "fixture-lifecycle-turnstile-key",
    KV_REST_API_URL: "https://lifecycle-kv.invalid",
    KV_REST_API_TOKEN: "fixture-lifecycle-kv-token",
  });
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-01-31T14:00:00.000Z"),
  });
  const store = await import("../src/lib/collection/store");
  const { POST: create } = await import("../src/app/api/collection/route");
  const { POST: post, GET: get } =
    await import("../src/app/api/collection/[id]/route");
  const { POST: interview } =
    await import("../src/app/api/collection/[id]/interview/route");
  const { POST: upload } =
    await import("../src/app/api/collection/[id]/media/route");
  const { GET: media } =
    await import("../src/app/api/collection/[id]/media/[mediaId]/route");
  const { POST: webhook } =
    await import("../src/app/api/collection/webhooks/lob/route");
  const { POST: jobs } = await import("../src/app/api/collection/jobs/route");
  const postcardProof =
    await import("../src/app/api/collection/[id]/postcard-proof/route");
  let recipientCookie = "";
  const req = (
    url: string,
    body?: unknown,
    extra: Record<string, string> = {},
  ) =>
    new NextRequest(`http://localhost${url}`, {
      ...(body === undefined
        ? {}
        : { method: "POST", body: JSON.stringify(body) }),
      headers: {
        "Content-Type": "application/json",
        ...(c?.recipientKey && url.includes(c.recipientKey) && recipientCookie
          ? { cookie: recipientCookie }
          : {}),
        ...extra,
      },
    });
  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  const payload = {
    initiationPath: "request",
    storyteller: { name: "Jo Example", email: "jo@example.test" },
    recipient: { name: "Sam Example", email: "sam@example.test" },
    requester: { name: "Alex Example", email: "alex@example.test" },
    invitationNote: "A synthetic family gift.",
  };
  let c: Collection;
  const read = () => store.getCollection(c.id).then((value) => value!);
  const act = async (body: unknown, key?: string) => {
    const response = await post(
      req(`/api/collection/${c.id}?key=${key || c.ownerKey}`, body),
      params(c.id),
    );
    return { status: response.status, body: await response.json() };
  };
  const talk = async (body: unknown, key?: string) =>
    interview(
      req(`/api/collection/${c.id}/interview?key=${key || c.ownerKey}`, body),
      params(c.id),
    );
  const mediaRead = async (mediaId: string, key: string, range?: string) =>
    media(
      req(
        `/api/collection/${c.id}/media/${mediaId}?key=${key}`,
        undefined,
        range ? { Range: range } : {},
      ),
      { params: Promise.resolve({ id: c.id, mediaId }) },
    );
  const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
  const saveRecording = async (key: string) => {
    const form = new FormData();
    form.append(
      "file",
      key === c.recipientKey
        ? new File([pcmWavFixture()], "synthetic-reply.wav", {
            type: "audio/wav",
          })
        : new File([bytes], "synthetic.webm", { type: "video/webm" }),
    );
    const response = await upload(
      new NextRequest(
        `http://localhost/api/collection/${c.id}/media?key=${key}`,
        {
          method: "POST",
          body: form,
          headers: key === c.recipientKey ? { cookie: recipientCookie } : {},
        },
      ),
      params(c.id),
    );
    assert.equal(response.status, 200);
    return (await response.json()).mediaId as string;
  };
  const attempts: {
    provider: "email" | "postcard";
    key: string;
    body: string;
    accepted: boolean;
  }[] = [];
  const accepted = new Map<string, string>();
  const records = new Map<string, unknown>();
  let failFirstPostcard = true;
  const priorFetch = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    const request =
      input instanceof Request ? input : new Request(input, options);
    if (new URL(request.url).origin === "https://lifecycle-kv.invalid") {
      const payload = await request.json();
      const execute = ([operation, ...args]: unknown[]) => {
        const command = String(operation).toLowerCase();
        const key = String(args[0]);
        if (command === "get") return { result: records.get(key) ?? null };
        if (command === "keys") {
          assert.ok(["collection-v2:*", "collection-v2:media-*"].includes(key));
          return {
            result: [...records.keys()].filter((item) =>
              item.startsWith(key.slice(0, -1)),
            ),
          };
        }
        if (command === "set") {
          if (args.includes("nx") && records.has(key)) return { result: null };
          records.set(key, args[1]);
          return { result: "OK" };
        }
        assert.equal(command, "eval");
        const script = String(args[0]);
        const keyCount = Number(args[1]);
        const keys = args.slice(2, 2 + keyCount).map(String);
        const values = args.slice(2 + keyCount);
        assert.ok(script.includes("redis.call('get',KEYS[1]) == ARGV[1]"));
        if (records.get(keys[0]) !== values[0]) return { result: 0 };
        if (keyCount === 2 && script.includes("redis.call('set'"))
          records.set(keys[1], values[1]);
        else {
          assert.equal(keyCount, 1);
          assert.ok(script.includes("redis.call('del'"));
          records.delete(keys[0]);
        }
        return { result: 1 };
      };
      return Response.json(
        Array.isArray(payload[0]) ? payload.map(execute) : execute(payload),
      );
    }
    const url = request.url,
      provider =
        url === "https://api.resend.com/emails"
          ? "email"
          : url === "https://api.lob.com/v1/postcards"
            ? "postcard"
            : undefined;
    assert.ok(
      provider,
      "Unexpected provider request is forbidden in a synthetic lifecycle",
    );
    const key = request.headers.get("Idempotency-Key")!;
    assert.ok(key);
    assert.equal(request.redirect, "error");
    let body: string;
    if (provider === "postcard") {
      assert.match(
        request.headers.get("content-type")!,
        /^multipart\/form-data; boundary=tt-/,
      );
      body = Buffer.from(await request.clone().arrayBuffer()).toString(
        "base64",
      );
      const form = await request.formData();
      assert.equal(form.has("__timeTapestryLobTransport"), false);
      assert.equal(form.get("to[name]"), "Sam Example");
      assert.equal(form.get("to[address_line1]"), "1 Example Way");
      assert.equal(form.get("from"), "adr_fixture");
      for (const side of ["front", "back"]) {
        const file = form.get(side);
        assert.ok(file instanceof File);
        assert.equal(file.name, `${side}.html`);
        assert.match(file.type, /^text\/html/);
        assert.ok(file.size > 10000);
      }
    } else {
      assert.equal(request.headers.get("content-type"), "application/json");
      body = await request.text();
    }
    if (provider === "postcard" && failFirstPostcard) {
      failFirstPostcard = false;
      attempts.push({
        provider,
        key,
        body,
        accepted: false,
      });
      return new Response("", { status: 503 });
    }
    attempts.push({
      provider,
      key,
      body,
      accepted: true,
    });
    const id =
      accepted.get(key) ||
      (provider === "postcard"
        ? `psc_fixture${accepted.size}`
        : `email_fixture${accepted.size}`);
    accepted.set(key, id);
    return new Response(JSON.stringify({ id }), { status: 200 });
  };
  const tick = (ms: number) => t.mock.timers.setTime(Date.now() + ms);
  const run = async () => {
    const result = await jobs(
      req(
        "/api/collection/jobs",
        {},
        { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      ),
    );
    assert.equal(result.status, 200);
    return result.json();
  };
  const review = async (
    chapterId: string,
    override: Record<string, unknown> = {},
  ) => {
    const chapter = (await read()).chapters.find((ch) => ch.id === chapterId)!;
    return act({
      action: "edit_chapter",
      chapterId,
      title: chapter.title,
      content: chapter.content,
      postcardNote: chapter.postcardNote,
      editorialReviewed: true,
      reviewedFilmSha256: chapter.film?.outputSha256,
      ...override,
    });
  };
  const signEvent = (
    providerId: string,
    eventId: string,
    signatureOverride?: string,
  ) => {
    const body = JSON.stringify({
      id: eventId,
      reference_id: providerId,
      event_type: { id: "postcard.mailed" },
      body: {
        id: providerId,
        tracking_events: [{ name: "Mailed", time: new Date().toISOString() }],
      },
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", process.env.LOB_WEBHOOK_SECRET!)
      .update(`${timestamp}.${body}`)
      .digest("hex");
    return new NextRequest("http://localhost/api/collection/webhooks/lob", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "lob-signature": signatureOverride || signature,
        "lob-signature-timestamp": timestamp,
      },
      body,
    });
  };
  try {
    const invalid = await create(
      req("/api/collection", {
        ...payload,
        storyteller: { name: "Jo", email: "" },
      }),
    );
    assert.equal(invalid.status, 400);
    assert.equal((await store.listCollections()).length, 0);
    const created = await create(req("/api/collection", payload));
    assert.equal(created.status, 201);
    const creation = await created.json();
    c = (await store.getCollection(creation.collection.id))!;
    recipientCookie = await verifiedRecipientCookie(c.recipient.email);
    assert.equal(creation.collection.role, "requester");
    assert.equal(creation.collection.ownerKey, undefined);
    assert.equal(c.status, "invited");
    assert.equal(attempts.length, 0);
    await run();
    assert.equal((await read()).notifications[0].status, "sent");
    assert.equal(attempts.length, 1);
    assert.deepEqual(JSON.parse(attempts[0].body).to, [c.storyteller.email]);
    await run();
    assert.equal(attempts.length, 1);

    assert.equal(
      (await act({ action: "generate" }, c.recipientKey)).status,
      400,
    );
    assert.equal(
      (await act({ action: "generate" })).status,
      400,
      "Incomplete source content cannot generate a gift",
    );
    const originalId = await saveRecording(c.ownerKey);
    const firstTake = {
      id: randomUUID(),
      questionId: "q1",
      prompt: "Who showed you kindness?",
      kind: "video",
      text: "My neighbor brought meals when my family needed help.",
      mediaId: originalId,
      durationSeconds: 8,
    };
    await store.putMedia({
      ...(await store.getMedia(originalId))!,
      transcription: {
        text: firstTake.text,
        provider: "openai",
        model: "whisper-1",
        completedAt: new Date().toISOString(),
      },
    });
    assert.equal(
      (await act({ action: "save_take", take: firstTake })).status,
      200,
    );
    assert.equal(
      (await act({ action: "save_take", take: firstTake })).status,
      200,
    );
    assert.equal((await read()).takes.length, 1);
    const sessionId = randomUUID();
    assert.equal(
      (await talk({ action: "start", provider: "guided", sessionId })).status,
      200,
    );
    const turn = {
      id: randomUUID(),
      sequence: 1,
      role: "user",
      chapterId: "q2",
      text: "Prayer taught me to listen before answering.",
      capturedAt: new Date().toISOString(),
      timing: "unaligned",
    };
    assert.equal(
      (await talk({ action: "append_turns", sessionId, turns: [turn] })).status,
      200,
    );
    assert.equal(
      (await talk({ action: "append_turns", sessionId, turns: [turn] })).status,
      200,
    );
    assert.equal(
      (await talk({ action: "set_status", sessionId, status: "completed" }))
        .status,
      400,
      "Transcripts can recover before their recording, but cannot complete alone",
    );
    assert.equal(
      (
        await talk({
          action: "attach_segment",
          sessionId,
          segment: {
            id: randomUUID(),
            mediaId: originalId,
            kind: "video",
            startMs: 0,
            durationMs: 8000,
          },
        })
      ).status,
      200,
    );
    assert.equal(
      (await talk({ action: "set_status", sessionId, status: "completed" }))
        .status,
      200,
    );
    for (const [questionId, text] of [
      [
        "q3",
        "I sowed by quietly giving twenty dollars and an afternoon of work.",
      ],
      ["q4", "I hope you make time to notice people and love them well."],
    ]) {
      const recordedId = await saveRecording(c.ownerKey);
      await store.putMedia({
        ...(await store.getMedia(recordedId))!,
        transcription: {
          text,
          provider: "openai",
          model: "whisper-1",
          completedAt: new Date().toISOString(),
        },
      });
      assert.equal(
        (
          await act({
            action: "save_take",
            take: {
              id: randomUUID(),
              questionId,
              prompt: questionId,
              kind: "video",
              mediaId: recordedId,
              text,
            },
          })
        ).status,
        200,
      );
    }
    const pending = await get(
      req(`/api/collection/${c.id}?key=${c.recipientKey}`),
      params(c.id),
    );
    const hidden = (await pending.json()).collection;
    assert.deepEqual(hidden.chapters, []);
    assert.deepEqual(hidden.takes, []);
    assert.equal(hidden.interviews, undefined);
    assert.equal((await mediaRead(originalId, c.recipientKey)).status, 404);

    assert.equal((await act({ action: "generate" })).status, 200);
    assert.equal((await read()).chapters.length, 4);
    assert.equal((await read()).chapters[1].content, turn.text);
    assert.equal(
      (await act({ action: "save_take", take: firstTake })).status,
      200,
    );
    assert.equal(
      (await read()).status,
      "draft",
      "A delayed identical save retry must not reset a prepared draft",
    );
    assert.equal((await act({ action: "request_address" })).status, 200);
    assert.equal((await act({ action: "request_address" })).status, 200);
    assert.equal(
      (await read()).notifications.filter((n) => n.kind === "address_request")
        .length,
      1,
    );

    assert.equal(
      (
        await act({
          action: "attach_video",
          chapterId: "q1",
          mediaId: originalId,
        })
      ).status,
      410,
    );
    const filmsReady = await attachSyntheticOriginalFilms(await read());
    const filmIds = filmsReady.chapters.map((chapter) => chapter.film!.mediaId);
    for (const mediaId of filmIds) {
      await store.putMedia({
        ...(await store.getMedia(mediaId))!,
        bytes: bytes.length,
        localPath: (await store.getMedia(originalId))!.localPath,
      });
    }
    const exactReview = recordedApproval(filmsReady);
    assert.equal(
      (
        await act(
          {
            action: "approve",
            deliveryMode: "digital",
            autoPostcards: true,
            ...exactReview,
          },
          c.requesterKey,
        )
      ).status,
      400,
    );
    const beforeRetiredEdit = await read();
    assert.equal(
      (
        await act({
          action: "blessing",
          questionId: "q1",
          value: { encouragement: "Notice your neighbor." },
        })
      ).status,
      410,
    );
    assert.deepEqual(await read(), beforeRetiredEdit);
    assert.equal(
      (
        await act({
          action: "approve",
          deliveryMode: "digital",
          autoPostcards: true,
        })
      ).status,
      400,
      "Approval requires explicit review of recorded films",
    );
    assert.equal(
      (
        await act({
          action: "approve",
          deliveryMode: "digital",
          ...exactReview,
          reviewedFilmHashes: {
            ...exactReview.reviewedFilmHashes,
            q1: "0".repeat(64),
          },
        })
      ).status,
      400,
      "Stale film hashes cannot approve a newer output",
    );
    const approved = await act({
      action: "approve",
      deliveryMode: "digital",
      autoPostcards: true,
      ...exactReview,
    });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    const frozen = await read();
    assert.equal(frozen.status, "approved");
    assert.equal(frozen.postcardPreparation?.status, "waiting_for_address");
    assert.equal(
      (
        await act({
          action: "approve",
          deliveryMode: "digital",
          autoPostcards: true,
        })
      ).status,
      200,
      "Lost approval response can be retried safely",
    );
    assert.equal(
      (await read()).notifications.filter(
        (n) => n.id === `${c.id}:owner-approved`,
      ).length,
      1,
    );
    assert.equal(
      (await act({ action: "save_take", take: firstTake })).status,
      400,
    );
    assert.equal(
      (await review("q1", { content: "Changed after publishing" })).status,
      400,
    );

    assert.equal(
      (
        await act(
          {
            action: "address",
            address: {
              line1: "",
              city: "Town",
              region: "CA",
              postalCode: "90001",
            },
          },
          c.recipientKey,
        )
      ).status,
      400,
    );
    const address = {
      line1: "1 Example Way",
      city: "Town",
      region: "CA",
      postalCode: "90001",
      country: "US",
    };
    assert.equal(
      (await act({ action: "address", address }, c.requesterKey)).status,
      400,
    );
    assert.equal(
      (await act({ action: "address", address }, c.recipientKey)).status,
      200,
    );
    assert.equal((await read()).postcardPreparation?.status, "needs_attention");
    const proofPreviewResponse = await postcardProof.GET(
      req(`/api/collection/${c.id}/postcard-proof?key=${c.ownerKey}`),
      params(c.id),
    );
    assert.equal(proofPreviewResponse.status, 200);
    const { proof: publicProof } = await proofPreviewResponse.json();
    assert.equal(
      (
        await postcardProof.POST(
          req(`/api/collection/${c.id}/postcard-proof?key=${c.ownerKey}`, {
            action: "approve",
            firstMailingAt: publicProof.firstMailingAt,
            proofHash: publicProof.hash,
            reviewed: true,
            publicMessageApproved: true,
          }),
          params(c.id),
        )
      ).status,
      200,
    );
    assert.equal((await read()).postcardProof?.releaseStatus, "held");
    await run();
    process.env.COLLECTION_DELIVERY_ENABLED = "true";
    await run();
    let mailed = await read();
    assert.equal(mailed.deliveries[0].status, "failed");
    assert.equal(mailed.deliveries[0].dispatch?.attempts, 1);
    assert.equal(
      (
        await act(
          {
            action: "address",
            address: { ...address, line1: "2 Changed Way" },
          },
          c.recipientKey,
        )
      ).status,
      400,
    );
    await run();
    assert.equal(attempts.filter((a) => a.provider === "postcard").length, 1);
    tick(61000);
    await run();
    const postcardAttempts = attempts.filter((a) => a.provider === "postcard");
    assert.equal(postcardAttempts.length, 2);
    assert.equal(postcardAttempts[0].key, postcardAttempts[1].key);
    assert.ok(
      postcardAttempts[0].body === postcardAttempts[1].body,
      "Retry sends frozen identical print bytes",
    );
    mailed = await read();
    assert.equal(mailed.deliveries[0].status, "submitted");
    assert.equal(mailed.deliveries[0].mailedAt, undefined);
    const providerId = mailed.deliveries[0].providerId!;
    assert.equal(
      (await webhook(signEvent(providerId, "evt_fixturefirst", "f".repeat(64))))
        .status,
      401,
    );
    tick(86400000);
    assert.equal(
      (await webhook(signEvent(providerId, "evt_fixturefirst"))).status,
      200,
    );
    const duplicate = await webhook(signEvent(providerId, "evt_fixturefirst"));
    assert.equal((await duplicate.json()).duplicate, true);
    const scheduled = await read();
    assert.equal(scheduled.deliveries[0].status, "mailed");
    assert.equal(
      scheduled.notifications.filter((n) => n.kind === "postcard_followup")
        .length,
      1,
    );
    assert.equal(
      scheduled.deliveries[1].scheduledFor.slice(0, 10),
      "2026-02-15",
    );

    const recipientView = await get(
      req(`/api/collection/${c.id}?key=${c.recipientKey}`),
      params(c.id),
    );
    const shared = (await recipientView.json()).collection;
    assert.equal(shared.chapters.length, 4);
    assert.deepEqual(shared.takes, []);
    assert.equal(shared.postcardProof, undefined);
    assert.equal(shared.interviews, undefined);
    assert.equal(shared.links, undefined);
    assert.ok(!JSON.stringify(shared).includes(c.ownerKey));
    assert.ok(
      shared.chapters.every(
        (chapter: {
          sourceTakeIds: unknown[];
          film?: {
            sourceRanges?: unknown[];
            sourceAssets?: unknown[];
            narrationKind?: string;
          };
        }) =>
          chapter.sourceTakeIds.length === 0 &&
          chapter.film?.sourceRanges?.length === 0 &&
          chapter.film?.sourceAssets?.length === 0 &&
          chapter.film.narrationKind === "original_recording",
      ),
    );
    assert.equal((await mediaRead(originalId, c.recipientKey)).status, 404);
    const filmResponse = await mediaRead(
      filmIds[0],
      c.recipientKey,
      "bytes=2-5",
    );
    assert.equal(filmResponse.status, 206);
    assert.deepEqual(
      new Uint8Array(await filmResponse.arrayBuffer()),
      bytes.slice(2, 6),
    );
    assert.equal((await mediaRead(filmIds[0], c.requesterKey)).status, 404);
    assert.equal(
      (await act({ action: "view_chapter", chapterId: "q1" }, c.recipientKey))
        .status,
      200,
    );
    const replyId = randomUUID(),
      replyMediaId = await saveRecording(c.recipientKey);
    const reply = {
      action: "reply",
      chapterId: "q1",
      replyId,
      text: "Thank you for showing me how to give.",
      mediaId: replyMediaId,
    };
    assert.equal((await act(reply, c.requesterKey)).status, 400);
    assert.equal((await act(reply, c.recipientKey)).status, 200);
    assert.equal((await act(reply, c.recipientKey)).status, 200);
    assert.equal((await read()).replies.length, 1);
    assert.equal(
      (await read()).notifications.filter((n) => n.kind === "reply_received")
        .length,
      1,
    );
    await run();
    await run();
    assert.equal(
      (await read()).notifications.find((n) => n.kind === "reply_received")!
        .status,
      "sent",
    );
    const later = Date.parse((await read()).deliveries[1].scheduledFor);
    t.mock.timers.setTime(later - 1);
    await run();
    assert.equal(attempts.filter((a) => a.provider === "postcard").length, 2);
    t.mock.timers.setTime(later);
    await run();
    assert.equal((await read()).deliveries[1].status, "submitted");
    assert.equal(attempts.filter((a) => a.provider === "postcard").length, 3);
    assert.equal((await read()).deliveries[2].status, "scheduled");
    await run();
    assert.equal(
      (await read()).notifications.find((n) => n.kind === "postcard_followup")!
        .status,
      "suppressed",
    );
    assert.equal(
      (await read()).postcardProof!.hash,
      mailed.postcardProof!.hash,
      "Biweekly dispatch retains the original approved print snapshot",
    );
  } finally {
    globalThis.fetch = priorFetch;
    t.mock.timers.reset();
    await rm(directory, { recursive: true, force: true });
  }
});
