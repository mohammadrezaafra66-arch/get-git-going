import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/rbac/roles";
import { logAuthDiagnostic } from "@/lib/auth/diagnostics";

export interface AuthProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
  is_active: boolean;
  status: string;
}

export interface AuthSnapshot {
  initialized: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: AuthProfile | null;
  roles: AppRole[];
  profileLoading: boolean;
  rolesLoading: boolean;
  authError: string | null;
  profileError: string | null;
  rolesError: string | null;
  lastLoadedUserId: string | null;
}

type AuthQueryResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

const listeners = new Set<() => void>();

let snapshot: AuthSnapshot = {
  initialized: false,
  loading: true,
  session: null,
  user: null,
  profile: null,
  roles: [],
  profileLoading: false,
  rolesLoading: false,
  authError: null,
  profileError: null,
  rolesError: null,
  lastLoadedUserId: null,
};

let initPromise: Promise<AuthSnapshot> | null = null;
let subscribed = false;

const AUTH_REQUEST_TIMEOUT_MS = 10_000;

async function withAuthTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label}: timeout`));
    }, AUTH_REQUEST_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function getAuthClientError(error: unknown) {
  return error instanceof Error ? error.message : "اتصال به سرویس احراز هویت برقرار نشد.";
}

function emit() {
  listeners.forEach((listener) => listener());
}

function setSnapshot(next: Partial<AuthSnapshot>) {
  snapshot = { ...snapshot, ...next };
  emit();
}

function buildAuthError(profileError: string | null, rolesError: string | null) {
  if (!profileError && !rolesError) return null;
  return [profileError, rolesError].filter(Boolean).join(" | ");
}

async function loadIdentity(user: User, force = false) {
  if (
    !force &&
    snapshot.lastLoadedUserId === user.id &&
    !snapshot.profileLoading &&
    !snapshot.rolesLoading &&
    !snapshot.profileError &&
    !snapshot.rolesError
  ) {
    return snapshot;
  }

  setSnapshot({
    profileLoading: true,
    rolesLoading: true,
    authError: null,
    profileError: null,
    rolesError: null,
  });

  let profileResult: AuthQueryResult<AuthProfile>;
  let rolesResult: AuthQueryResult<Array<{ role: string }>>;
  try {
    [profileResult, rolesResult] = await Promise.all([
      withAuthTimeout<AuthQueryResult<AuthProfile>>(
        supabase
          .from("profiles")
          .select("id, full_name, phone, is_active, status")
          .eq("id", user.id)
          .maybeSingle(),
        "profile load",
      ),
      withAuthTimeout<AuthQueryResult<Array<{ role: string }>>>(
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        "roles load",
      ),
    ]);
  } catch (error) {
    const message = getAuthClientError(error);
    console.error("[auth] identity load timed out", error);
    logAuthDiagnostic("session.loadIdentity.timeout", message, error);
    setSnapshot({
      profileLoading: false,
      rolesLoading: false,
      profileError: "بارگذاری پروفایل کاربر بیش از حد طول کشید.",
      rolesError: "بارگذاری نقش‌های کاربر بیش از حد طول کشید.",
      authError: "بارگذاری اطلاعات کاربری بیش از حد طول کشید. لطفاً دوباره تلاش کنید.",
      lastLoadedUserId: user.id,
    });
    return snapshot;
  }

  const profileError = profileResult.error?.message ?? null;
  const rolesError = rolesResult.error?.message ?? null;

  if (profileResult.error) console.error("[auth] profile fetch failed", profileResult.error);
  if (rolesResult.error) console.error("[auth] roles fetch failed", rolesResult.error);
  if (profileResult.error)
    logAuthDiagnostic(
      "session.loadIdentity.profile",
      profileResult.error.message,
      profileResult.error,
    );
  if (rolesResult.error)
    logAuthDiagnostic("session.loadIdentity.roles", rolesResult.error.message, rolesResult.error);

  const roles = (rolesResult.data ?? []).map((row) => row.role as AppRole);
  const normalizedRoles = !rolesError && roles.length === 0 ? (["viewer"] as AppRole[]) : roles;

  if (!rolesError && roles.length === 0) {
    console.warn("[auth] no role found for authenticated user; defaulting to viewer", {
      userId: user.id,
    });
  }

  setSnapshot({
    profile: (profileResult.data as AuthProfile | null) ?? null,
    roles: normalizedRoles,
    profileLoading: false,
    rolesLoading: false,
    profileError,
    rolesError,
    authError: buildAuthError(profileError, rolesError),
    lastLoadedUserId: user.id,
  });

  return snapshot;
}

async function applySession(session: Session | null, force = false) {
  if (!session?.user) {
    setSnapshot({
      initialized: true,
      loading: false,
      session: null,
      user: null,
      profile: null,
      roles: [],
      profileLoading: false,
      rolesLoading: false,
      authError: null,
      profileError: null,
      rolesError: null,
      lastLoadedUserId: null,
    });
    return snapshot;
  }

  // Token refresh / same-user re-emit: just update tokens silently.
  // Do NOT toggle global loading or re-fetch profile/roles, otherwise the
  // entire app tree unmounts and component state (forms, search inputs)
  // is lost when the user switches tabs and comes back.
  if (!force && snapshot.initialized && snapshot.lastLoadedUserId === session.user.id) {
    setSnapshot({ session, user: session.user });
    return snapshot;
  }

  setSnapshot({
    initialized: true,
    loading: true,
    session,
    user: session.user,
  });

  await loadIdentity(session.user, force);
  setSnapshot({ loading: false, session, user: session.user });
  return snapshot;
}

export function initializeAuthSession() {
  if (subscribed) return;
  subscribed = true;
  try {
    supabase.auth.onAuthStateChange((event, session) => {
      // Only force a full identity reload on real sign-in / sign-out / user change.
      // TOKEN_REFRESHED and USER_UPDATED happen frequently (incl. on tab focus)
      // and must not trigger a global loading screen.
      const isFullReload =
        event === "SIGNED_IN" && (!snapshot.user || snapshot.user.id !== session?.user?.id);
      const isSignOut = event === "SIGNED_OUT";
      logAuthDiagnostic("session.onAuthStateChange", event, {
        hasSession: !!session,
        sessionUserId: session?.user?.id ?? null,
        previousUserId: snapshot.user?.id ?? null,
        isFullReload,
        isSignOut,
      });
      void applySession(session, isFullReload || isSignOut);
    });
  } catch (error) {
    const message = getAuthClientError(error);
    console.error("[auth] auth subscription failed", error);
    logAuthDiagnostic("session.subscribe", message, error);
    setSnapshot({ initialized: true, loading: false, authError: message });
  }
}

export async function ensureAuthReady(force = false) {
  // Auth must only run in the browser. During SSR the Supabase env vars
  // may not be available in the Worker, and the supabase client would
  // throw on initialization. Return the current (uninitialized) snapshot
  // and let the client take over after hydration.
  if (typeof window === "undefined") {
    return snapshot;
  }

  initializeAuthSession();

  if (
    !force &&
    snapshot.initialized &&
    !snapshot.loading &&
    !snapshot.profileLoading &&
    !snapshot.rolesLoading
  ) {
    return snapshot;
  }

  if (!initPromise || force) {
    initPromise = (async () => {
      setSnapshot({ loading: true });
      let result: Awaited<ReturnType<typeof supabase.auth.getSession>>;
      try {
        result = await withAuthTimeout(supabase.auth.getSession(), "get session");
      } catch (error) {
        const message = getAuthClientError(error);
        console.error("[auth] getSession failed", error);
        logAuthDiagnostic("session.getSession.throw", message, error);
        setSnapshot({ initialized: true, loading: false, authError: message });
        return snapshot;
      }
      const { data, error } = result;
      if (error) {
        console.error("[auth] getSession failed", error);
        logAuthDiagnostic("session.getSession.error", error.message, error);
        setSnapshot({ initialized: true, loading: false, authError: error.message });
        return snapshot;
      }
      return applySession(data.session, force);
    })().finally(() => {
      initPromise = null;
    });
  }

  return initPromise;
}

export async function refreshAuthIdentity() {
  if (!snapshot.user) return ensureAuthReady(true);
  setSnapshot({ loading: true });
  await loadIdentity(snapshot.user, true);
  setSnapshot({ loading: false });
  return snapshot;
}

export function getAuthSnapshot() {
  return snapshot;
}

export function subscribeAuthSnapshot(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
