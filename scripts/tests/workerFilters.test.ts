// Workers page search and category filter (src/lib/workerFilters.ts, src/pages/WorkersPage.tsx).
// Run:  npm run test:workerfilters
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  NO_CATEGORY, NO_FILTERS, buildCategoryOptions, buildTypeOptions, categoryKey, filterWorkers, filtersActive, matchesSearch, messyCategories, normText,
  type FilterableWorker,
} from "../../src/lib/workerFilters";

const W = (first: string, last: string, employee_id: string, extra: Partial<FilterableWorker> = {}): FilterableWorker =>
  ({ first_name: first, last_name: last, employee_id, worker_type: "subcontractor", status: "active", job_title: null, phone: null, email: null, ...extra });

const john = W("John", "Brown", "MBW-002", { phone: "876-555-0142", job_title: "Mason" });
const mary = W("Mary", "Anne Clarke", "MBW-010", { phone: "(876) 555 0199", job_title: "mason " });
const kit = W("Kit", "", "MBW-011", { status: "inactive", job_title: "MASON" });
const sam = W("Sam", "Reid", "MBW-102", { worker_type: "employee", job_title: "Carpenter", email: "sam@x.test" });
const none = W("Ann", "Lee", "VWW2-001", { job_title: "  " });
const all = [john, mary, kit, sam, none];
const names = (ws: FilterableWorker[]) => ws.map((w) => w.first_name).join(",");

test("normText: case and extra spaces do not matter", () => {
  assert.equal(normText("  MaSon   Smith "), "mason smith");
  assert.equal(normText(null), "");
});

test("search by first name, last name, full name, part of a name, any case", () => {
  for (const q of ["john", "JOHN", "Brown", "brown", "john brown", "  John    Brown ", "brown john", "joh", "rown"]) assert.ok(matchesSearch(john, q), q);
  assert.ok(matchesSearch(mary, "anne clarke") && matchesSearch(mary, "mary anne"), "a two-word last name");
  assert.ok(!matchesSearch(john, "mary") && !matchesSearch(john, "john smith"));
  assert.ok(matchesSearch(kit, "kit") && matchesSearch(kit, "kit "), "a worker with no last name");
});

test("search by worker number: with or without the dash, prefix or leading zeros", () => {
  for (const q of ["MBW-002", "mbw-002", "mbw002", "MBW 002", "002", "2", "w-002"]) assert.ok(matchesSearch(john, q), q);
  assert.ok(!matchesSearch(mary, "mbw-002") && !matchesSearch(mary, "002") && !matchesSearch(mary, "2"));
  assert.ok(matchesSearch(none, "vww2-001") && matchesSearch(none, "vww2001") && matchesSearch(none, "1"));
  assert.deepEqual(filterWorkers(all, { ...NO_FILTERS, search: "mbw" }).length, 4, "the prefix finds the company's workers");
  assert.equal(names(filterWorkers(all, { ...NO_FILTERS, search: "mbw-01" })), "Mary,Kit", "a partial number");
  assert.equal(names(filterWorkers(all, { ...NO_FILTERS, search: "mbw-10" })), "Sam", "…is matched as typed (MBW-102), not as MBW-010");
});

test("search by phone: digits only, whatever the punctuation, at least 3 digits", () => {
  for (const q of ["8765550142", "876-555-0142", "(876) 555-0142", "+876 555 0142", "555 0142", "0142"]) assert.ok(matchesSearch(john, q), q);
  assert.ok(matchesSearch(mary, "8765550199") && matchesSearch(mary, "876-555-0199"));
  assert.ok(!matchesSearch(john, "0199"));
  assert.ok(!matchesSearch(sam, "876"), "a worker with no phone never matches a number");
  assert.ok(!matchesSearch(john, "99"), "two digits are too short for a phone");
});

test("search by job title / trade", () => {
  assert.equal(names(filterWorkers(all, { ...NO_FILTERS, search: "mason" })), "John,Mary,Kit");
  assert.equal(names(filterWorkers(all, { ...NO_FILTERS, search: "CARPENT" })), "Sam");
  assert.equal(names(filterWorkers(all, { ...NO_FILTERS, search: "mason brown" })), "John", "every word must match");
});

test("an empty or blank search keeps everyone", () => {
  assert.equal(filterWorkers(all, { ...NO_FILTERS, search: "   " }).length, 5);
});

test("categories: Mason, 'mason ' and MASON are one; no title is its own", () => {
  assert.equal(categoryKey("Mason"), categoryKey("mason ")); assert.equal(categoryKey("MASON"), "mason");
  assert.equal(categoryKey(null), NO_CATEGORY); assert.equal(categoryKey("   "), NO_CATEGORY);
  assert.equal(filterWorkers(all, { ...NO_FILTERS, category: "mason" }).length, 3);
  assert.equal(names(filterWorkers(all, { ...NO_FILTERS, category: NO_CATEGORY })), "Ann");
});

test("category options: data + the form's titles, form spelling wins, counts, 'No trade set', alphabetical", () => {
  const formTitles = ["Mason", "Carpenter", "Plumber", "Other"];
  const odd = [...all, W("Zed", "Q", "MBW-200", { job_title: "Welder" }), W("Yan", "Q", "MBW-201", { job_title: "welder " }), W("Xi", "Q", "MBW-202", { job_title: "Welder" })];
  const opts = buildCategoryOptions(odd, odd, formTitles);
  const by = Object.fromEntries(opts.map((o) => [o.key, o]));
  assert.equal(by["mason"].label, "Mason", "the form's spelling");
  assert.equal(by["mason"].count, 3);
  assert.equal(by["welder"].label, "Welder", "not in the form: the most common spelling");
  assert.equal(by["welder"].count, 3);
  assert.equal(by["plumber"].count, 0, "a standard title nobody has is still offered");
  assert.equal(opts.filter((o) => o.key === "mason").length, 1, "one option for all spellings");
  assert.equal(opts[opts.length - 1].key, NO_CATEGORY); assert.equal(opts[opts.length - 1].label, "No trade set"); assert.equal(opts[opts.length - 1].count, 1);
  const labels = opts.slice(0, -1).map((o) => o.label);
  assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b)));
  assert.ok(!buildCategoryOptions(all.filter((w) => w.job_title?.trim()), all.filter((w) => w.job_title?.trim()), formTitles).some((o) => o.key === NO_CATEGORY), "no 'No trade set' when everyone has a trade");
});

test("category counts follow the other filters (status, search), the options stay", () => {
  const f = { ...NO_FILTERS, status: "active" };
  const opts = buildCategoryOptions(all, filterWorkers(all, f, "category"), ["Mason", "Carpenter"]);
  assert.equal(opts.find((o) => o.key === "mason")!.count, 2, "Kit is inactive");
  assert.equal(opts.find((o) => o.key === "carpenter")!.count, 1);
});

test("type options carry counts and the form's labels", () => {
  const t = buildTypeOptions(all);
  assert.deepEqual(t.map((o) => [o.value, o.label, o.count]), [["employee", "Employee", 1], ["subcontractor", "Subcontractor", 4], ["crew_lead", "Crew Lead", 0]]);
});

test("search, status, type and category combine (AND)", () => {
  assert.equal(names(filterWorkers(all, { search: "mason", status: "active", type: "", category: "" })), "John,Mary");
  assert.equal(names(filterWorkers(all, { search: "mason", status: "inactive", type: "", category: "" })), "Kit");
  assert.equal(names(filterWorkers(all, { search: "", status: "all", type: "employee", category: "carpenter" })), "Sam");
  assert.equal(filterWorkers(all, { search: "sam", status: "all", type: "subcontractor", category: "" }).length, 0);
  assert.equal(filterWorkers(all, { search: "john", status: "active", type: "subcontractor", category: "mason" }).length, 1);
});

test("filtersActive tells when 'Clear filters' is needed", () => {
  assert.equal(filtersActive(NO_FILTERS), false);
  assert.equal(filtersActive({ ...NO_FILTERS, search: "  " }), false);
  for (const f of [{ search: "a" }, { status: "active" }, { type: "employee" }, { category: "mason" }]) assert.equal(filtersActive({ ...NO_FILTERS, ...f }), true);
});

test("messyCategories lists titles written more than one way", () => {
  const m = messyCategories(all);
  assert.equal(m.length, 1); assert.equal(m[0].key, "mason"); assert.equal(m[0].spellings.length, 3);
});

test("the page uses it: no inline filter, a trade filter with 'All', counts, and Clear filters", () => {
  const src = readFileSync("src/pages/WorkersPage.tsx", "utf8");
  assert.ok(src.includes("filterWorkers(") && src.includes("buildCategoryOptions("));
  assert.ok(!src.includes("fullName(w).toLowerCase().includes(search.toLowerCase())"), "the old inline search is gone");
  assert.ok(src.includes("No workers match") && src.includes("Clear filters"));
});
