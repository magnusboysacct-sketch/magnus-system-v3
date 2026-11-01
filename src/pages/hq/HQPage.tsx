// src/pages/hq/HQPage.tsx — Magnus HQ: the platform owner's control room for Magnus Boy's System.
//
// Rules (see docs/HQ_PLAN.md):
//  * Only platform admins (platform_admins table) see this page. Anyone else is sent to "/" exactly
//    like any unknown address, so nothing hints that HQ exists.
//  * 2-step login (authenticator app) is required before anything opens. The database enforces it too:
//    every HQ function checks the session is aal2.
//  * Signs out automatically after 30 minutes without activity.
//  * Loaded on its own (React.lazy in App.tsx), so normal users never download it.

import { useCallback, useState } from "react";
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

const IDLE_LIMIT_MS = 30 * 60 * 1000;

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "companies", label: "Companies" },
  { key: "money", label: "Money" },
  { key: "health", label: "Health" },
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

  const tabParam = params.get("tab");
  const tab: HQTab = isTab(tabParam) ? tabParam : "overview";

  const signOut = useCallback(async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    nav("/login?next=%2Fhq", { replace: true });
  }, [nav]);

  useIdleSignOut(IDLE_LIMIT_MS, () => { void signOut(); }, !!status?.is_admin);

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
        {tab === "health" && <HQHealthTab />}
        {tab === "admins" && <HQAdminsTab isOwner={!!status.is_owner} />}
      </main>
    </Page>
  );
}
