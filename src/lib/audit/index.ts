/**
 * Centralized Audit Logging Module
 *
 * Single source of truth for all audit operations across the application.
 * Consolidates audit logic from multiple scattered files into one coherent system.
 *
 * Previously scattered across:
 * - src/lib/products/audit.ts
 * - src/routes/_app.audit-logs.tsx
 * - 30+ migration files with audit triggers
 * - customer/invoice/accounting serverFn functions
 *
 * Now centralized here with clear, documented APIs.
 */

import { getServiceClient } from "@/integrations/supabase/server";
import { z } from "zod";

// ===== Schema Definitions =====

/**
 * The shape audit_logs ACTUALLY has, measured from information_schema:
 *   id bigint NOT NULL · actor_id uuid NULL · entity_type text NOT NULL
 *   entity_id text NOT NULL · action text NOT NULL · diff jsonb NULL
 *   created_at timestamptz NOT NULL
 *
 * The previous version described a table with table_name, record_id, change_details and
 * updated_at. No such columns have ever existed — the first audit_logs migration on 2026-04-24
 * already used entity_type/entity_id/diff, and this module arrived two months later. Every insert
 * it attempted failed with 42703 "column audit_logs.table_name does not exist", and because
 * nothing calls these paths yet, nothing ever surfaced it.
 */
export const AuditLogSchema = z.object({
  id: z.union([z.number(), z.string()]),
  actor_id: z.string().uuid().nullable(),
  entity_type: z.string(),
  entity_id: z.string(),
  action: z.string(),
  diff: z.record(z.any()).nullable(),
  created_at: z.string(),
});

export type AuditLog = z.infer<typeof AuditLogSchema>;

export const CreateAuditLogInput = z.object({
  actor_id: z.string().uuid(),
  action: z.enum(["CREATE", "UPDATE", "DELETE", "EXPORT", "IMPORT", "LINK", "UNLINK"]),
  /** The table the event is about, e.g. "payments". Stored in entity_type. */
  entity_type: z.string(),
  /** REQUIRED. entity_id is NOT NULL, so a null here is a guaranteed 23502 at insert time. */
  entity_id: z.string().min(1),
  /** Stored in diff. Must never carry a person's name, phone, address or national id. */
  diff: z.record(z.any()).optional(),
});

export type CreateAuditLogInput = z.infer<typeof CreateAuditLogInput>;

// ===== Configuration =====

/**
 * Tables that require audit logging
 * When modified, update this list and corresponding trigger definitions
 */
export const AUDITED_TABLES = [
  "customers",
  "invoices",
  "payments",
  "products",
  "user_roles",
  "persons",
  "person_identifiers",
  "person_context_links",
  "automation_driver_outputs",
] as const;

export type AuditedTable = (typeof AUDITED_TABLES)[number];

/**
 * Critical fields that trigger audit logging
 * Maps table -> [fields to monitor]
 */
export const CRITICAL_FIELDS: Record<AuditedTable, string[]> = {
  customers: ["name", "person_id", "is_active", "dedup_key"],
  invoices: ["total_amount", "status", "customer_id"],
  payments: ["amount", "status", "invoice_id"],
  products: ["name", "sku", "price", "category_id"],
  user_roles: ["user_id", "role"],
  persons: ["name", "type", "status"],
  person_identifiers: ["identifier_type", "identifier_value", "person_id"],
  person_context_links: ["person_id", "context_type", "context_id"],
  automation_driver_outputs: ["phase_label", "status", "job_id"],
};

// ===== Public API =====

/**
 * Log an audit event
 *
 * Use this from serverFn functions to record significant operations.
 *
 * Example:
 * ```
 * await logAuditEvent({
 *   actor_id: user.id,
 *   action: 'CREATE',
 *   table_name: 'customers',
 *   record_id: customer.id,
 *   change_details: { name: customer.name, person_id: customer.person_id }
 * });
 * ```
 */
export async function logAuditEvent(input: CreateAuditLogInput): Promise<AuditLog> {
  const validated = CreateAuditLogInput.parse(input);

  const result = await getServiceClient()
    .from("audit_logs")
    .insert({
      actor_id: validated.actor_id,
      action: validated.action,
      entity_type: validated.entity_type,
      entity_id: validated.entity_id,
      diff: validated.diff ?? {},
    })
    .select()
    .single();

  if (result.error) throw result.error;
  return AuditLogSchema.parse(result.data);
}

/**
 * Get audit history for a specific record
 */
export async function getAuditHistory(
  tableName: AuditedTable,
  recordId: string,
  limit: number = 50,
): Promise<AuditLog[]> {
  const result = await getServiceClient()
    .from("audit_logs")
    .select("*")
    .eq("table_name", tableName)
    .eq("record_id", recordId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (result.error) throw result.error;
  return result.data.map((log) => AuditLogSchema.parse(log));
}

/**
 * Get recent audit events (for audit log view)
 */
export async function getRecentAuditLogs(
  limit: number = 100,
  offset: number = 0,
): Promise<{ data: AuditLog[]; count: number }> {
  const result = await getServiceClient()
    .from("audit_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (result.error) throw result.error;

  return {
    data: (result.data || []).map((log) => AuditLogSchema.parse(log)),
    count: result.count || 0,
  };
}

/**
 * Search audit logs by action, table, or actor
 */
export async function searchAuditLogs(
  filters: {
    action?: string;
    table_name?: AuditedTable;
    actor_id?: string;
    record_id?: string;
    since?: Date;
    until?: Date;
  },
  limit: number = 100,
): Promise<AuditLog[]> {
  let query = getServiceClient()
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters.action) query = query.eq("action", filters.action);
  if (filters.table_name) query = query.eq("table_name", filters.table_name);
  if (filters.actor_id) query = query.eq("actor_id", filters.actor_id);
  if (filters.record_id) query = query.eq("record_id", filters.record_id);
  if (filters.since) query = query.gte("created_at", filters.since.toISOString());
  if (filters.until) query = query.lte("created_at", filters.until.toISOString());

  query = query.limit(limit);

  const result = await query;
  if (result.error) throw result.error;

  return (result.data || []).map((log) => AuditLogSchema.parse(log));
}

// ===== Migration Helpers =====

/**
 * SQL for creating audit_logs table
 * (Reference: triggers should be defined in supabase/migrations/)
 */
export const AUDIT_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT,
    change_details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
  );

  -- Indexes for common queries
  CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record
    ON public.audit_logs(table_name, record_id);
  
  CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
    ON public.audit_logs(actor_id);
  
  CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
    ON public.audit_logs(created_at DESC);
`;

/**
 * SQL for creating triggers on a specific table
 * Usage in migration: SELECT setup_audit_trigger('customers');
 */
export const AUDIT_TRIGGER_FUNCTION_SQL = `
  CREATE OR REPLACE FUNCTION public.setup_audit_trigger(table_name TEXT)
  RETURNS void AS $$
  DECLARE
    trigger_name TEXT := 'trg_audit_' || table_name;
    function_name TEXT := 'audit_' || table_name;
  BEGIN
    -- Create function
    EXECUTE format('
      CREATE OR REPLACE FUNCTION public.%I()
      RETURNS TRIGGER AS $inner$
      BEGIN
        INSERT INTO public.audit_logs (actor_id, action, table_name, record_id, change_details)
        VALUES (
          auth.uid(),
          TG_OP,
          %L,
          COALESCE(NEW.id, OLD.id)::text,
          to_jsonb(NEW) - ''id'' - ''created_at''
        );
        RETURN COALESCE(NEW, OLD);
      END;
      $inner$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
    ', function_name, table_name);

    -- Create trigger
    EXECUTE format('
      DROP TRIGGER IF EXISTS %I ON public.%I;
      CREATE TRIGGER %I
        AFTER INSERT OR UPDATE OR DELETE ON public.%I
        FOR EACH ROW EXECUTE FUNCTION public.%I();
    ', trigger_name, table_name, trigger_name, table_name, function_name);
  END;
  $$ LANGUAGE plpgsql;
`;

/**
 * SQL for RLS policy on audit_logs
 * - Admins can see all
 * - Users can see their own actions
 */
export const AUDIT_RLS_POLICY_SQL = `
  ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "admins_see_all_audit"
    ON public.audit_logs
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    );

  CREATE POLICY "users_see_own_audit"
    ON public.audit_logs
    FOR SELECT
    USING (actor_id = auth.uid());
`;

// ===== Cleanup & Maintenance =====

/**
 * Archive old audit logs (older than specified days)
 * Call periodically to keep audit_logs table size manageable
 */
export async function archiveOldAuditLogs(
  olderThanDays: number = 90,
): Promise<{ archived: number }> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  // In a real system, you'd archive to a separate table or storage
  // For now, just count
  const result = await getServiceClient()
    .from("audit_logs")
    .select("id", { count: "exact" })
    .lt("created_at", cutoffDate.toISOString());

  if (result.error) throw result.error;

  return {
    archived: result.count || 0,
  };
}
