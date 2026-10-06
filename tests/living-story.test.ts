import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { syntheticFilmCollection } from "./film-fixture";
import { pcmWavFixture } from "./pcm-wav-fixture";
import { verifiedRecipientCookie } from "./verified-recipient-fixture";
import { FLOURISHING_PROMPTS } from "../src/lib/collection/flourishing-prompts";
import type { Collection } from "../src/lib/collection/types";
import type { LivingStoryMoment } from "../src/lib/collection/living-story-types";

let dir: string;
let store: typeof import("../src/lib/collection/store");
let lifecycle: typeof import("../src/lib/collection/living-story");
let media: typeof import("../src/lib/collection/media");
let access: typeof import("../src/lib/collection/access");
let delivery: typeof import("../src/lib/collection/delivery");
let route: typeof import("../src/app/api/collection/[id]/moments/route");
let recipients: typeof import("../src/app/api/collection/[id]/recipients/route");
before(async () => {
  for (const key of [
    "VERCEL",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "RESEND_API_KEY",
    "LOB_API_KEY",
  ])
    delete process.env[key];
  dir = await mkdtemp(path.join(os.tmpdir(), "living-story-"));
  Object.assign(process.env, {
    NODE_ENV: "test",
    SECURITY_TEST_BYPASS: "true",
    SECURITY_LOCAL_BYPASS: "true",
    COLLECTION_DATA_DIR: dir,
    NEXT_PUBLIC_APP_URL: "https://stories.example.test",
    COLLECTION_DELIVERY_ENABLED: "false",
    COLLECTION_EMAIL_ENABLED: "false",
  });
  store = await import("../src/lib/collection/store");
  lifecycle = await import("../src/lib/collection/living-story");
  media = await import("../src/lib/collection/media");
  access = await import("../src/lib/collection/access");
  delivery = await import("../src/lib/collection/delivery");
  route = await import("../src/app/api/collection/[id]/moments/route");
  recipients = await import("../src/app/api/collection/[id]/recipients/route");
});
after(async () => {
  await rm(dir, { recursive: true, force: true });
});
const params = (c: Collection) => ({ params: Promise.resolve({ id: c.id }) });
const promptIds = FLOURISHING_PROMPTS.slice(0, 3).map((p) => p.id);
function request(
  c: Collection,
  body?: unknown,
  cookie?: string,
  key = c.ownerKey,
  suffix = "moments",
) {
  return new NextRequest(
    `http://localhost/api/collection/${c.id}/${suffix}${key ? `?key=${key}` : ""}`,
    {
      ...(body === undefined
        ? {}
        : { method: "POST", body: JSON.stringify(body) }),
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
    },
  );
}
async function post(
  c: Collection,
  body: unknown,
  cookie?: string,
  key = c.ownerKey,
) {
  const response = await route.POST(request(c, body, cookie, key), params(c));
  return { status: response.status, body: await response.json() };
}
async function fixture() {
  const c = syntheticFilmCollection();
  c.status = "approved";
  c.approvedAt = c.createdAt;
  c.deliveries = c.chapters.map((ch, i) => ({
    chapterId: ch.id,
    scheduledFor: new Date(Date.now() + i * 14 * 86400000).toISOString(),
    status: "scheduled" as const,
  }));
  await store.putCollection(c);
  return c;
}
async function start(c: Collection, selected = [promptIds[0]]) {
  const result = await post(c, {
    action: "start",
    requestId: randomUUID(),
    promptIds: selected,
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body.livingStory.moments.at(-1) as LivingStoryMoment;
}
async function source(c: Collection, moment: LivingStoryMoment) {
  const saved = await media.saveLocalMedia(
    c.id,
    "owner",
    new File([new Uint8Array(pcmWavFixture())], "memory.wav", {
      type: "audio/wav",
    }),
    undefined,
    moment.id,
  );
  assert.equal(
    (
      await post(c, {
        action: "attach",
        momentId: moment.id,
        mediaId: saved.id,
      })
    ).status,
    200,
  );
  return saved;
}
async function queue(c: Collection, moment: LivingStoryMoment) {
  const saved = await source(c, moment);
  const response = await post(c, {
    action: "submit",
    momentId: moment.id,
    processingApproved: true,
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return saved;
}
async function generated(c: Collection, moment: LivingStoryMoment) {
  // Deliberately a metadata fixture. Renderer tests own playable output validation.
  const output = await media.saveLocalMedia(
    c.id,
    "owner",
    new File(["synthetic saved film metadata fixture"], "output.mp4", {
      type: "video/mp4",
    }),
    undefined,
    moment.id,
  );
  output.provenance = "generated_film";
  output.originalSourceMediaId = (await store.getCollection(
    c.id,
  ))!.livingStory!.moments.find((m) => m.id === moment.id)!.sourceMediaId;
  await store.putMedia(output);
  return output;
}

test("verified family requests are serialized, bounded and idempotent, with independent owner batches", async () => {
  const c = await fixture();
  const cookie = await verifiedRecipientCookie(c.recipient.email);
  const body = {
    action: "request",
    requestId: randomUUID(),
    promptIds,
    displayName: "Family Reader",
  };
  assert.equal(
    (await post(c, body, undefined, c.recipientKey)).status,
    403,
    "locator key is not verification",
  );
  assert.equal((await post(c, body, undefined, c.requesterKey)).status, 403);
  const race = await Promise.all([
    post(c, body, cookie, ""),
    post(c, body, cookie, ""),
  ]);
  assert.deepEqual(
    race.map((r) => r.status),
    [200, 200],
  );
  const stored = (await store.getCollection(c.id))!;
  assert.equal(stored.livingStory!.batches.length, 1);
  assert.equal(stored.livingStory!.moments.length, 3);
  assert.equal(
    stored.notifications.filter((n) => n.kind === "living_story_request")
      .length,
    1,
  );
  assert.equal(
    (await post(c, { ...body, promptIds: [promptIds[0]] }, cookie, "")).status,
    400,
  );
  assert.equal(
    (await post(c, { ...body, requestId: randomUUID() }, cookie, "")).status,
    400,
  );
  assert.equal(
    (
      await post(
        c,
        {
          ...body,
          requestId: randomUUID(),
          promptIds: [promptIds[0], promptIds[0]],
        },
        cookie,
        "",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await post(
        c,
        { ...body, requestId: randomUUID(), promptIds: ["unknown-prompt"] },
        cookie,
        "",
      )
    ).status,
    400,
  );
  await start(c);
  assert.equal(
    (await store.getCollection(c.id))!.livingStory!.batches.length,
    2,
  );
  c.status = "draft";
  await store.putCollection(c);
  assert.equal(
    (await post(c, { action: "start", requestId: randomUUID(), promptIds }))
      .status,
    400,
  );
});

test("submission needs a real saved original, consent, exact moment ownership and a readable recording", async () => {
  const c = await fixture();
  const moment = await start(c);
  const other = await start(c, [promptIds[1]]);
  assert.equal(
    (
      await post(c, {
        action: "publish",
        momentId: moment.id,
        processingApproved: true,
        text: "typed story",
      })
    ).status,
    400,
  );
  const wrong = await source(c, other);
  assert.equal(
    (
      await post(c, {
        action: "attach",
        momentId: moment.id,
        mediaId: wrong.id,
      })
    ).status,
    400,
  );
  const outside = await media.saveLocalMedia(
    c.id,
    "owner",
    new File(["original gift"], "old.wav", { type: "audio/wav" }),
  );
  assert.equal(
    (
      await post(c, {
        action: "attach",
        momentId: moment.id,
        mediaId: outside.id,
      })
    ).status,
    400,
  );
  const corrupt = await media.saveLocalMedia(
    c.id,
    "owner",
    new File(["not actual audio"], "bad.wav", { type: "audio/wav" }),
    undefined,
    moment.id,
  );
  assert.equal(
    (
      await post(c, {
        action: "attach",
        momentId: moment.id,
        mediaId: corrupt.id,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await post(c, {
        action: "submit",
        momentId: moment.id,
        processingApproved: true,
      })
    ).status,
    400,
  );
  await source(c, moment);
  assert.equal(
    (await post(c, { action: "publish", momentId: moment.id })).status,
    400,
  );
  const recipientCookie = await verifiedRecipientCookie(c.recipient.email);
  assert.equal(
    (
      await post(
        c,
        { action: "publish", momentId: moment.id, processingApproved: true },
        recipientCookie,
        "",
      )
    ).status,
    400,
  );
});

test("late recording attachment cannot replace a newer selection and duplicate acknowledgement is safe", async () => {
  const c = await fixture();
  const moment = await start(c);
  const originals = await Promise.all(
    [1, 2].map(() =>
      media.saveLocalMedia(
        c.id,
        "owner",
        new File([new Uint8Array(pcmWavFixture())], "memory.wav", {
          type: "audio/wav",
        }),
        undefined,
        moment.id,
      ),
    ),
  );
  const results = await Promise.all(
    originals.map((saved) =>
      post(c, {
        action: "attach",
        momentId: moment.id,
        mediaId: saved.id,
        expectedSourceMediaId: null,
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
  const selected = (await store.getCollection(c.id))!.livingStory!.moments[0]
    .sourceMediaId!;
  assert.ok(originals.some((saved) => saved.id === selected));
  assert.equal(
    (
      await post(c, {
        action: "submit",
        momentId: moment.id,
        processingApproved: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await post(c, {
        action: "attach",
        momentId: moment.id,
        mediaId: selected,
        expectedSourceMediaId: null,
      })
    ).status,
    200,
  );
  assert.equal(
    (await store.getCollection(c.id))!.livingStory!.moments[0].status,
    "processing",
  );
  for (const saved of originals)
    assert.ok(
      await store.getMedia(saved.id),
      "both originals remain preserved",
    );
  const claim = await lifecycle.claimNextLivingStoryMoment();
  await lifecycle.failLivingStoryMoment(
    c.id,
    moment.id,
    claim!.leaseId,
    "Synthetic fixture cleanup",
  );
});

test("only completed edited output publishes, original media stays private, notices are atomic, and the original gift stays frozen", async () => {
  const c = await fixture();
  c.additionalRecipients = [
    {
      id: randomUUID(),
      email: "living-member@example.test",
      invitedAt: c.createdAt,
    },
    {
      id: randomUUID(),
      email: "revoked@example.test",
      invitedAt: c.createdAt,
      revokedAt: c.createdAt,
    },
  ];
  await store.putCollection(c);
  const frozen = JSON.stringify({
    chapters: c.chapters,
    deliveries: c.deliveries,
    approvedAt: c.approvedAt,
  });
  const cookie = await verifiedRecipientCookie(c.recipient.email);
  const requested = await post(
    c,
    { action: "request", requestId: randomUUID(), promptIds: [promptIds[0]] },
    cookie,
    "",
  );
  const moment = requested.body.livingStory.moments[0] as LivingStoryMoment;
  const original = await queue(c, moment);
  const queued = (await store.getCollection(c.id))!;
  assert.equal(queued.livingStory!.moments[0].status, "processing");
  assert.equal(
    queued.notifications.filter((n) => n.kind === "living_story_published")
      .length,
    0,
  );
  assert.equal(media.mediaAllowed(queued, "recipient", original), false);
  const familyView = access.publicView(queued, "recipient");
  assert.equal(familyView.livingStory!.moments[0].sourceMediaId, undefined);
  assert.equal(
    familyView.livingStory!.batches[0].requestedByRecipientId,
    undefined,
  );
  const claimed = await lifecycle.claimNextLivingStoryMoment();
  assert.equal(claimed?.moment.id, moment.id);
  assert.equal(
    await lifecycle.claimNextLivingStoryMoment(),
    null,
    "live lease cannot be claimed twice",
  );
  const output = await generated(c, moment);
  const payload = {
    videoMediaId: output.id,
    content: "A source-based written memory.",
    sourceMediaId: original.id,
    sourceSha256: "a".repeat(64),
    sourceQuote: "a true phrase",
    sourceTranscript: "Here is a true phrase from this story.",
  };
  await assert.rejects(
    lifecycle.completeLivingStoryMoment(c.id, moment.id, "old-lease", payload),
    /lease/,
  );
  await assert.rejects(
    lifecycle.completeLivingStoryMoment(c.id, moment.id, claimed!.leaseId, {
      ...payload,
      sourceQuote: "invented",
    }),
    /quote/,
  );
  await assert.rejects(
    lifecycle.completeLivingStoryMoment(c.id, moment.id, claimed!.leaseId, {
      ...payload,
      videoMediaId: original.id,
    }),
    /prepared film/,
  );
  const published = await lifecycle.completeLivingStoryMoment(
    c.id,
    moment.id,
    claimed!.leaseId,
    payload,
  );
  assert.equal(published.livingStory!.moments[0].status, "published");
  assert.ok(published.livingStory!.batches[0].closedAt);
  assert.equal(published.livingStory!.moments[0].sourceQuote, "a true phrase");
  assert.equal(media.mediaAllowed(published, "recipient", output), true);
  assert.equal(media.mediaAllowed(published, "recipient", original), false);
  assert.equal(
    media.mediaAllowed(
      published,
      "recipient",
      output,
      c.additionalRecipients![1].id,
    ),
    false,
  );
  assert.equal(
    published.notifications.filter((n) => n.kind === "living_story_published")
      .length,
    3,
  );
  await lifecycle.completeLivingStoryMoment(
    c.id,
    moment.id,
    claimed!.leaseId,
    payload,
  );
  const after = (await store.getCollection(c.id))!;
  assert.equal(
    after.notifications.filter((n) => n.kind === "living_story_published")
      .length,
    3,
  );
  assert.equal(
    JSON.stringify({
      chapters: after.chapters,
      deliveries: after.deliveries,
      approvedAt: after.approvedAt,
    }),
    frozen,
  );
  assert.equal(
    (
      await post(
        c,
        {
          action: "request",
          requestId: randomUUID(),
          promptIds: [promptIds[1]],
        },
        cookie,
        "",
      )
    ).status,
    200,
  );
});

test("lease expiry rejects stale completion, bounded failures keep originals and new recordings reset attempts", async () => {
  const c = await fixture();
  const moment = await start(c);
  const original = await queue(c, moment);
  const first = await lifecycle.claimNextLivingStoryMoment();
  assert.equal(first?.moment.id, moment.id);
  await store.mutateCollection(c.id, (saved) => {
    saved.livingStory!.moments[0].processing!.leaseExpiresAt =
      "2000-01-01T00:00:00.000Z";
    return saved;
  });
  const second = await lifecycle.claimNextLivingStoryMoment();
  assert.equal(second?.moment.id, moment.id);
  assert.notEqual(first!.leaseId, second!.leaseId);
  await assert.rejects(
    lifecycle.failLivingStoryMoment(
      c.id,
      moment.id,
      first!.leaseId,
      "old result",
    ),
    /lease/,
  );
  await lifecycle.failLivingStoryMoment(
    c.id,
    moment.id,
    second!.leaseId,
    "Timing needs attention.",
  );
  assert.ok(await store.getMedia(original.id));
  assert.equal(
    (
      await post(c, {
        action: "submit",
        momentId: moment.id,
        processingApproved: true,
      })
    ).status,
    200,
  );
  const third = await lifecycle.claimNextLivingStoryMoment();
  await lifecycle.failLivingStoryMoment(
    c.id,
    moment.id,
    third!.leaseId,
    "Still needs attention.",
  );
  assert.equal(
    (
      await post(c, {
        action: "submit",
        momentId: moment.id,
        processingApproved: true,
      })
    ).status,
    400,
  );
  await source(c, moment);
  assert.equal(
    (
      await post(c, {
        action: "submit",
        momentId: moment.id,
        processingApproved: true,
      })
    ).status,
    200,
  );
  const fresh = await lifecycle.claimNextLivingStoryMoment();
  assert.equal(fresh!.moment.processing!.attempts, 1);
  await lifecycle.failLivingStoryMoment(
    c.id,
    moment.id,
    fresh!.leaseId,
    "Synthetic test cleanup",
  );
});

test("revocation removes playback and queued email immediately, including after reinvitation", async () => {
  const c = await fixture();
  const memberId = randomUUID();
  c.additionalRecipients = [
    {
      id: memberId,
      email: "notify-member@example.test",
      invitedAt: c.createdAt,
    },
  ];
  await store.putCollection(c);
  const moment = await start(c);
  const original = await queue(c, moment);
  const claim = await lifecycle.claimNextLivingStoryMoment();
  const output = await generated(c, moment);
  const published = await lifecycle.completeLivingStoryMoment(
    c.id,
    moment.id,
    claim!.leaseId,
    {
      videoMediaId: output.id,
      content: "A written memory.",
      sourceMediaId: original.id,
      sourceSha256: "a".repeat(64),
    },
  );
  const notice = published.notifications.find(
    (n) => n.kind === "living_story_published" && n.recipientId === memberId,
  )!;
  assert.equal(delivery.notificationSuppressionReason(published, notice), null);
  const response = await recipients.POST(
    request(
      c,
      { action: "revoke", recipientId: memberId },
      undefined,
      c.ownerKey,
      "recipients",
    ),
    params(c),
  );
  assert.equal(response.status, 200);
  const revoked = (await store.getCollection(c.id))!;
  assert.equal(
    revoked.notifications.find((n) => n.id === notice.id)!.status,
    "suppressed",
  );
  assert.ok(delivery.notificationSuppressionReason(revoked, notice));
  assert.equal(
    media.mediaAllowed(revoked, "recipient", output, memberId),
    false,
  );
  const cookie = await verifiedRecipientCookie(
    c.additionalRecipients![0].email,
  );
  assert.equal(
    (await route.GET(request(c, undefined, cookie, ""), params(c))).status,
    403,
  );
  await recipients.POST(
    request(
      c,
      {
        action: "invite",
        recipients: [{ email: c.additionalRecipients![0].email }],
      },
      undefined,
      c.ownerKey,
      "recipients",
    ),
    params(c),
  );
  assert.equal(
    (await store.getCollection(c.id))!.notifications.find(
      (n) => n.id === notice.id,
    )!.status,
    "suppressed",
  );
});

test("declining closes one family batch without deleting saved originals or exposing owner drafts", async () => {
  const c = await fixture();
  const cookie = await verifiedRecipientCookie(c.recipient.email);
  const response = await post(
    c,
    {
      action: "request",
      requestId: randomUUID(),
      promptIds: promptIds.slice(0, 2),
    },
    cookie,
    "",
  );
  const [first, second] = response.body.livingStory
    .moments as LivingStoryMoment[];
  const original = await source(c, first);
  await post(c, { action: "decline", momentId: first.id });
  assert.equal(
    (await store.getCollection(c.id))!.livingStory!.batches[0].closedAt,
    undefined,
  );
  await post(c, { action: "decline", momentId: second.id });
  assert.ok(
    (await store.getCollection(c.id))!.livingStory!.batches[0].closedAt,
  );
  assert.ok(await store.getMedia(original.id));
  await start(c);
  const family = await route.GET(request(c, undefined, cookie, ""), params(c));
  assert.deepEqual((await family.json()).livingStory, {
    batches: [],
    moments: [],
  });
});
