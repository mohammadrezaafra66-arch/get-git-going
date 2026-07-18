import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import { formatNumber } from "@/lib/i18n/formatters";

const REASON_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "customer_request", label: "درخواست مشتری" },
  { value: "high_stock", label: "موجودی زیاد" },
  { value: "good_margin", label: "حاشیه سود خوب" },
  { value: "competitive_price", label: "قیمت رقابتی" },
  { value: "new_product", label: "محصول جدید" },
  { value: "clearance", label: "تخلیه انبار" },
  { value: "other", label: "سایر" },
];

const NO_CHANNEL = "__no_channel";

interface QuotaRow {
  used_today: number;
  daily_quota: number;
  remaining_today: number;
}

const REASON_ERROR_FA: Record<string, string> = {
  daily_quota_exceeded: "سهمیهٔ امروز شما تمام شده است.",
  forbidden: "شما اجازهٔ نامزدی ندارید.",
  invalid_reason_code: "دلیل نامزدی نامعتبر است.",
  product_not_found: "محصول یافت نشد.",
};

export function PromotionNominateButton({ productId }: { productId: string }) {
  const { roles } = useAuth();
  const canNominate = hasAnyRole(roles, ["sales"]);

  const [open, setOpen] = useState(false);
  const [channelId, setChannelId] = useState<string>(NO_CHANNEL);
  const [reasonCode, setReasonCode] = useState<string>("customer_request");
  const [reasonNote, setReasonNote] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const channelsQuery = useQuery({
    enabled: open,
    queryKey: ["promo-nom-channels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_channels")
        .select("id, name")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    staleTime: 5 * 60_000,
  });

  const quotaQuery = useQuery({
    enabled: open,
    queryKey: ["promo-nom-quota"],
    queryFn: async (): Promise<QuotaRow | null> => {
      // New RPC not present in generated types → accepted (supabase as any) cast.
      const { data, error } = await (supabase as any).rpc("get_promotion_nomination_quota");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as QuotaRow | null;
    },
    staleTime: 0,
  });

  if (!canNominate) return null;

  const remaining = quotaQuery.data?.remaining_today ?? null;
  const outOfQuota = remaining != null && remaining <= 0;

  const submit = async () => {
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("nominate_product_for_promotion", {
        p_product_id: productId,
        p_channel_id: channelId === NO_CHANNEL ? null : channelId,
        p_reason_code: reasonCode,
        p_reason_note: reasonNote.trim() || null,
      });
      if (error) {
        const key = (error.message || "").match(/[a-z_]+/)?.[0] ?? "";
        toast.error(REASON_ERROR_FA[key] ?? "ثبت نامزدی ناموفق بود");
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.capped) {
        toast.success("نامزدی ثبت شد (سقف روزانهٔ این محصول پر بود، بدون امتیاز اضافه)");
      } else {
        toast.success("نامزدی برای تبلیغ ثبت شد");
      }
      await quotaQuery.refetch();
      setOpen(false);
      setReasonNote("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ثبت نامزدی");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Megaphone className="ms-1 h-4 w-4" />
        پیشنهاد برای تبلیغ
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>پیشنهاد محصول برای تبلیغ</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
              {quotaQuery.isLoading ? (
                "در حال دریافت سهمیه..."
              ) : quotaQuery.data ? (
                <span>
                  سهمیهٔ امروز: {formatNumber(quotaQuery.data.used_today)} از{" "}
                  {formatNumber(quotaQuery.data.daily_quota)} — باقی‌مانده:{" "}
                  <span className={outOfQuota ? "text-destructive font-semibold" : "font-semibold"}>
                    {formatNumber(quotaQuery.data.remaining_today)}
                  </span>
                </span>
              ) : (
                "سهمیه در دسترس نیست"
              )}
            </div>

            <div>
              <Label>کانال (اختیاری)</Label>
              <Select value={channelId} onValueChange={setChannelId}>
                <SelectTrigger>
                  <SelectValue placeholder="بدون کانال خاص" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CHANNEL}>بدون کانال خاص</SelectItem>
                  {(channelsQuery.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>دلیل نامزدی *</Label>
              <Select value={reasonCode} onValueChange={setReasonCode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REASON_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>یادداشت (اختیاری)</Label>
              <Textarea
                rows={2}
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
                placeholder="توضیح کوتاه"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              انصراف
            </Button>
            <Button onClick={submit} disabled={saving || outOfQuota}>
              {saving && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}
              {outOfQuota ? "سهمیه تمام شد" : "ثبت نامزدی"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
