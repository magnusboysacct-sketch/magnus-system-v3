// src/components/SendToClientModal.tsx
//
// One shared "Send to Client" window (invoices first; estimates and contracts
// reuse it). Four ways to deliver — Portal, Copy link, WhatsApp, Email — and all
// four first mark the item as shared via share_with_client, so nothing reaches a
// client without staff pressing a button here. A failure is shown inline and
// never opens WhatsApp/mail.
import React, { useEffect, useRef, useState } from "react";
import { Globe, Link2, MessageCircle, Mail } from "lucide-react";
import { Modal, Btn, Alert, Spinner, cn } from "./ui";
import {
  buildMailtoUrl,
  buildWhatsAppUrl,
  enablePortalForClient,
  formatJamaicaDateTime,
  getPortalUrl,
  shareViaLabel,
  shareWithClient,
  withdrawFromClient,
} from "../lib/portalShare";
import type { ShareItemType, ShareVia } from "../lib/portalShare";

export interface SendToClientClient {
  id: string;
  name: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  portal_enabled?: boolean | null;
  portal_token?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  itemType: ShareItemType;
  itemId: string;
  itemLabel: string;
  client: SendToClientClient;
  sharedAt: string | null;
  sharedVia: string | null;
  messageText: (url: string) => string;
  snapshot?: Record<string, unknown> | null;
  onChanged: () => void | Promise<void>;
  canWithdraw?: boolean;
  // Estimates: staff choose what the client sees each time it is sent. The
  // snapshot is built at the moment of sending from the chosen level.
  detailOptions?: boolean;
  buildSnapshot?: (level: DetailLevel) => Promise<object> | object;
  currentDetailLevel?: DetailLevel | null;
  // Optional heads-up shown at the top of the window (does not block sending).
  note?: string | null;
}

type Busy = ShareVia | "enable" | "withdraw" | null;
export type DetailLevel = "summary" | "full";

const COMPANY_NAME = "Magnus Boys Construction";

function OptionButton({ icon, title, desc, disabled, busy, onClick }: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full flex items-center gap-3 text-left rounded-xl border px-3.5 py-3 transition-all",
        disabled
          ? "opacity-50 cursor-not-allowed border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.02]"
          : "border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.08] hover:border-cyan-400 dark:hover:border-cyan-500/40"
      )}
    >
      <span className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-300">
        {busy ? <Spinner size={16} /> : icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</span>
        <span className="block text-[11px] text-slate-500 dark:text-slate-400">{desc}</span>
      </span>
    </button>
  );
}

export default function SendToClientModal({
  open,
  onClose,
  itemType,
  itemId,
  itemLabel,
  client,
  sharedAt,
  sharedVia,
  messageText,
  snapshot,
  onChanged,
  canWithdraw = true,
  detailOptions,
  buildSnapshot,
  currentDetailLevel = null,
  note = null,
}: Props) {
  const [localClient, setLocalClient] = useState<SendToClientClient>(client);
  const [shared, setShared] = useState<{ at: string | null; via: string | null }>({ at: sharedAt, via: sharedVia });
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [level, setLevel] = useState<DetailLevel>("summary");
  const [sentLevel, setSentLevel] = useState<DetailLevel | null>(currentDetailLevel);

  useEffect(() => {
    setLocalClient(client);
    setError(null);
    setNotice(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id, open]);

  useEffect(() => {
    setShared({ at: sharedAt, via: sharedVia });
  }, [sharedAt, sharedVia]);

  useEffect(() => {
    setSentLevel(currentDetailLevel);
  }, [currentDetailLevel]);

  const url = getPortalUrl(localClient);
  const portalReady = !!localClient.portal_enabled && !!localClient.portal_token;
  const resend = !!shared.at;
  const showDetail = detailOptions ?? itemType === "estimate";
  const hasPhone = !!String(localClient.phone || "").replace(/\D/g, "");
  const hasEmail = !!String(localClient.email || "").trim();

  // Runs one action at a time; a second click while one is running is ignored.
  async function run(kind: Exclude<Busy, null>, fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e: any) {
      setError(e?.message || "Something went wrong. Please try again.");
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  async function notifyParent() {
    try {
      await onChanged();
    } catch {
      // the send itself succeeded; a refresh failure must not surface as a send failure
    }
  }

  // Built at the moment of sending, BEFORE the RPC: if building fails the error
  // is shown and nothing is sent. Without buildSnapshot this is the plain
  // snapshot prop (null for invoices), exactly as before.
  async function resolveSnapshot(): Promise<Record<string, unknown> | null> {
    if (buildSnapshot) return (await buildSnapshot(level)) as Record<string, unknown>;
    return snapshot ?? null;
  }

  async function share(via: ShareVia) {
    await run(via, async () => {
      if (!url) throw new Error("This client has no portal link yet. Enable the portal first.");

      // Open the tab now (still inside the click) so pop-up blockers allow it;
      // it is only pointed at WhatsApp after the share succeeds.
      let popup: Window | null = null;
      if (via === "whatsapp") {
        try { popup = window.open("", "_blank"); } catch { popup = null; }
      }

      let at: string;
      try {
        const snap = await resolveSnapshot();
        at = await shareWithClient(itemType, itemId, via, snap);
      } catch (e) {
        try { popup?.close(); } catch { /* ignore */ }
        throw e;
      }
      setShared({ at, via });
      if (showDetail) setSentLevel(level);

      if (via === "portal") {
        setNotice("Now visible in the client's portal.");
      } else if (via === "link") {
        let copied = false;
        try {
          await navigator.clipboard.writeText(url);
          copied = true;
        } catch { /* fall through to the visible link below */ }
        setNotice(copied ? "Link copied, and now visible in the client's portal." : "Now visible in the client's portal. Copy the link below.");
      } else if (via === "whatsapp") {
        const wa = buildWhatsAppUrl(localClient.phone, messageText(url));
        if (popup) popup.location.href = wa;
        else window.open(wa, "_blank");
        setNotice("Now visible in the client's portal. WhatsApp opened.");
      } else {
        const mail = buildMailtoUrl(localClient.email, `${itemLabel} from ${COMPANY_NAME}`, messageText(url));
        window.location.href = mail;
        setNotice("Now visible in the client's portal. Your email app should open.");
      }
      await notifyParent();
    });
  }

  async function enableAndSend() {
    await run("enable", async () => {
      const updated = await enablePortalForClient(localClient);
      const next = { ...localClient, ...updated };
      setLocalClient(next);
      const snap = await resolveSnapshot();
      const at = await shareWithClient(itemType, itemId, "portal", snap);
      setShared({ at, via: "portal" });
      if (showDetail) setSentLevel(level);
      setNotice("Portal enabled. Now visible in the client's portal.");
      await notifyParent();
    });
  }

  async function withdraw() {
    if (busyRef.current) return;
    if (!window.confirm(`Withdraw ${itemLabel} from the client's portal? They will no longer be able to see it.`)) return;
    await run("withdraw", async () => {
      await withdrawFromClient(itemType, itemId);
      setShared({ at: null, via: null });
      setSentLevel(null);
      setNotice("Withdrawn. The client can no longer see it.");
      await notifyParent();
    });
  }

  const clientName = localClient.contact_name || localClient.name;
  const anyBusy = busy !== null;

  return (
    <Modal open={open} onClose={onClose} title="Send to Client" subtitle={`${itemLabel} · ${clientName}`} width="max-w-md">
      <div className="space-y-3">
        {shared.at && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 px-3.5 py-3">
            <div className="text-xs text-emerald-700 dark:text-emerald-300">
              Sent via <strong>{shareViaLabel(shared.via)}</strong> on {formatJamaicaDateTime(shared.at)}
              {showDetail && sentLevel && (
                <div className="mt-0.5">
                  Currently sent as: <strong>{sentLevel === "full" ? "Full breakdown" : "Summary"}</strong>
                </div>
              )}
            </div>
            {canWithdraw && (
              <Btn variant="danger" size="xs" onClick={withdraw} disabled={anyBusy}>
                {busy === "withdraw" ? "Withdrawing…" : "Withdraw"}
              </Btn>
            )}
          </div>
        )}

        {note && <Alert type="warning">{note}</Alert>}
        {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
        {notice && <Alert type="success" onClose={() => setNotice(null)}>{notice}</Alert>}

        {!portalReady && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 px-3.5 py-3 space-y-2">
            <div className="text-xs text-amber-800 dark:text-amber-300">This client&apos;s portal is switched off.</div>
            <Btn variant="primary" size="sm" onClick={enableAndSend} disabled={anyBusy}>
              {busy === "enable" ? "Enabling…" : "Enable portal and send"}
            </Btn>
          </div>
        )}

        {showDetail && (
          <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.03] px-3.5 py-3 space-y-2">
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">What should the client see?</div>
            {(["summary", "full"] as const).map((opt) => (
              <label key={opt} className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="send-detail-level"
                  checked={level === opt}
                  onChange={() => setLevel(opt)}
                  disabled={busy !== null}
                  className="mt-0.5"
                />
                <span className="text-xs text-slate-700 dark:text-slate-300">
                  {opt === "summary" ? "Summary only (category totals and the total)" : "Full breakdown (every line item)"}
                </span>
              </label>
            ))}
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              You can resend later with a different level.
            </div>
          </div>
        )}

        <div className="space-y-2">
          <OptionButton
            icon={<Globe size={16} />}
            title={resend ? "Resend to portal" : "Portal"}
            desc="Make it visible in the client's portal"
            disabled={!portalReady || anyBusy}
            busy={busy === "portal"}
            onClick={() => share("portal")}
          />
          <OptionButton
            icon={<Link2 size={16} />}
            title={resend ? "Copy link again" : "Copy link"}
            desc="Share it, then copy the portal link"
            disabled={!portalReady || anyBusy}
            busy={busy === "link"}
            onClick={() => share("link")}
          />
          <OptionButton
            icon={<MessageCircle size={16} />}
            title={resend ? "Resend via WhatsApp" : "WhatsApp"}
            desc={hasPhone ? "Share it, then open WhatsApp with a message" : "No phone number on file for this client"}
            disabled={!portalReady || !hasPhone || anyBusy}
            busy={busy === "whatsapp"}
            onClick={() => share("whatsapp")}
          />
          <OptionButton
            icon={<Mail size={16} />}
            title={resend ? "Resend via email" : "Email"}
            desc={hasEmail ? "Share it, then open an email with the link" : "No email address on file for this client"}
            disabled={!portalReady || !hasEmail || anyBusy}
            busy={busy === "email"}
            onClick={() => share("email")}
          />
        </div>

        {url && (
          <div>
            <div className="text-[10px] text-slate-500 dark:text-slate-500 mb-1">Client portal link</div>
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-mono text-slate-600 dark:text-slate-400"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}