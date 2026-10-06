import { getTextDraft, saveTextDraft } from "./local-takes";

export type InterviewCommand = { id: string; body: Record<string, unknown> };
const key = "__conversation_outbox_v1";
const queues = new Map<string, Promise<unknown>>();

/** Serialize device writes so an acknowledgment cannot erase a newer answer. */
function locked<T>(id: string, operation: () => Promise<T>): Promise<T> {
  const next = (queues.get(id) ?? Promise.resolve())
    .catch(() => {})
    .then(() => {
      // A second tab must not overwrite an answer while this tab acknowledges
      // an upload. The per-tab queue is retained where Web Locks is unavailable.
      const locks =
        typeof navigator !== "undefined" ? navigator.locks : undefined;
      return locks
        ? locks.request(`time-tapestry:journal:${id}`, operation)
        : operation();
    });
  queues.set(id, next);
  void next
    .finally(() => {
      if (queues.get(id) === next) queues.delete(id);
    })
    .catch(() => {});
  return next;
}

async function read(id: string): Promise<InterviewCommand[]> {
  const text = await getTextDraft(id, key);
  if (!text) return [];
  const data: unknown = JSON.parse(text);
  if (
    !Array.isArray(data) ||
    data.some(
      (x) => !x || typeof x.id !== "string" || typeof x.body !== "object",
    )
  )
    throw new Error(
      "The saved interview needs recovery. Keep this browser open.",
    );
  return data;
}

export function readInterviewJournal(id: string) {
  return locked(id, () => read(id));
}
export function appendInterviewCommand(id: string, command: InterviewCommand) {
  return locked(id, async () => {
    const commands = await read(id);
    const existing = commands.find((x) => x.id === command.id);
    if (
      existing &&
      JSON.stringify(existing.body) !== JSON.stringify(command.body)
    )
      throw new Error("This interview update conflicts with a saved answer.");
    if (!existing) commands.push(command);
    await saveTextDraft(id, key, JSON.stringify(commands));
    return commands;
  });
}
export function acknowledgeInterviewCommand(id: string, commandId: string) {
  return locked(id, async () => {
    const remaining = (await read(id)).filter((x) => x.id !== commandId);
    await saveTextDraft(id, key, JSON.stringify(remaining));
    return remaining;
  });
}
