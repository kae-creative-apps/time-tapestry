import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createReplyPlaybackCheck,
  replyAcknowledgement,
} from "./reply-submission";

test("a lost reply acknowledgement can retry without reloading an already checked recording", async () => {
  let checks = 0;
  const check = createReplyPlaybackCheck(async () => {
    if (++checks > 1)
      throw new Error("Media storage is temporarily unavailable");
  });
  await check("/api/private-media/first");
  // The first save may already have succeeded. The server uses its reply ID to confirm it.
  await assert.doesNotReject(check("/api/private-media/first"));
  assert.equal(checks, 1);
  await assert.rejects(check("/api/private-media/replacement"), /unavailable/);
  await assert.rejects(check("/api/private-media/replacement"), /unavailable/);
  assert.equal(
    checks,
    3,
    "a failed or replacement recording must still be checked",
  );
});

test("only the exact saved reply acknowledgement allows a draft to clear", () => {
  const draft = {
    replyId: "reply-one",
    chapterId: "q1",
    text: "Thank you",
    mediaId: "recording-one",
  };
  const saved = {
    id: draft.replyId,
    chapterId: draft.chapterId,
    text: draft.text,
    mediaId: draft.mediaId,
    createdAt: "2030-01-01T00:00:00.000Z",
  };
  assert.equal(replyAcknowledgement([], draft), "unconfirmed");
  assert.equal(
    replyAcknowledgement([{ ...saved, id: "other-reply" }], draft),
    "unconfirmed",
  );
  assert.equal(
    replyAcknowledgement([saved], { ...draft, text: " Thank you " }),
    "saved",
  );
  for (const replacement of [
    { ...saved, chapterId: "q2" },
    { ...saved, text: "An earlier message" },
    { ...saved, mediaId: "earlier-recording" },
  ])
    assert.equal(replyAcknowledgement([replacement], draft), "changed");
});
