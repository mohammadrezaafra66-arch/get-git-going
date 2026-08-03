import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

/**
 * Issue 219 / C4 — assigning, reassigning and unassigning a purchase request.
 *
 * The single call site of `assign_purchase_request`. Everything the UI needs to
 * know about the outcome comes back in the RPC result; nothing is inferred
 * client-side.
 */

export type AssigneeOption = {
  user_id: string;
  full_name: string;
  roles: string[];
  is_default: boolean;
};

export type AssignResult = {
  request_id: string;
  previous_assignee: { id: string; name: string | null } | null;
  new_assignee: { id: string; name: string | null } | null;
  is_unassigned: boolean;
  changed: boolean;
};

/**
 * Persian text for the machine codes the RPCs put in PostgreSQL's HINT field.
 *
 * Keyed on HINT rather than on the message, so the wording can change on either
 * side without silently falling back to a raw database error.
 */
const MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: "برای این کار باید وارد شوید.",
  ASSIGN_PERMISSION_DENIED: "شما اجازه تعیین مسئول خرید را ندارید.",
  ASSIGNEE_NOT_FOUND: "کاربر انتخاب‌شده پیدا نشد.",
  ASSIGNEE_INACTIVE: "کاربر انتخاب‌شده غیرفعال است.",
  ASSIGNEE_ROLE_INVALID: "کاربر انتخاب‌شده نقش مناسب مسئول خرید را ندارد.",
  ASSIGNMENT_CONFLICT: "مسئول این درخواست هم‌زمان توسط کاربر دیگری تغییر کرده است.",
  REQUEST_NOT_FOUND: "درخواست خرید پیدا نشد.",
  REQUEST_CANCELLED: "این درخواست لغو شده است و مسئول آن قابل تغییر نیست.",
  DEFAULT_ASSIGNEE_INVALID: "مسئول پیش‌فرض خرید معتبر نیست.",
  UNASSIGNED_REQUEST: "این درخواست هنوز مسئول خرید ندارد.",
};

export function assignErrorMessage(err: unknown): string {
  const e = err as { hint?: string; code?: string; message?: string } | null;
  const byHint = e?.hint ? MESSAGES[e.hint] : undefined;
  if (byHint) return byHint;
  // A network failure has no hint and no SQLSTATE.
  if (e?.message && /Failed to fetch|NetworkError|fetch failed/i.test(e.message)) {
    return "ارتباط با سرور برقرار نشد. دوباره تلاش کنید.";
  }
  // Never surface the raw database text.
  return "تغییر مسئول خرید ناموفق بود.";
}

/** Whether a failure was specifically a concurrent-edit conflict. */
export function isAssignmentConflict(err: unknown): boolean {
  return (err as { hint?: string } | null)?.hint === "ASSIGNMENT_CONFLICT";
}

/** The people who may be made responsible. Admin/manager only, server-side. */
export function usePurchaseAssigneeOptions(enabled: boolean) {
  return useQuery({
    queryKey: ["purchase-assignee-options"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_purchase_assignee_options");
      if (error) throw error;
      return (data ?? []) as AssigneeOption[];
    },
  });
}

export function useAssignPurchaseRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      request_id: string;
      assignee_id: string | null;
      note?: string | null;
      /**
       * Who the caller believed the current owner was when the dialog opened.
       * Sent together with `expect_provided` because a bare null cannot
       * distinguish "I expect nobody" from "I did not check".
       */
      expected_current_assignee_id?: string | null;
      expect_provided?: boolean;
    }) => {
      const { data, error } = await supabase.rpc("assign_purchase_request", {
        p_request_id: input.request_id,
        p_assignee_id: input.assignee_id ?? undefined,
        p_note: input.note ?? undefined,
        p_expected_current_assignee_id: input.expected_current_assignee_id ?? undefined,
        p_expect_provided: input.expect_provided ?? false,
      });
      if (error) throw error;
      return data as unknown as AssignResult;
    },
    onSuccess: (result) => {
      if (!result.changed) {
        toast.info("مسئول این درخواست از قبل همین کاربر بود.");
      } else if (result.is_unassigned) {
        toast.success("مسئول درخواست برداشته شد.");
      } else {
        toast.success(
          `مسئول درخواست به ${result.new_assignee?.name ?? "کاربر انتخاب‌شده"} تغییر کرد.`,
        );
      }
      qc.invalidateQueries({ queryKey: ["purchase-requests"] });
    },
    // Errors are handled at the call site: a conflict must refresh the dialog
    // rather than close it, which a global toast cannot express.
  });
}

/** The configured default purchase assignee. */
export function useSetDefaultPurchaseAssignee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string | null) => {
      const { data, error } = await supabase.rpc("set_default_purchase_assignee", {
        p_user_id: userId ?? undefined,
      });
      if (error) throw error;
      return data as unknown as { default_assignee_id: string | null; changed: boolean };
    },
    onSuccess: () => {
      toast.success("مسئول پیش‌فرض خرید ذخیره شد.");
      qc.invalidateQueries({ queryKey: ["purchase-assignee-options"] });
      qc.invalidateQueries({ queryKey: ["shop-settings"] });
    },
    onError: (err) => toast.error(assignErrorMessage(err)),
  });
}
