import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Download,
  RefreshCw,
  Trash2,
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
import { toFaDigits } from "@/lib/i18n/formatters";
import { parseDidarContacts, type DidarParseResult } from "@/lib/didar/parse-contacts";
import {
  DIDAR_SAMPLE_HEADERS,
  DIDAR_SAMPLE_REQUIRED_HEADER,
  downloadDidarSampleWorkbook,
} from "@/lib/didar/sample-workbook";
import { ImportPathButtons } from "@/components/import/ImportPathButtons";

const PAGE_SIZE = 50;
const STAGE_CHUNK = 200;
const COMMIT_CHUNK = 500;

type Classification = "new" | "incomplete" | "conflict";
type Decision = "pending" | "accept" | "skip";

type Batch = {
  id: string;
  kind: string;
  file_name: string | null;
  row_count: number;
  status: string;
  stats: Record<string, unknown> | null;
  created_at: string;
};

type StagedRow = {
  id: string;
  row_number: number;
  didar_id: string | null;
  display_name: string | null;
  mobile_raw: string | null;
  landline_raw: string | null;
  national_id_raw: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  classification: Classification;
  matched_person_id: string | null;
  match_reason: string | null;
  conflict_reason: string | null;
  decision: Decision;
  applied_at: string | null;
  apply_note: string | null;
};

const CLASS_LABEL: Record<Classification, string> = {
  new: "شخص تازه",
  incomplete: "ناقص",
  conflict: "تعارض",
};

const FILTERS: { key: Classification | "all"; label: string }[] = [
  { key: "all", label: "همه" },
  { key: "new", label: CLASS_LABEL.new },
  { key: "incomplete", label: CLASS_LABEL.incomplete },
  { key: "conflict", label: CLASS_LABEL.conflict },
];

export const Route = createFileRoute("/_app/admin/didar-import")({
  staticData: { gate: { kind: "anyRole", allowed: ["admin", "accountant"] } },
  beforeLoad: async () => {
    await requireAnyRole(["admin", "accountant"]);
  },
  component: DidarImportPage,
});

function DidarImportPage() {
  const { roles } = useAuth();
  const allowed = roles.includes("admin") || roles.includes("accountant");

  if (!allowed) {
    return <div className="p-6 text-muted-foreground">دسترسی ندارید.</div>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6" dir="rtl">
      <PageHeader
        title="ورود اشخاص از دیدار"
        description="مخاطبان دیدار بدون کد اسان را با شماره موبایل معتبر وارد کنید"
      />

      <ImportPathButtons current="didar" />

      <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
        <p>این صفحه برای مخاطبان دیدار است که هنوز خرید نکرده‌اند و کد اسان ندارند.</p>
        <p>شرط ورود فقط شماره موبایل معتبر ایران است.</p>
        <p>
          اگر این موبایل قبلاً در دستیار ثبت شده باشد — چه با کد اسان چه بدون آن — ردیف رد می‌شود و
          شخص تکراری ساخته نمی‌شود.
        </p>
        <p>
          ستون‌های «شهر» و «استان» اختیاری‌اند. اگر در فایل باشند، روی پروندهٔ مشتری در دستیار پر
          می‌شوند؛ خالی بودن آن‌ها ورود را متوقف نمی‌کند و مقدار پرشدهٔ قبلی بازنویسی نمی‌شود.
        </p>
        <p>
          افراد دارای کد اسان را از صفحهٔ «ورود اطلاعات از آسان» وارد کنید، نه از اینجا.
        </p>
      </div>

      <DidarPersonImportPanel />
    </div>
  );
}

function DidarPersonImportPanel() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<DidarParseResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [staging, setStaging] = useState(false);
  const [stagingPct, setStagingPct] = useState(0);
  const [classifying, setClassifying] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitPct, setCommitPct] = useState(0);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [rows, setRows] = useState<StagedRow[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<Classification | "all">("all");
  const [page, setPage] = useState(0);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [busyRow, setBusyRow] = useState<string | null>(null);

  const reloadBatch = async (id: string) => {
    const { data, error } = await supabase
      .from("didar_import_batches" as never)
      .select("id, kind, file_name, row_count, status, stats, created_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (data) setBatch(data as unknown as Batch);
  };

  const loadRows = useCallback(async () => {
    if (!batch) return;
    setRowsLoading(true);
    let q = supabase
      .from("didar_import_person_rows" as never)
      .select(
        "id, row_number, didar_id, display_name, mobile_raw, landline_raw, national_id_raw, address, city, province, classification, matched_person_id, match_reason, conflict_reason, decision, applied_at, apply_note",
        { count: "exact" },
      )
      .eq("batch_id", batch.id)
      .order("row_number", { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (filter !== "all") q = q.eq("classification", filter);
    const { data, error, count } = await q;
    if (error) {
      toast.error(error.message);
      setRowsLoading(false);
      return;
    }
    setRows((data ?? []) as unknown as StagedRow[]);
    setTotal(count ?? 0);
    setRowsLoading(false);
  }, [batch, filter, page]);

  useEffect(() => {
    if (batch) void loadRows();
  }, [batch, loadRows]);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("didar_import_batches" as never)
        .select("id, kind, file_name, row_count, status, stats, created_at")
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
      const sheetName = wb.SheetNames.includes("Contact") ? "Contact" : wb.SheetNames[0];
      if (!sheetName) throw new Error("فایل اکسل خالی است");
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
        header: 1,
        raw: false,
        defval: null,
      });
      const result = parseDidarContacts(matrix);
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
        .from("didar_import_batches" as never)
        .insert({
          kind: "persons",
          file_name: file?.name ?? null,
          row_count: parsed.rows.length,
          created_by: user?.id ?? null,
        } as never)
        .select("id, kind, file_name, row_count, status, stats, created_at")
        .single();
      if (error || !data) throw new Error(error?.message ?? "ساخت دسته ناموفق بود");
      const created = data as unknown as Batch;

      for (let i = 0; i < parsed.rows.length; i += STAGE_CHUNK) {
        const chunk = parsed.rows.slice(i, i + STAGE_CHUNK).map((r) => ({
          batch_id: created.id,
          row_number: r.row_number,
          didar_id: r.didar_id,
          display_name: r.display_name,
          mobile_raw: r.mobile_raw,
          landline_raw: r.landline_raw,
          national_id_raw: r.national_id_raw,
          address: r.address,
          city: r.city,
          province: r.province,
        }));
        const res = await supabase.from("didar_import_person_rows" as never).insert(chunk as never);
        if (res.error) throw new Error(res.error.message);
        setStagingPct(
          Math.round((Math.min(i + STAGE_CHUNK, parsed.rows.length) / parsed.rows.length) * 100),
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
    const { error } = await supabase.rpc("didar_classify_person_batch" as never, {
      p_batch_id: id,
    } as never);
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
      .from("didar_import_person_rows" as never)
      .update({ decision } as never)
      .eq("id", row.id);
    setBusyRow(null);
    if (error) {
      toast.error(`ثبت تصمیم ناموفق بود: ${error.message}`);
      return;
    }
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, decision } : r)));
  }

  async function acceptAllNew() {
    if (!batch) return;
    const { error } = await supabase
      .from("didar_import_person_rows" as never)
      .update({ decision: "accept" } as never)
      .eq("batch_id", batch.id)
      .eq("classification", "new");
    if (error) {
      toast.error(`تأیید گروهی ناموفق بود: ${error.message}`);
      return;
    }
    toast.success("همهٔ ردیف‌های تازه تأیید شدند");
    await loadRows();
  }

  async function commit() {
    if (!batch) return;
    setCommitting(true);
    setCommitPct(0);
    try {
      let remaining = 1;
      let createdTotal = 0;
      const expected = statNum("new");
      while (remaining > 0) {
        const { data, error } = await supabase.rpc("didar_commit_person_batch" as never, {
          p_batch_id: batch.id,
          p_limit: COMMIT_CHUNK,
        } as never);
        if (error) throw new Error(error.message);
        const r = (data ?? {}) as { created?: number; skipped?: number; remaining?: number };
        createdTotal += r.created ?? 0;
        remaining = r.remaining ?? 0;
        const done = expected > 0 ? Math.min(100, Math.round((createdTotal / expected) * 100)) : 100;
        setCommitPct(remaining === 0 ? 100 : done);
      }
      toast.success(`ثبت شد — ساخته‌شده: ${toFaDigits(createdTotal)}`);
      await reloadBatch(batch.id);
      await loadRows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ثبت نهایی ناموفق بود");
    } finally {
      setCommitting(false);
    }
  }

  function closePanel() {
    setBatch(null);
    setRows([]);
    setParsed(null);
    setFile(null);
  }

  async function discard() {
    if (!batch) return;
    const { error } = await supabase
      .from("didar_import_batches" as never)
      .update({ status: "discarded" } as never)
      .eq("id", batch.id);
    if (error) {
      toast.error(`کنارگذاشتن دسته ناموفق بود: ${error.message}`);
      return;
    }
    toast.success("دسته کنار گذاشته شد. هیچ‌چیز در افراکالا تغییر نکرد.");
    closePanel();
  }

  const stats = batch?.stats ?? {};
  const statNum = (key: string): number => {
    const v = stats[key];
    return typeof v === "number" ? v : 0;
  };
  const acceptedCount = useMemo(() => rows.filter((r) => r.decision === "accept").length, [rows]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isCommitted = batch?.status === "committed";
  const isClosed = isCommitted || batch?.status === "discarded";

  return (
    <div className="space-y-4">
      {!batch && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center gap-2 font-medium">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              مرحله ۱: انتخاب فایل مخاطبان دیدار
            </div>
            <div className="space-y-2 rounded-md border border-dashed p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">فایل نمونهٔ استاندارد</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void downloadDidarSampleWorkbook().catch((err: unknown) => {
                      toast.error(err instanceof Error ? err.message : "دانلود نمونه ناموفق بود");
                    });
                  }}
                >
                  <Download className="ml-2 h-4 w-4" />
                  دانلود اکسل نمونه
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                ستون‌ها با همین نام هدر خوانده می‌شوند، نه با شمارهٔ ستون. ستون اضافه اشکال ندارد.
                تنها ستون اجباری «{DIDAR_SAMPLE_REQUIRED_HEADER}» است. «شهر» و «استان»
                اختیاری‌اند.
              </p>
              <ol className="grid list-decimal gap-1 pr-5 text-xs sm:grid-cols-2">
                {DIDAR_SAMPLE_HEADERS.map((h) => (
                  <li key={h}>
                    {h}
                    {h === DIDAR_SAMPLE_REQUIRED_HEADER
                      ? " — اجباری"
                      : h === "شهر" || h === "استان"
                        ? " — اختیاری"
                        : ""}
                  </li>
                ))}
              </ol>
            </div>
            <div className="space-y-1">
              <Label htmlFor="didar-contacts-file" className="text-xs">
                فایل xlsx خروجی مخاطبان دیدار
              </Label>
              <Input
                id="didar-contacts-file"
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
                <p className="text-sm">
                  {toFaDigits(parsed.rows.length)} ردیف خوانده شد.
                </p>
                {parsed.warnings.length > 0 && (
                  <ul className="list-disc pr-5 text-xs text-amber-700">
                    {parsed.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ردیف</TableHead>
                        <TableHead>کد دیدار</TableHead>
                        <TableHead>نام</TableHead>
                        <TableHead>موبایل</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsed.rows.slice(0, 5).map((r) => (
                        <TableRow key={r.row_number}>
                          <TableCell>{toFaDigits(r.row_number)}</TableCell>
                          <TableCell className="font-mono">{r.didar_id ?? "—"}</TableCell>
                          <TableCell>{r.display_name ?? "—"}</TableCell>
                          <TableCell className="font-mono">{r.mobile_raw ?? "—"}</TableCell>
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
                {!isClosed && (
                  <Button variant="outline" size="sm" onClick={discard}>
                    <Trash2 className="ml-2 h-4 w-4" />
                    کنار گذاشتن
                  </Button>
                )}
                {isCommitted && (
                  <Button variant="outline" size="sm" onClick={closePanel}>
                    بستن
                  </Button>
                )}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-md border p-3 text-sm">
                تازه: <strong>{toFaDigits(statNum("new"))}</strong>
              </div>
              <div className="rounded-md border p-3 text-sm">
                ناقص: <strong>{toFaDigits(statNum("incomplete"))}</strong>
              </div>
              <div className="rounded-md border p-3 text-sm">
                تعارض: <strong>{toFaDigits(statNum("conflict"))}</strong>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              شمارش‌ها قبل از ثبت نهایی است. فقط ردیف‌های «تازه» پس از تأیید وارد می‌شوند.
            </p>

            <div className="flex flex-wrap gap-2">
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

            {!isClosed && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={acceptAllNew} disabled={statNum("new") === 0}>
                  تأیید همهٔ تازه‌ها
                </Button>
                <Button
                  onClick={commit}
                  disabled={committing || (statNum("new") === 0 && acceptedCount === 0)}
                >
                  {committing && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                  ثبت نهایی
                </Button>
              </div>
            )}

            {committing && (
              <div className="space-y-1">
                <Progress value={commitPct} />
                <p className="text-center text-xs text-muted-foreground">
                  در حال ثبت… {toFaDigits(commitPct)}٪
                </p>
              </div>
            )}

            {rowsLoading ? (
              <p className="flex items-center text-sm text-muted-foreground">
                <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری ردیف‌ها…
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ردیف</TableHead>
                      <TableHead>نام</TableHead>
                      <TableHead>موبایل</TableHead>
                      <TableHead>طبقه</TableHead>
                      <TableHead>یادداشت</TableHead>
                      <TableHead>تصمیم</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{toFaDigits(r.row_number)}</TableCell>
                        <TableCell>{r.display_name ?? "—"}</TableCell>
                        <TableCell className="font-mono">{r.mobile_raw ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={r.classification === "new" ? "default" : "secondary"}>
                            {CLASS_LABEL[r.classification]}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-xs text-xs text-muted-foreground">
                          {r.apply_note ?? r.conflict_reason ?? "—"}
                        </TableCell>
                        <TableCell>
                          {r.classification === "new" && !isClosed ? (
                            <Button
                              size="sm"
                              variant={r.decision === "accept" ? "default" : "outline"}
                              disabled={busyRow === r.id}
                              onClick={() =>
                                setDecision(r, r.decision === "accept" ? "pending" : "accept")
                              }
                            >
                              {r.decision === "accept" ? "تأیید شد" : "تأیید"}
                            </Button>
                          ) : r.classification !== "new" ? (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <AlertTriangle className="h-3 w-3" />
                              قابل تأیید نیست
                            </span>
                          ) : (
                            r.decision
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {pageCount > 1 && (
              <div className="flex items-center justify-between text-sm">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  قبلی
                </Button>
                <span>
                  صفحه {toFaDigits(page + 1)} از {toFaDigits(pageCount)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page + 1 >= pageCount}
                  onClick={() => setPage((p) => p + 1)}
                >
                  بعدی
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
