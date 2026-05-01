import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    // During SSR the Supabase client may not have env vars available in the
    // Worker. Skip the session check there and just send the user to /login;
    // the client-side guards on /login and /_app will route them correctly
    // after hydration.
    if (typeof window === "undefined") {
      throw redirect({ to: "/login" });
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) throw redirect({ to: "/dashboard" });
    } catch (err) {
      if (err && typeof err === "object" && "isRedirect" in err) throw err;
      console.error("[/] beforeLoad session check failed", err);
    }
    throw redirect({ to: "/login" });
  },
  component: () => null,
});
