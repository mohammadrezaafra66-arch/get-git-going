import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { AppRole } from "@/lib/rbac/roles";
import { loadRolePermissions } from "@/lib/rbac/dynamic-permissions";
import { areRolePermissionsLoaded } from "@/lib/rbac/permissions-cache";
import {
  ensureAuthReady,
  getAuthSnapshot,
  initializeAuthSession,
  refreshAuthIdentity,
  subscribeAuthSnapshot,
  type AuthProfile,
} from "@/lib/auth/session";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: AuthProfile | null;
  roles: AppRole[];
  loading: boolean;
  initialized: boolean;
  profileLoading: boolean;
  rolesLoading: boolean;
  /**
   * True while live `role_permissions` has not been read yet for a signed-in user.
   *
   * Wave 6 X-3 removed the static PERMISSIONS matrix, so `hasPermissionEx` no longer has
   * anything to fall back on while the table is in flight — it returns `false`, which is the
   * safe direction but not a true answer. Anything that RENDERS on a permission has to hold on
   * this instead of drawing the refusal and then correcting itself.
   */
  permissionsLoading: boolean;
  authError: string | null;
  profileError: string | null;
  rolesError: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
  retryAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Write one `auth` audit event through `public.log_event`.
 *
 * Wave 6 B-1. Both call sites used to read `void supabase.rpc("log_event", …)`, and that
 * silently wrote NOTHING — measured 2026-09-06: `audit_logs` held **0** rows for
 * `action='login_success'` and **0** rows of any action with `entity_type='auth'`, against
 * 997 real sign-ins recorded in `auth.audit_log_entries`.
 *
 * The cause is not RLS and not a missing JWT — `log_event` inserts correctly when called
 * with a simulated `authenticated` JWT. supabase-js query builders are LAZY: postgrest-js
 * 2.106.1 issues its `fetch` inside `PostgrestBuilder.then()`. `void <builder>` evaluates
 * the builder and discards it without ever calling `then()`, so no HTTP request leaves the
 * browser at all. Measured with a fetch spy: `void client.rpc(...)` → 0 requests;
 * `await client.rpc(...)` → 1 request.
 *
 * So this MUST be awaited (or `.then()`-ed) to fire. It is awaited rather than merely
 * kicked off because both call sites are immediately followed by something that invalidates
 * the credential the write depends on — navigation after login, `auth.signOut()` after
 * logout. The write is one local round-trip and is never allowed to fail the sign-in or
 * sign-out itself: an audit failure is reported to the console and swallowed.
 */
async function writeAuthAuditEvent(
  action: "login_success" | "logout",
  userId: string,
  diff: Json,
): Promise<void> {
  try {
    const { error } = await supabase.rpc("log_event", {
      _entity_type: "auth",
      _entity_id: userId,
      _action: action,
      _diff: diff,
    });
    if (error) {
      console.warn(`[audit] ${action} audit write failed:`, error.message);
    }
  } catch (err) {
    console.warn(`[audit] ${action} audit write threw:`, err);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const parentContext = useContext(AuthContext);
  if (parentContext) return <>{children}</>;

  return <AuthProviderInner>{children}</AuthProviderInner>;
}

function AuthProviderInner({ children }: { children: ReactNode }) {
  const [state, setState] = useState(getAuthSnapshot());

  useEffect(() => {
    initializeAuthSession();
    const unsubscribe = subscribeAuthSnapshot(() => setState(getAuthSnapshot()));
    void ensureAuthReady();
    return unsubscribe;
  }, []);

  // Preload dynamic role permissions once user is authenticated so route guards
  // and UI checks don't need to await individually.
  //
  // This is fire-and-forget, so there IS a window in which roles are known but permissions are
  // not. `permissionsReady` tracks it explicitly: before X-3 that window was papered over by the
  // static fallback, and now it has to be waited on instead.
  // NOTE this tracks "we have finished trying", not "we have rows". If the fetch fails,
  // loadRolePermissions() resolves without populating the cache, and gating on
  // areRolePermissionsLoaded() would leave the UI on a spinner forever. A failure therefore
  // surfaces the same way a missing permission does — as a denial — which is the same class of
  // outcome as rolesError, and is recoverable by a reload. A hang is not.
  const [permissionsSettled, setPermissionsSettled] = useState(() => areRolePermissionsLoaded());
  useEffect(() => {
    if (!state.user || state.rolesLoading) return;
    let cancelled = false;
    void loadRolePermissions().finally(() => {
      if (!cancelled) setPermissionsSettled(true);
    });
    return () => {
      cancelled = true;
    };
  }, [state.user, state.rolesLoading]);

  // Heartbeat: keep profiles.last_seen_at fresh for online-status indicators.
  useEffect(() => {
    const uid = state.user?.id;
    if (!uid) return;
    const ping = () => {
      void supabase
        .from("profiles")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", uid);
    };
    ping();
    const id = setInterval(ping, 60_000);
    return () => clearInterval(id);
  }, [state.user?.id]);

  const signIn: AuthContextValue["signIn"] = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data.user) {
      await writeAuthAuditEvent("login_success", data.user.id, { email });
    }
    return { error: error?.message ?? null };
  };

  const signUp: AuthContextValue["signUp"] = async (email, password, fullName) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/` : undefined,
        data: { full_name: fullName },
      },
    });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    const uid = state.user?.id;
    if (uid) {
      // Awaited BEFORE signOut(), not merely fired: signOut() tears the access token down,
      // and log_event raises 42501 for a caller with no auth.uid(). A logout audit row that
      // races its own sign-out is a row that never lands.
      await writeAuthAuditEvent("logout", uid, null);
    }
    await supabase.auth.signOut();
  };

  const refreshRoles = async () => {
    await refreshAuthIdentity();
  };

  const retryAuth = async () => {
    await ensureAuthReady(true);
  };

  return (
    <AuthContext.Provider
      value={{
        user: state.user,
        session: state.session,
        profile: state.profile,
        roles: state.roles,
        loading: state.loading,
        initialized: state.initialized,
        profileLoading: state.profileLoading,
        rolesLoading: state.rolesLoading,
        // Only meaningful for a signed-in user; with no user there is nothing to load.
        permissionsLoading: Boolean(state.user) && !permissionsSettled,
        authError: state.authError,
        profileError: state.profileError,
        rolesError: state.rolesError,
        signIn,
        signUp,
        signOut,
        refreshRoles,
        retryAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
