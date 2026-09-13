// پیکربندی زمان اجرا (runtime configuration)
//
// چرا این فایل وجود دارد — حادثهٔ ۲۰۲۶-۰۹-۱۳
//   یک image که روی باکس تست ساخته شده بود روی production مستقر شد. هر فراخوانی
//   Supabase در bundle سرو‌شده به `http://192.168.170.8:9000` (Kong تست) می‌رفت.
//   فایل env روی production تمام مدت مقدار درست را داشت، ولی آن مقادیر build arg
//   بودند و استقرار با `--no-build` انجام شد، پس هرگز اعمال نشدند.
//
//   علت ریشه‌ای: `vite.config.ts` با `define` مقدار
//   `import.meta.env.VITE_SUPABASE_URL` را در زمان build به یک string literal
//   تبدیل می‌کرد. یعنی آدرس داخل خودِ bundle پخته می‌شد و image به میزبانی که
//   روی آن ساخته شده بود گره می‌خورد.
//
// این ماژول آن گره را باز می‌کند: مقدار در زمان **اجرا** از محیطِ کانتینر خوانده
// می‌شود، نه در زمان build. یک image روی هر میزبانی درست کار می‌کند.
//
// چطور کار می‌کند
//   سرور (SSR/Nitro): مستقیم از `process.env` می‌خواند.
//   مرورگر: از `window.__APP_RUNTIME_CONFIG__` که `RootShell` در `<head>` و
//           **پیش از** هر chunk ماژول Vite تزریق می‌کند
//           (`src/routes/__root.tsx`, `shellComponent`).
//
// نکتهٔ hydration: هر دو سمت از همین تابع می‌خوانند، پس JSON تزریق‌شده در سرور و
// آنچه کلاینت می‌بیند یکی است و React اختلاف hydration نمی‌بیند.
//
// قاعدهٔ دائمی: هیچ مقدارِ وابسته به میزبان نباید دوباره وارد `define` شود.
// آزمونِ آرتیفکت در خط release دقیقاً همین را می‌سنجد: هیچ literalِ میزبان نباید
// در bundle کلاینت باشد.

export type RuntimeConfig = {
  /** مبدأ Supabase/Kong — روی تست `http://192.168.170.8:9000`، روی production `http://192.168.170.10:8000` */
  supabaseUrl?: string;
  /**
   * کلید عمومی `anon`.
   *
   * این کلید عمداً عمومی است و در مرورگر دیده می‌شود؛ محافظ واقعی RLS است نه پنهان
   * بودن کلید. ولی کلیدِ **تست** و کلیدِ **production** یکی نیستند، پس این مقدار هم
   * وابسته به میزبان است و نباید در build پخته شود. در حادثهٔ ۲۰۲۶-۰۹-۱۳ کلید تست
   * داخل image مستقر روی production بود.
   */
  supabaseAnonKey?: string;
};

declare global {
  interface Window {
    __APP_RUNTIME_CONFIG__?: RuntimeConfig;
  }
}

/** نامی که script تزریقی در `window` می‌گذارد. در یک جا تعریف می‌شود تا از هم دور نیفتند. */
export const RUNTIME_CONFIG_GLOBAL = "__APP_RUNTIME_CONFIG__";

/**
 * فقط سمت سرور. از محیطِ کانتینر می‌خواند.
 *
 * `SUPABASE_URL` نامی است که `deploy/lan/docker-compose.yml` از قبل در بلوک
 * `environment:` سرویس `web` پاس می‌دهد (یعنی زمان اجرا، نه زمان build).
 * `VITE_SUPABASE_URL` فقط برای سازگاری با محیط‌های توسعه پذیرفته می‌شود.
 */
export function readServerRuntimeConfig(): RuntimeConfig {
  const env = typeof process !== "undefined" ? process.env : undefined;
  return {
    supabaseUrl: env?.SUPABASE_URL || env?.VITE_SUPABASE_URL || undefined,
    supabaseAnonKey:
      env?.SUPABASE_PUBLISHABLE_KEY ||
      env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
      env?.SUPABASE_ANON_KEY ||
      undefined,
  };
}

/**
 * روی هر دو سمت قابل فراخوانی است.
 *
 * مرورگر: از global تزریق‌شده می‌خواند. اگر غایب بود `{}` برمی‌گردد و
 * فراخوانندهٔ بالادست خطای صریح می‌دهد — که بهتر از یک آدرسِ اشتباهِ خاموش است.
 */
export function getRuntimeConfig(): RuntimeConfig {
  if (typeof window !== "undefined") {
    return window[RUNTIME_CONFIG_GLOBAL as "__APP_RUNTIME_CONFIG__"] ?? {};
  }
  return readServerRuntimeConfig();
}

/**
 * همان JSON‌ای که داخل tag اسکریپت می‌نشیند.
 *
 * `</script>` داخل رشته می‌تواند tag را زودتر ببندد؛ escape می‌شود.
 * `<!--` هم در HTML حالت comment می‌سازد.
 */
export function serializeRuntimeConfig(config: RuntimeConfig): string {
  return JSON.stringify(config).replace(/</g, "\\u003c").replace(/-->/g, "--\\u003e");
}
