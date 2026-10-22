// The project selector and the pages (src/lib/projectScope.ts, unsavedChanges.ts, ProjectUrlSync, App.tsx, AppLayout.tsx, ProjectContext.tsx).
// Run:  npm run test:projectscope
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addressAfterSwitch, hasOwnProjectFilter, pageScope, projectIdFromPath, scopeNote, urlSyncDecision, PROJECT_SCOPED_PATHS } from "../../src/lib/projectScope";
import { clearUnsaved, hasUnsaved, registerUnsaved, switchWarning } from "../../src/lib/unsavedChanges";

const read = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");

test("the project in an address", () => {
  assert.equal(projectIdFromPath("/projects/abc"), "abc");
  assert.equal(projectIdFromPath("/projects/abc/boq"), "abc");
  assert.equal(projectIdFromPath("/projects/abc/finance/transactions/"), "abc");
  assert.equal(projectIdFromPath("/projects/abc?x=1"), "abc");
  assert.equal(projectIdFromPath("/projects"), null, "the list has no project");
  assert.equal(projectIdFromPath("/projects/"), null);
  assert.equal(projectIdFromPath("/boq"), null);
  assert.equal(projectIdFromPath("/client/projects/abc"), null, "the client portal is not this");
});

test("every page of the sidebar and the project tabs has a scope", () => {
  const url = ["/projects/p1", "/projects/p1/boq", "/projects/p1/takeoff", "/projects/p1/procurement", "/projects/p1/finance", "/projects/p1/finance/transactions", "/projects/p1/finance/reports",
    "/projects/p1/reports", "/projects/p1/site-visit", "/projects/p1/plans", "/projects/p1/issues", "/projects/p1/logs", "/projects/p1/photos", "/projects/p1/admin/payroll-simulation-center"];
  for (const p of url) assert.equal(pageScope(p), "project-url", p);
  const ctx = ["/boq", "/takeoff", "/procurement", "/receiving", "/receiving/doc-1", "/supplier-prices", "/field-ops", "/finance/transactions", "/finance/reports"];
  for (const p of ctx) assert.equal(pageScope(p), "project", p);
  const company = ["/", "/clients", "/projects", "/estimates", "/contracts", "/assemblies", "/rates", "/suppliers", "/finance", "/finance/bank-accounts", "/finance/journal-entry",
    "/expenses", "/cash-flow", "/accounts-receivable", "/accounts-payable", "/field-payments", "/payroll", "/workers", "/secretary", "/reports", "/settings/company", "/help", "/billing"];
  for (const p of company) assert.equal(pageScope(p), "company", p);
  assert.equal(pageScope("/boqs"), "company", "a longer word is not /boq");
});

test("company pages say so; pages with their own project filter say that", () => {
  assert.match(String(scopeNote("/clients")), /does not apply/);
  assert.match(String(scopeNote("/estimates")), /own project filter/);
  assert.match(String(scopeNote("/expenses")), /own project filter/);
  assert.match(String(scopeNote("/reports")), /own project filter/);
  assert.equal(scopeNote("/boq"), null); assert.equal(scopeNote("/projects/p1/boq"), null);
  assert.equal(hasOwnProjectFilter("/estimates/"), true); assert.equal(hasOwnProjectFilter("/clients"), false);
});

test("switching project: the same page for the new project; a search or an open document of the old project is dropped", () => {
  assert.equal(addressAfterSwitch("/projects/a/boq", "", "", "b"), "/projects/b/boq");
  assert.equal(addressAfterSwitch("/projects/a/finance/transactions", "?x=1", "#h", "b"), "/projects/b/finance/transactions");
  assert.equal(addressAfterSwitch("/projects/a", "", "", "b"), "/projects/b");
  assert.equal(addressAfterSwitch("/projects/a/admin/payroll-simulation-center", "", "", "b"), "/projects/b/admin/payroll-simulation-center");
  assert.equal(addressAfterSwitch("/projects/a/boq", "", "", "a"), null, "same project, nothing to do");
  assert.equal(addressAfterSwitch("/boq", "", "", "b"), null);
  assert.equal(addressAfterSwitch("/boq", "?groups=1", "", "b"), "/boq", "an import link of the old project is dropped");
  assert.equal(addressAfterSwitch("/receiving/doc-1", "", "", "b"), "/receiving", "a receiving document belongs to its project");
  assert.equal(addressAfterSwitch("/procurement", "?doc=7", "", "b"), "/procurement");
  assert.equal(addressAfterSwitch("/clients", "", "", "b"), null, "a company page stays");
  assert.equal(addressAfterSwitch("/projects/a/boq", "", "", "b c"), "/projects/b%20c/boq", "ids are encoded");
});

test("ProjectUrlSync: opening an address sets the selector; a selector switch is never undone by the old address", () => {
  const base = { currentProjectId: "a", projectIds: ["a", "b"], loading: false };
  assert.deepEqual(urlSyncDecision({ ...base, urlProjectId: "b", lastHandled: null }), { action: "select", projectId: "b" }, "a link / bookmark / Back to project b");
  assert.deepEqual(urlSyncDecision({ ...base, urlProjectId: "a", lastHandled: null }), { action: "none" }, "already selected");
  assert.deepEqual(urlSyncDecision({ ...base, urlProjectId: "b", lastHandled: null, loading: true }), { action: "wait" }, "projects not loaded yet");
  assert.deepEqual(urlSyncDecision({ ...base, urlProjectId: null, lastHandled: "b" }), { action: "none" }, "no project in the address");
  // the selector was set to b one moment before the address changes from a to b: address still a (already handled), selector b
  assert.deepEqual(urlSyncDecision({ ...base, currentProjectId: "b", urlProjectId: "a", lastHandled: "a" }), { action: "none" }, "not put back to a");
  assert.deepEqual(urlSyncDecision({ ...base, currentProjectId: "b", urlProjectId: "b", lastHandled: "a" }), { action: "none" }, "address caught up");
  assert.deepEqual(urlSyncDecision({ ...base, urlProjectId: "zzz", lastHandled: null }), { action: "none" }, "a project that is not in this user's list never becomes the selection");
});

test("unsaved changes: asked only when something really is unsaved, once per label, with the page's own note", () => {
  const a = Symbol("a"), b = Symbol("b");
  assert.equal(switchWarning(), null); assert.equal(hasUnsaved(), false);
  let dirty = false;
  registerUnsaved(a, "the BOQ", () => dirty, "They will be saved as a draft.");
  assert.equal(switchWarning(), null, "registered but clean");
  dirty = true;
  assert.match(String(switchWarning()), /unsaved changes \(the BOQ\)\. They will be saved as a draft\.\n\nSwitch project anyway\?/);
  registerUnsaved(b, "the form", () => true);
  assert.match(String(switchWarning()), /\(the BOQ, the form\)/);
  clearUnsaved(a); clearUnsaved(b);
  assert.equal(switchWarning(), null, "gone with the page");
  registerUnsaved(a, "x", () => { throw new Error("broken page"); });
  assert.equal(switchWarning(), null, "a page that throws never blocks switching");
  clearUnsaved(a);
});

test("App.tsx: every project address and every project page is rebuilt when its project changes; ProjectUrlSync is mounted", () => {
  const app = read("src/App.tsx");
  assert.ok(app.includes("<ProjectUrlSync />"));
  const routes = app.split("\n").filter((l) => /<Route\s+path=/.test(l));
  for (const l of routes) {
    const path = /path="([^"]+)"/.exec(l)![1];
    if (path.startsWith("/projects/:")) assert.ok(l.includes("<ByUrlProject>"), `${path} must be keyed by the project in the address`);
  }
  for (const base of PROJECT_SCOPED_PATHS) {
    const l = routes.find((r) => r.includes(`path="${base}"`));
    assert.ok(l, `route ${base}`);
    assert.ok(l!.includes("<ByCurrentProject>"), `${base} must be keyed by the selected project`);
  }
  assert.ok(routes.find((r) => r.includes('path="/receiving/:id"'))!.includes("<ByCurrentProject>"));
  assert.match(app, /function ByUrlProject[\s\S]*key=\{p\.projectId \?\? p\.currentProjectId \?\? ""\}/);
  assert.match(app, /function ByCurrentProject[\s\S]*key=\{currentProjectId \?\? "none"\}/);
  for (const company of ["/clients", "/estimates", "/expenses", "/accounts-receivable", "/workers", "/finance"]) {
    const l = routes.find((r) => r.includes(`path="${company}"`));
    assert.ok(l && !/ByUrlProject|ByCurrentProject/.test(l), `${company} is company-wide and not keyed`);
  }
});

test("the sidebar picker and ProjectSelector both switch through useSwitchProject (unsaved warning, selector, address) and the picker shows the scope note", () => {
  const layout = read("src/layout/AppLayout.tsx");
  assert.ok(layout.includes("switchProject(p.id)") && !layout.includes("setCurrentProjectId(p.id)"), "no direct setCurrentProjectId in the picker");
  assert.ok(layout.includes("scopeNote(location.pathname)") && layout.includes("project-scope-note"));
  const sel = read("src/components/ProjectSelector.tsx");
  assert.ok(sel.includes("useSwitchProject") && !sel.includes("buildProjectAwarePath"));
  const hook = read("src/lib/useSwitchProject.ts");
  assert.ok(hook.includes("switchWarning()") && hook.includes("window.confirm") && hook.includes("addressAfterSwitch") && hook.indexOf("window.confirm") < hook.indexOf("setCurrentProjectId(projectId"), "asks BEFORE changing anything");
});

test("pages that ignored the project now follow it", () => {
  const fin = read("src/pages/FinancePage.tsx");
  assert.ok(fin.includes("useParams") && (fin.match(/\.eq\("project_id", projectId\)/g) || []).length === 1 && (fin.match(/scoped\(supabase\.from\(/g) || []).length === 3, "invoices, supplier invoices and expenses are all filtered");
  assert.ok(fin.includes("seq !== loadSeq.current") || fin.includes("seq === loadSeq.current"), "a slow old answer cannot overwrite a newer one");
  const rep = read("src/pages/ReportsPage.tsx");
  assert.ok(rep.includes('useState<string>(urlProjectId || "all")') && rep.includes("disabled={!!urlProjectId}"));
  const psc = read("src/pages/PayrollSimulationCenterPage.tsx");
  assert.ok(!psc.includes("projects?.[0]"), "no longer the first project of the list");
  const est = read("src/pages/EstimatesPage.tsx");
  assert.ok(est.includes("function openNewEstimate()") && !/onClick=\{\(\) => setShowNew\(true\)\}/.test(est));
  const boq = read("src/pages/BOQPage.tsx");
  assert.ok(boq.includes("useUnsavedChanges("));
});

test("the project list: a different person signing in starts clean; a saved project that is not theirs is replaced", () => {
  const ctx = read("src/context/ProjectContext.tsx");
  assert.ok(ctx.includes('event === "SIGNED_OUT"') && ctx.includes("loadedForUserRef") && ctx.includes("loadGenRef"));
  assert.match(ctx, /setProjects\(\[\]\); setTotalProjectsCount\(null\); setCurrentProjectIdState\(null\)/);
  assert.ok(ctx.includes("if (gen !== loadGenRef.current) return;"), "an answer for someone who has signed out is dropped");
  assert.match(ctx, /const pick = \(saved && rows\.some\(\(p\) => p\.id === saved\) \? saved : null\) \?\? rows\[0\]\?\.id \?\? null;/);
  assert.ok(ctx.includes('.eq("company_id", profileData.company_id)'), "the director / admin list is the company's own projects");
  assert.ok(ctx.includes('.eq("user_id", profileData.id)'), "everyone else sees only the projects they are a member of");
});
