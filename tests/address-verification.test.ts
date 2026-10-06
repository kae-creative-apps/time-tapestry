import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { NextRequest } from "next/server";
import { prepareCollection } from "../src/lib/collection/create";
import {
  addressVerificationIsCurrent,
  assertAddressVerification,
  normalizePostalAddress,
  postalAddressHash,
  verifyPostalAddress,
} from "../src/lib/lob/address-verification";
import { fixtureAddressReceipt } from "./address-verification-fixture";
import {
  releasePostcardProof,
  prepareAutomaticPostcards,
  buildPostcardProof,
  approvePostcardProof,
  postcardPublicMessagesHash,
} from "../src/lib/collection/postcard-proofs";
import { verifiedRecipientCookie } from "./verified-recipient-fixture";

let directory: string;
before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "tt-address-check-"));
  Object.assign(process.env, {
    NODE_ENV: "test",
    SECURITY_LOCAL_BYPASS: "true",
    SECURITY_TEST_BYPASS: "true",
    COLLECTION_DATA_DIR: directory,
    NEXT_PUBLIC_APP_URL: "https://stories.example.com",
    LOB_API_KEY: "live_fixture_never_sent",
  });
  for (const key of ["VERCEL", "KV_REST_API_URL", "KV_REST_API_TOKEN"])
    delete process.env[key];
});
after(async () => {
  await rm(directory, { recursive: true, force: true });
});
const address = {
  name: "Recipient",
  line1: "1 Example St",
  line2: "",
  city: "Denver",
  region: "CO",
  postalCode: "80201",
  country: "US",
};
const collection = () =>
  prepareCollection({
    initiationPath: "share",
    storyteller: { name: "Owner", email: "owner@example.test" },
    recipient: { name: "Recipient", email: "recipient@example.test" },
    address,
  });
const response = (deliverability = "deliverable") => ({
  id: "us_ver_fixture123",
  deliverability,
  primary_line: "1 EXAMPLE ST",
  secondary_line: "",
  components: {
    city: "DENVER",
    state: "CO",
    zip_code: "80201",
    zip_code_plus_4: "1234",
  },
});

test("Lob verification standardizes a complete deliverable address and preserves missing-unit warnings", async (t) => {
  let calls = 0;
  let verdict = "deliverable";
  t.mock.method(
    globalThis,
    "fetch",
    async (
      input: Parameters<typeof fetch>[0],
      options?: Parameters<typeof fetch>[1],
    ) => {
      calls += 1;
      assert.equal(
        String(input),
        "https://api.lob.com/v1/us_verifications?case=proper",
      );
      assert.equal(options?.redirect, "error");
      const sent = JSON.parse(String(options?.body));
      assert.equal(sent.primary_line, address.line1);
      assert.equal(sent.zip_code, address.postalCode);
      assert.ok(!String(options?.body).includes("recipient@example.test"));
      return Response.json(response(verdict));
    },
  );
  const result = await verifyPostalAddress("collection-fixture", address);
  assert.equal(result.result.address!.postalCode, "80201-1234");
  assert.equal(
    result.receipt!.addressHash,
    postalAddressHash("collection-fixture", result.result.address!),
  );
  for (const incomplete of [
    "deliverable_missing_unit",
    "deliverable_incorrect_unit",
    "undeliverable",
  ]) {
    verdict = incomplete;
    const checked = await verifyPostalAddress("collection-fixture", address);
    assert.equal(checked.receipt, undefined);
    assert.equal(checked.result.address, undefined);
    assert.equal(checked.result.deliverable, false);
  }
  assert.equal(calls, 4);
});

test("provider failures, invalid verdicts and malformed standardized addresses cannot produce receipts", async (t) => {
  let value: unknown = { ...response(), components: {} };
  t.mock.method(globalThis, "fetch", async () => Response.json(value));
  await assert.rejects(
    verifyPostalAddress("collection-fixture", address),
    /incomplete address/,
  );
  value = { ...response(), deliverability: "unknown" };
  await assert.rejects(
    verifyPostalAddress("collection-fixture", address),
    /incomplete result/,
  );
  value = { ...response(), id: undefined };
  await assert.rejects(
    verifyPostalAddress("collection-fixture", address),
    /incomplete result/,
  );
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("private provider error");
  });
  await assert.rejects(
    verifyPostalAddress("collection-fixture", address),
    /did not respond/,
  );
  assert.throws(
    () =>
      normalizePostalAddress(
        { ...address, postalCode: "not a zip" },
        "Recipient",
      ),
    /five-digit/,
  );
  assert.throws(
    () => normalizePostalAddress({ ...address, country: "CA" }, "Recipient"),
    /US address/,
  );
});

test("verification receipts reject changed addresses, other collections, client flags and expired acceptance", () => {
  const c = collection();
  const receipt = fixtureAddressReceipt(c);
  c.pendingAddressVerification = receipt;
  assert.equal(assertAddressVerification(c, c.address!, receipt.id), receipt);
  assert.throws(
    () =>
      assertAddressVerification(
        c,
        { ...c.address!, line1: "9 Elsewhere Rd" },
        receipt.id,
      ),
    /Check this address/,
  );
  assert.throws(
    () =>
      assertAddressVerification(
        { ...c, id: "different-collection" },
        c.address!,
        receipt.id,
      ),
    /Check this address/,
  );
  assert.throws(
    () => assertAddressVerification(c, c.address!, true),
    /Check this address/,
  );
  receipt.verifiedAt = new Date(Date.now() - 31 * 60 * 1000).toISOString();
  assert.throws(
    () => assertAddressVerification(c, c.address!, receipt.id),
    /Check this address/,
  );
  c.addressVerification = receipt;
  assert.equal(
    addressVerificationIsCurrent(c, true),
    true,
    "acceptance expiry does not invalidate future scheduled mail",
  );
  c.addressVerification.mode = "test";
  assert.equal(addressVerificationIsCurrent(c, true), false);
});

test("verification route requires private collection access and stores a pending receipt without changing a saved address", async (t) => {
  const store = await import("../src/lib/collection/store");
  const { POST } = await import("../src/app/api/lob/verify-address/route");
  const c = collection();
  await store.putCollection(c);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return Response.json(response());
  });
  const request = (key: string, body: unknown = { address }, cookie?: string) =>
    new NextRequest(
      `http://localhost/api/lob/verify-address?collectionId=${c.id}&key=${key}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify(body),
      },
    );
  assert.equal((await POST(request("wrong"))).status, 403);
  assert.equal(
    (await POST(request(c.recipientKey))).status,
    403,
    "a bearer recipient key cannot replace verified email",
  );
  assert.equal(
    (await POST(request(c.requesterKey))).status,
    403,
    "storyteller requester is not the postal recipient",
  );
  assert.equal(calls, 0);
  const checked = await POST(request(c.ownerKey));
  assert.equal(checked.status, 200);
  const data = await checked.json();
  const saved = await store.getCollection(c.id);
  assert.equal(saved!.pendingAddressVerification!.id, data.verificationId);
  assert.deepEqual(saved!.address, c.address);
  assert.equal(saved!.addressVerification, undefined);
  assert.equal(checked.headers.get("cache-control"), "no-store");
  const { POST: saveAddress } =
    await import("../src/app/api/collection/[id]/route");
  const save = (next: unknown, verificationId?: string) =>
    saveAddress(
      new NextRequest(
        `http://localhost/api/collection/${c.id}?key=${c.ownerKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "address",
            address: next,
            verificationId,
          }),
        },
      ),
      { params: Promise.resolve({ id: c.id }) },
    );
  assert.equal(
    (await save(data.address)).status,
    400,
    "client confirmation without a receipt is refused",
  );
  const accepted = await save(data.address, data.verificationId);
  assert.equal(accepted.status, 200);
  const publicResult = await accepted.json();
  assert.equal(publicResult.collection.pendingAddressVerification, undefined);
  assert.equal(publicResult.collection.addressVerification, undefined);
  const acceptedCollection = (await store.getCollection(c.id))!;
  assert.equal(acceptedCollection.addressVerification!.id, data.verificationId);
  assert.equal(acceptedCollection.pendingAddressVerification, undefined);
  assert.equal(
    (
      await save(
        { ...data.address, line1: "999 Different Lane" },
        data.verificationId,
      )
    ).status,
    400,
  );
  acceptedCollection.deliveries = [
    {
      chapterId: "q1",
      status: "failed",
      scheduledFor: c.createdAt,
      dispatch: { attempts: 1, requestBody: "frozen printing bytes" },
    },
  ];
  acceptedCollection.pendingAddressVerification =
    fixtureAddressReceipt(acceptedCollection);
  await store.putCollection(acceptedCollection);
  const rechecked = await save(
    { ...data.address, line1: data.address.line1.toLowerCase() },
    acceptedCollection.pendingAddressVerification.id,
  );
  assert.equal(
    rechecked.status,
    200,
    "same-address revalidation is allowed during a pending dispatch",
  );
  const preserved = (await store.getCollection(c.id))!;
  assert.deepEqual(
    preserved.address,
    acceptedCollection.address,
    "revalidation keeps the approved spelling unchanged",
  );
  assert.equal(
    preserved.deliveries[0].dispatch!.requestBody,
    "frozen printing bytes",
  );
  const cookie = await verifiedRecipientCookie(c.recipient.email);
  assert.equal((await POST(request("", { address }, cookie))).status, 200);
  c.additionalRecipients = [
    {
      id: "digital-only",
      email: "digital@example.test",
      invitedAt: c.createdAt,
    },
  ];
  await store.putCollection(c);
  const secondary = await verifiedRecipientCookie("digital@example.test");
  assert.equal((await POST(request("", { address }, secondary))).status, 403);
});

test("test verification results and unverified legacy addresses cannot release real postcards", async (t) => {
  process.env.LOB_API_KEY = "test_fixture_no_real_check";
  t.after(() => {
    process.env.LOB_API_KEY = "live_fixture_never_sent";
  });
  t.mock.method(globalThis, "fetch", async () => Response.json(response()));
  const c = collection();
  const checked = await verifyPostalAddress(c.id, address);
  assert.equal(checked.result.mode, "test");
  assert.match(checked.result.message, /No real address has been verified/);
  c.status = "approved";
  c.autoPostcards = true;
  c.address = checked.result.address;
  c.addressVerification = checked.receipt;
  c.chapters = ["q1", "q2", "q3", "q4"].map((id) => ({
    id,
    title: "Approved story",
    content: "Story",
    postcardNote: "Encouragement",
    sourceTakeIds: [],
    videoStatus: "not_requested",
    editorialReviewed: true,
    generatedWith: "source_text",
  }));
  c.postcardPublicConsent = {
    version: 2,
    messagesHash: postcardPublicMessagesHash(c),
    approvedAt: c.createdAt,
  };
  const proof = await buildPostcardProof(
    c,
    c.createdAt,
    "https://stories.example.com",
  );
  approvePostcardProof(c, proof, proof.hash);
  assert.throws(
    () => releasePostcardProof(c, proof.hash, c.createdAt, proof.origin),
    /Test address checks/,
  );
  await prepareAutomaticPostcards(c);
  assert.notEqual(c.postcardPreparation?.status, "ready");
  const frozen = {
    chapterId: "q1",
    status: "failed" as const,
    scheduledFor: c.createdAt,
    dispatch: { attempts: 1, requestBody: "immutable prior payload" },
  };
  c.deliveries = [frozen];
  delete c.addressVerification;
  await prepareAutomaticPostcards(c);
  assert.equal(
    c.deliveries[0].dispatch?.requestBody,
    "immutable prior payload",
  );
});
