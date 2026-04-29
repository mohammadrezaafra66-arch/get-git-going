import { Badge } from "@/components/ui/badge";

const MAP: Record<string, { label: string; cls: string }> = {
  draft: { label: "پیش‌نویس", cls: "bg-muted text-muted-foreground" },
  registered: { label: "ثبت‌شده", cls: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
  delivered_to_carrier: { label: "تحویل به باربری", cls: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30" },
  sent: { label: "ارسال‌شده", cls: "bg-orange-500/15 text-orange-600 border-orange-500/30" },
  delivered_to_customer: { label: "تحویل به مشتری", cls: "bg-green-500/15 text-green-700 border-green-500/30" },
  canceled: { label: "لغو شده", cls: "bg-destructive/15 text-destructive border-destructive/30" },
};

export function WaybillStatusBadge({ status }: { status: string }) {
  const m = MAP[status] ?? { label: status, cls: "" };
  return <Badge variant="outline" className={m.cls}>{m.label}</Badge>;
}

export const WAYBILL_STATUS_LABEL = (s: string) => MAP[s]?.label ?? s;