// src/pages/AccessLogPage.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import { PageHeader, Card, Badge, Table, Th, Tr, Td, Empty } from "../components/ui";
import { Shield, RefreshCw, Clock, User } from "lucide-react";

interface LogEntry {
  id: string;
  scanned_at: string;
  action: string;
  device_info: string;
  worker: {
    first_name: string;
    last_name: string;
    worker_type: string;
    status: string;
    passport_photo_url?: string | null;
    id_photo_url?: string | null;
    employee_id?: string | null;
  };
}

function timeAgo(dt: string) {
  const diff = Math.floor((Date.now() - new Date(dt).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(dt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function deviceShort(ua: string) {
  if (!ua) return "Unknown device";
  if (/iPhone|iPad/i.test(ua)) return "iPhone/iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Mac/i.test(ua)) return "Mac";
  return "Browser";
}

function roleLabel(t?: string) {
  return (t || "worker").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export default function AccessLogPage() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
      if (profile?.company_id) {
        setCompanyId(profile.company_id);
        await loadLogs(profile.company_id);
      }
    }
    init();
  }, []);

  async function loadLogs(cid: string) {
    setLoading(true);
    const { data } = await supabase
      .from("access_logs")
      .select(`id, scanned_at, action, device_info, worker:worker_id(first_name, last_name, worker_type, status, passport_photo_url, id_photo_url, employee_id)`)
      .eq("company_id", cid)
      .order("scanned_at", { ascending: false })
      .limit(100);
    setLogs((data as any) || []);
    setLoading(false);
  }

  const todayCount = logs.filter(l => {
    const d = new Date(l.scanned_at);
    const now = new Date();
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth();
  }).length;

  const uniqueWorkers = new Set(logs.map(l => l.worker?.first_name + l.worker?.last_name)).size;

  return (
    <div className="space-y-6 p-6">
      <div className="mb-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">
          ← Back
        </button>
      </div>
      <PageHeader
        title="Access Log"
        subtitle="Every QR scan recorded in real time"
        actions={
          <button onClick={() => companyId && loadLogs(companyId)}
            className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors">
            <RefreshCw size={15} />
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="text-xs text-slate-500 mb-1">Total Scans</div>
          <div className="text-2xl font-bold text-slate-100">{logs.length}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 mb-1">Today</div>
          <div className="text-2xl font-bold text-cyan-400">{todayCount}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 mb-1">Unique Workers</div>
          <div className="text-2xl font-bold text-slate-100">{uniqueWorkers}</div>
        </Card>
      </div>

      {/* Log Table */}
      <Card padding={false}>
        {loading ? (
          <div className="flex items-center justify-center py-16 text-xs text-slate-600">
            <RefreshCw size={14} className="animate-spin mr-2" /> Loading logs...
          </div>
        ) : logs.length === 0 ? (
          <Empty
            icon={<Shield size={20} />}
            title="No scans yet"
            body="Access logs will appear here when workers scan their QR codes."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Worker</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Device</Th>
                <Th>Time</Th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const w = log.worker;
                const photo = w?.passport_photo_url || w?.id_photo_url || "";
                const authorized = w?.status === "active";
                return (
                  <Tr key={log.id}>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-700 flex-shrink-0 flex items-center justify-center">
                          {photo
                            ? <img src={photo} alt={w?.first_name} className="w-full h-full object-cover" />
                            : <User size={14} className="text-slate-500" />
                          }
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-200">
                            {w?.first_name} {w?.last_name}
                          </div>
                          {w?.employee_id && <div className="text-[10px] text-slate-600">#{w.employee_id}</div>}
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <span className="text-[11px] text-slate-400">{roleLabel(w?.worker_type)}</span>
                    </Td>
                    <Td>
                      <Badge color={authorized ? "green" : "red"} dot>
                        {authorized ? "Authorized" : "Denied"}
                      </Badge>
                    </Td>
                    <Td>
                      <span className="text-[11px] text-slate-500">{deviceShort(log.device_info)}</span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1 text-[11px] text-slate-500">
                        <Clock size={11} />
                        <span>{timeAgo(log.scanned_at)}</span>
                      </div>
                      <div className="text-[10px] text-slate-700">
                        {new Date(log.scanned_at).toLocaleTimeString()}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
