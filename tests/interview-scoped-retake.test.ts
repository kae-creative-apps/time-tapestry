import assert from "node:assert/strict";
import test from "node:test";
import { syntheticFilmCollection } from "./film-fixture";
import {
  applyInterviewAction,
  commitInterviewReplacement,
} from "../src/lib/collection/interview";
import { interviewRecordingReview } from "../src/lib/collection/interview-recording-review";
import { recoverInterviewSourceWords } from "../src/lib/collection/interview-source-recovery";
import type {
  CollectionView,
  InterviewChapterId,
  InterviewTurn,
  StoredMedia,
} from "../src/lib/collection/types";

function fixture() {
  const c = syntheticFilmCollection();
  c.interviews = [
    {
      id: "old-session",
      provider: "elevenlabs",
      status: "completed",
      startedAt: c.createdAt,
      excludedTurnIds: [],
      segments: [
        {
          id: "old-segment",
          mediaId: "old-original",
          kind: "voice",
          startMs: 0,
          durationMs: 60_000,
          createdAt: c.createdAt,
        },
      ],
      turns: ["q1", "q2", "q3", "q4"].map((chapterId, sequence) => ({
        id: `old-turn-${chapterId}`,
        role: "user",
        chapterId: chapterId as InterviewChapterId,
        sequence,
        text: `An earlier memory for ${chapterId}.`,
        capturedAt: c.createdAt,
        timing: "unaligned",
      })),
    },
  ];
  c.selectedTakeIds["q2-f1"] = "old-followup";
  const media: StoredMedia = {
    id: "new-original",
    collectionId: c.id,
    role: "owner",
    mimeType: "audio/webm",
    originalName: "recording.webm",
    bytes: 100,
    provenance: "uploaded_recording",
    url: "https://recording.example.test/original",
    createdAt: c.createdAt,
  };
  return {
    c,
    media,
    findMedia: async (id: string) => (id === media.id ? media : null),
  };
}
function answer(
  capturedAt: string,
  text = "My sister.",
  chapterId: InterviewChapterId = "q2",
  sequence = 0,
): InterviewTurn {
  return {
    id: `new-turn-${sequence}`,
    role: "user",
    sequence,
    chapterId,
    text,
    capturedAt,
    timing: "unaligned",
  };
}

test("scoped interview start persists its target and rejects mismatched retries or other chapter answers", async () => {
  const { c, findMedia } = fixture();
  const start = {
    action: "start",
    sessionId: "new-session",
    replaceChapterId: "q2",
  };
  await applyInterviewAction(c, start, findMedia);
  await applyInterviewAction(c, start, findMedia);
  assert.equal(c.interviews?.length, 2);
  assert.equal(c.interviews?.[1].replacesChapterId, "q2");
  await assert.rejects(
    applyInterviewAction(c, { ...start, replaceChapterId: "q5" }, findMedia),
    /story theme/,
  );
  await assert.rejects(
    applyInterviewAction(c, { ...start, replaceChapterId: "q1" }, findMedia),
    /different story part/,
  );
  await assert.rejects(
    applyInterviewAction(
      c,
      { ...start, replaceChapterId: undefined },
      findMedia,
    ),
    /different story part/,
  );
  await assert.rejects(
    applyInterviewAction(
      c,
      {
        action: "append_turns",
        sessionId: "new-session",
        turns: [answer(c.createdAt, "A real answer", "q1")],
      },
      findMedia,
    ),
    /only its selected/,
  );
  assert.equal(c.interviews?.[1].turns.length, 0);
});

test("verified original with placeholder transcript remains pending, then a real completed answer replaces only its part once", async () => {
  const { c, media, findMedia } = fixture();
  const selected = { ...c.selectedTakeIds };
  const originals = structuredClone(c.interviews![0]);
  await applyInterviewAction(
    c,
    { action: "start", sessionId: "new-session", replaceChapterId: "q2" },
    findMedia,
  );
  await applyInterviewAction(
    c,
    {
      action: "append_turns",
      sessionId: "new-session",
      turns: [answer(c.createdAt, "...")],
    },
    findMedia,
  );
  await applyInterviewAction(
    c,
    {
      action: "attach_segment",
      sessionId: "new-session",
      segment: {
        id: "new-segment",
        mediaId: media.id,
        kind: "voice",
        startMs: 0,
        durationMs: 30_000,
      },
    },
    findMedia,
  );
  await applyInterviewAction(
    c,
    { action: "set_status", sessionId: "new-session", status: "completed" },
    findMedia,
  );
  assert.equal(c.interviews![1].replacementCommittedAt, undefined);
  assert.deepEqual(c.interviews![0], originals);
  assert.deepEqual(c.selectedTakeIds, selected);
  const projection = interviewRecordingReview({
    ...c,
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
  } satisfies CollectionView)[1];
  assert.equal(projection.replacementPending, true);
  assert.equal(projection.recordings[0].mediaId, media.id);
  assert.equal(
    projection.transcript,
    "",
    "old words must not be shown as a transcript of the new original",
  );
  const now = "2026-10-06T12:00:00.000Z";
  await applyInterviewAction(
    c,
    {
      action: "append_turns",
      sessionId: "new-session",
      turns: [answer(c.createdAt, "My sister.", "q2", 1)],
    },
    findMedia,
    now,
  );
  assert.equal(c.interviews![1].replacementCommittedAt, now);
  assert.deepEqual(c.interviews![0].excludedTurnIds, ["old-turn-q2"]);
  assert.deepEqual(c.interviews![0].turns, originals.turns);
  assert.deepEqual(c.interviews![0].segments, originals.segments);
  assert.equal(c.selectedTakeIds.q2, undefined);
  assert.equal(c.selectedTakeIds["q2-f1"], undefined);
  for (const id of ["q1", "q3", "q4"])
    assert.equal(c.selectedTakeIds[id], selected[id]);
  assert.equal(c.draftOutdated, true);
  assert.equal(
    c.chapters.some((chapter) => chapter.editorialReviewed),
    false,
  );
  assert.equal(
    await commitInterviewReplacement(c, c.interviews![1], findMedia),
    false,
  );
  assert.equal(c.interviews![1].replacementCommittedAt, now);
});

test("source recovery commits a scoped spoken answer but never commits silence, exclusions, or an unverified original", async () => {
  const { c, media, findMedia } = fixture();
  await applyInterviewAction(
    c,
    { action: "start", sessionId: "new-session", replaceChapterId: "q2" },
    findMedia,
  );
  const session = c.interviews![1];
  session.status = "completed";
  session.segments = [
    {
      id: "new-segment",
      mediaId: media.id,
      kind: "voice",
      startMs: 0,
      durationMs: 30_000,
      createdAt: c.createdAt,
    },
  ];
  session.turns = [
    answer(c.createdAt, "[Interview control: We reached part 4.]"),
  ];
  assert.equal(await commitInterviewReplacement(c, session, findMedia), false);
  session.turns = recoverInterviewSourceWords(session, [
    {
      segment: session.segments[0],
      durationMs: 30_000,
      words: [
        { mediaId: media.id, text: "My", startMs: 1000, endMs: 1200 },
        { mediaId: media.id, text: "sister.", startMs: 1200, endMs: 1500 },
      ],
    },
  ]);
  assert.equal(session.turns.at(-1)?.chapterId, "q2");
  assert.equal(
    await commitInterviewReplacement(c, session, async () => null),
    false,
  );
  session.excludedTurnIds.push(session.turns.at(-1)!.id);
  assert.equal(await commitInterviewReplacement(c, session, findMedia), false);
  session.excludedTurnIds = [];
  assert.equal(await commitInterviewReplacement(c, session, findMedia), true);
  assert.deepEqual(c.interviews![0].excludedTurnIds, ["old-turn-q2"]);
});
