import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LiveTranscriptReview } from "../src/components/collection/LiveTranscriptReview";
import type { InterviewTurn } from "../src/lib/collection/types";

const turn: InterviewTurn = {
  id: "recorded-answer",
  role: "user",
  chapterId: "q2",
  sequence: 1,
  text: "Um, I chose to stay and help Anna.",
  capturedAt: "2026-10-05T12:00:00.000Z",
  timing: "unaligned",
};

test("recorded review keeps the original words read-only and offers a recorded retake", () => {
  const html = renderToStaticMarkup(
    createElement(LiveTranscriptReview, {
      turn,
      included: true,
      busy: false,
      onRerecord: () => {},
    }),
  );
  assert.match(html, /Um, I chose to stay and help Anna\./);
  assert.match(html, /Read transcript for part 2/);
  assert.match(html, /Record this part again/);
  assert.doesNotMatch(
    html,
    /textarea|contenteditable|<input|Save correction|Correct names/,
  );
  assert.equal(turn.text, "Um, I chose to stay and help Anna.");
});

test("historically excluded answers stay readable without offering text or inclusion edits", () => {
  const html = renderToStaticMarkup(
    createElement(LiveTranscriptReview, {
      turn,
      included: false,
      busy: true,
      onRerecord: () => {},
    }),
  );
  assert.match(html, /earlier answer is not selected/);
  assert.match(html, /disabled/);
  assert.doesNotMatch(
    html,
    /Include in my story|Leave this out|textarea|<input/,
  );
});
