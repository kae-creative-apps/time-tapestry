import assert from "node:assert/strict";
import { test } from "node:test";
import {
  matchesStorySearch,
  storyCatalog,
} from "../src/lib/collection/story-catalog";
import {
  syntheticFilmCollection,
  syntheticOriginalFilmArtifact,
} from "./film-fixture";
import { publicView } from "../src/lib/collection/access";
import {
  chapterDurationFrames,
  chapterIntroSeconds,
  VIDEO_FPS,
} from "../src/lib/video-plan";

test("catalog keeps original order, hides unfinished work and synthesized films, and searches names and full story text", () => {
  const c = syntheticFilmCollection();
  c.status = "approved";
  c.chapters[0].videoMediaId = "original-film";
  c.chapters[0].film = syntheticOriginalFilmArtifact(c, "q1", "original-film");
  c.chapters[1].videoMediaId = "unverified-film";
  const entries = storyCatalog(publicView(c, "owner"), {
    batches: [],
    moments: [
      {
        id: "later",
        batchId: "b",
        promptId: "p",
        category: "faith",
        title: "A prayer",
        question: "What did you pray?",
        status: "published",
        videoMediaId: "f2",
        content: "Grandmère taught me to pause and pray.",
        createdAt: "2026-10-07",
        publishedAt: "2026-10-07",
      },
      {
        id: "earlier",
        batchId: "b",
        promptId: "p",
        category: "character",
        title: "A promise",
        status: "published",
        videoMediaId: "f1",
        question: "When did it matter?",
        content: "Keeping my word.",
        createdAt: "2026-10-06",
        publishedAt: "2026-10-06",
      },
      {
        id: "private",
        batchId: "b",
        promptId: "p",
        category: "health",
        title: "private",
        status: "processing",
        question: "private",
        content: "Do not leak this.",
        createdAt: "2026-10-06",
      },
    ],
  });
  assert.deepEqual(
    entries.map((item) => item.id),
    ["q1", "q2", "q3", "q4", "earlier", "later"],
  );
  assert.equal(entries[0].videoMediaId, "original-film");
  assert.equal(entries[1].videoMediaId, undefined);
  assert.equal(matchesStorySearch(entries[5], "grandmere pray"), true);
  assert.equal(matchesStorySearch(entries[5], "garden"), false);
});

test("new prompt cards have readable opening time while original four-film timing remains stable", () => {
  assert.equal(chapterIntroSeconds({}), 3);
  assert.equal(
    chapterIntroSeconds({ promptQuestion: "What memory makes you smile?" }),
    6,
  );
  assert.equal(
    chapterIntroSeconds({ promptQuestion: Array(35).fill("word").join(" ") }),
    12,
  );
  assert.equal(
    chapterDurationFrames({
      promptQuestion: "What memory makes you smile?",
      clips: [],
    } as never),
    10 * VIDEO_FPS,
  );
  assert.equal(
    chapterIntroSeconds({
      questionCard: {
        question: "Who showed you kindness?",
        label: "Kindness",
        durationMs: 5000,
        music: {
          relativePath: "question-card-music.wav",
          sha256: "ab".repeat(32),
        },
      },
    }),
    5,
  );
});
