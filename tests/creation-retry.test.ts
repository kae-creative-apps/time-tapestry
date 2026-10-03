import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

test("creation retries bind one verified request and typed-only stories never enter film preparation", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "tapestry-create-retry-"),
  );
  for (const name of [
    "VERCEL",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "BLOB_READ_WRITE_TOKEN",
    "GLOO_API_KEY",
    "OPENAI_API_KEY",
    "ELEVENLABS_API_KEY",
    "RESEND_API_KEY",
    "LOB_API_KEY",
  ])
    delete process.env[name];
  Object.assign(process.env, {
    NODE_ENV: "test",
    SECURITY_LOCAL_BYPASS: "true",
    SECURITY_TEST_BYPASS: "true",
    COLLECTION_DATA_DIR: directory,
    NEXT_PUBLIC_APP_URL: "https://example.com",
  });
  const { createCollectionRequest } =
    await import("../src/lib/collection/create-request");
  const { getCollection, listCollections, mutateCollection } =
    await import("../src/lib/collection/store");
  const { publicView, linksFor } = await import("../src/lib/collection/access");
  const { POST: create } = await import("../src/app/api/collection/route");
  const { POST: post } = await import("../src/app/api/collection/[id]/route");
  const { latestFilmJob } =
    await import("../src/lib/collection/films/jobstore");
  const body = {
    initiationPath: "request",
    storyteller: { name: "Jo Example", email: "jo@example.test" },
    recipient: { name: "Sam Example", email: "sam@example.test" },
  };
  let authorizationCalls = 0;
  const authorize = async () => {
    authorizationCalls++;
  };
  const req = (url: string, value: unknown) =>
    new NextRequest(`http://localhost${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
  const priorFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("No provider calls are allowed in this fixture");
  };
  try {
    const rejectedId = randomUUID();
    await assert.rejects(
      createCollectionRequest(
        { ...body, submissionId: rejectedId },
        async () => {
          throw new Error("Fixture human verification rejected");
        },
      ),
      /verification rejected/,
    );
    assert.equal(
      (await listCollections()).length,
      0,
      "Failed human verification creates no collection or retry mapping",
    );
    const afterRejection = await createCollectionRequest(
      { ...body, submissionId: rejectedId },
      authorize,
    );
    assert.equal(afterRejection.status, "invited");
    authorizationCalls = 0;
    const submissionId = randomUUID();
    const created = await Promise.all(
      Array.from({ length: 8 }, () =>
        createCollectionRequest({ ...body, submissionId }, authorize),
      ),
    );
    assert.equal(
      authorizationCalls,
      1,
      "Human verification belongs only to the single new collection mutation",
    );
    assert.equal(new Set(created.map((c) => c.id)).size, 1);
    assert.equal(new Set(created.map((c) => c.ownerKey)).size, 1);
    const c = created[0];
    assert.equal(c.notifications.length, 1);
    assert.equal(
      c.notifications[0].url,
      process.env.NEXT_PUBLIC_APP_URL + linksFor(c).interview,
    );
    assert.ok(
      !JSON.stringify(c).includes(submissionId),
      "The raw retry credential is not stored",
    );
    for (const role of ["owner", "recipient", "requester"] as const)
      assert.equal(publicView(c, role).creationRequestHash, undefined);
    await assert.rejects(
      createCollectionRequest(
        {
          ...body,
          submissionId,
          storyteller: { ...body.storyteller, email: "different@example.test" },
        },
        authorize,
      ),
      (error) => (error as { status: number }).status === 409,
    );
    assert.equal(authorizationCalls, 1);
    const invalid = await create(
      req("/api/collection", { ...body, submissionId: c.id }),
    );
    assert.equal(invalid.status, 400);
    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        create(req("/api/collection", { ...body, submissionId })),
      ),
    );
    assert.ok(responses.every((r) => r.status === 201));
    const results = await Promise.all(responses.map((r) => r.json()));
    assert.ok(
      results.every(
        (r) => r.collection.id === c.id && r.nextUrl === results[0].nextUrl,
      ),
    );
    assert.equal((await listCollections()).length, 2);
    const conflict = await create(
      req("/api/collection", {
        ...body,
        submissionId,
        recipient: { ...body.recipient, name: "Changed name" },
      }),
    );
    assert.equal(conflict.status, 409);
    assert.ok(!JSON.stringify(await conflict.json()).includes(c.ownerKey));
    await mutateCollection(c.id, (current) => {
      current.address = {
        name: current.recipient.name,
        line1: "1 Example Way",
        city: "Town",
        region: "CA",
        postalCode: "90001",
        country: "US",
      };
      current.addressConfirmed = true;
      return current;
    });
    const replay = await createCollectionRequest(
      { ...body, submissionId },
      authorize,
    );
    assert.equal(
      replay.addressConfirmed,
      true,
      "Replays return current saved progress without overwriting it",
    );

    const act = async (value: unknown) =>
      post(req(`/api/collection/${c.id}?key=${c.ownerKey}`, value), {
        params: Promise.resolve({ id: c.id }),
      });
    for (let i = 1; i <= 4; i++) {
      const saved = await act({
        action: "save_take",
        take: {
          id: randomUUID(),
          questionId: `q${i}`,
          prompt: "A memory",
          kind: "text",
          text: `This is my written memory ${i}.`,
        },
      });
      assert.equal(saved.status, 200);
    }
    const generated = await act({
      action: "generate",
      prepareFilms: true,
      processingApproved: true,
    });
    assert.equal(generated.status, 200);
    const result = await generated.json();
    assert.equal(result.filmPreparationError, undefined);
    assert.equal(result.collection.status, "draft");
    const prepared = (await getCollection(c.id))!;
    assert.equal(prepared.chapters.length, 4);
    assert.equal(
      prepared.notifications.filter((n) => n.kind === "review_ready").length,
      1,
    );
    assert.ok(
      !prepared.notifications.some((n) =>
        n.id.includes("preparation-needs-attention"),
      ),
    );
    assert.equal(await latestFilmJob(c.id), null);
    assert.equal(
      (
        await act({
          action: "generate",
          prepareFilms: true,
          processingApproved: true,
        })
      ).status,
      200,
    );
    assert.equal(
      (await getCollection(c.id))!.notifications.filter(
        (n) => n.kind === "review_ready",
      ).length,
      1,
    );
  } finally {
    globalThis.fetch = priorFetch;
    await rm(directory, { recursive: true, force: true });
  }
});
