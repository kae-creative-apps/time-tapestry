import {
  readFile,
  mkdir,
  writeFile,
  unlink,
  stat,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { get, head } from "@vercel/blob";
import { dataRoot, getCollection, getMedia, putMedia } from "./store";
import type { Collection, StoredMedia } from "./types";
import {
  reserveMediaUpload,
  finalizeMediaUpload,
  releaseMediaReservation,
  MAX_MEDIA_BYTES,
} from "./usage";
import { SecurityError } from "../security/policy";
import { isGeneratedFilmMedia } from "./recording-validation";
import {
  PRIMARY_RECIPIENT_ID,
  recipientById,
  storedRecipientId,
} from "./recipients";

/** Stored metadata is never authority to contact arbitrary hosts with a Blob credential. */
export function assertPrivateBlobUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid private recording URL.");
  }
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/.test(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    url.hash
  )
    throw new Error("Invalid private recording URL.");
  return url;
}
export async function assertLocalMediaPath(value: string) {
  const root = await realpath(dataRoot),
    target = await realpath(value);
  const relative = path.relative(root, target);
  if (
    !relative ||
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    !relative.includes(path.sep)
  )
    throw new Error("Recording path is outside private media storage.");
  return target;
}

export const mediaTypes = [
  "video/webm",
  "video/mp4",
  "video/quicktime",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
];
export function mediaAllowed(
  c: Collection,
  role: string,
  m: StoredMedia,
  recipientId = PRIMARY_RECIPIENT_ID,
) {
  if (m.collectionId !== c.id) return false;
  if (role === "owner") return true;
  if (role === "recipient")
    return (
      Boolean(recipientById(c, recipientId)) &&
      c.status === "approved" &&
      ((m.role === "recipient" && storedRecipientId(m) === recipientId) ||
        c.chapters.some(
          (chapter) =>
            chapter.videoMediaId === m.id &&
            chapter.film?.mediaId === m.id &&
            chapter.film.narrationKind === "original_recording",
        ) ||
        (m.provenance === "generated_film" &&
          m.mimeType === "video/mp4" &&
          Boolean(
            c.livingStory?.moments.some(
              (moment) =>
                moment.status === "published" &&
                moment.videoMediaId === m.id &&
                moment.sourceMediaId === m.originalSourceMediaId &&
                Boolean(moment.content?.trim()) &&
                moment.id === m.livingStoryMomentId,
            ),
          )))
    );
  return false;
}
export async function saveLocalMedia(
  collectionId: string,
  role: "owner" | "recipient",
  file: File,
  recipientId = PRIMARY_RECIPIENT_ID,
  livingStoryMomentId?: string,
) {
  if (process.env.VERCEL)
    throw new Error("Use the private direct upload for cloud recordings.");
  const mime = file.type.split(";")[0];
  if (!mediaTypes.includes(mime)) throw new Error("Unsupported recording type");
  if (file.size > MAX_MEDIA_BYTES)
    throw new Error(
      "Save a shorter recording. Your local take is still available.",
    );
  const id = randomUUID();
  await reserveMediaUpload({ collectionId, mediaId: id, bytes: file.size });
  await mkdir(path.join(dataRoot, "media"), { recursive: true });
  const localPath = path.join(dataRoot, "media", id);
  try {
    await writeFile(localPath, new Uint8Array(await file.arrayBuffer()), {
      mode: 0o600,
      flag: "wx",
    });
  } catch (error) {
    await unlink(localPath).catch(() => {});
    await releaseMediaReservation({ collectionId, mediaId: id });
    throw error;
  }
  const media: StoredMedia = {
    provenance: "uploaded_recording",
    id,
    collectionId,
    role,
    ...(livingStoryMomentId ? { livingStoryMomentId } : {}),
    ...(role === "recipient" ? { recipientId } : {}),
    mimeType: mime,
    originalName: file.name.slice(0, 200),
    bytes: file.size,
    createdAt: new Date().toISOString(),
    localPath,
  };
  await putMedia(media);
  await finalizeMediaUpload({
    collectionId,
    mediaId: id,
    bytes: (await stat(localPath)).size,
  });
  return media;
}
export async function finalizeCloudMedia(id: string) {
  const m = await getMedia(id);
  if (!m) throw new Error("Upload record not found");
  const collection = await getCollection(m.collectionId);
  if (isGeneratedFilmMedia(m, collection ?? undefined))
    throw new Error(
      "Completed films cannot be replaced through recording uploads.",
    );
  const blob = await head(`collections/${m.collectionId}/${m.id}`);
  assertPrivateBlobUrl(blob.url);
  await finalizeMediaUpload({
    collectionId: m.collectionId,
    mediaId: m.id,
    bytes: blob.size,
  });
  const next = {
    ...m,
    url: blob.url,
    mimeType: blob.contentType,
    bytes: blob.size,
  };
  await putMedia(next);
  return next;
}
export async function mediaBytes(
  m: StoredMedia,
  maximumBytes = MAX_MEDIA_BYTES,
): Promise<Uint8Array> {
  if (m.bytes > maximumBytes)
    throw new SecurityError(
      "This recording is too large for this operation. Your original is saved.",
      413,
    );
  if (m.localPath) {
    const location = await assertLocalMediaPath(m.localPath);
    if ((await stat(location)).size > maximumBytes)
      throw new SecurityError(
        "This recording is too large for this operation. Your original is saved.",
        413,
      );
    return new Uint8Array(await readFile(location));
  }
  if (!m.url) throw new Error("Upload is not finished");
  assertPrivateBlobUrl(m.url);
  const result = await get(m.url, { access: "private" });
  if (!result || result.statusCode !== 200)
    throw new Error("Recording could not be loaded");
  const reader = result.stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      throw new SecurityError(
        "This recording is too large for this operation. Your original is saved.",
        413,
      );
    }
    chunks.push(value);
  }
  return new Uint8Array(Buffer.concat(chunks));
}
