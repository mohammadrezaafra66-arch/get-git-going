-- F-7: indexes for credit-customers filtering
CREATE INDEX IF NOT EXISTS idx_ccp_total_purchases       ON public.customer_credit_profile (total_purchases);
CREATE INDEX IF NOT EXISTS idx_ccp_credit_limit          ON public.customer_credit_profile (credit_limit);
CREATE INDEX IF NOT EXISTS idx_ccp_outstanding_balance   ON public.customer_credit_profile (outstanding_balance);
CREATE INDEX IF NOT EXISTS idx_ccp_credit_score          ON public.customer_credit_profile (credit_score);
CREATE INDEX IF NOT EXISTS idx_ccp_customer_id           ON public.customer_credit_profile (customer_id);

-- profiles search by name (for responsible autocomplete)
CREATE INDEX IF NOT EXISTS idx_profiles_full_name_lower  ON public.profiles (lower(full_name));