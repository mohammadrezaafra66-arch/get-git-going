import "@/lib/polyfills/crypto-uuid";
import { createStart } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

/**
 * TanStack Start instance.
 *
 * Registers `attachSupabaseAuth` as a global client-side `functionMiddleware`
 * so every server function RPC issued from the browser automatically receives
 * the user's Supabase bearer token. This is required by the
 * `requireSupabaseAuth` server middleware used by Persons serverFns
 * (S04–S07) — without it, every protected serverFn call would return 401.
 */
export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
}));
