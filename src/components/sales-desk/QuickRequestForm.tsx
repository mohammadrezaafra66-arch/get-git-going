import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  createSalesInteraction,
  salesDeskErrorMessage,
  parseCreateDealInteraction,
  createDealInteractionSchema,
} from "@/lib/sales-desk";
import {
  listSalesPipelines,
  listSalesPipelineStages,
} from "@/lib/sales-desk/pipelines";
import { supabase } from "@/integrations/supabase/client";
import {
  PersianFollowUpFields,
  combineTehranFollowUpIso,
} from "./PersianFollowUpFields";
import {
  RequestedProductsBlock,
  type RequestedProductLine,
} from "./RequestedProductsBlock";

type Props = {
  /** اگر از پاپ‌آپ تماس باز شود، شخص از قبل مشخص است. */
  initialPersonId?: string | null;
  initialPersonName?: string | null;
  customerId?: string | null;
  callLogId?: string | null;
  compact?: boolean;
  onCreated?: (id: string) => void;
  /** Optional submit button label. Default «افزودن معامله». */
  submitLabel?: string;
};

/**
 * فرم افزودن معامله (kind=request).
 */
export function QuickRequestForm({
  initialPersonId = null,
  initialPersonName = null,
  customerId = null,
  callLogId = null,
  compact = false,
  onCreated,
  submitLabel = "افزودن معامله",
}: Props) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const searchFn = useServerFn(searchPersons);

  const [personId, setPersonId] = useState<string | null>(initialPersonId);
  const [personName, setPersonName] = useState<string | null>(initialPersonName);
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 350);
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  /** Empty default — no __me__ sentinel (C2). */
  const [salespersonId, setSalespersonId] = useState<string>("");
  const [salespersonError, setSalespersonError] = useState<string | null>(null);
  const [followUpDate, setFollowUpDate] = useState<string | null>(null);
  const [followUpTime, setFollowUpTime] = useState("09:00");
  const [productLines, setProductLines] = useState<RequestedProductLine[]>([]);
  const [pipelineId, setPipelineId] = useState("");
  const [stageId, setStageId] = useState("");

  const resultsQ = useQuery({
    queryKey: ["sales-desk", "person-picker", debounced],
    enabled: !personId && debounced.trim().length >= 2,
    queryFn: () => searchFn({ data: { query: debounced } }),
    staleTime: 30_000,
  });

  const staffQ = useQuery({
    queryKey: ["sales-desk", "staff-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("status", "active")
        .order("full_name")
        .limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const pipesQ = useQuery({
    queryKey: ["sales-desk", "pipelines-active"],
    queryFn: () => listSalesPipelines({ activeOnly: true }),
    staleTime: 60_000,
  });
  const defaultPipe = pipelineId || pipesQ.data?.[0]?.id || "";
  const stagesQ = useQuery({
    queryKey: ["sales-desk", "stages-active", defaultPipe],
    enabled: !!defaultPipe,
    queryFn: () => listSalesPipelineStages({ pipelineId: defaultPipe, activeOnly: true }),
    staleTime: 60_000,
  });
  const defaultStage = stageId || stagesQ.data?.[0]?.id || "";

  const mutation = useMutation({
    mutationFn: async () => {
      if (!personId) throw new Error("ابتدا شخص را انتخاب کنید");
      const trimmed = body.trim();
      if (!trimmed) throw new Error("متن درخواست الزامی است");
      const nextFollowUpAt = combineTehranFollowUpIso(followUpDate, followUpTime);
      // C2 — zod requires salespersonId uuid before createSalesInteraction
      return createSalesInteraction(
        parseCreateDealInteraction({
          personId,
          kind: "request" as const,
          body: trimmed,
          title: title.trim() || null,
          customerId: customerId || null,
          salespersonId,
          callLogId: callLogId || null,
          nextFollowUpAt,
          source: callLogId ? "caller_popup" : "sales_desk",
          status: "open" as const,
          pipelineId: defaultPipe || null,
          stageId: defaultStage || null,
          items: productLines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            note: l.note || null,
          })),
        }),
      );
    },
    onSuccess: (id) => {
      toast.success("معامله ثبت شد");
      setBody("");
      setTitle("");
      setFollowUpDate(null);
      setFollowUpTime("09:00");
      setSalespersonId("");
      setSalespersonError(null);
      setProductLines([]);
      if (!initialPersonId) {
        setPersonId(null);
        setPersonName(null);
        setQuery("");
      }
      qc.invalidateQueries({ queryKey: ["sales-desk"] });
      onCreated?.(id);
    },
    onError: (e: Error) =>
      toast.error(salesDeskErrorMessage(e.message) || "افزودن معامله ناموفق بود"),
  });

  const onSubmit = () => {
    const sp = createDealInteractionSchema.shape.salespersonId.safeParse(salespersonId);
    if (!sp.success) {
      setSalespersonError("مسئول معامله الزامی است");
      return;
    }
    setSalespersonError(null);
    mutation.mutate();
  };

  const authorDisplay = profile?.full_name?.trim() || "کاربر جاری";

  const form = (
    <div className="space-y-3" dir="rtl">
      {!personId ? (
        <div className="space-y-2">
          <Label htmlFor="sd-person-q">جستجوی شخص</Label>
          <div className="relative">
            <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="sd-person-q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="نام یا بخشی از نام (حداقل ۲ حرف)"
              className="pr-9"
            />
          </div>
          {resultsQ.isFetching ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> در حال جستجو…
            </p>
          ) : null}
          {(resultsQ.data ?? []).length > 0 ? (
            <ul className="max-h-40 overflow-auto rounded-md border border-border">
              {resultsQ.data!.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-right text-sm hover:bg-muted/50"
                    onClick={() => {
                      setPersonId(p.id);
                      setPersonName(p.display_name);
                      setQuery("");
                    }}
                  >
                    {p.display_name}
                    {p.legal_name ? (
                      <span className="mr-2 text-xs text-muted-foreground">
                        ({p.legal_name})
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : debounced.trim().length >= 2 && !resultsQ.isFetching ? (
            <p className="text-xs text-muted-foreground">نتیجه‌ای یافت نشد.</p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm">
          <span>
            شخص:{" "}
            <strong>
              {personName ?? (
                <span dir="ltr" className="inline-block font-mono text-xs">
                  {personId}
                </span>
              )}
            </strong>
          </span>
          {!initialPersonId ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setPersonId(null);
                setPersonName(null);
              }}
            >
              تغییر
            </Button>
          ) : null}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="sd-req-title">عنوان (اختیاری)</Label>
        <Input
          id="sd-req-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
        />
      </div>

      <RequestedProductsBlock
        lines={productLines}
        onChange={setProductLines}
        disabled={mutation.isPending}
      />

      <div className="space-y-1.5">
        <Label htmlFor="sd-req-body">متن درخواست</Label>
        <Textarea
          id="sd-req-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={compact ? 3 : 4}
          placeholder="چه می‌خواهد؟ جزئیات را بنویسید…"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>مسئول معامله</Label>
          <Select
            value={salespersonId || undefined}
            onValueChange={(v) => {
              setSalespersonId(v);
              setSalespersonError(null);
            }}
          >
            <SelectTrigger className={salespersonError ? "border-destructive" : undefined}>
              <SelectValue placeholder="انتخاب مسئول معامله" />
            </SelectTrigger>
            <SelectContent>
              {(staffQ.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.full_name || p.id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {salespersonError ? (
            <p className="text-xs text-destructive">{salespersonError}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label>ایجاد کننده معامله</Label>
          <Input value={authorDisplay} readOnly disabled className="bg-muted/40" />
        </div>
        <div className="space-y-1.5">
          <Label>کاریز</Label>
          <Select
            value={defaultPipe || undefined}
            onValueChange={(v) => {
              setPipelineId(v);
              setStageId("");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="کاریز" />
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
        <div className="space-y-1.5">
          <Label>مرحله</Label>
          <Select value={defaultStage || undefined} onValueChange={setStageId}>
            <SelectTrigger>
              <SelectValue placeholder="مرحله" />
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
      </div>

      <PersianFollowUpFields
        idPrefix="sd-req-fu"
        dateIso={followUpDate}
        timeHm={followUpTime}
        onDateChange={setFollowUpDate}
        onTimeChange={setFollowUpTime}
      />

      <Button
        type="button"
        disabled={mutation.isPending || !personId}
        onClick={onSubmit}
      >
        {mutation.isPending ? (
          <Loader2 className="ml-2 h-4 w-4 animate-spin" />
        ) : null}
        {submitLabel}
      </Button>
    </div>
  );

  if (compact) return form;

  return (
    <Card dir="rtl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">افزودن معامله</CardTitle>
      </CardHeader>
      <CardContent>{form}</CardContent>
    </Card>
  );
}
