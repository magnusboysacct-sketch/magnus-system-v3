import { supabase } from "./supabase";

export type WorkerType = "employee" | "subcontractor" | "crew_lead";
export type WorkerStatus = "active" | "inactive" | "terminated";
export type PayType = "hourly" | "salary" | "contract";

export interface Worker {
  id: string;
  company_id: string;
  worker_type: WorkerType;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  hire_date?: string | null;
  termination_date?: string | null;
  status: WorkerStatus;
  pay_type?: PayType | null;
  pay_rate?: number | null;
  overtime_rate?: number | null;
  ssn_last_4?: string | null;
  employee_id?: string | null;
  bank_account_number?: string | null;
  bank_routing_number?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
}

export interface TimeEntry {
  id: string;
  company_id: string;
  worker_id: string;
  project_id?: string | null;
  entry_date: string;
  clock_in?: string | null;
  clock_out?: string | null;
  regular_hours: number;
  overtime_hours: number;
  notes?: string | null;
  approved: boolean;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Crew {
  id: string;
  company_id: string;
  name: string;
  crew_lead_id?: string | null;
  status: "active" | "inactive";
  created_at?: string;
  updated_at?: string;
}

export async function fetchWorkers(companyId: string) {
  const { data, error } = await supabase
    .from("workers")
    .select("*")
    .eq("company_id", companyId)
    .order("last_name", { ascending: true });

  if (error) throw error;
  return data as Worker[];
}

export async function createWorker(worker: Partial<Worker>) {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("workers")
    .insert([
      {
        ...worker,
        created_by: user?.id,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data as Worker;
}

export async function updateWorker(id: string, updates: Partial<Worker>) {
  const { data, error } = await supabase
    .from("workers")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Worker;
}

export async function deleteWorker(id: string) {
  const { error } = await supabase.from("workers").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchTimeEntries(companyId: string, startDate?: string, endDate?: string) {
  let query = supabase
    .from("time_entries")
    .select("*, workers(first_name, last_name), projects(name)")
    .eq("company_id", companyId);

  if (startDate) query = query.gte("entry_date", startDate);
  if (endDate) query = query.lte("entry_date", endDate);

  const { data, error } = await query.order("entry_date", { ascending: false });

  if (error) throw error;
  return data;
}

export async function createTimeEntry(entry: Partial<TimeEntry>) {
  const { data, error } = await supabase
    .from("time_entries")
    .insert([entry])
    .select()
    .single();

  if (error) throw error;
  return data as TimeEntry;
}

export async function approveTimeEntry(id: string) {
  const { data: { user } } = await supabase.auth.getUser();

  const { data: timeEntry, error: fetchError } = await supabase
    .from("time_entries")
    .select("*, workers(first_name, last_name, pay_rate, pay_type)")
    .eq("id", id)
    .single();

  if (fetchError) throw fetchError;

  const { data, error } = await supabase
    .from("time_entries")
    .update({
      approved: true,
      approved_by: user?.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  if (timeEntry && timeEntry.project_id && timeEntry.workers) {
    const worker = timeEntry.workers;
    const payRate = Number(worker.pay_rate) || 0;
    const regularHours = Number(timeEntry.regular_hours) || 0;
    const overtimeHours = Number(timeEntry.overtime_hours) || 0;
    const overtimeRate = payRate * 1.5;

    const laborCost = (regularHours * payRate) + (overtimeHours * overtimeRate);

    if (laborCost > 0) {
      const workerName = `${worker.first_name} ${worker.last_name}`;
      const totalHours = regularHours + overtimeHours;
      const description = `${workerName} - ${totalHours}h (${regularHours}h regular${overtimeHours > 0 ? `, ${overtimeHours}h OT` : ""})`;

      const { error: costError } = await supabase
        .from("project_costs")
        .insert({
          project_id: timeEntry.project_id,
          cost_type: "labor",
          source_id: id,
          source_type: "time_entry",
          description,
          amount: laborCost,
          cost_date: timeEntry.entry_date,
          notes: `Auto-created from approved time entry`,
        });

      if (costError) {
        console.error("Error creating project_cost from time entry:", costError);
      }
    }
  }

  return data;
}

export async function fetchCrews(companyId: string) {
  const { data, error } = await supabase
    .from("crews")
    .select("*, workers!crews_crew_lead_id_fkey(first_name, last_name)")
    .eq("company_id", companyId)
    .order("name", { ascending: true });

  if (error) throw error;
  return data;
}

export async function createCrew(crew: Partial<Crew>) {
  const { data, error} = await supabase
    .from("crews")
    .insert([crew])
    .select()
    .single();

  if (error) throw error;
  return data as Crew;
}
