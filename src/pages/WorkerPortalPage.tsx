import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { cn } from "../components/ui";
import { Download, Send, Pin } from "lucide-react";
import {
  checkWorkerPortalAccess,
  fetchWorkerInfo,
  fetchWorkerPayslips,
  fetchWorkerYTDSummary,
  fetchCompanyBranding,
  fetchNoticesForWorker,
  fetchNoticeReadIds,
  markNoticeRead,
  fetchWorkerMessages,
  markMessagesReadByWorker,
  sendWorkerMessage,
  type WorkerInfo,
  type WorkerPayslip,
  type WorkerNotice,
  type WorkerMessage,
  type CompanyBranding,
} from "../lib/workerPortal";

type Tab = "info" | "payslips" | "notices" | "messages";

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function generatePayslipHTML(payslip: WorkerPayslip, worker: WorkerInfo, company: CompanyBranding | null) {
  return `<!DOCTYPE html><html><head><title>Payslip</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Calibri, sans-serif; color: #1a1a1a; padding: 40px; }
    .header { display: flex; align-items: center; gap: 20px; border-bottom: 3px solid #1E3A5F; padding-bottom: 20px; margin-bottom: 24px; }
    .logo { width: 70px; height: 70px; border-radius: 10px; object-fit: cover; }
    .company-name { font-size: 22px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: #1E3A5F; }
    .title { text-align: center; font-size: 18px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 24px; color: #1E3A5F; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #999; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 8px 4px; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
    td:last-child { text-align: right; font-weight: 600; }
    .total-row td { font-size: 16px; font-weight: 900; border-top: 2px solid #1E3A5F; border-bottom: none; padding-top: 12px; color: #1E3A5F; }
    .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(-35deg); font-size: 80px; font-weight: 900; color: rgba(30,58,95,0.04); white-space: nowrap; pointer-events: none; z-index: 0; text-transform: uppercase; letter-spacing: 8px; }
    @media print { @page { size: A4; margin: 15mm; } }
  </style></head><body>
  <div class="watermark">${company?.company_name || "MAGNUS BOYS"}</div>
  <div class="header">
    ${company?.logo_url ? `<img src="${company.logo_url}" class="logo"/>` : ""}
    <div>
      <div class="company-name">${company?.company_name || ""}</div>
      <div style="font-size:11px;color:#666;margin-top:3px">OFFICIAL PAYSLIP</div>
    </div>
  </div>
  <div class="title">Payslip — ${new Date(payslip.pay_date).toLocaleDateString("en-US",{month:"long",year:"numeric"})}</div>
  <div class="section">
    <div class="section-title">Employee</div>
    <table>
      <tr><td>Name</td><td>${worker.first_name} ${worker.last_name}</td></tr>
      <tr><td>Pay Period</td><td>${payslip.period_start} – ${payslip.period_end}</td></tr>
      <tr><td>Pay Date</td><td>${payslip.pay_date}</td></tr>
    </table>
  </div>
  <div class="section">
    <div class="section-title">Earnings</div>
    <table>
      <tr><td>Regular Pay</td><td>$${payslip.regular_pay.toLocaleString()}</td></tr>
      ${payslip.overtime_pay > 0 ? `<tr><td>Overtime Pay</td><td>$${payslip.overtime_pay.toLocaleString()}</td></tr>` : ""}
      <tr><td>Gross Pay</td><td>$${payslip.gross_pay.toLocaleString()}</td></tr>
    </table>
  </div>
  <div class="section">
    <div class="section-title">Deductions</div>
    <table>
      <tr><td>NIS (3%)</td><td>$${payslip.social_security.toLocaleString()}</td></tr>
      <tr><td>NHT (2%)</td><td>$${payslip.medicare.toLocaleString()}</td></tr>
      <tr><td>Education Tax (2.25%)</td><td>$${payslip.state_tax.toLocaleString()}</td></tr>
      <tr><td>PAYE Income Tax</td><td>$${payslip.federal_tax.toLocaleString()}</td></tr>
      <tr><td>Total Deductions</td><td>$${payslip.total_deductions.toLocaleString()}</td></tr>
    </table>
  </div>
  <div class="section">
    <table>
      <tr class="total-row"><td>NET PAY</td><td>$${payslip.net_pay.toLocaleString()}</td></tr>
    </table>
  </div>
  <div style="margin-top:60px;display:grid;grid-template-columns:1fr 1fr;gap:40px">
    <div style="border-top:1px solid #1a1a1a;padding-top:6px;font-size:11px;color:#666">Authorised Signature</div>
    <div style="border-top:1px solid #1a1a1a;padding-top:6px;font-size:11px;color:#666">Date</div>
  </div>
  </body></html>`;
}

export default function WorkerPortalPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [tab, setTab] = useState<Tab>("info");

  const [workerInfo, setWorkerInfo] = useState<WorkerInfo | null>(null);
  const [payslips, setPayslips] = useState<WorkerPayslip[]>([]);
  const [ytdSummary, setYtdSummary] = useState<any>(null);
  const [selectedPayslip, setSelectedPayslip] = useState<WorkerPayslip | null>(null);

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [branding, setBranding] = useState<CompanyBranding | null>(null);

  const [notices, setNotices] = useState<WorkerNotice[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const [messages, setMessages] = useState<WorkerMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadWorkerPortal() {
      const accessInfo = await checkWorkerPortalAccess();

      if (!accessInfo.hasAccess || !accessInfo.isWorkerPortalUser || !accessInfo.workerId) {
        setError("You do not have access to the worker portal");
        setLoading(false);
        return;
      }

      setHasAccess(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("company_id")
          .eq("id", user.id)
          .maybeSingle();
        if (profile?.company_id) {
          setCompanyId(profile.company_id);
          const brandingResult = await fetchCompanyBranding(profile.company_id);
          if (brandingResult.success) setBranding(brandingResult.data);
        }
      }

      await loadWorkerInfo(accessInfo.workerId);
      await loadPayslips(accessInfo.workerId);
      await loadYTDSummary(accessInfo.workerId);

      setLoading(false);
    }

    loadWorkerPortal();
  }, []);

  // Notices + messages need companyId, currentUserId, and (for notices)
  // workerInfo.worker_type, all of which land asynchronously above.
  useEffect(() => {
    if (!companyId || !currentUserId || !workerInfo) return;
    loadNotices(companyId, currentUserId, workerInfo.worker_type);
    loadMessages(companyId, currentUserId);
  }, [companyId, currentUserId, workerInfo]);

  // Clear the Messages badge only once the worker actually opens the tab.
  useEffect(() => {
    if (tab !== "messages" || !currentUserId) return;
    const hasUnread = messages.some(m => m.sender_type === "management" && !m.read_by_worker);
    if (!hasUnread) return;
    markMessagesReadByWorker(currentUserId).then(() => {
      setMessages(prev => prev.map(m => m.sender_type === "management" ? { ...m, read_by_worker: true } : m));
    });
  }, [tab, currentUserId, messages]);

  useEffect(() => {
    if (tab === "messages") messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [tab, messages.length]);

  async function loadWorkerInfo(workerId: string) {
    const result = await fetchWorkerInfo(workerId);
    if (result.success && result.data) {
      setWorkerInfo(result.data);
    }
  }

  async function loadPayslips(workerId: string) {
    const result = await fetchWorkerPayslips(workerId, 12);
    if (result.success && result.data) {
      setPayslips(result.data);
    }
  }

  async function loadYTDSummary(workerId: string) {
    const result = await fetchWorkerYTDSummary(workerId);
    if (result.success && result.data) {
      setYtdSummary(result.data);
    }
  }

  async function loadNotices(cid: string, uid: string, workerType: string | null) {
    const result = await fetchNoticesForWorker(cid, workerType);
    if (result.success) setNotices(result.data);
    const ids = await fetchNoticeReadIds(uid);
    setReadIds(ids);
  }

  async function loadMessages(cid: string, uid: string) {
    const result = await fetchWorkerMessages(cid, uid);
    if (result.success) setMessages(result.data);
  }

  async function handleMarkRead(noticeId: string) {
    if (!currentUserId || readIds.has(noticeId)) return;
    const ok = await markNoticeRead(noticeId, currentUserId);
    if (ok) setReadIds(prev => new Set([...prev, noticeId]));
  }

  async function handleSendMessage() {
    if (!newMessage.trim() || !companyId || !currentUserId || sending) return;
    setSending(true);
    const ok = await sendWorkerMessage(companyId, currentUserId, newMessage);
    if (ok) {
      setNewMessage("");
      await loadMessages(companyId, currentUserId);
    }
    setSending(false);
  }

  function downloadPayslip(e: React.MouseEvent, payslip: WorkerPayslip) {
    e.stopPropagation();
    if (!workerInfo) return;
    const html = generatePayslipHTML(payslip, workerInfo, branding);
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 600);
  }

  const unreadNotices = notices.filter(n => !readIds.has(n.id)).length;
  const unreadMessages = messages.filter(m => m.sender_type === "management" && !m.read_by_worker).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
        <div className="p-6 text-sm text-slate-600 dark:text-slate-400">Loading worker portal...</div>
      </div>
    );
  }

  if (error || !hasAccess || !workerInfo) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
        <div className="p-6 space-y-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-200">Access Denied</h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">{error || "You do not have access to the worker portal."}</p>
          </div>
          <button
            onClick={() => navigate("/login")}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  const TABS: { key: Tab; label: string; badge: number }[] = [
    { key: "info", label: "My Info", badge: 0 },
    { key: "payslips", label: "Payslips", badge: 0 },
    { key: "notices", label: "Notices", badge: unreadNotices },
    { key: "messages", label: "Messages", badge: unreadMessages },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            {branding?.logo_url && (
              <img src={branding.logo_url} alt="logo" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
            )}
            <div>
              <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-200">
                {branding?.company_name || "Worker Portal"}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">Payroll and Work Information</p>
            </div>
          </div>
          <button
            onClick={() => supabase.auth.signOut().then(() => navigate("/login"))}
            className="px-4 py-2 rounded-lg bg-slate-700 dark:bg-slate-800 hover:bg-slate-600 dark:hover:bg-slate-700 text-white dark:text-slate-800 dark:text-slate-200 text-sm font-medium transition"
          >
            Sign Out
          </button>
        </div>
      </div>

      <div className="p-6 space-y-4 max-w-7xl mx-auto">
        <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "relative px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap",
                tab === t.key
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              )}
            >
              {t.label}
              {t.badge > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold align-middle">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "info" && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/30 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-200">
                  {workerInfo.first_name} {workerInfo.last_name}
                </h2>
                {workerInfo.email && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{workerInfo.email}</p>
                )}
              </div>
              <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                workerInfo.status === 'active' ? 'bg-green-500/20 text-green-400' :
                workerInfo.status === 'inactive' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-red-500/20 text-red-400'
              }`}>
                {workerInfo.status.charAt(0).toUpperCase() + workerInfo.status.slice(1)}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              {workerInfo.phone && (
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-500 mb-1">Phone</div>
                  <div className="text-sm text-slate-700 dark:text-slate-300">{workerInfo.phone}</div>
                </div>
              )}
              {workerInfo.hire_date && (
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-500 mb-1">Hire Date</div>
                  <div className="text-sm text-slate-700 dark:text-slate-300">
                    {new Date(workerInfo.hire_date).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </div>
                </div>
              )}
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-500 mb-1">Pay Type</div>
                <div className="text-sm text-slate-700 dark:text-slate-300">
                  {workerInfo.pay_type === 'hourly' ? 'Hourly' : 'Salary'}
                </div>
              </div>
            </div>

            {ytdSummary && (
              <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800">
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">
                  Year-to-Date Summary ({new Date().getFullYear()})
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800">
                    <div className="text-2xl font-semibold text-blue-400">${formatCurrency(ytdSummary.gross_pay)}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">Gross Pay</div>
                  </div>
                  <div className="text-center p-4 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800">
                    <div className="text-2xl font-semibold text-red-400">${formatCurrency(ytdSummary.total_deductions)}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">Deductions</div>
                  </div>
                  <div className="text-center p-4 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800">
                    <div className="text-2xl font-semibold text-green-400">${formatCurrency(ytdSummary.net_pay)}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">Net Pay</div>
                  </div>
                  <div className="text-center p-4 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800">
                    <div className="text-2xl font-semibold text-purple-400">${formatCurrency(ytdSummary.retirement_401k)}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">401(k) Contributions</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <div className="text-center p-3 rounded-lg bg-slate-950/20">
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-300">${formatCurrency(ytdSummary.federal_tax)}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">Federal Tax</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-slate-950/20">
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-300">${formatCurrency(ytdSummary.state_tax)}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">State Tax</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-slate-950/20">
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-300">${formatCurrency(ytdSummary.social_security)}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">Social Security</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-slate-950/20">
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-300">${formatCurrency(ytdSummary.medicare)}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">Medicare</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "payslips" && (
          <>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/30 p-4">
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">Recent Payslips</div>
              {payslips.length === 0 ? (
                <div className="text-sm text-slate-500 dark:text-slate-500 text-center py-8">
                  No payslips available
                </div>
              ) : (
                <div className="space-y-2">
                  {payslips.map((payslip) => (
                    <div
                      key={payslip.id}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 hover:bg-slate-100 dark:hover:bg-slate-900/50 cursor-pointer transition"
                      onClick={() => setSelectedPayslip(selectedPayslip?.id === payslip.id ? null : payslip)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                            Pay Period: {new Date(payslip.period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(payslip.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
                            Pay Date: {new Date(payslip.pay_date).toLocaleDateString('en-US', {
                              month: 'long',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={(e) => downloadPayslip(e, payslip)}
                            title="Download payslip"
                            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors flex-shrink-0"
                          >
                            <Download size={16} />
                          </button>
                          <div className="text-right">
                            <div className="text-lg font-semibold text-green-400">${formatCurrency(payslip.net_pay)}</div>
                            <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                              payslip.status === 'paid' ? 'bg-green-500/20 text-green-400' :
                              payslip.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                              'bg-red-500/20 text-red-400'
                            }`}>
                              {payslip.status}
                            </span>
                          </div>
                        </div>
                      </div>

                      {selectedPayslip?.id === payslip.id && (
                        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Earnings</div>
                              <div className="flex justify-between text-sm">
                                <span className="text-slate-600 dark:text-slate-400">Regular Hours ({payslip.regular_hours.toFixed(2)}h)</span>
                                <span className="text-slate-800 dark:text-slate-200">${formatCurrency(payslip.regular_pay)}</span>
                              </div>
                              {payslip.overtime_hours > 0 && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-slate-600 dark:text-slate-400">Overtime Hours ({payslip.overtime_hours.toFixed(2)}h)</span>
                                  <span className="text-slate-800 dark:text-slate-200">${formatCurrency(payslip.overtime_pay)}</span>
                                </div>
                              )}
                              <div className="flex justify-between text-sm font-semibold pt-2 border-t border-slate-200 dark:border-slate-800">
                                <span className="text-slate-700 dark:text-slate-300">Gross Pay</span>
                                <span className="text-blue-400">${formatCurrency(payslip.gross_pay)}</span>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Deductions</div>
                              <div className="flex justify-between text-sm">
                                <span className="text-slate-600 dark:text-slate-400">Federal Tax</span>
                                <span className="text-slate-800 dark:text-slate-200">${formatCurrency(payslip.federal_tax)}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-slate-600 dark:text-slate-400">State Tax</span>
                                <span className="text-slate-800 dark:text-slate-200">${formatCurrency(payslip.state_tax)}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-slate-600 dark:text-slate-400">Social Security</span>
                                <span className="text-slate-800 dark:text-slate-200">${formatCurrency(payslip.social_security)}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-slate-600 dark:text-slate-400">Medicare</span>
                                <span className="text-slate-800 dark:text-slate-200">${formatCurrency(payslip.medicare)}</span>
                              </div>
                              {payslip.health_insurance > 0 && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-slate-600 dark:text-slate-400">Health Insurance</span>
                                  <span className="text-slate-800 dark:text-slate-200">${formatCurrency(payslip.health_insurance)}</span>
                                </div>
                              )}
                              {payslip.retirement_401k > 0 && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-slate-600 dark:text-slate-400">401(k)</span>
                                  <span className="text-slate-800 dark:text-slate-200">${formatCurrency(payslip.retirement_401k)}</span>
                                </div>
                              )}
                              {payslip.other_deductions > 0 && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-slate-600 dark:text-slate-400">Other</span>
                                  <span className="text-slate-800 dark:text-slate-200">${formatCurrency(payslip.other_deductions)}</span>
                                </div>
                              )}
                              <div className="flex justify-between text-sm font-semibold pt-2 border-t border-slate-200 dark:border-slate-800">
                                <span className="text-slate-700 dark:text-slate-300">Total Deductions</span>
                                <span className="text-red-400">${formatCurrency(payslip.total_deductions)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex justify-between items-center p-4 rounded-lg bg-green-950/30 border border-green-800">
                            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Net Pay</span>
                            <span className="text-2xl font-bold text-green-400">${formatCurrency(payslip.net_pay)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/30 p-6">
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">Important Information</div>
              <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
                <p>
                  • Your payslips are available for the past 12 pay periods. For older records, please contact HR.
                </p>
                <p>
                  • If you notice any discrepancies in your pay, please report them to your supervisor or HR immediately.
                </p>
                <p>
                  • Tax withholding information can be updated by submitting a new W-4 form to HR.
                </p>
                <p>
                  • For questions about benefits, deductions, or direct deposit, please contact the HR department.
                </p>
              </div>
            </div>
          </>
        )}

        {tab === "notices" && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/30 p-4">
            {notices.length === 0 ? (
              <div className="text-sm text-slate-500 dark:text-slate-500 text-center py-8">
                No announcements yet
              </div>
            ) : (
              <div className="space-y-3">
                {notices.map(n => {
                  const unread = !readIds.has(n.id);
                  return (
                    <div
                      key={n.id}
                      onClick={() => handleMarkRead(n.id)}
                      className={cn(
                        "p-4 rounded-xl border cursor-pointer transition",
                        unread
                          ? "border-blue-300 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-500/5"
                          : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        {n.pinned && <Pin size={13} className="text-amber-500 flex-shrink-0" />}
                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex-1">{n.title}</div>
                        {unread && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-green-500/15 text-green-600 dark:text-green-400 flex-shrink-0">
                            New
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{n.body}</p>
                      <div className="text-xs text-slate-400 dark:text-slate-600 mt-2">
                        Posted by Management · {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "messages" && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/30 flex flex-col h-[65vh]">
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="text-sm text-slate-500 dark:text-slate-500 text-center py-8">
                  No messages yet — send a message to management below.
                </div>
              ) : (
                messages.map(m => (
                  <div key={m.id} className={cn("flex", m.sender_type === "worker" ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[75%] rounded-2xl px-4 py-2.5",
                      m.sender_type === "worker"
                        ? "bg-blue-600 text-white"
                        : "bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                    )}>
                      <div className="text-sm whitespace-pre-wrap">{m.body}</div>
                      <div className={cn("text-[10px] mt-1", m.sender_type === "worker" ? "text-blue-100" : "text-slate-500 dark:text-slate-400")}>
                        {m.sender_type === "worker" ? "You" : "Management"} · {new Date(m.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="flex gap-2 p-3 border-t border-slate-200 dark:border-slate-800">
              <input
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                placeholder="Type a message..."
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSendMessage}
                disabled={!newMessage.trim() || sending}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition flex items-center gap-1.5"
              >
                <Send size={14} />
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
