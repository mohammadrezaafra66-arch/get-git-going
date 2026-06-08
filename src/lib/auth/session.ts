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
const PROFILE_ROLES_MAX_ATTEMPTS = 3; // initial + 2 retries
const PROFILE_ROLES_BACKOFF_MS = [800, 1600];

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

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function fetchProfileAndRoles(
  user: User,
): Promise<{
  profile: AuthProfile | null;
  roles: Array<{ role: string }>;
  profileError: string | null;
  rolesError: string | null;
}> {
  const [profileResult, rolesResult] = await Promise.all([
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
  return {
    profile: (profileResult.data as AuthProfile | null) ?? null,
    roles: rolesResult.data ?? [],
    profileError: profileResult.error?.message ?? null,
    rolesError: rolesResult.error?.message ?? null,
  };
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

  const startedAt = Date.now();
  let lastProfile: AuthProfile | null = null;
  let lastRoles: Array<{ role: string }> = [];
  let lastProfileError: string | null = null;
  let lastRolesError: string | null = null;
  let timedOut = false;

  for (let attempt = 1; attempt <= PROFILE_ROLES_MAX_ATTEMPTS; attempt += 1) {
    try {
      const r = await fetchProfileAndRoles(user);
      lastProfile = r.profile;
      lastRoles = r.roles;
      lastProfileError = r.profileError;
      lastRolesError = r.rolesError;
      timedOut = false;
      if (r.profileError) {
        console.error("[auth] profile fetch failed", r.profileError);
        logAuthDiagnostic("session.loadIdentity.profile", r.profileError, { attempt });
      }
      if (r.rolesError) {
        console.error("[auth] roles fetch failed", r.rolesError);
        logAuthDiagnostic("session.loadIdentity.roles", r.rolesError, { attempt });
      }
      if (!r.profileError && !r.rolesError) break;
    } catch (error) {
      timedOut = true;
      const message = getAuthClientError(error);
      console.error("[auth] identity load timed out", error);
      logAuthDiagnostic("session.loadIdentity.timeout", message, { attempt });
    }
    if (attempt < PROFILE_ROLES_MAX_ATTEMPTS) {
      logAuthDiagnostic("session.loadIdentity.retry", `attempt ${attempt + 1}`, {
        prevAttempt: attempt,
      });
      await sleep(PROFILE_ROLES_BACKOFF_MS[attempt - 1] ?? 1600);
    }
  }

  const elapsed = Date.now() - startedAt;
  if (elapsed > 3000) {
    logAuthDiagnostic("session.loadIdentity.slow", `took ${elapsed}ms`, { elapsed });
  }

  if (timedOut && !lastProfile && lastRoles.length === 0 && !lastProfileError && !lastRolesError) {
    // All attempts threw (no result at all). Do NOT set lastLoadedUserId so a
    // subsequent ensureAuthReady() call retries instead of short-circuiting.
    setSnapshot({
      profileLoading: false,
      rolesLoading: false,
      profileError: "بارگذاری پروفایل کاربر بیش از حد طول کشید.",
      rolesError: "بارگذاری نقش‌های کاربر بیش از حد طول کشید.",
      authError: "بارگذاری اطلاعات کاربری بیش از حد طول کشید. لطفاً دوباره تلاش کنید.",
    });
    return snapshot;
  }

  const rolesList = lastRoles.map((row) => row.role as AppRole);
  const normalizedRoles =
    !lastRolesError && rolesList.length === 0 ? (["viewer"] as AppRole[]) : rolesList;

  if (!lastRolesError && rolesList.length === 0) {
    console.warn("[auth] no role found for authenticated user; defaulting to viewer", {
      userId: user.id,
    });
  }

  const hasError = !!(lastProfileError || lastRolesError);

  setSnapshot({
    profile: lastProfile,
    roles: normalizedRoles,
    profileLoading: false,
    rolesLoading: false,
    profileError: lastProfileError,
    rolesError: lastRolesError,
    authError: buildAuthError(lastProfileError, lastRolesError),
    // Only mark as loaded for this user when we got a clean result; otherwise
    // leave lastLoadedUserId untouched so the next ensureAuthReady retries.
    ...(hasError ? {} : { lastLoadedUserId: user.id }),
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
  // is lost when the user switches tabs and comes back. Supabase can emit
  // SIGNED_IN and INITIAL_SESSION back-to-back for the same restored user;
  // while the first identity request is still running, the second event must
  // not start another profile/roles load or keep the global auth screen alive.
  const sameInitializedUser = snapshot.initialized && snapshot.user?.id === session.user.id;
  const identityAlreadyLoaded =
    snapshot.lastLoadedUserId === session.user.id ||
    (!!snapshot.profile && !snapshot.profileLoading && !snapshot.rolesLoading);
  const identityLoadInProgress = snapshot.profileLoading || snapshot.rolesLoading;
  if (!force && sameInitializedUser && (identityAlreadyLoaded || identityLoadInProgress)) {
    setSnapshot({
      session,
      user: session.user,
      loading: identityLoadInProgress ? snapshot.loading : false,
      authError: identityAlreadyLoaded ? null : snapshot.authError,
    });
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
    !snapshot.rolesLoading &&
    !snapshot.authError &&
    (!snapshot.user || snapshot.profile)
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
        setSnapshot({ initialized: true, loading: false, authError: snapshot.user ? null : message });
        return snapshot;
      }
      const { data, error } = result;
      if (error) {
        console.error("[auth] getSession failed", error);
        logAuthDiagnostic("session.getSession.error", error.message, error);
        setSnapshot({ initialized: true, loading: false, authError: snapshot.user ? null : error.message });
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
