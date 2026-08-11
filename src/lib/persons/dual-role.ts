import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * UNIFY P1.3/P1.4 — which mirror rows sit behind one person.
 *
 * `persons` is the identity; `suppliers` and `customers` are mirrors of it. A
 * person may hold both, which is the whole point of dual role, and until
 * migration 314 no row in this database did. Both the phone-lookup prompt
 * (P1.2) and the cross-links on the supplier/customer pages (P1.3) need the
 * same answer, so it lives here once rather than in each caller.
 */
export interface PersonMirrors {
  supplier_id: string | null;
  customer_id: string | null;
  /** City is only on the mirrors, never on `persons`. */
  city: string | null;
  supplier_name: string | null;
  customer_name: string | null;
}

export const EMPTY_MIRRORS: PersonMirrors = {
  supplier_id: null,
  customer_id: null,
  city: null,
  supplier_name: null,
  customer_name: null,
};

/**
 * Either read may be blocked by RLS for this user. That is fine and deliberate:
 * a missing cross-link is a smaller harm than revealing a record they may not
 * see, so an unreadable mirror simply reads as absent.
 */
export async function readPersonMirrors(personId: string): Promise<PersonMirrors> {
  const [{ data: customerRow }, { data: supplierRow }] = await Promise.all([
    supabase.from("customers").select("id, name, city").eq("person_id", personId).maybeSingle(),
    supabase
      .from("suppliers")
      .select("id, name, city")
      // `suppliers.person_id` is NOT NULL in the live database but absent from
      // the generated types, which also predate migration 308's
      // accounting_code. Regenerating types.ts is a separate, far larger change.
      .eq("person_id" as never, personId)
      .maybeSingle(),
  ]);

  const customer = customerRow as unknown as {
    id: string;
    name: string | null;
    city: string | null;
  } | null;
  const supplier = supplierRow as unknown as {
    id: string;
    name: string | null;
    city: string | null;
  } | null;

  return {
    customer_id: customer?.id ?? null,
    supplier_id: supplier?.id ?? null,
    customer_name: customer?.name ?? null,
    supplier_name: supplier?.name ?? null,
    city: customer?.city ?? supplier?.city ?? null,
  };
}

export function usePersonMirrors(personId: string | null | undefined) {
  return useQuery({
    queryKey: ["person-mirrors", personId],
    enabled: Boolean(personId),
    queryFn: () => readPersonMirrors(personId as string),
    staleTime: 60_000,
    retry: false,
  });
}
