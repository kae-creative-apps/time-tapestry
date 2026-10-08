import assert from "node:assert/strict";
import { test } from "node:test";
import { POSTCARD_THEMES } from "../src/lib/collection/postcard-design";
import { assertPublicPostcardFits } from "../src/lib/collection/postcard-fit";
import {
  hackathonDemoChapters,
  spokenText,
} from "../src/data/hackathon-demo";

test("hackathon demo chapters follow Gigi's four-part story for Sammie", () => {
  assert.deepEqual(
    hackathonDemoChapters.map((chapter) => [chapter.path, chapter.theme]),
    [
      ["/hackathon-demo-1", "kindness"],
      ["/hackathon-demo-2", "faith"],
      ["/hackathon-demo-3", "generosity"],
      ["/hackathon-demo-4", "encouragement"],
    ],
  );
  assert.deepEqual(
    hackathonDemoChapters.map((chapter) => chapter.postcard.sentOnDay),
    [0, 14, 28, 42],
  );
  for (const chapter of hackathonDemoChapters) {
    const gigi = chapter.conversation
      .filter((line) => line.speaker === "gigi")
      .map((line) => spokenText(line.text))
      .join(" ");
    // The excerpt on the page is what Gigi actually says in the film.
    assert.ok(gigi.includes(chapter.transcript), chapter.title);
    assert.equal(chapter.conversation[0].speaker, "interviewer");
    assert.doesNotMatch(spokenText(gigi), /[[\]]/);
    assertPublicPostcardFits({
      recipientFirstName: "Sammie",
      storytellerFirstName: "Gigi",
      publicMessage: chapter.postcard.message,
      theme: POSTCARD_THEMES[chapter.number - 1],
    });
    const copy = JSON.stringify(chapter);
    assert.doesNotMatch(copy, /—/, "No em dashes in demo copy.");
  }
  assert.equal(hackathonDemoChapters[3].moments.length, 4);
  assert.equal(hackathonDemoChapters[3].next, null);
  assert.deepEqual(
    hackathonDemoChapters.slice(0, 3).map((chapter) => chapter.next?.href),
    ["/hackathon-demo-2", "/hackathon-demo-3", "/hackathon-demo-4"],
  );
});

test("voice cues are removed from captions and page text", () => {
  assert.equal(
    spokenText("Oh... [sighs] well, that one's easy. [pause] Mrs. Hale."),
    "Oh... well, that one's easy. Mrs. Hale.",
  );
  assert.equal(spokenText("He's six-foot-two now, so. [laughs]"), "He's six-foot-two now, so.");
});
