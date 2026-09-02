import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Trash2,
  Search,
  Save,
  Package,
  UserCheck,
  UserPlus,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { type AppRole } from "@/lib/rbac/roles";
import { PageHeader } from "@/components/common/PageHeader";
import { PersianDatePicker } from "@/components/common/PersianDatePicker";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebounce } from "@/hooks/use-debounce";
import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { FEATURE_QUOTE_CUSTOMER_PICKER } from "@/lib/feature-flags";
import { safeRandomUUID } from "@/lib/utils/safe-uuid";
import { formatNumber } from "@/lib/i18n/formatters";
import { QuickAddCustomerDialog } from "@/shared/components/QuickAddCustomerDialog";
import { Badge } from "@/components/ui/badge";
import { STOCK_STATUS_LABELS, STOCK_STATUS_VARIANTS } from "@/lib/products/constants";
import { computeTotals, lineTotal, validateQuote, type DraftQuoteItem } from "@/lib/sales/quotes";
import { useProductThumbnails } from "@/hooks/products/useProductThumbnails";
import { WarehouseSelect } from "@/components/warehouses/WarehouseSelect";
import { usePredictedLineServices } from "@/lib/sales/line-services";
import { MandatoryServiceBadge } from "@/components/sales/quotes/MandatoryServiceBadge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ACCOUNTING_APPROVAL_TEXT,
  GUEST_NO_LINK_PRIVILEGED_TEXT,
  QuoteCreationBlockDialog,
  type QuoteBlockReason,
  type QuoteExceptionType,
} from "@/components/sales/quotes/QuoteCreationBlockDialog";

/**
 * A short, stable fingerprint of the commitment wording, so an audit row says WHICH text was
 * accepted rather than merely that something was. If the wording is ever edited the fingerprint
 * changes, and old rows keep pointing at the words their signer actually read.
 *
 * Not a security primitive — it identifies a template, it does not authenticate one.
 */
function commitmentFingerprint(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Every way this form can refuse a quote. The value is stored as `stage` on the refusal row, so
 * "how often does the credit wall stop a sale" becomes a query instead of a guess.
 */
type RefusalStage =
  | "client_validation" // validateQuote rejected the header or an item
  | "credit_gate" // findCreditBlocker opened the block dialog
  | "server_rpc"; // create_sales_quote_with_items raised

/**
 * Record a refused attempt. FIRE-AND-FORGET BY CONSTRUCTION — it returns void, is never awaited,
 * and a failure here is logged at error severity rather than shown to the salesperson. A quote is
 * refused often and for ordinary reasons; making the person wait on bookkeeping would be worse
 * than the missing row.
 *
 * NO IDENTIFYING DATA. Not the customer's name, phone, address or national id. The fields below
 * are an attempt id, which stage refused, a machine-readable code, the actor's roles, whether the
 * quote was linked to a customer file, whether that file has a phone, and the time. The previous
 * version of this write put customer_name straight into the audit diff; it also sent
 * entity_id: null into a NOT NULL column, so it had never once succeeded — 0 rows in the table.
 *
 * FIVE BLIND SPOTS remain, documented in docs/design/quote-refusal-logging.md: a disabled save
 * button, a disabled add-item button, a cancelled confirmation dialog, a price lookup that dead-
 * ends, and the route guard refusing the page. None of them is an event this function can see.
 */
function logQuoteRefusal(input: {
  attemptId: string;
  stage: RefusalStage;
  code: string;
  actorId: string | null;
  roles: string[];
  linked: boolean;
  customerHasPhone: boolean;
}): void {
  if (!input.actorId) return;
  void supabase
    .from("audit_logs")
    .insert({
      actor_id: input.actorId,
      entity_type: "sales_quotes",
      // No quote exists — nothing was written. The attempt id is what ties the stages of one
      // attempt together, and entity_id is NOT NULL so it cannot simply be omitted.
      entity_id: input.attemptId,
      action: "sales_quote_refused",
      diff: {
        stage: input.stage,
        code: input.code,
        actor_roles: input.roles,
        linked_to_customer_file: input.linked,
        customer_file_has_phone: input.customerHasPhone,
        refused_at: new Date().toISOString(),
      },
    })
    .then(({ error }) => {
      if (error) {
        console.error(
          "[audit] quote refusal row failed (stage=%s code=%s): %s",
          input.stage,
          input.code,
          error.message,
        );
      }
    });
}

export const ALLOWED_ROLES: AppRole[] = ["admin", "manager", "sales"];

export const Route = createFileRoute("/_app/sales/quotes/new")({
  beforeLoad: async () => {
    // Phase 6.7 — was a hand-rolled ensureAuthReady() guard, which redirected
    // authenticated users to /login on any server-rendered navigation.
    await requireAnyRole(ALLOWED_ROLES);
  },
  component: NewQuotePage,
});

function NewQuotePage() {
  const navigate = useNavigate();
  const { user, roles } = useAuth();
  const canEditPriceFreely = roles.includes("admin") || roles.includes("manager");
  // Manager and admin are NOT shown the commitment, so they cannot accept it. Recording their
  // guest quotes under the salesperson's words would be a false claim in the audit record.
  const guestCommitmentRequired = !roles.includes("admin") && !roles.includes("manager");
  const guestCommitmentText = guestCommitmentRequired
    ? ACCOUNTING_APPROVAL_TEXT
    : GUEST_NO_LINK_PRIVILEGED_TEXT;

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  // The customer picked from the registry (search or quick-add). Kept only to
  // decide whether the quote links to a registered customer; see linkedCustomerId.
  const [selectedCustomer, setSelectedCustomer] = useState<{
    id: string;
    name: string;
    phone: string;
  } | null>(null);
  // Step 1 — detaching is an ACT, not a side effect of typing. Only the explicit
  // «قطع اتصال» button sets this, and only after its confirmation dialog.
  const queryClient = useQueryClient();
  // One id per form session, so the stages of a single attempt can be tied together in the log.
  const [refusalAttemptId] = useState(() => safeRandomUUID());
  const [guestOverride, setGuestOverride] = useState(false);
  // Ticking this is the acceptance. Deliberately not derived from anything — no default, no
  // inference from the role — and cleared the moment the quote stops being a guest one.
  const [guestCommitmentAccepted, setGuestCommitmentAccepted] = useState(false);
  const [confirmDetachOpen, setConfirmDetachOpen] = useState(false);
  // Step 2 — the "add a phone to the customer file" dialog. Its draft never touches the quote.
  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [items, setItems] = useState<DraftQuoteItem[]>([]);
  const [settlementTypeId, setSettlementTypeId] = useState<string>("");
  // Item 178 — warehouse the goods will be deducted from. null = default warehouse.
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  // Items 194/196 — going under the settlement floor is allowed only as a
  // deliberate, recorded act. The checkbox opens a warning dialog first; only
  // confirming it there arms the override and unlocks the price field.
  const [belowListAck, setBelowListAck] = useState(false);
  const [belowListDialogOpen, setBelowListDialogOpen] = useState(false);
  // Items 197/198/212 — exception routes used when a quote cannot be issued
  // normally because of credit, overdue balance, or accounting approval.
  const [quoteException, setQuoteException] = useState<{
    type: QuoteExceptionType;
    minutes?: number | null;
    amount?: number | null;
    text: string;
  } | null>(null);
  const [blockReason, setBlockReason] = useState<QuoteBlockReason | null>(null);
  // Item 203 — the visitor credited with the deal, separate from the
  // salesperson issuing it. "" means none.
  const [visitorId, setVisitorId] = useState<string>("");
  // Item 152 — the refusal dialog: the reason the DB/validation gave, plus a
  // one-line note the salesperson may add before it is logged.
  const [rejection, setRejection] = useState<{ reason: string; note: string } | null>(null);
  const [loggingRejection, setLoggingRejection] = useState(false);
  const { data: settlementTypes = [] } = useQuery({
    queryKey: ["settlement-types-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settlement_types")
        .select("id, title")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    // 30s, down from 10 minutes. The owner activates and deactivates settlement types as the
    // business changes; at 10 minutes a salesperson with the page already open kept offering a
    // type that had just been switched off -- the RPC then refused the quote, so the first sign
    // of the change was a failed save. 30s matches the product picker and costs one small query.
    staleTime: 30_000,
  });

  // Item 203 — active visitors for the picker. Optional: quotes issued before
  // visitors existed have none, and a walk-in may genuinely have none.
  const { data: visitors = [] } = useQuery({
    queryKey: ["visitors-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visitors")
        .select("id, full_name, code")
        .eq("is_active", true)
        .order("sort_order")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        full_name: string;
        code: string | null;
      }>;
    },
    staleTime: 10 * 60_000,
  });

  // Requirement 223 — predict the mandatory services for the products in the
  // cart so the obligation is visible before the proforma is saved.
  const predictedServices = usePredictedLineServices(
    items.map((i) => i.product_id).filter((v): v is string => Boolean(v)),
  );

  const totals = useMemo(() => computeTotals(items), [items]);

  // MONEY-SAFETY: keep the customer link only while the name and phone still
  // match the picked customer. Compare on normalized values (trim name, strip
  // non-digits from phone) so harmless reformatting does not drop a correct
  // link, but any real divergence clears the id — a stale id must never attach
  // a payment to the wrong customer. Re-matching the fields restores the link.
  const linkedCustomerId = useMemo(() => {
    if (!selectedCustomer) return null;
    if (FEATURE_QUOTE_CUSTOMER_PICKER) {
      // THE LINK IS THE ID. It survives every later edit to the customer file, because the name
      // and phone stored on a quote are a SNAPSHOT of the moment it was written — not a live
      // mirror of the record. The server agrees: create_sales_quote_with_items decides ownership
      // from p_customer_id alone and never compares the passed name or phone to customers.name or
      // customers.phone. Only the explicit detach below can break the link.
      return guestOverride ? null : selectedCustomer.id;
    }
    const nameMatches = selectedCustomer.name.trim() === customerName.trim();
    const phoneMatches =
      selectedCustomer.phone.replace(/\D/g, "") === customerPhone.replace(/\D/g, "");
    return nameMatches && phoneMatches ? selectedCustomer.id : null;
  }, [selectedCustomer, customerName, customerPhone, guestOverride]);

  // Step 2 — a picked customer with no phone on file cannot be quoted: the RPC requires a
  // non-empty phone. 51 of 86 active customers are in that state, so this is the common case,
  // not an edge one. The remedy belongs in the customer FILE, never in the quote's snapshot.
  const pickedCustomerHasNoPhone = Boolean(
    FEATURE_QUOTE_CUSTOMER_PICKER &&
    selectedCustomer &&
    !guestOverride &&
    !selectedCustomer.phone.trim(),
  );

  // While a customer is linked, the identity fields mirror the file and must not be typed over.
  // Detaching unlocks them, which is exactly what «ثبت به‌عنوان مهمان» means.
  const identityLocked = Boolean(
    FEATURE_QUOTE_CUSTOMER_PICKER && selectedCustomer && !guestOverride,
  );

  // Writes the phone to the CUSTOMER RECORD, refusing a number another customer already holds.
  // The quote's own snapshot is refreshed from the record afterwards, never edited directly.
  const addPhoneToCustomer = useMutation({
    mutationFn: async (phone: string) => {
      const trimmed = phone.trim();
      if (!/^[0-9+\-\s]{4,}$/.test(trimmed)) throw new Error("شماره تماس معتبر نیست.");
      if (!selectedCustomer) throw new Error("مشتری انتخاب نشده است.");
      const digits = trimmed.replace(/\D/g, "");
      const { data: clash, error: clashError } = await supabase
        .from("customers")
        .select("id, name")
        .neq("id", selectedCustomer.id)
        .ilike("phone", `%${digits.slice(-9)}%`)
        .limit(1);
      if (clashError) throw clashError;
      if ((clash ?? []).length > 0) {
        throw new Error("این شماره قبلاً برای مشتری دیگری ثبت شده است.");
      }
      const { error } = await supabase
        .from("customers")
        .update({ phone: trimmed })
        .eq("id", selectedCustomer.id);
      if (error) throw error;
      return trimmed;
    },
    onSuccess: (phone) => {
      setSelectedCustomer((prev) => (prev ? { ...prev, phone } : prev));
      setCustomerPhone(phone);
      setPhoneDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["sales-quote-customer-search"] });
      void queryClient.invalidateQueries({ queryKey: ["quote-credit-info"] });
      toast.success("شماره به پرونده مشتری اضافه شد.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Items 197/198 — the customer's live credit. Guests have no credit file, so
  // there is nothing to fetch and nothing to enforce.
  const { data: creditInfo, isFetching: creditInfoLoading } = useQuery({
    enabled: !!linkedCustomerId,
    queryKey: ["quote-credit-info", linkedCustomerId],
    staleTime: 30_000,
    queryFn: async () => {
      // OG-80. Reclaim abandoned reservations BEFORE reading the ceiling, so the number shown
      // here is current. This is the right place for it: it is exactly where a stale hold would
      // mislead someone, and it is a moment the user already expects to wait. The dashboard was
      // rejected because it would charge every user for a cost only this page needs, and the
      // credit page because it may go days without being opened.
      //
      // A FAILURE HERE MUST NOT STOP A SALE. An unreleased ceiling is bad; being unable to write
      // a quote is worse. So this is deliberately fire-and-forget: the error is logged and the
      // credit read continues with whatever the ceiling currently says.
      //
      // Bounded by construction — `expire_stale_credit_holds` releases at most `p_limit` holds
      // per call, oldest first, and a released hold stops matching, so repeated visits drain a
      // backlog instead of re-walking it.
      try {
        const { error: sweepError } = await supabase.rpc("expire_stale_credit_holds", {
          p_days: 10,
          p_limit: 50,
        } as never);
        if (sweepError) {
          console.warn("[credit] stale-hold sweep failed; continuing", sweepError.message);
        }
      } catch (sweepThrow) {
        console.warn("[credit] stale-hold sweep threw; continuing", sweepThrow);
      }

      const { data, error } = await supabase.rpc("get_customer_dynamic_credit", {
        p_customer_id: linkedCustomerId as string,
      } as never);
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as {
        available_credit?: number;
        has_allocation?: boolean;
        has_overdue?: boolean;
        overdue_since?: string | null;
        binding_constraint?: string | null;
      } | null;
      return {
        availableCredit: Number(row?.available_credit ?? 0),
        hasAllocation: Boolean(row?.has_allocation),
        hasOverdue: Boolean(row?.has_overdue) || row?.binding_constraint === "overdue",
        overdueSince: row?.overdue_since ?? null,
        bindingConstraint: row?.binding_constraint ?? null,
      };
    },
  });

  // Item 212 — ordinary creation is blocked when the customer is overdue,
  // has no usable credit file, or the quote exceeds the usable credit. The
  // previous deposit route remains visible for context but it is no longer a
  // silent bypass; the salesperson must choose an explicit exception route.
  const creditShortfall = Boolean(
    linkedCustomerId &&
    creditInfo?.hasAllocation &&
    creditInfo.availableCredit < totals.final_amount,
  );
  const creditShortage = Math.max(totals.final_amount - (creditInfo?.availableCredit ?? 0), 0);

  // Reset one-shot exception confirmations whenever the business payload changes.
  useEffect(() => {
    setQuoteException(null);
  }, [items, linkedCustomerId, totals.final_amount]);

  const debouncedCustomerSearch = useDebounce(customerSearch, 350);
  const customerSearchTerm = debouncedCustomerSearch.trim();

  const customersQuery = useQuery({
    enabled: customerSearchTerm.length >= 2,
    queryKey: ["sales-quote-customer-search", customerSearchTerm],
    queryFn: async () => {
      const safe = customerSearchTerm.replace(/[%_]/g, "");
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone")
        .or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`)
        .order("name", { ascending: true })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; phone: string | null }>;
    },
    staleTime: 30_000,
  });

  const selectCustomer = (customer: { id: string; name: string; phone: string | null }) => {
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone ?? "");
    setSelectedCustomer({ id: customer.id, name: customer.name, phone: customer.phone ?? "" });
    setCustomerSearch("");
    // Picking a customer is itself a reconnect; a detach from a previous pick must not linger.
    setGuestOverride(false);
    setGuestCommitmentAccepted(false);
    setQuoteException(null);
  };

  // sale price types (cached)
  const { data: priceTypes = [] } = useQuery({
    queryKey: ["sale-price-types-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_price_types")
        .select("id, code, title")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 10 * 60_000,
  });

  // ----- product picker -----
  const [pickerOpen, setPickerOpen] = useState(false);

  const addItem = (it: DraftQuoteItem) => setItems((prev) => [...prev, it]);
  const updateItem = (key: string, patch: Partial<DraftQuoteItem>) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  const removeItem = (key: string) => setItems((prev) => prev.filter((it) => it.key !== key));

  const saveMutation = useMutation({
    mutationFn: async (
      overrideException?: {
        type: QuoteExceptionType;
        minutes?: number | null;
        amount?: number | null;
        text: string;
      } | null,
    ) => {
      const activeException = overrideException ?? quoteException;
      if (!user) throw new Error("کاربر معتبر نیست.");
      const errs = validateQuote(
        {
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_note: customerNote,
          expires_at: expiresAt || null,
        },
        items,
      );
      if (errs.length > 0) {
        // Every failing field, not just the first. The user is shown errs[0]; the log keeps the
        // whole set, because "which field blocks people most" is unanswerable from one of them.
        recordRefusal("client_validation", errs.map((e) => e.field).join(","));
        throw new Error(errs[0].message);
      }
      if (!settlementTypeId) {
        recordRefusal("client_validation", "settlement_type_missing");
        throw new Error("نوع تسویه را انتخاب کنید.");
      }

      const itemsPayload = items.map((it) => ({
        product_id: it.product_id,
        free_item_name: it.free_item_name,
        sku_snapshot: it.sku_snapshot,
        title_snapshot: it.title_snapshot,
        sale_price_type_id: it.sale_price_type_id,
        quantity: it.quantity,
        unit_price: it.unit_price,
        discount_amount: it.discount_amount,
        line_total: lineTotal(it),
        source: it.source,
        // D8-8 (275) — null means "fall back to the document warehouse", which
        // is what every line did before line-level selection existed.
        warehouse_id: it.warehouse_id ?? null,
      }));

      // Atomic RPC: creates quote + items + audit in a single DB transaction.
      const { data, error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>
      )("create_sales_quote_with_items", {
        p_customer_name: customerName.trim(),
        p_customer_phone: customerPhone.trim(),
        p_customer_note: customerNote.trim() || null,
        p_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        p_subtotal_amount: totals.subtotal_amount,
        p_discount_amount: totals.discount_amount,
        p_final_amount: totals.final_amount,
        p_items: itemsPayload,
        p_settlement_type_id: settlementTypeId,
        // Null unless the fields still match the picked customer (money-safety).
        p_customer_id: linkedCustomerId,
        p_below_list_ack: belowListAck,
        p_deposit_amount: null,
        p_commitment_confirmed: false,
        p_visitor_id: visitorId || null,
        p_warehouse_id: warehouseId,
        p_quote_exception_type: activeException?.type ?? null,
        p_quote_exception_minutes: activeException?.minutes ?? null,
        p_quote_exception_amount: activeException?.amount ?? null,
        p_quote_exception_text: activeException?.text ?? null,
      });
      if (error) throw new Error(error.message);
      const result = data as { id: string; quote_number: string } | null;
      if (!result?.id) throw new Error("پاسخ نامعتبر از سرور.");

      return result;
    },
    onSuccess: (quote) => {
      // 1-ب — an independent audit row for the guest path. The RPC already writes its own
      // 'sales_quote_items_added' row, but that one records what the SERVER decided; this one
      // records what the SALESPERSON accepted, which is a different claim and the only evidence
      // that a commitment was made at all.
      //
      // NO IDENTIFYING DATA. No name, phone, address or national id — the fields below are the
      // actor, the document, the reason, the template fingerprint and the time. (The quote's own
      // INSERT trigger does write customer_name and customer_phone; that is pre-existing
      // behaviour recorded in docs/design/audit-logs-pii-known-debt.md, not something this row
      // adds to.)
      //
      // Fire-and-forget ON PURPOSE: a failed audit write must not fail a quote that the database
      // has already committed. The trade-off is stated in the release note — when this insert
      // fails, the evidence of acceptance falls back to the stored exception text plus the
      // disabled-button invariant, and the failure is surfaced at error severity rather than
      // swallowed.
      if (guestCommitmentAccepted && user?.id) {
        void supabase
          .from("audit_logs")
          .insert({
            actor_id: user.id,
            entity_type: "sales_quotes",
            entity_id: quote.id,
            action: "sales_quote_guest_no_link",
            diff: {
              commitment_accepted: true,
              commitment_template: "ACCOUNTING_APPROVAL_TEXT",
              commitment_template_fingerprint: commitmentFingerprint(guestCommitmentText),
              exception_type: "guest_no_link",
              reason: "guest_no_link",
              actor_roles: roles,
              accepted_at: new Date().toISOString(),
            },
          })
          .then(({ error }) => {
            if (error) {
              console.error(
                "[audit] guest_no_link commitment row failed for quote %s: %s",
                quote.id,
                error.message,
              );
            }
          });
      }
      toast.success(`پیش‌فاکتور ${quote.quote_number} با موفقیت ثبت شد.`, {
        description: "برای ارسال پیش‌فاکتور می‌توانید از دکمه «ارسال پیش‌فاکتور» استفاده کنید.",
      });
      navigate({ to: "/sales/quotes" });
    },
    // Item 152 — a refused registration must leave a trace the salesperson can
    // read later, with a one-line reason they can annotate. Instead of a toast
    // that disappears, open the rejection dialog.
    onError: (e: unknown) => {
      const reason = e instanceof Error ? e.message : "خطا در ثبت پیش‌فاکتور.";
      toast.error(reason);
      // The server's Persian sentence is all supabase-js hands back — the SQLSTATE is dropped
      // by the client library — so this code is a coarse bucket, not the server's own code.
      recordRefusal("server_rpc", reason.slice(0, 60));
      setRejection({ reason, note: "" });
    },
  });

  const recordRefusal = (stage: RefusalStage, code: string) =>
    logQuoteRefusal({
      attemptId: refusalAttemptId,
      stage,
      code,
      actorId: user?.id ?? null,
      roles,
      linked: !!linkedCustomerId,
      customerHasPhone: !!selectedCustomer?.phone,
    });

  const findCreditBlocker = (): QuoteBlockReason | null => {
    if (totals.final_amount <= 0) return null;
    if (linkedCustomerId && creditInfoLoading) {
      return {
        kind: "no_credit",
        finalAmount: totals.final_amount,
        detail: "اعتبار مشتری هنوز از سرور دریافت نشده است.",
      };
    }
    if (creditInfo?.hasOverdue) {
      return {
        kind: "overdue",
        availableCredit: creditInfo.availableCredit,
        finalAmount: totals.final_amount,
        overdueSince: creditInfo.overdueSince,
      };
    }
    if (!linkedCustomerId) {
      // Split out of "no_credit" so it can carry its own reason. The branch above and the one
      // below still return "no_credit" with the same wording and the same exception type — only
      // this one changes, because only this one is a quote with no customer file.
      return {
        kind: "guest_no_link",
        finalAmount: totals.final_amount,
        commitmentText: guestCommitmentText,
        requiresCommitment: guestCommitmentRequired,
      };
    }
    if (!creditInfo?.hasAllocation || creditInfo.availableCredit <= 0) {
      return {
        kind: "no_credit",
        finalAmount: totals.final_amount,
        detail: "برای این مشتری اعتبار قابل استفاده یا تخصیص سرمایه فعال ثبت نشده است.",
      };
    }
    if (creditInfo.availableCredit < totals.final_amount) {
      return {
        kind: "credit_shortfall",
        availableCredit: creditInfo.availableCredit,
        finalAmount: totals.final_amount,
        shortage: Math.max(totals.final_amount - creditInfo.availableCredit, 0),
      };
    }
    return null;
  };

  const exceptionMatchesBlocker = (blocker: QuoteBlockReason | null) => {
    if (!blocker) return true;
    if (blocker.kind === "stock") return false;
    if (blocker.kind === "overdue") {
      return quoteException?.type === "overdue_salesperson_commitment";
    }
    if (blocker.kind === "credit_shortfall") {
      return quoteException?.type === "credit_shortfall_salesperson_commitment";
    }
    if (blocker.kind === "guest_no_link") return quoteException?.type === "guest_no_link";
    if (blocker.kind === "no_credit") return quoteException?.type === "accounting_approval";
    return false;
  };

  const handleSubmit = async () => {
    const creditBlocker = findCreditBlocker();
    if (!exceptionMatchesBlocker(creditBlocker)) {
      // Logged BEFORE the dialog opens, on purpose. Most credit-wall refusals end with the
      // salesperson closing that dialog and walking away, so a log written on confirmation would
      // miss the majority of them — which is the whole reason pre-submit stages are recorded.
      recordRefusal("credit_gate", creditBlocker?.kind ?? "unknown");
      setBlockReason(creditBlocker);
      return;
    }
    saveMutation.mutate(null);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="پیش‌فاکتور جدید"
        description="ثبت پیش‌فاکتور داخلی فروش — این سند رسمی و مالیاتی نیست."
      />

      {/* header */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex-1 space-y-2">
              <Label htmlFor="existing_customer_search">انتخاب مشتری موجود</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="existing_customer_search"
                  data-testid="quote-customer-search"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="نام یا شماره تماس مشتری را جست‌وجو کنید..."
                  className="pr-9"
                />
              </div>
              {customerSearchTerm.length >= 2 &&
                (customersQuery.isLoading ? (
                  <div className="text-xs text-muted-foreground">در حال جست‌وجوی مشتری...</div>
                ) : (customersQuery.data ?? []).length === 0 ? (
                  <div className="text-xs text-muted-foreground">
                    مشتری‌ای با این جست‌وجو پیدا نشد.
                  </div>
                ) : (
                  <div className="max-h-52 overflow-y-auto rounded-md border border-border divide-y divide-border">
                    {(customersQuery.data ?? []).map((customer) => (
                      <button
                        key={customer.id}
                        data-testid={`quote-customer-result-${customer.id}`}
                        type="button"
                        onClick={() => selectCustomer(customer)}
                        className="flex w-full items-center justify-between gap-3 p-2 text-right hover:bg-muted/40"
                      >
                        <span className="font-medium">{customer.name}</span>
                        {customer.phone && (
                          <span className="text-xs text-muted-foreground" dir="ltr">
                            {customer.phone}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ))}
            </div>
            <div className="flex justify-end md:pt-7">
              <QuickAddCustomerDialog
                onCreated={(c) => {
                  setCustomerName(c.name);
                  setCustomerPhone(c.phone ?? "");
                  setSelectedCustomer({ id: c.id, name: c.name, phone: c.phone ?? "" });
                  setCustomerSearch("");
                }}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="customer_name">نام مشتری *</Label>
              <Input
                id="customer_name"
                data-testid="quote-customer-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                maxLength={200}
                readOnly={identityLocked}
                className={identityLocked ? "bg-muted/50" : undefined}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customer_phone">شماره تماس *</Label>
              <Input
                id="customer_phone"
                data-testid="quote-customer-phone"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                dir="ltr"
                placeholder="09xxxxxxxxx"
                readOnly={identityLocked}
                className={identityLocked ? "bg-muted/50" : undefined}
              />
            </div>
            {identityLocked && (
              <p className="text-[11px] text-muted-foreground md:col-span-2">
                نام و شماره از پرونده مشتری خوانده شده‌اند و روی سند قابل تایپ نیستند. برای اصلاح،
                پرونده مشتری را ویرایش کنید؛ سندهای قبلی تغییر نمی‌کنند.
              </p>
            )}
            {pickedCustomerHasNoPhone && (
              <div
                data-testid="quote-customer-no-phone"
                className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 md:col-span-2"
              >
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  این مشتری در پرونده‌اش شماره تماس ندارد و بدون شماره، ثبت پیش‌فاکتور ممکن نیست.
                  شماره را به پرونده مشتری اضافه کنید — نه فقط روی این سند.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  data-testid="quote-add-phone-open"
                  onClick={() => {
                    setPhoneDraft("");
                    setPhoneDialogOpen(true);
                  }}
                >
                  افزودن شماره به پرونده مشتری
                </Button>
              </div>
            )}
            <div className="md:col-span-2">
              <div className="flex flex-wrap items-center gap-2">
                {linkedCustomerId ? (
                  <Badge
                    variant="secondary"
                    data-testid="quote-link-badge-linked"
                    className="gap-1 text-[11px] font-normal"
                  >
                    <UserCheck className="h-3 w-3" /> متصل به مشتری ثبت‌شده
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    data-testid="quote-link-badge-guest"
                    className="gap-1 text-[11px] font-normal text-muted-foreground"
                  >
                    <UserPlus className="h-3 w-3" /> مشتری مهمان (بدون اتصال به پرونده)
                  </Badge>
                )}
                {/* Every role that can create a quote can also detach. Walk-in sales depends on it,
                    and the server already gates what happens next: a detached quote is accepted
                    only through the commitment path in QuoteCreationBlockDialog. The explicit
                    checkbox and the guest_no_link reason shipped in step 3; the acceptance sits below
                    this row, where it can gate the save button. */}
                {FEATURE_QUOTE_CUSTOMER_PICKER && selectedCustomer && !guestOverride && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    data-testid="quote-detach-open"
                    className="h-6 px-2 text-[11px] text-muted-foreground"
                    onClick={() => setConfirmDetachOpen(true)}
                  >
                    قطع اتصال / ثبت به‌عنوان مهمان
                  </Button>
                )}
                {FEATURE_QUOTE_CUSTOMER_PICKER && selectedCustomer && guestOverride && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    data-testid="quote-reattach"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => {
                      setGuestOverride(false);
                      setGuestCommitmentAccepted(false);
                      setQuoteException(null);
                      setCustomerName(selectedCustomer.name);
                      setCustomerPhone(selectedCustomer.phone);
                    }}
                  >
                    اتصال دوباره به پرونده
                  </Button>
                )}
              </div>
              {/* 1-ب — the acceptance. It gates the save button rather than living inside a
                    dialog, because a checkbox that only appears after you press save cannot be a
                    precondition for pressing it. Shown for every guest quote a salesperson makes,
                    however the quote got there: detached from a picked customer, or never linked
                    at all. Manager and admin do not see it and are not asked to accept. */}
              {FEATURE_QUOTE_CUSTOMER_PICKER &&
                !linkedCustomerId &&
                guestCommitmentRequired &&
                items.length > 0 && (
                  <div className="mt-2 space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
                    <div className="text-xs leading-6" data-testid="quote-guest-commitment-text">
                      {guestCommitmentText}
                    </div>
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="guest-commitment"
                        data-testid="quote-guest-commitment-check"
                        checked={guestCommitmentAccepted}
                        onCheckedChange={(v) => {
                          const accepted = v === true;
                          setGuestCommitmentAccepted(accepted);
                          // The tick IS the exception. Nothing else sets it for this path, and
                          // unticking withdraws it rather than leaving a stale acceptance behind.
                          setQuoteException(
                            accepted ? { type: "guest_no_link", text: guestCommitmentText } : null,
                          );
                        }}
                        className="mt-0.5"
                      />
                      <Label
                        htmlFor="guest-commitment"
                        className="cursor-pointer text-xs leading-relaxed"
                      >
                        متن بالا را خوانده‌ام و می‌پذیرم.
                      </Label>
                    </div>
                  </div>
                )}
            </div>
            <div className="space-y-1.5 md:col-span-1">
              <Label htmlFor="expires_at">تاریخ اعتبار</Label>
              <PersianDatePicker
                value={expiresAt || null}
                onChange={(v) => setExpiresAt(v ?? "")}
                placeholder="انتخاب تاریخ اعتبار"
              />
            </div>
            <div className="space-y-1.5 md:col-span-1">
              <Label htmlFor="settlement_type">نوع تسویه *</Label>
              <Select
                value={settlementTypeId}
                onValueChange={(v) => {
                  setSettlementTypeId(v);
                  if (items.some((it) => it.source === "product_price")) {
                    toast.info(
                      "با تغییر نوع تسویه، کف قیمت هر آیتم تغییر می‌کند؛ قیمت آیتم‌ها را بازبینی کنید.",
                    );
                  }
                }}
              >
                <SelectTrigger id="settlement_type" data-testid="quote-settlement-select">
                  <SelectValue placeholder="انتخاب نوع تسویه" />
                </SelectTrigger>
                <SelectContent>
                  {settlementTypes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Item 203 — visitor. Optional; hidden until at least one exists
                so the form does not grow an empty control for nothing. */}
            {visitors.length > 0 && (
              <div className="space-y-1.5 md:col-span-1">
                <Label htmlFor="visitor">ویزیتور</Label>
                <Select
                  value={visitorId || "__none"}
                  onValueChange={(v) => setVisitorId(v === "__none" ? "" : v)}
                >
                  <SelectTrigger id="visitor">
                    <SelectValue placeholder="انتخاب ویزیتور (اختیاری)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— بدون ویزیتور —</SelectItem>
                    {visitors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.full_name}
                        {v.code ? ` (${v.code})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* Item 178 — source warehouse. Hidden until warehouses exist. */}
            <div className="space-y-1.5 md:col-span-1">
              <WarehouseSelect
                label="انبار"
                value={warehouseId}
                onChange={setWarehouseId}
                triggerTestId="quote-warehouse-select"
                hint="هنگام قطعی‌کردن، کالا از این انبار کسر می‌شود. در مرحلهٔ قطعی هم قابل تغییر است."
              />
            </div>
            <div className="space-y-1.5 md:col-span-1">
              <Label htmlFor="customer_note">توضیحات مشتری</Label>
              <Textarea
                id="customer_note"
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
                maxLength={500}
                rows={2}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* items */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">آیتم‌ها</div>
            <Button size="sm" onClick={() => setPickerOpen(true)} data-testid="quote-add-item">
              <Plus className="ml-1 h-4 w-4" /> افزودن آیتم
            </Button>
          </div>

          {items.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              هنوز آیتمی اضافه نشده است.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 text-right font-medium">کالا</th>
                    <th className="p-2 text-right font-medium">منبع</th>
                    <th className="p-2 text-right font-medium">تعداد</th>
                    <th className="p-2 text-right font-medium">انبار</th>
                    <th className="p-2 text-right font-medium">قیمت واحد</th>
                    <th className="p-2 text-right font-medium">تخفیف</th>
                    <th className="p-2 text-right font-medium">جمع</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((it) => (
                    <tr key={it.key}>
                      <td className="p-2 align-top">
                        <div className="font-medium">{it.title_snapshot}</div>
                        {it.sku_snapshot && (
                          <div className="text-[11px] text-muted-foreground font-mono">
                            {it.sku_snapshot}
                          </div>
                        )}
                        {/* Requirement 223 — shown BEFORE saving so the
                            salesperson sees the obligation while quoting, not
                            as a surprise afterwards. The database attaches and
                            enforces it regardless of what is rendered here. */}
                        {(it.product_id ? (predictedServices.get(it.product_id) ?? []) : []).map(
                          (svc) => (
                            <MandatoryServiceBadge
                              key={svc.service_type_id}
                              className="mt-1"
                              text={svc.display_text}
                            />
                          ),
                        )}
                      </td>
                      <td className="p-2 align-top text-[11px] text-muted-foreground">
                        {it.source === "product_price"
                          ? "از قیمت محصول"
                          : it.source === "quick_price"
                            ? "محاسبه سریع"
                            : "آیتم آزاد"}
                      </td>
                      <td className="p-2 align-top">
                        <Input
                          type="number"
                          min={0}
                          className="w-24"
                          value={it.quantity}
                          onChange={(e) =>
                            updateItem(it.key, { quantity: Number(e.target.value) || 0 })
                          }
                        />
                      </td>
                      {/* D8-8 — line-level warehouse. Defaults to «انبار سند»
                          so the common single-warehouse proforma costs no extra
                          interaction; changing it is possible but not the
                          default interaction cost. */}
                      <td className="p-2 align-top">
                        <WarehouseSelect
                          value={it.warehouse_id ?? null}
                          onChange={(v) => updateItem(it.key, { warehouse_id: v })}
                          placeholder="انبار سند"
                          className="w-40"
                          hideLabel
                        />
                      </td>
                      <td className="p-2 align-top">
                        <Input
                          type="number"
                          min={0}
                          className="w-32"
                          value={it.unit_price}
                          // Items 194/196 — sales still cannot retype a product
                          // price at will, but acknowledging personal
                          // responsibility unlocks it for this quote.
                          disabled={
                            it.source === "product_price" && !canEditPriceFreely && !belowListAck
                          }
                          onChange={(e) =>
                            updateItem(it.key, { unit_price: Number(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td className="p-2 align-top">
                        <Input
                          type="number"
                          min={0}
                          className="w-28"
                          value={it.discount_amount}
                          onChange={(e) =>
                            updateItem(it.key, { discount_amount: Number(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td className="p-2 align-top font-medium">
                        {formatNumber(lineTotal(it))}{" "}
                        <span className="text-[11px] text-muted-foreground">تومان</span>
                      </td>
                      <td className="p-2 align-top">
                        <Button size="sm" variant="ghost" onClick={() => removeItem(it.key)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* totals + save */}
      <Card>
        <CardContent className="p-4 space-y-3">
          {/* Items 194/196 — the personal-responsibility override. */}
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
            <div className="flex items-start gap-2">
              <Checkbox
                id="below_list_ack"
                checked={belowListAck}
                onCheckedChange={(v) => {
                  // Ticking must go through the warning; unticking is free.
                  if (v === true) setBelowListDialogOpen(true);
                  else setBelowListAck(false);
                }}
                className="mt-0.5"
              />
              <Label
                htmlFor="below_list_ack"
                className="cursor-pointer text-xs leading-relaxed font-normal"
              >
                فروش زیر قیمت لیست — «با مسئولیت خودم»
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  قیمت بالاتر یا مساوی لیست آزاد است و این گزینه را لازم ندارد. فقط برای ثبت زیر کف
                  مجاز آن را بزنید.
                </span>
              </Label>
            </div>
          </div>

          {creditShortfall && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs leading-6">
              اعتبار قابل استفادهٔ این مشتری ({formatNumber(creditInfo?.availableCredit ?? 0)}{" "}
              تومان) کمتر از مبلغ این پیش‌فاکتور است. ثبت عادی انجام نمی‌شود. هنگام ذخیره، سیستم
              پیام توقف را نمایش می‌دهد و فقط با تعهد کارشناس فروش برای واریز کسری{" "}
              {formatNumber(creditShortage)} تومان تا پایان روز کاری اجازه ادامه می‌دهد.
            </div>
          )}

          <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-6">
                <span className="text-muted-foreground">جمع کل</span>
                <span>{formatNumber(totals.subtotal_amount)} تومان</span>
              </div>
              <div className="flex items-center justify-between gap-6">
                <span className="text-muted-foreground">مجموع تخفیف</span>
                <span>{formatNumber(totals.discount_amount)} تومان</span>
              </div>
              <div className="flex items-center justify-between gap-6 text-base font-semibold">
                <span>مبلغ نهایی</span>
                <span>{formatNumber(totals.final_amount)} تومان</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate({ to: "/sales/quotes" })}>
                انصراف
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  saveMutation.isPending ||
                  items.length === 0 ||
                  // 1-ب — a salesperson cannot save a quote with no customer file until the commitment
                  // above is ticked. Deliberately NOT gated on the amount: the credit blocker returns
                  // null for a zero total, so an amount gate would leave a worthless guest quote able
                  // to skip the commitment entirely.
                  (FEATURE_QUOTE_CUSTOMER_PICKER &&
                    !linkedCustomerId &&
                    guestCommitmentRequired &&
                    !guestCommitmentAccepted)
                }
                data-testid="quote-save"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="ml-1 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="ml-1 h-4 w-4" />
                )}
                ذخیره پیش‌نویس
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {pickerOpen && (
        <AddItemPanel
          priceTypes={priceTypes as Array<{ id: string; code: string; title: string }>}
          canEditPriceFreely={canEditPriceFreely}
          settlementTypeId={settlementTypeId}
          settlementTitle={settlementTypes.find((s) => s.id === settlementTypeId)?.title ?? null}
          onClose={() => setPickerOpen(false)}
          onAdd={(it) => {
            addItem(it);
            setPickerOpen(false);
          }}
        />
      )}

      {/* Items 194/196 — the warning that must be read before the override is
          armed. Wording is fixed by the requirement. */}
      {/* Step 1 — detaching is deliberate, confirmed, and reversible. */}
      <Dialog open={confirmDetachOpen} onOpenChange={setConfirmDetachOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ثبت به‌عنوان مشتری مهمان؟</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              با این کار، این پیش‌فاکتور به پرونده مشتری وصل نمی‌شود. اعتبار مالی مشتری بررسی
              نمی‌شود و سند در گزارش‌ها به‌عنوان «مهمان» شناخته می‌شود.
            </p>
            <p className="text-xs text-muted-foreground">
              نام و شماره پس از قطع اتصال قابل ویرایش می‌شوند و فقط روی همین سند ثبت می‌شوند. هر
              زمان می‌توانید دوباره به پرونده وصل کنید.
            </p>
            {guestCommitmentRequired && (
              <div
                className="rounded-md border bg-muted/20 p-2 text-[11px] leading-6"
                data-testid="quote-detach-commitment-preview"
              >
                {guestCommitmentText}
                <div className="mt-1 font-medium">
                  برای ثبت، باید همین متن را زیر فرم تأیید کنید.
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setConfirmDetachOpen(false)}>
              انصراف
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-testid="quote-detach-confirm"
              onClick={() => {
                setGuestOverride(true);
                setConfirmDetachOpen(false);
              }}
            >
              بله، مهمان ثبت شود
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Step 2 — the phone goes into the customer FILE, never only onto this quote. */}
      <Dialog open={phoneDialogOpen} onOpenChange={setPhoneDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>افزودن شماره به پرونده مشتری</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new_customer_phone">شماره تماس</Label>
            <Input
              id="new_customer_phone"
              data-testid="quote-add-phone-input"
              dir="ltr"
              placeholder="09xxxxxxxxx"
              value={phoneDraft}
              onChange={(e) => setPhoneDraft(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              این شماره در پرونده مشتری ذخیره می‌شود، نه فقط روی این سند. اگر شماره برای مشتری دیگری
              ثبت شده باشد، ذخیره نمی‌شود.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setPhoneDialogOpen(false)}>
              انصراف
            </Button>
            <Button
              type="button"
              data-testid="quote-add-phone-save"
              disabled={addPhoneToCustomer.isPending || !phoneDraft.trim()}
              onClick={() => addPhoneToCustomer.mutate(phoneDraft)}
            >
              ذخیره در پرونده مشتری
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={belowListDialogOpen} onOpenChange={setBelowListDialogOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              فروش زیر قیمت لیست
            </DialogTitle>
          </DialogHeader>
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm leading-7">
            از این گزینه فقط در صورتی که ۱۰۰٪ از مدیر مربوط تأییدیه گرفته‌اید استفاده نمایید؛ در غیر
            این صورت عواقب این تصمیم به عهدهٔ شخص صادرکنندهٔ پیش‌فاکتور است
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setBelowListAck(false);
                setBelowListDialogOpen(false);
              }}
            >
              انصراف
            </Button>
            <Button
              onClick={() => {
                setBelowListAck(true);
                setBelowListDialogOpen(false);
              }}
            >
              می‌پذیرم و ادامه می‌دهم
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item 152 — refusal dialog: shows why the quote was refused and lets the
          salesperson attach a one-line note before it is recorded. */}
      <Dialog
        open={rejection !== null}
        onOpenChange={(o) => {
          if (!o) setRejection(null);
        }}
      >
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              ثبت پیش‌فاکتور انجام نشد
            </DialogTitle>
            <DialogDescription>
              دلیل رد شدن در زیر آمده است. می‌توانید یک توضیح یک‌خطی اضافه کنید تا در «درخواست‌های
              رد شدهٔ من» ثبت شود و بعداً قابل پیگیری باشد.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm leading-6">
              {rejection?.reason}
            </div>
            <div className="space-y-1">
              <Label htmlFor="rejection_note">توضیح شما (اختیاری)</Label>
              <Textarea
                id="rejection_note"
                rows={2}
                value={rejection?.note ?? ""}
                onChange={(e) => setRejection((r) => (r ? { ...r, note: e.target.value } : r))}
                placeholder="مثلاً: مشتری اصرار داشت، با مدیر هماهنگ شود."
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => setRejection(null)} disabled={loggingRejection}>
              بستن بدون ثبت
            </Button>
            <Button
              disabled={loggingRejection}
              onClick={async () => {
                if (!rejection || !user?.id) return;
                setLoggingRejection(true);
                try {
                  const { error } = await supabase.from("audit_logs").insert({
                    actor_id: user.id,
                    entity_type: "sales_quote",
                    // audit_logs.entity_id is text NOT NULL. This sent null, so every «ثبت دلیل» since the
                    // feature shipped failed with 23502 and the table holds 0 such rows. The refused quote
                    // has no id, so the attempt id stands in — the same one the automatic rows carry, which
                    // is what links a note to the attempt it is about.
                    entity_id: refusalAttemptId,
                    action: "sales_quote_rejected",
                    diff: {
                      reason: rejection.reason,
                      note: rejection.note.trim() || null,
                      attempt_id: refusalAttemptId,
                      final_amount: totals.final_amount,
                    },
                  } as never);
                  if (error) throw error;
                  toast.success(
                    "دلیل رد شدن ثبت شد و در «درخواست‌های رد شدهٔ من» قابل مشاهده است.",
                  );
                  setRejection(null);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "ثبت دلیل ناموفق بود.");
                } finally {
                  setLoggingRejection(false);
                }
              }}
            >
              {loggingRejection && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              ثبت دلیل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <QuoteCreationBlockDialog
        reason={blockReason}
        onClose={() => setBlockReason(null)}
        onConfirmException={(exception) => {
          setQuoteException(exception);
          setBlockReason(null);
          saveMutation.mutate(exception);
        }}
      />
    </div>
  );
}

/* ============================================================
   Add-Item panel (modal-like card)
   ============================================================ */
function AddItemPanel(props: {
  priceTypes: Array<{ id: string; code: string; title: string }>;
  canEditPriceFreely: boolean;
  // The settlement term chosen on the main form. The unit price of a product
  // line is read for exactly this term, because that is the term the server
  // measures the price floor against.
  settlementTypeId: string;
  settlementTitle: string | null;
  onClose: () => void;
  onAdd: (it: DraftQuoteItem) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
      <Card className="m-4 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">افزودن آیتم به پیش‌فاکتور</h3>
            <Button variant="ghost" size="sm" onClick={props.onClose}>
              بستن
            </Button>
          </div>
          {/*
            The "آیتم آزاد" and "از محاسبه سریع" tabs are gone. Both let a line be typed in
            with no product_id, which made it invisible to stock, pricing and the catalogue --
            the same hole under two labels, since they shared this one component and differed
            only by a hint string. Only accounting creates products now. The rule is enforced
            in create_sales_quote_with_items, not here: removing the tabs alone would have been
            frontend-only authorisation.
          */}
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <Package className="h-4 w-4 shrink-0" />
            <span>
              فقط کالاهای ثبت‌شده در سیستم قابل انتخاب‌اند. اگر کالایی را پیدا نکردید، برای تعریفش
              با حسابداری تماس بگیرید.
            </span>
          </div>
          <ProductTab
            priceTypes={props.priceTypes}
            settlementTypeId={props.settlementTypeId}
            settlementTitle={props.settlementTitle}
            onAdd={props.onAdd}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/* ---- Product tab ---- */

// Why a lookup product was not priced decides what the user is told, so the
// outcomes stay distinct instead of collapsing into one "no price" message.
type SettlementPriceLookup =
  | { status: "match"; price: number }
  | { status: "baseline_fallback"; price: number }
  | { status: "no_price" }
  | { status: "product_not_found" };

function ProductTab(props: {
  priceTypes: Array<{ id: string; code: string; title: string }>;
  settlementTypeId: string;
  settlementTitle: string | null;
  onAdd: (it: DraftQuoteItem) => void;
}) {
  const [search, setSearch] = useState("");
  const dSearch = useDebounce(search, 350);
  const [selected, setSelected] = useState<{ id: string; name: string; sku: string | null } | null>(
    null,
  );
  const [salePriceTypeId, setSalePriceTypeId] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);

  const term = dSearch.trim();
  const productsQuery = useQuery({
    enabled: term.length >= 2 && !selected,
    queryKey: ["quote-product-search", term],
    queryFn: async () => {
      const safe = term.replace(/[%_]/g, "");
      const { data, error } = await supabase.rpc("search_product_ids", {
        p_term: safe,
        p_limit: 20,
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        name: string;
        sku: string | null;
        barcode: string | null;
        stock_status: "available" | "unavailable" | "limited" | "unknown";
        is_active: boolean;
      }>;
    },
    staleTime: 30_000,
  });

  const productIds = useMemo(
    () => (productsQuery.data ?? []).map((p: { id: string }) => p.id),
    [productsQuery.data],
  );
  const { thumbnailFor } = useProductThumbnails(productIds);

  // The unit price must come from the same (product × sale price type ×
  // settlement term) triple the server measures its floor against — see
  // create_sales_quote_with_items. product_computed_prices_public cannot serve
  // that: it is filtered to settlement_type_id IS NULL, so it only ever returns
  // the baseline price. The base table is closed to the sales role
  // (pcp_read_privileged), so the settlement-aware path open to sales is the
  // SECURITY DEFINER RPC get_sales_search_products, whose `prices` array
  // carries one row per (sale price type × settlement term).
  const settlementPriceQuery = useQuery({
    enabled: !!selected && !!salePriceTypeId,
    queryKey: [
      "quote-item-settlement-price",
      selected?.id ?? null,
      salePriceTypeId,
      props.settlementTypeId,
    ],
    staleTime: 30_000,
    queryFn: async (): Promise<SettlementPriceLookup> => {
      if (!selected) return { status: "product_not_found" };
      // The RPC matches on name/SKU/model/brand/… and caps p_limit at 50, so it
      // can legitimately fail to return a product the id-based search found.
      // That is a different situation from "this product has no price", and the
      // two must not share a message.
      const { data, error } = await supabase.rpc("get_sales_search_products", {
        p_search: selected.sku ?? selected.name,
        p_limit: 50,
      });
      if (error) throw error;
      const row = ((data ?? []) as Array<{ id: string; prices: unknown }>).find(
        (r) => r.id === selected.id,
      );
      if (!row) return { status: "product_not_found" };

      const entries = (Array.isArray(row.prices) ? row.prices : []) as Array<{
        sale_price_type_id: string | null;
        settlement_type_id: string | null;
        current_price: number | string | null;
      }>;
      // "" on the main form means no settlement term, which the server treats as
      // the base term (settlement_type_id IS NOT DISTINCT FROM NULL).
      const wanted = props.settlementTypeId || null;
      const priceOf = (settlementId: string | null) => {
        const hit = entries.find(
          (e) =>
            e.sale_price_type_id === salePriceTypeId &&
            e.settlement_type_id === settlementId &&
            e.current_price != null,
        );
        const value = Number(hit?.current_price ?? 0);
        return value > 0 ? value : null;
      };

      const exact = priceOf(wanted);
      if (exact != null) return { status: "match", price: exact };
      if (wanted != null) {
        // No settlement-specific price exists. The server's floor lookup finds
        // nothing either, so it applies no floor here; falling back to the base
        // price neither weakens nor invents a limit, but the user is told.
        const baseline = priceOf(null);
        if (baseline != null) return { status: "baseline_fallback", price: baseline };
      }
      return { status: "no_price" };
    },
  });

  // Apply the looked-up price. Clearing to 0 while the lookup is pending keeps a
  // previous product's price from being submitted against a new selection, and
  // leaves canSubmit false until a real price arrives. A manual edit is not
  // overwritten: the query key does not change when the user types.
  const settlementPrice = settlementPriceQuery.data;
  useEffect(() => {
    if (!selected || !salePriceTypeId || !settlementPrice) {
      setUnitPrice(0);
      return;
    }
    setUnitPrice(
      settlementPrice.status === "match" || settlementPrice.status === "baseline_fallback"
        ? settlementPrice.price
        : 0,
    );
  }, [selected, salePriceTypeId, settlementPrice]);

  const canSubmit = !!selected && !!salePriceTypeId && quantity > 0 && unitPrice > 0;
  const selectedPriceTypeTitle =
    props.priceTypes.find((t) => t.id === salePriceTypeId)?.title ?? "—";

  return (
    <div className="space-y-3">
      {!selected ? (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              data-testid="quote-product-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجوی نام محصول، SKU یا بارکد (حداقل ۲ حرف)"
              className="pr-9"
            />
          </div>
          {term.length >= 2 &&
            (productsQuery.isLoading ? (
              <div className="text-xs text-muted-foreground">در حال جستجو...</div>
            ) : (productsQuery.data ?? []).length === 0 ? (
              <div className="text-xs text-muted-foreground">محصولی پیدا نشد.</div>
            ) : (
              <div className="max-h-80 overflow-y-auto rounded-md border border-border divide-y divide-border">
                {(productsQuery.data ?? []).map(
                  (p: {
                    id: string;
                    name: string;
                    sku: string | null;
                    barcode?: string | null;
                    stock_status: "available" | "unavailable" | "limited" | "unknown";
                    labels?: Array<{
                      label:
                        | {
                            id: string;
                            title: string;
                            color: string | null;
                            visibility?: string | null;
                          }
                        | Array<{
                            id: string;
                            title: string;
                            color: string | null;
                            visibility?: string | null;
                          }>
                        | null;
                    }>;
                  }) => {
                    const thumb = thumbnailFor(p.id);
                    const labelList = (p.labels ?? [])
                      .map((row) => (Array.isArray(row.label) ? row.label[0] : row.label))
                      .filter(
                        (
                          l,
                        ): l is {
                          id: string;
                          title: string;
                          color: string | null;
                          visibility?: string | null;
                        } => !!l,
                      );
                    return (
                      <div key={p.id} className="p-2 space-y-2 hover:bg-muted/40">
                        <button
                          data-testid={`quote-product-result-${p.id}`}
                          type="button"
                          onClick={() => setSelected({ id: p.id, name: p.name, sku: p.sku })}
                          className="flex w-full items-start justify-between gap-2 text-right"
                        >
                          <div className="flex min-w-0 items-start gap-2">
                            {thumb ? (
                              <img
                                src={thumb}
                                alt={p.name}
                                loading="lazy"
                                className="h-10 w-10 flex-shrink-0 rounded-md border border-border object-cover bg-muted"
                              />
                            ) : (
                              <div className="h-10 w-10 flex-shrink-0 rounded-md border border-dashed border-border bg-muted/40" />
                            )}
                            <div className="min-w-0">
                              <div className="font-bold truncate">{p.name}</div>
                              <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                <span
                                  className="text-[11px] text-muted-foreground font-mono"
                                  dir="ltr"
                                >
                                  {p.sku ?? "—"}
                                </span>
                                {p.barcode && (
                                  <span
                                    className="text-[11px] text-muted-foreground font-mono"
                                    dir="ltr"
                                    title="بارکد"
                                  >
                                    {p.barcode}
                                  </span>
                                )}
                                <Badge
                                  variant={STOCK_STATUS_VARIANTS[p.stock_status]}
                                  className="text-[10px] py-0 px-1.5"
                                >
                                  {STOCK_STATUS_LABELS[p.stock_status]}
                                </Badge>
                              </div>
                              {labelList.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {labelList.slice(0, 4).map((l) => (
                                    <span
                                      key={l.id}
                                      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]"
                                      style={
                                        l.color
                                          ? { borderColor: l.color, color: l.color }
                                          : undefined
                                      }
                                    >
                                      <span
                                        className="inline-block h-2 w-2 rounded-full"
                                        style={l.color ? { backgroundColor: l.color } : undefined}
                                      />
                                      {l.title}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      </div>
                    );
                  },
                )}
              </div>
            ))}
        </>
      ) : (
        <>
          <div className="rounded-md border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium truncate">{selected.name}</div>
                <div className="text-[11px] text-muted-foreground font-mono">
                  {selected.sku ?? "—"}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelected(null);
                  setSalePriceTypeId("");
                  setUnitPrice(0);
                }}
              >
                تغییر محصول
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>نوع قیمت فروش</Label>
              <Select value={salePriceTypeId} onValueChange={setSalePriceTypeId}>
                <SelectTrigger data-testid="quote-item-price-type">
                  <SelectValue placeholder="انتخاب نوع قیمت" />
                </SelectTrigger>
                <SelectContent>
                  {props.priceTypes.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>تعداد</Label>
              <Input
                data-testid="quote-item-quantity"
                type="number"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>قیمت واحد (تومان)</Label>
              {/* The price chips that used to sit above carried this context;
                  without them the user cannot otherwise tell which settlement
                  term the auto-filled number belongs to. */}
              <span className="block text-[11px] text-muted-foreground">
                بر اساس تسویهٔ «{props.settlementTitle ?? "پایه"}»
              </span>
              <Input
                data-testid="quote-item-unit-price"
                type="number"
                min={0}
                value={unitPrice}
                onChange={(e) => setUnitPrice(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>تخفیف خط (تومان)</Label>
              <Input
                type="number"
                min={0}
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value) || 0)}
              />
            </div>
          </div>
          {salePriceTypeId && settlementPriceQuery.isFetching && (
            <div className="text-xs text-muted-foreground">در حال دریافت قیمت...</div>
          )}
          {salePriceTypeId && !settlementPriceQuery.isFetching && settlementPriceQuery.isError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              خطا در دریافت قیمت فروش.
            </div>
          )}
          {!settlementPriceQuery.isFetching && settlementPrice?.status === "product_not_found" && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs leading-6 text-destructive">
              قیمت این محصول دریافت نشد: محصول در نتایج سرویس قیمت نبود (این سرویس حداکثر ۵۰ ردیف
              برمی‌گرداند و بر اساس بارکد جست‌وجو نمی‌کند). این به معنی نبودِ قیمت نیست — با نام یا
              SKU دقیق‌تر جست‌وجو کنید.
            </div>
          )}
          {!settlementPriceQuery.isFetching && settlementPrice?.status === "no_price" && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs leading-6 text-destructive">
              برای این محصول با نوع قیمت «{selectedPriceTypeTitle}» و تسویهٔ «
              {props.settlementTitle ?? "پایه"}» قیمتی ثبت نشده است.
            </div>
          )}
          {!settlementPriceQuery.isFetching && settlementPrice?.status === "baseline_fallback" && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs leading-6">
              برای تسویهٔ «{props.settlementTitle}» قیمت اختصاصی ثبت نشده است؛ قیمت پایه نمایش داده
              شد.
            </div>
          )}
          <div className="flex justify-end">
            <Button
              data-testid="quote-item-add-confirm"
              disabled={!canSubmit}
              onClick={() => {
                if (!selected || !salePriceTypeId) return;
                props.onAdd({
                  key: safeRandomUUID(),
                  source: "product_price",
                  product_id: selected.id,
                  free_item_name: null,
                  sku_snapshot: selected.sku,
                  title_snapshot: selected.name,
                  sale_price_type_id: salePriceTypeId,
                  quantity,
                  unit_price: unitPrice,
                  discount_amount: discount,
                });
              }}
            >
              افزودن به پیش‌فاکتور
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/* ---- Free / Quick item tab ---- */
