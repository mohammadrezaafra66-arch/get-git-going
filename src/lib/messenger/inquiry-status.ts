import { supabase } from "@/integrations/supabase/client";
import type { InquiryStatus } from "@/hooks/messenger/useInquiries";

/** Manual status change via live RPC `update_inquiry_status`. */
export async function updateInquiryStatus(
  inquiryId: string,
  newStatus: InquiryStatus,
): Promise<void> {
  const { error } = await supabase.rpc("update_inquiry_status", {
    p_inquiry_id: inquiryId,
    p_new_status: newStatus,
  });
  if (error) throw error;
}

/**
 * Advance SLA timers. Live DB grants EXECUTE to authenticated.
 * Note: as of 2026-08-08 the RPC ends by calling expire_pending_documents(),
 * which 400s with 42P10 (ON CONFLICT). Callers must treat this as best-effort.
 */
export async function tickInquiries(): Promise<void> {
  const { error } = await supabase.rpc("tick_inquiries");
  if (error) throw error;
}
