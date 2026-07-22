import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDateTimeFa } from "@/lib/i18n/formatters";
import type { AppRole } from "@/lib/rbac/roles";

/**
 * مورد ۱۳۵ — مارکرهای «ثبت شد» و «ارسال شد» پیش‌فاکتور.
 *
 * دو مارکر کاملاً مستقل از `invoices.status` هستند و از طریق RPC
 * `set_invoice_accounting_marker` نوشته می‌شوند تا کنترل دسترسی و
 * audit در سمت دیتابیس بماند.
 */

export type InvoiceMarker = "registered" | "sent";

export interface InvoiceMarkerState {
  accounting_registered_at: string | null;
  accounting_sent_at: string | null;
}

const MARKER_META: Record<InvoiceMarker, { label: string; toast: string }> = {
  registered: { label: "ثبت شد", toast: "ثبت در حسابداری علامت خورد." },
  sent: { label: "ارسال شد", toast: "ارسال پیش‌فاکتور علامت خورد." },
};

interface Props {
  invoiceId: string;
  state: InvoiceMarkerState;
  /** query keys to invalidate after a successful toggle */
  invalidateKeys?: unknown[][];
  size?: "sm" | "default";
}

export function InvoiceAccountingMarkers({
  invoiceId,
  state,
  invalidateKeys = [["invoices"]],
  size = "sm",
}: Props) {
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const [pendingUncheck, setPendingUncheck] = useState<InvoiceMarker | null>(null);

  const appRoles = roles as AppRole[];
  const canCheck = hasAnyRole(appRoles, ["admin", "accountant", "manager"]);
  const canUncheck = hasAnyRole(appRoles, ["admin", "accountant"]);

  const mutation = useMutation({
    mutationFn: async ({ marker, checked }: { marker: InvoiceMarker; checked: boolean }) => {
      // RPC not yet in generated types — cast the fn name to satisfy the client.
      const { error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>
      )("set_invoice_accounting_marker", {
        p_invoice_id: invoiceId,
        p_marker: marker,
        p_checked: checked,
      });
      if (error) throw new Error(error.message);
      return { marker, checked };
    },
    onSuccess: ({ marker, checked }) => {
      for (const key of invalidateKeys) queryClient.invalidateQueries({ queryKey: key });
      toast.success(checked ? MARKER_META[marker].toast : "علامت لغو شد.");
    },
    onError: (err: Error) => toast.error(err.message || "ثبت علامت ناموفق بود"),
  });

  const valueFor = (marker: InvoiceMarker) =>
    marker === "registered" ? state.accounting_registered_at : state.accounting_sent_at;

  const handleClick = (marker: InvoiceMarker) => {
    const current = valueFor(marker);
    if (current) {
      if (!canUncheck) return;
      setPendingUncheck(marker);
      return;
    }
    if (!canCheck) return;
    mutation.mutate({ marker, checked: true });
  };

  const renderButton = (marker: InvoiceMarker) => {
    const at = valueFor(marker);
    const isSet = Boolean(at);
    const Icon = marker === "registered" ? Check : Send;
    const disabled = mutation.isPending || (isSet ? !canUncheck : !canCheck);

    return (
      <Button
        key={marker}
        type="button"
        size={size}
        variant={isSet ? "default" : "outline"}
        disabled={disabled}
        className={isSet ? "bg-emerald-600 hover:bg-emerald-700" : undefined}
        title={at ? `${MARKER_META[marker].label} — ${formatDateTimeFa(at)}` : undefined}
        onClick={(e) => {
          e.stopPropagation();
          handleClick(marker);
        }}
      >
        {mutation.isPending ? (
          <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Icon className="ml-1 h-3.5 w-3.5" />
        )}
        {MARKER_META[marker].label}
      </Button>
    );
  };

  const sentWithoutRegistered = Boolean(state.accounting_sent_at) && !state.accounting_registered_at;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {renderButton("registered")}
        {renderButton("sent")}
      </div>
      {sentWithoutRegistered && (
        <span className="text-[10px] text-amber-600 dark:text-amber-400">
          این پیش‌فاکتور هنوز به عنوان ثبت‌شده در حسابداری علامت نخورده است.
        </span>
      )}

      <AlertDialog
        open={pendingUncheck !== null}
        onOpenChange={(open) => !open && setPendingUncheck(null)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>لغو علامت</AlertDialogTitle>
            <AlertDialogDescription>آیا می‌خواهید این علامت را لغو کنید؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingUncheck) mutation.mutate({ marker: pendingUncheck, checked: false });
                setPendingUncheck(null);
              }}
            >
              لغو علامت
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
