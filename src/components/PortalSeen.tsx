// src/components/PortalSeen.tsx
//
// Small read-only markers showing whether the client has opened a shared item.
// Only shared items get one (sharedAt is null for anything not sent), and nothing is
// shown when the view data could not be loaded.
import React from "react";
import { formatJamaicaDay, formatJamaicaShort, seenStatus } from "../lib/portalSeen";
import type { ItemViews } from "../lib/portalSeen";

export function SeenBadge({ sharedAt, viewsMap, id }: {
  sharedAt: string | null | undefined;
  viewsMap: Record<string, ItemViews> | null;
  id: string;
}) {
  if (!sharedAt || !viewsMap) return null;
  const s = seenStatus(sharedAt, viewsMap[id]);
  if (!s) return null;
  return s.seen ? (
    <span
      title={`Opened ${formatJamaicaShort(s.openedAt)} · ${s.viewCount} view${s.viewCount === 1 ? "" : "s"} in total`}
      className="ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
    >
      Opened {formatJamaicaDay(s.openedAt)}
    </span>
  ) : (
    <span
      title="The client has not opened this since it was sent"
      className="ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400"
    >
      Not opened yet
    </span>
  );
}

// Longer form for detail views: "First opened Sep 20, 8:07 PM · opened 3 times" / "Not opened yet".
export function SeenDetail({ sharedAt, viewsMap, id, className }: {
  sharedAt: string | null | undefined;
  viewsMap: Record<string, ItemViews> | null;
  id: string;
  className?: string;
}) {
  if (!sharedAt || !viewsMap) return null;
  const s = seenStatus(sharedAt, viewsMap[id]);
  if (!s) return null;
  const firstSinceSend = s.seen && s.openedAt === s.firstSeenAt;
  return (
    <div className={className}>
      {s.seen
        ? `${firstSinceSend ? "First opened" : "Last opened"} ${formatJamaicaShort(s.openedAt)} · opened ${s.viewCount} time${s.viewCount === 1 ? "" : "s"}`
        : "Not opened yet"}
    </div>
  );
}
