/**
 * Which providers a single usage is allowed to reach.
 *
 * Extracted from `client.server.ts` so it can be tested directly. That module
 * imports `supabaseAdmin` at load time and reads provider keys, so importing it
 * from a unit test is not an option; this decision is pure and deserves to be
 * exercised on its own. Nothing here does I/O.
 *
 * The caller has already filtered `providers` down to the active rows that
 * DECLARE the capability, in ascending `priority` order. That ordering matters:
 * whatever this function returns first is the provider that gets the request.
 */
import type { AiCapability } from "./types";

export interface UsageRouteRow {
  service_key: string;
  capability: string;
  provider_id: string | null;
  is_enabled: boolean;
  fallback_enabled: boolean;
}

/** Narrower than `AiProvider` on purpose — this decision only needs the id. */
type Routable = { id: string };

export function applyUsageRoute<T extends Routable>(
  providers: T[],
  route: UsageRouteRow | null,
): T[] {
  if (!route) return providers;
  if (!route.is_enabled) return [];

  // A route with no provider_id has no permitted destination. With fallback ON that
  // means "no preference — use the priority order", which is how seven of the eight
  // live routes are configured and must keep working. With fallback OFF it means the
  // opposite: one destination only, and it is missing. Refuse.
  //
  // This used to `return providers` unconditionally, so `fallback_enabled` was never
  // read on this path and a route that forbade fallback silently got every provider
  // led by priority 1. It also disagreed with the pinned-but-missing case below,
  // which already refuses on the same facts.
  if (!route.provider_id) return route.fallback_enabled ? providers : [];

  const selected = providers.find((p) => p.id === route.provider_id);
  if (!selected) return route.fallback_enabled ? providers : [];
  if (!route.fallback_enabled) return [selected];

  return [selected, ...providers.filter((p) => p.id !== selected.id)];
}

export type { AiCapability };
