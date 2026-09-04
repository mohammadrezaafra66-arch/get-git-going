import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toFaDigits } from "@/lib/i18n/formatters";
import { ASAN_PERSON_HEADERS, parseAsanPersons, type ParseResult } from "@/lib/asan/parse-persons";
import { AsanProductImport } from "@/components/asan/AsanProductImport";

/**
 * ASAN M3.3 — the staged Asan person import workbench.
 *
 * The pipeline is upload → preview → stage → classify → confirm, and **every rule
 * that matters lives in the database, not here**:
 *
 *   * a `conflict` row can never be applied — enforced by a trigger on
 *     `asan_import_person_rows`, so a direct PostgREST PATCH is refused too;
 *   * an update never overwrites a non-empty AfraKala value — enforced inside
 *     `asan_commit_person_batch`;
 *   * a row that would leave a person without an Asan code or without a mobile
 *     number is refused and counted — enforced inside `asan_commit_person_batch`
 *     via `asan_person_import_rejection`, which `asan_classify_person_batch` also
 *     calls so the warning shown here is the very sentence the commit will use
 *     (migration 430).
 *
 * This page therefore does not re-implement those rules; it only makes them
 * visible and refuses to offer the buttons that the database would reject anyway.
 * That ordering is deliberate: a control that looks available but is refused by
 * the backend teaches the user to distrust the form.
 *
 * The parse is client-side (`parseAsanPersons`, by header text) because the file
 * lives on the user's machine and this codebase already reads xlsx in the browser
 * with SheetJS (see `AsanProductImport`). Nothing is written until the user presses
 * "ثبت در جدول موقت".
 *
 * A-6 (2026-09-04) — this is now the ONLY person-import surface. `/persons/import`,
 * `POST /api/persons/import`, `/sales/customers/import` and the `person_import_batch`
 * RPC were retired in the same change: four surfaces existed, only this one was ever
 * used (33 audit rows against zero), and the enforcement in migration 430 has to live
 * in the writer people actually reach rather than be written four times.
 */

const PAGE_SIZE = 50;
const CHUNK = 200;

type Classification = "new" | "update" | "conflict" | "unchanged";
type Decision = "pending" | "accept" | "skip";

type Batch = {
  id: string;
  kind: string;
  file_name: string | null;
  row_count: number;
  status: string;
  /** 430 — no longer numbers only: `rejections` is an array and `summary` a string. */
  stats: Record<string, unknown> | null;
  created_at: string;
};

type StagedRow = {
  id: string;
  row_number: number;
  asan_code: string | null;
  display_name: string | null;
  mobile_raw: string | null;
  landline_raw: string | null;
  national_id_raw: string | null;
  address: string | null;
  classification: Classification;
  matched_person_id: string | null;
  match_reason: string | null;
  conflict_reason: string | null;
  decision: Decision;
  applied_at: string | null;
  /** 430 — why the commit will refuse this row, in the words the commit will use. */
  apply_note: string | null;
};

type MatchedPerson = { id: string; display_name: string | null; notes: string | null };

const CLASS_LABEL: Record<Classification, string> = {
  new: "شخص تازه",
  update: "به‌روزرسانی",
  conflict: "تعارض",
  unchanged: "بدون تغییر",
};

const CLASS_HINT: Record<Classification, string> = {
  new: "در افراکالا پیدا نشد؛ با تأیید شما یک شخص تازه ساخته می‌شود.",
  update: "شخص موجود پیدا شد؛ فقط فیلدهای خالی افراکالا پر می‌شوند.",
  conflict: "نیاز به داوری انسان دارد و قابل تأیید نیست.",
  unchanged: "چیزی برای تغییر ندارد.",
};

const MATCH_REASON_LABEL: Record<string, string> = {
  asan_code: "کد حساب آسان",
  mobile: "موبایل",
  name: "نام",
};

const FILTERS: { key: Classification | "all"; label: string }[] = [
  { key: "all", label: "همه" },
  { key: "new", label: CLASS_LABEL.new },
  { key: "update", label: CLASS_LABEL.update },
  { key: "conflict", label: CLASS_LABEL.conflict },
  { key: "unchanged", label: CLASS_LABEL.unchanged },
];

export const Route = createFileRoute("/_app/admin/asan-import")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "accountant"]);
  },
  component: AsanImportPage,
});

function AsanImportPage() {
  const { roles } = useAuth();
  const allowed = roles.includes("admin") || roles.includes("accountant");

  if (!allowed) {
    return <div className="p-6 text-muted-foreground">دسترسی ندارید.</div>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6" dir="rtl">
      <PageHeader
        title="ورود اطلاعات از آسان"
        description="فایل آسان را بخوانید، پیش‌نمایش بگیرید و فقط پس از تأیید صریح ثبت کنید"
      />

      <Tabs defaultValue="persons">
        <TabsList>
          <TabsTrigger value="persons">اشخاص</TabsTrigger>
          <TabsTrigger value="products">کالاها</TabsTrigger>
        </TabsList>
        <TabsContent value="persons" className="mt-4">
          <AsanPersonImportPanel />
        </TabsContent>
        <TabsContent value="products" className="mt-4">
          <AsanProductImport />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AsanPersonImportPanel() {
  const { user } = useAuth();

  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [parsing, setParsing] = useState(false);

  const [batch, setBatch] = useState<Batch | null>(null);
  const [staging, setStaging] = useState(false);
  const [stagingPct, setStagingPct] = useState(0);
  const [classifying, setClassifying] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [reverting, setReverting] = useState(false);

  const [rows, setRows] = useState<StagedRow[]>([]);
  const [people, setPeople] = useState<Record<string, MatchedPerson>>({});
  const [rowsLoading, setRowsLoading] = useState(false);
  const [filter, setFilter] = useState<Classification | "all">("all");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [busyRow, setBusyRow] = useState<string | null>(null);

  /** Reload the batch header so `stats` and `status` reflect the last RPC. */
  const reloadBatch = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("asan_import_batches")
      .select("id, kind, file_name, row_count, status, stats, created_at")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      toast.error(`خواندن دسته ناموفق بود: ${error.message}`);
      return;
    }
    if (data) setBatch(data as unknown as Batch);
  }, []);

  const loadRows = useCallback(async () => {
    if (!batch) return;
    setRowsLoading(true);
    let q = supabase
      .from("asan_import_person_rows")
      .select(
        "id, row_number, asan_code, display_name, mobile_raw, landline_raw, national_id_raw, address, classification, matched_person_id, match_reason, conflict_reason, decision, applied_at, apply_note",
        { count: "exact" },
      )
      .eq("batch_id", batch.id);
    if (filter !== "all") q = q.eq("classification", filter);

    const { data, error, count } = await q
      .order("row_number", { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (error) {
      toast.error(`خواندن ردیف‌ها ناموفق بود: ${error.message}`);
      setRowsLoading(false);
      return;
    }
    const list = (data ?? []) as unknown as StagedRow[];
    setRows(list);
    setTotal(count ?? 0);

    // Field-level diff needs the AfraKala side of each matched row. Only the ids on
    // this page are fetched — 488 rows must not become 488 lookups.
    const ids = Array.from(
      new Set(list.map((r) => r.matched_person_id).filter((v): v is string => !!v)),
    );
    if (ids.length > 0) {
      const { data: persons } = await supabase
        .from("persons")
        .select("id, display_name, notes")
        .in("id", ids);
      const map: Record<string, MatchedPerson> = {};
      for (const p of (persons ?? []) as unknown as MatchedPerson[]) map[p.id] = p;
      setPeople(map);
    } else {
      setPeople({});
    }
    setRowsLoading(false);
  }, [batch, filter, page]);

  useEffect(() => {
    if (batch) void loadRows();
  }, [batch, loadRows]);

  /**
   * Staging 488 rows and then losing the id would strand them, so an existing
   * staged batch is adopted on mount rather than starting a second one.
   */
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("asan_import_batches")
        .select("id, kind, file_name, row_count, status, stats, created_at")
        .eq("kind", "persons")
        .eq("status", "staged")
        .order("created_at", { ascending: false })
        .limit(1);
      const found = (data ?? [])[0] as unknown as Batch | undefined;
      if (found) setBatch(found);
    })();
  }, []);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setParsed(null);
    setParsing(true);
    try {
      const XLSX = await import("xlsx");
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) throw new Error("فایل اکسل خالی است");
      // `raw: false` keeps codes as the text Asan wrote them; a numeric coercion
      // would silently drop a leading zero from an account code.
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
        header: 1,
        raw: false,
        defval: null,
      });
      const result = parseAsanPersons(matrix);
      if (result.rows.length === 0) throw new Error("هیچ ردیف داده‌ای در فایل پیدا نشد");
      setParsed(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطا در خواندن فایل");
      setFile(null);
      setParsed(null);
    } finally {
      setParsing(false);
    }
  }

  async function stageAndClassify() {
    if (!parsed || parsed.rows.length === 0) return;
    setStaging(true);
    setStagingPct(0);
    try {
      const { data, error } = await supabase
        .from("asan_import_batches")
        .insert({
          kind: "persons",
          file_name: file?.name ?? null,
          row_count: parsed.rows.length,
          created_by: user?.id ?? null,
        })
        .select("id, kind, file_name, row_count, status, stats, created_at")
        .single();
      if (error || !data) throw new Error(error?.message ?? "ساخت دسته ناموفق بود");
      const created = data as unknown as Batch;

      for (let i = 0; i < parsed.rows.length; i += CHUNK) {
        const chunk = parsed.rows.slice(i, i + CHUNK).map((r) => ({ ...r, batch_id: created.id }));
        const res = await supabase.from("asan_import_person_rows").insert(chunk);
        if (res.error) throw new Error(res.error.message);
        setStagingPct(
          Math.round((Math.min(i + CHUNK, parsed.rows.length) / parsed.rows.length) * 100),
        );
      }

      setBatch(created);
      setPage(0);
      setFilter("all");
      toast.success(`${toFaDigits(parsed.rows.length)} ردیف در جدول موقت ثبت شد`);
      await classify(created.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ثبت در جدول موقت ناموفق بود");
    } finally {
      setStaging(false);
    }
  }

  async function classify(id: string) {
    setClassifying(true);
    const { error } = await supabase.rpc("asan_classify_person_batch", { p_batch_id: id });
    setClassifying(false);
    if (error) {
      toast.error(`طبقه‌بندی ناموفق بود: ${error.message}`);
      return;
    }
    await reloadBatch(id);
    await loadRows();
    toast.success("طبقه‌بندی انجام شد");
  }

  async function setDecision(row: StagedRow, decision: Decision) {
    setBusyRow(row.id);
    const { error } = await supabase
      .from("asan_import_person_rows")
      .update({ decision })
      .eq("id", row.id);
    setBusyRow(null);
    if (error) {
      toast.error(`ثبت تصمیم ناموفق بود: ${error.message}`);
      return;
    }
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, decision } : r)));
  }

  /** Bulk decision, scoped to one classification. `conflict` is never offered. */
  async function setDecisionForClass(cls: "new" | "update", decision: Decision) {
    if (!batch) return;
    const { error } = await supabase
      .from("asan_import_person_rows")
      .update({ decision })
      .eq("batch_id", batch.id)
      .eq("classification", cls);
    if (error) {
      toast.error(`ثبت گروهی ناموفق بود: ${error.message}`);
      return;
    }
    toast.success("تصمیم گروهی ثبت شد");
    await loadRows();
  }

  async function commit() {
    if (!batch) return;
    setCommitting(true);
    const { data, error } = await supabase.rpc("asan_commit_person_batch", {
      p_batch_id: batch.id,
    });
    setCommitting(false);
    if (error) {
      toast.error(`ثبت نهایی ناموفق بود: ${error.message}`);
      return;
    }
    const r = (data ?? {}) as {
      created?: number;
      updated?: number;
      skipped?: number;
      rejected?: number;
      summary?: string | null;
    };
    toast.success(
      `ثبت شد — ساخته‌شده: ${toFaDigits(r.created ?? 0)}، به‌روزشده: ${toFaDigits(r.updated ?? 0)}`,
    );
    // 430 — a refused row is reported, never silently dropped. The sentence comes from
    // the RPC so the page cannot drift from the rule; only the digits are localised.
    if (r.summary) toast.error(toFaDigits(r.summary), { duration: 10_000 });
    await reloadBatch(batch.id);
    await loadRows();
  }

  /** Clear the panel. Writes nothing — used once a batch has been committed or reverted. */
  function closePanel() {
    setBatch(null);
    setRows([]);
    setParsed(null);
    setFile(null);
  }

  /**
   * Throw away a batch that was never committed. Unchanged since M3.3, and still correct
   * for exactly that case: a staged batch has written nothing, so marking it discarded is
   * the whole of the undo. It is no longer offered on a committed batch, where it used to
   * claim the import had been thrown away while every person it created stayed (A-7/F31).
   */
  async function discard() {
    if (!batch) return;
    const { error } = await supabase
      .from("asan_import_batches")
      .update({ status: "discarded" })
      .eq("id", batch.id);
    if (error) {
      toast.error(`کنارگذاشتن دسته ناموفق بود: ${error.message}`);
      return;
    }
    toast.success("دسته کنار گذاشته شد. هیچ‌چیز در افراکالا تغییر نکرد.");
    closePanel();
  }

  /**
   * A-7 — undo the reversible half of a committed batch. The RPC owns the rule; this only
   * reports what it did, including what it could not do. Persons the batch created are
   * never deleted here: `persons` has no delete path and removing people is a separate,
   * owner-gated decision.
   */
  async function revert() {
    if (!batch) return;
    setReverting(true);
    const { data, error } = await supabase.rpc("asan_revert_person_batch", {
      p_batch_id: batch.id,
    });
    setReverting(false);
    if (error) {
      toast.error(`بازگردانی ناموفق بود: ${error.message}`);
      return;
    }
    const r = (data ?? {}) as {
      revoked_identifiers?: number;
      persons_created_remaining?: number;
    };
    toast.success(
      `بازگردانی انجام شد — ${toFaDigits(r.revoked_identifiers ?? 0)} شناسه باطل شد.`,
    );
    if ((r.persons_created_remaining ?? 0) > 0) {
      toast.warning(
        `${toFaDigits(r.persons_created_remaining ?? 0)} شخصی که این دسته ساخته بود حذف نشد؛ حذف شخص از این صفحه انجام نمی‌شود.`,
        { duration: 12_000 },
      );
    }
    await reloadBatch(batch.id);
    await loadRows();
  }

  const stats = batch?.stats ?? {};
  /** `stats` mixes numbers, an array and a string since 430 — read it defensively. */
  const statNum = (key: string): number => {
    const v = stats[key];
    return typeof v === "number" ? v : 0;
  };
  const statText = (key: string): string | null => {
    const v = stats[key];
    return typeof v === "string" && v.length > 0 ? v : null;
  };
  const acceptedCount = useMemo(() => rows.filter((r) => r.decision === "accept").length, [rows]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isCommitted = batch?.status === "committed";
  const isReverted = batch?.status === "reverted";
  /** Committed or reverted: the staged decisions are history and nothing more is applied. */
  const isClosed = isCommitted || isReverted;

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        هیچ چیزی تا لحظهٔ «ثبت نهایی» در افراکالا نوشته نمی‌شود. ردیف‌های دارای تعارض قابل تأیید
        نیستند و در به‌روزرسانی، مقدار پرشدهٔ افراکالا هرگز با مقدار آسان بازنویسی نمی‌شود؛ فقط
        فیلدهای خالی پر می‌شوند. هر شخص باید هم «کد حساب آسان» داشته باشد و هم «موبایل»؛ ردیفی که
        یکی از این دو را ندارد وارد نمی‌شود و دلیلش همین‌جا نوشته می‌شود.
      </div>

      {/* ---------------------------------------------------------- step 1 --- */}
      {!batch && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center gap-2 font-medium">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              مرحله ۱: انتخاب فایل اشخاص آسان
            </div>
            <div className="space-y-1">
              <Label htmlFor="asan-persons-file" className="text-xs">
                فایل xlsx خروجی «اشخاص» از آسان
              </Label>
              <Input
                id="asan-persons-file"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFile}
                disabled={parsing || staging}
              />
              {parsing && (
                <p className="flex items-center text-xs text-muted-foreground">
                  <Loader2 className="ml-1 h-3 w-3 animate-spin" /> در حال خواندن فایل…
                </p>
              )}
            </div>

            {parsed && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{toFaDigits(parsed.rows.length)} ردیف خوانده شد</Badge>
                  {file && <Badge variant="outline">{file.name}</Badge>}
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">
                    ستون‌ها بر اساس «متن سرستون» شناسایی می‌شوند، نه جای ستون:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(ASAN_PERSON_HEADERS) as (keyof typeof ASAN_PERSON_HEADERS)[]).map(
                      (f) => (
                        <Badge key={f} variant={parsed.mapping[f] ? "outline" : "destructive"}>
                          {ASAN_PERSON_HEADERS[f]}: {parsed.mapping[f] ? "پیدا شد" : "پیدا نشد"}
                        </Badge>
                      ),
                    )}
                  </div>
                </div>

                {parsed.warnings.length > 0 && (
                  <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:bg-amber-950/30">
                    {parsed.warnings.map((w, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1 text-amber-800 dark:text-amber-300"
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {w}
                      </div>
                    ))}
                  </div>
                )}

                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ردیف</TableHead>
                        <TableHead>کد حساب</TableHead>
                        <TableHead>نام حساب</TableHead>
                        <TableHead>موبایل</TableHead>
                        <TableHead>تلفن</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsed.rows.slice(0, 5).map((r) => (
                        <TableRow key={r.row_number}>
                          <TableCell>{toFaDigits(r.row_number)}</TableCell>
                          <TableCell className="font-mono">{r.asan_code ?? "—"}</TableCell>
                          <TableCell>{r.display_name ?? "—"}</TableCell>
                          <TableCell className="font-mono">{r.mobile_raw ?? "—"}</TableCell>
                          <TableCell className="font-mono">{r.landline_raw ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">
                    پیش‌نمایش ۵ ردیف اول. ثبت در جدول موقت هیچ تغییری در اشخاص افراکالا نمی‌دهد.
                  </span>
                  <Button onClick={stageAndClassify} disabled={staging || classifying}>
                    {(staging || classifying) && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                    <Upload className="ml-2 h-4 w-4" />
                    ثبت در جدول موقت
                  </Button>
                </div>

                {staging && (
                  <div className="space-y-1">
                    <Progress value={stagingPct} />
                    <p className="text-center text-xs text-muted-foreground">
                      {toFaDigits(stagingPct)}٪
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---------------------------------------------------------- step 2 --- */}
      {batch && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                مرحله ۲: بررسی و تأیید
                {batch.file_name && (
                  <span className="text-xs font-normal text-muted-foreground">
                    ({batch.file_name})
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => classify(batch.id)}
                  disabled={classifying || isClosed}
                >
                  {classifying ? (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="ml-2 h-4 w-4" />
                  )}
                  طبقه‌بندی مجدد
                </Button>
                {isCommitted && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={revert}
                    disabled={reverting}
                    title="شناسه‌هایی را که این دسته به اشخاص موجود اضافه کرده باطل می‌کند؛ اشخاص تازه‌ساخته حذف نمی‌شوند."
                  >
                    {reverting ? (
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Undo2 className="ml-2 h-4 w-4" />
                    )}
                    بازگردانی ثبت
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={isClosed ? closePanel : discard}
                  disabled={committing || reverting}
                >
                  <Trash2 className="ml-2 h-4 w-4" />
                  {isClosed ? "بستن" : "کنار گذاشتن"}
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">مجموع: {toFaDigits(batch.row_count)}</Badge>
              {(["new", "update", "conflict", "unchanged"] as Classification[]).map((c) =>
                statNum(c) ? (
                  <Badge key={c} variant={c === "conflict" ? "destructive" : "secondary"}>
                    {CLASS_LABEL[c]}: {toFaDigits(statNum(c))}
                  </Badge>
                ) : null,
              )}
              {!isClosed && statNum("incomplete") > 0 && (
                <Badge variant="destructive">
                  ناقص (بدون کد آسان یا موبایل): {toFaDigits(statNum("incomplete"))}
                </Badge>
              )}
              {isReverted && (
                <Badge variant="outline">
                  بازگردانده شد — {toFaDigits(statNum("revoked_identifiers"))} شناسه باطل شد،{" "}
                  {toFaDigits(statNum("persons_created_remaining"))} شخص تازه باقی ماند
                </Badge>
              )}
              {isClosed && (
                <>
                  <Badge>ساخته‌شده: {toFaDigits(statNum("created"))}</Badge>
                  <Badge>به‌روزشده: {toFaDigits(statNum("updated"))}</Badge>
                  {statNum("rejected") > 0 && (
                    <Badge variant="destructive">
                      وارد نشده: {toFaDigits(statNum("rejected"))}
                    </Badge>
                  )}
                </>
              )}
            </div>

            {isClosed && statText("summary") && (
              <div className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800 dark:bg-red-950/30 dark:text-red-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {toFaDigits(statText("summary") ?? "")}
              </div>
            )}

            {!isClosed && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                <span className="text-xs text-muted-foreground">تصمیم گروهی:</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDecisionForClass("new", "accept")}
                >
                  تأیید همهٔ «شخص تازه»
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDecisionForClass("update", "accept")}
                >
                  تأیید همهٔ «به‌روزرسانی»
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDecisionForClass("new", "skip")}
                >
                  رد همهٔ «شخص تازه»
                </Button>
              </div>
            )}

            <div className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <Button
                  key={f.key}
                  size="sm"
                  variant={filter === f.key ? "default" : "outline"}
                  onClick={() => {
                    setFilter(f.key);
                    setPage(0);
                  }}
                >
                  {f.label}
                </Button>
              ))}
            </div>

            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ردیف</TableHead>
                    <TableHead>کد حساب</TableHead>
                    <TableHead>نام (آسان)</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>در افراکالا</TableHead>
                    <TableHead>تصمیم</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rowsLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="p-6 text-center text-muted-foreground">
                        <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                      </TableCell>
                    </TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="p-6 text-center text-muted-foreground">
                        ردیفی با این فیلتر وجود ندارد.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r) => {
                      const matched = r.matched_person_id ? people[r.matched_person_id] : undefined;
                      return (
                        <TableRow key={r.id}>
                          <TableCell>{toFaDigits(r.row_number)}</TableCell>
                          <TableCell className="font-mono whitespace-nowrap">
                            {r.asan_code ?? "—"}
                          </TableCell>
                          <TableCell>
                            <div>{r.display_name ?? "—"}</div>
                            <div className="font-mono text-xs text-muted-foreground">
                              {r.mobile_raw ?? ""}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                r.classification === "conflict" ? "destructive" : "secondary"
                              }
                            >
                              {CLASS_LABEL[r.classification]}
                            </Badge>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {r.conflict_reason ??
                                (r.match_reason
                                  ? `تطبیق بر اساس ${MATCH_REASON_LABEL[r.match_reason] ?? r.match_reason}`
                                  : CLASS_HINT[r.classification])}
                            </div>
                            {r.apply_note && (
                              <div className="mt-1 flex items-start gap-1 text-xs text-red-700 dark:text-red-400">
                                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                {toFaDigits(r.apply_note)}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="min-w-[12rem]">
                            {matched ? (
                              <div className="text-xs">
                                <div>{matched.display_name ?? "—"}</div>
                                {r.classification === "update" && (
                                  <div className="mt-1 text-muted-foreground">
                                    {matched.notes && matched.notes.trim() !== ""
                                      ? "آدرس/توضیحات پر است — دست‌نخورده می‌ماند"
                                      : r.address
                                        ? "آدرس خالی است — از آسان پر می‌شود"
                                        : "چیزی برای پرکردن نیست"}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="min-w-[10rem]">
                            {r.applied_at ? (
                              <Badge variant="outline">ثبت شد</Badge>
                            ) : r.classification === "conflict" ? (
                              <span className="text-xs text-muted-foreground">قابل تأیید نیست</span>
                            ) : r.apply_note ? (
                              // The commit RPC refuses this row. Offering "تأیید" here would
                              // teach the user to distrust the form, which is exactly what
                              // this page's docstring says it will not do.
                              <span className="text-xs text-muted-foreground">قابل ورود نیست</span>
                            ) : isClosed ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant={r.decision === "accept" ? "default" : "outline"}
                                  disabled={busyRow === r.id || r.classification === "unchanged"}
                                  onClick={() => setDecision(r, "accept")}
                                >
                                  تأیید
                                </Button>
                                <Button
                                  size="sm"
                                  variant={r.decision === "skip" ? "default" : "ghost"}
                                  disabled={busyRow === r.id}
                                  onClick={() => setDecision(r, "skip")}
                                >
                                  رد
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  قبلی
                </Button>
                صفحهٔ {toFaDigits(page + 1)} از {toFaDigits(pageCount)} — {toFaDigits(total)} ردیف
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page + 1 >= pageCount}
                  onClick={() => setPage((p) => p + 1)}
                >
                  بعدی
                </Button>
              </div>

              {!isClosed && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    در این صفحه {toFaDigits(acceptedCount)} ردیف تأییدشده
                  </span>
                  <Button onClick={commit} disabled={committing}>
                    {committing && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                    ثبت نهایی در افراکالا
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
