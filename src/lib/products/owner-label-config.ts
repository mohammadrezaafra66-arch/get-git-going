/**
 * پیکربندی متمرکز «سهمیه برچسب‌گذاری مالک محصول».
 * هیچ side-effect ندارد و صرفاً ثابت‌ها را export می‌کند.
 * تغییر این مقادیر در آینده باید فقط از همین فایل انجام شود.
 */

/** نسبت محصولات هر مالک که باید برچسب‌گذاری شده باشد (۰ تا ۱). */
export const OWNER_LABEL_QUOTA_RATIO = 0.3;

export type OwnerLabelQuotaRounding = "floor" | "round" | "ceil";

/**
 * روش گرد کردن سهمیه.
 * انتخاب فعلی: floor — محافظه‌کارانه؛ سهمیه را هرگز فراتر از سقف واقعی نمی‌برد
 * و از ایجاد «انتظار غیرواقعی» جلوگیری می‌کند.
 */
export const OWNER_LABEL_QUOTA_ROUNDING: OwnerLabelQuotaRounding = "floor";

/**
 * حداقل سهمیه. انتخاب فعلی: 1 — حتی مالکی با محصول کم باید حداقل یک هدف داشته باشد
 * تا feature معنا داشته باشد؛ صفر یعنی feature برای او خاموش است.
 * استثنا: اگر eligibleCount === 0 خروجی همچنان 0 می‌ماند (چیزی برای هدف‌گیری نیست).
 */
export const OWNER_LABEL_MIN_QUOTA = 1;

/**
 * آیا محصولات مشترک (بیش از یک owner) در محاسبه سهمیه لحاظ شوند؟
 * در فاز اول: false — برای جلوگیری از شمارش دوگانه و ابهام attribution.
 */
export const OWNER_LABEL_ALLOW_SHARED_PRODUCTS = false;

/** فقط برچسب‌های با این visibility توسط مالک قابل اختصاص محسوب می‌شوند. */
export const OWNER_ASSIGNABLE_LABEL_VISIBILITY = "internal" as const;

/** اندازه صفحه پیش‌فرض برای لیست‌های مرتبط با این feature. */
export const OWNER_LABEL_PAGE_SIZE = 25;

/** staleTime پیش‌فرض React Query برای کوئری‌های این feature (میلی‌ثانیه). */
export const OWNER_LABEL_STALE_TIME_MS = 60_000;