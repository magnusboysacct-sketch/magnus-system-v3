import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  checkClientPortalAccess,
  fetchClientInvoices,
  fetchClientPayments,
  getClientFinancialSummary,
  type ClientInvoiceSummary,
  type ClientPaymentHistory,
} from "../lib/clientAccess";
import { fetchProjectTasks, getProjectProgress } from "../lib/tasks";
import type { ProjectTask, ProjectProgress } from "../lib/tasks";
import { fetchProjectFiles } from "../lib/documents";
import type { ProjectDocument } from "../lib/documents";
import { fetchDailyLogs } from "../lib/dailyLogs";
import type { DailyLog } from "../lib/dailyLogs";
import { fetchProjectPhotos } from "../lib/photos";
import type { ProjectPhoto } from "../lib/photos";
import { fetchProjectActivity, getActivityIcon, getActivityColor } from "../lib/activity";
import type { ProjectActivity } from "../lib/activity";

type ProjectRow = {
  id: string;
  client_id: string | null;
  name: string;
  site_address: string | null;
  status: "planning" | "active" | "on_hold" | "completed" | "cancelled";
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ClientRow = {
  id: string;
  name: string;
};

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function ClientProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasAccess, setHasAccess] = useState(false);

  const [project, setProject] = useState<ProjectRow | null>(null);
  const [client, setClient] = useState<ClientRow | null>(null);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [progress, setProgress] = useState<ProjectProgress | null>(null);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [photos, setPhotos] = useState<ProjectPhoto[]>([]);
  const [activities, setActivities] = useState<ProjectActivity[]>([]);
  const [invoices, setInvoices] = useState<ClientInvoiceSummary[]>([]);
  const [payments, setPayments] = useState<ClientPaymentHistory[]>([]);
  const [financialSummary, setFinancialSummary] = useState<{
    total_invoiced: number;
    total_paid: number;
    balance_due: number;
    overdue_amount: number;
  } | null>(null);

  useEffect(() => {
    async function loadClientProject() {
      if (!projectId) {
        setError("No project ID provided");
        setLoading(false);
        return;
      }

      const accessInfo = await checkClientPortalAccess(projectId);

      if (!accessInfo.hasAccess || !accessInfo.isClientPortalUser) {
        setError("You do not have access to this project");
        setLoading(false);
        return;
      }

      setHasAccess(true);

      await loadProject();
      await loadTasks();
      await loadProgress();
      await loadDocuments();
      await loadDailyLogs();
      await loadPhotos();
      await loadActivities();
      await loadInvoices();
      await loadPayments();
      await loadFinancialSummary();

      setLoading(false);
    }

    loadClientProject();
  }, [projectId]);

  async function loadProject() {
    if (!projectId) return;

    const { data: projectData, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (projectError) {
      console.error("Error fetching project:", projectError);
      setError("Failed to load project");
      return;
    }

    setProject(projectData);

    if (projectData.client_id) {
      const { data: clientData } = await supabase
        .from("clients")
        .select("id, name")
        .eq("id", projectData.client_id)
        .single();

      if (clientData) {
        setClient(clientData);
      }
    }
  }

  async function loadTasks() {
    if (!projectId) return;
    const result = await fetchProjectTasks(projectId);
    if (result.success && result.data) {
      setTasks(result.data);
    }
  }

  async function loadProgress() {
    if (!projectId) return;
    const progressData = await getProjectProgress(projectId);
    if (progressData) {
      setProgress(progressData);
    }
  }

  async function loadDocuments() {
    if (!projectId) return;
    const result = await fetchProjectFiles(projectId);
    if (result.success && result.data) {
      setDocuments(result.data);
    }
  }

  async function loadDailyLogs() {
    if (!projectId) return;
    const result = await fetchDailyLogs(projectId);
    if (result.success && result.data) {
      setDailyLogs(result.data);
    }
  }

  async function loadPhotos() {
    if (!projectId) return;
    const result = await fetchProjectPhotos(projectId);
    if (result.success && result.data) {
      setPhotos(result.data);
    }
  }

  async function loadActivities() {
    if (!projectId) return;
    const result = await fetchProjectActivity(projectId, 20);
    if (result.success && result.data) {
      setActivities(result.data);
    }
  }

  async function loadInvoices() {
    if (!projectId) return;
    const result = await fetchClientInvoices(projectId);
    if (result.success && result.data) {
      setInvoices(result.data);
    }
  }

  async function loadPayments() {
    if (!projectId) return;
    const result = await fetchClientPayments(projectId);
    if (result.success && result.data) {
      setPayments(result.data);
    }
  }

  async function loadFinancialSummary() {
    if (!projectId) return;
    const result = await getClientFinancialSummary(projectId);
    if (result.success && result.data) {
      setFinancialSummary(result.data);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950">
        <div className="p-6 text-sm text-slate-400">Loading project...</div>
      </div>
    );
  }

  if (error || !hasAccess || !project) {
    return (
      <div className="min-h-screen bg-slate-950">
        <div className="p-6 space-y-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-200">Access Denied</h1>
            <p className="text-slate-400 mt-1">{error || "You do not have access to this project."}</p>
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

  const projectStatusColors = {
    planning: "bg-blue-500/20 text-blue-400",
    active: "bg-green-500/20 text-green-400",
    on_hold: "bg-yellow-500/20 text-yellow-400",
    completed: "bg-slate-500/20 text-slate-400",
    cancelled: "bg-red-500/20 text-red-400",
  };

  const statusLabel = project.status.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="border-b border-slate-800 bg-slate-900/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-200">Client Portal</h1>
            <p className="text-sm text-slate-400 mt-0.5">Project Information</p>
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
              <h2 className="text-2xl font-semibold text-slate-200">{project.name}</h2>
              {client && (
                <p className="text-sm text-slate-400 mt-1">Client: {client.name}</p>
              )}
            </div>
            <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${projectStatusColors[project.status]}`}>
              {statusLabel}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            {project.site_address && (
              <div>
                <div className="text-xs text-slate-500 mb-1">Site Address</div>
                <div className="text-sm text-slate-300">{project.site_address}</div>
              </div>
            )}
            {project.start_date && (
              <div>
                <div className="text-xs text-slate-500 mb-1">Start Date</div>
                <div className="text-sm text-slate-300">
                  {new Date(project.start_date).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </div>
              </div>
            )}
            {project.end_date && (
              <div>
                <div className="text-xs text-slate-500 mb-1">End Date</div>
                <div className="text-sm text-slate-300">
                  {new Date(project.end_date).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </div>
              </div>
            )}
          </div>

          {project.notes && (
            <div className="mt-4">
              <div className="text-xs text-slate-500 mb-1">Notes</div>
              <div className="text-sm text-slate-300 whitespace-pre-wrap">{project.notes}</div>
            </div>
          )}
        </div>

        {progress && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6">
            <div className="text-sm font-semibold text-slate-200 mb-4">Project Progress</div>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">Overall Progress</span>
                  <span className="text-sm font-medium text-slate-300">{progress.progress_percent}%</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all"
                    style={{ width: `${progress.progress_percent}%` }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="text-center">
                  <div className="text-2xl font-semibold text-slate-200">{progress.total_tasks}</div>
                  <div className="text-xs text-slate-500 mt-1">Total Tasks</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-semibold text-green-400">{progress.completed_tasks}</div>
                  <div className="text-xs text-slate-500 mt-1">Completed</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {financialSummary && (financialSummary.total_invoiced > 0 || financialSummary.total_paid > 0) && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6">
            <div className="text-sm font-semibold text-slate-200 mb-4">Financial Summary</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 rounded-xl bg-slate-950/40 border border-slate-800">
                <div className="text-2xl font-semibold text-blue-400">${formatCurrency(financialSummary.total_invoiced)}</div>
                <div className="text-xs text-slate-500 mt-1">Total Invoiced</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-slate-950/40 border border-slate-800">
                <div className="text-2xl font-semibold text-green-400">${formatCurrency(financialSummary.total_paid)}</div>
                <div className="text-xs text-slate-500 mt-1">Total Paid</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-slate-950/40 border border-slate-800">
                <div className="text-2xl font-semibold text-yellow-400">${formatCurrency(financialSummary.balance_due)}</div>
                <div className="text-xs text-slate-500 mt-1">Balance Due</div>
              </div>
              {financialSummary.overdue_amount > 0 && (
                <div className="text-center p-4 rounded-xl bg-red-950/40 border border-red-800">
                  <div className="text-2xl font-semibold text-red-400">${formatCurrency(financialSummary.overdue_amount)}</div>
                  <div className="text-xs text-slate-500 mt-1">Overdue</div>
                </div>
              )}
            </div>
          </div>
        )}

        {invoices.length > 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
            <div className="text-sm font-semibold text-slate-200 mb-4">Invoices</div>
            <div className="space-y-2">
              {invoices.map((invoice) => (
                <div key={invoice.id} className="p-4 rounded-xl border border-slate-800 bg-slate-950/40">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-sm font-medium text-slate-200">{invoice.invoice_number}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Due: {new Date(invoice.due_date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                      invoice.status === 'paid' ? 'bg-green-500/20 text-green-400' :
                      invoice.status === 'overdue' ? 'bg-red-500/20 text-red-400' :
                      invoice.status === 'partial' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-blue-500/20 text-blue-400'
                    }`}>
                      {invoice.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mt-3 pt-3 border-t border-slate-800">
                    <div>
                      <div className="text-xs text-slate-500">Total</div>
                      <div className="text-sm font-medium text-slate-300">${formatCurrency(invoice.total_amount)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Paid</div>
                      <div className="text-sm font-medium text-green-400">${formatCurrency(invoice.amount_paid)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Balance</div>
                      <div className="text-sm font-medium text-yellow-400">${formatCurrency(invoice.balance_due)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {payments.length > 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
            <div className="text-sm font-semibold text-slate-200 mb-4">Payment History</div>
            <div className="space-y-2">
              {payments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-950/40">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div className="text-sm font-medium text-slate-200">{payment.payment_number}</div>
                      {payment.invoice_number && (
                        <>
                          <div className="text-xs text-slate-600">→</div>
                          <div className="text-xs text-slate-400">{payment.invoice_number}</div>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                      <span>{new Date(payment.payment_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}</span>
                      <span>{payment.payment_method.replace(/_/g, ' ')}</span>
                      {payment.reference_number && <span>Ref: {payment.reference_number}</span>}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-green-400">${formatCurrency(payment.amount)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="text-sm font-semibold text-slate-200 mb-4">Project Schedule</div>
          {tasks.length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-8">
              No tasks scheduled yet
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => (
                <div key={task.id} className="p-3 rounded-xl border border-slate-800 bg-slate-950/40">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-200">{task.task_name}</div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                        {task.start_date && (
                          <span>Start: {new Date(task.start_date).toLocaleDateString()}</span>
                        )}
                        {task.end_date && (
                          <span>End: {new Date(task.end_date).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                      task.status === 'complete' ? 'bg-green-500/20 text-green-400' :
                      task.status === 'active' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-slate-500/20 text-slate-400'
                    }`}>
                      {task.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="text-sm font-semibold text-slate-200 mb-4">Project Documents</div>
          {documents.length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-8">
              No documents available
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-950/40 hover:bg-slate-900/50 transition">
                  <div className="flex-1">
                    <div className="text-sm text-slate-300">{doc.file_name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {new Date(doc.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </div>
                  </div>
                  <a
                    href={doc.file_url}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition"
                  >
                    Download
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="text-sm font-semibold text-slate-200 mb-4">Daily Site Log</div>
          {dailyLogs.length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-8">
              No site logs available
            </div>
          ) : (
            <div className="space-y-3">
              {dailyLogs.map((log) => (
                <div key={log.id} className="p-4 rounded-xl border border-slate-800 bg-slate-950/40">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-medium text-slate-200">
                      {new Date(log.log_date).toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </div>
                    {log.weather && (
                      <span className="text-xs text-slate-400">{log.weather}</span>
                    )}
                  </div>
                  {log.work_performed && (
                    <div className="mb-2">
                      <div className="text-xs text-slate-500 mb-1">Work Performed</div>
                      <div className="text-sm text-slate-300">{log.work_performed}</div>
                    </div>
                  )}
                  {log.deliveries && (
                    <div className="mb-2">
                      <div className="text-xs text-slate-500 mb-1">Deliveries</div>
                      <div className="text-sm text-slate-300">{log.deliveries}</div>
                    </div>
                  )}
                  {log.issues && (
                    <div className="mb-2">
                      <div className="text-xs text-slate-500 mb-1">Issues</div>
                      <div className="text-sm text-slate-300">{log.issues}</div>
                    </div>
                  )}
                  {log.notes && (
                    <div>
                      <div className="text-xs text-slate-500 mb-1">Notes</div>
                      <div className="text-sm text-slate-300">{log.notes}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="text-sm font-semibold text-slate-200 mb-4">Project Photo Log</div>
          {photos.length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-8">
              No photos available
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/40 overflow-hidden"
                >
                  <div className="aspect-square bg-slate-900 relative">
                    <img
                      src={(photo as any).publicUrl}
                      alt={photo.caption || 'Project photo'}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-3 space-y-1">
                    {photo.caption && (
                      <div className="text-sm text-slate-300">{photo.caption}</div>
                    )}
                    <div className="text-xs text-slate-500">
                      {new Date(photo.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="text-sm font-semibold text-slate-200 mb-4">Recent Activity</div>
          {activities.length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-8">
              No activity yet
            </div>
          ) : (
            <div className="space-y-2">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 flex items-start gap-3"
                >
                  <div className="text-xl mt-0.5">
                    {getActivityIcon(activity.activity_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${getActivityColor(activity.activity_type)}`}>
                      {activity.message}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {activity.user_profile && (
                        <div className="text-xs text-slate-500">
                          {activity.user_profile.full_name || activity.user_profile.email || 'User'}
                        </div>
                      )}
                      <div className="text-xs text-slate-600">•</div>
                      <div className="text-xs text-slate-500">
                        {new Date(activity.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
