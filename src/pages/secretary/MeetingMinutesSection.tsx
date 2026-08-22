// src/pages/secretary/MeetingMinutesSection.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Plus, FileText, Pencil, Trash2, ChevronDown, ChevronRight, CalendarDays } from "lucide-react";
import { Card, CardHeader, Btn, Badge, Modal, Field, Input, Textarea, Select, Alert, Spinner, Empty } from "../../components/ui";
import { supabase } from "../../lib/supabase";

type MeetingMinutes = {
  id: string;
  title: string;
  meeting_date: string;
  attendees: string | null;
  notes: string | null;
  related_event_id: string | null;
  created_at: string;
};

// Minimal shape needed here — just enough to populate the link dropdown
// and show a linked event's real title/date, not a full scheduled_events
// record.
type EventOption = {
  id: string;
  title: string;
  event_date: string;
};

// UTC-midnight-safe parsing — same discipline established in
// SchedulingSection.tsx/TaskTrackerSection.tsx: new Date(isoString) treats
// a bare "YYYY-MM-DD" as UTC midnight, which can silently shift a day off
// depending on the browser's timezone.
function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function formatDate(iso: string): string {
  return parseDate(iso).toLocaleDateString("en-JM", { year: "numeric", month: "long", day: "numeric" });
}

function notesPreview(notes: string | null): string {
  if (!notes) return "No notes recorded.";
  const firstLine = notes.split("\n").find(l => l.trim().length > 0) || notes;
  return firstLine.length > 120 ? firstLine.slice(0, 120) + "…" : firstLine;
}

export default function MeetingMinutesSection() {
  const [companyId, setCompanyId] = useState<string>("");
  const [minutes, setMinutes] = useState<MeetingMinutes[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [actionErr, setActionErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Add/Edit modal state — editingId null means creating new (insert on
  // save); set means editing that row (update, no duplicate).
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [attendees, setAttendees] = useState("");
  const [notes, setNotes] = useState("");
  const [relatedEventId, setRelatedEventId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  useEffect(() => { init(); }, []);

  async function init() {
    setLoading(true);
    setLoadErr("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadErr("Not signed in."); setLoading(false); return; }

      const { data: profile, error: profileErr } = await supabase
        .from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
      if (profileErr || !profile?.company_id) { setLoadErr("Could not load company."); setLoading(false); return; }
      setCompanyId(profile.company_id);

      const [{ data: minutesData, error: minutesErr }, { data: eventsData, error: eventsErr }] = await Promise.all([
        supabase.from("meeting_minutes")
          .select("id, title, meeting_date, attendees, notes, related_event_id, created_at")
          .eq("company_id", profile.company_id)
          .order("meeting_date", { ascending: false }),
        supabase.from("scheduled_events")
          .select("id, title, event_date")
          .eq("company_id", profile.company_id)
          .order("event_date", { ascending: false }),
      ]);
      if (minutesErr) throw minutesErr;
      if (eventsErr) throw eventsErr;
      setMinutes((minutesData || []) as MeetingMinutes[]);
      setEvents((eventsData || []) as EventOption[]);
    } catch (e: any) {
      setLoadErr(e.message || "Failed to load meeting minutes.");
    }
    setLoading(false);
  }

  const eventsById = useMemo(() => new Map(events.map(e => [e.id, e])), [events]);

  function openAdd() {
    setEditingId(null);
    setTitle("");
    setMeetingDate("");
    setAttendees("");
    setNotes("");
    setRelatedEventId("");
    setSaveErr("");
    setModalOpen(true);
  }

  function openEdit(m: MeetingMinutes) {
    setEditingId(m.id);
    setTitle(m.title);
    setMeetingDate(m.meeting_date);
    setAttendees(m.attendees || "");
    setNotes(m.notes || "");
    setRelatedEventId(m.related_event_id || "");
    setSaveErr("");
    setModalOpen(true);
  }

  async function saveMinutes() {
    if (!title.trim()) { setSaveErr("Enter a title."); return; }
    if (!meetingDate) { setSaveErr("Pick a meeting date."); return; }
    setSaving(true);
    setSaveErr("");
    try {
      const payload = {
        title: title.trim(),
        meeting_date: meetingDate,
        attendees: attendees.trim() || null,
        notes: notes.trim() || null,
        related_event_id: relatedEventId || null,
      };
      if (editingId) {
        const { error: updateErr } = await supabase.from("meeting_minutes").update(payload).eq("id", editingId);
        if (updateErr) throw updateErr;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error: insertErr } = await supabase.from("meeting_minutes").insert({
          ...payload,
          company_id: companyId,
          created_by: user?.id || null,
        });
        if (insertErr) throw insertErr;
      }
      setModalOpen(false);
      setEditingId(null);
      await init();
    } catch (e: any) {
      setSaveErr(e.message || "Failed to save minutes.");
    }
    setSaving(false);
  }

  async function deleteMinutes(m: MeetingMinutes) {
    if (!window.confirm(`Delete "${m.title}"? This can't be undone.`)) return;
    setBusyId(m.id);
    setActionErr("");
    const { error: err } = await supabase.from("meeting_minutes").delete().eq("id", m.id);
    if (err) setActionErr(err.message || "Failed to delete.");
    else await init();
    setBusyId(null);
  }

  if (loading) {
    return <div className="py-16 flex justify-center"><Spinner /></div>;
  }

  return (
    <div className="space-y-5">
      {loadErr && <Alert type="error">{loadErr}</Alert>}
      {actionErr && <Alert type="error" onClose={() => setActionErr("")}>{actionErr}</Alert>}

      <Card>
        <div className="flex items-center justify-between">
          <CardHeader title="Meeting Minutes" subtitle="Past meeting notes" />
          <Btn variant="primary" size="sm" icon={<Plus size={13} />} onClick={openAdd}>New Minutes</Btn>
        </div>

        {minutes.length === 0 ? (
          <Empty icon={<FileText size={22} />} title="No minutes recorded yet" body="Add your first meeting record above." />
        ) : (
          <div className="space-y-2">
            {minutes.map(m => {
              const expanded = expandedId === m.id;
              const linkedEvent = m.related_event_id ? eventsById.get(m.related_event_id) : null;
              return (
                <div key={m.id} className="rounded-lg border border-slate-200 dark:border-white/[0.06] overflow-hidden">
                  <button
                    onClick={() => setExpandedId(expanded ? null : m.id)}
                    className="w-full flex items-center justify-between py-2.5 px-3 text-left hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {expanded ? <ChevronDown size={13} className="text-slate-400 flex-shrink-0" /> : <ChevronRight size={13} className="text-slate-400 flex-shrink-0" />}
                      <FileText size={14} className="text-slate-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate block">{m.title}</span>
                        {!expanded && <span className="text-[11px] text-slate-500 truncate block">{notesPreview(m.notes)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 text-[11px] text-slate-500">
                      {m.attendees && <span className="hidden sm:inline">{m.attendees}</span>}
                      <span>{formatDate(m.meeting_date)}</span>
                    </div>
                  </button>

                  {expanded && (
                    <div className="px-3 pb-3 pt-1 border-t border-slate-200 dark:border-white/[0.06] space-y-3">
                      {linkedEvent && (
                        <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                          <CalendarDays size={11} />
                          Linked to <Badge color="slate">{linkedEvent.title} — {formatDate(linkedEvent.event_date)}</Badge>
                        </div>
                      )}
                      {m.attendees && (
                        <div className="text-xs">
                          <span className="font-semibold text-slate-600 dark:text-slate-400">Attendees: </span>
                          <span className="text-slate-500">{m.attendees}</span>
                        </div>
                      )}
                      <div className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                        {m.notes || "No notes recorded."}
                      </div>
                      <div className="flex items-center gap-1.5 pt-1">
                        <Btn variant="secondary" size="xs" icon={<Pencil size={11} />} onClick={() => openEdit(m)}>Edit</Btn>
                        <Btn variant="secondary" size="xs" icon={<Trash2 size={11} />} disabled={busyId === m.id} onClick={() => deleteMinutes(m)}>Delete</Btn>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingId(null); }}
        title={editingId ? "Edit Minutes" : "New Minutes"}
        width="max-w-lg"
      >
        <div className="space-y-4">
          <Field label="Title">
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Board Meeting — August 2026" />
          </Field>
          <Field label="Meeting Date">
            <Input type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} />
          </Field>
          <Field label="Attendees" hint="Optional — free text, e.g. a comma-separated list of names">
            <Input value={attendees} onChange={e => setAttendees(e.target.value)} placeholder="e.g. Veron Williams, Marcus Bailey, Andrea Fisher" />
          </Field>
          <Field label="Related Event" hint="Optional — link to the calendar entry this documents">
            <Select value={relatedEventId} onChange={e => setRelatedEventId(e.target.value)}>
              <option value="">— None —</option>
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.title} — {formatDate(ev.event_date)}</option>)}
            </Select>
          </Field>
          <Field label="Notes" hint="Optional — the actual minutes content">
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={8} />
          </Field>

          {saveErr && <Alert type="error">{saveErr}</Alert>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Btn variant="secondary" size="sm" onClick={() => { setModalOpen(false); setEditingId(null); }}>Cancel</Btn>
            <Btn variant="primary" size="sm" disabled={saving} onClick={saveMinutes}>{saving ? "Saving…" : editingId ? "Save Changes" : "Add Minutes"}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
