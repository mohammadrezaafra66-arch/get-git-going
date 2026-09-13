// This file was originally generated. The Supabase URL now comes from runtime
// configuration rather than a build-time literal — see the note below.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { getRuntimeConfig } from "@/lib/runtime-config";

function createSupabaseClient() {
  // آدرس از پیکربندی زمان اجرا می‌آید، نه از `import.meta.env`.
  //
  // پیش از این اینجا `import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL`
  // بود. آن شکل دو مشکل داشت:
  //   ۱. `vite.config.ts` با `define` سمت چپ را در زمان build به یک literal تبدیل
  //      می‌کرد، پس آدرسِ ماشینِ سازنده داخل bundle پخته می‌شد.
  //   ۲. به همین دلیل سمت راست (`process.env`) در bundle کلاینت **کد مرده** بود و
  //      هرگز اجرا نمی‌شد — fallbackی که وجود نداشت.
  // نتیجه‌اش حادثهٔ ۲۰۲۶-۰۹-۱۳ بود: image ساخته‌شده روی باکس تست، روی production.
  //
  // کلید هنوز از `import.meta.env` می‌آید؛ در گام بعدی به همین مسیر منتقل می‌شود.
  const SUPABASE_URL = getRuntimeConfig().supabaseUrl;
  const SUPABASE_PUBLISHABLE_KEY =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      "Missing Supabase configuration. SUPABASE_URL must be present in the container environment at runtime (docker-compose web.environment), and SUPABASE_PUBLISHABLE_KEY must be set.",
    );
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: typeof window !== "undefined" ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
