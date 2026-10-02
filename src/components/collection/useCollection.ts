"use client";
import { useCallback, useEffect, useState } from "react";
import type { CollectionView } from "@/lib/collection/types";
export function useCollection(id: string, accessKey: string) {
  const [collection, setCollection] = useState<CollectionView | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const endpoint = `/api/collection/${encodeURIComponent(id)}?key=${encodeURIComponent(accessKey)}`;
  const load = useCallback(async () => {
    try {
      const r = await fetch(endpoint, { cache: "no-store" });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setCollection(b.collection);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load this collection.",
      );
    }
  }, [endpoint]);
  useEffect(() => {
    void load();
  }, [load]);
  const act = async (body: unknown) => {
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
      setCollection(b.collection);
      return b.collection as CollectionView;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save. Please retry.",
      );
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { collection, error, busy, act, load, setError, endpoint };
}
