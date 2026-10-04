import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COLLECTION_RETURN_TTL_MS,
  clearCollectionReturn,
  privateCollectionPath,
  readCollectionReturn,
  rememberCollectionReturn,
} from "../src/lib/accounts/client-navigation";

const origin = "https://stories.example.test";
const path = "/collection/collection-test-123?key=synthetic-private-key";
function tabStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

test("private links accept only local collection/interview capabilities and discard unrelated navigation", () => {
  assert.equal(privateCollectionPath(path, origin), path);
  assert.equal(privateCollectionPath(`${origin}${path}`, origin), path);
  assert.equal(
    privateCollectionPath(
      "/collection/collection-test-123/review?key=synthetic-private-key",
      origin,
    ),
    path,
  );
  assert.equal(
    privateCollectionPath(
      `${origin}/collection/collection-test-123/review/?key=synthetic-private-key`,
      origin,
    ),
    path,
  );
  assert.equal(privateCollectionPath(`  ${path}  `, origin), path);
  assert.equal(
    privateCollectionPath(`${path}&redirect=https://outside.test#next`, origin),
    path,
  );
  assert.equal(
    privateCollectionPath("/record/interview-123/?key=synthetic-key", origin),
    "/record/interview-123?key=synthetic-key",
  );
  assert.equal(
    privateCollectionPath(
      "http://localhost:3211/record/interview-123?key=key",
      "http://localhost:3211",
    ),
    "/record/interview-123?key=key",
  );
});

test("private links reject external, script, ambiguous and malformed navigation targets", () => {
  for (const input of [
    "https://outside.test" + path,
    "//outside.test" + path,
    "javascript:alert(1)",
    "data:text/html,test",
    "file:///collection/collection-test-123?key=key",
    "https://user:password@stories.example.test" + path,
    "https://stories.example.test.evil.test" + path,
    "http://stories.example.test" + path,
    "https://stories.example.test:444" + path,
    "/api/collection/collection-test-123?key=key",
    "/record/interview-test-123/review?key=key",
    "/record/interview-test-123/address?key=key",
    "/collection/collection-test-123/address/chapter/q1",
    "/collection/collection-test-123/address/../review",
    "/collection/collection-test-123/arbitrary-view",
    "/collection/short?key=key",
    "/record/interview-test-123",
    "/collection/collection-test-123/review",
    "/collection/collection-test-123/chapter/q5",
    "/collection/collection-test-123/chapter/q1/extra",
    "/collection/collection-test-123/chapter/q1%2f..",
    "/collection/collection-test-123/chapter/q1/../q2",
    path + "&key=other-key",
    "/collection/collection-test-123?key=",
    "/collection/collection-test-123?key=%20",
    "/collection/collection-test-123?key=bad%00key",
    "/collection/collection-test-123?key=bad%2Fkey",
    "/unused/../collection/collection-test-123?key=key",
    "/%2e%2e/collection/collection-test-123?key=key",
    "/collection/collection%2ftest?key=key",
    "https://stories.example.test\\@outside.test" + path,
    "/record/interview-123?key=key\nextra",
    "collection/collection-test-123?key=key",
    {},
    null,
    "x".repeat(4097),
  ])
    assert.equal(privateCollectionPath(input, origin), null, String(input));
});

test("recipient collection and chapter locators stay keyless and preserve a verified portal's tab return", () => {
  const storage = tabStorage();
  const now = 1000;
  for (const locator of [
    "/collection/collection-test-123",
    "/collection/collection-test-123/chapter/q1",
    "/collection/collection-test-123/chapter/q4",
    "/collection/collection-test-123/address",
  ]) {
    assert.equal(privateCollectionPath(locator, origin), locator);
    assert.equal(
      privateCollectionPath(`${origin}${locator}/`, origin),
      locator,
    );
    assert.equal(
      privateCollectionPath(
        `${locator}?next=https://outside.test#private`,
        origin,
      ),
      locator,
    );
    rememberCollectionReturn(storage, locator, origin, now);
    const saved = readCollectionReturn(storage, origin, now + 1);
    assert.deepEqual(saved, {
      path: locator,
      expiresAt: now + COLLECTION_RETURN_TTL_MS,
    });
    assert.equal(saved!.path.includes("key="), false);
    clearCollectionReturn(storage);
    assert.equal(readCollectionReturn(storage, origin, now + 1), null);
  }
  assert.equal(
    privateCollectionPath(
      "/collection/collection-test-123/address?key=synthetic-private-key",
      origin,
    ),
    "/collection/collection-test-123/address?key=synthetic-private-key",
    "Private address links preserve their route and capability",
  );
  assert.equal(
    privateCollectionPath(
      "/collection/collection-test-123/chapter/q2?key=synthetic-private-key",
      origin,
    ),
    "/collection/collection-test-123/chapter/q2?key=synthetic-private-key",
    "Existing complete private links retain their key and chapter; the destination enforces access",
  );
  assert.equal(
    privateCollectionPath(
      "https://outside.test/collection/collection-test-123/chapter/q1",
      origin,
    ),
    null,
  );
});

test("return links stay in the supplied tab store, expire and clear on sign out", () => {
  const firstTab = tabStorage(),
    otherTab = tabStorage(),
    now = 1000;
  rememberCollectionReturn(firstTab, path, origin, now);
  assert.deepEqual(readCollectionReturn(firstTab, origin, now + 1), {
    path,
    expiresAt: now + COLLECTION_RETURN_TTL_MS,
  });
  assert.equal(readCollectionReturn(otherTab, origin, now + 1), null);
  assert.equal(
    readCollectionReturn(firstTab, origin, now + COLLECTION_RETURN_TTL_MS),
    null,
  );
  assert.equal(firstTab.values.size, 0);
  rememberCollectionReturn(firstTab, path, origin, now);
  clearCollectionReturn(firstTab);
  assert.equal(readCollectionReturn(firstTab, origin, now + 1), null);
});

test("invalid, tampered, corrupt and inaccessible return storage never produces a navigation target", () => {
  const storage = tabStorage(),
    now = 1000;
  rememberCollectionReturn(storage, "https://outside.test" + path, origin, now);
  assert.equal(storage.values.size, 0);
  for (const value of [
    "not-json",
    JSON.stringify({
      path: "https://outside.test" + path,
      expiresAt: now + 1000,
    }),
    JSON.stringify({ path, expiresAt: now + COLLECTION_RETURN_TTL_MS + 1 }),
    JSON.stringify({ path, expiresAt: "tomorrow" }),
  ]) {
    rememberCollectionReturn(storage, path, origin, now);
    const key = [...storage.values.keys()][0];
    storage.setItem(key, value);
    assert.equal(readCollectionReturn(storage, origin, now), null);
    assert.equal(storage.values.size, 0);
  }
  const blocked = {
    getItem: () => {
      throw new Error("Storage unavailable");
    },
    setItem: () => {
      throw new Error("Storage unavailable");
    },
    removeItem: () => {
      throw new Error("Storage unavailable");
    },
  };
  assert.doesNotThrow(() =>
    rememberCollectionReturn(blocked, path, origin, now),
  );
  assert.doesNotThrow(() => clearCollectionReturn(blocked));
  assert.equal(readCollectionReturn(blocked, origin, now), null);
});
