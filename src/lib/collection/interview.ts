import { isMeaningfulInterviewSpeech } from "./interview-speech";
import type {
  AnswerTake,
  Collection,
  InterviewChapterId,
  InterviewSegment,
  InterviewSession,
  InterviewStatus,
  InterviewTurn,
  StoredMedia,
} from "./types";
import {
  isStoredOwnerRecording,
  hasRecordedAnswerSource,
} from "./recording-validation";

export class InterviewInputError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const fail = (message: string, status = 400): never => {
  throw new InterviewInputError(message, status);
};
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail("Invalid interview update.");
  return value as Record<string, unknown>;
};
const identifier = (value: unknown): string => {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(value))
    return fail("Invalid interview identifier.");
  return value;
};
const time = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    return fail(`Invalid ${label}.`);
  return new Date(value).toISOString();
};
const MAX_TIMELINE_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_SEGMENT_DURATION_MS = 2 * 60 * 60 * 1000;
// The timeline includes pauses between visits, not just active recording time.
const milliseconds = (
  value: unknown,
  label: string,
  maximum = MAX_TIMELINE_MS,
): number => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > maximum
  )
    return fail(`Invalid ${label}.`);
  return value;
};
const chapter = (value: unknown): InterviewChapterId => {
  if (typeof value !== "string" || !/^q[1-4]$/.test(value))
    return fail("Choose a story theme for this answer.");
  return value as InterviewChapterId;
};
function turnFrom(input: unknown): InterviewTurn {
  const value = object(input);
  if (value.role !== "user" && value.role !== "agent")
    return fail("Invalid interview speaker.");
  if (
    !Number.isInteger(value.sequence) ||
    Number(value.sequence) < 0 ||
    Number(value.sequence) > 10000
  )
    return fail("Invalid interview turn sequence.");
  if (
    typeof value.text !== "string" ||
    !value.text.trim() ||
    value.text.length > 30_000
  )
    return fail(
      "Each answer must contain between 1 and 30,000 characters. Your local words are unchanged.",
    );
  const startMs =
    value.startMs === undefined
      ? undefined
      : milliseconds(value.startMs, "answer start time");
  const endMs =
    value.endMs === undefined
      ? undefined
      : milliseconds(value.endMs, "answer end time");
  if (
    (startMs === undefined) !== (endMs === undefined) ||
    (startMs !== undefined && endMs! <= startMs)
  )
    return fail("Answer start and end times must describe a positive range.");
  if (
    value.timing !== undefined &&
    value.timing !== "estimated" &&
    value.timing !== "unaligned"
  )
    return fail(
      "Live conversation timing must be marked estimated or unaligned.",
    );
  return {
    id: identifier(value.id),
    sequence: Number(value.sequence),
    role: value.role,
    text: value.text.trim(),
    capturedAt: time(value.capturedAt, "answer date"),
    ...(value.role === "user" ? { chapterId: chapter(value.chapterId) } : {}),
    ...(startMs === undefined ? {} : { startMs, endMs }),
    timing:
      startMs === undefined
        ? "unaligned"
        : ((value.timing ?? "estimated") as InterviewTurn["timing"]),
    ...(value.supersedesTurnId === undefined
      ? {}
      : { supersedesTurnId: identifier(value.supersedesTurnId) }),
  };
}

/** Projection only. Conversation answers never overwrite saved question retakes. */
export function interviewAnswers(
  c: Pick<Collection, "interviews">,
  chapterId: string,
): AnswerTake[] {
  return (c.interviews ?? []).flatMap((session) => {
    const ordered = [...session.turns].sort((a, b) => a.sequence - b.sequence);
    return ordered
      .filter(
        (turn) =>
          turn.role === "user" &&
          turn.chapterId === chapterId &&
          isMeaningfulInterviewSpeech(turn.text) &&
          !session.excludedTurnIds.includes(turn.id),
      )
      .map((turn) => {
        const aligned =
          turn.timing === "estimated" &&
          turn.startMs !== undefined &&
          turn.endMs !== undefined;
        const segments = session.segments.filter(
          (segment) =>
            !aligned ||
            (segment.startMs < turn.endMs! &&
              segment.startMs + segment.durationMs > turn.startMs!),
        );
        const preceding = ordered
          .filter(
            (item) => item.role === "agent" && item.sequence < turn.sequence,
          )
          .at(-1);
        return {
          id: `live-${turn.id}`,
          questionId: `live-${turn.id}`,
          prompt: preceding?.text ?? "Your conversation",
          text: turn.text,
          kind: segments[0]?.kind ?? "text",
          createdAt: turn.capturedAt,
          transcriptionStatus: "ready",
          ...(segments.length === 1
            ? {
                mediaId: segments[0].mediaId,
                audioMediaId: segments[0].audioMediaId,
              }
            : {}),
          ...(aligned
            ? { durationSeconds: (turn.endMs! - turn.startMs!) / 1000 }
            : {}),
          liveSource: {
            sessionId: session.id,
            turnId: turn.id,
            chapterId: turn.chapterId!,
            timing: turn.timing,
            sourceRanges: segments.map((segment) => ({
              segmentId: segment.id,
              mediaId: segment.mediaId,
              ...(aligned
                ? {
                    inMs: Math.max(0, turn.startMs! - segment.startMs),
                    outMs: Math.min(
                      segment.durationMs,
                      turn.endMs! - segment.startMs,
                    ),
                  }
                : {}),
            })),
          },
        } satisfies AnswerTake;
      });
  });
}

function invalidateDraft(c: Collection) {
  if (!c.chapters.length) return;
  c.draftOutdated = true;
  for (const item of c.chapters) {
    item.editorialReviewed = false;
    item.reviewedFilmSha256 = undefined;
  }
}

/** Commit only a completed, verified spoken retake. Originals and other parts stay intact. */
export async function commitInterviewReplacement(
  c: Collection,
  session: InterviewSession,
  findMedia: (id: string) => Promise<StoredMedia | null>,
  now = new Date().toISOString(),
): Promise<boolean> {
  const target = session.replacesChapterId;
  if (
    !target ||
    session.replacementCommittedAt ||
    session.status !== "completed"
  )
    return false;
  const index = (c.interviews ?? []).findIndex(
    (item) => item.id === session.id,
  );
  if (index < 0) return false;
  const answers = interviewAnswers({ interviews: [session] }, target);
  let verified = false;
  for (const answer of answers) {
    if (await hasRecordedAnswerSource(answer, c, findMedia)) verified = true;
    else return false;
  }
  if (!verified) return false;
  for (const older of (c.interviews ?? []).slice(0, index)) {
    for (const turn of older.turns)
      if (
        turn.role === "user" &&
        turn.chapterId === target &&
        !older.excludedTurnIds.includes(turn.id)
      )
        older.excludedTurnIds.push(turn.id);
  }
  for (const questionId of Object.keys(c.selectedTakeIds))
    if (questionId === target || questionId.startsWith(`${target}-f`))
      delete c.selectedTakeIds[questionId];
  session.replacementCommittedAt = now;
  c.status = "recording";
  invalidateDraft(c);
  return true;
}

/** Apply inside mutateCollection so retries and concurrent updates are serialized. */
export async function applyInterviewAction(
  c: Collection,
  input: unknown,
  findMedia: (id: string) => Promise<StoredMedia | null>,
  now = new Date().toISOString(),
): Promise<Collection> {
  const body = object(input);
  if (body.action === "correct_turn")
    return fail(
      "Record a new answer to replace a saved response. Transcript editing is no longer available.",
      410,
    );
  const sessionId = identifier(body.sessionId);
  c.interviews ??= [];
  let session = c.interviews.find((item) => item.id === sessionId);
  if (body.action === "start") {
    const replacement =
      body.replaceChapterId === undefined
        ? undefined
        : chapter(body.replaceChapterId);
    const provider = body.provider ?? "elevenlabs";
    if (provider !== "elevenlabs" && provider !== "guided")
      return fail("Invalid interview provider.");
    if (session && session.provider !== provider)
      return fail(
        "This conversation was started with a different interview mode.",
        409,
      );
    if (session && session.replacesChapterId !== replacement)
      return fail(
        "This conversation was started for a different story part.",
        409,
      );
    if (session) return c;
    const configuredLimit = Number(
      process.env.COLLECTION_CONVERSATION_LIMIT || 100,
    );
    const conversationLimit =
      Number.isSafeInteger(configuredLimit) && configuredLimit > 0
        ? configuredLimit
        : 100;
    if (c.interviews.length >= conversationLimit)
      return fail(
        "This gift has reached its conversation allowance. Your existing recordings are saved. Contact the Time Tapestry team to request more space.",
      );
    if (c.interviews.some((item) => item.status === "active"))
      return fail(
        "Pause the current conversation before starting another.",
        409,
      );
    session = {
      id: sessionId,
      provider,
      status: "active",
      startedAt: now,
      turns: [],
      segments: [],
      excludedTurnIds: [],
      ...(replacement ? { replacesChapterId: replacement } : {}),
    };
    c.interviews.push(session);
    c.status = "recording";
    return c;
  }
  if (!session) return fail("Your conversation could not be found.", 404);
  if (body.action === "append_turns") {
    if (
      !Array.isArray(body.turns) ||
      body.turns.length < 1 ||
      body.turns.length > 20
    )
      return fail("Save between 1 and 20 conversation turns at a time.");
    const parsed = body.turns.map(turnFrom);
    for (const turn of parsed) {
      if (
        session.replacesChapterId &&
        turn.role === "user" &&
        turn.chapterId !== session.replacesChapterId
      )
        return fail(
          "This conversation can replace only its selected story part.",
          409,
        );
      const existing = session.turns.find((item) => item.id === turn.id);
      if (existing) {
        if (JSON.stringify(existing) !== JSON.stringify(turn))
          return fail(
            "This answer was already saved with different words. Save a correction as a new turn.",
            409,
          );
        continue;
      }
      if (
        c.interviews.some(
          (other) =>
            other.id !== session.id &&
            other.turns.some((item) => item.id === turn.id),
        )
      )
        return fail(
          "This answer identifier already belongs to another conversation.",
          409,
        );
      if (session.turns.some((item) => item.sequence === turn.sequence))
        return fail(
          "This turn sequence was already used. Refresh the conversation before saving again.",
          409,
        );
      if (
        session.turns.length >= 300 ||
        session.turns.reduce((sum, item) => sum + item.text.length, 0) +
          turn.text.length >
          200_000
      )
        return fail(
          "This conversation is full. Start a new conversation to keep adding memories. Your saved words are unchanged.",
        );
      if (turn.supersedesTurnId) {
        if (session.status !== "active")
          return fail(
            "Record a new answer to replace a saved response. Transcript editing is no longer available.",
            410,
          );
        const original = session.turns.find(
          (item) => item.id === turn.supersedesTurnId,
        );
        if (!original || original.role !== "user" || turn.role !== "user")
          return fail(
            "A correction must refer to a saved answer from this conversation.",
          );
        const wasExcluded = session.excludedTurnIds.includes(original.id);
        if (!wasExcluded) session.excludedTurnIds.push(original.id);
        // Correcting wording does not authorize restoring a left-out memory.
        // Keep that choice on the replacement until the owner includes it.
        if (wasExcluded && !session.excludedTurnIds.includes(turn.id))
          session.excludedTurnIds.push(turn.id);
      }
      session.turns.push(turn);
      if (turn.role === "user") invalidateDraft(c);
    }
    await commitInterviewReplacement(c, session, findMedia, now);
    return c;
  }
  if (body.action === "attach_segment") {
    const value = object(body.segment);
    const id = identifier(value.id);
    const existing = session.segments.find((item) => item.id === id);
    if (value.kind !== "voice" && value.kind !== "video")
      return fail("Invalid original recording type.");
    const segment: InterviewSegment = {
      id,
      mediaId: identifier(value.mediaId),
      startMs: milliseconds(value.startMs, "recording start time"),
      durationMs: milliseconds(
        value.durationMs,
        "recording duration",
        MAX_SEGMENT_DURATION_MS,
      ),
      kind: value.kind,
      createdAt:
        value.createdAt === undefined
          ? (existing?.createdAt ?? now)
          : time(value.createdAt, "recording date"),
      ...(value.localTakeId === undefined
        ? {}
        : { localTakeId: identifier(value.localTakeId) }),
      ...(value.audioMediaId === undefined
        ? {}
        : { audioMediaId: identifier(value.audioMediaId) }),
    };
    if (
      !segment.durationMs ||
      segment.startMs + segment.durationMs > MAX_TIMELINE_MS
    )
      return fail(
        "Recording duration is outside the supported conversation window.",
      );
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(segment))
        return fail(
          "This original recording was already attached differently.",
          409,
        );
      return c;
    }
    if (session.segments.length >= 40)
      return fail(
        "This conversation has reached its original recording limit.",
      );
    const media = await findMedia(segment.mediaId);
    if (!isStoredOwnerRecording(media, c, segment.kind))
      return fail(
        "Finish backing up this original recording before attaching it.",
      );
    if (segment.audioMediaId) {
      const audio = await findMedia(segment.audioMediaId);
      if (!isStoredOwnerRecording(audio, c, "voice"))
        return fail("The audio backup could not be verified.");
    }
    session.segments.push(segment);
    invalidateDraft(c);
    await commitInterviewReplacement(c, session, findMedia, now);
    return c;
  }
  if (body.action === "set_status") {
    if (
      !["active", "paused", "completed", "interrupted"].includes(
        String(body.status),
      )
    )
      return fail("Invalid conversation status.");
    if (body.status === "completed") {
      if (!session.segments.length)
        return fail(
          "Save an original video or audio recording before completing this conversation. Your saved words are unchanged.",
        );
      for (const segment of session.segments)
        if (
          !isStoredOwnerRecording(
            await findMedia(segment.mediaId),
            c,
            segment.kind,
          )
        )
          return fail(
            "Finish saving your original recordings before completing this conversation.",
          );
    }
    if (
      body.status === "active" &&
      c.interviews.some(
        (item) => item.id !== session.id && item.status === "active",
      )
    )
      return fail(
        "Pause the other conversation before resuming this one.",
        409,
      );
    if (body.providerConversationId !== undefined) {
      const providerId = identifier(body.providerConversationId);
      session.providerConversationIds = [
        ...new Set([
          ...(session.providerConversationIds ?? []),
          ...(session.providerConversationId
            ? [session.providerConversationId]
            : []),
          providerId,
        ]),
      ];
      session.providerConversationId = providerId;
    }
    session.status = body.status as InterviewStatus;
    if (session.status === "completed" || session.status === "interrupted")
      session.endedAt ??= now;
    else delete session.endedAt;
    await commitInterviewReplacement(c, session, findMedia, now);
    return c;
  }
  if (body.action === "select_turn") {
    const turnId = identifier(body.turnId);
    if (
      typeof body.included !== "boolean" ||
      !session.turns.some((turn) => turn.id === turnId && turn.role === "user")
    )
      return fail("Choose a saved answer to include or leave out.");
    const excluded = session.excludedTurnIds.includes(turnId);
    if (body.included && excluded) {
      session.excludedTurnIds = session.excludedTurnIds.filter(
        (id) => id !== turnId,
      );
      invalidateDraft(c);
    } else if (!body.included && !excluded) {
      session.excludedTurnIds.push(turnId);
      invalidateDraft(c);
    }
    await commitInterviewReplacement(c, session, findMedia, now);
    return c;
  }
  return fail("Unknown conversation update.");
}
