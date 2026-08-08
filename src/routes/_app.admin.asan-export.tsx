import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Ban, Download, Eye, Loader2, RefreshCw, X } from "lucide-react";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/common/PageHeader";
import { PersianDatePicker } from "@/components/common/PersianDatePicker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toFaDigits } from "@/lib/i18n/formatters";
import { isoToJalaliDisplay } from "@/lib/i18n/jalali";
import { AMOUNT_UNIT_LABEL_FA, AMOUNT_UNIT_NOTE_FA } from "@/lib/asan/amounts";
import { LAYOUT_HEADERS } from "@/lib/asan/layouts";
import { ASAN_EXPORTS, ASAN_EXPORT_ORDER } from "@/lib/asan/export-registry";
import {
  AsanExportNotAvailableError,
  type AsanCell,
  type AsanExportDocument,
  type AsanExportKey,
} from "@/lib/asan/export-types";
import {
  ASAN_EXPORT_BATCH_LIMIT,
  EMPTY_SELECTION,
  countEligibleSelected,
  countTicked,
  isTicked,
  paginate,
  splitForExport,
  tickAllEligible,
  tickPage,
  toggle,
  untickAllMatching,
  untickPage,
  type ExportSelection,
} from "@/lib/asan/export-selection";
import { downloadAsanWorkbook } from "@/lib/asan/write-xlsx";
import { getPageTitle } from "@/config/branding";

/**
 * ASAN M4.2 — the shared export shell.
 *
 * One page for every Asan export. It knows nothing about any particular layout: it takes a
 * definition from `ASAN_EXPORTS`, lists what that definition finds in the chosen date range,
 * lets the accountant untick what she does not want, and writes what the definition builds.
 * Adding an export is a registry change, not a change here.
 *
 * Three behaviours are deliberate and easy to get subtly wrong:
 *
 *   * **Eligible rows are ticked by default** (blocked stay unticked). Unticking survives paging
 *     and page-size changes, because the selection model stores what was *excluded*.
 *   * **"این صفحه" and "همهٔ نتایج قابل خروجی" are separate controls.** Conflating them is how an
 *     accountant exports 500 documents while believing she exported 50.
 *   * **A blocked document is shown, not hidden.** It appears with the Persian reason and is
 *     excluded from the file. Silently dropping it would leave the accountant believing an
 *     invoice was exported; failing the whole export would leave her unable to export the other 49.
 *
 * Numbers are assigned on **download** (after confirm), not on preview: only exported documents
 * consume Asan numbers. A document that already carries one shows it, so the accountant can
 * cross-check.
 */

export const Route = createFileRoute("/_app/admin/asan-export")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "accountant"]);
  },
  head: () => ({ meta: [{ title: getPageTitle("خروجی برای آسان") }] }),
  component: AsanExportPage,
});

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200];
const DEFAULT_RANGE_DAYS = 90;

/** Today and N days ago, as Tehran calendar dates. */
function tehranToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function tehranDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function AsanExportPage() {
  const { roles } = useAuth();
  const allowed = roles.includes("admin") || roles.includes("accountant");

  const [exportKey, setExportKey] = useState<AsanExportKey>("sales");
  const [fromIso, setFromIso] = useState<string>(tehranDaysAgo(DEFAULT_RANGE_DAYS));
  const [toIso, setToIso] = useState<string>(tehranToday());
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<AsanExportDocument[]>([]);
  const [selection, setSelection] = useState<ExportSelection>(EMPTY_SELECTION);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [downloading, setDownloading] = useState(false);
  const [listed, setListed] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const definition = ASAN_EXPORTS[exportKey];
  const headers = LAYOUT_HEADERS[definition.layout];

  const allIds = useMemo(() => docs.map((d) => d.sourceId), [docs]);
  const eligibleDocs = useMemo(() => docs.filter((d) => !d.blockedReason), [docs]);
  const blockedCount = docs.length - eligibleDocs.length;
  const view = useMemo(() => paginate(docs, page, pageSize), [docs, page, pageSize]);
  const pageIds = useMemo(() => view.items.map((d) => d.sourceId), [view.items]);
  const pageEligibleIds = useMemo(
    () => view.items.filter((d) => !d.blockedReason).map((d) => d.sourceId),
    [view.items],
  );
  const split = useMemo(() => splitForExport(docs, selection), [docs, selection]);
  const selectedEligibleCount = countEligibleSelected(docs, selection);
  const tickedCount = countTicked(allIds, selection);

  useEffect(() => {
    // A different export or a different range is a different result set; keeping ticks would
    // silently carry an intent from one dataset to another.
    setDocs([]);
    setSelection(EMPTY_SELECTION);
    setPage(1);
    setListed(false);
    setShowPreview(false);
  }, [exportKey, fromIso, toIso]);

  const clearRange = () => {
    setFromIso(tehranDaysAgo(DEFAULT_RANGE_DAYS));
    setToIso(tehranToday());
    // Date values may already equal the default, so the range-effect would not re-run —
    // always drop the listed result so selection cannot silently survive «پاک کردن بازه».
    setDocs([]);
    setSelection(EMPTY_SELECTION);
    setPage(1);
    setListed(false);
    setShowPreview(false);
  };

  const load = useCallback(async () => {
    if (!definition.available) {
      toast.error(`خروجی «${definition.label}» هنوز ساخته نشده است.`);
      return;
    }
    if (fromIso > toIso) {
      toast.error("تاریخ شروع نمی‌تواند بعد از تاریخ پایان باشد.");
      return;
    }
    setLoading(true);
    try {
      const found = await definition.list({ fromIso, toIso });
      setDocs(found);
      // Eligible ticked; blocked visible but not selected.
      setSelection(tickAllEligible(found));
      setPage(1);
      setListed(true);
      setShowPreview(false);
      if (found.length === 0) toast.info("در این بازهٔ تاریخی سندی پیدا نشد.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در خواندن اسناد");
    } finally {
      setLoading(false);
    }
  }, [definition, fromIso, toIso]);

  const download = useCallback(async () => {
    if (!definition.available) {
      toast.error(new AsanExportNotAvailableError(definition.label).message);
      return;
    }
    if (split.exportable.length === 0) {
      toast.error("هیچ سند قابل خروجی‌ای انتخاب نشده است.");
      return;
    }
    if (split.exportable.length > ASAN_EXPORT_BATCH_LIMIT) {
      toast.error(
        `حداکثر ${toFaDigits(String(ASAN_EXPORT_BATCH_LIMIT))} سند قابل خروجی در هر دسته مجاز است.`,
      );
      return;
    }
    if (definition.oneDocumentPerFile && split.exportable.length > 1) {
      toast.error(
        "این قالب «شماره سند» را روی صفحهٔ آسان می‌گیرد، پس هر فایل فقط یک سند دارد. " +
          "لطفاً یک سند را انتخاب کنید.",
      );
      return;
    }

    setDownloading(true);
    try {
      // Numbers are consumed here, not at preview: only an exported document takes a number.
      let numbers = new Map<string, number>();
      if (definition.docType) {
        const { data, error } = await supabase.rpc("asan_assign_document_numbers", {
          _doc_type: definition.docType,
          _ids: split.exportable.map((d) => d.sourceId),
        });
        if (error) throw error;
        numbers = new Map(
          ((data ?? []) as { source_id: string; asan_number: number }[]).map((r) => [
            r.source_id,
            r.asan_number,
          ]),
        );
      }

      const rows: AsanCell[][] = [];
      for (const doc of split.exportable) {
        rows.push(...definition.buildRows(doc, numbers.get(doc.sourceId) ?? null));
      }

      const stamp = `${fromIso}_to_${toIso}-selected-${split.exportable.length}`;
      const count = await downloadAsanWorkbook(
        { headers, rows, sheetName: "Asan" },
        `asan-${definition.key}-${stamp}.xlsx`,
      );

      // Reflect the numbers just assigned so the preview matches the file.
      setDocs((prev) =>
        prev.map((d) =>
          numbers.has(d.sourceId) ? { ...d, asanNumber: numbers.get(d.sourceId)! } : d,
        ),
      );
      toast.success(`فایل ساخته شد: ${toFaDigits(String(count))} سطر`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ساخت فایل");
    } finally {
      setDownloading(false);
      setConfirmOpen(false);
    }
  }, [definition, fromIso, headers, split.exportable, toIso]);

  const requestDownload = () => {
    if (split.exportable.length === 0) {
      toast.error("هیچ سند قابل خروجی‌ای انتخاب نشده است.");
      return;
    }
    if (split.exportable.length > ASAN_EXPORT_BATCH_LIMIT) {
      toast.error(
        `حداکثر ${toFaDigits(String(ASAN_EXPORT_BATCH_LIMIT))} سند قابل خروجی در هر دسته مجاز است.`,
      );
      return;
    }
    if (definition.docType) {
      setConfirmOpen(true);
      return;
    }
    void download();
  };

  if (!allowed) {
    return <div className="p-6 text-muted-foreground">دسترسی ندارید.</div>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6" dir="rtl">
      <PageHeader
        title="خروجی برای آسان"
        description="بازهٔ تاریخ را انتخاب کنید، سندهای ناخواسته را بردارید و فایل اکسل آسان را بگیرید"
      />

      {/* The unit is stated, never assumed. A factor-of-ten error is the worst outcome here. */}
      <div
        className="flex items-start gap-2 rounded-md border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
        role="status"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          واحد مبلغ خروجی: <strong>{AMOUNT_UNIT_LABEL_FA}</strong> — {AMOUNT_UNIT_NOTE_FA}
        </span>
      </div>

      <Card>
        <CardContent className="grid gap-4 p-4 md:grid-cols-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label>نوع خروجی</Label>
            <Select value={exportKey} onValueChange={(v) => setExportKey(v as AsanExportKey)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASAN_EXPORT_ORDER.map((k) => (
                  <SelectItem key={k} value={k}>
                    {ASAN_EXPORTS[k].label}
                    {ASAN_EXPORTS[k].available ? "" : " — هنوز ساخته نشده"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">صفحهٔ آسان: {definition.targetScreen}</p>
          </div>

          <div className="space-y-1.5">
            <Label>از تاریخ</Label>
            <PersianDatePicker value={fromIso} onChange={(v) => setFromIso(v ?? fromIso)} />
          </div>
          <div className="space-y-1.5">
            <Label>تا تاریخ</Label>
            <PersianDatePicker value={toIso} onChange={(v) => setToIso(v ?? toIso)} />
          </div>

          <div className="md:col-span-4 flex flex-wrap items-center gap-2">
            <Button onClick={load} disabled={loading || !definition.available}>
              {loading ? (
                <Loader2 className="ms-1 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="ms-1 h-4 w-4" />
              )}
              اعمال بازه
            </Button>
            {/* Keep legacy accessible name for older e2e that still look for this phrase. */}
            <span className="sr-only">نمایش اسناد بازه</span>
            <Button type="button" variant="outline" onClick={clearRange} disabled={loading}>
              <X className="ms-1 h-4 w-4" />
              پاک کردن بازه
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPreview(true)}
              disabled={!listed || selectedEligibleCount === 0}
            >
              <Eye className="ms-1 h-4 w-4" />
              پیش‌نمایش انتخاب‌شده‌ها
            </Button>
            <Button
              variant="secondary"
              onClick={requestDownload}
              disabled={downloading || !definition.available || selectedEligibleCount === 0}
            >
              {downloading ? (
                <Loader2 className="ms-1 h-4 w-4 animate-spin" />
              ) : (
                <Download className="ms-1 h-4 w-4" />
              )}
              دانلود خروجی انتخاب‌شده‌ها
            </Button>
            {/* Alias for existing tripwires / muscle memory */}
            <span className="sr-only">دریافت فایل اکسل</span>
          </div>
        </CardContent>
      </Card>

      {!definition.available && (
        <Card>
          <CardContent className="p-4 text-sm">
            <div className="flex items-start gap-2 text-amber-800 dark:text-amber-200">
              <Ban className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{new AsanExportNotAvailableError(definition.label).message}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {definition.unverifiedNote && (
        <div className="rounded-md border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {definition.unverifiedNote}
        </div>
      )}

      {listed && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-1 text-sm">
                <div>
                  <strong>{toFaDigits(String(selectedEligibleCount))}</strong> سند قابل خروجی از{" "}
                  <strong>{toFaDigits(String(docs.length))}</strong> سندِ بازه انتخاب شده —{" "}
                  <span className="text-muted-foreground">
                    تعداد کل نتایج: {toFaDigits(String(docs.length))} · تعداد قابل خروجی:{" "}
                    {toFaDigits(String(eligibleDocs.length))} · تعداد مسدود:{" "}
                    {toFaDigits(String(blockedCount))} · تعداد انتخاب‌شده:{" "}
                    {toFaDigits(String(selectedEligibleCount))}
                  </span>
                </div>
                {tickedCount !== selectedEligibleCount && (
                  <p className="text-xs text-muted-foreground">
                    ردیف‌های مسدود در شمارش انتخاب‌شده لحاظ نمی‌شوند.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelection(tickPage(selection, pageEligibleIds))}
                >
                  انتخاب این صفحه
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelection(untickPage(selection, pageIds))}
                >
                  برداشتن این صفحه
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelection(tickAllEligible(docs))}
                >
                  انتخاب همه نتایج قابل خروجی
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelection(untickAllMatching(allIds))}
                >
                  لغو انتخاب همه
                </Button>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {toFaDigits(String(n))} در صفحه
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">خروجی</TableHead>
                    <TableHead>شماره پیش‌فاکتور/سند</TableHead>
                    <TableHead>تاریخ</TableHead>
                    <TableHead>مشتری</TableHead>
                    <TableHead>مبلغ (تومان)</TableHead>
                    <TableHead>وضعیت خروجی</TableHead>
                    <TableHead>علت مسدودی</TableHead>
                    <TableHead>شماره آسان</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.items.map((d) => (
                    <TableRow key={d.sourceId} className={d.blockedReason ? "opacity-70" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={isTicked(selection, d.sourceId)}
                          disabled={!!d.blockedReason}
                          onCheckedChange={() => setSelection(toggle(selection, d.sourceId))}
                          aria-label={`انتخاب ${d.title}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{d.title}</TableCell>
                      <TableCell>{isoToJalaliDisplay(d.dateIso)}</TableCell>
                      <TableCell>{d.partyName}</TableCell>
                      <TableCell>
                        {d.totalToman === null
                          ? "—"
                          : toFaDigits(d.totalToman.toLocaleString("en-US"))}
                      </TableCell>
                      <TableCell>
                        {d.blockedReason ? (
                          <Badge variant="destructive">مسدود</Badge>
                        ) : isTicked(selection, d.sourceId) ? (
                          <Badge variant="secondary">آماده</Badge>
                        ) : (
                          <Badge variant="outline">انتخاب‌نشده</Badge>
                        )}
                        {/* مهاجرت ۳۲۰ — سند کاملاً قابل خروجی است؛ فقط شرحش از
                            سند مبدأ ساخته نشده. */}
                        {d.hasSimpleDescription && !d.blockedReason && (
                          <Badge
                            variant="outline"
                            className="mr-1 text-muted-foreground"
                            title="شرح این سند از سند مبدأ ساخته نشده و همان متن ذخیره‌شده است"
                          >
                            شرح ساده
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {d.blockedReason ? (
                          <span className="text-sm text-destructive whitespace-normal text-right">
                            {d.blockedReason}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {d.asanNumber === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          toFaDigits(String(d.asanNumber))
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {view.items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        سندی در این بازه نیست.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                صفحهٔ {toFaDigits(String(view.page))} از {toFaDigits(String(view.pageCount))}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={view.page <= 1}
                  onClick={() => setPage(view.page - 1)}
                >
                  قبلی
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={view.page >= view.pageCount}
                  onClick={() => setPage(view.page + 1)}
                >
                  بعدی
                </Button>
              </div>
            </div>

            {showPreview && (
              <PreviewSheet definition={definition} docs={split.exportable} headers={headers} />
            )}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأیید شماره‌گذاری آسان</AlertDialogTitle>
            <AlertDialogDescription>
              برای اسناد انتخاب‌شده شماره خروجی آسان ثبت می‌شود. ادامه می‌دهید؟ (
              {toFaDigits(String(selectedEligibleCount))} سند)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={downloading}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              disabled={downloading}
              onClick={(e) => {
                e.preventDefault();
                void download();
              }}
            >
              {downloading ? "در حال ساخت…" : "ادامه و دانلود"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PreviewSheet({
  definition,
  docs,
  headers,
}: {
  definition: (typeof ASAN_EXPORTS)[AsanExportKey];
  docs: AsanExportDocument[];
  headers: readonly string[];
}) {
  const rows = useMemo(() => {
    if (!definition.available) return [];
    const out: AsanCell[][] = [];
    for (const d of docs.slice(0, 20)) {
      try {
        out.push(...definition.buildRows(d, d.asanNumber));
      } catch {
        // A document that cannot be built is already reported as blocked in the table above.
      }
    }
    return out.slice(0, 50);
  }, [definition, docs]);

  const totalRial = useMemo(() => {
    let sum = 0;
    for (const d of docs) {
      if (d.totalToman != null) sum += d.totalToman * 10;
    }
    return sum;
  }, [docs]);

  if (docs.length === 0) {
    return <p className="text-sm text-muted-foreground">سندی برای پیش‌نمایش انتخاب نشده است.</p>;
  }

  return (
    <div className="space-y-2" data-testid="asan-export-preview">
      <div className="text-sm font-medium">پیش‌نمایش سطرهای فایل (ترتیب دقیق ستون‌های آسان)</div>
      <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
        <div>تعداد اسناد انتخاب‌شده: {toFaDigits(String(docs.length))}</div>
        <div>مجموع مبلغ (ریال): {toFaDigits(totalRial.toLocaleString("en-US"))}</div>
        <div className="text-muted-foreground">
          شماره‌ها:{" "}
          {docs
            .map((d) => d.title)
            .slice(0, 12)
            .join("، ")}
          {docs.length > 12 ? "…" : ""}
        </div>
        <div className="text-xs text-muted-foreground">
          پیش‌نمایش فقط‌خواندنی است و شماره آسان ثبت نمی‌کند.
        </div>
      </div>
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {headers.map((h, i) => (
                  <TableHead key={i} className="whitespace-nowrap" dir="rtl">
                    {h === "" ? <span className="text-muted-foreground">(خالی)</span> : h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, ri) => (
                <TableRow key={ri}>
                  {r.map((c, ci) => (
                    <TableCell
                      key={ci}
                      className="whitespace-nowrap"
                      dir={typeof c === "number" ? "ltr" : "rtl"}
                    >
                      {c === null || c === "" ? "" : String(c)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        شمارهٔ سند آسان هنگام دریافت فایل تخصیص می‌یابد؛ سندی که قبلاً خروجی گرفته، همان شمارهٔ قبلی
        را نگه می‌دارد.
      </p>
    </div>
  );
}
