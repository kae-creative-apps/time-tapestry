import { putLocalTake, type LocalTake } from "./local-takes";

/** An uploaded file is not selected until its parent has acknowledged attachment. */
export async function confirmSavedMediaSelection(
  take: LocalTake,
  select: (take: LocalTake) => void | Promise<void>,
  persist: (take: LocalTake) => Promise<void> = putLocalTake,
): Promise<LocalTake> {
  if (!["video", "voice"].includes(take.kind))
    throw new Error("Choose an original audio or video recording.");
  if (!take.mediaId)
    throw new Error("Back up this recording before selecting it.");
  const pending: LocalTake = {
    ...take,
    state: "local",
    updatedAt: new Date().toISOString(),
  };
  // A failed device checkpoint must not prevent attaching a confirmed server upload.
  await persist(pending).catch(() => {});
  await select(pending);
  const confirmed: LocalTake = {
    ...pending,
    state: "backed_up",
    updatedAt: new Date().toISOString(),
  };
  await persist(confirmed).catch(() => {});
  return confirmed;
}

/** Never silently replace a newer selection with an older recovered take. */
export function newestRecoverableTake(
  takes: LocalTake[],
  copies: Record<string, boolean>,
  attempted: Set<string>,
) {
  const latest = latestMediaSelection(takes);
  return latest &&
    latest.state === "local" &&
    copies[latest.id] === true &&
    !attempted.has(latest.id)
    ? latest
    : undefined;
}

/** The most recent explicit choice can be an older take selected again. */
export function latestMediaSelection(takes: LocalTake[]) {
  return [...takes].sort(
    (a, b) =>
      b.updatedAt.localeCompare(a.updatedAt) ||
      b.createdAt.localeCompare(a.createdAt),
  )[0];
}
