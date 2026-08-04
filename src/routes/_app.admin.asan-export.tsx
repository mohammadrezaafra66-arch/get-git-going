import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Ban, Download, Loader2, RefreshCw } from "lucide-react";

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
  EMPTY_SELECTION,
  countTicked,
  isTicked,
  paginate,
  splitForExport,
  tickAllMatching,
  tickPage,
  toggle,
  untickAllMatching,
  untickPage,
  type ExportSelection,
} from "@/lib/asan/export-selection";
import { downloadAsanWorkbook } from "@/lib/asan/write-xlsx";

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
 *   * **Everything is ticked by default** and unticking survives paging and page-size changes,
 *     because the selection model stores what was *excluded* rather than what was included.
 *   * **"این صفحه" and "همهٔ N ردیف" are separate controls.** Conflating them is how an
 *     accountant exports 500 documents while believing she exported 50.
 *   * **A blocked document is shown, not hidden.** It appears in the preview with the reason in
 *     Persian and is excluded from the file. Silently dropping it would leave the accountant
 *     believing an invoice was exported; failing the whole export would leave her unable to
 *     export the other 49.
 *
 * Numbers are assigned on **download**, not on preview: only exported documents consume Asan
 * numbers. A document that already carries one shows it, so the accountant can cross-check.
 */

export const Route = createFileRoute("/_app/admin/asan-export")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "accountant"]);
  },
  component: AsanExportPage,
});

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200];

/** Today and thirty days ago, as Tehran calendar dates. */
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
  const [fromIso, setFromIso] = useState<string>(tehranDaysAgo(90));
  const [toIso, setToIso] = useState<string>(tehranToday());
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<AsanExportDocument[]>([]);
  const [selection, setSelection] = useState<ExportSelection>(EMPTY_SELECTION);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [downloading, setDownloading] = useState(false);
  const [listed, setListed] = useState(false);

  const definition = ASAN_EXPORTS[exportKey];
  const headers = LAYOUT_HEADERS[definition.layout];

  const allIds = useMemo(() => docs.map((d) => d.sourceId), [docs]);
  const view = useMemo(() => paginate(docs, page, pageSize), [docs, page, pageSize]);
  const pageIds = useMemo(() => view.items.map((d) => d.sourceId), [view.items]);
  const split = useMemo(() => splitForExport(docs, selection), [docs, selection]);
  const tickedCount = countTicked(allIds, selection);

  useEffect(() => {
    // A different export or a different range is a different result set; keeping ticks would
    // silently carry an intent from one dataset to another.
    setDocs([]);
    setSelection(EMPTY_SELECTION);
    setPage(1);
    setListed(false);
  }, [exportKey, fromIso, toIso]);

  const load = useCallback(async () => {
    if (!definition.available) {
      toast.error(`خروجی «${definition.label}» هنوز ساخته نشده است.`);
      return;
    }
    setLoading(true);
    try {
      const found = await definition.list({ fromIso, toIso });
      setDocs(found);
      setSelection(EMPTY_SELECTION);
      setPage(1);
      setListed(true);
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

      const stamp = `${fromIso}_${toIso}`;
      const count = await downloadAsanWorkbook(
        { headers, rows, sheetName: "Asan" },
        `asan-${definition.key}-${stamp}.xlsx`,
      );

      // Reflect the numbers just assigned so the preview matches the file.
      setDocs((prev) =>
        prev.map((d) => (numbers.has(d.sourceId) ? { ...d, asanNumber: numbers.get(d.sourceId)! } : d)),
      );
      toast.success(`فایل ساخته شد: ${toFaDigits(String(count))} سطر`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ساخت فایل");
    } finally {
      setDownloading(false);
    }
  }, [definition, fromIso, headers, split.exportable, toIso]);

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
              نمایش اسناد بازه
            </Button>
            <Button
              variant="secondary"
              onClick={download}
              disabled={downloading || !definition.available || split.exportable.length === 0}
            >
              {downloading ? (
                <Loader2 className="ms-1 h-4 w-4 animate-spin" />
              ) : (
                <Download className="ms-1 h-4 w-4" />
              )}
              دریافت فایل اکسل
            </Button>
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
              <div className="text-sm">
                <strong>{toFaDigits(String(tickedCount))}</strong> سند از{" "}
                <strong>{toFaDigits(String(docs.length))}</strong> سندِ بازه انتخاب شده —{" "}
                <span className="text-muted-foreground">
                  قابل خروجی: {toFaDigits(String(split.exportable.length))} · مسدود:{" "}
                  {toFaDigits(String(split.blocked.length))}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setSelection(tickPage(selection, pageIds))}>
                  انتخاب این صفحه
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelection(untickPage(selection, pageIds))}
                >
                  برداشتن این صفحه
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSelection(tickAllMatching())}>
                  انتخاب همهٔ {toFaDigits(String(docs.length))} ردیف
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelection(untickAllMatching(allIds))}
                >
                  برداشتن همهٔ ردیف‌ها
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
                    <TableHead>شماره آسان</TableHead>
                    <TableHead>سند</TableHead>
                    <TableHead>تاریخ</TableHead>
                    <TableHead>طرف حساب</TableHead>
                    <TableHead>مبلغ (تومان)</TableHead>
                    <TableHead>سطرها</TableHead>
                    <TableHead>وضعیت</TableHead>
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
                      <TableCell>
                        {d.asanNumber === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          toFaDigits(String(d.asanNumber))
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{d.title}</TableCell>
                      <TableCell>{isoToJalaliDisplay(d.dateIso)}</TableCell>
                      <TableCell>{d.partyName}</TableCell>
                      <TableCell>
                        {d.totalToman === null ? "—" : toFaDigits(d.totalToman.toLocaleString("en-US"))}
                      </TableCell>
                      <TableCell>{toFaDigits(String(d.rowCount))}</TableCell>
                      <TableCell>
                        {d.blockedReason ? (
                          <Badge variant="destructive" className="whitespace-normal text-right">
                            {d.blockedReason}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">آماده</Badge>
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
                <Button size="sm" variant="outline" disabled={view.page <= 1} onClick={() => setPage(view.page - 1)}>
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

            {/* The actual cells, in the actual Asan order, before anything is written. */}
            <PreviewSheet definition={definition} docs={split.exportable} headers={headers} />
          </CardContent>
        </Card>
      )}
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

  if (rows.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">پیش‌نمایش سطرهای فایل (ترتیب دقیق ستون‌های آسان)</div>
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
                  <TableCell key={ci} className="whitespace-nowrap" dir={typeof c === "number" ? "ltr" : "rtl"}>
                    {c === null || c === "" ? "" : String(c)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        شمارهٔ سند آسان هنگام دریافت فایل تخصیص می‌یابد؛ سندی که قبلاً خروجی گرفته، همان شمارهٔ
        قبلی را نگه می‌دارد.
      </p>
    </div>
  );
}
