import { createFileRoute } from "@tanstack/react-router";
import { BRANDING } from "@/config/branding";

export const Route = createFileRoute("/api/version")({
  server: {
    handlers: {
      GET: async () => {
        const commit = process.env.APP_GIT_SHA || "unknown";
        const body = {
          ok: true,
          app: BRANDING.platformName,
          environment:
            process.env.APP_ENV || process.env.NODE_ENV || "unknown",
          commit,
          commitShort: commit.slice(0, 7),
          buildTime: process.env.APP_BUILD_TIME || "unknown",
          supabasePublicUrl:
            process.env.APP_SUPABASE_PUBLIC_URL ||
            process.env.VITE_SUPABASE_URL ||
            "unknown",
        };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});