import { supabase } from "./supabase";

export interface ClientAccessInfo {
  hasAccess: boolean;
  isClientPortalUser: boolean;
  projectId: string;
}

export async function checkClientPortalAccess(projectId: string): Promise<ClientAccessInfo> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        hasAccess: false,
        isClientPortalUser: false,
        projectId,
      };
    }

    const { data, error } = await supabase
      .from("project_members")
      .select("client_portal_access, role")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !data) {
      return {
        hasAccess: false,
        isClientPortalUser: false,
        projectId,
      };
    }

    return {
      hasAccess: true,
      isClientPortalUser: data.client_portal_access === true,
      projectId,
    };
  } catch (e) {
    console.error("Exception checking client portal access:", e);
    return {
      hasAccess: false,
      isClientPortalUser: false,
      projectId,
    };
  }
}

export async function getClientProjects() {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, data: [], error: new Error("Not authenticated") };
    }

    const { data, error } = await supabase
      .from("project_members")
      .select(`
        project_id,
        client_portal_access,
        projects (
          id,
          name,
          status,
          start_date,
          end_date,
          client_id,
          clients (
            name
          )
        )
      `)
      .eq("user_id", user.id)
      .eq("client_portal_access", true);

    if (error) {
      console.error("Error fetching client projects:", error);
      return { success: false, data: [], error };
    }

    return { success: true, data: data || [] };
  } catch (e) {
    console.error("Exception fetching client projects:", e);
    return { success: false, data: [], error: e };
  }
}

export async function updateClientPortalAccess(projectId: string, userId: string, hasAccess: boolean) {
  try {
    const { error } = await supabase
      .from("project_members")
      .update({ client_portal_access: hasAccess })
      .eq("project_id", projectId)
      .eq("user_id", userId);

    if (error) {
      console.error("Error updating client portal access:", error);
      return { success: false, error };
    }

    return { success: true };
  } catch (e) {
    console.error("Exception updating client portal access:", e);
    return { success: false, error: e };
  }
}

export interface ClientInvoiceSummary {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  status: string;
}

export interface ClientPaymentHistory {
  id: string;
  payment_number: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  reference_number: string | null;
  invoice_number: string | null;
}

export async function fetchClientInvoices(projectId: string) {
  try {
    const { data, error } = await supabase
      .from("client_invoices")
      .select("id, invoice_number, invoice_date, due_date, total_amount, amount_paid, balance_due, status")
      .eq("project_id", projectId)
      .order("invoice_date", { ascending: false });

    if (error) {
      console.error("Error fetching client invoices:", error);
      return { success: false, data: [], error };
    }

    return { success: true, data: data as ClientInvoiceSummary[], error: null };
  } catch (e) {
    console.error("Exception fetching client invoices:", e);
    return { success: false, data: [], error: e };
  }
}

export async function fetchClientPayments(projectId: string) {
  try {
    const { data: project } = await supabase
      .from("projects")
      .select("client_id")
      .eq("id", projectId)
      .single();

    if (!project?.client_id) {
      return { success: true, data: [], error: null };
    }

    const { data, error } = await supabase
      .from("client_payments")
      .select(`
        id,
        payment_number,
        payment_date,
        amount,
        payment_method,
        reference_number,
        client_invoices (
          invoice_number
        )
      `)
      .eq("client_id", project.client_id)
      .order("payment_date", { ascending: false });

    if (error) {
      console.error("Error fetching client payments:", error);
      return { success: false, data: [], error };
    }

    const payments = data.map((p: any) => ({
      id: p.id,
      payment_number: p.payment_number,
      payment_date: p.payment_date,
      amount: p.amount,
      payment_method: p.payment_method,
      reference_number: p.reference_number,
      invoice_number: p.client_invoices?.invoice_number || null,
    }));

    return { success: true, data: payments as ClientPaymentHistory[], error: null };
  } catch (e) {
    console.error("Exception fetching client payments:", e);
    return { success: false, data: [], error: e };
  }
}

export async function getClientFinancialSummary(projectId: string) {
  try {
    const { data: project } = await supabase
      .from("projects")
      .select("client_id")
      .eq("id", projectId)
      .single();

    if (!project?.client_id) {
      return {
        success: true,
        data: {
          total_invoiced: 0,
          total_paid: 0,
          balance_due: 0,
          overdue_amount: 0,
        },
        error: null,
      };
    }

    const { data: invoices } = await supabase
      .from("client_invoices")
      .select("total_amount, amount_paid, balance_due, status, due_date")
      .eq("project_id", projectId);

    const totalInvoiced = invoices?.reduce((sum, inv) => sum + Number(inv.total_amount), 0) || 0;
    const totalPaid = invoices?.reduce((sum, inv) => sum + Number(inv.amount_paid), 0) || 0;
    const balanceDue = invoices?.reduce((sum, inv) => sum + Number(inv.balance_due), 0) || 0;

    const today = new Date().toISOString().split('T')[0];
    const overdueAmount = invoices
      ?.filter(inv => inv.status !== 'paid' && inv.due_date < today)
      .reduce((sum, inv) => sum + Number(inv.balance_due), 0) || 0;

    return {
      success: true,
      data: {
        total_invoiced: totalInvoiced,
        total_paid: totalPaid,
        balance_due: balanceDue,
        overdue_amount: overdueAmount,
      },
      error: null,
    };
  } catch (e) {
    console.error("Exception fetching client financial summary:", e);
    return {
      success: false,
      data: {
        total_invoiced: 0,
        total_paid: 0,
        balance_due: 0,
        overdue_amount: 0,
      },
      error: e,
    };
  }
}
