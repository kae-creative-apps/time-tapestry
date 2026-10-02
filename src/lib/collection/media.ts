import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { get, head } from "@vercel/blob";
import { dataRoot, getMedia, putMedia } from "./store";
import type { Collection, StoredMedia } from "./types";
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
export function mediaAllowed(c: Collection, role: string, m: StoredMedia) {
  if (m.collectionId !== c.id) return false;
  if (role === "owner") return true;
  if (role === "recipient")
    return (
      m.role === "recipient" ||
      (c.status === "approved" &&
        c.chapters.some((ch) => ch.videoMediaId === m.id))
    );
  return false;
}
export async function saveLocalMedia(
  collectionId: string,
  role: "owner" | "recipient",
  file: File,
) {
  if (process.env.VERCEL)
    throw new Error("Use the private direct upload for cloud recordings.");
  const mime = file.type.split(";")[0];
  if (!mediaTypes.includes(mime)) throw new Error("Unsupported recording type");
  if (file.size > 512 * 1024 * 1024)
    throw new Error(
      "Save a shorter recording. Your local take is still available.",
    );
  const id = randomUUID();
  await mkdir(path.join(dataRoot, "media"), { recursive: true });
  const localPath = path.join(dataRoot, "media", id);
  await writeFile(localPath, new Uint8Array(await file.arrayBuffer()), {
    mode: 0o600,
  });
  const media: StoredMedia = {
    id,
    collectionId,
    role,
    mimeType: mime,
    originalName: file.name.slice(0, 200),
    bytes: file.size,
    createdAt: new Date().toISOString(),
    localPath,
  };
  await putMedia(media);
  return media;
}
export async function finalizeCloudMedia(id: string) {
  const m = await getMedia(id);
  if (!m) throw new Error("Upload record not found");
  const blob = await head(`collections/${m.collectionId}/${m.id}`);
  if (!blob.url.includes(".private.blob.vercel-storage.com/"))
    throw new Error("A private Blob store is required.");
  const next = {
    ...m,
    url: blob.url,
    mimeType: blob.contentType,
    bytes: blob.size,
  };
  await putMedia(next);
  return next;
}
export async function mediaBytes(m: StoredMedia): Promise<Uint8Array> {
  if (m.localPath) return new Uint8Array(await readFile(m.localPath));
  if (!m.url) throw new Error("Upload is not finished");
  const result = await get(m.url, { access: "private" });
  if (!result || result.statusCode !== 200)
    throw new Error("Recording could not be loaded");
  return new Uint8Array(await new Response(result.stream).arrayBuffer());
}
