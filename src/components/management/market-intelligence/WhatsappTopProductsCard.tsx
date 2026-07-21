import { useState } from "react";
import { MessageCircle, Loader2, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MICardShell } from "./CardShell";
import { formatNumber, formatDateTimeFa, toFaDigits } from "@/lib/i18n/formatters";
import {
  fetchWhatsappTopProducts,
  fetchWhatsappMentioners,
  type WhatsappTopProduct,
} from "@/lib/management/whatsapp-top-products.functions";

const UNREACHABLE = "اتصال به داده‌های واتساپ موقتاً برقرار نیست.";

/** External timestamps are UTC; some arrive without a trailing 'Z'. */
function asUtc(s: string | null): string | null {
  if (!s) return null;
  return /[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`;
}
function fmtWhen(iso: string | null, shamsiFallback: string | null): string {
  const utc = asUtc(iso);
  return utc ? formatDateTimeFa(utc) : (shamsiFallback ?? "—");
}

export function WhatsappTopProductsCard() {
  const topFn = useServerFn(fetchWhatsappTopProducts);
  const q = useQuery({
    queryKey: ["wa-top-products"],
    queryFn: () => topFn({ data: {} }),
    // Same live-refresh cadence as the rest of the dashboards (2 min).
    refetchInterval: 120_000,
    staleTime: 60_000,
  });
  const [selected, setSelected] = useState<WhatsappTopProduct | null>(null);

  const unreachable = q.isError || (q.data ? q.data.ok === false : false);
  const products = q.data && q.data.ok ? q.data.products : [];

  return (
    <MICardShell
      title="محصولات پرتکرار در گفتگوهای واتساپ (مشتریان)"
      description="محصولاتی که مشتریان در گروه‌های واتساپ بیشترین بار درباره‌شان صحبت کرده‌اند (۳۰ روز اخیر)."
      rule="منبع: پلتفرم واتساپ — تقاضای واقعی مشتریان از پیام‌های گروه‌ها؛ متمایز از کارت‌های مبتنی بر استفادهٔ داخلیِ این سامانه."
      icon={<MessageCircle className="h-4 w-4 text-emerald-600" />}
      actions={
        <Badge variant="outline" className="gap-1 whitespace-nowrap text-[10px] text-emerald-700">
          <MessageCircle className="h-3 w-3" /> منبع: واتساپ
        </Badge>
      }
    >
      {q.isLoading ? (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
        </div>
      ) : unreachable ? (
        <p className="py-6 text-center text-sm text-amber-600">{UNREACHABLE}</p>
      ) : products.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">داده‌ای برای نمایش نیست.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-right text-xs text-muted-foreground">
              <tr>
                <th className="p-2 font-medium">رتبه</th>
                <th className="p-2 font-medium">نام محصول</th>
                <th className="p-2 font-medium">تعداد تکرار</th>
                <th className="p-2 font-medium">تعداد گروه</th>
                <th className="p-2 font-medium">تعداد فرستنده</th>
                <th className="p-2 font-medium">آخرین ذکر</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr
                  key={`${p.rank}-${p.product_name}`}
                  className="border-b last:border-0 hover:bg-muted/30"
                >
                  <td className="p-2 tabular-nums text-muted-foreground">{formatNumber(p.rank)}</td>
                  <td className="p-2 font-medium">{p.product_name}</td>
                  <td className="p-2 font-bold tabular-nums text-emerald-700">
                    {formatNumber(p.mention_count)}
                  </td>
                  <td className="p-2 tabular-nums">{formatNumber(p.group_count)}</td>
                  <td className="p-2 tabular-nums">{formatNumber(p.sender_count)}</td>
                  <td className="whitespace-nowrap p-2 text-xs text-muted-foreground">
                    {fmtWhen(p.last_mentioned_at, p.last_mentioned_shamsi)}
                  </td>
                  <td className="p-2 text-left">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 whitespace-nowrap text-xs"
                      onClick={() => setSelected(p)}
                    >
                      <Users className="h-3.5 w-3.5" /> مشاهده فروشندگان اخیر
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MentionersDialog product={selected} onClose={() => setSelected(null)} />
    </MICardShell>
  );
}

function MentionersDialog({
  product,
  onClose,
}: {
  product: WhatsappTopProduct | null;
  onClose: () => void;
}) {
  const menFn = useServerFn(fetchWhatsappMentioners);
  const q = useQuery({
    enabled: !!product,
    queryKey: ["wa-mentioners", product?.product_name],
    queryFn: () => menFn({ data: { productName: product!.product_name } }),
    staleTime: 60_000,
  });
  const unreachable = q.isError || (q.data ? q.data.ok === false : false);
  const mentioners = q.data && q.data.ok ? q.data.mentioners : [];

  return (
    <Dialog
      open={!!product}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-base">
            فروشندگان اخیر — «{product?.product_name}»
          </DialogTitle>
        </DialogHeader>
        {q.isLoading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
          </div>
        ) : unreachable ? (
          <p className="py-6 text-center text-sm text-amber-600">{UNREACHABLE}</p>
        ) : mentioners.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">فروشنده‌ای یافت نشد.</p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b bg-muted/50 text-right text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 font-medium">زمان</th>
                  <th className="p-2 font-medium">گروه</th>
                  <th className="p-2 font-medium">فرستنده</th>
                  <th className="p-2 font-medium">اطلاعات تماس</th>
                </tr>
              </thead>
              <tbody>
                {mentioners.map((m, i) => {
                  const contacts =
                    m.all_contacts && m.all_contacts.length > 0
                      ? m.all_contacts
                      : ([m.sender_phone, m.sender_phone_secondary].filter(Boolean) as string[]);
                  return (
                    <tr key={i} className="border-b align-top last:border-0">
                      <td className="whitespace-nowrap p-2 text-xs text-muted-foreground">
                        {fmtWhen(m.timestamp, m.timestamp_shamsi)}
                      </td>
                      <td className="p-2 text-xs">{m.group_name ?? "—"}</td>
                      <td className="p-2 text-xs">{m.sender_display_name ?? "—"}</td>
                      <td className="p-2 text-xs" dir="ltr">
                        {contacts.length > 0 ? (
                          contacts.map((c) => (
                            <div key={c} className="tabular-nums">
                              {toFaDigits(c)}
                            </div>
                          ))
                        ) : (
                          <span>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
