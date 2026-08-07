// src/lib/import/parseFile.ts
//
// Reads an uploaded .csv/.xlsx/.xls file into a flat { headers, rows }
// shape, fully client-side (no upload to storage, no backend round-trip —
// the file never leaves the browser until the resulting DB inserts do).
// Uses SheetJS (xlsx) since it's the one library that handles both CSV and
// real Excel workbooks through a single API — see the "Existing tooling
// check" from the planning round: nothing in this app already does
// structured-file *reading* (only ad hoc CSV *writing*), so this is a new
// dependency, not a reuse situation.
//
// IMPORTANT — package.json intentionally installs this from SheetJS's own
// CDN tarball (https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz), NOT
// `npm install xlsx` / the plain npm registry. The registry's latest
// publish, xlsx@0.18.5, has two long-standing unpatched advisories
// (prototype pollution + a ReDoS in the parser) — SheetJS fixed both
// upstream but stopped publishing newer builds to npm, so their own CDN
// tarball is the only place to get the patched version under this package
// name. This is SheetJS's own documented install method, not a workaround.
// DO NOT "helpfully" change the package.json dependency back to a plain
// semver/`"^x.y.z"` entry — that silently reverts to the vulnerable
// registry build. npm's lockfile pins the tarball's resolved URL + a
// sha512 integrity hash, so `npm ci`/`npm install` stay reproducible; if
// SheetJS ever moves to publishing patched versions on the registry again,
// switching back is a deliberate decision to make then, not an incidental
// cleanup now.
import * as XLSX from "xlsx";
import type { ParsedFile } from "./types";

const MAX_ROWS = 5000; // sane guardrail for a client-side, single-pass import — a real Zoho export is nowhere near this

export async function parseImportFile(file: File): Promise<ParsedFile> {
  const buf = await file.arrayBuffer();
  const workbook = XLSX.read(buf, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The file has no sheets/data.");
  const sheet = workbook.Sheets[sheetName];

  // header:1 -> array-of-arrays (first row is the header row), raw so
  // dates/numbers come through as their real type where possible, falling
  // back to strings for anything sheet_to_json can't infer cleanly.
  const raw = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, blankrows: false, defval: "" });
  if (raw.length === 0) throw new Error("The file is empty.");

  const headerRow = raw[0].map(h => String(h ?? "").trim());
  const headers = headerRow.filter(h => h.length > 0);
  if (headers.length === 0) throw new Error("Couldn't find a header row — is the first row column titles?");

  const dataRows = raw.slice(1);
  if (dataRows.length > MAX_ROWS) {
    throw new Error(`This file has ${dataRows.length} rows — the import wizard handles up to ${MAX_ROWS} at a time. Split it into smaller files.`);
  }

  const rows: Record<string, string>[] = dataRows
    // Skip fully blank rows (trailing blank lines are common in exports)
    .filter(r => r.some(cell => String(cell ?? "").trim().length > 0))
    .map(r => {
      const row: Record<string, string> = {};
      headerRow.forEach((h, i) => {
        if (!h) return; // column had no header — ignore that cell entirely
        const cell = r[i];
        row[h] = cell == null ? "" : String(cell).trim();
      });
      return row;
    });

  return { fileName: file.name, headers, rows };
}
