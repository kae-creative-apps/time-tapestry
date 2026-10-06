import test from "node:test";
import assert from "node:assert/strict";
import type { ElevenLabs } from "@elevenlabs/elevenlabs-js";
import { reconcileRecordedInterview } from "../src/lib/collection/interview-reconciliation";
import { interviewAnswers } from "../src/lib/collection/interview";
import { recoverInterviewSourceWords } from "../src/lib/collection/interview-source-recovery";
import { syntheticFilmCollection } from "./film-fixture";

type Conversation = ElevenLabs.GetConversationResponseModel;
type Row = Conversation["transcript"][number];
const startedAt = "2026-01-01T12:00:00.000Z";
function fixture() {
  const c = syntheticFilmCollection();
  c.takes = [];
  c.selectedTakeIds = {};
  c.interviews = [
    {
      id: "fictional-session",
      provider: "elevenlabs",
      status: "completed",
      providerConversationIds: ["fictional-conversation"],
      startedAt,
      endedAt: "2026-01-01T12:10:00.000Z",
      turns: [],
      excludedTurnIds: [],
      segments: [
        {
          id: "fictional-segment",
          mediaId: "fictional-original-video",
          kind: "video",
          startMs: 0,
          durationMs: 600000,
          createdAt: startedAt,
        },
      ],
    },
  ];
  return c;
}
function row(
  role: "agent" | "user",
  message: string | null,
  seconds: number,
  extras = {},
): Row {
  return { role, message, timeInCallSecs: seconds, ...extras } as Row;
}
function conversation(c = fixture(), transcript: Row[] = []): Conversation {
  return {
    conversationId: "fictional-conversation",
    agentId: "fictional-agent",
    userId: c.id,
    status: "done",
    transcript,
    hasAudio: true,
    hasUserAudio: true,
    hasResponseAudio: true,
    hasAuxiliaryAudio: false,
    metadata: {
      startTimeUnixSecs: Date.parse(startedAt) / 1000,
      callDurationSecs: 600,
    },
    conversationInitiationClientData: {
      dynamicVariables: {
        interview_context_json: JSON.stringify({
          sessionId: c.interviews![0].id,
          collectionId: c.id,
          currentThemeId: "q1",
        }),
      },
    },
  } as Conversation;
}
function read(c: ReturnType<typeof fixture>, transcript: Row[]) {
  return reconcileRecordedInterview(c, {
    agentId: "fictional-agent",
    getConversation: async () => conversation(c, transcript),
  });
}
const questions = [
  "Thinking about the people who shaped your life, is there a specific moment of kindness you received that you still remember clearly?",
  "What is a decision you made while following Jesus that later changed your life for the better?",
  "When you think about helping others over the years, is there a person or a story that comes to mind?",
  "As we move to our final theme, what is one thing you most want Sam to know or remember from your life as she walks her own path?",
];

test("recovers four real answer areas from planned questions when the provider omitted theme tools", async () => {
  const c = fixture();
  const answers = [
    "My neighbor brought us food.",
    "I chose to forgive a friend.",
    "We visited a lonely neighbor.",
    "Make time to listen.",
  ];
  const transcript = questions.flatMap((q, i) => [
    row("agent", q, i * 60),
    row("user", answers[i], i * 60 + 20),
  ]);
  transcript.push(
    row(
      "agent",
      "Is there anything else you would like to say before we finish?",
      250,
    ),
    row("user", "I love you very much.", 260),
  );
  const recovered = await read(c, transcript);
  assert.equal(c.interviews![0].turns.length, 0);
  for (const [index, id] of ["q1", "q2", "q3", "q4"].entries()) {
    const answer = interviewAnswers(recovered, id)[0];
    assert.equal(answer.text, answers[index]);
    assert.equal(answer.kind, "video");
    assert.equal(answer.mediaId, "fictional-original-video");
    assert.equal(answer.liveSource?.timing, "unaligned");
    assert.equal(answer.liveSource?.sourceRanges[0].inMs, undefined);
  }
  assert.equal(interviewAnswers(recovered, "q4").length, 2);
  assert.deepEqual(
    recovered.interviews![0].segments,
    c.interviews![0].segments,
  );
});

test("waits for a successful tool result on its later row before changing areas", async () => {
  const c = fixture();
  const call = {
    toolName: "set_interview_theme",
    toolHasBeenCalled: true,
    requestId: "request-one",
    paramsAsJson: '{"themeId":"q3"}',
  };
  const transcript = [
    row("agent", null, 10, { toolCalls: [call] }),
    row("user", "This is still the first area.", 11),
    row("agent", null, 12, {
      toolResults: [
        { requestId: "request-one", toolHasBeenCalled: true, isError: false },
      ],
    }),
    row("agent", "Tell me about that person.", 13),
    row("user", "We brought her a meal.", 20),
  ];
  const result = await read(c, transcript);
  assert.equal(
    interviewAnswers(result, "q1")[0].text,
    "This is still the first area.",
  );
  assert.equal(
    interviewAnswers(result, "q3")[0].text,
    "We brought her a meal.",
  );
  const failed = await read(c, [
    transcript[0],
    row("agent", null, 12, {
      toolResults: [
        { requestId: "request-one", toolHasBeenCalled: true, isError: true },
      ],
    }),
    transcript[4],
  ]);
  assert.equal(interviewAnswers(failed, "q3").length, 0);
});

test("denied theme changes cannot be bypassed by a later question or raw-source recovery", async () => {
  for (const resultValue of [
    JSON.stringify({
      accepted: false,
      chapterId: "q1",
      reason: "No spoken answer received",
    }),
    "No spoken answer has been received for the current theme. Stay here.",
    "Stay with this story only. Do not ask about other themes.",
  ]) {
    const c = fixture();
    const call = {
      toolName: "set_interview_theme",
      toolHasBeenCalled: true,
      requestId: "denied-transition",
      paramsAsJson: '{"themeId":"q3"}',
    };
    const result = await read(c, [
      row("agent", null, 1, { toolCalls: [call] }),
      row("agent", questions[2], 2, {
        toolResults: [
          {
            requestId: call.requestId,
            toolHasBeenCalled: true,
            isError: false,
            resultValue,
          },
        ],
      }),
      row("agent", questions[2], 3),
      row("user", "...", 4),
    ]);
    const session = result.interviews![0];
    session.turns = recoverInterviewSourceWords(session, [
      {
        segment: session.segments[0],
        durationMs: 600_000,
        words: [
          {
            mediaId: session.segments[0].mediaId,
            text: "Grandmother.",
            startMs: 10_000,
            endMs: 11_000,
          },
        ],
      },
    ]);
    assert.equal(interviewAnswers(result, "q3").length, 0);
    assert.equal(interviewAnswers(result, "q1")[0].text, "Grandmother.");
  }
  const c = fixture();
  const call = {
    toolName: "set_interview_theme",
    toolHasBeenCalled: true,
    requestId: "accepted-transition",
    paramsAsJson: '{"themeId":"q3"}',
  };
  const accepted = await read(c, [
    row("agent", null, 1, { toolCalls: [call] }),
    row("agent", questions[2], 2, {
      toolResults: [
        {
          requestId: call.requestId,
          toolHasBeenCalled: true,
          isError: false,
          resultValue: JSON.stringify({ accepted: true, chapterId: "q3" }),
        },
      ],
    }),
    row("user", "My sister.", 10),
  ]);
  assert.equal(interviewAnswers(accepted, "q3")[0].text, "My sister.");
});

test("preserves raw local words, recording boundaries, exclusions, and stable recovery IDs", async () => {
  const c = fixture();
  c.interviews![0].turns = [
    {
      id: "local-answer",
      sequence: 2,
      role: "user",
      chapterId: "q1",
      text: "  I chose to forgive a friend.  ",
      capturedAt: startedAt,
      timing: "estimated",
      startMs: 1000,
      endMs: 4000,
    },
  ];
  c.interviews![0].excludedTurnIds = ["local-answer"];
  const transcript = [
    row("agent", questions[1], 5),
    row("user", "I chose to forgive a friend.", 10),
  ];
  const once = await read(c, transcript);
  const twice = await read(once, transcript);
  const saved = once.interviews![0].turns.find((t) => t.id === "local-answer")!;
  assert.equal(saved.chapterId, "q2");
  assert.equal(saved.text, c.interviews![0].turns[0].text);
  assert.equal(saved.capturedAt, startedAt);
  assert.equal(saved.startMs, 1000);
  assert.equal(saved.endMs, 4000);
  assert.equal(saved.timing, "estimated");
  assert.equal(interviewAnswers(once, "q2").length, 0);
  assert.deepEqual(twice, once);
});

test("does not classify a person's biographical keywords or app controls as a new story area", async () => {
  const c = fixture();
  const result = await read(c, [
    row("agent", "What happened next?", 0),
    row("user", "Faith and helping others mattered to me.", 10),
    row("user", "[Interview control: move to next story area]", 12, {
      sourceMedium: "text",
    }),
    row("user", "...", 14),
    row("user", "[Interview control: We reached part 4.]", 16),
    row("user", "[Interview control: The user is finished.]", 18, {
      sourceMedium: "audio",
    }),
  ]);
  assert.equal(result.interviews![0].turns.length, 2);
  assert.equal(interviewAnswers(result, "q1").length, 1);
  assert.equal(interviewAnswers(result, "q3").length, 0);
});

test("provider questions cannot move a scoped retake into other parts", async () => {
  const c = fixture();
  c.interviews![0].replacesChapterId = "q2";
  const result = await read(c, [
    row("agent", questions[3], 0),
    row("user", "My sister.", 10),
  ]);
  assert.equal(interviewAnswers(result, "q2")[0].text, "My sister.");
  assert.equal(interviewAnswers(result, "q4").length, 0);
});

test("rejects a foreign conversation, agent, session, collection, and out-of-session start", async () => {
  const c = fixture();
  const changes: Array<(v: Conversation) => void> = [
    (v) => {
      v.conversationId = "foreign-conversation";
    },
    (v) => {
      v.agentId = "foreign-agent";
    },
    (v) => {
      v.userId = "foreign-collection";
    },
    (v) => {
      v.conversationInitiationClientData!.dynamicVariables!.interview_context_json =
        JSON.stringify({ sessionId: "foreign-session" });
    },
    (v) => {
      v.metadata.startTimeUnixSecs += 3600;
    },
  ];
  for (const change of changes) {
    const v = conversation(c);
    change(v);
    await assert.rejects(
      reconcileRecordedInterview(c, {
        agentId: "fictional-agent",
        getConversation: async () => v,
      }),
      /belong/,
    );
  }
  const ongoing = conversation(c);
  ongoing.status = "in-progress";
  await assert.rejects(
    reconcileRecordedInterview(c, {
      agentId: "fictional-agent",
      getConversation: async () => ongoing,
    }),
    /still finishing/,
  );
});
