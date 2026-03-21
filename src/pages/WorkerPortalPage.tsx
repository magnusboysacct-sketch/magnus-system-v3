import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  checkWorkerPortalAccess,
  fetchWorkerInfo,
  fetchWorkerPayslips,
  fetchWorkerYTDSummary,
  type WorkerInfo,
  type WorkerPayslip,
} from "../lib/workerPortal";

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function WorkerPortalPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasAccess, setHasAccess] = useState(false);

  const [workerInfo, setWorkerInfo] = useState<WorkerInfo | null>(null);
  const [payslips, setPayslips] = useState<WorkerPayslip[]>([]);
  const [ytdSummary, setYtdSummary] = useState<any>(null);
  const [selectedPayslip, setSelectedPayslip] = useState<WorkerPayslip | null>(null);

  useEffect(() => {
    async function loadWorkerPortal() {
      const accessInfo = await checkWorkerPortalAccess();

      if (!accessInfo.hasAccess || !accessInfo.isWorkerPortalUser || !accessInfo.workerId) {
        setError("You do not have access to the worker portal");
        setLoading(false);
        return;
      }

      setHasAccess(true);

      await loadWorkerInfo(accessInfo.workerId);
      await loadPayslips(accessInfo.workerId);
      await loadYTDSummary(accessInfo.workerId);

      setLoading(false);
    }

    loadWorkerPortal();
  }, []);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950">
        <div className="p-6 text-sm text-slate-400">Loading worker portal...</div>
      </div>
    );
  }

  if (error || !hasAccess || !workerInfo) {
    return (
      <div className="min-h-screen bg-slate-950">
        <div className="p-6 space-y-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-200">Access Denied</h1>
            <p className="text-slate-400 mt-1">{error || "You do not have access to the worker portal."}</p>
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

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="border-b border-slate-800 bg-slate-900/50 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div>
            <h1 className="text-xl font-semibold text-slate-200">Worker Portal</h1>
            <p className="text-sm text-slate-400 mt-0.5">Payroll and Work Information</p>
          </div>
          <button
            onClick={() => supabase.auth.signOut().then(() => navigate("/login"))}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition"
          >
            Sign Out
          </button>
        </div>
      </div>

      <div className="p-6 space-y-4 max-w-7xl mx-auto">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-2xl font-semibold text-slate-200">
                {workerInfo.first_name} {workerInfo.last_name}
              </h2>
              {workerInfo.email && (
                <p className="text-sm text-slate-400 mt-1">{workerInfo.email}</p>
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
                <div className="text-xs text-slate-500 mb-1">Phone</div>
                <div className="text-sm text-slate-300">{workerInfo.phone}</div>
              </div>
            )}
            {workerInfo.hire_date && (
              <div>
                <div className="text-xs text-slate-500 mb-1">Hire Date</div>
                <div className="text-sm text-slate-300">
                  {new Date(workerInfo.hire_date).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </div>
              </div>
            )}
            <div>
              <div className="text-xs text-slate-500 mb-1">Pay Type</div>
              <div className="text-sm text-slate-300">
                {workerInfo.pay_type === 'hourly' ? 'Hourly' : 'Salary'}
              </div>
            </div>
          </div>
        </div>

        {ytdSummary && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6">
            <div className="text-sm font-semibold text-slate-200 mb-4">
              Year-to-Date Summary ({new Date().getFullYear()})
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 rounded-xl bg-slate-950/40 border border-slate-800">
                <div className="text-2xl font-semibold text-blue-400">${formatCurrency(ytdSummary.gross_pay)}</div>
                <div className="text-xs text-slate-500 mt-1">Gross Pay</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-slate-950/40 border border-slate-800">
                <div className="text-2xl font-semibold text-red-400">${formatCurrency(ytdSummary.total_deductions)}</div>
                <div className="text-xs text-slate-500 mt-1">Deductions</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-slate-950/40 border border-slate-800">
                <div className="text-2xl font-semibold text-green-400">${formatCurrency(ytdSummary.net_pay)}</div>
                <div className="text-xs text-slate-500 mt-1">Net Pay</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-slate-950/40 border border-slate-800">
                <div className="text-2xl font-semibold text-purple-400">${formatCurrency(ytdSummary.retirement_401k)}</div>
                <div className="text-xs text-slate-500 mt-1">401(k) Contributions</div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              <div className="text-center p-3 rounded-lg bg-slate-950/20">
                <div className="text-sm font-medium text-slate-300">${formatCurrency(ytdSummary.federal_tax)}</div>
                <div className="text-xs text-slate-500 mt-0.5">Federal Tax</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-slate-950/20">
                <div className="text-sm font-medium text-slate-300">${formatCurrency(ytdSummary.state_tax)}</div>
                <div className="text-xs text-slate-500 mt-0.5">State Tax</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-slate-950/20">
                <div className="text-sm font-medium text-slate-300">${formatCurrency(ytdSummary.social_security)}</div>
                <div className="text-xs text-slate-500 mt-0.5">Social Security</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-slate-950/20">
                <div className="text-sm font-medium text-slate-300">${formatCurrency(ytdSummary.medicare)}</div>
                <div className="text-xs text-slate-500 mt-0.5">Medicare</div>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="text-sm font-semibold text-slate-200 mb-4">Recent Payslips</div>
          {payslips.length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-8">
              No payslips available
            </div>
          ) : (
            <div className="space-y-2">
              {payslips.map((payslip) => (
                <div
                  key={payslip.id}
                  className="p-4 rounded-xl border border-slate-800 bg-slate-950/40 hover:bg-slate-900/50 cursor-pointer transition"
                  onClick={() => setSelectedPayslip(selectedPayslip?.id === payslip.id ? null : payslip)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-slate-200">
                        Pay Period: {new Date(payslip.period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(payslip.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Pay Date: {new Date(payslip.pay_date).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </div>
                    </div>
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

                  {selectedPayslip?.id === payslip.id && (
                    <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <div className="text-xs font-semibold text-slate-400 uppercase">Earnings</div>
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-400">Regular Hours ({payslip.regular_hours.toFixed(2)}h)</span>
                            <span className="text-slate-200">${formatCurrency(payslip.regular_pay)}</span>
                          </div>
                          {payslip.overtime_hours > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-400">Overtime Hours ({payslip.overtime_hours.toFixed(2)}h)</span>
                              <span className="text-slate-200">${formatCurrency(payslip.overtime_pay)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-sm font-semibold pt-2 border-t border-slate-800">
                            <span className="text-slate-300">Gross Pay</span>
                            <span className="text-blue-400">${formatCurrency(payslip.gross_pay)}</span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-xs font-semibold text-slate-400 uppercase">Deductions</div>
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-400">Federal Tax</span>
                            <span className="text-slate-200">${formatCurrency(payslip.federal_tax)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-400">State Tax</span>
                            <span className="text-slate-200">${formatCurrency(payslip.state_tax)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-400">Social Security</span>
                            <span className="text-slate-200">${formatCurrency(payslip.social_security)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-400">Medicare</span>
                            <span className="text-slate-200">${formatCurrency(payslip.medicare)}</span>
                          </div>
                          {payslip.health_insurance > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-400">Health Insurance</span>
                              <span className="text-slate-200">${formatCurrency(payslip.health_insurance)}</span>
                            </div>
                          )}
                          {payslip.retirement_401k > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-400">401(k)</span>
                              <span className="text-slate-200">${formatCurrency(payslip.retirement_401k)}</span>
                            </div>
                          )}
                          {payslip.other_deductions > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-400">Other</span>
                              <span className="text-slate-200">${formatCurrency(payslip.other_deductions)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-sm font-semibold pt-2 border-t border-slate-800">
                            <span className="text-slate-300">Total Deductions</span>
                            <span className="text-red-400">${formatCurrency(payslip.total_deductions)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-between items-center p-4 rounded-lg bg-green-950/30 border border-green-800">
                        <span className="text-sm font-semibold text-slate-200">Net Pay</span>
                        <span className="text-2xl font-bold text-green-400">${formatCurrency(payslip.net_pay)}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6">
          <div className="text-sm font-semibold text-slate-200 mb-4">Important Information</div>
          <div className="space-y-3 text-sm text-slate-400">
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
      </div>
    </div>
  );
}
