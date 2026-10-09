import { appendFile, mkdir, readdir, stat, realpath } from "node:fs/promises";
import { assertLocalMediaPath } from "./collection/media";
import path from "node:path";
import { createHash } from "node:crypto";
import { kv, kvConfigured } from "./kv-client";
import type { NextRequest } from "next/server";
import { adminForRequest, requireAdmin } from "./admin-auth";
import { ACCOUNT_COOKIE } from "./accounts/http";
import {
  dataRoot,
  getCollection,
  listCollections,
  readRecord,
} from "./collection/store";
import { getCollectionUsage } from "./collection/usage";
import {
  adminFilmRetryOverrideAllowed,
  filmJobMatches,
  filmJobView,
  latestFilmJob,
  filmWorkerHealthy,
} from "./collection/films/jobstore";
import type { StoryFilmJob } from "./collection/films/types";
import { accountEmailAvailable } from "./accounts/mail";
import { postcardDeliveryReadiness } from "./collection/postcard-proofs";
import { getSecurityHealth } from "./security/health";
import { getInterviewPreparationView } from "./collection/interview-preparation";
import { storyBookSnapshot } from "./collection/story-book";
import type { Collection, StoredMedia } from "./collection/types";

export const adminReadHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
export async function adminAuthorized(req: NextRequest) {
  return Boolean(await adminForRequest(req));
}
const cloud = () =>
  kvConfigured();
/** Verified team actor and resource IDs only. Never log family content, URLs or credentials. */
export async function auditAdminRead(
  req: NextRequest,
  action:
    | "list"
    | "detail"
    | "export"
    | "media"
    | "download"
    | "book"
    | "legacy_read"
    | "legacy_write"
    | "retry_preparation",
  collectionId?: string,
  mediaId?: string,
  detail?: { reason?: string },
) {
  const { account } = await requireAdmin(req);
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    collectionId,
    mediaId,
    actor: { accountId: account.id, email: account.email },
    ...(detail?.reason ? { reason: detail.reason } : {}),
    session: createHash("sha256")
      .update(`admin-audit:${req.cookies.get(ACCOUNT_COOKIE)!.value}`)
      .digest("hex")
      .slice(0, 24),
  };
  if (cloud()) {
    await kv.eval(
      "redis.call('lpush',KEYS[1],ARGV[1]); redis.call('ltrim',KEYS[1],0,9999); return 1",
      ["security:admin-read-audit"],
      [JSON.stringify(entry)],
    );
  } else {
    const directory = path.join(dataRoot, "audit");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await appendFile(
      path.join(directory, `${entry.timestamp.slice(0, 10)}.ndjson`),
      `${JSON.stringify(entry)}\n`,
      { mode: 0o600 },
    );
  }
}
export async function listStoredMedia(): Promise<StoredMedia[]> {
  let records: Array<StoredMedia | null>;
  if (cloud()) {
    const keys = await kv.keys("collection-v2:media-*");
    records = await Promise.all(keys.map((key) => kv.get<StoredMedia>(key)));
  } else {
    const names = await readdir(dataRoot).catch((error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    records = await Promise.all(
      names
        .filter((name) => /^media-[\w-]+\.json$/.test(name))
        .map((name) => readRecord<StoredMedia>(name.slice(0, -5))),
    );
  }
  return records.filter((item): item is StoredMedia =>
    Boolean(item?.id && item.collectionId),
  );
}
export const safeLocalMediaPath = assertLocalMediaPath;
async function mediaView(item: StoredMedia, c: Collection, films: Set<string>) {
  let available = Boolean(item.url),
    availability = item.url ? "cloud-unverified" : "pending";
  if (item.localPath) {
    try {
      const location = await safeLocalMediaPath(item.localPath);
      available = (await stat(location)).isFile();
      availability = available ? "local-ready" : "missing";
    } catch {
      available = false;
      availability = "missing";
    }
  }
  return {
    id: item.id,
    role: item.role,
    mimeType: item.mimeType,
    originalName: item.originalName,
    bytes: item.bytes,
    createdAt: item.createdAt,
    available,
    availability,
    kind:
      films.has(item.id) ||
      c.livingStory?.moments.some((moment) => moment.videoMediaId === item.id)
        ? ("film" as const)
        : ("original" as const),
    references: {
      takeIds: c.takes
        .filter(
          (take) => take.mediaId === item.id || take.audioMediaId === item.id,
        )
        .map((take) => take.id),
      interviewIds: (c.interviews || [])
        .filter((session) =>
          session.segments.some(
            (segment) =>
              segment.mediaId === item.id || segment.audioMediaId === item.id,
          ),
        )
        .map((session) => session.id),
      chapterIds: c.chapters
        .filter((chapter) => chapter.videoMediaId === item.id)
        .map((chapter) => chapter.id),
      replyIds: c.replies
        .filter((reply) => reply.mediaId === item.id)
        .map((reply) => reply.id),
    },
  };
}
const safeError = (value?: string) =>
  value
    ?.replace(/https?:\/\/\S+/gi, "[private link removed]")
    .replace(/\b(?:sk_|xi_|Bearer\s+)[\w-]+/g, "[credential removed]")
    .slice(0, 1000);
/** Strip credential-bearing fields even in historical/unknown records before returning JSON. */
export function redactAdminSecrets<T>(value: T, privateKeys: string[] = []): T {
  function visit(item: unknown): unknown {
    if (typeof item === "string") {
      let text = item
        .replace(/https?:\/\/\S+/gi, "[private link removed]")
        .replace(/\b(?:sk_|xi_|Bearer\s+)[\w-]+/g, "[credential removed]");
      for (const key of privateKeys.filter(Boolean))
        text = text.split(key).join("[credential removed]");
      return text;
    }
    if (Array.isArray(item)) return item.map(visit);
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item)
          .filter(
            ([key]) =>
              !/(?:key|token|secret|url|localpath|requestbody|nonce|signature|lease|leaseid)$/i.test(
                key,
              ),
          )
          .map(([key, value]) => [key, visit(value)]),
      );
    return item;
  }
  return visit(value) as T;
}
export function adminRetryOverrideAvailable(
  c: Collection,
  preparation: Awaited<ReturnType<typeof getInterviewPreparationView>>,
  job: StoryFilmJob | null,
) {
  if (c.status === "approved" || !preparation?.processingApprovedAt)
    return false;
  if (preparation.ready || preparation.canRetry) return false;
  if (preparation.missingAreas?.length) return false;
  if (job && adminFilmRetryOverrideAllowed(job)) return true;
  return (
    preparation.status === "needs_attention" &&
    /three attempts/i.test(preparation.error || "")
  );
}

function operationsView(
  c: Collection,
  preparation: Awaited<ReturnType<typeof getInterviewPreparationView>>,
  job: StoryFilmJob | null,
) {
  let book: { status: "ready" | "draft" | "unavailable"; reason?: string };
  try {
    storyBookSnapshot(c, c.recipient.name || "you", {
      draft: c.status !== "approved",
    });
    book = { status: c.status === "approved" ? "ready" : "draft" };
  } catch {
    book = {
      status: "unavailable",
      reason:
        "All four written chapters are needed before a book can be prepared.",
    };
  }
  return {
    submittedAt:
      preparation?.submittedAt || c.interviewPreparation?.submittedAt || null,
    preparation: preparation
      ? { ...preparation, error: safeError(preparation.error) }
      : null,
    book,
    retryAvailable:
      c.status !== "approved" &&
      preparation?.canRetry === true &&
      Boolean(preparation.processingApprovedAt),
    overrideAvailable: adminRetryOverrideAvailable(c, preparation, job),
    delivery: postcardDeliveryReadiness(),
    recovery: [
      ...(preparation?.status === "needs_attention"
        ? [
            preparation.canRetry
              ? "Check the cause, then retry preparation using the saved originals."
              : "An operator must inspect the source and worker logs before another attempt. Original recordings are preserved.",
          ]
        : []),
      ...(c.notifications.some((n) => n.dispatch?.reconciliationRequired)
        ? [
            "An email provider result is uncertain. Reconcile its existing dispatch before considering a resend.",
          ]
        : []),
      ...(c.deliveries.some((d) => d.dispatch?.reconciliationRequired)
        ? [
            "A Lob result is uncertain. Find the existing postcard at the provider before considering a retry.",
          ]
        : []),
      "Mail and email cannot be resent from this page. Use the existing delivery reconciliation process to prevent duplicates.",
    ],
  };
}
function safeCollection(c: Collection) {
  return {
    id: c.id,
    status: c.status,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    initiationPath: c.initiationPath,
    storyteller: c.storyteller,
    recipient: c.recipient,
    requester: c.requester,
    address: c.address,
    addressConfirmed: c.addressConfirmed,
    invitationNote: c.invitationNote,
    currentQuestion: c.currentQuestion,
    chapterBlessings: c.chapterBlessings,
    chapters: c.chapters,
    takes: c.takes,
    selectedTakeIds: c.selectedTakeIds,
    interviews: c.interviews || [],
    replies: c.replies,
    draftOutdated: Boolean(c.draftOutdated),
    approvedAt: c.approvedAt,
    approvedVersion: c.approvedVersion,
    postcardPreparation: c.postcardPreparation,
    livingStory: c.livingStory,
    storyIssues: c.storyIssues,
    deliveries: c.deliveries.map(
      ({
        chapterId,
        scheduledFor,
        status,
        providerId,
        mailedAt,
        mailEvent,
        error,
        dispatch,
      }) => ({
        chapterId,
        scheduledFor,
        status,
        providerId,
        mailedAt,
        mailEvent,
        error: safeError(error),
        attempts: dispatch?.attempts,
        nextAttemptAt: dispatch?.nextAttemptAt,
        reconciliationRequired: dispatch?.reconciliationRequired,
      }),
    ),
    notifications: c.notifications.map(
      ({
        id,
        kind,
        to,
        subject,
        dueAt,
        status,
        providerId,
        sentAt,
        error,
        chapterId,
        dispatch,
      }) => ({
        id,
        kind,
        to,
        subject,
        dueAt,
        status,
        providerId,
        sentAt,
        error: safeError(error),
        chapterId,
        attempts: dispatch?.attempts,
        nextAttemptAt: dispatch?.nextAttemptAt,
        reconciliationRequired: dispatch?.reconciliationRequired,
      }),
    ),
  };
}
async function jobView(c: Collection) {
  const job = await latestFilmJob(c.id);
  if (!job) return null;
  const view = filmJobView(job);
  return {
    ...view,
    status: filmJobMatches(job, c) ? view.status : "stale",
    error: safeError(view.error),
    chapters: view.chapters.map((chapter) => ({
      ...chapter,
      error: safeError(chapter.error),
    })),
    attempts: job.attempts,
  };
}
export async function adminCollectionList(offset = 0, limit = 50) {
  const collections = (await listCollections()).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  const media = await listStoredMedia();
  const items = await Promise.all(
    collections.slice(offset, offset + limit).map(async (c) => {
      const [usage, job] = await Promise.all([
        getCollectionUsage(c.id),
        jobView(c),
      ]);
      return {
        id: c.id,
        storytellerName: c.storyteller.name,
        storytellerEmail: c.storyteller.email,
        recipientName: c.recipient.name,
        status: c.status,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        usage,
        mediaCount: media.filter((item) => item.collectionId === c.id).length,
        filmStatus: job?.status || null,
        submittedAt: c.interviewPreparation?.submittedAt || null,
        preparationStatus: c.interviewPreparation?.status || null,
        livingMomentCount: c.livingStory?.moments.length || 0,
        failureCount:
          c.deliveries.filter((x) => ["failed", "returned"].includes(x.status))
            .length +
          c.notifications.filter((x) => x.status === "failed").length +
          (job?.status === "failed" ? 1 : 0) +
          (c.interviewPreparation?.status === "needs_attention" ? 1 : 0),
      };
    }),
  );
  return {
    items,
    total: collections.length,
    offset,
    limit,
    health: getSecurityHealth(),
    automation: {
      workerOnline: await filmWorkerHealthy(),
      originalTranscriptionConfigured: Boolean(process.env.ELEVENLABS_API_KEY),
      accountEmailConfigured: accountEmailAvailable(),
      notificationsEnabled:
        process.env.COLLECTION_EMAIL_ENABLED === "true" ||
        process.env.COLLECTION_DELIVERY_ENABLED === "true",
      schedulerAuthenticated: Boolean(process.env.CRON_SECRET),
      postcards: postcardDeliveryReadiness(),
    },
  };
}
export async function adminCollectionDetail(id: string) {
  const c = await getCollection(id);
  if (!c) return null;
  const [allMedia, usage, filmJob, preparation, latestJob] = await Promise.all([
    listStoredMedia(),
    getCollectionUsage(id),
    jobView(c),
    getInterviewPreparationView(c),
    latestFilmJob(c.id),
  ]);
  const filmIds = new Set([
    ...c.chapters.flatMap((ch) =>
      [ch.film?.mediaId, ch.videoMediaId].filter((id): id is string =>
        Boolean(id),
      ),
    ),
    ...(filmJob?.chapters.flatMap((ch) =>
      ch.artifact ? [ch.artifact.mediaId] : [],
    ) || []),
  ]);
  const media = await Promise.all(
    allMedia
      .filter((item) => item.collectionId === id)
      .map((item) => mediaView(item, c, filmIds)),
  );
  return redactAdminSecrets(
    {
      collection: safeCollection(c),
      media,
      usage,
      filmJob,
      operations: operationsView(c, preparation, latestJob),
    },
    [c.ownerKey, c.recipientKey, c.requesterKey],
  );
}
