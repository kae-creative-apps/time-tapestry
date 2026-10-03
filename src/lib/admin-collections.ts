import { appendFile, mkdir, readdir, stat, realpath } from "node:fs/promises";
import { assertLocalMediaPath } from "./collection/media";
import path from "node:path";
import { createHmac } from "node:crypto";
import { kv } from "@vercel/kv";
import type { NextRequest } from "next/server";
import {
  getAdminSecret,
  getAdminTokenFromRequest,
  verifyAdminToken,
} from "./admin-auth";
import {
  dataRoot,
  getCollection,
  listCollections,
  readRecord,
} from "./collection/store";
import { getCollectionUsage } from "./collection/usage";
import {
  filmJobMatches,
  filmJobView,
  latestFilmJob,
} from "./collection/films/jobstore";
import { getSecurityHealth } from "./security/health";
import type { Collection, StoredMedia } from "./collection/types";

export const adminReadHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
export function adminAuthorized(req: NextRequest) {
  return verifyAdminToken(getAdminTokenFromRequest(req));
}
const cloud = () =>
  Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
/** Session fingerprint, resource identifiers and action only. No names, emails, URLs or raw credentials. */
export async function auditAdminRead(
  req: NextRequest,
  action: "list" | "detail" | "export" | "media" | "download",
  collectionId?: string,
  mediaId?: string,
) {
  if (!adminAuthorized(req)) throw new Error("Admin session required.");
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    collectionId,
    mediaId,
    session: createHmac("sha256", getAdminSecret())
      .update(getAdminTokenFromRequest(req)!)
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
    kind: films.has(item.id) ? ("film" as const) : ("original" as const),
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
    deliveries: c.deliveries.map(
      ({
        chapterId,
        scheduledFor,
        status,
        mailedAt,
        mailEvent,
        error,
        dispatch,
      }) => ({
        chapterId,
        scheduledFor,
        status,
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
        failureCount:
          c.deliveries.filter((x) => ["failed", "returned"].includes(x.status))
            .length +
          c.notifications.filter((x) => x.status === "failed").length +
          (job?.status === "failed" ? 1 : 0),
      };
    }),
  );
  return {
    items,
    total: collections.length,
    offset,
    limit,
    health: getSecurityHealth(),
  };
}
export async function adminCollectionDetail(id: string) {
  const c = await getCollection(id);
  if (!c) return null;
  const [allMedia, usage, filmJob] = await Promise.all([
    listStoredMedia(),
    getCollectionUsage(id),
    jobView(c),
  ]);
  const filmIds = new Set([
    ...c.chapters.flatMap((ch) => (ch.film ? [ch.film.mediaId] : [])),
    ...(filmJob?.chapters.flatMap((ch) =>
      ch.artifact ? [ch.artifact.mediaId] : [],
    ) || []),
  ]);
  const media = await Promise.all(
    allMedia
      .filter((item) => item.collectionId === id)
      .map((item) => mediaView(item, c, filmIds)),
  );
  return { collection: safeCollection(c), media, usage, filmJob };
}
