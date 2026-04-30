import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { requirePermission } from "@/lib/rbac/route-guards";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowRight, Loader2, ChevronRight, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import {
  WaybillForm, type WaybillFormValues, waybillSchema,
} from "@/shared/components/WaybillForm";
import {
  type CustomFieldDef, type CustomData, validateCustomData,
} from "@/shared/components/WaybillCustomFieldsInput";
import { formatNumber, toFaDigits } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/_app/sales_/invoices_/$invoiceId/waybill/create")({
  beforeLoad: async () => { await requirePermission("invoices", "view"); },
  component: CreateWaybillPage,
});

type InvoiceItem = {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  product?: { name?: string } | null;
};

type DistributionMode = "single" | "per_item" | "manual";

// allocation matrix: items x waybills (quantities)
type Allocation = Record<string /* item_id */, number[] /* per waybill index */>;

function CreateWaybillPage() {
  const { invoiceId } = Route.useParams();
  const { roles } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(1); // 1: mode, 2: split, 3: details, 4: confirm
  const [mode, setMode] = useState<DistributionMode>("single");
  const [waybillCount, setWaybillCount] = useState(2);
  const [allocation, setAllocation] = useState<Allocation>({});
  const [forms, setForms] = useState<WaybillFormValues[]>([]);
  const [customDataList, setCustomDataList] = useState<CustomData[]>([]);

  const canCreate = roles.includes("admin") || roles.includes("manager") || roles.includes("sales");

  const { data: invoice } = useQuery({
    queryKey: ["invoice-for-waybill", invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, number, status, total_amount, customer:customers(id,name,phone,accounting_code)")
        .eq("id", invoiceId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: items } = useQuery({
    queryKey: ["invoice-items-for-waybill", invoiceId],
    queryFn: async (): Promise<InvoiceItem[]> => {
      const { data, error } = await supabase
        .from("invoice_items")
        .select("id, product_id, quantity, unit_price, line_total, product:products(name)")
        .eq("invoice_id", invoiceId);
      if (error) throw error;
      return (data ?? []) as unknown as InvoiceItem[];
    },
  });

  const { data: existing } = useQuery({
    queryKey: ["waybill-for-invoice", invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waybills")
        .select("id, status").eq("invoice_id", invoiceId)
        .neq("status", "canceled").maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: customFields } = useQuery({
    queryKey: ["waybill-custom-fields", "active"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CustomFieldDef[]> => {
      const { data, error } = await supabase
        .from("waybill_custom_fields")
        .select("*").eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CustomFieldDef[];
    },
  });

  const customer = invoice?.customer as { name?: string; phone?: string; accounting_code?: string } | null;
  const baseInitial: Partial<WaybillFormValues> = {
    receiver_name: customer?.name ?? "",
    receiver_phone: customer?.phone ?? "",
    customer_accounting_code: customer?.accounting_code ?? "",
  };

  // Build effective waybill count + initial allocation when mode/items change
  const effectiveCount = useMemo(() => {
    if (mode === "single") return 1;
    if (mode === "per_item") return items?.length ?? 0;
    return Math.max(1, waybillCount);
  }, [mode, items, waybillCount]);

  const initAllocation = (): Allocation => {
    const a: Allocation = {};
    if (!items) return a;
    if (mode === "single") {
      for (const it of items) a[it.id] = [Number(it.quantity)];
    } else if (mode === "per_item") {
      items.forEach((it, idx) => {
        const arr = new Array(items.length).fill(0);
        arr[idx] = Number(it.quantity);
        a[it.id] = arr;
      });
    } else {
      for (const it of items) {
        const arr = new Array(effectiveCount).fill(0);
        arr[0] = Number(it.quantity);
        a[it.id] = arr;
      }
    }
    return a;
  };

  const goToStep2 = () => {
    setAllocation(initAllocation());
    setForms(new Array(effectiveCount).fill(0).map(() => ({
      sender_name: "", sender_phone: "",
      receiver_name: customer?.name ?? "",
      receiver_phone: customer?.phone ?? "",
      shipping_company: "", destination_city: "",
      customer_accounting_code: customer?.accounting_code ?? "",
      destination_address: "", shipping_notes: "",
    })));
    setCustomDataList(new Array(effectiveCount).fill(0).map(() => ({})));
    if (mode === "single" || mode === "per_item") {
      setStep(3);
    } else {
      setStep(2);
    }
  };

  const updateAlloc = (itemId: string, idx: number, qty: number) => {
    setAllocation((prev) => {
      const arr = [...(prev[itemId] ?? [])];
      arr[idx] = Math.max(0, qty);
      return { ...prev, [itemId]: arr };
    });
  };

  // Validate current step + advance
  const validateAllocation = (): string | null => {
    if (!items) return "آیتمی یافت نشد";
    for (const it of items) {
      const sum = (allocation[it.id] ?? []).reduce((a, b) => a + (Number(b) || 0), 0);
      if (sum !== Number(it.quantity)) {
        return `مجموع تقسیم برای «${it.product?.name ?? it.id}» باید ${toFaDigits(it.quantity)} باشد (فعلاً ${toFaDigits(sum)})`;
      }
    }
    return null;
  };

  const submitBatch = async (register: boolean) => {
    if (!items) return;
    // validate forms
    for (let i = 0; i < forms.length; i++) {
      const r = waybillSchema.safeParse(forms[i]);
      if (!r.success) {
        toast.error(`بیجک ${toFaDigits(i + 1)}: ${r.error.issues[0]?.message ?? "ورودی نامعتبر"}`);
        return;
      }
      const cErr = validateCustomData(customFields ?? [], customDataList[i] ?? {});
      if (Object.keys(cErr).length > 0) {
        toast.error(`بیجک ${toFaDigits(i + 1)}: ${Object.values(cErr)[0]}`);
        return;
      }
    }
    const allocErr = validateAllocation();
    if (allocErr) { toast.error(allocErr); return; }

    const payload = forms.map((f, i) => {
      const wbItems = items
        .map((it) => ({
          invoice_item_id: it.id,
          product_id: it.product_id,
          quantity: Number(allocation[it.id]?.[i] ?? 0),
        }))
        .filter((x) => x.quantity > 0);
      return {
        sender_name: f.sender_name,
        sender_phone: f.sender_phone,
        receiver_name: f.receiver_name,
        receiver_phone: f.receiver_phone,
        shipping_company: f.shipping_company,
        destination_city: f.destination_city,
        customer_accounting_code: f.customer_accounting_code ?? "",
        destination_address: f.destination_address ?? "",
        shipping_notes: f.shipping_notes ?? "",
        custom_data: customDataList[i] ?? {},
        items: wbItems,
      };
    }).filter((w) => w.items.length > 0);

    if (payload.length === 0) {
      toast.error("هیچ بیجکی با آیتم وجود ندارد");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "single" && payload.length === 1) {
        // backwards-compatible single path
        const f = payload[0];
        const { error } = await supabase.rpc("create_waybill_for_invoice", {
          p_invoice_id: invoiceId,
          p_sender_name: f.sender_name,
          p_sender_phone: f.sender_phone,
          p_receiver_name: f.receiver_name,
          p_receiver_phone: f.receiver_phone,
          p_shipping_company: f.shipping_company,
          p_destination_city: f.destination_city,
          p_customer_accounting_code: f.customer_accounting_code || undefined,
          p_destination_address: f.destination_address || undefined,
          p_shipping_notes: f.shipping_notes || undefined,
          p_register: register,
        });
        if (error) throw error;
        // attach custom_data after insert
        if (Object.keys(f.custom_data ?? {}).length > 0) {
          await supabase.from("waybills").update({ custom_data: f.custom_data })
            .eq("invoice_id", invoiceId).neq("status", "canceled");
        }
      } else {
        const { error } = await supabase.rpc("create_waybills_batch", {
          p_invoice_id: invoiceId,
          p_waybills: payload as never,
          p_register: register,
        });
        if (error) throw error;
      }
      toast.success("بیجک‌ها با موفقیت صادر شدند");
      navigate({ to: "/sales/invoices/$invoiceId/waybill", params: { invoiceId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در صدور بیجک");
    } finally {
      setSubmitting(false);
    }
  };

  if (existing) {
    return (
      <div className="space-y-4" dir="rtl">
        <PageHeader title="بیجک قبلاً صادر شده" description="" />
        <Button asChild><Link to="/sales/invoices/$invoiceId/waybill" params={{ invoiceId }}>مشاهده بیجک</Link></Button>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="صدور بیجک"
        description={invoice ? `پیش‌فاکتور ${toFaDigits(invoice.number ?? invoice.id.slice(0, 8))}` : ""}
        actions={
          <Button asChild variant="outline">
            <Link to="/sales/invoices/$invoiceId" params={{ invoiceId }}>
              <ArrowRight className="ml-2 h-4 w-4" /> بازگشت
            </Link>
          </Button>
        }
      />

      {/* Stepper */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {["روش توزیع", "تقسیم آیتم‌ها", "اطلاعات بیجک‌ها", "تأیید نهایی"].map((label, i) => {
          const n = i + 1;
          const skipped = (mode === "single" || mode === "per_item") && n === 2;
          const active = step === n;
          return (
            <div key={n} className={`flex items-center gap-1 ${active ? "text-foreground font-semibold" : ""} ${skipped ? "opacity-40" : ""}`}>
              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${active ? "border-foreground" : ""}`}>
                {toFaDigits(n)}
              </span>
              <span className="hidden sm:inline">{label}</span>
              {n < 4 && <ChevronLeft className="h-3 w-3" />}
            </div>
          );
        })}
      </div>

      {!canCreate ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">دسترسی غیرمجاز</CardContent></Card>
      ) : step === 1 ? (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="text-sm font-semibold">روش توزیع آیتم‌ها بین بیجک‌ها</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {([
                { v: "single", t: "همه در یک بیجک", d: "یک بیجک واحد برای همه آیتم‌ها" },
                { v: "per_item", t: "هر آیتم جداگانه", d: "برای هر قلم یک بیجک ساخته می‌شود" },
                { v: "manual", t: "تقسیم دستی", d: "تعداد هر آیتم بین چند بیجک" },
              ] as const).map((o) => (
                <button key={o.v}
                  className={`text-right rounded-md border p-3 hover:bg-accent ${mode === o.v ? "border-primary bg-accent" : ""}`}
                  onClick={() => setMode(o.v)}>
                  <div className="font-medium text-sm">{o.t}</div>
                  <div className="text-xs text-muted-foreground mt-1">{o.d}</div>
                </button>
              ))}
            </div>
            {mode === "manual" && (
              <div className="space-y-1 max-w-xs">
                <Label>تعداد بیجک‌ها</Label>
                <Input type="number" min={2} max={20} value={waybillCount}
                  onChange={(e) => setWaybillCount(Math.max(2, Math.min(20, Number(e.target.value) || 2)))} />
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={goToStep2} disabled={!items || items.length === 0}>
                ادامه <ChevronRight className="me-1 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : step === 2 ? (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="text-sm font-semibold">تقسیم تعداد هر آیتم بین {toFaDigits(effectiveCount)} بیجک</div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">محصول</TableHead>
                    <TableHead className="text-right">کل</TableHead>
                    {Array.from({ length: effectiveCount }).map((_, i) => (
                      <TableHead key={i} className="text-right">بیجک {toFaDigits(i + 1)}</TableHead>
                    ))}
                    <TableHead className="text-right">جمع</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(items ?? []).map((it) => {
                    const arr = allocation[it.id] ?? [];
                    const sum = arr.reduce((a, b) => a + (Number(b) || 0), 0);
                    const ok = sum === Number(it.quantity);
                    return (
                      <TableRow key={it.id}>
                        <TableCell>{it.product?.name ?? "—"}</TableCell>
                        <TableCell>{toFaDigits(it.quantity)}</TableCell>
                        {Array.from({ length: effectiveCount }).map((_, i) => (
                          <TableCell key={i}>
                            <Input type="number" min={0} className="w-20"
                              value={arr[i] ?? 0}
                              onChange={(e) => updateAlloc(it.id, i, Number(e.target.value) || 0)} />
                          </TableCell>
                        ))}
                        <TableCell className={ok ? "text-foreground" : "text-destructive font-bold"}>
                          {toFaDigits(sum)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>بازگشت</Button>
              <Button onClick={() => {
                const e = validateAllocation();
                if (e) { toast.error(e); return; }
                setStep(3);
              }}>
                ادامه <ChevronRight className="me-1 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : step === 3 ? (
        <div className="space-y-4">
          {forms.map((f, idx) => (
            <Card key={idx}>
              <CardContent className="p-4 space-y-3">
                <div className="text-sm font-semibold">بیجک {toFaDigits(idx + 1)} از {toFaDigits(forms.length)}</div>
                <WaybillForm
                  initial={effectiveCount === 1 ? baseInitial : f}
                  submitting={false}
                  customFields={customFields ?? []}
                  initialCustomData={customDataList[idx] ?? {}}
                  onSubmit={(values, _register, customData) => {
                    setForms((prev) => prev.map((p, i) => i === idx ? values : p));
                    setCustomDataList((prev) => prev.map((p, i) => i === idx ? customData : p));
                    toast.success(`اطلاعات بیجک ${toFaDigits(idx + 1)} ذخیره شد`);
                  }}
                />
              </CardContent>
            </Card>
          ))}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(mode === "manual" ? 2 : 1)}>بازگشت</Button>
            <Button onClick={() => setStep(4)}>
              مرحله بعد <ChevronRight className="me-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="text-sm font-semibold">پیش‌نمایش و تأیید نهایی</div>
            <div className="text-xs text-muted-foreground">{toFaDigits(forms.length)} بیجک ساخته خواهد شد.</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">#</TableHead>
                  <TableHead className="text-right">گیرنده</TableHead>
                  <TableHead className="text-right">باربری</TableHead>
                  <TableHead className="text-right">مقصد</TableHead>
                  <TableHead className="text-right">تعداد آیتم</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forms.map((f, i) => {
                  const itemCount = (items ?? []).filter((it) => (allocation[it.id]?.[i] ?? 0) > 0).length;
                  return (
                    <TableRow key={i}>
                      <TableCell>{toFaDigits(i + 1)}</TableCell>
                      <TableCell>{f.receiver_name || "—"}</TableCell>
                      <TableCell>{f.shipping_company || "—"}</TableCell>
                      <TableCell>{f.destination_city || "—"}</TableCell>
                      <TableCell>{toFaDigits(itemCount)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="flex flex-col sm:flex-row justify-between gap-2">
              <Button variant="outline" onClick={() => setStep(3)}>بازگشت</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => submitBatch(false)} disabled={submitting}>
                  {submitting && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}
                  ذخیره پیش‌نویس
                </Button>
                <Button onClick={() => submitBatch(true)} disabled={submitting}>
                  {submitting && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}
                  ثبت و تأیید
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* show invoice items reference on step 1 */}
      {step === 1 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="text-sm font-semibold">اقلام پیش‌فاکتور</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">محصول</TableHead>
                  <TableHead className="text-right">تعداد</TableHead>
                  <TableHead className="text-right">قیمت واحد</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(items ?? []).map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>{it.product?.name ?? "—"}</TableCell>
                    <TableCell>{toFaDigits(it.quantity)}</TableCell>
                    <TableCell>{formatNumber(Number(it.unit_price))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}