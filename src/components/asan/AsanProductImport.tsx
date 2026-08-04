import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
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
import {
  ASAN_PRODUCT_HEADERS,
  parseAsanProducts,
  type ProductParseResult,
} from "@/lib/asan/parse-products";

/**
 * ASAN M3.4 — the Asan **product** import panel.
 *
 * Same pipeline as the person importer next to it, with one rule inverted and it is
 * the one that matters: **no product is ever created**. Asan carries 7 256 items and
 * AfraKala stocks 355; an Asan row with no AfraKala counterpart is recorded as
 * `unmatched` and stays in staging forever. There is deliberately no control anywhere
 * on this panel that could create a product, and `asan_commit_product_batch` measures
 * the catalogue size before and after and rolls back if it moved — so the guarantee
 * does not depend on this file being careful.
 *
 * What a commit actually writes: the Asan code onto a product that already exists and
 * does not yet carry one. Nothing else — not the name, not the unit.
 */

const PAGE_SIZE = 50;
/** 7 256 rows go up in chunks; one request per row would be 7 256 round trips. */
const CHUNK = 500;

type Classification = "update" | "conflict" | "unchanged" | "unmatched";
type Decision = "pending" | "accept" | "skip";

type Batch = {
  id: string;
  file_name: string | null;
  row_count: number;
  status: string;
  stats: Record<string, number> | null;
};

type StagedRow = {
  id: string;
  row_number: number;
  asan_code: string | null;
  name: string | null;
  barcode_raw: string | null;
  unit_raw: string | null;
  classification: Classification;
  matched_product_id: string | null;
  match_reason: string | null;
  conflict_reason: string | null;
  decision: Decision;
  applied_at: string | null;
};

type MatchedProduct = { id: string; name: string; sku: string | null };

const CLASS_LABEL: Record<Classification, string> = {
  update: "قابل اتصال",
  conflict: "تعارض",
  unchanged: "از قبل متصل",
  unmatched: "در افراکالا نیست",
};

const CLASS_HINT: Record<Classification, string> = {
  update: "کالای افراکالا پیدا شد و کد آسان ندارد؛ با تأیید شما کد به آن داده می‌شود.",
  conflict: "نیاز به داوری انسان دارد و قابل تأیید نیست.",
  unchanged: "این کالا از قبل همین کد آسان را دارد.",
  unmatched: "هیچ کالای افراکالایی با این شرح پیدا نشد. هیچ کالای تازه‌ای ساخته نمی‌شود.",
};

const FILTERS: { key: Classification | "all"; label: string }[] = [
  { key: "all", label: "همه" },
  { key: "update", label: CLASS_LABEL.update },
  { key: "conflict", label: CLASS_LABEL.conflict },
  { key: "unchanged", label: CLASS_LABEL.unchanged },
  { key: "unmatched", label: CLASS_LABEL.unmatched },
];

export function AsanProductImport() {
  const { user } = useAuth();

  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ProductParseResult | null>(null);
  const [parsing, setParsing] = useState(false);

  const [batch, setBatch] = useState<Batch | null>(null);
  const [staging, setStaging] = useState(false);
  const [stagingPct, setStagingPct] = useState(0);
  const [classifying, setClassifying] = useState(false);
  const [committing, setCommitting] = useState(false);

  const [rows, setRows] = useState<StagedRow[]>([]);
  const [products, setProducts] = useState<Record<string, MatchedProduct>>({});
  const [rowsLoading, setRowsLoading] = useState(false);
  const [filter, setFilter] = useState<Classification | "all">("update");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [busyRow, setBusyRow] = useState<string | null>(null);

  const reloadBatch = useCallback(async (id: string) => {
    const { data } = await supabase
      .from("asan_import_batches")
      .select("id, file_name, row_count, status, stats")
      .eq("id", id)
      .maybeSingle();
    if (data) setBatch(data as unknown as Batch);
  }, []);

  const loadRows = useCallback(async () => {
    if (!batch) return;
    setRowsLoading(true);
    let q = supabase
      .from("asan_import_product_rows")
      .select(
        "id, row_number, asan_code, name, barcode_raw, unit_raw, classification, matched_product_id, match_reason, conflict_reason, decision, applied_at",
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

    const ids = Array.from(
      new Set(list.map((r) => r.matched_product_id).filter((v): v is string => !!v)),
    );
    if (ids.length > 0) {
      const { data: prods } = await supabase.from("products").select("id, name, sku").in("id", ids);
      const map: Record<string, MatchedProduct> = {};
      for (const p of (prods ?? []) as unknown as MatchedProduct[]) map[p.id] = p;
      setProducts(map);
    } else {
      setProducts({});
    }
    setRowsLoading(false);
  }, [batch, filter, page]);

  useEffect(() => {
    if (batch) void loadRows();
  }, [batch, loadRows]);

  /** Staging 7 256 rows and then losing the id on a refresh would strand them. */
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("asan_import_batches")
        .select("id, file_name, row_count, status, stats")
        .eq("kind", "products")
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
      // `raw: false` keeps a product code as the text Asan wrote it; numeric coercion
      // would silently drop a leading zero.
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
        header: 1,
        raw: false,
        defval: null,
      });
      const result = parseAsanProducts(matrix);
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
    const startedAt = Date.now();
    try {
      const { data, error } = await supabase
        .from("asan_import_batches")
        .insert({
          kind: "products",
          file_name: file?.name ?? null,
          row_count: parsed.rows.length,
          created_by: user?.id ?? null,
        })
        .select("id, file_name, row_count, status, stats")
        .single();
      if (error || !data) throw new Error(error?.message ?? "ساخت دسته ناموفق بود");
      const created = data as unknown as Batch;

      for (let i = 0; i < parsed.rows.length; i += CHUNK) {
        const chunk = parsed.rows.slice(i, i + CHUNK).map((r) => ({ ...r, batch_id: created.id }));
        const res = await supabase.from("asan_import_product_rows").insert(chunk);
        if (res.error) throw new Error(res.error.message);
        setStagingPct(
          Math.round((Math.min(i + CHUNK, parsed.rows.length) / parsed.rows.length) * 100),
        );
      }

      setBatch(created);
      setPage(0);
      const secs = Math.round((Date.now() - startedAt) / 100) / 10;
      toast.success(
        `${toFaDigits(parsed.rows.length)} ردیف در ${toFaDigits(secs)} ثانیه ثبت موقت شد`,
      );
      await classify(created.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ثبت در جدول موقت ناموفق بود");
    } finally {
      setStaging(false);
    }
  }

  async function classify(id: string) {
    setClassifying(true);
    const { error } = await supabase.rpc("asan_classify_product_batch", { p_batch_id: id });
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
      .from("asan_import_product_rows")
      .update({ decision })
      .eq("id", row.id);
    setBusyRow(null);
    if (error) {
      toast.error(`ثبت تصمیم ناموفق بود: ${error.message}`);
      return;
    }
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, decision } : r)));
  }

  /** Bulk decision. Only ever offered for `update` — the trigger refuses anything else. */
  async function acceptAllLinkable() {
    if (!batch) return;
    const { error } = await supabase
      .from("asan_import_product_rows")
      .update({ decision: "accept" })
      .eq("batch_id", batch.id)
      .eq("classification", "update");
    if (error) {
      toast.error(`ثبت گروهی ناموفق بود: ${error.message}`);
      return;
    }
    toast.success("همهٔ ردیف‌های قابل اتصال تأیید شدند");
    await loadRows();
  }

  async function commit() {
    if (!batch) return;
    setCommitting(true);
    const { data, error } = await supabase.rpc("asan_commit_product_batch", {
      p_batch_id: batch.id,
    });
    setCommitting(false);
    if (error) {
      toast.error(`ثبت نهایی ناموفق بود: ${error.message}`);
      return;
    }
    const r = (data ?? {}) as { linked?: number; products_after?: number };
    toast.success(
      `${toFaDigits(r.linked ?? 0)} کالا به کد آسان وصل شد. تعداد کالاها: ${toFaDigits(r.products_after ?? 0)} (بدون تغییر)`,
    );
    await reloadBatch(batch.id);
    await loadRows();
  }

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
    toast.success("دسته کنار گذاشته شد. هیچ کالایی تغییر نکرد.");
    setBatch(null);
    setRows([]);
    setParsed(null);
    setFile(null);
  }

  const stats = batch?.stats ?? {};
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isCommitted = batch?.status === "committed";

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        این صفحه <strong>هرگز کالای تازه نمی‌سازد</strong>. آسان هزاران قلم کالا دارد که شما
        نمی‌فروشید؛ ردیفی که در افراکالا نظیر نداشته باشد فقط در جدول موقت ثبت می‌شود. تنها چیزی که
        ثبت نهایی می‌نویسد، «کد آسان» روی کالایی است که از قبل وجود دارد و هنوز کد ندارد.
      </div>

      {!batch && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center gap-2 font-medium">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              مرحله ۱: انتخاب فایل کالای آسان
            </div>
            <div className="space-y-1">
              <Label htmlFor="asan-products-file" className="text-xs">
                فایل xlsx خروجی «کالا» از آسان
              </Label>
              <Input
                id="asan-products-file"
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

                <div className="flex flex-wrap gap-2">
                  {(Object.keys(ASAN_PRODUCT_HEADERS) as (keyof typeof ASAN_PRODUCT_HEADERS)[]).map(
                    (f) => (
                      <Badge key={f} variant={parsed.mapping[f] ? "outline" : "destructive"}>
                        {ASAN_PRODUCT_HEADERS[f]}: {parsed.mapping[f] ? "پیدا شد" : "پیدا نشد"}
                      </Badge>
                    ),
                  )}
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
                        <TableHead>کد کالا</TableHead>
                        <TableHead>شرح کالا</TableHead>
                        <TableHead>واحد</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsed.rows.slice(0, 5).map((r) => (
                        <TableRow key={r.row_number}>
                          <TableCell>{toFaDigits(r.row_number)}</TableCell>
                          <TableCell className="font-mono">{r.asan_code ?? "—"}</TableCell>
                          <TableCell>{r.name ?? "—"}</TableCell>
                          <TableCell>{r.unit_raw ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">
                    پیش‌نمایش ۵ ردیف اول. ثبت موقت هیچ تغییری در کالاهای افراکالا نمی‌دهد.
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
                  disabled={classifying || isCommitted}
                >
                  {classifying ? (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="ml-2 h-4 w-4" />
                  )}
                  طبقه‌بندی مجدد
                </Button>
                <Button variant="outline" size="sm" onClick={discard} disabled={committing}>
                  <Trash2 className="ml-2 h-4 w-4" />
                  {isCommitted ? "بستن" : "کنار گذاشتن"}
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">مجموع: {toFaDigits(batch.row_count)}</Badge>
              {(["update", "conflict", "unchanged", "unmatched"] as Classification[]).map((c) =>
                stats[c] ? (
                  <Badge key={c} variant={c === "conflict" ? "destructive" : "secondary"}>
                    {CLASS_LABEL[c]}: {toFaDigits(stats[c])}
                  </Badge>
                ) : null,
              )}
              {isCommitted && (
                <>
                  <Badge>متصل‌شده: {toFaDigits(stats.linked ?? 0)}</Badge>
                  <Badge variant="outline">
                    کالاها: {toFaDigits(stats.products_before ?? 0)} →{" "}
                    {toFaDigits(stats.products_after ?? 0)}
                  </Badge>
                </>
              )}
            </div>

            {!isCommitted && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                <span className="text-xs text-muted-foreground">تصمیم گروهی:</span>
                <Button size="sm" variant="outline" onClick={acceptAllLinkable}>
                  تأیید همهٔ «قابل اتصال»
                </Button>
                <span className="text-xs text-muted-foreground">
                  ردیف‌های «در افراکالا نیست» و «تعارض» اصلاً قابل تأیید نیستند.
                </span>
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
                    <TableHead>کد کالا</TableHead>
                    <TableHead>شرح (آسان)</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>کالای افراکالا</TableHead>
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
                      const matched = r.matched_product_id
                        ? products[r.matched_product_id]
                        : undefined;
                      return (
                        <TableRow key={r.id}>
                          <TableCell>{toFaDigits(r.row_number)}</TableCell>
                          <TableCell className="font-mono whitespace-nowrap">
                            {r.asan_code ?? "—"}
                          </TableCell>
                          <TableCell className="max-w-[20rem]">{r.name ?? "—"}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                r.classification === "conflict" ? "destructive" : "secondary"
                              }
                            >
                              {CLASS_LABEL[r.classification]}
                            </Badge>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {r.conflict_reason ?? CLASS_HINT[r.classification]}
                            </div>
                          </TableCell>
                          <TableCell className="min-w-[12rem]">
                            {matched ? (
                              <div className="text-xs">
                                <div>{matched.name}</div>
                                <div className="font-mono text-muted-foreground">
                                  {matched.sku ?? ""}
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="min-w-[10rem]">
                            {r.applied_at ? (
                              <Badge variant="outline">ثبت شد</Badge>
                            ) : r.classification !== "update" ? (
                              <span className="text-xs text-muted-foreground">قابل تأیید نیست</span>
                            ) : isCommitted ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant={r.decision === "accept" ? "default" : "outline"}
                                  disabled={busyRow === r.id}
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

              {!isCommitted && (
                <Button onClick={commit} disabled={committing}>
                  {committing && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                  ثبت نهایی کدهای آسان
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
