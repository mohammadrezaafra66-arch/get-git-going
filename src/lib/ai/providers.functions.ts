/**
 * Server functions backing the AI provider admin page.
 *
 * Every one of these re-checks the admin role server-side. The route guard in
 * front of the page is a convenience for the user, not a security boundary —
 * a server function is directly callable.
 *
 * No function here ever returns a provider key. The admin UI sees
 * `key_prefix` and a boolean, and nothing else.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  AI_CAPABILITIES,
  type AiCapability,
  type AiProvider,
  type AiProviderHealth,
} from "./types";
import { discoverModels, testProviderCapability, type DiscoveredModel } from "./client.server";

export interface AiProvidersPayload {
  providers: AiProvider[];
  health: AiProviderHealth[];
}

async function assertAdmin(userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error || !data) {
    throw new Error("این عملیات فقط برای مدیر سیستم مجاز است.");
  }
}

const UpsertSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().trim().min(2).max(60),
  label: z.string().trim().min(1).max(120),
  kind: z.enum(["ollama", "openai_compatible"]),
  base_url: z.string().trim().min(4).max(500),
  is_active: z.boolean(),
  priority: z.number().int().min(0).max(1000),
  chat_model: z.string().trim().max(120).nullable(),
  embed_model: z.string().trim().max(120).nullable(),
  vision_model: z.string().trim().max(120).nullable(),
  capabilities: z.array(z.enum(AI_CAPABILITIES)),
  // null  -> keep the stored key
  // ""    -> remove the stored key
  // other -> replace it
  api_key: z.string().max(400).nullable(),
  notes: z.string().max(1000).nullable(),
});

export const listAiProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  // Explicit return type: without it TypeScript tries to infer this handler
  // through the whole generated Database type and gives up.
  .handler(async ({ context }): Promise<AiProvidersPayload> => {
    await assertAdmin(context.userId);

    const { data, error } = await supabaseAdmin
      .from("ai_providers" as never)
      .select(
        "id,name,label,kind,base_url,is_active,priority,chat_model,embed_model,vision_model,capabilities,key_prefix,secret_id,notes",
      )
      .order("priority", { ascending: true });
    if (error) throw new Error(error.message);

    const { data: health } = await supabaseAdmin
      .from("ai_provider_health" as never)
      .select(
        "provider_id,capability,last_status,last_ok_at,last_error_at,last_error_code,last_error_message,last_latency_ms,updated_at",
      );

    const providers: AiProvider[] = (
      (data ?? []) as unknown as (Omit<AiProvider, "capabilities" | "has_key"> & {
        capabilities: string[] | null;
        secret_id: string | null;
      })[]
    ).map((row) => ({
      id: row.id,
      name: row.name,
      label: row.label,
      kind: row.kind,
      base_url: row.base_url,
      is_active: row.is_active,
      priority: row.priority,
      chat_model: row.chat_model,
      embed_model: row.embed_model,
      vision_model: row.vision_model,
      capabilities: (row.capabilities ?? []).filter((c): c is AiCapability =>
        (AI_CAPABILITIES as readonly string[]).includes(c),
      ),
      key_prefix: row.key_prefix,
      has_key: row.secret_id != null,
      notes: row.notes,
    }));

    return { providers, health: (health ?? []) as unknown as AiProviderHealth[] };
  });

export const upsertAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    // Through the USER's client, not supabaseAdmin: the RPC is SECURITY
    // DEFINER and checks `has_role(auth.uid(), 'admin')`, and auth.uid() is
    // NULL on a service-role call — which would make the database-level check
    // reject every write. Routing it through the caller's JWT keeps that check
    // live and makes the RPC's own audit row attribute to the real actor.
    const { data: id, error } = await context.supabase.rpc(
      "admin_upsert_ai_provider" as never,
      {
        p_id: data.id,
        p_name: data.name,
        p_label: data.label,
        p_kind: data.kind,
        p_base_url: data.base_url,
        p_is_active: data.is_active,
        p_priority: data.priority,
        p_chat_model: data.chat_model,
        p_embed_model: data.embed_model,
        p_vision_model: data.vision_model,
        p_capabilities: data.capabilities,
        p_api_key: data.api_key,
        p_notes: data.notes,
      } as never,
    );

    if (error) throw new Error(error.message);
    // The RPC writes its own audit row (action ai_provider_created/updated,
    // key_changed flag, never the key itself), so nothing to add here.
    return { id: id as unknown as string };
  });

export const deleteAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    // User client, same reason as upsert — the RPC's admin check reads auth.uid().
    const { error } = await context.supabase.rpc(
      "admin_delete_ai_provider" as never,
      {
        p_id: data.id,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), capability: z.enum(AI_CAPABILITIES) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return testProviderCapability(data.id, data.capability);
  });

export const discoverAiModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true; models: DiscoveredModel[] } | { ok: false; messageFa: string }> => {
      await assertAdmin(context.userId);
      return discoverModels(data.id);
    },
  );
