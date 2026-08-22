// src/pages/secretary/SchedulingSection.tsx
import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, MapPin, Users as UsersIcon, Plus, Pencil, Trash2, ChevronDown, ChevronRight, Briefcase } from "lucide-react";
import { Card, CardHeader, Btn, Badge, Modal, Field, Input, Textarea, Select, Alert, Spinner, Empty } from "../../components/ui";
import { supabase } from "../../lib/supabase";
import { useProjectContext } from "../../context/ProjectContext";

// event_type is free text (no fixed taxonomy, same reasoning as prior
// sections' category fields) — icon lookup below is a loose keyword match
// against common values, not an exhaustive/authoritative list.
type ScheduledEvent = {
  id: string;
  title: string;
  event_type: string | null;
  event_date: string;
  event_time: string | null;
  location: string | null;
  description: string | null;
  related_project_id: string | null;
  created_at: string;
};

function typeIcon(type: string | null) {
  const t = (type || "").toLowerCase();
  if (t.includes("site") || t.includes("visit")) return <MapPin size={13} className="text-emerald-400" />;
  if (t.includes("deadline")) return <CalendarDays size={13} className="text-red-400" />;
  if (t.includes("meeting") || t.includes("board")) return <UsersIcon size={13} className="text-cyan-400" />;
  return <CalendarDays size={13} className="text-slate-400" />;
}

function dateOnly(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// event_date comes back as "YYYY-MM-DD" — parsed as local calendar date
// components rather than via `new Date(iso)` (which treats a bare date
// string as UTC midnight and can shift a day off depending on the
// browser's timezone).
function parseEventDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatEventDate(iso: string): string {
  return parseEventDate(iso).toLocaleDateString("en-JM", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

// Postgres `time` comes back as "HH:MM:SS" (24h) — formatted to a plain
// 12h "h:MM AM/PM" string. Null means an all-day entry, not "unknown" —
// but a stored "00:00"/"00:00:00" is treated the same way (shown as no
// time badge at all, rather than "12:00 AM"). Root cause not fully
// confirmed — native <input type="time"> elements are known to sometimes
// commit "00:00" on partial interaction even when the user meant to leave
// it blank — but regardless of cause, a real event genuinely scheduled at
// exact midnight is vanishingly unlikely for this app's use, so treating
// midnight as "no time set" is the safer default. Flag if that assumption
// is ever wrong for a real case.
function formatEventTime(t: string | null): string | null {
  if (!t || t === "00:00" || t === "00:00:00") return null;
  const [hStr, mStr] = t.split(":");
  let h = parseInt(hStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${mStr} ${ampm}`;
}

type Bucket = "today" | "tomorrow" | "week" | "later";
const BUCKET_LABEL: Record<Bucket, string> = { today: "Today", tomorrow: "Tomorrow", week: "This Week", later: "Later" };
const BUCKET_ORDER: Bucket[] = ["today", "tomorrow", "week", "later"];

function bucketFor(eventDateIso: string): Bucket | "past" {
  const today = dateOnly(new Date());
  const diffDays = Math.round((parseEventDate(eventDateIso).getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return "past";
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays <= 7) return "week";
  return "later";
}

export default function SchedulingSection() {
  const { projects } = useProjectContext();

  const [companyId, setCompanyId] = useState<string>("");
  const [events, setEvents] = useState<ScheduledEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [actionErr, setActionErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  // Add/Edit modal state — editingId null means creating new (insert on
  // save); set means editing that row (update, no duplicate).
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [relatedProjectId, setRelatedProjectId] = useState("");
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

      const { data, error: eventsErr } = await supabase
        .from("scheduled_events")
        .select("id, title, event_type, event_date, event_time, location, description, related_project_id, created_at")
        .eq("company_id", profile.company_id)
        .order("event_date", { ascending: true })
        .order("event_time", { ascending: true, nullsFirst: true });
      if (eventsErr) throw eventsErr;
      setEvents((data || []) as ScheduledEvent[]);
    } catch (e: any) {
      setLoadErr(e.message || "Failed to load scheduled events.");
    }
    setLoading(false);
  }

  const projectName = (id: string | null) => (id ? projects.find(p => p.id === id)?.name || null : null);

  const grouped = useMemo(() => {
    const upcoming: Record<Bucket, ScheduledEvent[]> = { today: [], tomorrow: [], week: [], later: [] };
    const past: ScheduledEvent[] = [];
    for (const e of events) {
      const b = bucketFor(e.event_date);
      if (b === "past") past.push(e);
      else upcoming[b].push(e);
    }
    // Already ascending from the query for upcoming; past shown most-recent-first.
    past.sort((a, b) => (a.event_date < b.event_date ? 1 : a.event_date > b.event_date ? -1 : 0));
    return { upcoming, past };
  }, [events]);

  function openAdd() {
    setEditingId(null);
    setTitle("");
    setEventType("");
    setEventDate("");
    setEventTime("");
    setLocation("");
    setDescription("");
    setRelatedProjectId("");
    setSaveErr("");
    setModalOpen(true);
  }

  function openEdit(e: ScheduledEvent) {
    setEditingId(e.id);
    setTitle(e.title);
    setEventType(e.event_type || "");
    setEventDate(e.event_date);
    setEventTime(e.event_time ? e.event_time.slice(0, 5) : "");
    setLocation(e.location || "");
    setDescription(e.description || "");
    setRelatedProjectId(e.related_project_id || "");
    setSaveErr("");
    setModalOpen(true);
  }

  async function saveEvent() {
    if (!title.trim()) { setSaveErr("Enter a title."); return; }
    if (!eventDate) { setSaveErr("Pick a date."); return; }
    setSaving(true);
    setSaveErr("");
    try {
      const payload = {
        title: title.trim(),
        event_type: eventType.trim() || null,
        event_date: eventDate,
        event_time: eventTime || null,
        location: location.trim() || null,
        description: description.trim() || null,
        related_project_id: relatedProjectId || null,
      };
      if (editingId) {
        const { error: updateErr } = await supabase.from("scheduled_events").update(payload).eq("id", editingId);
        if (updateErr) throw updateErr;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error: insertErr } = await supabase.from("scheduled_events").insert({
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
      setSaveErr(e.message || "Failed to save event.");
    }
    setSaving(false);
  }

  async function deleteEvent(e: ScheduledEvent) {
    if (!window.confirm(`Delete "${e.title}"? This can't be undone.`)) return;
    setBusyId(e.id);
    setActionErr("");
    const { error: err } = await supabase.from("scheduled_events").delete().eq("id", e.id);
    if (err) setActionErr(err.message || "Failed to delete.");
    else await init();
    setBusyId(null);
  }

  function EventRow({ e, muted }: { e: ScheduledEvent; muted?: boolean }) {
    const pName = projectName(e.related_project_id);
    return (
      <div className={`flex items-center justify-between py-2.5 px-3 rounded-lg border border-slate-200 dark:border-white/[0.06] ${muted ? "opacity-60" : ""}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          {typeIcon(e.event_type)}
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{e.title}</div>
            <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
              <span>{formatEventDate(e.event_date)}</span>
              {e.location && <span>· {e.location}</span>}
              {pName && <span className="inline-flex items-center gap-1"><Briefcase size={10} />{pName}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {e.event_type && <Badge color="slate">{e.event_type}</Badge>}
          {formatEventTime(e.event_time) && <span className="text-[11px] text-slate-500">{formatEventTime(e.event_time)}</span>}
          <Btn variant="secondary" size="xs" icon={<Pencil size={11} />} onClick={() => openEdit(e)} />
          <Btn variant="secondary" size="xs" icon={<Trash2 size={11} />} disabled={busyId === e.id} onClick={() => deleteEvent(e)} />
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="py-16 flex justify-center"><Spinner /></div>;
  }

  const hasAnyUpcoming = BUCKET_ORDER.some(b => grouped.upcoming[b].length > 0);

  return (
    <div className="space-y-5">
      {loadErr && <Alert type="error">{loadErr}</Alert>}
      {actionErr && <Alert type="error" onClose={() => setActionErr("")}>{actionErr}</Alert>}

      <Card>
        <div className="flex items-center justify-between">
          <CardHeader title="Upcoming" subtitle="Meetings, site visits, and deadlines" />
          <Btn variant="primary" size="sm" icon={<Plus size={13} />} onClick={openAdd}>Add Event</Btn>
        </div>

        {!hasAnyUpcoming ? (
          <Empty icon={<CalendarDays size={22} />} title="Nothing scheduled" body="Add a meeting, site visit, or deadline above." />
        ) : (
          <div className="space-y-4">
            {BUCKET_ORDER.filter(b => grouped.upcoming[b].length > 0).map(b => (
              <div key={b}>
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 mb-1.5">{BUCKET_LABEL[b]}</div>
                <div className="space-y-2">
                  {grouped.upcoming[b].map(e => <EventRow key={e.id} e={e} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <button
          onClick={() => setShowPast(v => !v)}
          className="w-full flex items-center gap-2 text-left"
        >
          {showPast ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Past Events</span>
          <span className="text-[11px] text-slate-500">({grouped.past.length})</span>
        </button>
        {showPast && (
          <div className="space-y-2 mt-3">
            {grouped.past.length === 0 ? (
              <p className="text-xs text-slate-500">No past events on record.</p>
            ) : (
              grouped.past.map(e => <EventRow key={e.id} e={e} muted />)
            )}
          </div>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingId(null); }}
        title={editingId ? "Edit Event" : "Add Event"}
      >
        <div className="space-y-4">
          <Field label="Title">
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Client meeting — Harbor View Offices" />
          </Field>
          <Field label="Type" hint='e.g. "Meeting", "Site Visit", "Deadline"'>
            <Input value={eventType} onChange={e => setEventType(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <Input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} />
            </Field>
            <Field label="Time" hint="Optional — leave blank for all-day">
              <Input type="time" value={eventTime} onChange={e => setEventTime(e.target.value)} />
            </Field>
          </div>
          <Field label="Location" hint="Optional">
            <Input value={location} onChange={e => setLocation(e.target.value)} />
          </Field>
          <Field label="Related Project" hint="Optional">
            <Select value={relatedProjectId} onChange={e => setRelatedProjectId(e.target.value)}>
              <option value="">— None —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Description" hint="Optional">
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} />
          </Field>

          {saveErr && <Alert type="error">{saveErr}</Alert>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Btn variant="secondary" size="sm" onClick={() => { setModalOpen(false); setEditingId(null); }}>Cancel</Btn>
            <Btn variant="primary" size="sm" disabled={saving} onClick={saveEvent}>{saving ? "Saving…" : editingId ? "Save Changes" : "Add Event"}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
