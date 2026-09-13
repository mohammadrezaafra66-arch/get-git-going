// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// آدرس Supabase عمداً اینجا نیست.
//
// تا ۲۰۲۶-۰۹-۱۳ یک `cloudUrl` اینجا بود که در `define` پایین به یک string literal
// تبدیل می‌شد. یعنی آدرسِ ماشینی که build را اجرا می‌کرد داخل bundle پخته می‌شد و
// image به آن میزبان گره می‌خورد. نتیجه‌اش این شد که یک image ساخته‌شده روی باکس
// تست، روی production نشست و همهٔ فراخوانی‌ها به Kong تست رفت.
//
// حالا آدرس در زمان اجرا از محیطِ کانتینر خوانده می‌شود:
//   `src/lib/runtime-config.ts`  ← خواندن
//   `src/routes/__root.tsx`      ← تزریق در <head> پیش از chunkهای Vite
//
// **هیچ مقدار وابسته به میزبان را دوباره به `define` اضافه نکنید.** آزمونِ آرتیفکت
// در خط release این را می‌سنجد و build را رد می‌کند.

// کلید anon عمداً اینجا نیست — و با هیچ literal دیگری جایگزین نشده است.
//
// N1 (حادثهٔ ۲۰۲۶-۰۹-۱۳): اینجا یک کلید anon ابری به‌صورت هاردکد در source بود که
// به‌عنوان آخرین fallback در `define` می‌نشست. دو پیامد داشت:
//   ۱. اگر متغیرهای محیطی خالی بودند، build **بی‌صدا** یک پروژهٔ سومِ اشتباه را
//      به bundle می‌بست.
//   ۲. یک کلید در تاریخچهٔ گیت ماند.
// حالا کلید در زمان اجرا از محیط کانتینر می‌آید (`src/lib/runtime-config.ts`).
//
// چرخاندنِ کلیدِ حذف‌شده هنوز لازم است و **تصمیم مالک** است: حذف از کد آن را از
// تاریخچهٔ گیت پاک نمی‌کند.

const cloudProjectId =
  process.env.VITE_SUPABASE_PROJECT_ID ?? process.env.SUPABASE_PROJECT_ID ?? "kwwkppkcihrbeurwudjh";

const disableLovableMcp = process.env.DISABLE_LOVABLE_MCP === "1" || process.platform === "win32";

// Build identity for the PWA service worker (Phase 8.2). The client registers
// `/sw.js?v=<buildId>`, which gives the browser a changed script URL on every
// deploy — that is what makes the update check fire — and gives the worker a
// per-build cache name so `activate` can drop the previous build's assets.
//
// GIT_SHA / BUILD_TIME are the values deploy/lan already passes to
// `docker compose ... --build`; the Dockerfile forwards them into the BUILD
// stage so they are present here. Outside a deploy (npm run dev, a bare
// `npm run build`) they are absent and the id falls back to "dev", which is
// correct: there is no deploy to detect.
//
// NOTE: this is deliberately NOT wired into src/lib/build-info.ts's BUILD_TAG.
// That constant drives an unrelated cache-clearing path whose behaviour is
// documented in docs/execution/p1-d8-progress.md — changing it is an owner
// decision, not a side effect of shipping the PWA.
const buildId = [process.env.GIT_SHA, process.env.BUILD_TIME]
  .filter((v) => v && v !== "local-unknown" && v !== "unknown")
  .join("-")
  .replace(/[^A-Za-z0-9._-]/g, "")
  .slice(0, 64);

export default defineConfig({
  // NOTE: previously a `cloudflare: false` toggle was used when
  // SELF_HOST_NODE=1 to switch to a pure Node SSR build. The current
  // @lovable.dev/vite-tanstack-config no longer exposes that option,
  // so the toggle must be handled at the Dockerfile/runtime level.
  // See deploy/app/README.md section "Build target — Cloudflare Workers vs Node SSR".
  vite: {
    plugins: disableLovableMcp ? [] : [mcpPlugin()],
    define: {
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(cloudProjectId),
      "import.meta.env.VITE_BUILD_ID": JSON.stringify(buildId || "dev"),
    },
  },
});
