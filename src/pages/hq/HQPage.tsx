// src/pages/hq/HQPage.tsx — Magnus HQ: the platform owner's control room for Magnus Boy's System.
//
// Rules (see docs/HQ_PLAN.md):
//  * Only platform admins (platform_admins table) see this page. Anyone else is sent to "/" exactly
//    like any unknown address, so nothing hints that HQ exists.
//  * 2-step login (authenticator app) is required before anything opens. The database enforces it too:
//    every HQ function checks the session is aal2.
//  * Signs out automatically after 30 minutes without activity.
//  * Loaded on its own (React.lazy in App.tsx), so normal users never download it.

import { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, LogOut, ShieldCheck } from "lucide-react";
import { Badge, Btn, Page, Spinner, Tabs } from "../../components/ui";
import { supabase } from "../../lib/supabase";
import { usePlatformStatus } from "../../hooks/usePlatformStatus";
import { useIdleSignOut } from "../../hooks/useIdleSignOut";
import HQMfaGate from "./HQMfaGate";
import HQAdminsTab from "./HQAdminsTab";
import HQHealthTab from "./HQHealthTab";
import HQOverviewTab from "./HQOverviewTab";
import HQCompaniesTab from "./HQCompaniesTab";
import HQMoneyTab from "./HQMoneyTab";
import HQErrorsTab from "./HQErrorsTab";
import HQTrafficTab from "./HQTrafficTab";
import HQSystemTab from "./HQSystemTab";
import HQBillsTab from "./HQBillsTab";
import HQSettingsTab from "./HQSettingsTab";
import HQActivityTab from "./HQActivityTab";
import HQSupportTab from "./HQSupportTab";
import HQLeadsTab from "./HQLeadsTab";
import HQFeedbackTab from "./HQFeedbackTab";
import HQWebsiteTab from "./HQWebsiteTab";
import HQAskTab from "./HQAskTab";
import NotificationBell from "../../components/NotificationBell";
import PlatformBanner from "../../components/PlatformBanner";

const IDLE_LIMIT_MS = 30 * 60 * 1000;
const CONTROL_ROOM_KEY = "magnus.hq.controlRoomUntil";
const CONTROL_ROOM_MS = 12 * 60 * 60 * 1000;

function controlRoomFromStorage(): boolean {
  try { return Number(localStorage.getItem(CONTROL_ROOM_KEY) || 0) > Date.now(); } catch { return false; }
}

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "ask", label: "Ask HQ" },
  { key: "companies", label: "Companies" },
  { key: "leads", label: "Leads" },
  { key: "money", label: "Money" },
  { key: "bills", label: "Bills" },
  { key: "health", label: "Health" },
  { key: "errors", label: "Errors" },
  { key: "traffic", label: "Traffic" },
  { key: "system", label: "System" },
  { key: "support", label: "Support" },
  { key: "feedback", label: "Feedback" },
  { key: "website", label: "Website" },
  { key: "settings", label: "Settings" },
  { key: "activity", label: "Activity" },
  { key: "admins", label: "Admins" },
] as const;

type HQTab = (typeof TABS)[number]["key"];

function isTab(v: string | null): v is HQTab {
  return TABS.some((t) => t.key === v);
}

export default function HQPage() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { status, refresh } = usePlatformStatus();
  const [signingOut, setSigningOut] = useState(false);
  // Control room mode (a computer that stays open): pauses the idle sign-out, switches itself off after 12 hours.
  const [controlRoom, setControlRoomState] = useState<boolean>(controlRoomFromStorage);
  const setControlRoom = useCallback((on: boolean) => {
    try { if (on) localStorage.setItem(CONTROL_ROOM_KEY, String(Date.now() + CONTROL_ROOM_MS)); else localStorage.removeItem(CONTROL_ROOM_KEY); } catch { /* ignore */ }
    setControlRoomState(on);
  }, []);
  useEffect(() => {
    if (!controlRoom) return;
    const t = window.setInterval(() => { if (!controlRoomFromStorage()) setControlRoomState(false); }, 60_000);
    return () => window.clearInterval(t);
  }, [controlRoom]);

  const tabParam = params.get("tab");
  const tab: HQTab = isTab(tabParam) ? tabParam : "overview";

  const signOut = useCallback(async () => {
    setSigningOut(true);
    try { localStorage.removeItem(CONTROL_ROOM_KEY); } catch { /* ignore */ }
    await supabase.auth.signOut();
    nav("/login?next=%2Fhq", { replace: true });
  }, [nav]);

  useIdleSignOut(IDLE_LIMIT_MS, () => { void signOut(); }, !!status?.is_admin && !controlRoom);

  if (!status || signingOut) {
    return (
      <Page className="flex items-center justify-center">
        <Spinner size={22} />
      </Page>
    );
  }

  // Not an admin: behave exactly like an unknown address.
  if (!status.is_admin) return <Navigate to="/" replace />;

  if (!status.mfa_ok) {
    return <HQMfaGate onVerified={refresh} onSignOut={() => { void signOut(); }} />;
  }

  return (
    <Page>
      <PlatformBanner />
      <header className="flex items-center justify-between gap-3 flex-wrap px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#0c1018]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-white/10 text-white flex items-center justify-center flex-shrink-0">
            <ShieldCheck size={16} />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-tight">Magnus HQ</h1>
            <p className="text-[10px] text-slate-500 truncate">Magnus Boy&apos;s System · platform control room</p>
          </div>
          <Badge color={status.is_owner ? "violet" : "slate"}>{status.is_owner ? "Owner" : "Admin"}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5" />
          <Btn variant="ghost" icon={<ArrowLeft size={13} />} onClick={() => nav("/")}>Back to app</Btn>
          <Btn icon={<LogOut size={13} />} onClick={() => { void signOut(); }}>Sign out</Btn>
        </div>
      </header>

      <div className="bg-white dark:bg-transparent px-2 sm:px-4 overflow-x-auto">
        <Tabs<HQTab>
          tabs={TABS.map((t) => ({ key: t.key, label: t.label }))}
          active={tab}
          onChange={(k) => setParams(k === "overview" ? {} : { tab: k }, { replace: true })}
        />
      </div>

      <main className="max-w-6xl mx-auto p-4 sm:p-6">
        {tab === "overview" && (
          <HQOverviewTab
            onOpenTab={(t) => {
              const k = isTab(t) ? t : "overview";
              setParams(k === "overview" ? {} : { tab: k }, { replace: true });
            }}
          />
        )}
        {tab === "companies" && <HQCompaniesTab isOwner={!!status.is_owner} />}
        {tab === "money" && <HQMoneyTab isOwner={!!status.is_owner} />}
        {tab === "health" && <HQHealthTab isOwner={!!status.is_owner} controlRoom={controlRoom} onControlRoom={setControlRoom} />}
        {tab === "errors" && <HQErrorsTab />}
        {tab === "traffic" && <HQTrafficTab />}
        {tab === "system" && <HQSystemTab />}
        {tab === "bills" && <HQBillsTab isOwner={!!status.is_owner} />}
        {tab === "settings" && <HQSettingsTab isOwner={!!status.is_owner} />}
        {tab === "activity" && <HQActivityTab />}
        {tab === "support" && <HQSupportTab />}
        {tab === "leads" && <HQLeadsTab isOwner={!!status.is_owner} />}
        {tab === "feedback" && <HQFeedbackTab />}
        {tab === "website" && <HQWebsiteTab isOwner={!!status.is_owner} />}
        {tab === "ask" && (
          <HQAskTab onOpenTab={(t) => { const k = isTab(t) ? t : "overview"; setParams(k === "overview" ? {} : { tab: k }, { replace: true }); }} />
        )}
        {tab === "admins" && <HQAdminsTab isOwner={!!status.is_owner} />}
      </main>
    </Page>
  );
}
