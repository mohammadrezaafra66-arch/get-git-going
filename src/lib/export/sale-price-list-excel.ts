/**
 * مورد ۱۳۶ — خروجی اکسل لیست قیمت فروش.
 *
 * کتابخانهٔ `xlsx` از قبل در پروژه هست و مثل بقیهٔ نقاط پروژه به‌صورت dynamic
 * import بارگذاری می‌شود تا وارد باندل اصلی نشود.
 *
 * قیمت‌ها به‌صورت **عدد واقعی** در شیت نوشته می‌شوند (نه رشتهٔ فارسی‌شده) تا در
 * اکسل قابل جمع‌زدن، مرتب‌سازی و فیلتر باشند.
 */

export interface SalePriceListExportRow {
  /** کد کالا — اجباری */
  sku: string | null;
  /** نام کالا — اجباری */
  name: string;
  /** قیمت فروش — اجباری؛ null یعنی قیمتی ثبت نشده */
  salePrice: number | null;
  brand?: string | null;
  category?: string | null;
  stockStatus?: string | null;
  productType?: string | null;
  /** عنوان نوع قیمت / لیست قیمت */
  salePriceTypeTitle?: string | null;
  /** توضیحات محصول — فقط در صفحهٔ جزئیات لیست موجود است */
  description?: string | null;
}

export interface SalePriceListExportOptions {
  /** عنوان نوع قیمت که برای همهٔ ردیف‌ها یکسان است */
  salePriceTypeTitle?: string | null;
  /** تاریخ ایجاد خروجی؛ برای تست‌پذیری قابل تزریق است */
  generatedAt?: Date;
}

const SHEET_NAME = "Sale Price List";

/** ستون‌هایی که داده‌شان همیشه موجود است. بقیه در صورت خالی بودن حذف می‌شوند. */
type SheetRow = Record<string, string | number | null>;

function buildSheetRows(
  rows: SalePriceListExportRow[],
  opts: SalePriceListExportOptions,
): SheetRow[] {
  const generatedAt = opts.generatedAt ?? new Date();
  const generatedAtLabel = generatedAt.toISOString().slice(0, 10);

  const hasBrand = rows.some((r) => r.brand);
  const hasCategory = rows.some((r) => r.category);
  const hasStock = rows.some((r) => r.stockStatus);
  const hasProductType = rows.some((r) => r.productType);
  const hasDescription = rows.some((r) => r.description);
  const priceTypeTitle = opts.salePriceTypeTitle ?? null;

  return rows.map((r, i) => {
    const out: SheetRow = {
      ردیف: i + 1,
      "کد کالا": r.sku ?? "",
      "نام کالا": r.name,
    };
    if (hasBrand) out["برند"] = r.brand ?? "";
    if (hasCategory) out["دسته‌بندی"] = r.category ?? "";
    if (hasStock) out["وضعیت موجودی"] = r.stockStatus ?? "";
    if (hasProductType) out["نوع کالا"] = r.productType ?? "";

    // عدد واقعی، نه رشته — تا در اکسل قابل محاسبه بماند.
    out["قیمت فروش"] = r.salePrice ?? null;

    if (priceTypeTitle) out["نوع قیمت"] = priceTypeTitle;
    out["تاریخ ایجاد خروجی"] = generatedAtLabel;
    if (hasDescription) out["توضیحات"] = r.description ?? "";
    return out;
  });
}

/**
 * ساخت workbook و دانلود آن در مرورگر. چیزی روی سرور ذخیره نمی‌شود.
 * اگر ردیفی وجود نداشته باشد خطا پرتاب می‌کند تا فراخوان بتواند toast مناسب
 * نشان دهد.
 */
export async function exportSalePriceListToExcel(
  rows: SalePriceListExportRow[],
  opts: SalePriceListExportOptions = {},
): Promise<{ fileName: string; rowCount: number }> {
  if (rows.length === 0) {
    throw new Error("محصولی برای خروجی گرفتن وجود ندارد.");
  }

  const XLSX = await import("xlsx");
  const sheetRows = buildSheetRows(rows, opts);

  const ws = XLSX.utils.json_to_sheet(sheetRows);
  ws["!cols"] = Object.keys(sheetRows[0]).map((key) => ({
    wch: Math.min(40, Math.max(12, key.length + 6)),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);

  const stamp = (opts.generatedAt ?? new Date()).toISOString().slice(0, 10);
  const fileName = `sale-price-list-${stamp}.xlsx`;
  XLSX.writeFile(wb, fileName);

  return { fileName, rowCount: sheetRows.length };
}
