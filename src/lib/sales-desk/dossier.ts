/**
 * Sales-desk · customer 360 data loaders (person + responsible + quotes +
 * interactions timeline + call_logs). Authenticated browser client; RLS applies.
 *
 * sales_interactions is newer than types.ts — cast. Prefer personId as the hub
 * (migration 545 FK); customerId optional for quotes/responsible.
 */
import { supabase } from "@/integrations/supabase/client";

export type DossierPerson = {
  id: string;
  display_name: string;
  legal_name: string | null;
  kind: string;
  is_active: boolean;
  notes: string | null;
};

export type DossierCustomerResponsible = {
  id: string;
  name: string | null;
  phone: string | null;
  responsible_id: string | null;
  responsible: { id: string; full_name: string | null } | null;
};

export type DossierQuote = {
  id: string;
  quote_number: string | null;
  status: string;
  final_amount: number | null;
  created_at: string;
  customer_name: string | null;
};

export type DossierInteraction = {
  id: string;
  person_id: string;
  customer_id: string | null;
  kind: string;
  title: string | null;
  body: string;
  status: string;
  outcome_note: string | null;
  salesperson_id: string | null;
  author_id: string;
  call_log_id: string | null;
  next_follow_up_at: string | null;
  followed_up_at: string | null;
  source: string;
  created_at: string;
  updated_at: string;
};

export type DossierCallLog = {
  id: string;
  started_at: string;
  direction: string;
  duration_seconds: number | null;
  extension: string | null;
  is_missed: boolean | null;
  disposition: string | null;
  customer_id: string | null;
  employee_id: string | null;
};

export async function loadPerson(personId: string): Promise<DossierPerson | null> {
  const { data, error } = await supabase
    .from("persons")
    .select("id, display_name, legal_name, kind, is_active, notes")
    .eq("id", personId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as DossierPerson | null;
}

/** Customers linked to person + their responsible profile (customers.responsible_id). */
export async function loadCustomersWithResponsible(
  personId: string,
): Promise<DossierCustomerResponsible[]> {
  const { data, error } = await supabase
    .from("customers")
    .select(
      "id, name, phone, responsible_id, responsible:profiles!customers_responsible_id_fkey(id, full_name)",
    )
    .eq("person_id", personId)
    .order("name", { ascending: true })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DossierCustomerResponsible[];
}

export async function loadRecentQuotesForPerson(
  personId: string,
  limit = 20,
): Promise<DossierQuote[]> {
  const capped = Math.min(limit, 50);
  // Phase 5: person hub column is `customer_person_id` (not person_id).
  const { data, error } = await supabase
    .from("sales_quotes")
    .select("id, quote_number, status, final_amount, created_at, customer_name")
    .eq("customer_person_id", personId)
    .order("created_at", { ascending: false })
    .limit(capped);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DossierQuote[];
}

export async function loadInteractionsTimeline(
  personId: string,
  limit = 50,
): Promise<DossierInteraction[]> {
  const capped = Math.min(limit, 100);
  const { data, error } = await supabase
    .from("sales_interactions" as never)
    .select(
      "id, person_id, customer_id, kind, title, body, status, outcome_note, salesperson_id, author_id, call_log_id, next_follow_up_at, followed_up_at, source, created_at, updated_at",
    )
    .eq("person_id" as never, personId as never)
    .order("created_at" as never, { ascending: false } as never)
    .limit(capped);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DossierInteraction[];
}

/** call_logs.customer_id historically points at persons.id after import match. */
export async function loadCallLogsForPerson(
  personId: string,
  limit = 30,
): Promise<DossierCallLog[]> {
  const capped = Math.min(limit, 100);
  const { data, error } = await supabase
    .from("call_logs" as never)
    .select(
      "id, started_at, direction, duration_seconds, extension, is_missed, disposition, customer_id, employee_id",
    )
    .eq("customer_id" as never, personId as never)
    .order("started_at" as never, { ascending: false } as never)
    .limit(capped);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DossierCallLog[];
}

export type SalesDossierBundle = {
  person: DossierPerson | null;
  customers: DossierCustomerResponsible[];
  quotes: DossierQuote[];
  interactions: DossierInteraction[];
  callLogs: DossierCallLog[];
};

export async function loadSalesDossier(personId: string): Promise<SalesDossierBundle> {
  const [person, customers, quotes, interactions, callLogs] = await Promise.all([
    loadPerson(personId),
    loadCustomersWithResponsible(personId),
    loadRecentQuotesForPerson(personId),
    loadInteractionsTimeline(personId),
    loadCallLogsForPerson(personId),
  ]);
  return { person, customers, quotes, interactions, callLogs };
}
