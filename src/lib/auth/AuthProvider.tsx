import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
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
      void supabase.rpc("log_event", {
        _entity_type: "auth",
        _entity_id: data.user.id,
        _action: "login_success",
        _diff: { email },
      });
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
      void supabase.rpc("log_event", {
        _entity_type: "auth",
        _entity_id: uid,
        _action: "logout",
        _diff: null,
      });
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
