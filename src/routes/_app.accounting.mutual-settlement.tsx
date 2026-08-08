import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Scale, ArrowLeftRight } from "lucide-react";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { toFaDigits, formatNumber } from "@/lib/i18n/formatters";
import { useDebounce } from "@/hooks/use-debounce";

import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { JalaliDateInput } from "@/shared/components/JalaliDateInput";
import { ACCOUNT_TYPE_FA, fetchAccountBalances } from "@/lib/treasury/queries";
import {
  SETTLEMENT_DIRECTION_FA,
  type SettlementCandidate,
  fetchSettlementCandidates,
  fetchSettlementPosition,
  postMutualSettlement,
} from "@/lib/accounting/mutual-settlement";

export const Route = createFileRoute("/_app/accounting/mutual-settlement")({
  beforeLoad: async () => {
    // Same pair the two database functions enforce. The route guard is the
    // convenience; person_settlement_position and post_mutual_settlement
    // refuse anyone else regardless of how they are called.
    await requireAnyRole(["admin", "accountant"]);
  },
  component: MutualSettlementPage,
});

function money(n: number | null | undefined) {
  if (n == null) return "—";
  return `${toFaDigits(Math.round(Number(n)).toLocaleString("en-US"))} تومان`;
}

function directionBadge(direction: SettlementCandidate["direction"]) {
  const label = SETTLEMENT_DIRECTION_FA[direction];
  if (direction === "customer_pays") return <Badge variant="default">{label}</Badge>;
  if (direction === "we_pay") return <Badge variant="destructive">{label}</Badge>;
  return <Badge variant="secondary">{label}</Badge>;
}

function MutualSettlementPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [targetId, setTargetId] = useState<string | null>(null);

  const [offsetAmount, setOffsetAmount] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [note, setNote] = useState("");

  const candidatesQ = useQuery({
    queryKey: ["mutual-settlement-candidates"],
    queryFn: fetchSettlementCandidates,
  });

  const accountsQ = useQuery({
    queryKey: ["account-balances", "mutual-settlement"],
    queryFn: () => fetchAccountBalances({ includeInactive: false }),
    staleTime: 60_000,
  });

  // The dialog re-reads the position rather than trusting the list row: the
  // list may be seconds old, and this number decides how much money moves.
  const positionQ = useQuery({
    queryKey: ["settlement-position", targetId],
    queryFn: () => fetchSettlementPosition(targetId as string),
    enabled: Boolean(targetId),
  });

  const position = positionQ.data ?? null;

  // Defaults follow the arithmetic, but stay editable for a partial settlement.
  useEffect(() => {
    if (!position) return;
    const offset = Math.max(0, Math.min(position.receivable, position.payable));
    setOffsetAmount(String(offset));
    setCashAmount(String(Math.abs(position.net)));
  }, [position]);

  const offsetNum = Number(offsetAmount) || 0;
  const cashNum = Number(cashAmount) || 0;

  const cashDirection = useMemo(() => {
    if (!position) return null;
    const residualReceivable = Math.max(position.receivable, 0) - offsetNum;
    const residualPayable = Math.max(position.payable, 0) - offsetNum;
    if (residualReceivable > 0) return "customer_pays" as const;
    if (residualPayable > 0) return "we_pay" as const;
    return null;
  }, [position, offsetNum]);

  const settle = useMutation({
    mutationFn: async () => {
      if (!targetId) throw new Error("شخصی انتخاب نشده است");
      return postMutualSettlement({
        personId: targetId,
        offsetAmount: offsetNum,
        cashAmount: cashNum,
        bankAccountId: cashNum > 0 ? bankAccountId || null : null,
        note: note.trim() || null,
        entryDate: entryDate || null,
      });
    },
    onSuccess: () => {
      toast.success("تسویهٔ متقابل ثبت شد و سند حسابداری آن ساخته شد.");
      setTargetId(null);
      setBankAccountId("");
      setEntryDate("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["mutual-settlement-candidates"] });
      qc.invalidateQueries({ queryKey: ["settlement-position"] });
      qc.invalidateQueries({ queryKey: ["account-balances"] });
    },
    onError: (e: Error) => toast.error(`ثبت تسویه ناموفق: ${e.message}`),
  });

  const rows = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const all = candidatesQ.data ?? [];
    if (!q) return all;
    return all.filter((r) => (r.display_name ?? "").toLowerCase().includes(q));
  }, [candidatesQ.data, debouncedSearch]);

  const cashNeedsAccount = cashNum > 0 && !bankAccountId;
  const nothingToPost = offsetNum <= 0 && cashNum <= 0;

  return (
    <div className="space-y-4 pb-10" dir="rtl">
      <PageHeader
        title="تسویهٔ متقابل"
        description="اشخاصی که هم مشتری‌اند و هم تأمین‌کننده: طلب و بدهی‌شان را تهاتر کنید و فقط تفاوت را نقدی جابه‌جا کنید"
      />

      <Card>
        <CardContent className="p-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجوی نام شخص..."
            className="md:max-w-sm"
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {candidatesQ.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : candidatesQ.isError ? (
            <div className="py-10 text-center text-sm text-destructive">
              {(candidatesQ.error as Error).message}
            </div>
          ) : rows.length === 0 ? (
            <div className="space-y-2 py-10 text-center text-sm text-muted-foreground">
              <p>هیچ شخص دو‌نقشی‌ای یافت نشد.</p>
              <p className="text-xs">
                تسویهٔ متقابل فقط برای کسی معنا دارد که هم پروندهٔ مشتری دارد و هم پروندهٔ
                تأمین‌کننده. تا وقتی چنین شخصی ثبت نشده، این فهرست خالی می‌ماند.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">شخص</TableHead>
                    <TableHead className="text-right">طلب ما از او</TableHead>
                    <TableHead className="text-right">بدهی ما به او</TableHead>
                    <TableHead className="text-right">خالص</TableHead>
                    <TableHead className="text-right">وضعیت</TableHead>
                    <TableHead className="text-right">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.person_id}>
                      <TableCell>{r.display_name ?? "—"}</TableCell>
                      <TableCell>{money(r.receivable)}</TableCell>
                      <TableCell>{money(r.payable)}</TableCell>
                      <TableCell>{money(Math.abs(r.net))}</TableCell>
                      <TableCell>{directionBadge(r.direction)}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={r.receivable <= 0 && r.payable <= 0}
                          onClick={() => {
                            setTargetId(r.person_id);
                            setBankAccountId("");
                            setEntryDate("");
                            setNote("");
                          }}
                        >
                          <ArrowLeftRight className="ml-1 h-4 w-4" />
                          تسویه
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!targetId} onOpenChange={(o) => !o && setTargetId(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>ثبت تسویهٔ متقابل</DialogTitle>
            <DialogDescription>
              «تهاتر» طلب و بدهی را هم‌زمان کم می‌کند و هیچ پولی جابه‌جا نمی‌شود. «نقدی» فقط
              تفاوتِ باقیمانده است.
            </DialogDescription>
          </DialogHeader>

          {positionQ.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : positionQ.isError ? (
            <p className="py-6 text-center text-sm text-destructive">
              {(positionQ.error as Error).message}
            </p>
          ) : position ? (
            <div className="space-y-3">
              <div className="space-y-1 rounded-md border p-3 text-sm">
                <div>
                  <span className="text-muted-foreground">شخص: </span>
                  {position.display_name ?? "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">طلب ما از او: </span>
                  {money(position.receivable)}
                </div>
                <div>
                  <span className="text-muted-foreground">بدهی ما به او: </span>
                  {money(position.payable)}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Scale className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">خالص: </span>
                  {money(Math.abs(position.net))} — {directionBadge(position.direction)}
                </div>
              </div>

              <div className="space-y-1">
                <Label>مبلغ تهاتر</Label>
                <Input
                  dir="ltr"
                  className="text-left font-mono"
                  inputMode="numeric"
                  value={offsetAmount}
                  onChange={(e) => setOffsetAmount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  حداکثر {money(Math.max(0, Math.min(position.receivable, position.payable)))} —
                  بیشتر از کمترینِ طلب و بدهی نمی‌شود تهاتر کرد. برای تسویهٔ جزئی، عدد کمتری
                  بگذارید.
                </p>
              </div>

              <div className="space-y-1">
                <Label>مبلغ نقدی</Label>
                <Input
                  dir="ltr"
                  className="text-left font-mono"
                  inputMode="numeric"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {cashNum <= 0
                    ? "صفر یعنی فقط تهاتر انجام شود و هیچ پولی جابه‌جا نگردد."
                    : cashDirection === "customer_pays"
                      ? "این مبلغ را او به ما می‌پردازد و به حساب انتخابی وارد می‌شود."
                      : cashDirection === "we_pay"
                        ? "این مبلغ را ما به او می‌پردازیم و از حساب انتخابی خارج می‌شود."
                        : "بعد از تهاتر چیزی برای تسویهٔ نقدی باقی نمانده است."}
                </p>
              </div>

              {cashNum > 0 && (
                <div className="space-y-1">
                  <Label>
                    حساب / صندوق <span className="text-destructive">*</span>
                  </Label>
                  <Select value={bankAccountId} onValueChange={setBankAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder="انتخاب حساب" />
                    </SelectTrigger>
                    <SelectContent>
                      {(accountsQ.data ?? []).map((a) => (
                        <SelectItem key={a.account_id} value={a.account_id}>
                          {a.title} — {ACCOUNT_TYPE_FA[a.account_type] ?? a.account_type} (مانده:{" "}
                          {formatNumber(a.current_balance)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1">
                <Label>تاریخ سند</Label>
                <JalaliDateInput value={entryDate} onChange={setEntryDate} />
                <p className="text-xs text-muted-foreground">خالی یعنی امروز.</p>
              </div>

              <div className="space-y-1">
                <Label>یادداشت</Label>
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>

              <p className="text-xs text-muted-foreground">
                سند حسابداری متوازن به‌صورت خودکار ثبت می‌شود و پس از آن، طلب و بدهی این شخص
                به‌روز می‌گردد.
              </p>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setTargetId(null)}>
              انصراف
            </Button>
            <Button
              onClick={() => settle.mutate()}
              disabled={settle.isPending || !position || nothingToPost || cashNeedsAccount}
            >
              {settle.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              ثبت تسویه
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
