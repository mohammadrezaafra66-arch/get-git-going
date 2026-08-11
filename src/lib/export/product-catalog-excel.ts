/**
 * خروجی اکسل فهرست محصولات (کاتالوگ افراکالا).
 * قیمت‌ها اینجا نیستند — برای لیست قیمت از sale-price-list-excel استفاده شود.
 * کتابخانه xlsx مثل بقیهٔ نقاط پروژه dynamic import می‌شود.
 */

export interface ProductCatalogExportRow {
  sku: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  productType: string | null;
  stockStatus: string | null;
  status: string | null;
  barcode: string | null;
  accountingCode: string | null;
  torobUrl: string | null;
  color: string | null;
  capacity: string | null;
  model: string | null;
  unit: string | null;
}

export interface ProductCatalogExportOptions {
  generatedAt?: Date;
}

const SHEET_NAME = "محصولات";

type SheetRow = Record<string, string | number | null>;

function buildSheetRows(
  rows: ProductCatalogExportRow[],
  opts: ProductCatalogExportOptions,
): SheetRow[] {
  const stamp = (opts.generatedAt ?? new Date()).toISOString().slice(0, 10);
  return rows.map((r, i) => ({
    ردیف: i + 1,
    "کد کالا": r.sku ?? "",
    "نام کالا": r.name,
    برند: r.brand ?? "",
    دسته‌بندی: r.category ?? "",
    "نوع کالا": r.productType ?? "",
    "وضعیت موجودی": r.stockStatus ?? "",
    وضعیت: r.status ?? "",
    بارکد: r.barcode ?? "",
    "کد آسان": r.accountingCode ?? "",
    "لینک ترب": r.torobUrl ?? "",
    رنگ: r.color ?? "",
    ظرفیت: r.capacity ?? "",
    مدل: r.model ?? "",
    واحد: r.unit ?? "",
    "تاریخ خروجی": stamp,
  }));
}

export async function exportProductCatalogToExcel(
  rows: ProductCatalogExportRow[],
  opts: ProductCatalogExportOptions = {},
): Promise<{ fileName: string; rowCount: number }> {
  if (rows.length === 0) {
    throw new Error("محصولی برای خروجی گرفتن وجود ندارد.");
  }

  const XLSX = await import("xlsx");
  const sheetRows = buildSheetRows(rows, opts);
  const ws = XLSX.utils.json_to_sheet(sheetRows);
  ws["!cols"] = Object.keys(sheetRows[0]).map((key) => ({
    wch: Math.min(48, Math.max(12, key.length + 8)),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);

  const stamp = (opts.generatedAt ?? new Date()).toISOString().slice(0, 10);
  const fileName = `products-${stamp}.xlsx`;
  XLSX.writeFile(wb, fileName);

  return { fileName, rowCount: sheetRows.length };
}
