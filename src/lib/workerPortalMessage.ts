// The message the office sends a worker with their portal access (WhatsApp, or copied). Plain text, no emoji.
export const WORKER_PORTAL_URL = "https://app.magnusboys.com/worker";

export function buildWorkerPortalMessage(o: { companyName: string; employeeId: string; pin: string; url?: string }): string {
  const company = (o.companyName || "").trim() || "Your company";
  return [
    `${company} worker portal: ${o.url || WORKER_PORTAL_URL}`,
    `Worker No: ${o.employeeId}`,
    `Temporary PIN: ${o.pin}`,
    "You will be asked to choose your own PIN.",
  ].join("\n");
}
