// Worker numbers (src/lib/workerNumber.ts) and the name matching for field payments (src/lib/workerNameMatch.ts).
// Run:  npm run test:workernumber
import test from "node:test";
import assert from "node:assert/strict";
import { defaultWorkerPrefix, formatWorkerNumber, normalizeWorkerPrefix, previewWorkerNumber, validateWorkerPrefix } from "../../src/lib/workerNumber";
import { levenshtein, matchWorkerName, normalizeName, similarity } from "../../src/lib/workerNameMatch";

test("the default prefix is the initials + W, the same as worker_number_prefix_from_name() in the migration", () => {
  // the SAME table is checked against the SQL function in the migration's in-memory test
  const table: Array<[string, string]> = [["Yaad and aboard", "YAW"], ["House Busniess", "HBW"], ["VERON'S", "VW"], ["Veron williams", "VWW"], ["Magnus Boys Construction Limited", "MBCW"],
    ["Magnus Boy’s System Ltd.", "MBSW"], ["The Big Red Building Company Of Kingston", "BRBKW"], ["Acme", "AW"], ["  ", "WK"], ["123 456", "WK"], ["Ltd", "WK"],
    ["Ünï Cödé", "NCDW"], ["a b c d e f", "ABCDW"], ["Smith & Sons Ltd", "SSW"]];
  for (const [name, want] of table) assert.equal(defaultWorkerPrefix(name), want, name);
  assert.equal(defaultWorkerPrefix(null), "WK");
  for (const [name] of table) assert.match(defaultWorkerPrefix(name), /^[A-Z]{2,5}$/, name);
});

test("a prefix is made of 2-5 capital letters, fixed as it is typed, with a message when it is not", () => {
  assert.equal(normalizeWorkerPrefix("mbw"), "MBW");
  assert.equal(normalizeWorkerPrefix(" m-b w1 "), "MBW");
  assert.equal(normalizeWorkerPrefix("abcdefgh"), "ABCDE");
  assert.equal(validateWorkerPrefix("MBW"), null);
  assert.equal(validateWorkerPrefix("AB"), null);
  assert.equal(validateWorkerPrefix("ABCDE"), null);
  for (const bad of ["", "M", "mbw", "ABCDEF", "MB1", "MB-W"]) assert.match(String(validateWorkerPrefix(bad)), /prefix/, bad);
});

test("numbers are zero padded to 3 digits and grow past 999", () => {
  assert.equal(formatWorkerNumber("MBW", 1), "MBW-001");
  assert.equal(formatWorkerNumber("MBW", 42), "MBW-042");
  assert.equal(formatWorkerNumber("MBW", 999), "MBW-999");
  assert.equal(formatWorkerNumber("MBW", 1000), "MBW-1000");
  assert.equal(formatWorkerNumber("MBW", 12345), "MBW-12345");
  assert.equal(previewWorkerNumber("MBW"), "MBW-001");
  assert.equal(previewWorkerNumber("mb"), "ABC-001", "an invalid prefix previews with a placeholder");
});

const W = (id: string, first: string, last: string) => ({ id, first_name: first, last_name: last });
const WORKERS = [W("w1", "Enron", "Williams"), W("w2", "Roy", "Brown"), W("w3", "Roy", "Browne"), W("w4", "Marcia", "Campbell"), W("w5", "Delroy", "Clarke"), W("w6", "Jon", "Smith"), W("w7", "John", "Smith"), W("w8", "Ann", "O'Neil")];

test("names are normalised: capitals, spaces, punctuation and accents do not matter", () => {
  assert.equal(normalizeName("  Enron   WILLIAMS "), "enron williams");
  assert.equal(normalizeName("Ann O’Neil"), "ann oneil");
  assert.equal(normalizeName("Ann O'Neil."), "ann oneil");
  assert.equal(normalizeName("Zoë-Ann"), "zoe ann");
  assert.equal(normalizeName(null), "");
  assert.equal(levenshtein("kitten", "sitting"), 3);
  assert.equal(similarity("abc", "abc"), 1);
});

test("exact, then case / space, then another word order, then a close spelling", () => {
  assert.deepEqual(matchWorkerName("Enron Williams", WORKERS), { type: "exact", workerId: "w1", confidence: 1, candidates: ["w1"], note: "" });
  const n = matchWorkerName("  enron   williams ", WORKERS); assert.equal(n.type, "normalized"); assert.equal(n.workerId, "w1"); assert.equal(n.confidence, 0.95);
  assert.equal(matchWorkerName("ANN ONEIL", WORKERS).type, "normalized");
  const r = matchWorkerName("Williams, Enron", WORKERS); assert.equal(r.type, "reordered"); assert.equal(r.workerId, "w1"); assert.equal(r.confidence, 0.9);
  const f = matchWorkerName("Marcia Campbel", WORKERS); assert.equal(f.type, "fuzzy"); assert.equal(f.workerId, "w4"); assert.ok(f.confidence >= 0.82 && f.confidence < 0.9);
  const f2 = matchWorkerName("Delroy Clark", WORKERS); assert.equal(f2.type, "fuzzy"); assert.equal(f2.workerId, "w5");
});

test("two workers that fit equally well give no proposal", () => {
  const same = [W("a", "Roy", "Brown"), W("b", "ROY", "BROWN")];
  const x = matchWorkerName("Roy Brown", same); assert.equal(x.type, "exact"); assert.equal(x.workerId, "a"); // only one is written exactly like that
  const twins = [W("a", "Roy", "Brown"), W("b", "Roy", "Brown")];
  const t = matchWorkerName("Roy Brown", twins); assert.equal(t.type, "ambiguous"); assert.equal(t.workerId, null); assert.deepEqual(t.candidates, ["a", "b"]);
  const close = matchWorkerName("Roy Browns", WORKERS); assert.equal(close.type, "ambiguous", "Brown and Browne are equally close");
  assert.equal(matchWorkerName("Roy Browm", WORKERS).workerId, "w2", "clearly closer to Brown than to Browne: proposed"); assert.equal(close.workerId, null); assert.deepEqual(close.candidates.sort(), ["w2", "w3"]);
  const js = matchWorkerName("Joh Smith", WORKERS); assert.equal(js.type, "ambiguous", "Jon / John Smith");
});

test("no match when nothing is close; a single first or last name is only a hint", () => {
  const none = matchWorkerName("Peter Parker", WORKERS); assert.equal(none.type, "none"); assert.equal(none.workerId, null); assert.equal(none.confidence, 0);
  const hint = matchWorkerName("Marcia", WORKERS); assert.equal(hint.type, "none"); assert.equal(hint.workerId, null); assert.deepEqual(hint.candidates, ["w4"]); assert.match(hint.note, /Marcia Campbell/);
  assert.equal(matchWorkerName("", WORKERS).type, "none");
  assert.equal(matchWorkerName(null, WORKERS).type, "none");
  assert.equal(matchWorkerName("Anyone", []).type, "none");
});
