"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CollectionView } from "@/lib/collection/types";
import { collectionRequest } from "@/lib/collection/client-request";

export function useCollection(id: string, accessKey: string) {
  const [collection, setCollection] = useState<CollectionView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);
  const pending = useRef(0);
  const mounted = useRef(true);
  const current = useRef(collection);
  current.current = collection;
  const endpoint = `/api/collection/${encodeURIComponent(id)}?key=${encodeURIComponent(accessKey)}`;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      // A background status poll must not outrank an in-flight save with an older snapshot.
      if (pending.current > 0) return current.current;
      const version = ++latest.current;
      if (!current.current) setError("");
      try {
        const b = await collectionRequest(endpoint, { signal });
        if (mounted.current && version === latest.current) {
          setCollection(b.collection);
          setError("");
        }
        return b.collection as CollectionView;
      } catch (e) {
        if (!signal?.aborted && mounted.current && version === latest.current)
          setError(
            e instanceof Error
              ? e.message
              : "Could not open these stories. Please try again.",
          );
        return null;
      }
    },
    [endpoint],
  );

  useEffect(() => {
    const controller = new AbortController();
    setCollection(null);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const act = useCallback(
    async (body: unknown) => {
      const version = ++latest.current;
      pending.current += 1;
      setBusy(true);
      setError("");
      try {
        const b = await collectionRequest(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (mounted.current && version === latest.current)
          setCollection(b.collection);
        return b.collection as CollectionView;
      } catch (e) {
        if (mounted.current && version === latest.current)
          setError(
            e instanceof Error ? e.message : "Could not save. Please retry.",
          );
        return null;
      } finally {
        pending.current -= 1;
        if (mounted.current) setBusy(pending.current > 0);
      }
    },
    [endpoint],
  );
  return { collection, error, busy, act, load, setError, endpoint };
}
