import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement } from "react";
// tsx uses the repository’s preserved JSX; Next supplies this runtime in the app.
Object.assign(globalThis, { React });
import { renderToStaticMarkup } from "react-dom/server";
import { StoryReviewPanel } from "../src/components/collection/StoryReviewPanel";
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
    assert.match(html, /A version using your original recording is needed/);
    assert.match(html, /blue notebook/);
  }
});
