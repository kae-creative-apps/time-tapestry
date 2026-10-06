import assert from "node:assert/strict";
import { test } from "node:test";
import {
  logPipelineEvent,
  pipelineContext,
  pipelineFailure,
  redactDiagnostic,
  storyTraceId,
  withPipelineStage,
} from "../src/lib/observability/pipeline-logger";

test("story traces are deterministic across workers and do not contain access information", () => {
  assert.equal(
    pipelineContext("story-fixture-123").traceId,
    storyTraceId("story-fixture-123"),
  );
  assert.notEqual(
    storyTraceId("story-fixture-123"),
    storyTraceId("story-fixture-456"),
  );
  assert.notEqual(pipelineContext().traceId, pipelineContext().traceId);
});
test("diagnostic output excludes private messages, request bodies, URLs and credentials", () => {
  const error = new Error(
    "private transcript alice@example.test 100 Main Street Bearer private-secret",
    { cause: new Error("private email body") },
  );
  error.stack =
    "Error: private transcript\n    at fetch (https://private.example.test/audio?key=secret:1:2)\n    at upload (/app/upload.ts:10:2)";
  const lines: string[] = [];
  logPipelineEvent(
    {
      ...pipelineContext("story-fixture-123"),
      stage: "RECORDING_UPLOAD",
      status: "failed",
      error,
    },
    (line) => lines.push(line),
  );
  const line = lines[0];
  assert.ok(line.includes("[RECORDING_UPLOAD]"));
  assert.ok(line.includes("/app/upload.ts:10:2"));
  for (const sensitive of [
    "private transcript",
    "alice@example.test",
    "100 Main Street",
    "private-secret",
    "private.example.test",
    "private email body",
    "key=secret",
  ])
    assert.ok(!line.includes(sensitive), sensitive);
  assert.match(
    redactDiagnostic(
      "Bearer abc123 foo@example.com token=secret 100 Main Street +1 303-555-1234 https://example.test?key=secret",
    ),
    /redacted/,
  );
  assert.ok(
    !redactDiagnostic(
      "Bearer abc123 foo@example.com token=secret 100 Main Street +1 303-555-1234",
    ).includes("abc123"),
  );
});
test("friendly failures never return an SDK exception or stack to the browser", (t) => {
  t.mock.method(console, "error", () => {});
  const result = pipelineFailure(
    "TRANSCRIPTION",
    pipelineContext("story-fixture-123"),
    new Error("Provider credentials private-secret"),
  );
  assert.match(result.error, /original recording is saved/);
  assert.equal(result.traceId, storyTraceId("story-fixture-123"));
  assert.ok(!JSON.stringify(result).includes("private-secret"));
});
test("lifecycle wrapper reports success and failure while preserving original exception identity", async (t) => {
  const lines: string[] = [];
  t.mock.method(console, "info", (line: string) => {
    lines.push(line);
  });
  t.mock.method(console, "error", (line: string) => {
    lines.push(line);
  });
  const context = pipelineContext("story-fixture-123");
  assert.equal(
    await withPipelineStage(
      "EMAIL_NOTIFY",
      context,
      async () => "done",
      "resend",
    ),
    "done",
  );
  const failure = new Error("provider-private-message");
  await assert.rejects(
    withPipelineStage(
      "EMAIL_NOTIFY",
      context,
      async () => {
        throw failure;
      },
      "resend",
    ),
    (error) => error === failure,
  );
  assert.deepEqual(
    lines.map((line) => (JSON.parse(line) as { status: string }).status),
    ["started", "succeeded", "started", "failed"],
  );
  assert.ok(lines.every((line) => line.includes(context.traceId)));
  assert.ok(lines.every((line) => !line.includes("provider-private-message")));
});
