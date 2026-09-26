import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth/AuthProvider";
import { createSalesInteraction, salesDeskErrorMessage } from "@/lib/sales-desk";
import { listSalesPipelineStages, listSalesPipelines } from "@/lib/sales-desk/pipelines";
import { supabase } from "@/integrations/supabase/client";
import { RequestedProductsBlock, type RequestedProductLine } from "@/components/sales-desk";
import { JalaliDateInput } from "@/shared/components/JalaliDateInput";
import { VISIBILITY_LABELS } from "./DealChrome";
import { DealPersonPicker } from "./DealPersonPicker";
import { dealAmountNumber, formatDealAmountInput } from "@/lib/deals/amount";
import { didarDealTitleFromPerson } from "@/lib/deals/title";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quick?: boolean;
};

export function DealCreateDialog({ open, onOpenChange, quick }: Props) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [personId, setPersonId] = useState<string | null>(null);
  const [personName, setPersonName] = useState("");
  const [personKind, setPersonKind] = useState<string>("individual");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [introducerId, setIntroducerId] = useState<string | null>(null);
  const [introducerName, setIntroducerName] = useState("");
  const [title, setTitle] = useState(quick ? "" : "معامله جدید");
  const [body, setBody] = useState("");
  const [amount, setAmount] = useState("");
  const [pipelineId, setPipelineId] = useState("");
  const [stageId, setStageId] = useState("");
  const [closeOn, setCloseOn] = useState("");
  const [acqId, setAcqId] = useState("");
  const [salespersonId, setSalespersonId] = useState(profile?.id ?? "");
  const [visibility, setVisibility] = useState<string>("همه افراد شرکت");
  const [items, setItems] = useState<RequestedProductLine[]>([]);
  const [pending, setPending] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const pipesQ = useQuery({
    queryKey: ["sales-desk", "pipelines"],
    enabled: open,
    queryFn: () => listSalesPipelines({ activeOnly: true }),
  });
  const activePipe = pipelineId || pipesQ.data?.[0]?.id || "";
  const stagesQ = useQuery({
    queryKey: ["sales-desk", "pipeline-stages", activePipe],
    enabled: open && !!activePipe,
    queryFn: () => listSalesPipelineStages({ pipelineId: activePipe, activeOnly: true }),
  });
  const acqQ = useQuery({
    queryKey: ["sales-desk", "acquaintance"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("acquaintance_methods" as never)
        .select("id, title" as never)
        .eq("is_active" as never, true as never)
        .order("sort_order" as never, { ascending: true } as never);
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; title: string }[];
    },
  });
  const staffQ = useQuery({
    queryKey: ["sales-desk", "staff-profiles"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name").limit(80);
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; full_name: string | null }[];
    },
  });

  useEffect(() => {
    if (!open) {
      setCreatedId(null);
      setPending(false);
      return;
    }
    if (!salespersonId && profile?.id) setSalespersonId(profile.id);
    if (!pipelineId && pipesQ.data?.[0]) setPipelineId(pipesQ.data[0].id);
    if (!stageId && stagesQ.data?.[0]) setStageId(stagesQ.data[0].id);
  }, [open, profile?.id, pipesQ.data, stagesQ.data, salespersonId, pipelineId, stageId]);

  const submit = async (asWon: boolean) => {
    if (pending) return;
    if (!personId) {
      toast.error("شناسه شخص الزامی است.");
      return;
    }
    if (!salespersonId) {
      toast.error("مسئول معامله الزامی است");
      return;
    }
    setPending(true);
    try {
      const id = await createSalesInteraction({
        kind: "request",
        personId,
        salespersonId,
        title: title.trim() || didarDealTitleFromPerson({ displayName: personName, kind: personKind }),
        body,
        status: asWon ? "won" : "open",
        pipelineId: activePipe || null,
        stageId: stageId || null,
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          note: i.note,
        })),
        expectedCloseOn: closeOn || null,
        acquaintanceId: acqId || null,
        companyPersonId: companyId || null,
        estimatedAmount: dealAmountNumber(amount),
        introducerPersonId: introducerId || null,
        existingId: createdId,
      } as never);
      setCreatedId(id);
      toast.success(asWon ? "ذخیره به صورت فروش موفق" : "ذخیره معامله");
      void qc.invalidateQueries({ queryKey: ["sales-desk"] });
      onOpenChange(false);
      setPersonId(null);
      setTitle(quick ? "" : "معامله جدید");
      setBody("");
      setItems([]);
      setAmount("");
      setIntroducerId(null);
      setCompanyId(null);
      setCreatedId(null);
      return id;
    } catch (e) {
      const cid = (e as { createdId?: string }).createdId;
      if (cid) setCreatedId(cid);
      toast.error(salesDeskErrorMessage((e as Error).message));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[min(48rem,100vw)] max-w-full overflow-x-hidden overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>افزودن معامله</DialogTitle>
        </DialogHeader>
        <div className="grid min-w-0 gap-4 md:grid-cols-[1fr_12rem]">
          <div className="min-w-0 space-y-3">
            <div>
              <Label>نام خانوادگی</Label>
              <DealPersonPicker
                label="جستجوی شخص"
                valueId={personId}
                valueName={personName}
                kind="individual"
                onPick={(p) => {
                  setPersonId(p.id || null);
                  setPersonName(p.display_name);
                  setPersonKind(p.kind ?? "individual");
                  if (p.id && p.display_name) {
                    setTitle(didarDealTitleFromPerson({ displayName: p.display_name, kind: p.kind }));
                  }
                }}
              />
            </div>
            <div>
              <Label>نام شرکت</Label>
              <DealPersonPicker
                label="جستجوی شرکت"
                valueId={companyId}
                valueName={companyName}
                kind="organization"
                onPick={(p) => {
                  setCompanyId(p.id || null);
                  setCompanyName(p.display_name);
                }}
              />
            </div>
            <div>
              <Label>معرف</Label>
              <DealPersonPicker
                label="جستجوی معرف"
                valueId={introducerId}
                valueName={introducerName}
                onPick={(p) => {
                  setIntroducerId(p.id || null);
                  setIntroducerName(p.display_name);
                }}
              />
            </div>
            <div>
              <Label>عنوان معامله</Label>
              <Input aria-label="عنوان معامله" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label>مبلغ حدودی معامله</Label>
              <Input
                value={amount}
                inputMode="numeric"
                placeholder="IRR"
                onChange={(e) => setAmount(formatDealAmountInput(e.target.value))}
              />
            </div>
            <RequestedProductsBlock lines={items} onChange={setItems} />
            <div>
              <Label>کاریز</Label>
              <Select value={activePipe || undefined} onValueChange={setPipelineId}>
                <SelectTrigger>
                  <SelectValue placeholder="کاریز افراکالا" />
                </SelectTrigger>
                <SelectContent>
                  {(pipesQ.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>تاریخ احتمالی بسته شدن معامله</Label>
              <JalaliDateInput value={closeOn || null} onChange={setCloseOn} />
            </div>
            <div>
              <Label>مراحل کاریز</Label>
              <ol className="flex flex-wrap gap-1">
                {(stagesQ.data ?? []).map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`rounded-sm border px-2 py-1 text-xs ${
                        s.id === stageId ? "bg-green-200" : "bg-muted"
                      }`}
                      onClick={() => setStageId(s.id)}
                    >
                      {s.title}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <Label>شیوه آشنایی</Label>
              <Select value={acqId || undefined} onValueChange={setAcqId}>
                <SelectTrigger>
                  <SelectValue placeholder="شیوه آشنایی" />
                </SelectTrigger>
                <SelectContent>
                  {(acqQ.data ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>مسئول معامله</Label>
              <Select value={salespersonId || undefined} onValueChange={setSalespersonId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(staffQ.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name ?? p.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>مجوز مشاهده</Label>
              <Select value={visibility} onValueChange={setVisibility}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VISIBILITY_LABELS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>متن درخواست</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              کاربران مرتبط · فعالیت بعدی · فیلدها · محصولات درخواستی · ایجاد کننده:{" "}
              {profile?.full_name ?? "—"}
            </p>
          </div>
          <aside className="space-y-2 text-sm">
            <div>اطلاعات خریدار</div>
            <div>افزودن محصول</div>
          </aside>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button type="button" variant="secondary" disabled={pending} aria-busy={pending} onClick={() => void submit(true)}>
            ذخیره به صورت فروش موفق
          </Button>
          <Button type="button" disabled={pending} aria-busy={pending} onClick={() => void submit(false)}>
            ذخیره معامله
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
