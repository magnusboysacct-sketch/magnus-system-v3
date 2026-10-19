// supabase/functions/_shared/workerPortal.ts — the pure parts of the worker portal edge functions (no Deno, no network), so they can be tested (npm run test:workerportal).
// src/lib/workerPortalPin.ts repeats the PIN rules for the screens; scripts/tests/workerPortal.test.ts checks the two agree.

export const PIN_LENGTH = 6;
export const GENERIC_LOGIN_ERROR = "Employee number or PIN is wrong. If this keeps happening, ask the office.";
export const STAFF_PORTAL_ROLES = ["director", "admin", "secretary"] as const;

export function canManageWorkerPortal(role: string | null | undefined): boolean {
  return !!role && (STAFF_PORTAL_ROLES as readonly string[]).includes(role);
}

// "mbw-7", " MBW 007 ", "MBW007", "VWW2-001" -> "MBW-007" / "VWW2-001". null when it cannot be a worker number.
// A number is 2-5 letters, an optional digit or two, a hyphen and the digits (at least 3, as the database writes them).
export function normalizeEmployeeNumber(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toUpperCase().replace(/[\s_‐-―−]+/g, "-");
  if (!s || s.length > 16) return null;
  let m = s.match(/^([A-Z]{2,5}[0-9]{0,2})-([0-9]{1,6})$/);
  if (!m) {
    const bare = s.match(/^([A-Z]{2,5})([0-9]{3,6})$/);      // "MBW007": no hyphen typed
    if (!bare) return null;
    m = [bare[0], bare[1], bare[2]] as unknown as RegExpMatchArray;
  }
  const digits = m[2].length < 3 ? m[2].padStart(3, "0") : m[2];
  return `${m[1]}-${digits}`;
}

export const isPinShape = (pin: unknown): pin is string => typeof pin === "string" && /^[0-9]{6}$/.test(pin);

// PINs nobody may choose (and the office never hands out): all the same digit, a straight run up or down, a short pattern repeated, and the usual favourites.
const COMMON = new Set(["123456", "654321", "000000", "123123", "121212", "112233", "123321", "111222", "222111", "696969", "101010", "100000", "010101", "159753", "147258", "123654", "456789", "012345", "098765"]);
export function weakPinReason(pin: string): string | null {
  if (!isPinShape(pin)) return "The PIN must be exactly 6 digits.";
  const d = pin.split("").map(Number);
  if (d.every((x) => x === d[0])) return "That PIN is too easy to guess (the same digit six times). Choose another.";
  const step = d[1] - d[0];
  if ((step === 1 || step === -1) && d.every((x, i) => i === 0 || x - d[i - 1] === step)) return "That PIN is too easy to guess (a straight run of digits). Choose another.";
  for (const n of [2, 3]) {
    const unit = pin.slice(0, n);
    if (unit.repeat(6 / n) === pin) return "That PIN is too easy to guess (a short pattern repeated). Choose another.";
  }
  if (new Set(d).size <= 2) return "That PIN is too easy to guess (only two different digits). Choose another.";
  if (COMMON.has(pin)) return "That PIN is too easy to guess. Choose another.";
  return null;
}
export const isStrongPin = (pin: unknown): pin is string => isPinShape(pin) && weakPinReason(pin) === null;

// A random temporary PIN that passes the rules. `randomInt(n)` must return a uniform integer in [0, n) from a secure source.
export function generateTempPin(randomInt: (n: number) => number): string {
  for (let i = 0; i < 1000; i++) {
    let pin = "";
    for (let k = 0; k < PIN_LENGTH; k++) pin += String(randomInt(10));
    if (isStrongPin(pin)) return pin;
  }
  throw new Error("Could not generate a PIN");
}

// The caller's address for the per-IP limit: the first of x-forwarded-for, else cf-connecting-ip, else "unknown". Only a HASH of it is ever stored.
export function clientIp(headers: { get(name: string): string | null }): string {
  const xff = headers.get("x-forwarded-for");
  const first = (xff ?? "").split(",")[0]?.trim();
  return first || headers.get("cf-connecting-ip")?.trim() || "unknown";
}
