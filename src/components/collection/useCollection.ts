"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CollectionView } from "@/lib/collection/types";

export function useCollection(id: string, accessKey: string) {
  const [collection, setCollection] = useState<CollectionView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);
  const pending = useRef(0);
  const mounted = useRef(true);
  const endpoint = `/api/collection/${encodeURIComponent(id)}?key=${encodeURIComponent(accessKey)}`;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const version = ++latest.current;
      try {
        const r = await fetch(endpoint, { cache: "no-store", signal });
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
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
        const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
        if (mounted.current && version === latest.current)
          setCollection(b.collection);
        return b.collection as CollectionView;
      } catch (e) {
        if (mounted.current)
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
