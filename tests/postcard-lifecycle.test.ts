import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { NextRequest } from "next/server";
import QRCode from "qrcode";

test("all four postcards dispatch once at calendar quarters through authenticated jobs and signed mailing events", async (t) => {
  const origin = "https://example.com";
  const syntheticLobKey = "live_fixture_never_sent_to_lob";
  Object.assign(process.env, {
    NODE_ENV: "test",
    NEXT_PUBLIC_APP_URL: origin,
    COLLECTION_DELIVERY_ENABLED: "true",
    COLLECTION_EMAIL_ENABLED: "true",
    CRON_SECRET: "fixture-quarterly-jobs",
    LOB_API_KEY: syntheticLobKey,
    LOB_FROM_ADDRESS_ID: "adr_fixture",
    LOB_WEBHOOK_SECRET: "fixture-quarterly-webhook",
    RESEND_API_KEY: "fixture-email-key",
    RESEND_FROM_EMAIL: "fixture@example.com",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "fixture-site-key",
    TURNSTILE_SECRET_KEY: "fixture-turnstile-key",
    KV_REST_API_URL: "https://quarterly-kv.invalid",
    KV_REST_API_TOKEN: "fixture-kv-key",
  });
  delete process.env.VERCEL;
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-01-15T11:59:59.999Z"),
  });

  const records = new Map<string, unknown>();
  const postcards: Array<{
    key: string;
    id: string;
    body: FormData;
    at: string;
  }> = [];
  const emails: Array<{ to: string[] }> = [];
  const priorFetch = globalThis.fetch;
  // This is the complete transport boundary. No network requests can escape.
  globalThis.fetch = async (input, options) => {
    const request =
      input instanceof Request ? input : new Request(input, options);
    if (new URL(request.url).origin === "https://quarterly-kv.invalid") {
      const payload = await request.json();
      const execute = ([operation, ...args]: unknown[]) => {
        const command = String(operation).toLowerCase();
        const key = String(args[0]);
        if (command === "get") return { result: records.get(key) ?? null };
        if (command === "keys") {
          assert.equal(key, "collection-v2:*");
          return {
            result: [...records.keys()].filter((item) =>
              item.startsWith("collection-v2:"),
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
    assert.equal(request.redirect, "error");
    if (request.url === "https://api.resend.com/emails") {
      emails.push(await request.json());
      return Response.json({ id: `email_fixture${emails.length}` });
    }
    assert.equal(
      request.url,
      "https://api.lob.com/v1/postcards",
      "Unexpected network request is forbidden",
    );
    assert.equal(
      request.headers.get("authorization"),
      `Basic ${Buffer.from(syntheticLobKey + ":").toString("base64")}`,
    );
    assert.match(
      request.headers.get("content-type")!,
      /^multipart\/form-data; boundary=/,
    );
    const key = request.headers.get("idempotency-key")!;
    assert.ok(key);
    const id = `psc_quarterly${postcards.length + 1}`;
    postcards.push({
      key,
      id,
      body: await request.formData(),
      at: new Date().toISOString(),
    });
    return Response.json({ id });
  };

  try {
    const { CHAPTERS } = await import("../src/lib/interview-state");
    const { prepareCollection } = await import("../src/lib/collection/create");
    const { approveCollection } = await import("../src/lib/collection/content");
    const { getCollection, putCollection, mutateCollection } =
      await import("../src/lib/collection/store");
    const { prepareAutomaticPostcards, postcardPublicMessagesHash } =
      await import("../src/lib/collection/postcard-proofs");
    const { POST: jobs } = await import("../src/app/api/collection/jobs/route");
    const { POST: webhook } =
      await import("../src/app/api/collection/webhooks/lob/route");
    const draft = prepareCollection({
      initiationPath: "share",
      storyteller: { name: "Jo Fixture", email: "jo@example.test" },
      recipient: { name: "Sam Fixture", email: "sam@example.test" },
      address: {
        line1: "1 Fixture Way",
        line2: "Unit 2",
        city: "Example",
        region: "CA",
        postalCode: "90001",
        country: "US",
      },
    });
    draft.status = "draft";
    draft.chapters = CHAPTERS.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      content: `Private fixture story ${chapter.id}.`,
      postcardNote: `Private fixture note ${chapter.id}.`,
      sourceTakeIds: [],
      videoStatus: "not_requested",
      editorialReviewed: true,
      generatedWith: "source_text",
    }));
    const approved = approveCollection(draft, new Date().toISOString(), {
      deliveryMode: "digital",
    });
    approved.autoPostcards = true;
    approved.replyRemindersEnabled = false;
    await prepareAutomaticPostcards(approved);
    await putCollection(approved);
    const read = async () => (await getCollection(approved.id))!;
    const run = async () => {
      const response = await jobs(
        new NextRequest(`${origin}/api/collection/jobs`, {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
        }),
      );
      assert.equal(response.status, 200);
      return response.json();
    };
    const sendEvent = async (
      reference: string,
      id: string,
      options: {
        type?: string;
        invalidSignature?: boolean;
        bodyId?: string;
      } = {},
    ) => {
      const type = options.type || "postcard.mailed";
      const body = JSON.stringify({
        id,
        reference_id: reference,
        event_type: { id: type },
        body: {
          id: options.bodyId || reference,
          tracking_events:
            type === "postcard.created"
              ? []
              : [{ name: "Mailed", time: new Date().toISOString() }],
        },
      });
      const timestamp = String(Date.now());
      const signature = createHmac("sha256", process.env.LOB_WEBHOOK_SECRET!)
        .update(timestamp + "." + body)
        .digest("hex");
      return webhook(
        new NextRequest(`${origin}/api/collection/webhooks/lob`, {
          method: "POST",
          body,
          headers: {
            "lob-signature-timestamp": timestamp,
            "lob-signature": options.invalidSignature
              ? "0".repeat(64)
              : signature,
          },
        }),
      );
    };

    assert.equal(approved.postcardPreparation?.status, "needs_attention");
    assert.equal(
      (await run()).providerAttempts,
      0,
      "Story approval cannot bypass public-print consent",
    );
    assert.equal(postcards.length, 0);
    await mutateCollection(approved.id, async (collection) => {
      collection.postcardPublicConsent = {
        version: 2,
        messagesHash: postcardPublicMessagesHash(collection),
        approvedAt: new Date().toISOString(),
      };
      return prepareAutomaticPostcards(collection);
    });
    const prepared = await read();
    assert.equal(prepared.postcardPreparation?.status, "ready");
    assert.equal(prepared.postcardProof?.releaseStatus, "released");
    const expectedDates = [
      "2026-01-15T12:00:00.000Z",
      "2026-04-15T12:00:00.000Z",
      "2026-07-15T12:00:00.000Z",
      "2026-10-15T12:00:00.000Z",
    ];
    assert.deepEqual(
      prepared.deliveries.map((card) => card.scheduledFor),
      expectedDates,
    );
    const frozenProof = JSON.stringify(prepared.postcardProof);
    const denied = await jobs(
      new NextRequest(`${origin}/api/collection/jobs`, { method: "POST" }),
    );
    assert.equal(denied.status, 401);
    assert.equal(postcards.length, 0);

    for (const [index, due] of expectedDates.entries()) {
      t.mock.timers.setTime(Date.parse(due) - 1);
      await run();
      assert.equal(
        postcards.length,
        index,
        `Card ${index + 1} cannot be sent early`,
      );
      t.mock.timers.setTime(Date.parse(due));
      await run();
      const dueState = await read();
      assert.equal(
        postcards.length,
        index + 1,
        JSON.stringify({
          preparation: dueState.postcardPreparation,
          status: dueState.deliveries[index]?.status,
          error: dueState.deliveries[index]?.error,
          dispatch: {
            attempts: dueState.deliveries[index]?.dispatch?.attempts,
          },
        }),
      );
      const sent = postcards[index];
      const chapterId = `q${index + 1}`;
      assert.equal(sent.at, due);
      assert.equal(
        sent.key,
        `time-tapestry/${approved.id}/v1/postcard/${chapterId}`,
      );
      for (const [field, expected] of Object.entries({
        "to[name]": "Sam Fixture",
        "to[address_line1]": "1 Fixture Way",
        "to[address_line2]": "Unit 2",
        "to[address_city]": "Example",
        "to[address_state]": "CA",
        "to[address_zip]": "90001",
        "to[address_country]": "US",
        from: "adr_fixture",
        size: "6x9",
        mail_type: "usps_first_class",
        use_type: "operational",
      }))
        assert.equal(sent.body.get(field), expected);
      for (const side of ["front", "back"] as const) {
        const file = sent.body.get(side);
        assert.ok(file instanceof File);
        assert.equal(file.type, "text/html; charset=utf-8");
        assert.equal(file.name, `${side}.html`);
        const html = await file.text();
        assert.equal(
          html,
          prepared.postcardProof!.cards[index][side],
          "Provider receives the approved artwork bytes",
        );
        for (const secret of [
          approved.ownerKey,
          approved.recipientKey,
          approved.requesterKey,
          "Private fixture",
        ])
          assert.ok(!html.includes(secret));
        if (side === "back") {
          const expectedUrl = `${origin}/collection/${approved.id}/chapter/${chapterId}`;
          const expectedQr = await QRCode.toDataURL(expectedUrl, {
            errorCorrectionLevel: "M",
            width: 600,
            margin: 4,
          });
          assert.ok(
            html.includes(`src="${expectedQr}"`),
            "Printed QR identifies the correct collection and chapter without an access credential",
          );
        }
      }
      const submitted = await read();
      assert.equal(submitted.deliveries[index].providerId, sent.id);
      assert.equal(submitted.deliveries[index].status, "submitted");
      assert.equal(submitted.deliveries[index].mailedAt, undefined);
      await run();
      assert.equal(
        postcards.length,
        index + 1,
        "Repeated jobs cannot duplicate a submission",
      );
      if (index < expectedDates.length - 1) {
        // Probe the next due date while the prior mailing is unconfirmed, then
        // restore this card's date to exercise its normal carrier confirmation.
        t.mock.timers.setTime(Date.parse(expectedDates[index + 1]));
        await run();
        assert.equal(
          postcards.length,
          index + 1,
          "A later due date cannot bypass an unconfirmed prior mailing",
        );
        t.mock.timers.setTime(Date.parse(due));
      }

      const pendingState = JSON.stringify((await read()).deliveries);
      assert.equal(
        (await sendEvent("psc_unknown", `evt_unknown${index}`)).status,
        409,
      );
      assert.equal(
        (
          await sendEvent(sent.id, `evt_wrongsignature${index}`, {
            invalidSignature: true,
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await sendEvent(sent.id, `evt_wrongbody${index}`, {
            bodyId: "psc_other",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await sendEvent(sent.id, `evt_created${index}`, {
            type: "postcard.created",
          })
        ).status,
        200,
      );
      if (index > 0)
        assert.equal(
          (await sendEvent(postcards[0].id, `evt_priorcard${index}`)).status,
          200,
        );
      assert.equal(JSON.stringify((await read()).deliveries), pendingState);
      if (index === 0) {
        process.env.LOB_API_KEY = "test_fixture_never_sent_to_lob";
        assert.equal(
          (await sendEvent(sent.id, "evt_testmodemailing")).status,
          422,
        );
        process.env.LOB_API_KEY = syntheticLobKey;
        assert.equal(
          JSON.stringify((await read()).deliveries),
          pendingState,
          "Test mode cannot fabricate mailing evidence",
        );
      }
      assert.equal(
        (await sendEvent(sent.id, `evt_mailed${index}`)).status,
        200,
      );
      const mailed = await read();
      assert.equal(mailed.deliveries[index].status, "mailed");
      assert.equal(mailed.deliveries[index].mailedAt, due);
      const notificationCount = mailed.notifications.length;
      const duplicate = await sendEvent(sent.id, `evt_mailed${index}`);
      assert.equal((await duplicate.json()).duplicate, true);
      assert.equal((await read()).notifications.length, notificationCount);
      await run();
      assert.equal(postcards.length, index + 1);
      assert.ok(
        emails.every(
          (email) =>
            email.to.length === 1 && email.to[0] === approved.storyteller.email,
        ),
        "Postal status updates never spoil the gift with recipient emails",
      );
    }
    t.mock.timers.setTime(new Date("2027-10-15T12:00:00.000Z").getTime());
    await run();
    const completed = await read();
    assert.equal(postcards.length, 4);
    assert.equal(new Set(postcards.map((card) => card.key)).size, 4);
    assert.equal(new Set(postcards.map((card) => card.id)).size, 4);
    assert.ok(
      completed.deliveries.every((delivery) => delivery.status === "mailed"),
    );
    assert.equal(JSON.stringify(completed.postcardProof), frozenProof);
    assert.equal(emails.length, 4);
  } finally {
    globalThis.fetch = priorFetch;
    t.mock.timers.reset();
  }
});
