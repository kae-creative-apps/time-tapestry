import { readdir, stat } from "node:fs/promises";
import { kv, kvConfigured } from "../kv-client";
import { dataRoot, mutateRecord, readRecord } from "./store";
import type { StoredMedia } from "./types";
import { SecurityError } from "../security/policy";

export const MAX_MEDIA_BYTES = 512 * 1024 * 1024;
const DEFAULT_COLLECTION_BYTES = 2 * 1024 * 1024 * 1024;
type UploadEntry = {
  bytes: number;
  status: "reserved" | "finalized";
  updatedAt: string;
};
type UsageRecord = {
  recordType: "collection-usage";
  collectionId: string;
  uploads: Record<string, UploadEntry>;
};
export type CollectionUsage = {
  usedBytes: number;
  reservedBytes: number;
  limitBytes: number;
  maxFileBytes: number;
  remainingBytes: number;
  nearLimit: boolean;
};
function validateId(value: string) {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(value))
    throw new SecurityError("Invalid recording identifier.", 400);
}
export function collectionStorageLimit() {
  const configured = Number(
    process.env.COLLECTION_STORAGE_LIMIT_BYTES || DEFAULT_COLLECTION_BYTES,
  );
  if (!Number.isSafeInteger(configured) || configured < MAX_MEDIA_BYTES)
    throw new SecurityError(
      "Recording storage needs a configuration check.",
      503,
    );
  return configured;
}
function validateBytes(bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > MAX_MEDIA_BYTES)
    throw new SecurityError(
      "Choose a recording larger than zero bytes and no larger than 512 MiB. Your original stays on this device.",
      413,
    );
}
function view(record: UsageRecord): CollectionUsage {
  const entries = Object.values(record.uploads);
  const usedBytes = entries
    .filter((x) => x.status === "finalized")
    .reduce((sum, x) => sum + x.bytes, 0);
  const reservedBytes = entries
    .filter((x) => x.status === "reserved")
    .reduce((sum, x) => sum + x.bytes, 0);
  const limitBytes = collectionStorageLimit();
  return {
    usedBytes,
    reservedBytes,
    limitBytes,
    maxFileBytes: MAX_MEDIA_BYTES,
    remainingBytes: Math.max(0, limitBytes - usedBytes - reservedBytes),
    nearLimit: usedBytes + reservedBytes >= limitBytes * 0.8,
  };
}
async function initialUsage(collectionId: string): Promise<UsageRecord> {
  const record: UsageRecord = {
    recordType: "collection-usage",
    collectionId,
    uploads: {},
  };
  let media: Array<StoredMedia | null>;
  if (kvConfigured()) {
    const keys = await kv.keys("collection-v2:media-*");
    media = await Promise.all(keys.map((key) => kv.get<StoredMedia>(key)));
  } else {
    let names: string[];
    try {
      names = await readdir(dataRoot);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return record;
      throw error;
    }
    media = await Promise.all(
      names
        .filter((name) => name.startsWith("media-") && name.endsWith(".json"))
        .map((name) => readRecord<StoredMedia>(name.slice(0, -5))),
    );
  }
  for (const item of media) {
    if (!item || item.collectionId !== collectionId) continue;
    // A missing original must not block access to the saved story or transcript.
    // Keep its recorded size charged until an operator reconciles the storage issue.
    let bytes = item.bytes;
    if (item.localPath) {
      try {
        bytes = (await stat(item.localPath)).size;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    record.uploads[item.id] = {
      bytes: bytes > 0 ? bytes : MAX_MEDIA_BYTES,
      status:
        bytes > 0 && (item.localPath || item.url) ? "finalized" : "reserved",
      updatedAt: item.createdAt,
    };
  }
  return record;
}
async function updateUsage<T>(
  collectionId: string,
  fn: (record: UsageRecord) => T | Promise<T>,
): Promise<T> {
  validateId(collectionId);
  let result!: T;
  await mutateRecord<UsageRecord>(`usage-${collectionId}`, async (stored) => {
    const record = stored || (await initialUsage(collectionId));
    result = await fn(record);
    return record;
  });
  return result;
}
export async function getCollectionUsage(collectionId: string) {
  validateId(collectionId);
  const record = await readRecord<UsageRecord>(`usage-${collectionId}`);
  return view(record || (await initialUsage(collectionId)));
}
export async function reserveMediaUpload({
  collectionId,
  mediaId,
  bytes,
}: {
  collectionId: string;
  mediaId: string;
  bytes: number;
}) {
  validateId(mediaId);
  validateBytes(bytes);
  return updateUsage(collectionId, (record) => {
    const existing = record.uploads[mediaId];
    if (existing) {
      if (existing.bytes !== bytes)
        throw new SecurityError(
          "This recording already has a different saved size.",
          409,
        );
      return view(record);
    }
    if (bytes > view(record).remainingBytes)
      throw new SecurityError(
        "This collection has reached its recording storage allowance. Existing stories remain safe and available to download. Save this recording on your device and contact the team for more space.",
        413,
      );
    record.uploads[mediaId] = {
      bytes,
      status: "reserved",
      updatedAt: new Date().toISOString(),
    };
    return view(record);
  });
}
export async function finalizeMediaUpload({
  collectionId,
  mediaId,
  bytes,
}: {
  collectionId: string;
  mediaId: string;
  bytes: number;
}) {
  validateId(mediaId);
  validateBytes(bytes);
  return updateUsage(collectionId, (record) => {
    const existing = record.uploads[mediaId];
    if (!existing)
      throw new SecurityError(
        "This recording needs a storage reservation before it can be saved.",
        409,
      );
    if (bytes > existing.bytes)
      throw new SecurityError(
        "The recording is larger than its reserved storage allowance.",
        413,
      );
    if (existing.status === "finalized" && existing.bytes !== bytes)
      throw new SecurityError(
        "This recording was already saved with a different size.",
        409,
      );
    record.uploads[mediaId] = {
      bytes,
      status: "finalized",
      updatedAt: new Date().toISOString(),
    };
    return view(record);
  });
}
export async function releaseMediaReservation({
  collectionId,
  mediaId,
}: {
  collectionId: string;
  mediaId: string;
}) {
  validateId(mediaId);
  return updateUsage(collectionId, (record) => {
    if (record.uploads[mediaId]?.status === "reserved")
      delete record.uploads[mediaId];
    return view(record);
  });
}
