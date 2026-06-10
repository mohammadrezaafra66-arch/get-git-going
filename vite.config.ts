// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const cloudUrl =
  process.env.VITE_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  "https://kwwkppkcihrbeurwudjh.supabase.co";

const cloudPublishableKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3d2twcGtjaWhyYmV1cnd1ZGpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMzU5MTUsImV4cCI6MjA5MjYxMTkxNX0.oowSHbrAEL04u9DwGjyPYIlCc8MSL0c00Odv6UvM4bE";

const cloudProjectId =
  process.env.VITE_SUPABASE_PROJECT_ID ?? process.env.SUPABASE_PROJECT_ID ?? "kwwkppkcihrbeurwudjh";

export default defineConfig({
  // Build target is conditional:
  //   - SELF_HOST_NODE=1  → disable Cloudflare Workers plugin so `vite build`
  //     produces a pure Node SSR bundle (used by Dockerfile / SH.3A self-host).
  //   - default           → keep Cloudflare Workers build (required for
  //     Lovable preview & published deployments which run on Workers).
  cloudflare: process.env.SELF_HOST_NODE === "1" ? false : undefined,
  vite: {
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(cloudUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(cloudPublishableKey),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(cloudProjectId),
    },
  },
});
