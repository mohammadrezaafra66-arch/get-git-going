export type DocBranch = "receipt" | "payment" | "dual";
export type MoneyChannel = "bank" | "cash" | "cheque";
export type ChequeKind = "own" | "endorsed";
export type PartyKind = "customer" | "supplier" | "external_party";

export interface PartyHit {
  personId: string;
  displayName: string;
  asanCode: string;
  kind: PartyKind;
  roleId: string;
  customerId: string | null;
  supplierId: string | null;
  externalPartyId: string | null;
}

export interface OpenProforma {
  id: string;
  number: string | null;
  total_amount: number;
  paid_so_far: number;
  remaining: number;
}

export interface ProformaAllocation {
  quote_id: string;
  amount: number;
}

export interface HeldCheque {
  id: string;
  amount: number;
  payment_date: string;
  cheque_number: string | null;
  customer_name: string | null;
}

export interface BankAccountOption {
  id: string;
  title: string;
  bank_name: string;
  account_type: string;
}

export type LookupStatus =
  | "idle"
  | "loading"
  | "ok"
  | "not_found"
  | "missing_asan"
  | "wrong_role"
  /**
   * OG-16 / D-3. The person was found and holds MORE THAN ONE file (e.g. both a
   * customer and a supplier file). The wizard must not decide which one the
   * document is booked against — `options` carries every candidate and the
   * operator picks. This status is deliberately NOT advanceable: `canNext`
   * requires `"ok"`, which only `selectPartyFile` can produce.
   */
  | "choose_role";

export interface LookupState {
  status: LookupStatus;
  query: string;
  party: PartyHit | null;
  /**
   * Every file the found person holds, in the order they are offered. Empty for
   * every status except `"choose_role"`, where it has two or three entries that
   * differ only in `kind` / `roleId`.
   */
  options: PartyHit[];
  missingName: string | null;
  message: string | null;
}
