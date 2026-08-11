SET client_encoding = 'UTF8';

-- 218 - Mobile-bank screenshot receipt marker.
--
-- Adds the third accountant-visible receipt form option requested next to:
--   * has_perforation
--   * is_typed_receipt
--
-- Rollback:
--   ALTER TABLE public.payment_receipts
--     DROP COLUMN IF EXISTS is_mobile_bank_screenshot;

ALTER TABLE public.payment_receipts
  ADD COLUMN IF NOT EXISTS is_mobile_bank_screenshot boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.payment_receipts.is_mobile_bank_screenshot IS
  'رسید اسکرین‌شات از همراه بانک است؛ گزینه تکمیلی نوع سند فیش واریزی.';
