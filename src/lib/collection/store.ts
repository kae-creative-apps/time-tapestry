import {
  mkdir,
  readFile,
  writeFile,
  rename,
  open,
  unlink,
  readdir,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { serializeMetadata } from "../security/storage";
import { randomUUID } from "node:crypto";
import { kv } from "@vercel/kv";
import type { Collection, StoredMedia } from "./types";

export const dataRoot =
  process.env.COLLECTION_DATA_DIR ||
  path.join(process.cwd(), ".data", "collections");
const cloud = () =>
  Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
function safeId(id: string) {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(id)) throw new Error("Invalid identifier");
  return id;
}
function requireStorage() {
  if (process.env.VERCEL && !cloud()) {
    console.error(
      "Collection storage is unavailable. Configure KV_REST_API_URL and KV_REST_API_TOKEN.",
    );
    throw new Error(
      "We cannot open or save your stories right now. Keep this page open and try again.",
    );
  }
}
export async function readRecord<T>(key: string): Promise<T | null> {
  requireStorage();
  if (cloud()) return kv.get<T>(`collection-v2:${key}`);
  try {
    return JSON.parse(
      await readFile(path.join(dataRoot, `${key}.json`), "utf8"),
    ) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
export async function writeRecord(key: string, value: unknown) {
  const serialized = serializeMetadata(value);
  requireStorage();
  if (cloud()) {
    await kv.set(`collection-v2:${key}`, value);
    return;
  }
  await mkdir(dataRoot, { recursive: true });
  const temporary = path.join(dataRoot, `${key}.${randomUUID()}.tmp`);
  await writeFile(temporary, serialized, { mode: 0o600 });
  await rename(temporary, path.join(dataRoot, `${key}.json`));
}
export const getCollection = (id: string) => readRecord<Collection>(safeId(id));
export const putCollection = (c: Collection) => writeRecord(safeId(c.id), c);
export const getMedia = (id: string) =>
  readRecord<StoredMedia>(`media-${safeId(id)}`);
export const putMedia = (m: StoredMedia) =>
  writeRecord(`media-${safeId(m.id)}`, m);
export async function listCollections() {
  requireStorage();
  if (cloud()) {
    const keys = await kv.keys("collection-v2:*");
    const results = await Promise.all(
      keys
        .filter((k) => !k.includes(":lock:") && !k.includes(":media-"))
        .map((k) => kv.get<Collection>(k)),
    );
    return results.filter((v): v is Collection =>
      Boolean(v && v.schemaVersion === 2),
    );
  }
  await mkdir(dataRoot, { recursive: true });
  const files = await readdir(dataRoot);
  const results = await Promise.all(
    files
      .filter((f) => f.endsWith(".json") && !f.startsWith("media-"))
      .map((f) => readRecord<Collection>(f.slice(0, -5))),
  );
  return results.filter((v): v is Collection =>
    Boolean(v && v.schemaVersion === 2),
  );
}
/** Serialize a read/update/write, including creation, under the record's lock. */
export async function mutateRecord<T>(
  id: string,
  update: (record: T | null) => T | Promise<T>,
): Promise<T> {
  safeId(id);
  requireStorage();
  const token = randomUUID();
  const lockKey = `collection-v2:lock:${id}`;
  const lockFile = path.join(dataRoot, `${id}.lock`);
  let locked = false;
  const deadline = Date.now() + 10000;
  if (!cloud()) await mkdir(dataRoot, { recursive: true });
  while (!locked && Date.now() < deadline) {
    if (cloud())
      locked = Boolean(await kv.set(lockKey, token, { nx: true, ex: 60 }));
    else {
      try {
        const handle = await open(lockFile, "wx", 0o600);
        await handle.writeFile(
          JSON.stringify({ pid: process.pid, createdAt: Date.now() }),
        );
        await handle.close();
        locked = true;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        try {
          const lock = JSON.parse(await readFile(lockFile, "utf8"));
          let alive = true;
          try {
            process.kill(lock.pid, 0);
          } catch (err) {
            alive = (err as NodeJS.ErrnoException).code !== "ESRCH";
          }
          if (!alive) await unlink(lockFile).catch(() => {});
        } catch {
          const info = await stat(lockFile).catch(() => null);
          if (info && Date.now() - info.mtimeMs > 600000)
            await unlink(lockFile).catch(() => {});
        }
      }
    }
    if (!locked) await new Promise((r) => setTimeout(r, 50));
  }
  if (!locked) throw new Error("Another save is in progress. Please retry.");
  try {
    const current = await readRecord<T>(id);
    const next = await update(current);
    if (cloud()) {
      // A slow update must not overwrite a newer writer after its lease expires.
      const saved = await kv.eval(
        "if redis.call('get',KEYS[1]) == ARGV[1] then redis.call('set',KEYS[2],ARGV[2]); return 1 else return 0 end",
        [lockKey, `collection-v2:${id}`],
        [token, serializeMetadata(next)],
      );
      if (!saved) throw new Error("This save took too long. Please retry.");
    } else await writeRecord(id, next);
    return next;
  } finally {
    if (cloud())
      await kv.eval(
        "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",
        [lockKey],
        [token],
      );
    else await unlink(lockFile).catch(() => {});
  }
}

export async function mutateCollection(
  id: string,
  update: (c: Collection) => Collection | Promise<Collection>,
) {
  return mutateRecord<Collection>(id, async (c) => {
    if (!c) throw new Error("Your stories could not be found.");
    const next = await update(c);
    next.updatedAt = new Date().toISOString();
    return next;
  });
}
