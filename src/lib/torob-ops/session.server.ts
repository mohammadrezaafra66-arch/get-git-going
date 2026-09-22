import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  createTorobOpsSessionToken,
  hashTorobOpsPassword,
  hashTorobOpsSessionToken,
  verifyTorobOpsPassword,
} from "./crypto.server";
import { torobOpsAdmin, writeTorobOpsAudit } from "./db.server";

export async function unlockTorobOpsSession(input: {
  userId: string;
  password: string;
}): Promise<{ ok: true; sessionToken: string } | { ok: false; message: string }> {
  const { data: cred, error } = await torobOpsAdmin()
    .from("torob_ops_credentials")
    .select("user_id, password_hash, is_active")
    .eq("user_id", input.userId)
    .maybeSingle();

  if (error) return { ok: false, message: "بررسی رمز ماژول ناموفق بود." };
  if (!cred || !cred.is_active) {
    return { ok: false, message: "رمز فعال برای این کاربر تعریف نشده است." };
  }
  if (!verifyTorobOpsPassword(input.password, String(cred.password_hash))) {
    return { ok: false, message: "رمز ماژول نادرست است." };
  }

  const sessionToken = createTorobOpsSessionToken();
  const tokenHash = hashTorobOpsSessionToken(sessionToken);
  const { data: session, error: sessErr } = await torobOpsAdmin()
    .from("torob_ops_sessions")
    .insert({ user_id: input.userId, token_hash: tokenHash })
    .select("id")
    .single();

  if (sessErr || !session) {
    return { ok: false, message: "ایجاد نشست ماژول ناموفق بود." };
  }

  await writeTorobOpsAudit({
    actorId: input.userId,
    action: "torob_ops_unlock",
    entityId: String(session.id),
    diff: { user_id: input.userId },
  });

  return { ok: true, sessionToken };
}

export async function revokeTorobOpsSession(input: {
  userId: string;
  sessionToken: string;
  reason?: string;
}): Promise<void> {
  const tokenHash = hashTorobOpsSessionToken(input.sessionToken);
  const { data } = await torobOpsAdmin()
    .from("torob_ops_sessions")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: input.userId,
      revoke_reason: input.reason ?? "lock",
    })
    .eq("token_hash", tokenHash)
    .eq("user_id", input.userId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();

  if (data?.id) {
    await writeTorobOpsAudit({
      actorId: input.userId,
      action: "torob_ops_lock",
      entityId: String(data.id),
    });
  }
}

export async function requireTorobOpsSession(input: {
  userId: string;
  sessionToken: string | null | undefined;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!input.sessionToken || input.sessionToken.trim().length < 16) {
    return { ok: false, message: "نشست ماژول ترب باز نیست. دوباره رمز را وارد کنید." };
  }

  const tokenHash = hashTorobOpsSessionToken(input.sessionToken.trim());
  const { data: session, error } = await torobOpsAdmin()
    .from("torob_ops_sessions")
    .select("id, user_id, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !session) {
    return { ok: false, message: "نشست ماژول نامعتبر است." };
  }
  if (session.revoked_at) {
    return { ok: false, message: "نشست ماژول باطل شده است." };
  }
  if (String(session.user_id) !== input.userId) {
    return { ok: false, message: "نشست ماژول متعلق به کاربر دیگری است." };
  }

  const { data: cred } = await torobOpsAdmin()
    .from("torob_ops_credentials")
    .select("is_active")
    .eq("user_id", input.userId)
    .maybeSingle();

  if (!cred?.is_active) {
    return { ok: false, message: "دسترسی ماژول برای این کاربر غیرفعال است." };
  }

  return { ok: true };
}

export async function upsertTorobOpsCredential(input: {
  adminId: string;
  userId: string;
  password: string;
  isActive?: boolean;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (input.password.trim().length < 8) {
    return { ok: false, message: "رمز باید حداقل ۸ کاراکتر باشد." };
  }
  const passwordHash = hashTorobOpsPassword(input.password.trim());
  const isActive = input.isActive ?? true;

  const { data: existing } = await torobOpsAdmin()
    .from("torob_ops_credentials")
    .select("user_id")
    .eq("user_id", input.userId)
    .maybeSingle();

  if (existing) {
    const { error } = await torobOpsAdmin()
      .from("torob_ops_credentials")
      .update({
        password_hash: passwordHash,
        is_active: isActive,
        updated_by: input.adminId,
      })
      .eq("user_id", input.userId);
    if (error) return { ok: false, message: error.message };
  } else {
    const { error } = await torobOpsAdmin().from("torob_ops_credentials").insert({
      user_id: input.userId,
      password_hash: passwordHash,
      is_active: isActive,
      created_by: input.adminId,
      updated_by: input.adminId,
    });
    if (error) return { ok: false, message: error.message };
  }

  if (!isActive) {
    await revokeAllTorobOpsSessionsForUser({
      userId: input.userId,
      adminId: input.adminId,
      reason: "credential_deactivated",
    });
  }

  await writeTorobOpsAudit({
    actorId: input.adminId,
    action: existing ? "torob_ops_credential_update" : "torob_ops_credential_create",
    entityId: input.userId,
    diff: { is_active: isActive },
  });

  return { ok: true };
}

export async function setTorobOpsCredentialActive(input: {
  adminId: string;
  userId: string;
  isActive: boolean;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await torobOpsAdmin()
    .from("torob_ops_credentials")
    .update({ is_active: input.isActive, updated_by: input.adminId })
    .eq("user_id", input.userId);
  if (error) return { ok: false, message: error.message };

  if (!input.isActive) {
    await revokeAllTorobOpsSessionsForUser({
      userId: input.userId,
      adminId: input.adminId,
      reason: "credential_deactivated",
    });
  }

  await writeTorobOpsAudit({
    actorId: input.adminId,
    action: input.isActive ? "torob_ops_credential_activate" : "torob_ops_credential_deactivate",
    entityId: input.userId,
  });

  return { ok: true };
}

export async function revokeAllTorobOpsSessionsForUser(input: {
  userId: string;
  adminId: string;
  reason: string;
}): Promise<number> {
  const { data, error } = await torobOpsAdmin()
    .from("torob_ops_sessions")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: input.adminId,
      revoke_reason: input.reason,
    })
    .eq("user_id", input.userId)
    .is("revoked_at", null)
    .select("id");

  if (error) return 0;
  const count = (data ?? []).length;
  if (count > 0) {
    await writeTorobOpsAudit({
      actorId: input.adminId,
      action: "torob_ops_sessions_revoke_all",
      entityId: input.userId,
      diff: { count, reason: input.reason },
    });
  }
  return count;
}

export async function listTorobOpsCredentials(): Promise<
  Array<{
    user_id: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    full_name: string | null;
    email: string | null;
  }>
> {
  const { data: creds, error } = await torobOpsAdmin()
    .from("torob_ops_credentials")
    .select("user_id, is_active, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);

  const userIds = (creds ?? []).map((c: { user_id: string }) => c.user_id);
  const { data: profiles } = userIds.length
    ? await torobOpsAdmin().from("profiles").select("id, full_name").in("id", userIds)
    : { data: [] as Array<{ id: string; full_name: string | null }> };

  const nameMap = new Map(
    (profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]),
  );

  const emailMap = new Map<string, string | null>();
  for (const id of userIds) {
    const { data } = await supabaseAdmin.auth.admin.getUserById(id);
    emailMap.set(id, data.user?.email ?? null);
  }

  return (creds ?? []).map(
    (c: { user_id: string; is_active: boolean; created_at: string; updated_at: string }) => ({
      user_id: c.user_id,
      is_active: c.is_active,
      created_at: c.created_at,
      updated_at: c.updated_at,
      full_name: nameMap.get(c.user_id) ?? null,
      email: emailMap.get(c.user_id) ?? null,
    }),
  );
}
