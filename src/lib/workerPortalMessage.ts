// The message the office sends a worker with their portal access (WhatsApp, or copied). Plain text, no emoji.
export const WORKER_PORTAL_URL = "https://app.magnusboys.com/worker";
// The page that installs the "Magnus Workers" Android app (GetAppPage). Links stand alone on their own line so WhatsApp makes them tappable.
export const GET_APP_URL = "https://app.magnusboys.com/get-app";

export function buildWorkerPortalMessage(o: { companyName: string; employeeId: string; pin: string; url?: string }): string {
  const company = (o.companyName || "").trim() || "Your company";
  return [
    `${company} worker portal: ${o.url || WORKER_PORTAL_URL}`,
    `Worker No: ${o.employeeId}`,
    `Temporary PIN: ${o.pin}`,
    "You will be asked to choose your own PIN.",
    `Save this link or add it to your home screen: ${o.url || WORKER_PORTAL_URL}`,
    "",
    "Android phone? Get the app (the clock keeps working with the phone locked):",
    "",
    GET_APP_URL,
    "",
  ].join("\n");
}

// "Send app link": for a worker who already has portal access (their PIN is not in it; they use the PIN they chose).
export function buildAppInviteMessage(o: { workerName: string; employeeId?: string | null }): string {
  const first = (o.workerName || "").trim().split(/\s+/)[0] || "Hello";
  return [
    `Hi ${first}, install the Magnus Workers app to clock in and out on your phone. Open this link on your Android phone and tap GET THE APP:`,
    "",
    GET_APP_URL,
    "",
    o.employeeId ? `Sign in with your Worker No: ${o.employeeId} and your PIN.` : "Sign in with your worker number and your PIN.",
    "Forgot your PIN? Ask the office to reset it.",
  ].join("\n");
}
