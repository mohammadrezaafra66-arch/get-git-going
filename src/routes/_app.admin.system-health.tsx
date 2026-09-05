import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle2, AlertTriangle, RefreshCw, Scale } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
import { supabase } from "@/integrations/supabase/client";
import { requireAdmin } from "@/lib/rbac/route-guards";
import { formatDateFa, toFaDigits } from "@/lib/i18n/formatters";

/**
 * C-7 (unwired wave 1) — the first UI surface for three read-only SECURITY DEFINER
 * diagnostics that existed in the database with no caller anywhere in `src` or `server`.
 *
 *   public.person_fk_drift_report()          -> TABLE(table_name text, drifted_rows bigint)
 *   public.polymorphic_ref_orphan_report()   -> TABLE(source_table text, kind text,
 *                                                     problem text, rows bigint)
 *   public.validate_journal_entry_balance(p_journal_entry_id uuid)
 *                                            -> TABLE(total_debit numeric, total_credit numeric,
 *                                                     is_balanced boolean)
 *
 * Signatures read from pg_proc, not from src/integrations/supabase/types.ts, which is stale.
 *
 * Nothing on this page writes. Every query is a plain SELECT through an RPC that the
 * database already grants to `authenticated`; the route guard is requireAdmin().
 */
export const Route = createFileRoute("/_app/admin/system-health")({
  // M6/OG-24 — see the note on /api-keys: beforeLoad cannot decide on a cold load.
  staticData: { gate: { kind: "admin" } },
  beforeLoad: async () => {
    await requireAdmin();
  },
  component: SystemHealthPage,
});

type RpcFn = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

// RPCs not present in the generated types — cast the fn name to satisfy the client.
// Same idiom as _app.gamification.admin.manual-metrics.tsx:111.
const rpc = supabase.rpc as unknown as RpcFn;

type DriftRow = { table_name: string; drifted_rows: number };
type OrphanRow = { source_table: string; kind: string; problem: string; rows: number };
type BalanceRow = { total_debit: number; total_credit: number; is_balanced: boolean };
type JournalEntryRow = {
  id: string;
  entry_date: string;
  description: string | null;
  doc_kind: string | null;
  status: string | null;
};

function QueryStates({
  isLoading,
  error,
  isEmpty,
  emptyText,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  if (isLoading) {
    return <div className="py-6 text-sm text-muted-foreground">در حال بارگذاری…</div>;
  }
  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-medium">اجرای این بررسی ناموفق بود.</div>
          <div className="mt-1 text-xs opacity-80">
            {error instanceof Error ? error.message : String(error)}
          </div>
        </div>
      </div>
    );
  }
  if (isEmpty) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        {emptyText}
      </div>
    );
  }
  return <>{children}</>;
}

function SystemHealthPage() {
  const drift = useQuery({
    queryKey: ["system-health", "person-fk-drift"],
    queryFn: async () => {
      const { data, error } = await rpc("person_fk_drift_report");
      if (error) throw new Error(error.message);
      return (data ?? []) as DriftRow[];
    },
    staleTime: 30_000,
  });

  const orphans = useQuery({
    queryKey: ["system-health", "polymorphic-orphans"],
    queryFn: async () => {
      const { data, error } = await rpc("polymorphic_ref_orphan_report");
      if (error) throw new Error(error.message);
      return (data ?? []) as OrphanRow[];
    },
    staleTime: 30_000,
  });

  const entries = useQuery({
    queryKey: ["system-health", "journal-entries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journal_entries")
        .select("id,entry_date,description,doc_kind,status")
        .order("entry_date", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as JournalEntryRow[];
    },
    staleTime: 30_000,
  });

  const [entryId, setEntryId] = useState<string>("");

  const balance = useQuery({
    queryKey: ["system-health", "journal-balance", entryId],
    enabled: entryId.length > 0,
    queryFn: async () => {
      const { data, error } = await rpc("validate_journal_entry_balance", {
        p_journal_entry_id: entryId,
      });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as BalanceRow[];
      return rows[0] ?? null;
    },
    staleTime: 0,
  });

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="سلامت داده‌ها"
          description="سه بررسی فقط-خواندنی روی یکپارچگی داده‌های پایگاه‌داده. هیچ‌کدام چیزی را تغییر نمی‌دهند."
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void drift.refetch();
            void orphans.refetch();
            if (entryId) void balance.refetch();
          }}
          disabled={drift.isFetching || orphans.isFetching}
        >
          <RefreshCw
            className={"ml-1 h-4 w-4 " + (drift.isFetching || orphans.isFetching ? "animate-spin" : "")}
          />
          بررسی مجدد
        </Button>
      </div>

      {/* 1) person_fk_drift_report --------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            ناسازگاری هویت شخص
            {drift.data && drift.data.length > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {toFaDigits(drift.data.length)}
              </Badge>
            )}
          </CardTitle>
          {/*
            The label must say exactly what the function measures and nothing more.
            person_fk_drift_report() has 15 arms; each counts rows where a *_person_id
            column disagrees with the person_id on the parent record. It is NOT an
            inventory of which tables reference `persons` — calling it that would make
            this screen actively misleading.
          */}
          <p className="text-xs leading-6 text-muted-foreground">
            شمارش ردیف‌هایی که در آن‌ها ستون <span className="font-mono">‎*_person_id‎</span> با
            <span className="font-mono"> person_id </span>
            رکورد والدش یکی نیست. این فهرست، فهرست جدول‌های مرتبط با «اشخاص» نیست؛ فقط ردیف‌های
            ناسازگار را می‌شمارد.
          </p>
        </CardHeader>
        <CardContent>
          <QueryStates
            isLoading={drift.isLoading}
            error={drift.error}
            isEmpty={(drift.data?.length ?? 0) === 0}
            emptyText="هیچ ناسازگاری هویتی پیدا نشد."
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">جدول</TableHead>
                  <TableHead className="text-right">تعداد ردیف ناسازگار</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(drift.data ?? []).map((r) => (
                  <TableRow key={r.table_name}>
                    <TableCell className="font-mono text-xs">{r.table_name}</TableCell>
                    <TableCell>{toFaDigits(r.drifted_rows)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </QueryStates>
        </CardContent>
      </Card>

      {/* 2) polymorphic_ref_orphan_report -------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            ارجاع‌های چندریختی بی‌مقصد
            {orphans.data && orphans.data.length > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {toFaDigits(orphans.data.length)}
              </Badge>
            )}
          </CardTitle>
          <p className="text-xs leading-6 text-muted-foreground">
            ارجاع‌هایی از نوع «جدول + شناسه» که مقصدشان یافت نمی‌شود یا نوعشان شناخته‌شده نیست.
          </p>
        </CardHeader>
        <CardContent>
          <QueryStates
            isLoading={orphans.isLoading}
            error={orphans.error}
            isEmpty={(orphans.data?.length ?? 0) === 0}
            emptyText="هیچ ارجاع بی‌مقصدی پیدا نشد."
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">جدول مبدأ</TableHead>
                  <TableHead className="text-right">نوع</TableHead>
                  <TableHead className="text-right">مشکل</TableHead>
                  <TableHead className="text-right">تعداد</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(orphans.data ?? []).map((r) => (
                  <TableRow key={`${r.source_table}|${r.kind}|${r.problem}`}>
                    <TableCell className="font-mono text-xs">{r.source_table}</TableCell>
                    <TableCell className="font-mono text-xs">{r.kind}</TableCell>
                    <TableCell className="font-mono text-xs">{r.problem}</TableCell>
                    <TableCell>{toFaDigits(r.rows)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </QueryStates>
        </CardContent>
      </Card>

      {/* 3) validate_journal_entry_balance -------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="h-4 w-4 text-primary" />
            تراز سند حسابداری
          </CardTitle>
          <p className="text-xs leading-6 text-muted-foreground">
            جمع بدهکار و بستانکار یک سند را می‌خواند و می‌گوید تراز است یا نه.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xl space-y-2">
            <Label htmlFor="sh-journal-entry">سند حسابداری</Label>
            {entries.isLoading ? (
              <div className="text-sm text-muted-foreground">در حال بارگذاری اسناد…</div>
            ) : entries.error ? (
              <div className="text-sm text-destructive">
                فهرست اسناد بارگذاری نشد:{" "}
                {entries.error instanceof Error ? entries.error.message : String(entries.error)}
              </div>
            ) : (entries.data?.length ?? 0) === 0 ? (
              <div className="text-sm text-muted-foreground">هیچ سند حسابداری ثبت نشده است.</div>
            ) : (
              <Select value={entryId} onValueChange={setEntryId}>
                <SelectTrigger id="sh-journal-entry">
                  <SelectValue placeholder="یک سند را انتخاب کنید" />
                </SelectTrigger>
                <SelectContent>
                  {(entries.data ?? []).map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {formatDateFa(e.entry_date)} — {e.description || e.doc_kind || e.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {!entryId ? (
            <div className="text-sm text-muted-foreground">
              برای دیدن نتیجه، یک سند انتخاب کنید.
            </div>
          ) : balance.isLoading ? (
            <div className="text-sm text-muted-foreground">در حال بررسی تراز…</div>
          ) : balance.error ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                بررسی تراز ناموفق بود:{" "}
                {balance.error instanceof Error ? balance.error.message : String(balance.error)}
              </span>
            </div>
          ) : !balance.data ? (
            <div className="text-sm text-muted-foreground">
              این سند هیچ ردیفی برای بررسی تراز ندارد.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">جمع بدهکار</div>
                <div className="mt-1 font-mono text-sm">{toFaDigits(balance.data.total_debit)}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">جمع بستانکار</div>
                <div className="mt-1 font-mono text-sm">{toFaDigits(balance.data.total_credit)}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">وضعیت</div>
                <div className="mt-1">
                  {balance.data.is_balanced ? (
                    <Badge className="bg-emerald-600 hover:bg-emerald-600">تراز است</Badge>
                  ) : (
                    <Badge variant="destructive">تراز نیست</Badge>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
