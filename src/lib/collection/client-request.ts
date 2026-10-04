/** Bounded requests keep a stalled connection from trapping a family in a loading state. */
export async function collectionRequest<T = any>(
  url: string,
  options: RequestInit = {},
  timeoutMs = options.method === "POST" ? 90000 : 20000,
): Promise<T> {
  const controller = new AbortController();
  const parent = options.signal;
  const abort = () => controller.abort(parent?.reason);
  let timedOut = false;
  if (parent?.aborted) abort();
  else parent?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      ...options,
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        typeof body?.error === "string"
          ? body.error
          : "We could not reach your stories. Please try again.",
      );
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error(
        "We could not read the response. Your saved stories have not been removed. Please try again.",
      );
    return body as T;
  } catch (error) {
    if (timedOut)
      throw new Error(
        options.method === "POST"
          ? "This is taking longer than expected. Your change may already be saved. Check your collection before trying again."
          : "Your stories are taking longer to open. Check your connection and try again.",
      );
    if (!parent?.aborted && error instanceof TypeError)
      throw new Error(
        "We could not connect. Your saved stories are still there. Check your internet connection and try again.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", abort);
  }
}
