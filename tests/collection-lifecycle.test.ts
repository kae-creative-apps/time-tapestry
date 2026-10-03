import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import type { Collection } from "../src/lib/collection/types";

/** One continuous journey through real route handlers. Only external transport and rendered-film bytes are fixtures. */
test("requested gift lifecycle preserves sources, exact approval, private delivery and quarterly replies", async (t) => {
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
  const req = (
    url: string,
    body?: unknown,
    extra: Record<string, string> = {},
  ) =>
    new NextRequest(`http://localhost${url}`, {
      ...(body === undefined
        ? {}
        : { method: "POST", body: JSON.stringify(body) }),
      headers: { "Content-Type": "application/json", ...extra },
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
      new File([bytes], "synthetic.webm", { type: "video/webm" }),
    );
    const response = await upload(
      new NextRequest(
        `http://localhost/api/collection/${c.id}/media?key=${key}`,
        { method: "POST", body: form },
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
  let failFirstPostcard = true;
  const priorFetch = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    const url = String(input),
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
    const key = new Headers(options?.headers).get("Idempotency-Key")!;
    assert.ok(key);
    assert.equal(options?.redirect, "error");
    if (provider === "postcard" && failFirstPostcard) {
      failFirstPostcard = false;
      attempts.push({
        provider,
        key,
        body: String(options?.body),
        accepted: false,
      });
      return new Response("", { status: 503 });
    }
    attempts.push({
      provider,
      key,
      body: String(options?.body),
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
      200,
    );
    for (const [questionId, text] of [
      [
        "q3",
        "I sowed by quietly giving twenty dollars and an afternoon of work.",
      ],
      ["q4", "I hope you make time to notice people and love them well."],
    ])
      assert.equal(
        (
          await act({
            action: "save_take",
            take: {
              id: randomUUID(),
              questionId,
              prompt: questionId,
              kind: "text",
              text,
            },
          })
        ).status,
        200,
      );
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

    const filmIds: string[] = [];
    for (let i = 1; i <= 4; i++) {
      const mediaId = await saveRecording(c.ownerKey);
      filmIds.push(mediaId);
      assert.equal(
        (
          await act({
            action: "attach_video",
            chapterId: `q${i}`,
            mediaId,
            durationSeconds: 8,
          })
        ).status,
        200,
      );
      // Simulated successful render boundary. The separate film-worker suite verifies real rendering.
      await store.mutateCollection(c.id, (current) => {
        current.chapters[i - 1].film = {
          narrationKind: "original_recording",
          presentation: "video",
          jobId: "fixture_render_job",
          chapterId: `q${i}`,
          mediaId,
          sourceTakeIds: current.chapters[i - 1].sourceTakeIds,
          sourceSha256: "b".repeat(64),
          outputSha256: String(i).repeat(64),
          durationSeconds: 8,
          createdAt: new Date().toISOString(),
          planSha256: "c".repeat(64),
          sourceRanges: [{ mediaId: originalId, inMs: 0, outMs: 8000 }],
          sourceAssets: [
            { mediaId: originalId, sha256: "d".repeat(64), durationMs: 8000 },
          ],
        };
        return current;
      });
      assert.equal(
        (await review(`q${i}`, { reviewedFilmSha256: "old-version" })).status,
        400,
      );
      assert.equal((await review(`q${i}`)).status, 200);
    }
    assert.equal(
      (
        await act(
          { action: "approve", deliveryMode: "digital", autoPostcards: true },
          c.requesterKey,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await act({
          action: "blessing",
          questionId: "q1",
          value: { encouragement: "Notice your neighbor." },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await act({
          action: "approve",
          deliveryMode: "digital",
          autoPostcards: true,
        })
      ).status,
      400,
      "Changes invalidate a previous review",
    );
    assert.equal((await review("q1")).status, 200);
    const approved = await act({
      action: "approve",
      deliveryMode: "digital",
      autoPostcards: true,
    });
    assert.equal(approved.status, 200);
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
      "2026-05-01",
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
    tick(14 * 86400000);
    await run();
    assert.equal(
      (await read()).notifications.find((n) => n.kind === "postcard_followup")!
        .status,
      "suppressed",
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
    assert.equal(
      (await read()).postcardProof!.hash,
      mailed.postcardProof!.hash,
      "Quarterly dispatch retains the original approved print snapshot",
    );
  } finally {
    globalThis.fetch = priorFetch;
    t.mock.timers.reset();
    await rm(directory, { recursive: true, force: true });
  }
});
