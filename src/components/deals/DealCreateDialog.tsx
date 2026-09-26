import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { useDebounce } from "@/hooks/use-debounce";
import { useAuth } from "@/lib/auth/AuthProvider";
import { searchPersons } from "@/lib/persons/functions";
import { createSalesInteraction, salesDeskErrorMessage } from "@/lib/sales-desk";
import { listSalesPipelineStages, listSalesPipelines } from "@/lib/sales-desk/pipelines";
import { supabase } from "@/integrations/supabase/client";
import { RequestedProductsBlock, type RequestedProductLine } from "@/components/sales-desk";
import { VISIBILITY_LABELS } from "./DealChrome";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quick?: boolean;
};

export function DealCreateDialog({ open, onOpenChange, quick }: Props) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const searchFn = useServerFn(searchPersons);
  const [personId, setPersonId] = useState<string | null>(null);
  const [personName, setPersonName] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 350);
  const [title, setTitle] = useState(quick ? "" : "");
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
  const searchQ = useQuery({
    queryKey: ["persons-search", debounced],
    enabled: open && debounced.trim().length >= 2,
    queryFn: () => searchFn({ data: { query: debounced.trim() } }),
  });

  useEffect(() => {
    if (!open) return;
    if (!salespersonId && profile?.id) setSalespersonId(profile.id);
    if (!pipelineId && pipesQ.data?.[0]) setPipelineId(pipesQ.data[0].id);
    if (!stageId && stagesQ.data?.[0]) setStageId(stagesQ.data[0].id);
  }, [open, profile?.id, pipesQ.data, stagesQ.data, salespersonId, pipelineId, stageId]);

  useEffect(() => {
    if (personName && !title) setTitle(personName);
  }, [personName, title]);

  const submit = async (asWon: boolean) => {
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
        title: title.trim() || personName,
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
        companyPersonId: companyId,
      } as never);
      toast.success(asWon ? "ذخیره به صورت فروش موفق" : "ذخیره معامله");
      void qc.invalidateQueries({ queryKey: ["sales-desk"] });
      onOpenChange(false);
      setPersonId(null);
      setTitle("");
      setBody("");
      setItems([]);
      return id;
    } catch (e) {
      toast.error(salesDeskErrorMessage((e as Error).message));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>افزودن معامله</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-[1fr_12rem]">
          <div className="space-y-3">
            <div>
              <Label>نام خانوادگی</Label>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="جستجوی شخص"
              />
              {searchQ.data ? (
                <ul className="mt-1 max-h-32 overflow-auto rounded border text-sm">
                  {(searchQ.data as Array<{ id: string; display_name: string }>).map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="w-full px-2 py-1 text-right hover:bg-muted"
                        onClick={() => {
                          setPersonId(p.id);
                          setPersonName(p.display_name);
                          setQuery(p.display_name);
                          if (!title) setTitle(p.display_name);
                        }}
                      >
                        {p.display_name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div>
              <Label>نام شرکت</Label>
              <Input
                value={companyId ?? ""}
                onChange={(e) => setCompanyId(e.target.value || null)}
                placeholder="شناسه شرکت (اختیاری)"
              />
            </div>
            <div>
              <Label>عنوان معامله</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label>مبلغ حدودی معامله</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="IRR" />
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
              <Input type="date" value={closeOn} onChange={(e) => setCloseOn(e.target.value)} />
            </div>
            <div>
              <Label>مراحل کاریز</Label>
              <Select value={stageId || undefined} onValueChange={setStageId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(stagesQ.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Label>توضیحات</Label>
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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => void submit(true)}>
            ذخیره به صورت فروش موفق
          </Button>
          <Button type="button" disabled={pending} onClick={() => void submit(false)}>
            ذخیره معامله
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
