// src/lib/contractDocument.ts
//
// Date formatting for the shared contract document (src/components/ContractDocument.tsx), which both
// staff and the client portal render. Jamaica time; date-only values never shift a day.

// Date-only values (YYYY-MM-DD) are calendar dates and must not shift a day in Jamaica;
// full timestamps are shown in Jamaica time.
export function formatContractDate(d: unknown): string {
  if (!d) return "";
  const s = String(d);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const dt = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : new Date(s);
  if (isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: m ? "UTC" : "America/Jamaica",
  });
}

// "Sep 20, 2026, 8:07 PM" in Jamaica time (the year is always shown - this is a record).
export function formatJamaicaDateTimeFull(iso: unknown): string {
  if (!iso) return "";
  try {
    const dt = new Date(String(iso));
    if (isNaN(dt.getTime())) return "";
    return dt.toLocaleString("en-US", {
      timeZone: "America/Jamaica",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
