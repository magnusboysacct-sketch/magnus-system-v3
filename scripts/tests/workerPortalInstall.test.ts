// Finding the worker portal again: its own web manifest, the home-screen tip, Sign out, and the staff login's link to /worker.
// Run:  npm run test:workerportal
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APP_ICON_PATHS, buildWorkerManifest, markFreshLogin, neverShowTip, shouldShowHomeTip, takeFreshLogin, tipDismissedForever, workerAppNames } from "../../src/lib/workerPortalInstall";

function fakeStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

test("the worker portal has its own web manifest: it starts and stays on /worker, is named after the company, and uses the app icons unless the company logo was drawn", () => {
  const m = buildWorkerManifest({ origin: "https://app.magnusboys.com/", companyName: "Magnus Boys Construction Limited", themeColor: "#15315A" });
  assert.equal(m.start_url, "https://app.magnusboys.com/worker");
  assert.equal(m.scope, "https://app.magnusboys.com/worker");
  assert.equal(m.id, "https://app.magnusboys.com/worker");
  assert.equal(m.display, "standalone");
  assert.equal(m.name, "Magnus Boys Construction Limited Workers");
  assert.ok(m.short_name.length <= 20 && /Workers$/.test(m.short_name));
  assert.deepEqual(m.icons.map((i) => i.src), APP_ICON_PATHS.map((i) => "https://app.magnusboys.com" + i.src));
  assert.ok(m.icons.some((i) => i.sizes === "512x512") && m.icons.some((i) => i.sizes === "192x192"), "installable: a 192 and a 512 icon");
  // the start URL is inside the scope (otherwise the browser ignores the manifest), and so is /worker/home
  assert.ok(m.start_url.startsWith(m.scope) && "https://app.magnusboys.com/worker/home".startsWith(m.scope));
  const withLogo = buildWorkerManifest({ origin: "https://x.test", companyName: "Acme", icons: [{ src: "data:image/png;base64,AAAA", sizes: "512x512", type: "image/png", purpose: "any" }] });
  assert.equal(withLogo.icons[0].src, "data:image/png;base64,AAAA", "a drawn logo is used as it is");
  assert.equal(buildWorkerManifest({ origin: "https://x.test", themeColor: "red" }).theme_color, "#15315A", "a bad colour falls back");
  assert.deepEqual(workerAppNames(null), { name: "Worker Portal", short_name: "Workers" });
  assert.deepEqual(workerAppNames("   "), { name: "Worker Portal", short_name: "Workers" });
  assert.equal(workerAppNames("Acme").name, "Acme Workers");
  assert.ok(workerAppNames("A".repeat(80)).name.length <= 48);
  // the static file the login page uses before the company is known says the same
  const file = JSON.parse(readFileSync("public/worker-manifest.json", "utf8"));
  assert.equal(file.start_url, "/worker"); assert.equal(file.scope, "/worker"); assert.equal(file.name, "Worker Portal"); assert.equal(file.display, "standalone");
  assert.deepEqual(file.icons.map((i: { src: string }) => i.src), APP_ICON_PATHS.map((i) => i.src));
});

test("the home-screen tip: after a fresh sign-in only, never once dismissed or when already installed, and a reload does not repeat it", () => {
  assert.equal(shouldShowHomeTip({ freshLogin: true, dismissedForever: false, standalone: false }), true);
  assert.equal(shouldShowHomeTip({ freshLogin: false, dismissedForever: false, standalone: false }), false);
  assert.equal(shouldShowHomeTip({ freshLogin: true, dismissedForever: true, standalone: false }), false);
  assert.equal(shouldShowHomeTip({ freshLogin: true, dismissedForever: false, standalone: true }), false);
  const session = fakeStore(), local = fakeStore();
  assert.equal(takeFreshLogin(session), false);
  markFreshLogin(session);
  assert.equal(takeFreshLogin(session), true);
  assert.equal(takeFreshLogin(session), false, "read once");
  assert.equal(tipDismissedForever(local), false);
  neverShowTip(local);
  assert.equal(tipDismissedForever(local), true);
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  assert.doesNotThrow(() => { markFreshLogin(broken); neverShowTip(broken); });
  assert.equal(takeFreshLogin(broken), false);
  assert.equal(tipDismissedForever(broken), false);
  assert.equal(takeFreshLogin(null), false);
});

test("the screens: Sign out in the header with a confirmation and the token cleared; the staff login links to /worker; the login page says you stay signed in", () => {
  const home = readFileSync("src/pages/WorkerHomePage.tsx", "utf8");
  const login = readFileSync("src/pages/WorkerLoginPage.tsx", "utf8");
  const staff = readFileSync("src/pages/LoginPage.tsx", "utf8");
  const header = home.slice(home.indexOf("<header"), home.indexOf("</header>"));
  assert.ok(header.includes("onClick={confirmSignOut}") && header.includes("Sign out"), "a Sign out button in the header, so it is on every tab");
  assert.ok(home.includes('window.confirm("Sign out of the worker portal?")'));
  const logOut = home.slice(home.indexOf("async function logOut()"), home.indexOf("function confirmSignOut()"));
  assert.ok(logOut.includes("workerLogout(t)") && logOut.includes("clearWorkerToken()") && logOut.includes('nav("/worker", { replace: true })'), "the session ends, the stored token is cleared, then the login screen");
  const pinScreen = home.slice(home.indexOf("Choose your own PIN"), home.indexOf("if (!home || !home.worker) return null;"));
  assert.ok(pinScreen.includes("confirmSignOut"), "also on the choose-your-PIN screen");
  assert.ok(staff.includes("Worker? Sign in here") && staff.includes('nav("/worker")'));
  assert.ok(login.includes("You&apos;ll stay signed in on this phone. Sign out if you use a shared phone."));
  assert.ok(login.includes("useWorkerPortalManifest({})") && login.includes("markFreshLogin()"));
});

test("a stored worker token never touches the staff session, and the staff session never opens the worker portal", () => {
  const api = readFileSync("src/lib/workerPortalApi.ts", "utf8");
  const home = readFileSync("src/pages/WorkerHomePage.tsx", "utf8");
  const app = readFileSync("src/App.tsx", "utf8");
  assert.ok(!/auth\.signOut|auth\.getSession|auth\.getUser/.test(api + home), "the portal code never reads or ends the staff login");
  assert.ok(/path="\/worker"\s+element=\{<WorkerLoginPage \/>\}/.test(app) && /path="\/worker\/home"\s+element=\{<WorkerHomePage \/>\}/.test(app), "the portal routes are not behind RequireAuth");
  assert.ok(!/RequireAuth><Worker(Login|Home)Page/.test(app));
});
