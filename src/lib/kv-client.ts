import { kv as upstash } from "@vercel/kv";
import { createClient } from "redis";

/**
 * One key-value client for the whole app.
 *
 * REDIS_URL (Redis Cloud, or any standard Redis) takes priority. Without it the
 * app keeps using the Upstash REST settings (KV_REST_API_URL + KV_REST_API_TOKEN),
 * so a deployment can switch providers by changing settings only.
 *
 * Values are encoded exactly as @vercel/kv does: strings are stored as-is and
 * everything else as JSON, so Lua scripts and lock tokens behave the same on both.
 */
type SetOptions = { nx?: boolean; ex?: number };
type RedisClient = ReturnType<typeof createClient>;

export const usesRedisUrl = () => Boolean(process.env.REDIS_URL?.trim());
export const kvConfigured = () =>
  usesRedisUrl() ||
  Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

let connection: Promise<RedisClient> | undefined;
function redis() {
  if (!connection) {
    const client = createClient({
      url: process.env.REDIS_URL,
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries) =>
          retries > 5
            ? new Error("Redis reconnect limit reached")
            : Math.min(retries * 200, 2000),
      },
    });
    // Without a listener an emitted error would crash the process. Never log the URL.
    client.on("error", () => {});
    connection = client
      .connect()
      .then(() => client as RedisClient)
      .catch((error) => {
        connection = undefined;
        throw error;
      });
  }
  return connection;
}

const encode = (value: unknown) =>
  typeof value === "string" ? value : JSON.stringify(value);
function decode<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return value as unknown as T;
  }
}

export const kv = {
  async get<T>(key: string): Promise<T | null> {
    if (!usesRedisUrl()) return upstash.get<T>(key);
    return decode<T>(await (await redis()).get(key));
  },
  async set(key: string, value: unknown, options?: SetOptions) {
    if (!usesRedisUrl())
      return options
        ? upstash.set(key, value, options as never)
        : upstash.set(key, value);
    return (await redis()).set(key, encode(value), {
      ...(options?.nx ? { NX: true as const } : {}),
      ...(options?.ex ? { EX: options.ex } : {}),
    });
  },
  async keys(pattern: string): Promise<string[]> {
    if (!usesRedisUrl()) return upstash.keys(pattern);
    const client = await redis();
    const found: string[] = [];
    for await (const key of client.scanIterator({ MATCH: pattern, COUNT: 500 }))
      found.push(key);
    return found;
  },
  async del(...keys: string[]) {
    if (!usesRedisUrl()) return upstash.del(...keys);
    return keys.length ? (await redis()).del(keys) : 0;
  },
  async eval(script: string, keys: string[], args: unknown[]) {
    if (!usesRedisUrl()) return upstash.eval(script, keys, args);
    return (await redis()).eval(script, {
      keys,
      arguments: args.map((value) => String(value)),
    });
  },
};
