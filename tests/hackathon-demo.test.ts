import assert from "node:assert/strict";
import { test } from "node:test";
import demoStory from "../src/data/demo-story.json";
import { hackathonDemoChapters } from "../src/data/hackathon-demo";

test("hackathon demo pages use the saved Gigi stories without an invented verse", () => {
  assert.deepEqual(
    hackathonDemoChapters.map((chapter) => chapter.path),
    [
      "/hackathon-demo-1",
      "/hackathon-demo-2",
      "/hackathon-demo-3",
      "/hackathon-demo-4",
    ],
  );
  assert.deepEqual(
    hackathonDemoChapters.map((chapter) => chapter.story),
    [
      demoStory.chapters[0].content,
      demoStory.chapters[2].content,
      demoStory.chapters[1].content,
      demoStory.chapters[3].content,
    ],
  );
  for (const chapter of hackathonDemoChapters) {
    assert.equal(chapter.moments.length, 3);
    assert.ok(chapter.story.includes(chapter.transcript));
    assert.ok(chapter.story.includes(chapter.pullQuote));
    for (const moment of chapter.moments)
      assert.ok(chapter.story.includes(moment));
    assert.doesNotMatch(
      `${chapter.story} ${chapter.pullQuote} ${chapter.moments.join(" ")}`,
      /\d+:\d+/,
    );
  }
  assert.equal(
    hackathonDemoChapters[3].momentsTitle,
    "What Gigi hopes Sammie carries",
  );
  assert.equal(hackathonDemoChapters[3].next, null);
  assert.equal(hackathonDemoChapters[0].next?.href, "/hackathon-demo-2");
  assert.equal(hackathonDemoChapters[1].next?.href, "/hackathon-demo-3");
  assert.equal(hackathonDemoChapters[2].next?.href, "/hackathon-demo-4");
});
