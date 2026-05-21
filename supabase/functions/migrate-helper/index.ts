// Temporary migrate-helper edge function for Dreamlit Lovable Cloud → Supabase Exporter.
// This is a stub. Replace with the full Dreamlit-generated code, then redeploy.
// IMPORTANT: Delete this function after the migration window closes.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      message: "migrate-helper stub. Awaiting Dreamlit code replacement.",
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});