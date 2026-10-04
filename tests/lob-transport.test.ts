import assert from "node:assert/strict";
import test from "node:test";
import { postcardArtwork } from "../src/lib/collection/postcard-artwork";
import {
  lobPostcardTransport,
  serializeLobPostcardRequest,
  type LobPostcardPayload,
} from "../src/lib/collection/lob-transport";
import type { Collection } from "../src/lib/collection/types";

const payload = (front: string, back: string): LobPostcardPayload => ({
  description: "Synthetic print transport fixture",
  to: {
    name: "Anna Example",
    address_line1: "123 Café Lane",
    address_line2: "Apt 2",
    address_city: "Denver",
    address_state: "CO",
    address_zip: "80202",
    address_country: "US",
  },
  from: "adr_synthetic",
  size: "4x6",
  mail_type: "usps_first_class",
  use_type: "operational",
  front,
  back,
});

test("actual self-contained artwork uploads intact as HTML files with stable multipart retry bytes", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Synthetic transport tests cannot contact a provider.");
  });
  const artwork = await postcardArtwork(
    {
      id: "lob-transport-fixture",
      status: "approved",
      storyteller: { name: "Evelyn Example" },
      recipient: { name: "Anna Example" },
      chapters: [{ id: "q1", editorialReviewed: true }],
    } as Collection,
    "q1",
    "https://stories.example.com",
  );
  assert.ok(artwork.front.length > 10000);
  assert.ok(artwork.back.length > 10000);
  const original = payload(artwork.front, artwork.back);
  const frozen = serializeLobPostcardRequest(original);
  const first = lobPostcardTransport(frozen);
  original.to.name = "A later change must not affect the saved request";
  const retry = lobPostcardTransport(frozen);
  assert.equal(retry.contentType, first.contentType);
  assert.deepEqual(retry.body, first.body);
  assert.equal(typeof first.body, "object");
  const form = await new Request("https://fixture.invalid", {
    method: "POST",
    headers: { "Content-Type": first.contentType },
    body: first.body,
  }).formData();
  assert.equal(form.get("to[name]"), "Anna Example");
  assert.equal(form.get("to[address_line1]"), "123 Café Lane");
  assert.equal(form.get("from"), "adr_synthetic");
  assert.equal(form.get("size"), "4x6");
  assert.equal(form.get("mail_type"), "usps_first_class");
  assert.equal(form.get("use_type"), "operational");
  assert.equal(form.has("__timeTapestryLobTransport"), false);
  assert.equal(form.has("payload"), false);
  for (const side of ["front", "back"] as const) {
    const file = form.get(side);
    assert.ok(file instanceof File);
    assert.equal(file.name, `${side}.html`);
    assert.match(file.type, /^text\/html/);
    assert.equal(await file.text(), artwork[side]);
    assert.equal(file.size, Buffer.byteLength(artwork[side]));
  }
});

test("legacy serialized JSON remains verbatim and nested sender addresses use bracket fields", async () => {
  const data = payload("<html>front</html>", "<html>back</html>");
  const legacy = JSON.stringify(data, null, 2);
  assert.deepEqual(lobPostcardTransport(legacy), {
    contentType: "application/json",
    body: legacy,
  });
  data.from = { name: "Studio", address_line1: "1 Example Road" };
  const transport = lobPostcardTransport(serializeLobPostcardRequest(data));
  const form = await new Request("https://fixture.invalid", {
    method: "POST",
    headers: { "Content-Type": transport.contentType },
    body: transport.body,
  }).formData();
  assert.equal(form.get("from[name]"), "Studio");
  assert.equal(form.get("from[address_line1]"), "1 Example Road");
  const unsupported = JSON.parse(serializeLobPostcardRequest(data));
  unsupported.__timeTapestryLobTransport = "future-version";
  assert.throws(
    () => lobPostcardTransport(JSON.stringify(unsupported)),
    /reconciliation/,
  );
});
