import { appOrigin, linksFor } from "./access";
import type { Collection } from "./types";

/** Queue inside the successful film attachment mutation. Sending belongs to the protected delivery job. */
export function queueFilmsReady(
  c: Collection,
  jobId: string,
  now = new Date().toISOString(),
) {
  if (c.status !== "draft") return c;
  const id = `${c.id}:films-ready:${jobId}`;
  if (!c.notifications.some((n) => n.id === id))
    c.notifications.push({
      id,
      kind: "review_ready",
      to: c.storyteller.email,
      subject: "Your Time Tapestry stories and films are ready to review",
      text: "Your saved stories and films are ready. Watch each film, read the stories and make sure everything feels right before you approve sharing with the person you chose.",
      url: appOrigin() + linksFor(c).review,
      dueAt: now,
      status: "pending",
    });
  return c;
}
