// Stored file references (src/lib/storageRefsCore.ts) and the verify-photo edge function's pure logic (supabase/functions/verify-photo/logic.ts).
// Run:  npm run test:storage
import test from "node:test";
import assert from "node:assert/strict";
import { PRIVATE_FILES_BUCKET, needsSigning, parseStorageRef, privatePath, safeUploadName, toStoredRef } from "../../src/lib/storageRefsCore";
import { verifyPhotoInfo } from "../../src/lib/verifyPhotoCore";
import { isShowablePhotoPath, parsePhotoRequest, privatePhotoPath } from "../../supabase/functions/verify-photo/logic";

const CO = "813ffe22-b75c-49c5-b41e-3ab185e2724c";
const BASE = "https://julylfxbdwgekzqsxykb.supabase.co/storage/v1/object";

test("stored references: a bare path is a path in the private bucket; Supabase URLs give bucket and path (percent-decoding included)", () => {
  assert.deepEqual(parseStorageRef(`${CO}/workers/ids/1_id.jpg`), { bucket: "private-files", path: `${CO}/workers/ids/1_id.jpg` });
  assert.deepEqual(parseStorageRef(`/${CO}/receipts/x.jpg`), { bucket: "private-files", path: `${CO}/receipts/x.jpg` });
  assert.deepEqual(parseStorageRef(`${BASE}/sign/private-files/${CO}/receipts/1790-My%20Receipt%20%281%29.jpg?token=abc.def`), { bucket: "private-files", path: `${CO}/receipts/1790-My Receipt (1).jpg` });
  assert.deepEqual(parseStorageRef(`${BASE}/public/project-files/receipts/2026/06/x.jpg`), { bucket: "project-files", path: "receipts/2026/06/x.jpg" });
  assert.deepEqual(parseStorageRef(`${BASE}/public/company-logos/${CO}/logo/1_logo.png?t=3`), { bucket: "company-logos", path: `${CO}/logo/1_logo.png` });
  for (const v of [null, undefined, "", "   ", 42, "data:image/png;base64,AAAA", "blob:https://x/1", "https://elsewhere.test/pic.jpg"]) assert.equal(parseStorageRef(v as string), null, String(v));
});

test("stored references: what gets SAVED is a path for the private bucket (a signed URL is turned back into its path), anything else is kept as it is", () => {
  const path = `${CO}/workers/passport/1_passport.jpg`;
  assert.equal(toStoredRef(path), path);
  assert.equal(toStoredRef(`${BASE}/sign/private-files/${path}?token=abc`), path, "an edit that round-trips a signed URL stores the path again");
  assert.equal(toStoredRef(`${BASE}/public/private-files/${path}`), path);
  assert.equal(toStoredRef(`${BASE}/public/project-photos/x/y.jpg`), `${BASE}/public/project-photos/x/y.jpg`, "public photos keep their URL");
  assert.equal(toStoredRef("data:image/png;base64,AAAA"), "data:image/png;base64,AAAA");
  assert.equal(toStoredRef(""), null); assert.equal(toStoredRef(null), null); assert.equal(toStoredRef(undefined), null); assert.equal(toStoredRef("   "), null);
});

test("stored references: only private-bucket references are signed; logos, project photos and external pictures (portal, receipts, verify header, PDFs) are used as they are", () => {
  assert.equal(needsSigning(`${CO}/workers/ids/1_id.jpg`), true);
  assert.equal(needsSigning(`${BASE}/sign/private-files/${CO}/receipts/x.jpg?token=t`), true);
  assert.equal(needsSigning(`${BASE}/public/project-files/receipts/x.jpg`), true, "a legacy project-files link must be signed now that the bucket is private");
  for (const v of [`${BASE}/public/company-logos/${CO}/logo/1_logo.png`, `${BASE}/public/company-assets/${CO}/signature/1_signature.png`, `${BASE}/public/project-photos/${CO}/1.jpg`, "https://elsewhere.test/x.png", "data:image/png;base64,AAAA", "", null])
    assert.equal(needsSigning(v), false, String(v));
});

test("uploads: paths start with the company id, and a file name carries no personal data (the national ID number used to be in it)", () => {
  assert.equal(privatePath(CO, "workers/ids", "a.jpg"), `${CO}/workers/ids/a.jpg`);
  const a = safeUploadName("id"), b = safeUploadName("id");
  assert.match(a, /^\d{13}_[a-z0-9]{1,6}_id\.jpg$/);
  assert.notEqual(a, b);
  assert.equal(PRIVATE_FILES_BUCKET, "private-files");
});

// ── the verify-photo function ─────────────────────────────────────────────────────────────────────────────────────────────────
test("verify-photo: only a 12-hex code or a worker uuid is a request", () => {
  assert.deepEqual(parsePhotoRequest({ code: "F14AFB95658C " }), { kind: "code", code: "f14afb95658c" });
  assert.deepEqual(parsePhotoRequest({ workerId: CO }), { kind: "worker", id: CO });
  for (const bad of [null, undefined, "x", {}, { code: "short" }, { code: "f14afb95658cff" }, { code: "g14afb95658c" }, { workerId: "not-a-uuid" }, { code: 5 }, { code: "f14afb95658c'; drop" }]) assert.equal(parsePhotoRequest(bad), null, JSON.stringify(bad));
});

test("verify-photo: the stored value (a path, or an old signed / public URL of the private bucket) gives the path; other buckets and external pictures give nothing", () => {
  const path = `${CO}/staff-photos/${CO}.png`;
  assert.equal(privatePhotoPath(path), path);
  assert.equal(privatePhotoPath(`${BASE}/sign/private-files/${path}?token=abc`), path);
  assert.equal(privatePhotoPath(`${BASE}/public/project-files/staff-photos/x.png`), null);
  for (const v of [null, "", "https://elsewhere.test/a.png", "data:image/png;base64,AA", `${CO}/../other/x.jpg`]) assert.equal(privatePhotoPath(v), null, String(v));
});

test("verify-photo: only a staff / passport photo of a company folder is ever handed out - never an ID scan, receipt, statement or signature", () => {
  assert.equal(isShowablePhotoPath(`${CO}/staff-photos/u.png`), true);
  assert.equal(isShowablePhotoPath(`${CO}/workers/passport/p.jpg`), true);
  for (const p of [`${CO}/workers/ids/id.jpg`, `${CO}/field-payments/ids/id.jpg`, `${CO}/receipts/r.jpg`, `${CO}/bank-statements/s.pdf`, `${CO}/user-signatures/s.png`, `${CO}/contract-signatures/s.png`,
                   `${CO}/workers/x.jpg`, "staff-photos/u.png", "workers/passport/p.jpg", `not-a-company/staff-photos/u.png`, `${CO}/staff-photos`, ""])
    assert.equal(isShowablePhotoPath(p), false, p);
});

// ── the front end before and after migration 20260948 ──────────────────────────────────────────────────────────────────────────
test("verify pages: work with the database function before the migration (photo_url) and after it (has_photo)", () => {
  const signed = `${BASE}/sign/private-files/${CO}/workers/passport/1_passport.jpg?token=abc`;
  // after: has_photo only
  assert.deepEqual(verifyPhotoInfo({ has_photo: true }), { hasPhoto: true, legacyUrl: null });
  assert.deepEqual(verifyPhotoInfo({ has_photo: false }), { hasPhoto: false, legacyUrl: null });
  // before: photo_url only - an old long-lived signed URL is a usable fallback; a plain storage path (a photo saved by the new app) is not a link a browser can show
  assert.deepEqual(verifyPhotoInfo({ photo_url: signed }), { hasPhoto: true, legacyUrl: signed });
  assert.deepEqual(verifyPhotoInfo({ photo_url: `${CO}/workers/passport/1_passport.jpg` }), { hasPhoto: true, legacyUrl: null });
  assert.deepEqual(verifyPhotoInfo({ photo_url: null }), { hasPhoto: false, legacyUrl: null });
  assert.deepEqual(verifyPhotoInfo({ photo_url: "  " }), { hasPhoto: false, legacyUrl: null });
  // both present (never, but): has_photo decides
  assert.deepEqual(verifyPhotoInfo({ has_photo: false, photo_url: signed }), { hasPhoto: false, legacyUrl: signed });
  assert.deepEqual(verifyPhotoInfo(null), { hasPhoto: false, legacyUrl: null });
  assert.deepEqual(verifyPhotoInfo(undefined), { hasPhoto: false, legacyUrl: null });
  // http (not https) pictures are never used
  assert.equal(verifyPhotoInfo({ photo_url: "http://x.test/a.jpg" }).legacyUrl, null);
});

test("the verify-photo function accepts what the database holds before and after the migration (a path, or an old signed / public URL of the private bucket)", () => {
  const path = `${CO}/workers/passport/1_passport.jpg`;
  assert.equal(privatePhotoPath(path), path);
  assert.equal(privatePhotoPath(`${BASE}/sign/private-files/${path}?token=abc`), path);
  assert.equal(isShowablePhotoPath(path), true);
});

test("the app reads both forms of stored value (path or URL) and saves paths: a URL that is read back and saved again becomes the same path", () => {
  const path = `${CO}/receipts/2026/10/1790_receipt.jpg`;
  const asUrl = `${BASE}/sign/private-files/${path}?token=abc.def`;
  assert.deepEqual(parseStorageRef(asUrl), parseStorageRef(path));
  assert.equal(toStoredRef(asUrl), toStoredRef(path));
  assert.equal(needsSigning(asUrl), needsSigning(path));
});
