// supabase/functions/_shared/portalPassword.ts
//
// Client-portal password hashing, shared by client-portal-login and client-password-reset.
//
// New format: "pbkdf2_sha256$<iterations>$<salt b64>$<hash b64>" — PBKDF2-SHA256 with a random 16-byte salt per password.
// The iteration count travels inside each hash, so it can be raised later without breaking existing passwords.
//
// Legacy format: hex SHA-256 of (password + "magnus_portal_2026") — one shared salt for every user. verifyPassword() still
// accepts it and reports needsRehash, and the login function then replaces it with the new format. No-one has to reset.

const SCHEME = "pbkdf2_sha256";
const ITERATIONS = 600_000; // OWASP 2023 recommendation for PBKDF2-SHA256 (~0.3 s per hash)
const SALT_BYTES = 16;
const HASH_BITS = 256;
const LEGACY_SALT = "magnus_portal_2026";

const enc = new TextEncoder();

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Compares without stopping at the first difference, so timing doesn't reveal how much of a hash matched.
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, HASH_BITS);
  return new Uint8Array(bits);
}

async function legacyHash(password: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(password + LEGACY_SALT));
  return hex(new Uint8Array(digest));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `${SCHEME}$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

export type VerifyResult = { ok: boolean; needsRehash: boolean };

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<VerifyResult> {
  const fail = { ok: false, needsRehash: false };
  if (!stored || typeof stored !== "string") return fail;

  if (stored.startsWith(`${SCHEME}$`)) {
    const parts = stored.split("$");
    if (parts.length !== 4) return fail;
    const iterations = Number(parts[1]);
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10_000_000) return fail;
    let salt: Uint8Array, expected: Uint8Array;
    try {
      salt = fromB64(parts[2]);
      expected = fromB64(parts[3]);
    } catch {
      return fail;
    }
    const actual = await pbkdf2(password, salt, iterations);
    const ok = equalBytes(actual, expected);
    return { ok, needsRehash: ok && iterations < ITERATIONS };
  }

  // Legacy shared-salt hash (64 hex chars)
  if (/^[0-9a-f]{64}$/i.test(stored)) {
    const actual = await legacyHash(password);
    const ok = equalBytes(enc.encode(actual), enc.encode(stored.toLowerCase()));
    return { ok, needsRehash: ok };
  }

  return fail;
}

// Strict enough to keep the address safe inside a PostgREST filter (no commas, brackets, quotes or spaces) while accepting
// ordinary addresses. Callers must reject anything that fails this before using the address in a query.
export function normalizeEmail(raw: unknown): string | null {
  const email = String(raw ?? "").trim().toLowerCase();
  if (email.length > 254) return null;
  if (!/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(email)) return null;
  return email;
}

export function generateToken(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

// Constant-time string comparison for tokens
export function equalStrings(a: string, b: string): boolean {
  return equalBytes(enc.encode(a), enc.encode(b));
}
