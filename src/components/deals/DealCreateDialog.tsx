import { useEffect, useRef, useState } from "react";
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
import { formatDealNumber } from "@/lib/deals/format";
import { loadDealStaffNames } from "@/lib/deals/names";
import { didarDealTitleFromPerson } from "@/lib/deals/title";
import { safeRandomUUID } from "@/lib/utils/safe-uuid";

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
  const [relatedIds, setRelatedIds] = useState<string[]>([]);
  const [nextFollow, setNextFollow] = useState("");
  const [autoTitle, setAutoTitle] = useState("");
  const pendingRef = useRef(false);
  const requestKeyRef = useRef<string | null>(null);

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
      return loadDealStaffNames();
    },
  });

  useEffect(() => {
    if (!open) {
      setCreatedId(null);
      setPending(false);
      pendingRef.current = false;
      requestKeyRef.current = null;
      return;
    }
    if (!requestKeyRef.current) requestKeyRef.current = safeRandomUUID();
    if (!salespersonId && profile?.id) setSalespersonId(profile.id);
    if (!pipelineId && pipesQ.data?.[0]) setPipelineId(pipesQ.data[0].id);
    if (!stageId && stagesQ.data?.[0]) setStageId(stagesQ.data[0].id);
  }, [open, profile?.id, pipesQ.data, stagesQ.data, salespersonId, pipelineId, stageId]);

  const submit = async (asWon: boolean) => {
    if (pendingRef.current || pending) return;
    if (!personId) {
      toast.error("انتخاب شخص الزامی است.");
      return;
    }
    if (!salespersonId) {
      toast.error("مسئول معامله الزامی است");
      return;
    }
    pendingRef.current = true;
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
        clientRequestKey: requestKeyRef.current,
        nextFollowUpAt: nextFollow ? `${nextFollow}T12:00:00+03:30` : null,
      } as never);
      if (visibility) {
        await supabase
          .from("sales_interactions" as never)
          .update({ visibility_label: visibility } as never)
          .eq("id" as never, id as never);
      }
      if (relatedIds.length) {
        await supabase.from("deal_related_users" as never).insert(
          relatedIds.map((profile_id) => ({ interaction_id: id, profile_id })) as never,
        );
      }
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
      setAutoTitle("");
      requestKeyRef.current = null;
      return id;
    } catch (e) {
      const cid = (e as { createdId?: string }).createdId;
      if (cid) setCreatedId(cid);
      toast.error(salesDeskErrorMessage((e as Error).message));
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="deal-surface z-[60] max-h-[calc(100dvh-5.5rem)] w-[min(48rem,100vw)] max-w-full overflow-x-hidden overflow-y-auto max-md:top-auto max-md:bottom-16 max-md:translate-y-0" dir="rtl">
        <DialogHeader>
          <DialogTitle>افزودن معامله</DialogTitle>
        </DialogHeader>
        <div className="grid min-w-0 gap-4 md:grid-cols-[1fr_12rem]">
          <div className="min-w-0 space-y-3">
            <div>
              <Label>شخص</Label>
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
                    const next = didarDealTitleFromPerson({ displayName: p.display_name, kind: p.kind });
                    setTitle((cur) => {
                      if (!cur.trim() || cur === autoTitle) {
                        setAutoTitle(next);
                        return next;
                      }
                      return cur;
                    });
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
                      className={`min-h-10 rounded-sm border px-2 py-1 text-xs ${
                        s.id === stageId ? "border-primary/30 bg-primary/15 text-primary" : "bg-muted"
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
            <div data-testid="pass3-d10-visibility">
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
            <div data-testid="pass3-d9-create-extra" className="space-y-2">
              <Label>کاربران مرتبط</Label>
              <Select
                onValueChange={(uid) => {
                  if (!relatedIds.includes(uid)) setRelatedIds([...relatedIds, uid]);
                }}
              >
                <SelectTrigger aria-label="کاربران مرتبط">
                  <SelectValue placeholder="کاربران مرتبط" />
                </SelectTrigger>
                <SelectContent>
                  {(staffQ.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name ?? p.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {relatedIds.length ? (
                <p className="text-xs">{formatDealNumber(relatedIds.length)} کاربر مرتبط</p>
              ) : null}
              <Label>فعالیت بعدی</Label>
              <JalaliDateInput value={nextFollow || null} onChange={setNextFollow} />
              <p className="text-xs text-muted-foreground">
                فیلدها · محصولات درخواستی · ایجاد کننده: {profile?.full_name ?? "—"}
              </p>
            </div>
          </div>
          <aside className="deal-elev space-y-2 rounded-xl border bg-card p-3 text-sm">
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
