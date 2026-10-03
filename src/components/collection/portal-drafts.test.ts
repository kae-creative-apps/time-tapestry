import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emptyStoryBlessing,
  recoverStoryDraft,
  reconcileStoryDraft,
  retainStoryDraft,
  type StoryDraft,
} from "./portal-drafts";

const story = (content: string): StoryDraft => ({
  title: "Kindness received",
  content,
  postcardNote: "A note",
  blessing: { ...emptyStoryBlessing },
});
test("restores a local correction when its saved baseline is still current", () => {
  const base = story("Original words");
  const local = story("Corrected name");
  const result = recoverStoryDraft(
    JSON.stringify({ version: 2, draft: local, base, reviewed: false }),
    base,
    {},
  );
  assert.equal(result.kind, "restore");
  assert.equal(result.draft.content, "Corrected name");
});
test("keeps newer server words visible and retains local words when both changed", () => {
  const local = story("My device correction");
  const server = story("A newer saved story");
  const result = recoverStoryDraft(
    JSON.stringify({ version: 2, draft: local, base: story("Original words") }),
    server,
    {},
  );
  assert.equal(result.kind, "conflict");
  assert.deepEqual(result.draft, server);
  assert.deepEqual(result.recovery, local);
});
test("legacy device drafts require a choice instead of overwriting a newer story", () => {
  assert.equal(
    recoverStoryDraft(
      JSON.stringify({ draft: story("Old draft") }),
      story("New version"),
      {},
    ).kind,
    "conflict",
  );
});
test("a previously saved clean snapshot does not replace newer server text", () => {
  const old = story("Earlier saved text");
  const server = story("Updated on another device");
  const result = recoverStoryDraft(
    JSON.stringify({ version: 2, draft: old, base: old, reviewed: true }),
    server,
    {},
  );
  assert.equal(result.kind, "clean");
  assert.deepEqual(result.draft, server);
  assert.equal(result.reviewed, false);
});
test("a background refresh synchronizes clean editors and isolates conflicting edits", () => {
  const base = story("Original");
  const server = story("Server update");
  assert.equal(reconcileStoryDraft(base, base, server), "synchronize");
  assert.equal(
    reconcileStoryDraft(base, story("Local update"), server),
    "conflict",
  );
  assert.equal(reconcileStoryDraft(base, server, server), "synchronize");
});
test("an unresolved conflict survives reload with both versions intact", () => {
  const server = story("Saved version");
  const local = story("Local version");
  const result = recoverStoryDraft(
    JSON.stringify({
      version: 2,
      draft: server,
      base: server,
      recovery: local,
      history: [],
    }),
    server,
    {},
  );
  assert.equal(result.kind, "conflict");
  assert.deepEqual(result.recovery, local);
});
test("a new rendered film invalidates the restored review checkbox even if media ID is reused", () => {
  const base = story("Approved script");
  const raw = JSON.stringify({
    version: 2,
    draft: base,
    base,
    reviewed: true,
    videoMediaId: "film",
    reviewedFilmSha256: "old-output",
  });
  assert.equal(
    recoverStoryDraft(raw, base, {
      videoMediaId: "film",
      outputSha256: "new-output",
    }).reviewed,
    false,
  );
});
test("choosing a version can retain the other version without duplicating its history", () => {
  const local = story("Keep these words");
  const history = retainStoryDraft(
    [],
    local,
    "Device changes",
    "copy-1",
    "2026-10-03",
  );
  assert.equal(
    retainStoryDraft(history, local, "Device changes", "copy-2", "2026-10-03")
      .length,
    1,
  );
  assert.equal(history[0].draft.content, "Keep these words");
});
