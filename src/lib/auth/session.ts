import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/rbac/roles";

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

  const [profileResult, rolesResult] = await Promise.all([
    supabase.from("profiles").select("id, full_name, phone, is_active, status").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
  ]);

  const profileError = profileResult.error?.message ?? null;
  const rolesError = rolesResult.error?.message ?? null;

  if (profileResult.error) console.error("[auth] profile fetch failed", profileResult.error);
  if (rolesResult.error) console.error("[auth] roles fetch failed", rolesResult.error);

  const roles = (rolesResult.data ?? []).map((row) => row.role as AppRole);
  const normalizedRoles = !rolesError && roles.length === 0 ? (["viewer"] as AppRole[]) : roles;

  if (!rolesError && roles.length === 0) {
    console.warn("[auth] no role found for authenticated user; defaulting to viewer", { userId: user.id });
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
  supabase.auth.onAuthStateChange((_event, session) => {
    void applySession(session, true);
  });
}

export async function ensureAuthReady(force = false) {
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
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error("[auth] getSession failed", error);
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