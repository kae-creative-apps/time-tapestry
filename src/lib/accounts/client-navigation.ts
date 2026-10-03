const returnKey = "time-tapestry:account-return:v1";
export const COLLECTION_RETURN_TTL_MS = 30 * 60 * 1000;
type TabStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** A capability stays on this origin and can open only a collection or interview. */
export function privateCollectionPath(
  input: unknown,
  origin: string,
): string | null {
  if (typeof input !== "string" || input.length > 4096) return null;
  const value = input.trim();
  if (!value || /[\\\u0000-\u0020\u007f]/.test(value) || value.startsWith("//"))
    return null;
  const rawPath = value.startsWith("/")
    ? value.split(/[?#]/)[0]
    : /^https?:\/\/[^/?#]+([^?#]*)/i.exec(value)?.[1];
  // Check the raw path as well: URL parsing otherwise normalizes dot segments.
  const route = /^\/(record|collection)\/([a-zA-Z0-9_-]{8,80})(\/review)?\/?$/;
  const matched = rawPath && route.exec(rawPath);
  if (!matched || (matched[3] && matched[1] !== "collection")) return null;
  try {
    const base = new URL(origin);
    const url = new URL(value, base.origin);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.origin !== base.origin ||
      url.username ||
      url.password ||
      !route.test(url.pathname) ||
      url.searchParams.getAll("key").length !== 1
    )
      return null;
    const key = url.searchParams.get("key") || "";
    if (!/^[a-zA-Z0-9_-]{1,512}$/.test(key)) return null;
    return `/${matched[1]}/${matched[2]}?key=${encodeURIComponent(key)}`;
  } catch {
    return null;
  }
}

export function clearCollectionReturn(storage: TabStorage) {
  try {
    storage.removeItem(returnKey);
  } catch {
    /* Storage may be disabled. */
  }
}

/** Call only on a same-tab My stories click from a successfully authorized portal. */
export function rememberCollectionReturn(
  storage: TabStorage,
  input: string,
  origin: string,
  now = Date.now(),
) {
  const path = privateCollectionPath(input, origin);
  if (!path) return;
  try {
    storage.setItem(
      returnKey,
      JSON.stringify({ path, expiresAt: now + COLLECTION_RETURN_TTL_MS }),
    );
  } catch {
    /* Navigation still works when session storage is unavailable. */
  }
}

export function readCollectionReturn(
  storage: TabStorage,
  origin: string,
  now = Date.now(),
) {
  try {
    const raw = storage.getItem(returnKey);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (
      value &&
      typeof value === "object" &&
      "path" in value &&
      "expiresAt" in value
    ) {
      const path = privateCollectionPath(value.path, origin);
      const expiresAt = value.expiresAt;
      if (
        path &&
        typeof expiresAt === "number" &&
        Number.isFinite(expiresAt) &&
        expiresAt > now &&
        expiresAt <= now + COLLECTION_RETURN_TTL_MS
      )
        return { path, expiresAt };
    }
  } catch {
    /* Corrupt or blocked storage must not become a navigation target. */
  }
  clearCollectionReturn(storage);
  return null;
}
