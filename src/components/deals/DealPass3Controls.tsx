import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
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
import { createSalesInteraction, salesDeskErrorMessage } from "@/lib/sales-desk";
import { insertSalesInteractionItems } from "@/lib/sales-desk/items";
import { JalaliDateInput } from "@/shared/components/JalaliDateInput";
import { DealPersonPicker } from "./DealPersonPicker";
import { RequestedProductsBlock, type RequestedProductLine } from "@/components/sales-desk";
import { formatDealAmountInput, dealAmountNumber } from "@/lib/deals/amount";
import { loadDealStaffNames } from "@/lib/deals/names";

function patchDeal(id: string, patch: Record<string, unknown>) {
  return supabase
    .from("sales_interactions" as never)
    .update(patch as never)
    .eq("id" as never, id as never);
}

export function DealEditDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dealId: string;
  title: string;
  body: string;
  amount: string;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(props.title);
  const [body, setBody] = useState(props.body);
  const [amount, setAmount] = useState(formatDealAmountInput(props.amount));
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        dir="rtl"
        data-testid="pass3-d1-edit"
        className="deal-surface z-[60] max-h-[calc(100dvh-5.5rem)] overflow-y-auto max-md:top-auto max-md:bottom-16 max-md:translate-y-0"
      >
        <DialogHeader>
          <DialogTitle>ویرایش</DialogTitle>
        </DialogHeader>
        <Label>عنوان معامله</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="عنوان ویرایش" />
        <Label>متن درخواست</Label>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} />
        <Label>مبلغ حدودی معامله</Label>
        <Input
          value={amount}
          inputMode="numeric"
          placeholder="IRR"
          onChange={(e) => setAmount(formatDealAmountInput(e.target.value))}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" className="min-h-11 shrink-0" onClick={() => props.onOpenChange(false)}>
            انصراف
          </Button>
          <Button
            type="button"
            onClick={() => {
              void patchDeal(props.dealId, {
                title,
                body,
                estimated_amount: dealAmountNumber(amount),
              }).then(({ error }) => {
                if (error) toast.error(salesDeskErrorMessage(error.message));
                else {
                  toast.success("ویرایش");
                  void qc.invalidateQueries({ queryKey: ["sales-desk"] });
                  props.onOpenChange(false);
                }
              });
            }}
          >
            ذخیره معامله
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DealNoteForm(props: {
  dealId: string;
  personId: string;
  salespersonId: string;
  testId?: string;
}) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  return (
    <div className="space-y-2" data-testid={props.testId ?? "pass3-d2-note"}>
      <Textarea
        aria-label="متن یادداشت"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="یادداشت"
      />
      <Button
        type="button"
        size="sm"
        disabled={!body.trim()}
        onClick={() => {
          void createSalesInteraction({
            kind: "note",
            personId: props.personId,
            salespersonId: props.salespersonId,
            title: "یادداشت",
            body: body.trim(),
            dealId: props.dealId,
          })
            .then(() => {
              toast.success("افزودن یادداشت");
              setBody("");
              void qc.invalidateQueries({ queryKey: ["sales-desk"] });
            })
            .catch((e: Error) => toast.error(salesDeskErrorMessage(e.message)));
        }}
      >
        ذخیره یادداشت
      </Button>
    </div>
  );
}

export function DealTagPicker(props: { dealId: string }) {
  const qc = useQueryClient();
  const tagsQ = useQuery({
    queryKey: ["sales-desk", "deal-tags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deal_tags" as never)
        .select("id, title" as never)
        .eq("is_active" as never, true as never)
        .order("sort_order" as never, { ascending: true } as never);
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; title: string }[];
    },
  });
  const assignedQ = useQuery({
    queryKey: ["sales-desk", "deal-tags-on", props.dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_interaction_tags" as never)
        .select("tag_id" as never)
        .eq("interaction_id" as never, props.dealId as never);
      if (error) throw new Error(error.message);
      const ids = ((data ?? []) as Array<{ tag_id: string }>).map((r) => r.tag_id);
      if (!ids.length) return [] as string[];
      const { data: defs, error: defErr } = await supabase
        .from("deal_tags" as never)
        .select("id, title" as never)
        .in("id" as never, ids as never);
      if (defErr) throw new Error(defErr.message);
      return ((defs ?? []) as Array<{ id: string; title: string }>).map((t) => t.title);
    },
  });
  return (
    <div data-testid="pass3-d3-tag">
      <p className="mb-1">برچسب</p>
      <div className="mb-2 flex min-h-6 flex-wrap gap-1">
        {(assignedQ.data ?? []).length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          (assignedQ.data ?? []).map((title) => (
            <span key={title} className="rounded-full border px-2 py-0.5 text-xs">
              {title}
            </span>
          ))
        )}
      </div>
      <Select
        onValueChange={(tagId) => {
          void supabase
            .from("sales_interaction_tags" as never)
            .insert({ interaction_id: props.dealId, tag_id: tagId } as never)
            .then(({ error }) => {
              if (error) toast.error(salesDeskErrorMessage(error.message));
              else {
                toast.success("اضافه کردن برچسب");
                void qc.invalidateQueries({ queryKey: ["sales-desk"] });
              }
            });
        }}
      >
        <SelectTrigger aria-label="اضافه کردن برچسب">
          <SelectValue placeholder="اضافه کردن برچسب" />
        </SelectTrigger>
        <SelectContent>
          {(tagsQ.data ?? []).map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function DealPersonChange(props: { dealId: string; personId: string; personName: string }) {
  const qc = useQueryClient();
  return (
    <div data-testid="pass3-d4-person">
      <DealPersonPicker
        label="تغییر شخص مرتبط"
        valueId={props.personId}
        valueName={props.personName}
        kind="individual"
        onPick={(p) => {
          if (!p.id) return;
          void patchDeal(props.dealId, { person_id: p.id }).then(({ error }) => {
            if (error) toast.error(salesDeskErrorMessage(error.message));
            else {
              toast.success("تغییر شخص مرتبط");
              void qc.invalidateQueries({ queryKey: ["sales-desk"] });
            }
          });
        }}
      />
    </div>
  );
}

export function DealAcquaintanceSet(props: { dealId: string; current: string | null }) {
  const qc = useQueryClient();
  const acqQ = useQuery({
    queryKey: ["sales-desk", "acquaintance"],
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
  return (
    <div data-testid="pass3-d5-acq">
      <Select
        value={props.current ?? undefined}
        onValueChange={(id) => {
          void patchDeal(props.dealId, { acquaintance_id: id }).then(({ error }) => {
            if (error) toast.error(salesDeskErrorMessage(error.message));
            else {
              toast.success("شیوه آشنایی");
              void qc.invalidateQueries({ queryKey: ["sales-desk"] });
            }
          });
        }}
      >
        <SelectTrigger aria-label="مشخص کردن شیوه آشنایی">
          <SelectValue placeholder="مشخص کردن شیوه آشنایی" />
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
  );
}

export function DealRelatedUsersAdd(props: { dealId: string }) {
  const qc = useQueryClient();
  const staffQ = useQuery({
    queryKey: ["sales-desk", "staff-profiles"],
    queryFn: async () => {
      return loadDealStaffNames();
    },
  });
  return (
    <div data-testid="pass3-d6-related">
      <Select
        onValueChange={(profileId) => {
          void supabase
            .from("deal_related_users" as never)
            .insert({ interaction_id: props.dealId, profile_id: profileId } as never)
            .then(({ error }) => {
              if (error) toast.error(salesDeskErrorMessage(error.message));
              else {
                toast.success("افراد درگیر");
                void qc.invalidateQueries({ queryKey: ["sales-desk"] });
              }
            });
        }}
      >
        <SelectTrigger aria-label="افزودن افراد درگیر">
          <SelectValue placeholder="+" />
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
  );
}

export function DealAddProducts(props: { dealId: string }) {
  const qc = useQueryClient();
  const [lines, setLines] = useState<RequestedProductLine[]>([]);
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="pass3-d7-products">
      <Button type="button" size="sm" variant="link" onClick={() => setOpen(true)}>
        + افزودن محصول
      </Button>
      {open ? (
        <div className="space-y-2">
          <RequestedProductsBlock lines={lines} onChange={setLines} />
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void insertSalesInteractionItems(
                props.dealId,
                lines.map((i) => ({ productId: i.productId, quantity: i.quantity, note: i.note })),
              )
                .then(() => {
                  toast.success("محصول");
                  setOpen(false);
                  setLines([]);
                  void qc.invalidateQueries({ queryKey: ["sales-desk"] });
                })
                .catch((e: Error) => toast.error(salesDeskErrorMessage(e.message)));
            }}
          >
            ذخیره محصول
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function DealWonAtJalali(props: { dealId: string; value: string | null }) {
  const qc = useQueryClient();
  const writeWonAt = (iso: string) => {
    if (!iso) return;
    const stamp = Date.now() % 60_000;
    const mm = String(Math.floor(stamp / 1000)).padStart(2, "0");
    const ss = String(stamp % 60).padStart(2, "0");
    const rpc = supabase.rpc.bind(supabase) as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>;
    void rpc("sales_deal_set_won_at", {
      p_id: props.dealId,
      p_won_at: `${iso}T12:${mm}:${ss}+03:30`,
    }).then(({ error }) => {
      if (error) toast.error(salesDeskErrorMessage(error.message));
      else {
        toast.success("تاریخ موفق شدن");
        void qc.invalidateQueries({ queryKey: ["sales-desk"] });
      }
    });
  };
  return (
    <div data-testid="pass3-d8-wonat">
      <Label>تغییر تاریخ موفق شدن</Label>
      <JalaliDateInput
        value={props.value ? props.value.slice(0, 10) : ""}
        onChange={writeWonAt}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-1"
        onClick={() => writeWonAt(props.value ? props.value.slice(0, 10) : new Date().toISOString().slice(0, 10))}
      >
        ثبت تاریخ موفق شدن
      </Button>
    </div>
  );
}

export function DealFileAdd(props: { dealId: string }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const filesQ = useQuery({
    queryKey: ["sales-desk", "deal-files", props.dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_interaction_files" as never)
        .select("id, title, created_at" as never)
        .eq("interaction_id" as never, props.dealId as never)
        .order("created_at" as never, { ascending: false } as never);
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; title: string; created_at: string }[];
    },
  });
  return (
    <div className="space-y-2" data-testid="pass3-d12-files">
      {(filesQ.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">پیوستی نیست.</p>
      ) : (
        <ul className="text-sm">
          {(filesQ.data ?? []).map((f) => (
            <li key={f.id}>{f.title}</li>
          ))}
        </ul>
      )}
      <Input aria-label="نام پیوست" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Button
        type="button"
        size="sm"
        disabled={!title.trim()}
        onClick={() => {
          void supabase
            .from("sales_interaction_files" as never)
            .insert({ interaction_id: props.dealId, title: title.trim() } as never)
            .then(({ error }) => {
              if (error) toast.error(salesDeskErrorMessage(error.message));
              else {
                toast.success("پیوست");
                setTitle("");
                void qc.invalidateQueries({ queryKey: ["sales-desk"] });
              }
            });
        }}
      >
        افزودن پیوست
      </Button>
    </div>
  );
}

export function DealFeedZoom(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: Array<{ id: string; title: string | null; kind: string }>;
}) {
  const [kind, setKind] = useState("all");
  const shown = props.items.filter((i) => kind === "all" || i.kind === kind);
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[80vh] overflow-y-auto sm:max-w-lg" data-testid="pass3-d13-zoom">
        <DialogHeader>
          <DialogTitle>بزرگتر ببین و فیلتر کن</DialogTitle>
        </DialogHeader>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger aria-label="فیلتر تاریخچه">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه</SelectItem>
            <SelectItem value="note">یادداشت ها</SelectItem>
            <SelectItem value="call">فعالیت ها</SelectItem>
          </SelectContent>
        </Select>
        <ul className="space-y-1 text-sm">
          {shown.map((i) => (
            <li key={i.id}>{i.title || i.kind}</li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
