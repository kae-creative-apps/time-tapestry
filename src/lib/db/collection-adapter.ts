import { createHash } from "node:crypto";
import {
  getCollection,
  getMedia,
  listCollections,
  mutateCollection,
  mutateRecord,
  readRecord,
} from "../collection/store";
import { PRIMARY_RECIPIENT_ID } from "../collection/recipients";
import { isStoredOwnerRecording } from "../collection/recording-validation";
import type { Collection } from "../collection/types";
import type { OrganizationRecord } from "../organizations/types";
import { storyTraceId } from "../observability/pipeline-logger";
import { DatabaseConflictError, DatabaseConstraintError } from "./adapter";
import type {
  DatabaseAdapter,
  MutationOptions,
  MutationResult,
  ScopedRepository,
} from "./adapter";
import type {
  Chapter,
  ChapterCreate,
  ChapterUpdate,
  PrintOrder,
  PrintOrderCreate,
  PrintOrderUpdate,
  Recipient,
  RecipientCreate,
  RecipientUpdate,
  StoredStory,
  Story,
  Take,
  TakeCreate,
  TakeUpdate,
} from "./schema";

/** Hash the complete aggregate so existing writers participate without a counter migration. */
export function collectionRevision(c: Collection): string {
  return createHash("sha256").update(JSON.stringify(c)).digest("hex");
}
function story(c: StoredStory): Story {
  return {
    id: c.id,
    user_id: c.database?.userId ?? null,
    org_id: c.database?.orgId ?? null,
    title: c.database?.title ?? `${c.storyteller.name}'s stories`,
    status: c.status,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    trace_id: storyTraceId(c.id),
    revision: collectionRevision(c),
  };
}
function assertActive(c: StoredStory) {
  if (c.database?.deletedAt)
    throw new DatabaseConstraintError("This story has been archived.");
}
function assertEditable(c: Collection) {
  if (c.status === "approved")
    throw new DatabaseConstraintError(
      "Approved stories must remain preserved. Create a new version through the story service.",
    );
}
function changedSources(c: Collection) {
  if (c.chapters.length) c.draftOutdated = true;
  c.status = "recording";
  for (const chapter of c.chapters) {
    chapter.editorialReviewed = false;
    chapter.reviewedFilmSha256 = undefined;
  }
}
function privateMediaRoute(storyId: string, mediaId?: string): string | null {
  return mediaId
    ? `/api/collection/${encodeURIComponent(storyId)}/media/${encodeURIComponent(mediaId)}`
    : null;
}
function chapters(c: Collection): Chapter[] {
  return c.chapters.map((chapter, index) => {
    const selected = c.takes.find(
      (take) =>
        take.questionId === chapter.id &&
        c.selectedTakeIds[take.questionId] === take.id,
    );
    return {
      id: chapter.id,
      story_id: c.id,
      theme_index: /^q[1-4]$/.test(chapter.id)
        ? Number(chapter.id.slice(1)) - 1
        : index,
      title: chapter.title,
      audio_url: privateMediaRoute(
        c.id,
        selected?.audioMediaId ?? selected?.mediaId,
      ),
      transcript_json: {
        text: chapter.content,
        source_take_ids: [...chapter.sourceTakeIds],
      },
      status: chapter.videoStatus,
    };
  });
}
function takes(c: Collection): Take[] {
  const counts = new Map<string, number>();
  return c.takes.map((take) => {
    const ordinal = (counts.get(take.questionId) ?? 0) + 1;
    counts.set(take.questionId, ordinal);
    return {
      id: take.id,
      story_id: c.id,
      chapter_id: take.questionId.split("-")[0],
      question_id: take.questionId,
      take_number: ordinal,
      audio_blob_url: privateMediaRoute(
        c.id,
        take.audioMediaId ?? take.mediaId,
      ),
      audio_media_id: take.audioMediaId ?? take.mediaId ?? null,
      duration: take.durationSeconds ?? null,
      is_selected: c.selectedTakeIds[take.questionId] === take.id,
    };
  });
}
function recipients(c: Collection): Recipient[] {
  return [
    {
      id: PRIMARY_RECIPIENT_ID,
      story_id: c.id,
      name: c.recipient.name,
      email: c.recipient.email,
      street_address: c.address?.line1 ?? null,
      address_line_2: c.address?.line2 ?? null,
      city: c.address?.city ?? null,
      state: c.address?.region ?? null,
      zip: c.address?.postalCode ?? null,
      country: c.address?.country ?? null,
      phone: c.recipient.phone ?? null,
      kind: "postal_primary" as const,
    },
    ...(c.additionalRecipients ?? [])
      .filter((recipient) => !recipient.revokedAt)
      .map((recipient) => ({
        id: recipient.id,
        story_id: c.id,
        name: recipient.name ?? "",
        email: recipient.email,
        street_address: null,
        address_line_2: null,
        city: null,
        state: null,
        zip: null,
        country: null,
        phone: null,
        kind: "digital" as const,
      })),
  ];
}
function printOrders(c: Collection): PrintOrder[] {
  return c.deliveries.map((delivery) => ({
    id: delivery.chapterId,
    story_id: c.id,
    chapter_id: delivery.chapterId,
    recipient_id: PRIMARY_RECIPIENT_ID,
    lob_job_id: delivery.providerId ?? null,
    status: delivery.status,
    tracking_events: delivery.mailEvent
      ? [{ type: delivery.mailEvent, occurred_at: delivery.mailedAt ?? null }]
      : [],
    expected_delivery: null,
    scheduled_for: delivery.scheduledFor,
  }));
}
type Change<Row> = (c: StoredStory) => Row | Promise<Row>;
async function atomic<Row>(
  id: string,
  change: Change<Row>,
  options: MutationOptions = {},
): Promise<MutationResult<Row>> {
  let value: Row;
  const saved = await mutateCollection(id, async (current) => {
    const c: StoredStory = current;
    assertActive(c);
    if (
      options.expectedRevision !== undefined &&
      options.expectedRevision !== collectionRevision(c)
    )
      throw new DatabaseConflictError();
    value = await change(c);
    return c;
  });
  return { value: value!, revision: collectionRevision(saved) };
}
function requireRow<Row extends { id: string }>(rows: Row[], id: string): Row {
  const row = rows.find((item) => item.id === id);
  if (!row)
    throw new DatabaseConstraintError("This saved item could not be found.");
  return row;
}
function repository<Row extends { id: string }, Create, Update>(config: {
  project: (c: StoredStory) => Row[];
  create: (c: StoredStory, input: Create) => string | Promise<string>;
  update: (c: StoredStory, id: string, input: Update) => void | Promise<void>;
  remove: (c: StoredStory, id: string) => void;
}): ScopedRepository<Row, Create, Update> {
  return {
    async list(storyId) {
      const c: StoredStory | null = await getCollection(storyId);
      return c && !c.database?.deletedAt ? config.project(c) : [];
    },
    async get(storyId, id) {
      return (await this.list(storyId)).find((row) => row.id === id) ?? null;
    },
    async create(storyId, input, options) {
      return atomic(
        storyId,
        async (c) => {
          const id = await config.create(c, input);
          return requireRow(config.project(c), id);
        },
        options,
      );
    },
    async update(storyId, id, input, options) {
      return atomic(
        storyId,
        async (c) => {
          requireRow(config.project(c), id);
          await config.update(c, id, input);
          return requireRow(config.project(c), id);
        },
        options,
      );
    },
    async delete(storyId, id, options) {
      return atomic(
        storyId,
        (c) => {
          requireRow(config.project(c), id);
          config.remove(c, id);
          return null;
        },
        options,
      );
    },
  };
}

/** Transitional implementation. Indexed SQL queries require a physical database migration. */
export function createCollectionDatabaseAdapter(): DatabaseAdapter {
  return {
    kind: "collection-kv-compatible",
    stories: {
      async get(id) {
        const c: StoredStory | null = await getCollection(id);
        return c && !c.database?.deletedAt ? story(c) : null;
      },
      async create(input) {
        const saved = await mutateRecord<StoredStory>(
          input.collection.id,
          (existing) => {
            if (existing)
              throw new DatabaseConstraintError("This story already exists.");
            return {
              ...structuredClone(input.collection),
              ...(input.metadata ? { database: { ...input.metadata } } : {}),
            };
          },
        );
        return { value: story(saved), revision: collectionRevision(saved) };
      },
      async update(id, input, options) {
        const result = await atomic(
          id,
          (c) => {
            c.database = {
              ...c.database,
              ...(input.user_id !== undefined
                ? { userId: input.user_id ?? undefined }
                : {}),
              ...(input.org_id !== undefined
                ? { orgId: input.org_id ?? undefined }
                : {}),
              ...(input.title !== undefined ? { title: input.title } : {}),
            };
            return c;
          },
          options,
        );
        return { value: story(result.value), revision: result.revision };
      },
      async delete(id, options) {
        return atomic(
          id,
          (c) => {
            // Existing services do not yet filter tombstones. Only an unused aggregate can be archived here.
            if (
              c.takes.length ||
              c.chapters.length ||
              c.interviews?.length ||
              c.deliveries.length ||
              c.notifications.length ||
              c.livingStory
            )
              throw new DatabaseConstraintError(
                "Archive active stories through a retention workflow that also stops delivery and preserves recordings.",
              );
            c.database = { ...c.database, deletedAt: new Date().toISOString() };
            return null;
          },
          options,
        );
      },
    },
    chapters: repository<Chapter, ChapterCreate, ChapterUpdate>({
      project: chapters,
      create(c, { chapter }) {
        assertEditable(c);
        if (
          !/^q[1-4]$/.test(chapter.id) ||
          c.chapters.some((entry) => entry.id === chapter.id)
        )
          throw new DatabaseConstraintError(
            "Choose a new chapter in this story.",
          );
        if (
          chapter.sourceTakeIds.some(
            (id) => !c.takes.some((take) => take.id === id),
          )
        )
          throw new DatabaseConstraintError(
            "A chapter source is not part of this story.",
          );
        c.chapters.push(structuredClone(chapter));
        return chapter.id;
      },
      update(c, id, patch) {
        assertEditable(c);
        Object.assign(requireRow(c.chapters, id), patch, {
          editorialReviewed: false,
          reviewedFilmSha256: undefined,
        });
      },
      remove(c, id) {
        assertEditable(c);
        const chapter = requireRow(c.chapters, id);
        if (
          chapter.film ||
          c.deliveries.some((delivery) => delivery.chapterId === id)
        )
          throw new DatabaseConstraintError(
            "A chapter with prepared films or print history must be preserved.",
          );
        c.chapters = c.chapters.filter((entry) => entry.id !== id);
      },
    }),
    takes: repository<Take, TakeCreate, TakeUpdate>({
      project: takes,
      async create(c, { take, select }) {
        assertEditable(c);
        if (c.takes.some((entry) => entry.id === take.id))
          throw new DatabaseConstraintError(
            "This take already exists. A recording cannot be replaced in place.",
          );
        if (!/^q[1-4](?:-f[1-2])?$/.test(take.questionId))
          throw new DatabaseConstraintError("Choose a valid story question.");
        if (take.liveSource || take.replacesChapterId)
          throw new DatabaseConstraintError(
            "Live interview and chapter replacements must use the interview service.",
          );
        if (
          take.kind === "text" ||
          !take.mediaId ||
          !isStoredOwnerRecording(await getMedia(take.mediaId), c, take.kind)
        )
          throw new DatabaseConstraintError(
            "Finish uploading this story's original recording first.",
          );
        if (
          take.audioMediaId &&
          !isStoredOwnerRecording(await getMedia(take.audioMediaId), c, "voice")
        )
          throw new DatabaseConstraintError(
            "Finish uploading this story's audio backup first.",
          );
        c.takes.push(structuredClone(take));
        if (
          select === true ||
          (select !== false && !c.explicitTakeSelections?.[take.questionId])
        ) {
          c.selectedTakeIds[take.questionId] = take.id;
          changedSources(c);
        }
        return take.id;
      },
      update(c, id, input) {
        assertEditable(c);
        const take = requireRow(c.takes, id);
        if (input.is_selected) c.selectedTakeIds[take.questionId] = id;
        else if (c.selectedTakeIds[take.questionId] === id)
          delete c.selectedTakeIds[take.questionId];
        c.explicitTakeSelections = {
          ...c.explicitTakeSelections,
          [take.questionId]: true,
        };
        changedSources(c);
      },
      remove(c, id) {
        assertEditable(c);
        const take = requireRow(c.takes, id);
        if (
          c.selectedTakeIds[take.questionId] === id ||
          c.chapters.some((chapter) => chapter.sourceTakeIds.includes(id)) ||
          c.draftHistory?.some((draft) =>
            draft.chapters.some((chapter) =>
              chapter.sourceTakeIds.includes(id),
            ),
          )
        )
          throw new DatabaseConstraintError(
            "A selected take or saved draft source must be preserved.",
          );
        c.takes = c.takes.filter((entry) => entry.id !== id);
      },
    }),
    recipients: repository<Recipient, RecipientCreate, RecipientUpdate>({
      project: recipients,
      create(c, { recipient }) {
        if (
          recipient.id === PRIMARY_RECIPIENT_ID ||
          (c.additionalRecipients ?? []).some(
            (entry) =>
              entry.id === recipient.id ||
              entry.email.toLowerCase() === recipient.email.toLowerCase(),
          ) ||
          c.recipient.email.toLowerCase() === recipient.email.toLowerCase()
        )
          throw new DatabaseConstraintError(
            "This recipient already belongs to the story.",
          );
        if (recipient.revokedAt)
          throw new DatabaseConstraintError(
            "Use the recipient service to restore a removed recipient.",
          );
        c.additionalRecipients = [
          ...(c.additionalRecipients ?? []),
          structuredClone(recipient),
        ];
        return recipient.id;
      },
      update(c, id, patch) {
        // Identity changes must run invitation revocation and account-access checks in the existing service.
        if (patch.email !== undefined)
          throw new DatabaseConstraintError(
            "Change recipient email through the recipient service.",
          );
        if (id === PRIMARY_RECIPIENT_ID) {
          if (patch.name !== undefined) c.recipient.name = patch.name;
          if (patch.phone !== undefined)
            c.recipient.phone = patch.phone ?? undefined;
        } else {
          if (patch.phone !== undefined)
            throw new DatabaseConstraintError(
              "Digital recipients do not have a stored phone number.",
            );
          if (patch.name !== undefined)
            requireRow(c.additionalRecipients ?? [], id).name = patch.name;
        }
      },
      remove(c, id) {
        if (id === PRIMARY_RECIPIENT_ID)
          throw new DatabaseConstraintError(
            "The primary recipient owns the postcard history and cannot be removed here.",
          );
        requireRow(c.additionalRecipients ?? [], id).revokedAt =
          new Date().toISOString();
        for (const notification of c.notifications)
          if (
            notification.recipientId === id &&
            ["pending", "failed"].includes(notification.status)
          )
            notification.status = "suppressed";
      },
    }),
    printOrders: repository<PrintOrder, PrintOrderCreate, PrintOrderUpdate>({
      project: printOrders,
      create(c, { delivery }) {
        if (
          c.status !== "approved" ||
          !c.addressConfirmed ||
          !c.chapters.some((chapter) => chapter.id === delivery.chapterId) ||
          c.deliveries.some((entry) => entry.chapterId === delivery.chapterId)
        )
          throw new DatabaseConstraintError(
            "Approve this story and its mailing address before creating a new chapter delivery.",
          );
        if (
          delivery.status !== "scheduled" ||
          delivery.providerId ||
          delivery.dispatch
        )
          throw new DatabaseConstraintError(
            "Provider dispatch state can only be written by the delivery service.",
          );
        c.deliveries.push(structuredClone(delivery));
        return delivery.chapterId;
      },
      update(c, id, patch) {
        const delivery = c.deliveries.find((entry) => entry.chapterId === id)!;
        if (
          delivery.status !== "scheduled" ||
          delivery.dispatch ||
          delivery.providerId
        )
          throw new DatabaseConstraintError(
            "A dispatched print order must be reconciled through the delivery service.",
          );
        if (patch.scheduledFor !== undefined)
          delivery.scheduledFor = patch.scheduledFor;
      },
      remove(c, id) {
        const delivery = c.deliveries.find((entry) => entry.chapterId === id)!;
        if (
          delivery.status !== "scheduled" ||
          delivery.dispatch ||
          delivery.providerId
        )
          throw new DatabaseConstraintError(
            "Print delivery evidence must be preserved.",
          );
        c.deliveries = c.deliveries.filter((entry) => entry.chapterId !== id);
      },
    }),
    async getStoriesByOrg(orgId) {
      if (!/^[a-zA-Z0-9_-]{8,80}$/.test(orgId))
        throw new DatabaseConstraintError("Invalid organization identifier.");
      const organization = await readRecord<OrganizationRecord>(`org-${orgId}`);
      const legacyIds = new Set(
        (organization?.recordType === "organization-gifting"
          ? organization.gifts
          : []
        ).flatMap((gift) => (gift.claim ? [gift.claim.collectionId] : [])),
      );
      return (await listCollections())
        .filter(
          (c: StoredStory) =>
            !c.database?.deletedAt &&
            (c.database?.orgId === orgId || legacyIds.has(c.id)),
        )
        .map((c: StoredStory) => ({
          ...story(c),
          org_id: c.database?.orgId ?? orgId,
        }));
    },
    async getPostcardStatus(storyId) {
      return this.printOrders.list(storyId);
    },
    async atomicUpdate(storyId, update, options) {
      const result = await atomic(
        storyId,
        async (c) => {
          const next = await update(structuredClone(c));
          if (
            next.id !== c.id ||
            next.ownerKey !== c.ownerKey ||
            next.recipientKey !== c.recipientKey ||
            next.requesterKey !== c.requesterKey
          )
            throw new DatabaseConstraintError(
              "An atomic story update cannot change story identity or access keys.",
            );
          // Preserve adapter metadata even when an existing domain function returns a fresh aggregate.
          Object.assign(c, next);
          return c;
        },
        options,
      );
      return { value: story(result.value), revision: result.revision };
    },
  };
}
