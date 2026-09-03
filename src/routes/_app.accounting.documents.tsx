import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Loader2, X } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { JalaliDateInput } from "@/shared/components/JalaliDateInput";
import { formatNumber, toFaDigits } from "@/lib/i18n/formatters";
import { isoToJalaliDisplay } from "@/lib/i18n/jalali";
import {
  DOC_TYPE_FA,
  DOC_TYPE_FILTERS,
  DOCUMENT_REGISTER_LIMIT,
  buildDocumentExportRows,
  channelLabel,
  documentExportFilename,
  fetchDocumentRegister,
  statusLabel,
  type DocumentTypeFilter,
} from "@/lib/accounting/document-register";

// دفتر اسناد — the one place an accountant can see everything recorded on a day.
//
// Before this page there was no such place: /accounting/receipts showed only receipts,
// /accounting/payment-vouchers only payments, and a dual document was invisible everywhere — the
// wizard created it and then dropped the user on the receipts list, which structurally cannot
// contain it. Confirmed by research on 2026-09-03: `dual_documents` had zero read sites in src/.
//
// This page is a REGISTER, not a second home for those lists. Each row deep-links nowhere yet; the
// per-type detail pages keep their own routes and are untouched.
//
// NOT to be confused with /documents, which is the file-upload module (بیجک، فاکتور، حواله) over
// the `documents` table. Different feature, different data, deliberately left alone.
export const Route = createFileRoute("/_app/accounting/documents")({
  // Mirrors the requireAnyRole call below. The shared guard cannot decide during SSR or while
  // roles load, so RouteRoleGate in _app enforces this on the client.
  staticData: { gate: { kind: "anyRole", allowed: ["admin", "manager", "accountant"] } },
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "accountant"]);
  },
  component: DocumentRegisterPage,
});

function DocumentRegisterPage() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [docType, setDocType] = useState<DocumentTypeFilter>("all");
  const [exporting, setExporting] = useState(false);

  const listQ = useQuery({
    // docType is part of the key: changing the filter re-queries the database rather than
    // re-filtering what is already in memory.
    queryKey: ["document-register", fromDate, toDate, docType],
    queryFn: () =>
      fetchDocumentRegister({
        fromDate: fromDate || null,
        toDate: toDate || null,
        docType,
      }),
    staleTime: 15_000,
  });

  const rows = listQ.data ?? [];
  const atLimit = rows.length >= DOCUMENT_REGISTER_LIMIT;

  function handleExport() {
    // Exports EXACTLY what the table is showing: the same array, already narrowed by the same
    // date range and the same type filter. There is no second query and no second filter, so the
    // file and the screen cannot disagree.
    if (rows.length === 0) {
      toast.error("ردیفی برای خروجی وجود ندارد.");
      return;
    }
    setExporting(true);
    try {
      const exportRows = buildDocumentExportRows(rows);
      const ws = XLSX.utils.json_to_sheet(exportRows);
      ws["!cols"] = Object.keys(exportRows[0]).map((k) => ({
        wch: Math.min(40, Math.max(12, k.length + 4)),
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "اسناد");
      XLSX.writeFile(wb, documentExportFilename(fromDate || null, toDate || null));
      toast.success(`خروجی اکسل آماده شد (${toFaDigits(String(exportRows.length))} ردیف)`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطای ناشناخته";
      toast.error(`دریافت خروجی ناموفق بود: ${msg}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader
        title="دفتر اسناد"
        description="همهٔ اسناد ثبت‌شده — دریافت، پرداخت و سند دوبل — در یک فهرست، با فیلتر تاریخ و نوع."
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1">
            <Label>از تاریخ</Label>
            <JalaliDateInput value={fromDate} onChange={setFromDate} />
          </div>
          <div className="space-y-1">
            <Label>تا تاریخ</Label>
            <JalaliDateInput value={toDate} onChange={setToDate} />
          </div>

          <div className="space-y-1">
            <Label>نوع سند</Label>
            <div className="flex flex-wrap gap-1" role="group" aria-label="نوع سند">
              {DOC_TYPE_FILTERS.map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  size="sm"
                  variant={docType === opt.value ? "default" : "outline"}
                  aria-pressed={docType === opt.value}
                  onClick={() => setDocType(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          {(fromDate || toDate || docType !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFromDate("");
                setToDate("");
                setDocType("all");
              }}
            >
              <X className="ml-1 h-4 w-4" /> پاک کردن فیلترها
            </Button>
          )}

          <div className="ms-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={handleExport}
              disabled={exporting || listQ.isLoading || rows.length === 0}
            >
              {exporting ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="ml-2 h-4 w-4" />
              )}
              خروجی اکسل
            </Button>
          </div>
        </CardContent>
      </Card>

      {atLimit && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          بازهٔ انتخاب‌شده به سقف {toFaDigits(String(DOCUMENT_REGISTER_LIMIT))} ردیف رسیده است؛ بازه
          را کوچک‌تر کنید تا همهٔ اسناد دیده شوند.
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {listQ.isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="ml-2 h-5 w-5 animate-spin" /> در حال بارگذاری…
            </div>
          ) : listQ.isError ? (
            <div className="p-6 text-sm text-destructive">دریافت فهرست اسناد با خطا مواجه شد.</div>
          ) : rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={FileText}
                title="سندی در این بازه ثبت نشده"
                description="بازهٔ تاریخ یا نوع سند را تغییر دهید. اسناد از «ثبت سند» در ویزارد ساخته می‌شوند."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="px-4 py-2 text-sm text-muted-foreground">
                {toFaDigits(String(rows.length))} سند
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">شماره سند</TableHead>
                    <TableHead className="text-right">تاریخ</TableHead>
                    <TableHead className="text-right">نوع سند</TableHead>
                    <TableHead className="text-right">کانال</TableHead>
                    <TableHead className="text-right">طرف حساب</TableHead>
                    <TableHead className="text-right">مبلغ (تومان)</TableHead>
                    <TableHead className="text-right">حساب بانکی / صندوق</TableHead>
                    <TableHead className="text-right">شماره پیگیری</TableHead>
                    <TableHead className="text-right">وضعیت</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={`${r.doc_type}-${r.doc_id}`}>
                      <TableCell className="font-mono text-xs">
                        {r.document_number ? toFaDigits(r.document_number) : "—"}
                      </TableCell>
                      <TableCell>{r.doc_date ? isoToJalaliDisplay(r.doc_date) : "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{DOC_TYPE_FA[r.doc_type] ?? r.doc_type}</Badge>
                      </TableCell>
                      <TableCell>{channelLabel(r.channel) || "—"}</TableCell>
                      <TableCell className="max-w-[22rem] truncate">
                        {r.party_name || "—"}
                      </TableCell>
                      <TableCell>{formatNumber(r.amount == null ? null : Number(r.amount))}</TableCell>
                      <TableCell>{r.bank_account || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.tracking_number ? toFaDigits(r.tracking_number) : "—"}
                      </TableCell>
                      <TableCell>
                        {r.reversed ? (
                          <Badge variant="destructive">ابطال‌شده</Badge>
                        ) : (
                          <Badge variant="secondary">{statusLabel(r.status) || "—"}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
