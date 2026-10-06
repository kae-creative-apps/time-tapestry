import { createHash } from "node:crypto";
import { ElevenLabsClient, type ElevenLabs } from "@elevenlabs/elevenlabs-js";
import { CHAPTERS } from "../interview-state";
import { detectInterviewThemeFromQuestion } from "./interview-progress";
import type { Collection, InterviewChapterId, InterviewTurn } from "./types";

type ProviderConversation = ElevenLabs.GetConversationResponseModel;
function normalized(text: string) {
  return text.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").trim();
}

function successfulTheme(
  row: ProviderConversation["transcript"][number],
  pending: Map<string, InterviewChapterId>,
): InterviewChapterId | null {
  for (const call of row.toolCalls ?? []) {
    if (call.toolName !== "set_interview_theme" || !call.toolHasBeenCalled) continue;
    try {
      const id = JSON.parse(call.paramsAsJson).themeId;
      if (CHAPTERS.some((chapter) => chapter.id === id)) pending.set(call.requestId, id);
    } catch { /* Invalid tool data never changes a story area. */ }
  }
  let confirmed: InterviewChapterId | null = null;
  for (const result of row.toolResults ?? []) {
    const theme = pending.get(result.requestId);
    if (!theme) continue;
    pending.delete(result.requestId);
    if (!result.isError && result.toolHasBeenCalled === true) confirmed = theme;
  }
  return confirmed;
}

export async function reconcileRecordedInterview(
  collection: Collection,
  options: {
    agentId?: string;
    getConversation?: (id: string) => Promise<ProviderConversation>;
    beforeProvider?: () => Promise<void>;
    assertCurrent?: () => Promise<void>;
  } = {},
): Promise<Collection> {
  const copy = structuredClone(collection);
  const sessions = copy.interviews?.filter(
    (session) => session.provider === "elevenlabs" && session.segments.length > 0,
  ) ?? [];
  if (!sessions.length) return copy;
  const agentId = options.agentId || process.env.ELEVENLABS_AGENT_ID?.trim();
  const ids = sessions.flatMap((session) => [
    ...(session.providerConversationIds ?? []),
    ...(session.providerConversationId ? [session.providerConversationId] : []),
  ]);
  if (!ids.length) return copy;
  if (!agentId || (!options.getConversation && !process.env.ELEVENLABS_API_KEY?.trim()))
    throw new Error("Your original interview is saved. Its transcript connection needs a setup check.");
  const client = options.getConversation ? null : new ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY!.trim(),
    timeoutInSeconds: 20,
    maxRetries: 0,
  });
  const read = options.getConversation ?? ((id: string) => client!.conversationalAi.conversations.get(id));

  for (const session of sessions) {
    const conversationIds = [...new Set([
      ...(session.providerConversationIds ?? []),
      ...(session.providerConversationId ? [session.providerConversationId] : []),
    ])];
    const conversations: ProviderConversation[] = [];
    for (const id of conversationIds) {
      await options.assertCurrent?.();
      await options.beforeProvider?.();
      const conversation = await read(id);
      await options.assertCurrent?.();
      let context: { sessionId?: string; collectionId?: string; currentThemeId?: string };
      try {
        const value = conversation.conversationInitiationClientData?.dynamicVariables?.interview_context_json;
        if (typeof value !== "string") throw new Error("Missing context");
        context = JSON.parse(value);
      } catch {
        throw new Error("The saved conversation could not be matched to this interview. Your original recording is kept.");
      }
      const start = conversation.metadata.startTimeUnixSecs * 1000;
      const sessionStart = Date.parse(session.startedAt);
      const sessionEnd = session.endedAt ? Date.parse(session.endedAt) : Date.now();
      if (
        conversation.conversationId !== id || conversation.agentId !== agentId ||
        conversation.userId !== collection.id || context.sessionId !== session.id ||
        (context.collectionId && context.collectionId !== collection.id) ||
        !Number.isFinite(start) || !Number.isFinite(sessionStart) || !Number.isFinite(sessionEnd) ||
        start < sessionStart - 120_000 || start > sessionEnd + 120_000
      ) throw new Error("The saved conversation does not belong to this interview. Your original recording is kept.");
      if (conversation.status === "in-progress" || conversation.status === "initiated")
        throw new Error("The saved interview transcript is still finishing. Preparation will retry.");
      conversations.push(conversation);
    }
    conversations.sort((a, b) => a.metadata.startTimeUnixSecs - b.metadata.startTimeUnixSecs);
    const existing = session.turns;
    const used = new Set<string>();
    const recovered: InterviewTurn[] = [];
    for (const conversation of conversations) {
      const context = JSON.parse(String(conversation.conversationInitiationClientData!.dynamicVariables!.interview_context_json));
      let theme: InterviewChapterId = CHAPTERS.some((chapter) => chapter.id === context.currentThemeId)
        ? context.currentThemeId : "q1";
      const pending = new Map<string, InterviewChapterId>();
      for (const [rowIndex, row] of conversation.transcript.entries()) {
        const confirmed = successfulTheme(row, pending);
        if (confirmed) theme = confirmed;
        if (row.role === "agent") {
          theme = confirmed ?? detectInterviewThemeFromQuestion(row.message ?? "") ?? theme;
        }
        const text = row.message?.trim();
        if (!text || !["agent", "user"].includes(row.role)) continue;
        // The app's explicit controls are not the storyteller's spoken memories.
        if (row.role === "user" && row.sourceMedium === "text" && /^\[Interview control:/.test(text)) continue;
        const prior = existing.find((turn) => !used.has(turn.id) &&
          (turn.providerTranscript?.conversationId === conversation.conversationId &&
            turn.providerTranscript.rowIndex === rowIndex ||
            turn.role === row.role && normalized(turn.text) === normalized(text)));
        if (prior) used.add(prior.id);
        const eventIdentity = `${conversation.conversationId}:${rowIndex}:${row.role}`;
        const id = prior?.id ?? `provider-${createHash("sha256").update(eventIdentity).digest("hex").slice(0, 40)}`;
        const turn: InterviewTurn = {
          ...(prior ?? {}),
          id,
          sequence: recovered.length,
          role: row.role as "agent" | "user",
          text: prior?.text ?? text,
          capturedAt: prior?.capturedAt ?? new Date(
            (conversation.metadata.startTimeUnixSecs + row.timeInCallSecs) * 1000,
          ).toISOString(),
          // Provider turn-arrival times are not word boundaries or film cuts.
          timing: prior?.timing ?? "unaligned",
          ...(row.role === "user" ? { chapterId: theme } : {}),
          providerTranscript: {
            conversationId: conversation.conversationId,
            rowIndex,
            ...(row.sourceEventId !== undefined ? { sourceEventId: row.sourceEventId } : {}),
            ...(prior && (!prior.providerTranscript || prior.providerTranscript.originalSequence !== undefined)
              ? { originalSequence: prior.providerTranscript?.originalSequence ?? prior.sequence } : {}),
          },
        };
        recovered.push(turn);
      }
    }
    // Keep unmatched local source and exclusion choices. Recovery never deletes a take.
    for (const turn of existing.filter((turn) => !used.has(turn.id)))
      recovered.push({ ...turn, sequence: recovered.length });
    session.turns = recovered;
  }
  return copy;
}
