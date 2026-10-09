import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement } from "react";
// tsx uses the repository’s preserved JSX; Next supplies this runtime in the app.
Object.assign(globalThis, { React });
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
// Node has no CSS module loader. Stub class names only; render the real player,
// source archive and issue-report components rather than replacing them.
const require = createRequire(import.meta.url);
require.extensions[".css"] = (module) => {
  module.exports = {
    __esModule: true,
    default: new Proxy({}, { get: (_target, name) => String(name) }),
  };
};
const { StoryReviewPanel } =
  require("../src/components/collection/StoryReviewPanel") as typeof import("../src/components/collection/StoryReviewPanel");
import type { CollectionView } from "../src/lib/collection/types";
import { syntheticFilmCollection } from "./film-fixture";

function view(): CollectionView {
  return {
    ...syntheticFilmCollection(),
    role: "owner",
    capabilities: {
      tts: false,
      transcription: false,
      ai: false,
      mail: false,
      email: false,
      media: true,
      directUpload: false,
      liveInterview: false,
    },
  };
}

test("draft review exposes the written chapter with a source comparison and issue report, without recording or text editing", () => {
  const collection = view();
  const chapter = collection.chapters[0];
  chapter.videoMediaId = "finished-film";
  chapter.film = {
    mediaId: "finished-film",
    narrationKind: "original_recording",
  } as NonNullable<typeof chapter.film>;
  const html = renderToStaticMarkup(
    createElement(StoryReviewPanel, {
      collection,
      chapter,
      accessKey: "fixture-owner",
      active: true,
    }),
  );
  assert.match(html, /Read this written chapter/);
  assert.match(html, /blue notebook/);
  assert.match(html, /Listen to the original recording/);
  assert.match(html, /Something does not match my recording/);
  assert.doesNotMatch(
    html,
    /textarea|contenteditable|Record this answer again|Return to the recorder/,
  );
  assert.ok(html.indexOf("<video") < html.indexOf("Read this written chapter"));
});

test("legacy narrated films and unverified saved videos are not offered as finished story playback", () => {
  for (const kind of ["ai_interviewer", undefined]) {
    const collection = view();
    const chapter = collection.chapters[0];
    chapter.videoMediaId = "legacy-synthetic-voice";
    if (kind)
      chapter.film = {
        mediaId: chapter.videoMediaId,
        narrationKind: kind,
      } as NonNullable<typeof chapter.film>;
    const html = renderToStaticMarkup(
      createElement(StoryReviewPanel, {
        collection,
        chapter,
        accessKey: "fixture-owner",
        active: true,
      }),
    );
    assert.doesNotMatch(
      html,
      /<video|legacy-synthetic-voice|AI voice reads|AI narration/,
    );
    assert.match(html, /The finished chapter film is not ready yet/);
    assert.match(html, /blue notebook/);
  }
});

test("interactive story review uses the private derivative, exposes source transcript and optional export without autoplay", () => {
  const collection = view();
  const chapter = collection.chapters[0];
  chapter.playback = {
    schemaVersion: 1,
    jobId: "fixture-job",
    chapterId: chapter.id,
    mediaId: "playbackmedia_chapter-only",
    sourceTakeIds: chapter.sourceTakeIds,
    sourceSha256: "a".repeat(64),
    planSha256: "b".repeat(64),
    outputSha256: "c".repeat(64),
    durationMs: 3000,
    words: [{ text: "We came home together.", startMs: 0, endMs: 2500 }],
    createdAt: collection.createdAt,
    exportMediaId: "filmexport_fixture",
    exportSha256: "d".repeat(64),
  };
  const html = renderToStaticMarkup(
    createElement(StoryReviewPanel, {
      collection,
      chapter,
      accessKey: "fixture-owner",
      active: true,
    }),
  );
  assert.match(html, /<audio[^>]+playbackmedia_chapter-only/);
  assert.match(html, /Read the spoken words/);
  assert.match(html, /We came home together\./);
  assert.match(html, /Listen to the original recording/);
  assert.match(html, /Download this film \(MP4\)/);
  assert.match(html, /filmexport_fixture/);
  assert.doesNotMatch(html, /autoPlay|autoplay|aria-live="assertive"/);
  assert.ok(html.indexOf("<audio") < html.indexOf("Read this written chapter"));
});
