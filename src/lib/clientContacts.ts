// Contact people for a client (client_contacts). One contact per client is the PRIMARY one; the database keeps the client's own
// contact_name / phone / email columns mirrored from it, so everything that already reads those columns keeps working unchanged.
// Marking a contact primary is a single update: the database un-marks the previous primary itself.
import { supabase } from "./supabase";

export interface ClientContact {
  id: string;
  company_id: string;
  client_id: string;
  name: string;
  title: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export const CONTACTS_NOT_READY_MESSAGE =
  "Contacts aren't switched on yet: the database update that creates the client_contacts table hasn't been applied.";

function isMissingTable(error: any): boolean {
  const msg = String(error?.message || error || "");
  return /client_contacts/i.test(msg) && /(does not exist|schema cache|could not find)/i.test(msg);
}

// Primary first, then by name.
export function sortContacts<T extends { is_primary: boolean; name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.is_primary === b.is_primary ? a.name.localeCompare(b.name) : a.is_primary ? -1 : 1));
}

export function primaryContactIdFor(contacts: ClientContact[], clientId: string | null | undefined): string {
  if (!clientId) return "";
  return contacts.find((c) => c.client_id === clientId && c.is_primary)?.id ?? "";
}

export async function fetchClientContacts(clientId: string): Promise<ClientContact[]> {
  const { data, error } = await supabase.from("client_contacts").select("*").eq("client_id", clientId);
  if (error) throw new Error(isMissingTable(error) ? CONTACTS_NOT_READY_MESSAGE : error.message);
  return sortContacts((data || []) as ClientContact[]);
}

// Every contact the signed-in user's company can see, for pickers. `available` is false (and the list empty) until the table exists,
// so a page using this keeps working before the database update has been applied.
export async function fetchCompanyContacts(): Promise<{ contacts: ClientContact[]; available: boolean }> {
  const { data, error } = await supabase.from("client_contacts").select("*").order("name", { ascending: true }).limit(5000);
  if (error) {
    if (isMissingTable(error)) return { contacts: [], available: false };
    throw error;
  }
  return { contacts: (data || []) as ClientContact[], available: true };
}

export interface ContactInput {
  name: string;
  title?: string | null;
  phone?: string | null;
  email?: string | null;
}

function clean(input: ContactInput): { name: string; title: string | null; phone: string | null; email: string | null } {
  const name = (input.name || "").trim();
  if (!name) throw new Error("Enter the contact's name.");
  const email = (input.email || "").trim();
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new Error("That email address doesn't look right.");
  return { name, title: (input.title || "").trim() || null, phone: (input.phone || "").trim() || null, email: email || null };
}

// A client's first contact is made primary by the database automatically; makePrimary forces it for a later one.
export async function addClientContact(clientId: string, input: ContactInput, makePrimary = false): Promise<ClientContact> {
  const fields = clean(input);
  const { data: client, error: clientErr } = await supabase.from("clients").select("company_id").eq("id", clientId).maybeSingle();
  if (clientErr || !client?.company_id) throw new Error(clientErr?.message || "The client could not be found.");
  const { data, error } = await supabase
    .from("client_contacts")
    .insert({ company_id: client.company_id, client_id: clientId, ...fields, is_primary: makePrimary })
    .select("*")
    .single();
  if (error || !data) throw new Error(isMissingTable(error) ? CONTACTS_NOT_READY_MESSAGE : error?.message || "The contact could not be saved.");
  return data as ClientContact;
}

export async function updateClientContact(id: string, input: ContactInput): Promise<void> {
  const fields = clean(input);
  const { data, error } = await supabase.from("client_contacts").update(fields).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("The contact could not be updated.");
}

export async function setPrimaryContact(id: string): Promise<void> {
  const { data, error } = await supabase.from("client_contacts").update({ is_primary: true }).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("The contact could not be made primary.");
}

export async function deleteClientContact(id: string): Promise<void> {
  const { data, error } = await supabase.from("client_contacts").delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("The contact could not be deleted.");
}
