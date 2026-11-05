// src/lib/jamaica.ts — the 14 parishes of Jamaica, for address dropdowns.
export const PARISHES = [
  "Kingston", "St. Andrew", "St. Thomas", "Portland", "St. Mary", "St. Ann", "Trelawny",
  "St. James", "Hanover", "Westmoreland", "St. Elizabeth", "Manchester", "Clarendon", "St. Catherine",
] as const;

// Today's date as YYYY-MM-DD on this device's own clock (Jamaica time on a phone in Jamaica).
// toISOString() gives world time (UTC), which is already "tomorrow" after 7 pm in Jamaica.
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
