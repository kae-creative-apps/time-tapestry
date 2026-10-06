import assert from "node:assert/strict";
import test from "node:test";
import { prepareCollection } from "../src/lib/collection/create";
import {
  collectionPostcardCadence,
  postcardCadenceLabel,
  postcardScheduledDate,
} from "../src/lib/collection/postcard-cadence";

test("new collection cadence is server-owned and older collections keep calendar quarters", () => {
  const c = prepareCollection({
    initiationPath: "share",
    storyteller: { name: "A", email: "a@example.test" },
    recipient: { name: "B", email: "b@example.test" },
    postcardCadence: "quarterly",
  });
  assert.equal(c.postcardCadence, "biweekly");
  assert.equal(collectionPostcardCadence(c), "biweekly");
  assert.equal(postcardCadenceLabel(c), "every two weeks");
  const first = "2028-01-31T12:00:00.000Z";
  assert.equal(postcardScheduledDate(c, first, 3), "2028-03-13T12:00:00.000Z");
  assert.equal(collectionPostcardCadence({}), "quarterly");
  assert.equal(postcardCadenceLabel({}), "every three months");
  assert.equal(postcardScheduledDate({}, first, 1), "2028-04-30T12:00:00.000Z");
  assert.equal(postcardScheduledDate({}, first, 3), "2028-10-31T12:00:00.000Z");
});
