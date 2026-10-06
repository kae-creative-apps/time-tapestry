import { appOrigin } from "./access";
import type { Collection } from "./types";

/** Queue under the collection lock. Delivery rechecks the current state. */
export function queuePreparationAttention(
  c: Collection,
  workId: string,
  error?: string,
  now = new Date().toISOString(),
) {
  if (c.status === "approved") return;
  const id = `${c.id}:preparation-attention:${workId}`;
  const existing = c.notifications.find((notice) => notice.id === id);
  // A retry can suppress an unattempted notice before the same job stops again.
  // Restore that notice without replacing a request already seen by a provider.
  if (
    existing &&
    (existing.status !== "suppressed" || existing.dispatch?.firstAttemptAt)
  )
    return;
  if (existing)
    c.notifications = c.notifications.filter((notice) => notice.id !== id);
  c.notifications.push({
    id,
    kind: "preparation_attention",
    to: c.storyteller.email,
    subject: "Your Time Tapestry preparation needs attention",
    text: `${error || "Preparation could not finish."} Open your saved collection to see the next step. Nothing has been shared or mailed.`,
    url: `${appOrigin()}/collection/${c.id}/complete?key=${c.ownerKey}`,
    dueAt: now,
    status: "pending",
  });
}
