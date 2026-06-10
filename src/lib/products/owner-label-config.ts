/**
 * پیکربندی متمرکز فیچر «سهمیه برچسب‌گذاری مالک محصول».
 * فقط constهای config — بدون side-effect، بدون وابستگی به Supabase/UI.
 * هر تغییر سیاستی (نسبت، rounding، حداقل) باید فقط اینجا اتفاق بیفتد.
 */

/** نسبت محصولات eligible که owner باید روی آن‌ها برچسب بگذارد. */
export const OWNER_LABEL_QUOTA_RATIO = 0.3;

/**
 * روش گرد کردن خروجی `eligibleCount * ratio`.
 * انتخاب: `floor` — محافظه‌کارانه؛ هرگز سهمیه را فراتر از سقف واقعی پرتاب نمی‌کند
 * و انتظار غیرواقعی برای owner نمی‌سازد.
 */
export const OWNER_LABEL_QUOTA_ROUNDING: "floor" | "round" | "ceil" = "floor";

/**
 * حداقل سهمیه وقتی owner حداقل یک محصول واجد شرایط دارد.
 * اگر `eligibleCount > 0` باشد، حداقل یک محصول باید قابل ورود به سبد تمرکز باشد
 * تا فیچر معنا داشته باشد. اگر `eligibleCount === 0` باشد، quota همچنان صفر می‌ماند
 * (این min در صفر اعمال نمی‌شود).
 */
export const OWNER_LABEL_MIN_QUOTA = 1;

/**
 * در فاز اول، محصولات مشترک (>1 owner) از محاسبه سهمیه حذف می‌شوند
 * چون منطق attribution میان owners هنوز تعریف نشده است.
 */
export const OWNER_LABEL_ALLOW_SHARED_PRODUCTS = false;

/** فقط برچسب‌های داخلی برای owner-tagging قابل استفاده هستند. */
export const OWNER_ASSIGNABLE_LABEL_VISIBILITY = "internal";

/** اندازه صفحه پیش‌فرض برای لیست‌های مرتبط در UI (فاز بعد). */
export const OWNER_LABEL_PAGE_SIZE = 25;

/** staleTime پیش‌فرض React Query برای queryهای این فیچر (فاز UI). */
export const OWNER_LABEL_STALE_TIME_MS = 60_000;

/** سقف امن برای آرگومان‌های `.in(...)` در یک batch تا از سقف URL عبور نکنیم. */
export const OWNER_LABEL_IN_CHUNK_SIZE = 500;