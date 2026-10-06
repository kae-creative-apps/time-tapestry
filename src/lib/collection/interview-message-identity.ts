type Message = {
  role: "user" | "agent";
  message: string;
  response_id?: unknown;
  event_id?: unknown;
};

type SavedMessage = { id: string; text: string };

function providerKey(epoch: string, message: Message): string | null {
  const responseId =
    typeof message.response_id === "string" ? message.response_id.trim() : "";
  if (responseId)
    return JSON.stringify([epoch, message.role, "response", responseId]);
  const eventId = message.event_id;
  if (
    (typeof eventId === "number" && Number.isFinite(eventId)) ||
    (typeof eventId === "string" && eventId.trim())
  )
    return JSON.stringify([
      epoch,
      message.role,
      "event",
      typeof eventId === "string" ? eventId.trim() : eventId,
    ]);
  return null;
}

/** Missing provider IDs cannot establish a resend or a correction. */
export function classifyInterviewMessage(
  epoch: string,
  message: Message,
  savedMessages: ReadonlyMap<string, SavedMessage>,
): {
  eventKey: string | null;
  duplicate: boolean;
  supersedesTurnId?: string;
} {
  const eventKey = providerKey(epoch, message);
  const previous = eventKey === null ? undefined : savedMessages.get(eventKey);
  return {
    eventKey,
    duplicate: previous?.text === message.message,
    ...(previous && message.role === "user" && previous.text !== message.message
      ? { supersedesTurnId: previous.id }
      : {}),
  };
}
