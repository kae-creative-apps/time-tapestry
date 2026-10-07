import assert from "node:assert/strict";
import { test } from "node:test";
import demoStory from "../src/data/demo-story.json";
import { hackathonDemoChapters } from "../src/data/hackathon-demo";

test("hackathon demo pages use the saved Gigi stories and the postcard scriptures", () => {
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
    assert.ok(chapter.scripture.text.length > 0);
    assert.equal(chapter.scripture.translation, "KJV");
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
  assert.deepEqual(
    hackathonDemoChapters.map((chapter) => chapter.scripture.reference),
    ["1 Peter 4:10", "Lam 3:22–23", "Gal 6:9", "Matt 25:40"],
  );
  assert.deepEqual(
    hackathonDemoChapters.map((chapter) => chapter.pullQuote),
    [
      "Someone once gave me their afternoons when I needed them most. Time is the best gift you can give.",
      "When I did not know what came next, prayer helped me take the next small step. I hope you find that kind of peace.",
      "The good we give has a way of growing in places we may never see. Keep making room for others.",
      "There is always room for one more at the table. I hope you carry that welcome wherever life takes you.",
    ],
  );
});
