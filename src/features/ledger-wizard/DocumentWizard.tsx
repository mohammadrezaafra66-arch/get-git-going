import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stepper } from "@/components/ui/stepper";
import { Textarea } from "@/components/ui/textarea";
import { PersianDatePicker } from "@/components/common/PersianDatePicker";

import { ChoiceButton } from "./ChoiceButton";
import { formatDateFa } from "@/lib/i18n/formatters";
import { MissingAsanMessage } from "./MissingAsanMessage";
import { ProformaList } from "./ProformaList";
import { lookupParty } from "./lookup";
import { listBankAccounts, listHeldCheques, listOpenProformas } from "./queries";
import { callLedgerRpc } from "./rpc";
import {
  ReceiptDocumentPicker,
  removeStagedAttachments,
  uploadStagedAttachments,
  type StagedAttachment,
} from "@/components/accounting/PaymentReceiptDocuments";
import { extractReceiptFromBytes } from "@/lib/receipt-ocr-bytes.functions";
import type { ReceiptExtractionResult } from "@/lib/accounting/receipt-extraction";
import { supabase } from "@/integrations/supabase/client";
import type {
  ChequeKind,
  DocBranch,
  LookupState,
  MoneyChannel,
  PartyHit,
  PartyKind,
  ProformaAllocation,
} from "./types";

function tehranDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());
}

function tehranTime(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tehran",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

const BRANCH_STEPS: Record<DocBranch, string[]> = {
  receipt: ["نوع سند", "نحوهٔ دریافت", "پرداخت‌کننده", "جزئیات", "بازبینی"],
  payment: ["نوع سند", "نحوهٔ پرداخت", "گیرنده", "جزئیات", "بازبینی"],
  dual: ["نوع سند", "فیش", "پرداخت‌کننده", "ذینفع", "بازبینی"],
};

const KIND_LABEL: Record<string, string> = {
  customer: "مشتری",
  supplier: "تأمین‌کننده",
  external_party: "طرف حساب",
};

const emptyLookup: LookupState = {
  status: "idle",
  query: "",
  party: null,
  missingName: null,
  message: null,
};

/**
 * `initialBranch` lets a caller open the wizard already on one branch -- the finance hub
 * passes it from `?branch=`. Absent, the wizard behaves exactly as before: step 1 asks.
 */
export function DocumentWizard({ initialBranch }: { initialBranch?: DocBranch } = {}) {
  const navigate = useNavigate();
  const [step, setStep] = useState(initialBranch ? 2 : 1);
  const [branch, setBranch] = useState<DocBranch | null>(initialBranch ?? null);
  const [channel, setChannel] = useState<MoneyChannel | null>(null);
  const [chequeKind, setChequeKind] = useState<ChequeKind | null>(null);
  const [payerLookup, setPayerLookup] = useState<LookupState>(emptyLookup);
  const [payeeLookup, setPayeeLookup] = useState<LookupState>(emptyLookup);
  const [beneficiaryLookup, setBeneficiaryLookup] = useState<LookupState>(emptyLookup);
  const [amountText, setAmountText] = useState("");
  const [date, setDate] = useState(tehranDate);
  const [time, setTime] = useState(tehranTime);
  const [tracking, setTracking] = useState("");
  const [sourceBank, setSourceBank] = useState("");
  const [destinationBank, setDestinationBank] = useState("");
  const [accountId, setAccountId] = useState("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDue, setChequeDue] = useState<string | null>(null);
  const [chequeBank, setChequeBank] = useState("");
  const [endorsedId, setEndorsedId] = useState("");
  const [description, setDescription] = useState("");
  const [transferrerName, setTransferrerName] = useState("");
  const [transferrerAccount, setTransferrerAccount] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientAccount, setRecipientAccount] = useState("");
  const [allocations, setAllocations] = useState<ProformaAllocation[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // M1 — attachments are staged in the BROWSER until submit. No row exists for them until the
  // create RPC makes the document and the attachment together, which is what makes an orphaned
  // attachment row impossible rather than merely unlikely.
  const [files, setFiles] = useState<File[]>([]);
  const [ocrByFile, setOcrByFile] = useState<Map<File, unknown>>(new Map());
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrNote, setOcrNote] = useState<string | null>(null);
  // OG-85 — the amount the model read is a SUGGESTION, never a value. It miscounts the
  // run of zeros by a different number of digits each time, so writing it straight into
  // the field produced a silently wrong document. It is held here until the accountant
  // compares it with the paper and accepts it, or types their own number.
  const [amountSuggestion, setAmountSuggestion] = useState<number | null>(null);
  const [amountSuggestionWarning, setAmountSuggestionWarning] = useState<string | null>(null);

  const { data: accounts = [] } = useQuery({
    queryKey: ["ledger-wizard-accounts"],
    queryFn: listBankAccounts,
    staleTime: 60_000,
  });
  const { data: heldCheques = [] } = useQuery({
    queryKey: ["ledger-wizard-held-cheques"],
    queryFn: listHeldCheques,
    enabled: branch === "payment" && channel === "cheque" && chequeKind === "endorsed",
    staleTime: 30_000,
  });

  const payer = payerLookup.party;
  const payee = payeeLookup.party;
  const beneficiary = beneficiaryLookup.party;

  const customerIdForProformas = branch === "receipt" ? (payer?.customerId ?? null) : null;
  const { data: proformas = [] } = useQuery({
    queryKey: ["ledger-wizard-proformas", customerIdForProformas],
    queryFn: () => listOpenProformas(customerIdForProformas as string),
    enabled: Boolean(customerIdForProformas),
    staleTime: 30_000,
  });

  const bankAccounts = useMemo(() => accounts.filter((a) => a.account_type === "bank"), [accounts]);
  const cashBoxes = useMemo(() => accounts.filter((a) => a.account_type === "cash"), [accounts]);
  const accountChoices = channel === "cash" ? cashBoxes : bankAccounts;

  const amountOk = /^\d+$/.test(amountText) && Number(amountText) > 0;
  const amountFraction =
    amountText.includes(".") || amountText.includes("٫") || amountText.includes("/");

  const steps = branch ? BRANCH_STEPS[branch] : ["نوع سند"];

  const resetLater = () => {
    setChannel(null);
    setChequeKind(null);
    setPayerLookup(emptyLookup);
    setPayeeLookup(emptyLookup);
    setBeneficiaryLookup(emptyLookup);
    setAmountText("");
    setTracking("");
    setSourceBank("");
    setDestinationBank("");
    setAccountId("");
    setChequeNumber("");
    setChequeDue(null);
    setChequeBank("");
    setEndorsedId("");
    setDescription("");
    setTransferrerName("");
    setTransferrerAccount("");
    setRecipientName("");
    setRecipientAccount("");
    setAllocations([]);
    setSubmitError(null);
    setSuccess(null);
  };

  const chooseBranch = (next: DocBranch) => {
    if (branch && branch !== next && step > 1) {
      setConfirmReset(true);
      setBranch(next);
      return;
    }
    setBranch(next);
    resetLater();
    setStep(2);
    setConfirmReset(false);
  };

  useEffect(() => {
    if (confirmReset && branch) {
      resetLater();
      setStep(2);
      setConfirmReset(false);
    }
  }, [confirmReset, branch]);

  const endorsed = heldCheques.find((c) => c.id === endorsedId) ?? null;

  const canNext = (): boolean => {
    if (step === 1) return Boolean(branch);
    if (step === 2) {
      if (branch === "dual") {
        return (
          amountOk && Boolean(date) && tracking.trim().length > 0 && description.trim().length > 0
        );
      }
      if (!channel) return false;
      if (branch === "payment" && channel === "cheque") return Boolean(chequeKind);
      return true;
    }
    if (step === 3) {
      if (branch === "receipt") return payerLookup.status === "ok";
      if (branch === "payment") return payeeLookup.status === "ok";
      return payerLookup.status === "ok";
    }
    if (step === 4) {
      if (branch === "dual") return beneficiaryLookup.status === "ok";
      if (!amountOk || !date) return false;
      if (channel === "bank")
        return Boolean(accountId) && tracking.trim().length > 0 && Boolean(time);
      if (channel === "cash") return Boolean(accountId) && Boolean(time);
      if (channel === "cheque") {
        if (branch === "payment" && chequeKind === "endorsed")
          return Boolean(endorsedId) && Boolean(accountId);
        // The account requirement follows the RPC, and the two RPCs differ.
        // create_receipt REFUSES a destination account on the cheque branch
        // («برای چک، حساب مقصد ثبت نمی‌شود؛ چک پس از وصول به حساب می‌نشیند») and
        // this wizard's own submit already sends null for it. create_payment
        // requires a source account for every channel, unconditionally.
        // Requiring it here for a receipt asked for a value no control renders,
        // so the step could never be satisfied and, being a disabled button
        // rather than a failed validation, said nothing (phase-6 Gate A, P6-B1).
        // Written positively — «payment requires an account» rather than «anything
        // that is not a receipt does not». A future fourth branch then defaults to
        // requiring the account instead of silently skipping it.
        return (
          Boolean(chequeNumber) &&
          Boolean(chequeDue) &&
          Boolean(time) &&
          (branch === "payment" ? Boolean(accountId) : true)
        );
      }
      return true;
    }
    return true;
  };

  const runLookup = async (
    value: string,
    required: PartyKind | "any",
    setter: (s: LookupState) => void,
  ) => {
    setter({ ...emptyLookup, status: "loading", query: value });
    try {
      setter(await lookupParty(value, required));
    } catch (err) {
      setter({
        status: "not_found",
        query: value,
        party: null,
        missingName: null,
        message: err instanceof Error ? err.message : "جستجو ناموفق بود.",
      });
    }
  };

  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("خواندن فایل ناموفق بود"));
      reader.onload = () => {
        const result = String(reader.result ?? "");
        // strip the `data:<mime>;base64,` prefix — the server validator wants raw base64
        resolve(result.slice(result.indexOf(",") + 1));
      };
      reader.readAsDataURL(file);
    });

  /**
   * OCR runs the moment a file is picked — BEFORE submit — and fills only the fields the user
   * has left EMPTY. It never overwrites typed input: `requirements.md` requires every pre-filled
   * field to stay editable, and silently replacing something the accountant entered by hand is
   * worse than filling nothing.
   *
   * Item 7.7 is why every failure path here is swallowed into a note rather than raised: OCR
   * failing must never block manual entry. A refused or unavailable model degrades to typing.
   */
  const onFilesChange = async (next: File[]) => {
    setFiles(next);
    const fresh = next.find((f) => !ocrByFile.has(f));
    if (!fresh) return;

    setOcrBusy(true);
    setOcrNote(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("no session");

      const base64 = await fileToBase64(fresh);
      const res = await extractReceiptFromBytes({
        data: { file_name: fresh.name, mime: fresh.type || "application/octet-stream", base64 },
        headers: { Authorization: `Bearer ${token}` },
      });

      if ((res as { disabled?: boolean }).disabled) {
        setOcrNote("خواندن خودکار فیش در این سامانه فعال نیست؛ مقادیر را دستی وارد کنید.");
        return;
      }

      const parsed = (res as { structured?: ReceiptExtractionResult | null }).structured ?? null;
      setOcrByFile((prev) => new Map(prev).set(fresh, res));
      if (!parsed) {
        setOcrNote("متن فیش خوانده شد اما فیلدی تشخیص داده نشد؛ مقادیر را دستی وارد کنید.");
        return;
      }

      const filled: string[] = [];
      if (parsed.amount != null && amountText.trim() === "") {
        // Suggested, not filled. See the note on amountSuggestion.
        setAmountSuggestion(parsed.amount);
        setAmountSuggestionWarning(
          (parsed.warnings ?? []).find((w) => w.includes("تعداد ارقام")) ?? null,
        );
      }
      if (parsed.receipt_date && !date) {
        setDate(parsed.receipt_date);
        filled.push("تاریخ");
      }
      if (parsed.tracking_number && tracking.trim() === "") {
        setTracking(parsed.tracking_number);
        filled.push("شماره پیگیری");
      }
      if (parsed.source_bank && sourceBank.trim() === "") {
        setSourceBank(parsed.source_bank);
        filled.push("بانک مبدأ");
      }
      setOcrNote(
        filled.length > 0
          ? `از روی فیش پر شد: ${filled.join("، ")}. همه قابل ویرایش‌اند.`
          : "فیش خوانده شد؛ فیلدی خالی نبود که پر شود.",
      );
    } catch {
      setOcrNote("خواندن خودکار فیش ممکن نشد؛ مقادیر را دستی وارد کنید.");
    } finally {
      setOcrBusy(false);
    }
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    // Declared OUTSIDE the try so the catch can roll them back. The storage object necessarily
    // exists before the transaction that would own it, so this is the one orphan class the
    // database cannot close for us.
    let staged: StagedAttachment[] = [];
    try {
      // Upload BEFORE the RPC, because the RPC needs the storage paths. It creates the document
      // row and the attachment rows together, so either both exist or neither does.
      staged = files.length > 0 ? await uploadStagedAttachments(files, ocrByFile) : [];
      let result;
      if (branch === "receipt" && payer) {
        result = await callLedgerRpc("create_receipt", {
          p_channel: channel,
          p_customer_id: payer.customerId,
          p_amount: Number(amountText),
          p_payment_date: date,
          p_payment_time: time,
          p_destination_bank_account_id: channel === "cheque" ? null : accountId || null,
          p_tracking_number: channel === "bank" ? tracking.trim() : null,
          p_source_bank: sourceBank.trim() || null,
          p_cheque_number: channel === "cheque" ? chequeNumber.trim() : null,
          p_cheque_due_date: channel === "cheque" ? chequeDue : null,
          p_cheque_bank: channel === "cheque" ? chequeBank.trim() || null : null,
          p_description: description.trim() || null,
          p_allocations: allocations,
          p_attachments: staged.length > 0 ? staged : null,
        });
      } else if (branch === "payment" && payee && channel) {
        result = await callLedgerRpc("create_payment", {
          p_channel: channel,
          p_payee_type: payee.kind,
          p_payee_id: payee.roleId,
          p_amount: chequeKind === "endorsed" && endorsed ? endorsed.amount : Number(amountText),
          p_payment_date: date,
          p_source_account_id: accountId,
          p_tracking_number: channel === "bank" ? tracking.trim() : null,
          p_cheque_kind: channel === "cheque" ? chequeKind : null,
          p_cheque_number:
            channel === "cheque" && chequeKind === "own" ? chequeNumber.trim() : null,
          p_cheque_due_date: channel === "cheque" && chequeKind === "own" ? chequeDue : null,
          p_endorsed_cheque_id: chequeKind === "endorsed" ? endorsedId : null,
          p_description: description.trim() || null,
          p_attachments: staged.length > 0 ? staged : null,
        });
      } else if (branch === "dual" && payer && beneficiary) {
        result = await callLedgerRpc("create_dual_document", {
          p_payer_type: payer.kind,
          p_payer_id: payer.roleId,
          p_beneficiary_type: beneficiary.kind,
          p_beneficiary_id: beneficiary.roleId,
          p_amount: Number(amountText),
          p_document_date: date,
          p_tracking_number: tracking.trim(),
          p_description: description.trim(),
          p_source_bank: sourceBank.trim() || null,
          p_destination_bank: destinationBank.trim() || null,
          p_transferrer_name: transferrerName.trim() || null,
          p_transferrer_account_no: transferrerAccount.trim() || null,
          p_recipient_name: recipientName.trim() || null,
          p_recipient_account_no: recipientAccount.trim() || null,
          p_attachments: staged.length > 0 ? staged : null,
        });
      } else {
        // No RPC was called, so nothing owns the uploaded objects. Definite failure: safe to
        // remove them.
        await removeStagedAttachments(staged.map((a) => a.storage_path));
        setSubmitError("اطلاعات سند کامل نیست.");
        return;
      }
      if (!result.ok) {
        // The RPC returned a DEFINITE failure, so the transaction rolled back and no
        // document_attachments row references these objects. Safe to remove.
        await removeStagedAttachments(staged.map((a) => a.storage_path));
        setSubmitError(result.message);
        return;
      }
      setFiles([]);
      setOcrByFile(new Map());
      setSuccess(result.documentNumber ?? "ثبت شد");
      if (branch === "payment") {
        await navigate({ to: "/accounting/payment-vouchers" });
      } else {
        await navigate({ to: "/accounting/receipts" });
      }
    } catch (err) {
      // DELIBERATELY NO ROLLBACK HERE. This branch means the outcome is UNKNOWN -- which is
      // exactly what the message below has always said. The request may have reached the
      // database and committed while the response was lost, in which case a document and its
      // document_attachments rows now exist and point at these objects. Removing them would
      // turn an uncertain success into a certain corruption: rows referencing files that are
      // gone. Leaving them costs at most some unreferenced bytes, which a stale-object sweep
      // can reclaim by looking for `draft/` paths with no matching storage_path.
      //
      // The two returns above are different: there the failure is DEFINITE -- no RPC ran, or
      // the RPC reported failure and its transaction rolled back -- so nothing can reference
      // the objects and removing them is safe.
      setSubmitError(
        err instanceof Error
          ? "نتیجه ثبت مشخص نیست. دوباره ارسال نکنید؛ ابتدا فهرست اسناد را بررسی کنید."
          : "خطای ناشناخته.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl" data-testid="document-wizard">
      <Stepper steps={steps} current={step} onStepClick={(n) => n < step && setStep(n)} />

      {step === 1 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <ChoiceButton
            testId="wizard-branch-receipt"
            title="دریافت"
            subtitle="پول مستقیم به دست ما رسیده"
            selected={branch === "receipt"}
            onClick={() => chooseBranch("receipt")}
          />
          <ChoiceButton
            testId="wizard-branch-payment"
            title="پرداخت"
            subtitle="پول مستقیم از دست ما رفته"
            selected={branch === "payment"}
            onClick={() => chooseBranch("payment")}
          />
          <ChoiceButton
            testId="wizard-branch-dual"
            title="سند دوبل"
            subtitle="پول از یکی به دیگری، ما فقط ثبت‌کننده"
            selected={branch === "dual"}
            onClick={() => chooseBranch("dual")}
          />
        </div>
      ) : null}

      {step === 2 && branch !== "dual" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <ChoiceButton
            testId="wizard-channel-bank"
            title="بانکی"
            selected={channel === "bank"}
            onClick={() => {
              setChannel("bank");
              setChequeKind(null);
            }}
          />
          <ChoiceButton
            testId="wizard-channel-cash"
            title="نقدی"
            selected={channel === "cash"}
            onClick={() => {
              setChannel("cash");
              setChequeKind(null);
            }}
          />
          <ChoiceButton
            testId="wizard-channel-cheque"
            title="چکی"
            selected={channel === "cheque"}
            onClick={() => setChannel("cheque")}
          />
          {branch === "payment" && channel === "cheque" ? (
            <div className="sm:col-span-3 grid gap-3 sm:grid-cols-2">
              <ChoiceButton
                testId="wizard-cheque-own"
                title="چک خودمان"
                selected={chequeKind === "own"}
                onClick={() => setChequeKind("own")}
              />
              <ChoiceButton
                testId="wizard-cheque-endorsed"
                title="چک مشتری"
                selected={chequeKind === "endorsed"}
                onClick={() => setChequeKind("endorsed")}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 2 && branch === "dual" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <AmountField value={amountText} onChange={setAmountText} fraction={amountFraction} />
          <AmountSuggestion
            amount={amountSuggestion}
            warning={amountSuggestionWarning}
            onAccept={() => {
              setAmountText(String(amountSuggestion ?? ""));
              setAmountSuggestion(null);
            }}
            onDismiss={() => setAmountSuggestion(null)}
          />
          <Field label="تاریخ" required>
            <PersianDatePicker value={date} onChange={(v) => setDate(v ?? tehranDate())} />
          </Field>
          <Field label="شماره پیگیری" required>
            <Input
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              data-testid="wizard-tracking"
            />
          </Field>
          <Field label="بانک مبدأ">
            <Input value={sourceBank} onChange={(e) => setSourceBank(e.target.value)} />
          </Field>
          <Field label="بانک مقصد">
            <Input value={destinationBank} onChange={(e) => setDestinationBank(e.target.value)} />
          </Field>
          <Field label="شرح" required>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <ReceiptDocumentPicker
              files={files}
              onChange={onFilesChange}
              disabled={submitting || ocrBusy}
            />
            {ocrBusy ? (
              <p className="mt-2 text-sm text-muted-foreground" data-testid="wizard-ocr-busy">
                در حال خواندن فیش…
              </p>
            ) : ocrNote ? (
              <p className="mt-2 text-sm text-muted-foreground" data-testid="wizard-ocr-note">
                {ocrNote}
              </p>
            ) : null}
          </div>
          <Field label="نام انتقال‌دهنده (فقط روی سند، بدون کد آسان)">
            <Input value={transferrerName} onChange={(e) => setTransferrerName(e.target.value)} />
          </Field>
          <Field label="شماره حساب انتقال‌دهنده">
            <Input
              value={transferrerAccount}
              onChange={(e) => setTransferrerAccount(e.target.value)}
            />
          </Field>
          <Field label="نام گیرندهٔ حساب (فقط روی سند)">
            <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
          </Field>
          <Field label="شماره حساب گیرنده">
            <Input value={recipientAccount} onChange={(e) => setRecipientAccount(e.target.value)} />
          </Field>
        </div>
      ) : null}

      {step === 3 && (branch === "receipt" || branch === "dual") ? (
        <PartyStep
          label="کد آسان یا شمارهٔ موبایل"
          state={payerLookup}
          onSearch={(q) => runLookup(q, branch === "receipt" ? "customer" : "any", setPayerLookup)}
        />
      ) : null}
      {step === 3 && branch === "payment" ? (
        <PartyStep
          label="کد آسان یا شمارهٔ موبایل"
          state={payeeLookup}
          onSearch={(q) => runLookup(q, "any", setPayeeLookup)}
        />
      ) : null}

      {step === 4 && branch === "dual" ? (
        <PartyStep
          label="کد آسان یا شمارهٔ موبایل ذینفع"
          state={beneficiaryLookup}
          onSearch={(q) => runLookup(q, "any", setBeneficiaryLookup)}
        />
      ) : null}

      {step === 4 && branch !== "dual" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {channel === "cheque" && chequeKind === "endorsed" ? (
            <div className="sm:col-span-2 space-y-2">
              <Label>چک‌های در اختیار *</Label>
              {heldCheques.length === 0 ? (
                <p className="text-sm text-muted-foreground">چک قابل ظهرنویسی در فهرست نیست.</p>
              ) : (
                <ul className="space-y-2" data-testid="wizard-held-cheques">
                  {heldCheques.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setEndorsedId(c.id);
                          setAmountText(String(Math.trunc(c.amount)));
                        }}
                        className={`flex w-full justify-between rounded-md border px-3 py-2 text-sm ${
                          endorsedId === c.id ? "border-primary bg-primary/5" : "border-input"
                        }`}
                      >
                        <span>
                          {c.cheque_number ?? c.id.slice(0, 8)} — {c.customer_name}
                        </span>
                        <span>{c.amount.toLocaleString("fa-IR")}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {endorsed ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Lock className="h-4 w-4" /> جزئیات چک از فهرست خوانده شد و قابل بازنویسی نیست.
                </p>
              ) : null}
            </div>
          ) : null}

          {!(channel === "cheque" && chequeKind === "endorsed") ? (
            <>
              <AmountField value={amountText} onChange={setAmountText} fraction={amountFraction} />
              <AmountSuggestion
                amount={amountSuggestion}
                warning={amountSuggestionWarning}
                onAccept={() => {
                  setAmountText(String(amountSuggestion ?? ""));
                  setAmountSuggestion(null);
                }}
                onDismiss={() => setAmountSuggestion(null)}
              />
            </>
          ) : null}

          <Field label="تاریخ" required>
            <PersianDatePicker value={date} onChange={(v) => setDate(v ?? tehranDate())} />
          </Field>

          {channel !== "cheque" || chequeKind !== "endorsed" ? (
            <Field label="ساعت" required>
              <Input value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          ) : null}

          {channel === "bank" ||
          channel === "cash" ||
          (branch === "payment" && channel === "cheque") ? (
            <Field label={channel === "cash" ? "صندوق" : "حساب"} required>
              {accountChoices.length === 0 ? (
                <p className="text-sm text-destructive">
                  {channel === "cash"
                    ? "صندوقی با نوع نقدی ثبت نشده است."
                    : "حساب بانکی فعالی یافت نشد."}
                </p>
              ) : (
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  data-testid="wizard-account"
                >
                  <option value="">انتخاب کنید</option>
                  {accountChoices.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title} — {a.bank_name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          ) : null}

          {channel === "bank" ? (
            <>
              <Field label="شماره پیگیری" required>
                <Input
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                  data-testid="wizard-tracking"
                />
              </Field>
              <Field label="بانک مبدأ">
                <Input value={sourceBank} onChange={(e) => setSourceBank(e.target.value)} />
              </Field>
            </>
          ) : null}

          {channel === "cash" ? (
            <p
              className="sm:col-span-2 text-sm text-muted-foreground"
              data-testid="wizard-no-tracking"
            >
              شماره پیگیری بانکی برای نقدی پرسیده نمی‌شود؛ سامانه شمارهٔ داخلی می‌سازد.
            </p>
          ) : null}

          {channel === "cheque" && chequeKind !== "endorsed" ? (
            <>
              <Field label="شماره چک" required>
                <Input value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} />
              </Field>
              <Field label="تاریخ سررسید" required>
                <PersianDatePicker value={chequeDue} onChange={setChequeDue} />
              </Field>
              <Field label="بانک صادرکننده">
                <Input value={chequeBank} onChange={(e) => setChequeBank(e.target.value)} />
              </Field>
              <p
                className="sm:col-span-2 text-sm text-muted-foreground"
                data-testid="wizard-no-tracking"
              >
                شماره پیگیری بانکی برای چک پرسیده نمی‌شود.
              </p>
            </>
          ) : null}

          <Field label="شرح">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <ReceiptDocumentPicker
              files={files}
              onChange={onFilesChange}
              disabled={submitting || ocrBusy}
            />
            {ocrBusy ? (
              <p className="mt-2 text-sm text-muted-foreground" data-testid="wizard-ocr-busy">
                در حال خواندن فیش…
              </p>
            ) : ocrNote ? (
              <p className="mt-2 text-sm text-muted-foreground" data-testid="wizard-ocr-note">
                {ocrNote}
              </p>
            ) : null}
          </div>

          {branch === "receipt" && payer?.customerId ? (
            <div className="sm:col-span-2">
              <ProformaList items={proformas} allocations={allocations} onChange={setAllocations} />
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 5 ? (
        <div className="space-y-3 rounded-xl border p-4 text-sm" data-testid="wizard-review">
          <p>
            نوع: {branch === "receipt" ? "دریافت" : branch === "payment" ? "پرداخت" : "سند دوبل"}
          </p>
          {channel ? (
            <p>نحوه: {channel === "bank" ? "بانکی" : channel === "cash" ? "نقدی" : "چکی"}</p>
          ) : null}
          <PartySummary label="طرف" party={branch === "payment" ? payee : payer} />
          {branch === "dual" ? <PartySummary label="ذینفع" party={beneficiary} /> : null}
          <p>
            مبلغ:{" "}
            {(chequeKind === "endorsed" && endorsed
              ? endorsed.amount
              : Number(amountText) || 0
            ).toLocaleString("fa-IR")}{" "}
            تومان
          </p>
          {/* P6-M3: this was `{date}`, the raw ISO value, so the last screen before
              money is committed showed a Gregorian date beside an amount in Persian
              digits. formatDateFa is the same helper the rest of the app uses. */}
          <p>تاریخ: {formatDateFa(date)}</p>

          {/* Show the tracking number only when submit() will actually send it.
              Changing the channel does not clear `tracking`, so a user who typed one
              on the bank branch and then switched to cheque would otherwise see it
              confirmed here while p_tracking_number goes out as null — and one step
              earlier the same wizard says «شماره پیگیری بانکی برای چک پرسیده نمی‌شود».
              Two screens contradicting each other on the last page before money is
              committed is the exact defect class this phase set out to close.
              Mirrors submit(): bank on receipt/payment, always on dual. */}
          {(branch === "dual" || channel === "bank") && tracking.trim() ? (
            <p>شمارهٔ پیگیری: {tracking.trim()}</p>
          ) : null}

          {/* The cheque details reach the ledger — cheque_number and cheque_due_date are
              columns on the document, not decoration. Showing the evidence-only fields
              below while hiding these would have been exactly backwards. Raised by the
              phase-2/3 independent review as D4. */}
          {channel === "cheque" && chequeKind !== "endorsed" ? (
            <>
              {chequeNumber.trim() ? <p>شمارهٔ چک: {chequeNumber.trim()}</p> : null}
              {chequeDue ? <p>تاریخ سررسید چک: {formatDateFa(chequeDue)}</p> : null}
              {chequeBank.trim() ? <p>بانک صادرکننده: {chequeBank.trim()}</p> : null}
            </>
          ) : null}

          {description.trim() ? <p>شرح: {description.trim()}</p> : null}

          {/* P6-M1 / T11: the transferrer and the recipient are recorded on the document
              for evidentiary reasons only — no Asan code, no journal line, no balance
              movement. They exist so the document can stand as evidence a year later,
              which is impossible if the user cannot check them before submitting. */}
          {branch === "dual" &&
          (transferrerName.trim() ||
            transferrerAccount.trim() ||
            recipientName.trim() ||
            recipientAccount.trim()) ? (
            <div className="rounded-md bg-muted/50 p-3" data-testid="wizard-review-evidence">
              <p className="font-medium">فقط روی سند — بدون اثر حسابداری</p>
              {transferrerName.trim() ? <p>نام انتقال‌دهنده: {transferrerName.trim()}</p> : null}
              {transferrerAccount.trim() ? (
                <p>شماره حساب انتقال‌دهنده: {transferrerAccount.trim()}</p>
              ) : null}
              {recipientName.trim() ? <p>نام گیرندهٔ حساب: {recipientName.trim()}</p> : null}
              {recipientAccount.trim() ? <p>شماره حساب گیرنده: {recipientAccount.trim()}</p> : null}
            </div>
          ) : null}

          {/* P6-m1: the old wording said the preview «از سرور می‌آید», which reads as a
              claim that this screen was produced by the server. It is not — it is the
              user's own input, echoed back. Say that plainly. */}
          <p className="text-muted-foreground">
            این صفحه فقط ورودی‌های خودتان را نشان می‌دهد و از سرور نمی‌آید؛ سند حسابداری پس از ثبت
            ساخته می‌شود.
          </p>
          {submitError ? (
            <Alert variant="destructive">
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          ) : null}
          {success ? <p className="text-green-700">{success}</p> : null}
        </div>
      ) : null}

      <div className="flex gap-2">
        {step > 1 ? (
          <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
            قبلی
          </Button>
        ) : null}
        {step < 5 && branch ? (
          <Button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext()}
            data-testid="wizard-next"
          >
            بعدی
          </Button>
        ) : null}
        {step === 5 ? (
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || amountSuggestion != null}
            data-testid="wizard-submit"
          >
            {submitting ? "در حال ثبت…" : "ثبت سند"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required ? " *" : ""}
      </Label>
      {children}
    </div>
  );
}

/**
 * The amount the OCR read, offered rather than applied.
 *
 * OG-85: the model reads the significant digits correctly and then miscounts the run of zeros,
 * by a different number each time, so an auto-filled amount could be 10x, 100x or 1000x short
 * with nothing on screen to show for it. Holding it here costs one click and converts a silent
 * error into one the accountant cannot miss. While a suggestion is unresolved the submit button
 * stays disabled, so a document cannot be recorded without the amount having been looked at.
 */
function AmountSuggestion({
  amount,
  warning,
  onAccept,
  onDismiss,
}: {
  amount: number | null;
  warning: string | null;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  if (amount == null) return null;
  return (
    <div
      className="sm:col-span-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/40"
      data-testid="amount-suggestion"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span>
          مبلغ پیشنهادی از روی فیش:{" "}
          <b className="font-mono" data-testid="amount-suggestion-value">
            {amount.toLocaleString("en-US")}
          </b>{" "}
          تومان — با فیش مقایسه و تأیید کنید.
        </span>
      </div>
      {warning ? (
        <p className="mt-2 text-amber-800 dark:text-amber-300" data-testid="amount-suggestion-warning">
          {warning}
        </p>
      ) : null}
      <div className="mt-2 flex gap-2">
        <Button type="button" size="sm" onClick={onAccept} data-testid="amount-suggestion-accept">
          مبلغ درست است، وارد کن
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onDismiss}
          data-testid="amount-suggestion-dismiss"
        >
          خودم وارد می‌کنم
        </Button>
      </div>
    </div>
  );
}

function AmountField({
  value,
  onChange,
  fraction,
}: {
  value: string;
  onChange: (v: string) => void;
  fraction: boolean;
}) {
  return (
    <Field label="مبلغ (تومان صحیح)" required>
      <Input
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        data-testid="wizard-amount"
      />
      {fraction ? (
        <p className="text-sm text-destructive">
          مبلغ باید عدد صحیح تومان باشد؛ اعشار پذیرفته نمی‌شود.
        </p>
      ) : null}
    </Field>
  );
}

function PartyStep({
  label,
  state,
  onSearch,
}: {
  label: string;
  state: LookupState;
  onSearch: (q: string) => void;
}) {
  const [q, setQ] = useState(state.query);
  return (
    <div className="space-y-3">
      <Field label={label} required>
        <Input
          className="border-primary"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          data-testid="wizard-lookup-input"
        />
      </Field>
      <Button type="button" onClick={() => onSearch(q)} data-testid="wizard-lookup-search">
        جستجو
      </Button>
      {state.status === "missing_asan" && state.missingName ? (
        <MissingAsanMessage name={state.missingName} />
      ) : null}
      {state.message && state.status !== "missing_asan" ? (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      {state.status === "ok" && state.party ? (
        <PartySummary label="یافته" party={state.party} />
      ) : null}
    </div>
  );
}

function PartySummary({ label, party }: { label: string; party: PartyHit | null }) {
  if (!party) return null;
  return (
    <div className="rounded-md bg-muted/50 p-3 text-sm" data-testid="wizard-party-hit">
      <p>
        {label}: {party.displayName}
      </p>
      <p>نوع پرونده: {KIND_LABEL[party.kind] ?? party.kind}</p>
      <p>کد آسان: {party.asanCode}</p>
    </div>
  );
}
