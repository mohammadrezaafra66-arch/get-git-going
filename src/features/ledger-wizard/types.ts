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

export type LookupStatus = "idle" | "loading" | "ok" | "not_found" | "missing_asan" | "wrong_role";

export interface LookupState {
  status: LookupStatus;
  query: string;
  party: PartyHit | null;
  missingName: string | null;
  message: string | null;
}
