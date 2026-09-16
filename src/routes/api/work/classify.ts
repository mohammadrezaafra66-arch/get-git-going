// POST /api/work/classify — rule-based work text classification (auth required).
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { classifyWorkItem } from "@/lib/work/classify";

const bodySchema = z.object({
  text: z.string().min(1).max(8000),
  title: z.string().max(200).optional(),
});

export const Route = createFileRoute("/api/work/classify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Server misconfigured", { status: 500 });
        }

        const authHeader = request.headers.get("authorization");
        if (!authHeader) {
          return new Response("Unauthorized", { status: 401 });
        }

        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
          global: { headers: { Authorization: authHeader } },
        });

        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userData?.user) {
          return new Response("Unauthorized", { status: 401 });
        }

        let parsed: z.infer<typeof bodySchema>;
        try {
          const json = await request.json();
          parsed = bodySchema.parse(json);
        } catch {
          return new Response("Bad Request", { status: 400 });
        }

        const result = classifyWorkItem({
          text: parsed.text,
          title: parsed.title,
        });

        return Response.json(result, { status: 200 });
      },
    },
  },
});
