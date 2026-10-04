import { createHash } from "node:crypto";
import { appOrigin, linksFor } from "./access";
import { prepareCollection } from "./create";
import { mutateRecord, putCollection } from "./store";
import type { Collection } from "./types";
import { SecurityError } from "../security/policy";

/** The random submission ID is a short-lived client-held capability, not a URL or public identifier. */
export async function createCollectionRequest(
  body: Record<string, unknown>,
  authorizeCreation: () => Promise<void>,
) {
  const prepared = prepareCollection(body);
  if (body.submissionId === undefined) {
    await authorizeCreation();
    await putCollection(prepared);
    return prepared;
  }
  if (
    typeof body.submissionId !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      body.submissionId,
    )
  )
    throw new SecurityError(
      "This start request is not valid. Refresh the form and try again.",
      400,
    );
  const digest = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  const id = `start_${digest(`time-tapestry:create:${body.submissionId.toLowerCase()}`).slice(0, 40)}`;
  const creationRequestHash = digest(
    JSON.stringify({
      initiationPath: prepared.initiationPath,
      storyteller: prepared.storyteller,
      recipient: prepared.recipient,
      requester: prepared.requester,
      address: prepared.address,
      invitationNote: prepared.invitationNote,
      faithFraming: prepared.faithFraming,
    }),
  );
  // The authorization check and collection creation share one durable lock and one record commit.
  // A matching replay is already authorized by possession of the random request capability.
  return mutateRecord<Collection>(id, async (existing) => {
    if (existing) {
      if (
        existing.schemaVersion !== 2 ||
        existing.creationRequestHash !== creationRequestHash
      )
        throw new SecurityError(
          "These details changed. Start a new request instead of reusing this one.",
          409,
        );
      return existing;
    }
    await authorizeCreation();
    prepared.id = id;
    prepared.creationRequestHash = creationRequestHash;
    // prepareCollection generated its invitation before the stable ID was known.
    prepared.notifications = prepared.notifications.map((notification) => ({
      ...notification,
      id: `${id}:invitation`,
      url: appOrigin() + linksFor(prepared).interview,
    }));
    return prepared;
  });
}
