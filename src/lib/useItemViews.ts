// src/lib/useItemViews.ts
//
// One batched request for the "seen by client" data of a page's shared items. Loads when
// the set of shared ids changes (so once with the page, and again only when something
// newly gets shared) - no polling, no per-row queries. null = not loaded / could not
// load, which the markers treat as "show nothing".
import { useEffect, useState } from "react";
import { fetchItemViews } from "./portalSeen";
import type { ItemViews } from "./portalSeen";

export function useItemViews(entityType: string, sharedIds: string[]): Record<string, ItemViews> | null {
  const [views, setViews] = useState<Record<string, ItemViews> | null>(null);
  const key = sharedIds.join(",");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!key) {
          if (!cancelled) setViews({});
          return;
        }
        const v = await fetchItemViews(entityType, key.split(","));
        if (!cancelled) setViews(v);
      } catch {
        if (!cancelled) setViews(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entityType, key]);

  return views;
}
