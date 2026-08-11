// Hand-authored (NOT auto-generated). Do not remove.
//
// Purpose: a drop-in replacement for `requireSupabaseAuth` that additionally
// disables Realtime on the per-request Supabase client.
//
// Why: `@supabase/supabase-js` v2.104.x eagerly constructs a `RealtimeClient`
// inside `createClient(...)`. In the self-host LAN runner (Node 20, no native
// global `WebSocket`), `WebSocketFactory.getWebSocketConstructor()` throws
// "Node.js detected but native WebSocket not found. Suggested solution: Ensure
// you are running Node.js 22+ or provide a WebSocket implementation via the
// transport option." The failure surfaces to the browser as a generic 500 the
// first time an authenticated server function runs — the exact symptom the
// user reported for messenger image/PDF/Word/voice upload.
//
// The auto-generated `src/integrations/supabase/auth-middleware.ts` cannot be
// edited (project rule + regenerated on every sync). This wrapper mirrors its
// contract but passes a no-op transport so realtime-js skips its Node-version
// check. We never call `.channel()` / `.connect()` on this client, so the
// stub is never instantiated as an actual socket.
//
// Browser-side realtime is unaffected — it uses `@/integrations/supabase/client`
// which runs where a native `WebSocket` exists.

import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

class NoopRealtimeTransport {
  constructor() {
    throw new Error(
      "[messenger-auth] Realtime is disabled on this server-side client. " +
        "Use the browser client for realtime subscriptions.",
    );
  }
}

export const requireSupabaseAuthNode20 = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Response(
        "Missing Supabase environment variables. Ensure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are set.",
        { status: 500 },
      );
    }

    const request = getRequest();
    if (!request?.headers) {
      throw new Response("Unauthorized: No request headers available", { status: 401 });
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      throw new Response("Unauthorized: No authorization header provided", { status: 401 });
    }
    if (!authHeader.startsWith("Bearer ")) {
      throw new Response("Unauthorized: Only Bearer tokens are supported", { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      throw new Response("Unauthorized: No token provided", { status: 401 });
    }

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
      // See NoopRealtimeTransport note above — sidesteps the Node 20 eager
      // WebSocket check inside realtime-js without adding the `ws` package.
      realtime: {
        transport: NoopRealtimeTransport as unknown as typeof WebSocket,
      },
    });

    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims) {
      throw new Response("Unauthorized: Invalid token", { status: 401 });
    }
    if (!data.claims.sub) {
      throw new Response("Unauthorized: No user ID found in token", { status: 401 });
    }

    return next({
      context: {
        supabase,
        userId: data.claims.sub,
        claims: data.claims,
      },
    });
  },
);