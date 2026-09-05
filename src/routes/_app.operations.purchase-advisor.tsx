import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, Loader2, Copy, RefreshCw, Package } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import {
  InquiryProductPicker,
  type PickedProduct,
} from "@/components/messenger/InquiryProductPicker";
import { generatePurchaseAdvice } from "@/lib/ai-tools/purchase-advisor.functions";

export const Route = createFileRoute("/_app/operations/purchase-advisor")({
  // M6/OG-24 — see the note on /api-keys: beforeLoad cannot decide on a cold load.
  staticData: { gate: { kind: "anyRole", allowed: ["admin", "manager"] } },
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager"]);
  },
  component: PurchaseAdvisorPage,
});

type Urgency = "normal" | "urgent" | "critical";

function PurchaseAdvisorPage() {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [product, setProduct] = useState<PickedProduct | null>(null);
  const [quantity, setQuantity] = useState<string>("1");
  const [urgency, setUrgency] = useState<Urgency>("normal");
  const [note, setNote] = useState("");
  const [advice, setAdvice] = useState<string | null>(null);

  const call = useServerFn(generatePurchaseAdvice);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("محصولی انتخاب نشده است");
      const q = Number.parseInt(quantity, 10);
      if (!Number.isFinite(q) || q <= 0) throw new Error("تعداد نامعتبر است");
      return call({
        data: {
          productId: product.id,
          quantity: q,
          urgency,
          note: note.trim() || null,
        },
      });
    },
    onSuccess: (res) => setAdvice(res.advice),
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "خطا در دریافت توصیه";
      toast.error(msg);
    },
  });

  async function handleCopy() {
    if (!advice) return;
    try {
      await navigator.clipboard.writeText(advice);
      toast.success("توصیه کپی شد");
    } catch {
      toast.error("کپی نشد");
    }
  }

  function handleReset() {
    setAdvice(null);
  }

  const disabled = !product || mutation.isPending;

  return (
    <div dir="rtl" className="space-y-6">
      <PageHeader
        title="دستیار هوشمند خرید"
        description="با انتخاب محصول، پیشنهاد خرید مبتنی بر تاریخچه قیمت و نرخ ارز از هوش مصنوعی دریافت کنید."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" />
            ورودی درخواست
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>محصول</Label>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={() => setPickerOpen(true)}
            >
              <Package className="ms-2 h-4 w-4" />
              {product
                ? `${product.name}${product.sku ? ` — ${product.sku}` : ""}`
                : "انتخاب محصول…"}
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>تعداد مورد نیاز</Label>
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>فوریت</Label>
              <Select value={urgency} onValueChange={(v) => setUrgency(v as Urgency)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">عادی</SelectItem>
                  <SelectItem value="urgent">فوری</SelectItem>
                  <SelectItem value="critical">بحرانی</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>یادداشت اضافه (اختیاری)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="مثلاً: مشتری نهایی مشخص است، امکان پیش‌پرداخت داریم…"
              rows={3}
              maxLength={1000}
            />
          </div>

          <Button
            onClick={() => mutation.mutate()}
            disabled={disabled}
            className="w-full"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="ms-2 h-4 w-4 animate-spin" />
                در حال دریافت توصیه…
              </>
            ) : (
              <>
                <Sparkles className="ms-2 h-4 w-4" />
                دریافت توصیه AI
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {mutation.isPending && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">در حال تولید توصیه…</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </CardContent>
        </Card>
      )}

      {advice && !mutation.isPending && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">توصیه هوش مصنوعی</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleCopy}>
                <Copy className="ms-2 h-4 w-4" />
                کپی توصیه
              </Button>
              <Button size="sm" variant="ghost" onClick={handleReset}>
                <RefreshCw className="ms-2 h-4 w-4" />
                توصیه جدید
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="whitespace-pre-wrap text-sm leading-7 text-foreground">
              {advice}
            </div>
          </CardContent>
        </Card>
      )}

      <InquiryProductPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(p) => {
          setProduct(p);
          setPickerOpen(false);
          setAdvice(null);
        }}
      />
    </div>
  );
}
