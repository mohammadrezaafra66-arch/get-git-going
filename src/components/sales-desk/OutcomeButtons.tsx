import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  updateSalesInteractionStatus,
  type SalesInteractionStatus,
} from "@/lib/sales-desk";

const OUTCOMES: { status: SalesInteractionStatus; label: string; variant: "default" | "outline" | "secondary" }[] = [
  { status: "won", label: "موفق", variant: "default" },
  { status: "lost", label: "ناموفق", variant: "outline" },
  { status: "done", label: "انجام شد", variant: "secondary" },
  { status: "cancelled", label: "لغو", variant: "outline" },
];

type Props = {
  interactionId: string;
  currentStatus?: string;
  onUpdated?: (status: SalesInteractionStatus) => void;
  disabled?: boolean;
};

/**
 * دکمه‌های نتیجه برای یک interaction باز (موفق / ناموفق / …).
 */
export function OutcomeButtons({
  interactionId,
  currentStatus,
  onUpdated,
  disabled,
}: Props) {
  const mutation = useMutation({
    mutationFn: (status: SalesInteractionStatus) =>
      updateSalesInteractionStatus({ id: interactionId, status }),
    onSuccess: (_id, status) => {
      toast.success("وضعیت به‌روز شد");
      onUpdated?.(status);
    },
    onError: (e: Error) => toast.error(e.message || "به‌روزرسانی ناموفق بود"),
  });

  if (currentStatus && currentStatus !== "open") {
    return (
      <span className="text-xs text-muted-foreground">
        وضعیت: {salesInteractionStatusLabel(currentStatus)}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5" dir="rtl">
      {OUTCOMES.map((o) => (
        <Button
          key={o.status}
          type="button"
          size="sm"
          variant={o.variant}
          disabled={disabled || mutation.isPending}
          onClick={() => mutation.mutate(o.status)}
        >
          {mutation.isPending && mutation.variables === o.status ? (
            <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" />
          ) : null}
          {o.label}
        </Button>
      ))}
    </div>
  );
}

/** برچسب فارسی وضعیت تعامل — برای تایم‌لاین و دکمه‌ها مشترک. */
export function salesInteractionStatusLabel(s: string): string {
  switch (s) {
    case "won":
      return "موفق";
    case "lost":
      return "ناموفق";
    case "done":
      return "انجام‌شده";
    case "cancelled":
      return "لغو";
    case "open":
      return "باز";
    default:
      return s;
  }
}
