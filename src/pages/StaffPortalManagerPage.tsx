// src/pages/StaffPortalManagerPage.tsx — Director/Admin management side of the
// worker portal: post/edit/delete notices, reply to worker messages.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  PageHeader, Card, Badge, Btn, Input, Select, Field, Textarea,
  Empty, Modal, Tabs, Alert, cn
} from "../components/ui";
import { Plus, Pin, Edit2, Trash2, Send, MessageSquare, Megaphone } from "lucide-react";

type NoticeVisibility = "all" | "internal_staff" | "site_workers";
type ManagerTab = "notices" | "messages";

interface Notice {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  visible_to: NoticeVisibility;
  expires_at: string | null;
  posted_by: string | null;
  created_at: string;
  poster?: { full_name: string | null } | null;
}

interface Message {
  id: string;
  worker_user_id: string;
  sender_type: "worker" | "management";
  body: string;
  read_by_worker: boolean;
  read_by_management: boolean;
  created_at: string;
  worker_profile?: { full_name: string | null; email: string | null } | null;
}

interface Thread {
  workerUserId: string;
  workerName: string;
  lastBody: string;
  lastAt: string;
  unread: number;
}

const EMPTY_FORM = { title: "", body: "", pinned: false, visible_to: "all" as NoticeVisibility, expires_at: "" };

const VISIBILITY_LABEL: Record<NoticeVisibility, string> = {
  all: "All Workers",
  internal_staff: "Internal Staff Only",
  site_workers: "Site Workers Only",
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtTime(d: string) {
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function StaffPortalManagerPage() {
  const [tab, setTab] = useState<ManagerTab>("notices");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [notices, setNotices] = useState<Notice[]>([]);
  const [loadingNotices, setLoadingNotices] = useState(true);
  const [noticesError, setNoticesError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      supabase.from("user_profiles").select("company_id").eq("id", user.id).maybeSingle()
        .then(({ data }) => { if (data?.company_id) setCompanyId(data.company_id); });
    });
  }, []);

  useEffect(() => {
    if (!companyId) return;
    loadNotices();
    loadMessages();
  }, [companyId]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [selectedWorkerId, messages]);

  async function loadNotices() {
    if (!companyId) return;
    setLoadingNotices(true);
    setNoticesError(null);
    const { data, error } = await supabase
      .from("worker_portal_notices")
      .select("*, poster:posted_by(full_name)")
      .eq("company_id", companyId)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      console.error("loadNotices error:", error);
      setNoticesError(`${error.message}${(error as any).hint ? ` — ${(error as any).hint}` : ""}`);
    } else {
      setNotices((data || []) as unknown as Notice[]);
    }
    setLoadingNotices(false);
  }

  async function loadMessages() {
    if (!companyId) return;
    setLoadingMessages(true);
    setMessagesError(null);
    const { data, error } = await supabase
      .from("worker_portal_messages")
      .select("*, worker_profile:worker_user_id(full_name, email)")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("loadMessages error:", error);
      setMessagesError(`${error.message}${(error as any).hint ? ` — ${(error as any).hint}` : ""}`);
    } else {
      setMessages((data || []) as unknown as Message[]);
    }
    setLoadingMessages(false);
  }

  const threads: Thread[] = useMemo(() => {
    const map = new Map<string, Thread>();
    for (const m of messages) {
      if (!map.has(m.worker_user_id)) {
        map.set(m.worker_user_id, {
          workerUserId: m.worker_user_id,
          workerName: m.worker_profile?.full_name || "Unknown Worker",
          lastBody: m.body,
          lastAt: m.created_at,
          unread: 0,
        });
      }
      if (m.sender_type === "worker" && !m.read_by_management) {
        map.get(m.worker_user_id)!.unread++;
      }
    }
    return Array.from(map.values());
  }, [messages]);

  const threadMessages = useMemo(() => {
    return messages
      .filter(m => m.worker_user_id === selectedWorkerId)
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [messages, selectedWorkerId]);

  async function openThread(workerUserId: string) {
    setSelectedWorkerId(workerUserId);
    const hasUnread = messages.some(m => m.worker_user_id === workerUserId && m.sender_type === "worker" && !m.read_by_management);
    if (!hasUnread) return;
    await supabase.from("worker_portal_messages").update({ read_by_management: true })
      .eq("worker_user_id", workerUserId).eq("sender_type", "worker").eq("read_by_management", false);
    setMessages(prev => prev.map(m =>
      m.worker_user_id === workerUserId && m.sender_type === "worker" ? { ...m, read_by_management: true } : m
    ));
  }

  async function sendReply() {
    if (!replyText.trim() || !selectedWorkerId || sendingReply) return;
    if (!companyId || !userId) {
      alert("Not ready yet — please wait a moment and try again.");
      return;
    }
    setSendingReply(true);
    try {
      const { error } = await supabase.from("worker_portal_messages").insert({
        company_id: companyId,
        worker_user_id: selectedWorkerId,
        sender_type: "management",
        sender_id: userId,
        body: replyText.trim(),
        read_by_worker: false,
        read_by_management: true,
      });
      if (error) {
        console.error("Error sending reply:", error);
        alert("Failed to send message: " + error.message);
        return;
      }
      setReplyText("");
      await loadMessages();
    } catch (e: any) {
      console.error("Exception sending reply:", e);
      alert("Unexpected error: " + e.message);
    } finally {
      setSendingReply(false);
    }
  }

  function openCreateModal() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setModalOpen(true);
  }

  function openEditModal(n: Notice) {
    setForm({
      title: n.title,
      body: n.body,
      pinned: n.pinned,
      visible_to: n.visible_to,
      expires_at: n.expires_at ? n.expires_at.slice(0, 10) : "",
    });
    setEditingId(n.id);
    setModalOpen(true);
  }

  async function saveNotice() {
    if (!form.title.trim() || !form.body.trim() || saving) return;
    if (!companyId) {
      alert("Company not loaded yet — please wait a moment and try again.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        body: form.body.trim(),
        pinned: form.pinned,
        visible_to: form.visible_to,
        expires_at: form.expires_at || null,
      };
      const { error, data } = editingId
        ? await supabase.from("worker_portal_notices").update(payload).eq("id", editingId).select()
        : await supabase.from("worker_portal_notices").insert({ ...payload, company_id: companyId, posted_by: userId }).select();

      console.log("SAVE NOTICE RESULT — error:", JSON.stringify(error), "data:", JSON.stringify(data));

      if (error) {
        console.error("Error saving notice:", error);
        alert("Insert failed: " + error.message + " | code: " + error.code + " | details: " + error.details);
        return;
      }
      await loadNotices();
      setModalOpen(false);
    } catch (e: any) {
      console.error("Exception saving notice:", e);
      alert("Unexpected error: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteNotice(id: string) {
    if (!confirm("Delete this notice? This cannot be undone.")) return;
    await supabase.from("worker_portal_notices").delete().eq("id", id);
    await loadNotices();
  }

  const totalUnread = threads.reduce((s, t) => s + t.unread, 0);
  const selectedThreadName = threads.find(t => t.workerUserId === selectedWorkerId)?.workerName;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Staff Portal"
        subtitle="Notices and messages for your worker portal"
        actions={tab === "notices" && (
          <Btn variant="primary" size="sm" icon={<Plus size={13} />} onClick={openCreateModal}>
            Post Notice
          </Btn>
        )}
      />

      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
        <Tabs
          tabs={[
            { key: "notices", label: "Notices", count: notices.length },
            { key: "messages", label: "Messages", count: totalUnread },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === "notices" && noticesError && (
          <Alert type="error">Couldn't load notices: {noticesError}</Alert>
        )}
        {tab === "messages" && messagesError && (
          <Alert type="error">Couldn't load messages: {messagesError}</Alert>
        )}

        {tab === "notices" && (
          loadingNotices ? (
            <div className="text-sm text-slate-500 dark:text-slate-600 py-8 text-center">Loading…</div>
          ) : notices.length === 0 ? (
            <Empty
              icon={<Megaphone size={22} />}
              title="No notices yet"
              body="Post your first announcement for your workers."
              action={<Btn variant="primary" size="sm" icon={<Plus size={13} />} onClick={openCreateModal}>Post Notice</Btn>}
            />
          ) : (
            <div className="space-y-3">
              {notices.map(n => {
                const expired = !!n.expires_at && new Date(n.expires_at) < new Date();
                return (
                  <Card key={n.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-2 mb-1.5">
                          {n.pinned && <Pin size={13} className="text-amber-500 flex-shrink-0" />}
                          <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{n.title}</div>
                          <Badge color={n.visible_to === "all" ? "slate" : n.visible_to === "internal_staff" ? "blue" : "cyan"}>
                            {VISIBILITY_LABEL[n.visible_to]}
                          </Badge>
                          {expired && <Badge color="red">Expired</Badge>}
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{n.body}</p>
                        <div className="text-xs text-slate-400 dark:text-slate-600 mt-2">
                          Posted by {n.poster?.full_name || "Management"} · {fmtDate(n.created_at)}
                          {n.expires_at && ` · Expires ${fmtDate(n.expires_at)}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Btn variant="ghost" size="sm" icon={<Edit2 size={13} />} onClick={() => openEditModal(n)} />
                        <Btn variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={() => deleteNotice(n.id)}
                          className="hover:text-red-600 dark:hover:text-red-400" />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )
        )}

        {tab === "messages" && (
          loadingMessages ? (
            <div className="text-sm text-slate-500 dark:text-slate-600 py-8 text-center">Loading…</div>
          ) : threads.length === 0 ? (
            <Empty icon={<MessageSquare size={22} />} title="No messages yet" body="Worker messages will appear here." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4" style={{ height: "65vh" }}>
              <Card padding={false} className="overflow-y-auto">
                {threads.map(t => (
                  <button
                    key={t.workerUserId}
                    onClick={() => openThread(t.workerUserId)}
                    className={cn(
                      "w-full text-left px-3.5 py-3 border-b border-slate-100 dark:border-white/[0.04] transition-colors",
                      selectedWorkerId === t.workerUserId ? "bg-cyan-50 dark:bg-cyan-500/[0.08]" : "hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{t.workerName}</div>
                      {t.unread > 0 && (
                        <span className="flex-shrink-0 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                          {t.unread}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-600 truncate mt-0.5">{t.lastBody}</div>
                  </button>
                ))}
              </Card>

              <Card padding={false} className="flex flex-col">
                {!selectedWorkerId ? (
                  <div className="flex-1 flex items-center justify-center text-sm text-slate-400 dark:text-slate-600">
                    Select a worker to view the conversation
                  </div>
                ) : (
                  <>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                      {threadMessages.map(m => (
                        <div key={m.id} className={cn("flex", m.sender_type === "management" ? "justify-end" : "justify-start")}>
                          <div className={cn(
                            "max-w-[75%] rounded-2xl px-4 py-2.5",
                            m.sender_type === "management"
                              ? "bg-blue-600 text-white"
                              : "bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                          )}>
                            <div className="text-sm whitespace-pre-wrap">{m.body}</div>
                            <div className={cn("text-[10px] mt-1", m.sender_type === "management" ? "text-blue-100" : "text-slate-500 dark:text-slate-400")}>
                              {m.sender_type === "management" ? "You" : selectedThreadName} · {fmtTime(m.created_at)}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div ref={threadEndRef} />
                    </div>
                    <div className="flex gap-2 p-3 border-t border-slate-200 dark:border-white/[0.06]">
                      <Input
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                        placeholder="Type a reply..."
                      />
                      <Btn variant="primary" icon={<Send size={13} />} disabled={!replyText.trim() || sendingReply} onClick={sendReply}>
                        Send
                      </Btn>
                    </div>
                  </>
                )}
              </Card>
            </div>
          )
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? "Edit Notice" : "Post New Notice"} width="max-w-lg">
        <div className="space-y-4">
          <Field label="Title">
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Site closed for holiday" />
          </Field>
          <Field label="Body / Message">
            <Textarea rows={5} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} placeholder="Write the announcement..." />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Visible to">
              <Select value={form.visible_to} onChange={e => setForm(f => ({ ...f, visible_to: e.target.value as NoticeVisibility }))}>
                <option value="all">All Workers</option>
                <option value="internal_staff">Internal Staff Only</option>
                <option value="site_workers">Site Workers Only</option>
              </Select>
            </Field>
            <Field label="Expires (optional)">
              <Input type="date" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer">
            <input type="checkbox" checked={form.pinned} onChange={e => setForm(f => ({ ...f, pinned: e.target.checked }))} className="rounded" />
            Pin this notice
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Btn>
            <Btn variant="primary" disabled={!form.title.trim() || !form.body.trim() || saving} onClick={saveNotice}>
              {saving ? "Saving..." : editingId ? "Save Changes" : "Post Notice"}
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
