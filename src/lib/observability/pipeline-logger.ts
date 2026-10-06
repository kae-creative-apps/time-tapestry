import { createHash, randomUUID } from "node:crypto";

export const PIPELINE_STAGES = [
  "RECORDING_UPLOAD",
  "TRANSCRIPTION",
  "THEME_EXTRACTION",
  "LOB_VERIFICATION",
  "LOB_DISPATCH",
  "EMAIL_NOTIFY",
  "FILM_RENDER",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export type PipelineProvider =
  "elevenlabs" | "openai" | "gloo" | "lob" | "vercel_blob" | "resend";
export type PipelineContext = { traceId: string; storyId?: string };
export type PipelineEvent = PipelineContext & {
  stage: PipelineStage;
  status: "started" | "succeeded" | "failed";
  provider?: PipelineProvider;
  durationMs?: number;
  httpStatus?: number;
  error?: unknown;
};
export type PipelineSink = (line: string) => void;
/** Only application-authored validation copy may be shown verbatim to a client. */
export class PipelineInputError extends Error {}
/** Stable across web requests, queues and worker restarts, without storing access tokens. */
export function storyTraceId(storyId: string): string {
  return `story_${createHash("sha256").update(`time-tapestry/trace/v1:${storyId}`).digest("hex").slice(0, 32)}`;
}
export function pipelineContext(storyId?: string): PipelineContext {
  return storyId
    ? { storyId, traceId: storyTraceId(storyId) }
    : { traceId: randomUUID() };
}

/** Diagnostic text may contain SDK URLs and authentication headers. Never log payloads. */
export function redactDiagnostic(value: string): string {
  return value
    .replace(/https?:\/\/[^\s<>"']+/gi, "[url redacted]")
    .replace(/\b(?:Bearer|Basic)\s+[^\s,;]+/gi, "[authorization redacted]")
    .replace(
      /\b(?:sk|re|pk|live|test)_[a-zA-Z0-9_-]{8,}\b/g,
      "[credential redacted]",
    )
    .replace(
      /\b(?:token|key|secret|password|authorization|cookie|api[_-]?key)\b\s*[=:]\s*[^\s,;]+/gi,
      "[credential redacted]",
    )
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email redacted]")
    .replace(
      /\b\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s+){0,6}(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Boulevard|Blvd|Court|Ct|Way)\b\.?/gi,
      "[address redacted]",
    )
    .replace(
      /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,
      "[phone redacted]",
    );
}

function diagnostic(error: unknown) {
  if (!(error instanceof Error)) return { name: "UnknownError" };
  // Free-form exception messages can contain private transcripts and provider bodies.
  // Retain the exception type and complete stack frames, without the message header.
  const frames = (error.stack ?? "")
    .split("\n")
    .filter((line) => /^\s*at\s/.test(line));
  return {
    name: /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(error.name)
      ? error.name
      : "Error",
    stack: frames.map(redactDiagnostic).join("\n"),
    ...(error.cause instanceof Error
      ? { cause: diagnosticCause(error.cause) }
      : {}),
  };
}
function diagnosticCause(error: Error) {
  return {
    name: /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(error.name)
      ? error.name
      : "Error",
    stack: (error.stack ?? "")
      .split("\n")
      .filter((line) => /^\s*at\s/.test(line))
      .map(redactDiagnostic)
      .join("\n"),
  };
}
export function logPipelineEvent(
  event: PipelineEvent,
  sink?: PipelineSink,
): void {
  const traceId = /^[a-zA-Z0-9_-]{8,100}$/.test(event.traceId)
    ? event.traceId
    : "invalid_trace";
  const payload = {
    timestamp: new Date().toISOString(),
    tag: `[${event.stage}]`,
    traceId,
    ...(event.storyId && /^[a-zA-Z0-9_-]{8,80}$/.test(event.storyId)
      ? { storyId: event.storyId }
      : {}),
    stage: event.stage,
    status: event.status,
    ...(event.provider ? { provider: event.provider } : {}),
    ...(Number.isFinite(event.durationMs)
      ? { durationMs: Math.max(0, event.durationMs!) }
      : {}),
    ...(Number.isInteger(event.httpStatus)
      ? { httpStatus: event.httpStatus }
      : {}),
    ...(event.error === undefined ? {} : { error: diagnostic(event.error) }),
  };
  const line = JSON.stringify(payload);
  if (sink) sink(line);
  else if (event.status === "failed") console.error(line);
  else console.info(line);
}
const FRIENDLY_ERRORS: Record<PipelineStage, string> = {
  RECORDING_UPLOAD:
    "Your recording could not finish uploading. Keep this page open and try again. Your local recording is preserved.",
  TRANSCRIPTION:
    "We could not transcribe this recording. Your original recording is saved. Please try again.",
  THEME_EXTRACTION:
    "Your stories could not finish preparing. Your original answers are saved. Please try again.",
  LOB_VERIFICATION:
    "We could not check this address right now. Please try again before ordering your postcards.",
  LOB_DISPATCH:
    "We could not confirm the postcard delivery request. You do not need to send it again.",
  EMAIL_NOTIFY:
    "The email could not be confirmed yet. Your saved story is still available.",
  FILM_RENDER:
    "Your video could not finish preparing. Your original recording is saved. Please try again.",
};
export function pipelineFailure(
  stage: PipelineStage,
  context: PipelineContext,
  error: unknown,
) {
  logPipelineEvent({ ...context, stage, status: "failed", error });
  return {
    error:
      error instanceof PipelineInputError
        ? error.message
        : FRIENDLY_ERRORS[stage],
    traceId: context.traceId,
  };
}
export async function withPipelineStage<T>(
  stage: PipelineStage,
  context: PipelineContext,
  operation: () => Promise<T>,
  provider?: PipelineProvider,
): Promise<T> {
  const started = Date.now();
  logPipelineEvent({ ...context, stage, status: "started", provider });
  try {
    const value = await operation();
    logPipelineEvent({
      ...context,
      stage,
      status: "succeeded",
      provider,
      durationMs: Date.now() - started,
    });
    return value;
  } catch (error) {
    logPipelineEvent({
      ...context,
      stage,
      status: "failed",
      provider,
      durationMs: Date.now() - started,
      error,
    });
    throw error;
  }
}
