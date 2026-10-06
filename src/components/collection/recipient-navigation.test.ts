import assert from "node:assert/strict";
import test from "node:test";
import {
  recipientChapter,
  rememberRecipientChapter,
  restoreRecipientChapter,
} from "./recipient-navigation";

function browser(pathname: string, search = "") {
  const location = { pathname, search, hash: "" };
  const entries = [pathname + search];
  let index = 0;
  const state = { router: "preserved" };
  const read = () => {
    location.hash = new URL(entries[index], "https://example.invalid").hash;
  };
  const history = {
    state,
    pushState(actual: unknown, _title: string, url?: string | URL | null) {
      assert.equal(actual, state);
      entries.splice(++index, entries.length, String(url));
      read();
    },
    replaceState(actual: unknown, _title: string, url?: string | URL | null) {
      assert.equal(actual, state);
      entries[index] = String(url);
      read();
    },
  };
  return {
    location,
    history,
    entries,
    back: () => {
      index--;
      read();
    },
    forward: () => {
      index++;
      read();
    },
  };
}

test("recipient story selection survives reload, Back and Forward without changing the QR route or private preview query", () => {
  for (const [path, search] of [
    ["/collection/fictional/chapter/q2", ""],
    ["/collection/fictional/preview", "?key=existing-owner-grant"],
  ]) {
    const b = browser(path, search);
    assert.equal(recipientChapter(b.location.hash, "q2"), "q2");
    rememberRecipientChapter(b.location, b.history, "q3");
    rememberRecipientChapter(b.location, b.history, "q4");
    rememberRecipientChapter(b.location, b.history, "q4");
    assert.equal(b.entries.length, 3);
    assert.equal(
      recipientChapter(b.location.hash, "q2"),
      "q4",
      "reload restores the selected chapter",
    );
    b.back();
    assert.equal(
      restoreRecipientChapter(b.location, b.history, "q2", "q4", false),
      "q3",
    );
    b.back();
    assert.equal(
      restoreRecipientChapter(b.location, b.history, "q2", "q3", false),
      "q2",
    );
    b.forward();
    assert.equal(
      restoreRecipientChapter(b.location, b.history, "q2", "q2", false),
      "q3",
    );
    assert.ok(b.entries.every((entry) => entry.startsWith(path + search)));
  }
});

test("recording guards reject story clicks and restore the active story when browser history moves", () => {
  const b = browser("/collection/fictional");
  rememberRecipientChapter(b.location, b.history, "q2");
  assert.equal(
    rememberRecipientChapter(b.location, b.history, "q3", true),
    false,
  );
  assert.equal(b.entries.length, 2);
  b.back();
  assert.equal(
    restoreRecipientChapter(b.location, b.history, undefined, "q2", true),
    null,
  );
  assert.equal(b.location.hash, "#story/q2");
  assert.equal(
    b.entries.length,
    2,
    "blocked Back does not add history entries",
  );
});

test("skip links and unrelated or malformed fragments never reset the selected story", () => {
  const b = browser("/collection/fictional");
  for (const hash of [
    "#story-content",
    "#main-content",
    "#story/q5",
    "#review/chapter/q1",
    "#story/%3Cscript%3E",
  ]) {
    b.location.hash = hash;
    assert.equal(
      restoreRecipientChapter(b.location, b.history, "q2", "q3", false),
      null,
    );
    assert.equal(
      restoreRecipientChapter(b.location, b.history, "q2", "q3", true),
      null,
    );
    assert.equal(b.location.hash, hash);
  }
  assert.equal(recipientChapter(""), "q1");
  assert.equal(rememberRecipientChapter(b.location, b.history, "q5"), false);
});
