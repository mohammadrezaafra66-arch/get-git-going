-- =====================================================
-- AfraKala — Full schema export from pg_catalog
-- Generated: 2026-06-25T05:06:41Z
-- Source: Supabase project (public schema only)
-- Includes: tables, columns, constraints, indexes,
--           RLS policies, functions, triggers, enums,
--           seed data for workflow_settings & gamification_kpi_rules
-- Note: reconstructed from catalog — not byte-identical to pg_dump
-- =====================================================

SET statement_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;

CREATE SCHEMA IF NOT EXISTS public;

-- ============ EXTENSIONS ============
CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA vault;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA public;

-- ============ ENUM TYPES ============
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'sales', 'accountant', 'viewer');
CREATE TYPE public.base_currency AS ENUM ('toman', 'usd', 'aed');
CREATE TYPE public.currency_code AS ENUM ('toman', 'usd', 'aed', 'usd_us');
CREATE TYPE public.dynamic_column_data_type AS ENUM ('text', 'number', 'boolean', 'date', 'datetime', 'phone', 'tag', 'status');
CREATE TYPE public.inquiry_status AS ENUM ('draft', 'pending', 'warning_5min', 'danger_8min', 'critical_10min', 'transfer_available', 'transferred', 'answered', 'completed_on_time', 'completed_late', 'expired', 'cancelled', 'rejected');
CREATE TYPE public.league_tier AS ENUM ('Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Legend');
CREATE TYPE public.margin_type AS ENUM ('fixed', 'percent', 'mixed');
CREATE TYPE public.market_match_actor AS ENUM ('system', 'human', 'imported', 'bot');
CREATE TYPE public.market_match_source AS ENUM ('torob', 'purchista', 'other');
CREATE TYPE public.market_match_status AS ENUM ('pending', 'needs_review', 'approved', 'rejected', 'disabled');
CREATE TYPE public.product_attribute_type AS ENUM ('brand', 'category', 'color', 'capacity', 'model');
CREATE TYPE public.product_status AS ENUM ('active', 'inactive', 'discontinued');
CREATE TYPE public.product_type AS ENUM ('iranian', 'foreign');
CREATE TYPE public.profile_field_type AS ENUM ('text', 'number', 'select', 'multiselect', 'time', 'days', 'textarea', 'date');
CREATE TYPE public.sales_quote_item_source AS ENUM ('product_price', 'quick_price', 'manual');
CREATE TYPE public.sales_quote_status AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'canceled');
CREATE TYPE public.shipping_cost_type AS ENUM ('fixed', 'percent', 'currency');
CREATE TYPE public.stock_alert_priority AS ENUM ('low', 'normal', 'high');
CREATE TYPE public.stock_alert_status AS ENUM ('open', 'contacted', 'closed', 'canceled', 'notified');
CREATE TYPE public.stock_status AS ENUM ('available', 'unavailable', 'limited', 'unknown');

-- ============ TABLES ============

-- ---- Table: public.academy_courses ----
CREATE TABLE IF NOT EXISTS public.academy_courses (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    title text NOT NULL,
    description text,
    is_published boolean NOT NULL DEFAULT false,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.academy_lessons ----
CREATE TABLE IF NOT EXISTS public.academy_lessons (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    course_id uuid NOT NULL,
    title text NOT NULL,
    content text,
    video_url text,
    attachment_url text,
    order_index integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.academy_quiz_attempts ----
CREATE TABLE IF NOT EXISTS public.academy_quiz_attempts (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    quiz_id uuid NOT NULL,
    score integer NOT NULL,
    passed boolean NOT NULL,
    answers jsonb NOT NULL,
    attempted_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.academy_quiz_questions ----
CREATE TABLE IF NOT EXISTS public.academy_quiz_questions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    quiz_id uuid NOT NULL,
    question_text text NOT NULL,
    options jsonb NOT NULL,
    correct_value integer NOT NULL,
    order_index integer NOT NULL DEFAULT 0
);

-- ---- Table: public.academy_quizzes ----
CREATE TABLE IF NOT EXISTS public.academy_quizzes (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    lesson_id uuid NOT NULL,
    title text,
    passing_score integer NOT NULL DEFAULT 50,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.academy_user_progress ----
CREATE TABLE IF NOT EXISTS public.academy_user_progress (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    course_id uuid NOT NULL,
    lesson_id uuid NOT NULL,
    completed boolean NOT NULL DEFAULT false,
    completed_at timestamp with time zone
);

-- ---- Table: public.achievements ----
CREATE TABLE IF NOT EXISTS public.achievements (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    key text NOT NULL,
    title_fa text NOT NULL,
    description text,
    icon text,
    xp_reward integer NOT NULL DEFAULT 0,
    enabled boolean NOT NULL DEFAULT true,
    display_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    rule_type text NOT NULL DEFAULT 'manual'::text,
    rule_value numeric,
    title_en text,
    condition_event_key text,
    condition_operator text,
    condition_value numeric,
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.ai_conversations ----
CREATE TABLE IF NOT EXISTS public.ai_conversations (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    group_id uuid,
    role text NOT NULL,
    content text NOT NULL,
    model text,
    tokens_in integer,
    tokens_out integer,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.appeal_reviewers ----
CREATE TABLE IF NOT EXISTS public.appeal_reviewers (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    appeal_id uuid NOT NULL,
    reviewer_id uuid NOT NULL,
    role text NOT NULL,
    vote text,
    vote_note text,
    voted_at timestamp with time zone,
    assigned_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.audit_logs ----
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id bigint NOT NULL DEFAULT nextval('audit_logs_id_seq'::regclass),
    actor_id uuid,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    action text NOT NULL,
    diff jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.bank_accounts ----
CREATE TABLE IF NOT EXISTS public.bank_accounts (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    title text NOT NULL,
    bank_name text NOT NULL,
    iban text,
    account_no text,
    card_no text,
    currency text NOT NULL DEFAULT 'IRR'::text,
    opening_balance numeric NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.bot_api_key_label_access ----
CREATE TABLE IF NOT EXISTS public.bot_api_key_label_access (
    api_key_id uuid NOT NULL,
    label_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.bot_api_key_table_access ----
CREATE TABLE IF NOT EXISTS public.bot_api_key_table_access (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    api_key_id uuid NOT NULL,
    table_id uuid NOT NULL,
    can_read boolean NOT NULL DEFAULT true,
    can_update boolean NOT NULL DEFAULT false,
    allowed_update_columns uuid[] NOT NULL DEFAULT '{}'::uuid[],
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.bot_api_keys ----
CREATE TABLE IF NOT EXISTS public.bot_api_keys (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    key_hash text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    allowed_table_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    last_used_at timestamp with time zone,
    key_prefix text,
    expires_at timestamp with time zone
);

-- ---- Table: public.bot_api_usage_logs ----
CREATE TABLE IF NOT EXISTS public.bot_api_usage_logs (
    id bigint NOT NULL DEFAULT nextval('bot_api_usage_logs_id_seq'::regclass),
    api_key_id uuid,
    table_id uuid,
    endpoint text NOT NULL,
    method text NOT NULL,
    status_code integer NOT NULL,
    error_code text,
    ip text,
    request_size integer,
    response_count integer,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.brands ----
CREATE TABLE IF NOT EXISTS public.brands (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.call_logs ----
CREATE TABLE IF NOT EXISTS public.call_logs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    employee_id uuid NOT NULL,
    direction text NOT NULL,
    duration_seconds integer NOT NULL DEFAULT 0,
    started_at timestamp with time zone NOT NULL DEFAULT now(),
    ended_at timestamp with time zone,
    customer_id uuid,
    external_id text,
    source text NOT NULL DEFAULT 'manual'::text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.capital_allocation_ledger ----
CREATE TABLE IF NOT EXISTS public.capital_allocation_ledger (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    allocation_kind text NOT NULL,
    allocation_id uuid NOT NULL,
    transaction_type text NOT NULL,
    amount numeric NOT NULL,
    held_before numeric NOT NULL,
    held_after numeric NOT NULL,
    consumed_before numeric NOT NULL,
    consumed_after numeric NOT NULL,
    reference_type text,
    reference_id uuid,
    actor_id uuid,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.categories ----
CREATE TABLE IF NOT EXISTS public.categories (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL,
    parent_id uuid,
    description text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    naming_template text,
    primary_spec_label text
);

-- ---- Table: public.category_product_attributes ----
CREATE TABLE IF NOT EXISTS public.category_product_attributes (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    category_id uuid NOT NULL,
    attribute_key text NOT NULL,
    label_fa text NOT NULL,
    input_type text NOT NULL DEFAULT 'text'::text,
    is_required boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    use_in_product_name boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0,
    options jsonb NOT NULL DEFAULT '[]'::jsonb,
    help_text text,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.credit_requests ----
CREATE TABLE IF NOT EXISTS public.credit_requests (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    customer_id uuid NOT NULL,
    requested_by uuid,
    requested_amount numeric(15,2) NOT NULL,
    status text NOT NULL DEFAULT 'pending'::text,
    reviewed_by uuid,
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.credit_score_snapshots ----
CREATE TABLE IF NOT EXISTS public.credit_score_snapshots (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    customer_id uuid NOT NULL,
    score integer NOT NULL,
    credit_limit numeric(15,2) NOT NULL DEFAULT 0,
    params_used jsonb NOT NULL DEFAULT '{}'::jsonb,
    calculated_by uuid,
    calculated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.credit_scoring_rules ----
CREATE TABLE IF NOT EXISTS public.credit_scoring_rules (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    parameter_name text NOT NULL,
    weight numeric(3,2) NOT NULL,
    min_value numeric,
    max_value numeric,
    score_formula text,
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    window_months integer NOT NULL DEFAULT 6
);

-- ---- Table: public.currencies ----
CREATE TABLE IF NOT EXISTS public.currencies (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    code text NOT NULL,
    title text NOT NULL,
    symbol text,
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.currency_rate_fetches ----
CREATE TABLE IF NOT EXISTS public.currency_rate_fetches (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    source_id uuid NOT NULL,
    currency text NOT NULL,
    rate numeric(15,2) NOT NULL,
    fetched_at timestamp with time zone NOT NULL DEFAULT now(),
    fetched_by uuid,
    status text NOT NULL DEFAULT 'pending_review'::text,
    approved_by uuid,
    approved_at timestamp with time zone,
    note text
);

-- ---- Table: public.currency_rates ----
CREATE TABLE IF NOT EXISTS public.currency_rates (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    currency text NOT NULL,
    rate_to_toman numeric NOT NULL,
    source_name text,
    effective_at timestamp with time zone NOT NULL DEFAULT now(),
    created_by uuid,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    approved_by uuid,
    approved_at timestamp with time zone,
    fetch_source_id uuid
);

-- ---- Table: public.currency_sources ----
CREATE TABLE IF NOT EXISTS public.currency_sources (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    url text,
    api_key text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.custom_roles ----
CREATE TABLE IF NOT EXISTS public.custom_roles (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    display_name text,
    description text,
    is_system boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    created_by uuid
);

-- ---- Table: public.customer_capital_allocations ----
CREATE TABLE IF NOT EXISTS public.customer_capital_allocations (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    salesperson_allocation_id uuid NOT NULL,
    capital_snapshot_id uuid NOT NULL,
    capital_date date NOT NULL,
    salesperson_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    customer_score numeric NOT NULL DEFAULT 0,
    score_source text NOT NULL DEFAULT 'customer_credit_profile.credit_score'::text,
    total_customer_score numeric NOT NULL DEFAULT 0,
    system_suggested_amount numeric NOT NULL DEFAULT 0,
    final_amount numeric NOT NULL DEFAULT 0,
    override_reason text,
    status text NOT NULL DEFAULT 'draft'::text,
    created_by uuid,
    approved_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    held_amount numeric NOT NULL DEFAULT 0,
    consumed_amount numeric NOT NULL DEFAULT 0
);

-- ---- Table: public.customer_credit_balance ----
CREATE TABLE IF NOT EXISTS public.customer_credit_balance (
    customer_id uuid NOT NULL,
    available_credit numeric(15,2) NOT NULL DEFAULT 0,
    held_credit numeric(15,2) NOT NULL DEFAULT 0,
    last_transaction_at timestamp with time zone,
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.customer_credit_ledger ----
CREATE TABLE IF NOT EXISTS public.customer_credit_ledger (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    customer_id uuid NOT NULL,
    transaction_type text NOT NULL,
    amount numeric(15,2) NOT NULL,
    balance_before numeric(15,2) NOT NULL,
    balance_after numeric(15,2) NOT NULL,
    reference_type text,
    reference_id uuid,
    description text,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.customer_credit_profile ----
CREATE TABLE IF NOT EXISTS public.customer_credit_profile (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    customer_id uuid NOT NULL,
    total_purchases numeric(15,2) NOT NULL DEFAULT 0,
    total_paid numeric(15,2) NOT NULL DEFAULT 0,
    outstanding_balance numeric(15,2) NOT NULL DEFAULT 0,
    late_payments_count integer NOT NULL DEFAULT 0,
    last_purchase_date timestamp with time zone,
    credit_score integer NOT NULL DEFAULT 0,
    credit_limit numeric(15,2) NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.customers ----
CREATE TABLE IF NOT EXISTS public.customers (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    phone text,
    email text,
    address text,
    tax_id text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    city text,
    notes text,
    is_active boolean NOT NULL DEFAULT true,
    responsible_id uuid,
    accounting_code text,
    link_group text,
    birth_date date,
    person_id uuid
);

-- ---- Table: public.daily_capital_inputs ----
CREATE TABLE IF NOT EXISTS public.daily_capital_inputs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    capital_date date NOT NULL,
    bank_balance numeric NOT NULL DEFAULT 0,
    cash_balance numeric NOT NULL DEFAULT 0,
    incoming_checks numeric NOT NULL DEFAULT 0,
    outgoing_checks numeric NOT NULL DEFAULT 0,
    external_receivables numeric NOT NULL DEFAULT 0,
    external_payables numeric NOT NULL DEFAULT 0,
    near_term_expenses numeric NOT NULL DEFAULT 0,
    risk_reserve numeric NOT NULL DEFAULT 0,
    blocked_funds numeric NOT NULL DEFAULT 0,
    inventory_liquidity_value numeric NOT NULL DEFAULT 0,
    manual_adjustment numeric NOT NULL DEFAULT 0,
    notes text,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.daily_capital_snapshots ----
CREATE TABLE IF NOT EXISTS public.daily_capital_snapshots (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    capital_date date NOT NULL,
    system_suggested_capital numeric NOT NULL DEFAULT 0,
    final_capital numeric NOT NULL DEFAULT 0,
    total_receivables numeric NOT NULL DEFAULT 0,
    overdue_receivables numeric NOT NULL DEFAULT 0,
    due_today_receivables numeric NOT NULL DEFAULT 0,
    future_receivables numeric NOT NULL DEFAULT 0,
    total_payables numeric NOT NULL DEFAULT 0,
    overdue_payables numeric NOT NULL DEFAULT 0,
    due_today_payables numeric NOT NULL DEFAULT 0,
    future_payables numeric NOT NULL DEFAULT 0,
    input_id uuid,
    formula_version text NOT NULL DEFAULT 'v1'::text,
    override_reason text,
    approved_by uuid,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    is_active boolean NOT NULL DEFAULT false
);

-- ---- Table: public.daily_mood_entries ----
CREATE TABLE IF NOT EXISTS public.daily_mood_entries (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    mood_date date NOT NULL DEFAULT CURRENT_DATE,
    mood_key text NOT NULL,
    mood_label text NOT NULL,
    mood_score integer,
    reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
    scenario_key text,
    answers jsonb NOT NULL DEFAULT '[]'::jsonb,
    free_text text,
    wants_follow_up text NOT NULL DEFAULT 'no'::text,
    hafez_poem_id uuid,
    hafez_saved boolean NOT NULL DEFAULT false,
    visibility text NOT NULL DEFAULT 'management'::text,
    status text NOT NULL DEFAULT 'new'::text,
    manager_note text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.daily_mood_hafez_poems ----
CREATE TABLE IF NOT EXISTS public.daily_mood_hafez_poems (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    title text,
    poem_text text NOT NULL,
    interpretation text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.daily_mood_questions ----
CREATE TABLE IF NOT EXISTS public.daily_mood_questions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    scenario_key text NOT NULL,
    question_key text NOT NULL,
    question_text text NOT NULL,
    question_type text NOT NULL,
    options jsonb NOT NULL DEFAULT '[]'::jsonb,
    next_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.daily_mood_scenarios ----
CREATE TABLE IF NOT EXISTS public.daily_mood_scenarios (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    scenario_key text NOT NULL,
    title text NOT NULL,
    mood_keys text[] NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.delivery_receipt_status_history ----
CREATE TABLE IF NOT EXISTS public.delivery_receipt_status_history (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    receipt_id uuid NOT NULL,
    from_status text,
    to_status text NOT NULL,
    changed_by uuid,
    note text,
    changed_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.delivery_receipts ----
CREATE TABLE IF NOT EXISTS public.delivery_receipts (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    type text NOT NULL,
    invoice_id uuid,
    customer_id uuid,
    uploaded_by uuid NOT NULL,
    storage_path text NOT NULL,
    file_name text NOT NULL,
    file_size bigint,
    mime_type text,
    status text NOT NULL DEFAULT 'pending_review'::text,
    notes text,
    review_deadline timestamp with time zone NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.document_status_history ----
CREATE TABLE IF NOT EXISTS public.document_status_history (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    document_id uuid NOT NULL,
    from_status text,
    to_status text NOT NULL,
    changed_by uuid,
    note text,
    changed_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.documents ----
CREATE TABLE IF NOT EXISTS public.documents (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    type text NOT NULL,
    reference_id uuid,
    reference_type text,
    uploaded_by uuid NOT NULL,
    storage_path text NOT NULL,
    file_name text NOT NULL,
    file_size bigint,
    mime_type text,
    status text NOT NULL DEFAULT 'pending_review'::text,
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    review_deadline timestamp with time zone NOT NULL DEFAULT (now() + '00:10:00'::interval),
    reviewed_by uuid,
    reviewed_at timestamp with time zone
);

-- ---- Table: public.dynamic_table_cells ----
CREATE TABLE IF NOT EXISTS public.dynamic_table_cells (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    table_id uuid NOT NULL,
    row_id uuid NOT NULL,
    column_id uuid NOT NULL,
    value_text text,
    value_number numeric,
    value_boolean boolean,
    value_date date,
    value_datetime timestamp with time zone,
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.dynamic_table_columns ----
CREATE TABLE IF NOT EXISTS public.dynamic_table_columns (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    table_id uuid NOT NULL,
    column_key text NOT NULL,
    label text NOT NULL,
    data_type dynamic_column_data_type NOT NULL,
    is_required boolean NOT NULL DEFAULT false,
    is_filterable boolean NOT NULL DEFAULT false,
    is_editable_by_bot boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    is_computed boolean NOT NULL DEFAULT false,
    formula_key text,
    formula_config jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- ---- Table: public.dynamic_table_row_counters ----
CREATE TABLE IF NOT EXISTS public.dynamic_table_row_counters (
    table_id uuid NOT NULL,
    last_value bigint NOT NULL DEFAULT 0,
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.dynamic_table_rows ----
CREATE TABLE IF NOT EXISTS public.dynamic_table_rows (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    table_id uuid NOT NULL,
    row_number bigint NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.dynamic_tables ----
CREATE TABLE IF NOT EXISTS public.dynamic_tables (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    owner_id uuid,
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    access_level text NOT NULL DEFAULT 'all'::text,
    allowed_roles jsonb NOT NULL DEFAULT '[]'::jsonb
);

-- ---- Table: public.employee_achievements ----
CREATE TABLE IF NOT EXISTS public.employee_achievements (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    employee_id uuid NOT NULL,
    achievement_id uuid NOT NULL,
    unlocked_at timestamp with time zone NOT NULL DEFAULT now(),
    xp_awarded numeric NOT NULL DEFAULT 0,
    source_event_type text,
    source_event_count bigint,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.employee_leagues ----
CREATE TABLE IF NOT EXISTS public.employee_leagues (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    employee_id uuid NOT NULL,
    season_id uuid NOT NULL,
    league league_tier NOT NULL DEFAULT 'Bronze'::league_tier,
    rank integer,
    score numeric NOT NULL DEFAULT 0,
    promoted boolean NOT NULL DEFAULT false,
    demoted boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.employee_level_up_events ----
CREATE TABLE IF NOT EXISTS public.employee_level_up_events (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    employee_id uuid NOT NULL,
    old_level integer NOT NULL,
    new_level integer NOT NULL,
    xp_total numeric NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.employee_mission_progress ----
CREATE TABLE IF NOT EXISTS public.employee_mission_progress (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    employee_id uuid NOT NULL,
    mission_id uuid NOT NULL,
    period_key text NOT NULL,
    progress numeric NOT NULL DEFAULT 0,
    completed boolean NOT NULL DEFAULT false,
    completed_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    period_start timestamp with time zone,
    period_end timestamp with time zone,
    target_value numeric,
    current_value numeric NOT NULL DEFAULT 0,
    xp_awarded integer NOT NULL DEFAULT 0,
    source_event_type text
);

-- ---- Table: public.employee_progress ----
CREATE TABLE IF NOT EXISTS public.employee_progress (
    employee_id uuid NOT NULL,
    level integer NOT NULL DEFAULT 1,
    xp_current numeric NOT NULL DEFAULT 0,
    xp_total numeric NOT NULL DEFAULT 0,
    xp_next_level numeric NOT NULL DEFAULT 100,
    last_score_converted numeric NOT NULL DEFAULT 0,
    last_level_up timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.employee_score_events ----
CREATE TABLE IF NOT EXISTS public.employee_score_events (
    id bigint NOT NULL DEFAULT nextval('employee_score_events_id_seq'::regclass),
    employee_id uuid NOT NULL,
    event_type text NOT NULL,
    source_table text,
    source_id text,
    triggered_at timestamp with time zone NOT NULL DEFAULT now(),
    payload jsonb
);

-- ---- Table: public.employee_scores ----
CREATE TABLE IF NOT EXISTS public.employee_scores (
    employee_id uuid NOT NULL,
    daily_score numeric NOT NULL DEFAULT 0,
    weekly_score numeric NOT NULL DEFAULT 0,
    monthly_score numeric NOT NULL DEFAULT 0,
    total_score numeric NOT NULL DEFAULT 0,
    normalized_score numeric NOT NULL DEFAULT 0,
    active_work_minutes numeric NOT NULL DEFAULT 0,
    breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
    last_calculated_at timestamp with time zone NOT NULL DEFAULT now(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.employee_streaks ----
CREATE TABLE IF NOT EXISTS public.employee_streaks (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    employee_id uuid NOT NULL,
    streak_type text NOT NULL,
    current_count integer NOT NULL DEFAULT 0,
    best_count integer NOT NULL DEFAULT 0,
    last_event_date date,
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.external_parties ----
CREATE TABLE IF NOT EXISTS public.external_parties (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    full_name text NOT NULL,
    national_id text,
    phone text,
    accounting_code text,
    notes text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.feedback ----
CREATE TABLE IF NOT EXISTS public.feedback (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid,
    category text,
    subject text NOT NULL,
    message text NOT NULL,
    status text NOT NULL DEFAULT 'open'::text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.feedback_items ----
CREATE TABLE IF NOT EXISTS public.feedback_items (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    title text NOT NULL,
    type text NOT NULL,
    description text NOT NULL,
    where_occurred text,
    impact text,
    suggestion text,
    attachment_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
    status text NOT NULL DEFAULT 'new'::text,
    submitted_by uuid NOT NULL,
    assigned_to uuid,
    response text,
    responded_by uuid,
    responded_at timestamp with time zone,
    converted_task_id uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.gamification_kpi_rules ----
CREATE TABLE IF NOT EXISTS public.gamification_kpi_rules (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    title_fa text NOT NULL,
    title_en text,
    description text,
    event_key text NOT NULL,
    xp_amount numeric NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.gamification_kpis ----
CREATE TABLE IF NOT EXISTS public.gamification_kpis (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    key text NOT NULL,
    label_fa text NOT NULL,
    description text,
    weight numeric NOT NULL DEFAULT 1,
    enabled boolean NOT NULL DEFAULT true,
    team_scope text NOT NULL DEFAULT 'all'::text,
    source text NOT NULL DEFAULT 'invoices'::text,
    unit text,
    direction text NOT NULL DEFAULT 'higher_better'::text,
    display_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.gamification_rewards ----
CREATE TABLE IF NOT EXISTS public.gamification_rewards (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    key text NOT NULL,
    title_fa text NOT NULL,
    description text,
    trigger_type text NOT NULL,
    trigger_value numeric DEFAULT 0,
    reward_type text NOT NULL,
    reward_value numeric,
    notes text,
    enabled boolean NOT NULL DEFAULT true,
    display_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    title_en text,
    trigger_ref_id uuid,
    reward_unit text NOT NULL DEFAULT 'custom'::text,
    requires_manual_approval boolean NOT NULL DEFAULT true,
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0
);

-- ---- Table: public.inquiries ----
CREATE TABLE IF NOT EXISTS public.inquiries (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL,
    group_id uuid NOT NULL,
    requested_by uuid NOT NULL,
    assigned_to uuid NOT NULL,
    status inquiry_status NOT NULL DEFAULT 'pending'::inquiry_status,
    message_id uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    answered_at timestamp with time zone,
    closed_at timestamp with time zone
);

-- ---- Table: public.inquiry_price_cache ----
CREATE TABLE IF NOT EXISTS public.inquiry_price_cache (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL,
    price bigint NOT NULL,
    valid_until timestamp with time zone NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.inquiry_replies ----
CREATE TABLE IF NOT EXISTS public.inquiry_replies (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    inquiry_id uuid NOT NULL,
    user_id uuid NOT NULL,
    price bigint NOT NULL,
    is_valid boolean NOT NULL DEFAULT true,
    note text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.inquiry_status_history ----
CREATE TABLE IF NOT EXISTS public.inquiry_status_history (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    inquiry_id uuid NOT NULL,
    from_status inquiry_status,
    to_status inquiry_status NOT NULL,
    changed_by uuid,
    changed_at timestamp with time zone NOT NULL DEFAULT now(),
    reason text
);

-- ---- Table: public.inquiry_transfers ----
CREATE TABLE IF NOT EXISTS public.inquiry_transfers (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    inquiry_id uuid NOT NULL,
    from_user uuid NOT NULL,
    to_user uuid NOT NULL,
    transferred_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.invoice_items ----
CREATE TABLE IF NOT EXISTS public.invoice_items (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity numeric(18,3) NOT NULL,
    unit_price numeric(18,2) NOT NULL,
    discount numeric(18,2) NOT NULL DEFAULT 0,
    line_total numeric(18,2) NOT NULL
);

-- ---- Table: public.invoice_workflow_stages ----
CREATE TABLE IF NOT EXISTS public.invoice_workflow_stages (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    title text NOT NULL,
    order_index integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.invoices ----
CREATE TABLE IF NOT EXISTS public.invoices (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    number text,
    customer_id uuid,
    status text NOT NULL DEFAULT 'draft'::text,
    issue_date date NOT NULL DEFAULT CURRENT_DATE,
    due_date date,
    subtotal numeric(18,2) NOT NULL DEFAULT 0,
    tax_amount numeric(18,2) NOT NULL DEFAULT 0,
    discount_amount numeric(18,2) NOT NULL DEFAULT 0,
    total_amount numeric(18,2) NOT NULL DEFAULT 0,
    notes text,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    type text NOT NULL DEFAULT 'pre_invoice'::text,
    sale_price_type_id uuid,
    settlement_type_id uuid,
    invoice_type text NOT NULL DEFAULT 'pre_invoice'::text,
    deposit_amount numeric(15,2),
    commitment_confirmed boolean NOT NULL DEFAULT false,
    issued_by uuid
);

-- ---- Table: public.journal_entries ----
CREATE TABLE IF NOT EXISTS public.journal_entries (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    source_type text NOT NULL,
    source_id uuid NOT NULL,
    entry_date date NOT NULL DEFAULT CURRENT_DATE,
    description text,
    status text NOT NULL DEFAULT 'posted'::text,
    posted_by uuid,
    posted_at timestamp with time zone NOT NULL DEFAULT now(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    payer_accounting_code text,
    receiver_accounting_code text
);

-- ---- Table: public.journal_lines ----
CREATE TABLE IF NOT EXISTS public.journal_lines (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    journal_entry_id uuid NOT NULL,
    line_no integer NOT NULL,
    account_kind text NOT NULL,
    account_ref_id uuid,
    description text,
    debit numeric NOT NULL DEFAULT 0,
    credit numeric NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.knowledge_articles ----
CREATE TABLE IF NOT EXISTS public.knowledge_articles (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    title text NOT NULL,
    slug text,
    content text,
    category text,
    is_published boolean NOT NULL DEFAULT false,
    author_id uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.knowledge_confirmations ----
CREATE TABLE IF NOT EXISTS public.knowledge_confirmations (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    document_id uuid NOT NULL,
    user_id uuid NOT NULL,
    confirmed_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.knowledge_documents ----
CREATE TABLE IF NOT EXISTS public.knowledge_documents (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    title text NOT NULL,
    content text NOT NULL,
    category text NOT NULL,
    access_level text NOT NULL DEFAULT 'all'::text,
    version integer NOT NULL DEFAULT 1,
    is_published boolean NOT NULL DEFAULT false,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.league_seasons ----
CREATE TABLE IF NOT EXISTS public.league_seasons (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    season_name text,
    start_date date,
    end_date date,
    is_active boolean NOT NULL DEFAULT false,
    settled_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    title_fa text,
    title_en text,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    status text NOT NULL DEFAULT 'draft'::text,
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.league_settings ----
CREATE TABLE IF NOT EXISTS public.league_settings (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    promotion_percent numeric NOT NULL DEFAULT 20,
    demotion_percent numeric NOT NULL DEFAULT 20,
    season_duration_days integer DEFAULT 30,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    tier league_tier,
    title_fa text,
    title_en text,
    min_level integer NOT NULL DEFAULT 0,
    min_xp numeric NOT NULL DEFAULT 0,
    sort_order integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true
);

-- ---- Table: public.market_indicators ----
CREATE TABLE IF NOT EXISTS public.market_indicators (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    code text NOT NULL,
    title_fa text NOT NULL,
    title_en text,
    category text NOT NULL,
    unit text NOT NULL DEFAULT 'toman'::text,
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.market_product_match_events ----
CREATE TABLE IF NOT EXISTS public.market_product_match_events (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    match_id uuid NOT NULL,
    event_type text NOT NULL,
    old_status market_match_status,
    new_status market_match_status,
    actor market_match_actor NOT NULL DEFAULT 'system'::market_match_actor,
    actor_user_id uuid,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.market_product_matches ----
CREATE TABLE IF NOT EXISTS public.market_product_matches (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    source_name market_match_source NOT NULL,
    source_product_url text,
    source_product_id text,
    source_title text NOT NULL,
    normalized_source_title text,
    afrakala_product_id uuid,
    afrakala_product_name_snapshot text,
    match_status market_match_status NOT NULL DEFAULT 'pending'::market_match_status,
    confidence_score numeric(5,2),
    matched_by market_match_actor NOT NULL DEFAULT 'system'::market_match_actor,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    reject_reason text,
    notes text,
    last_seen_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.market_rate_ingestion_runs ----
CREATE TABLE IF NOT EXISTS public.market_rate_ingestion_runs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    source_id uuid,
    source_code text NOT NULL,
    started_by uuid,
    status text NOT NULL DEFAULT 'started'::text,
    fetched_count integer NOT NULL DEFAULT 0,
    inserted_count integer NOT NULL DEFAULT 0,
    suspect_count integer NOT NULL DEFAULT 0,
    error_message text,
    started_at timestamp with time zone NOT NULL DEFAULT now(),
    finished_at timestamp with time zone
);

-- ---- Table: public.market_rate_source_mappings ----
CREATE TABLE IF NOT EXISTS public.market_rate_source_mappings (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    source_id uuid NOT NULL,
    indicator_id uuid NOT NULL,
    source_symbol text NOT NULL,
    normalize_multiplier numeric NOT NULL DEFAULT 1,
    is_enabled boolean NOT NULL DEFAULT true,
    note text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.market_rate_sources ----
CREATE TABLE IF NOT EXISTS public.market_rate_sources (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    code text NOT NULL,
    title_fa text NOT NULL,
    source_type text NOT NULL,
    base_url text,
    is_enabled boolean NOT NULL DEFAULT true,
    confidence_weight numeric NOT NULL DEFAULT 1,
    fetch_interval_seconds integer,
    requires_api_key boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.market_rate_ticks ----
CREATE TABLE IF NOT EXISTS public.market_rate_ticks (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    indicator_id uuid NOT NULL,
    source_id uuid NOT NULL,
    value numeric NOT NULL,
    unit text NOT NULL DEFAULT 'toman'::text,
    observed_at timestamp with time zone NOT NULL DEFAULT now(),
    source_reported_at timestamp with time zone,
    jalali_date_label text,
    change_amount numeric,
    change_percent numeric,
    raw_payload jsonb,
    confidence_score numeric,
    status text NOT NULL DEFAULT 'accepted'::text,
    note text,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.marketing_channels ----
CREATE TABLE IF NOT EXISTS public.marketing_channels (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    weight integer NOT NULL DEFAULT 50,
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    daily_quota integer
);

-- ---- Table: public.message_embeddings ----
CREATE TABLE IF NOT EXISTS public.message_embeddings (
    message_id uuid NOT NULL,
    group_id uuid NOT NULL,
    embedding vector(768) NOT NULL,
    content_excerpt text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.messages ----
CREATE TABLE IF NOT EXISTS public.messages (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    sender_id uuid NOT NULL,
    recipient_id uuid NOT NULL,
    subject text,
    body text NOT NULL,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.messenger_attachments ----
CREATE TABLE IF NOT EXISTS public.messenger_attachments (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    message_id uuid NOT NULL,
    file_path text NOT NULL,
    file_name text NOT NULL,
    file_type text NOT NULL,
    file_size bigint NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.messenger_group_members ----
CREATE TABLE IF NOT EXISTS public.messenger_group_members (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL DEFAULT 'member'::text,
    joined_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.messenger_groups ----
CREATE TABLE IF NOT EXISTS public.messenger_groups (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    type text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.messenger_messages ----
CREATE TABLE IF NOT EXISTS public.messenger_messages (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    group_id uuid NOT NULL,
    sender_id uuid,
    content text,
    type text NOT NULL DEFAULT 'text'::text,
    reply_to uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    edited_at timestamp with time zone,
    deleted_at timestamp with time zone
);

-- ---- Table: public.messenger_read_receipts ----
CREATE TABLE IF NOT EXISTS public.messenger_read_receipts (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    read_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.missions ----
CREATE TABLE IF NOT EXISTS public.missions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    key text NOT NULL,
    title_fa text NOT NULL,
    description text,
    target_value numeric NOT NULL DEFAULT 1,
    xp_reward integer NOT NULL DEFAULT 0,
    frequency text NOT NULL DEFAULT 'daily'::text,
    enabled boolean NOT NULL DEFAULT true,
    display_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    title_en text,
    mission_type text NOT NULL DEFAULT 'daily'::text,
    condition_event_key text,
    condition_operator text,
    condition_value numeric,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    repeat_rule text NOT NULL DEFAULT 'none'::text,
    sort_order integer NOT NULL DEFAULT 0,
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.notification_events ----
CREATE TABLE IF NOT EXISTS public.notification_events (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    event_type text NOT NULL,
    user_id uuid,
    channel text NOT NULL DEFAULT 'internal'::text,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'pending'::text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    processed_at timestamp with time zone
);

-- ---- Table: public.notification_queue ----
CREATE TABLE IF NOT EXISTS public.notification_queue (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    type text NOT NULL DEFAULT 'stock_alert'::text,
    reference_type text,
    reference_id uuid,
    is_read boolean NOT NULL DEFAULT false,
    read_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.payment_receipt_custom_fields ----
CREATE TABLE IF NOT EXISTS public.payment_receipt_custom_fields (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    field_key text NOT NULL,
    field_label text NOT NULL,
    field_type text NOT NULL DEFAULT 'text'::text,
    field_options jsonb,
    is_required boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.payment_receipt_documents ----
CREATE TABLE IF NOT EXISTS public.payment_receipt_documents (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    receipt_id uuid NOT NULL,
    storage_path text NOT NULL,
    file_name text NOT NULL,
    file_type text NOT NULL,
    file_size bigint NOT NULL,
    uploaded_by uuid NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    extraction_status text NOT NULL DEFAULT 'pending'::text,
    extracted_data jsonb,
    extraction_confidence numeric,
    extraction_notes text
);

-- ---- Table: public.payment_receipt_links ----
CREATE TABLE IF NOT EXISTS public.payment_receipt_links (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    receipt_id uuid NOT NULL,
    invoice_id uuid NOT NULL,
    amount numeric(15,2) NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.payment_receipts ----
CREATE TABLE IF NOT EXISTS public.payment_receipts (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    customer_id uuid NOT NULL,
    payer_name text NOT NULL,
    payer_phone text,
    payer_accounting_code text,
    receiver_name text NOT NULL,
    receiver_phone text,
    receiver_accounting_code text,
    amount numeric(15,2) NOT NULL,
    payment_date date NOT NULL,
    payment_time time without time zone NOT NULL,
    tracking_number text NOT NULL,
    bank_name text,
    receipt_image_url text,
    description text,
    status text NOT NULL DEFAULT 'pending_review'::text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    rejection_reason text,
    receipt_type text NOT NULL DEFAULT 'payment'::text,
    source_bank text,
    destination_bank text,
    payer_name_on_receipt text,
    receiver_name_on_receipt text,
    has_perforation boolean NOT NULL DEFAULT false,
    document_channel text,
    is_typed_receipt boolean NOT NULL DEFAULT false,
    security_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
    posting_status text NOT NULL DEFAULT 'unposted'::text,
    posted_at timestamp with time zone,
    receipt_time text,
    source_bank_account_id uuid,
    destination_bank_account_id uuid,
    receiver_party_id uuid,
    custom_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    beneficiary_accounting_code text
);

-- ---- Table: public.payment_terms ----
CREATE TABLE IF NOT EXISTS public.payment_terms (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    days integer,
    is_active boolean NOT NULL DEFAULT true,
    notes text,
    sort_order integer NOT NULL DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.penalty_appeals ----
CREATE TABLE IF NOT EXISTS public.penalty_appeals (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    penalty_id uuid NOT NULL,
    appellant_id uuid NOT NULL,
    reason text NOT NULL,
    status text NOT NULL DEFAULT 'pending'::text,
    deadline timestamp with time zone NOT NULL DEFAULT (now() + '24:00:00'::interval),
    review_deadline timestamp with time zone NOT NULL DEFAULT (now() + '72:00:00'::interval),
    review_note text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    reviewed_at timestamp with time zone
);

-- ---- Table: public.performance_penalties ----
CREATE TABLE IF NOT EXISTS public.performance_penalties (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    inquiry_id uuid,
    type text NOT NULL,
    severity text NOT NULL,
    description text,
    created_by uuid,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.person_context_links ----
CREATE TABLE IF NOT EXISTS public.person_context_links (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    person_id uuid NOT NULL,
    context_kind text NOT NULL,
    ref_table text,
    ref_id uuid,
    note text,
    started_at timestamp with time zone NOT NULL DEFAULT now(),
    ended_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.person_field_definitions ----
CREATE TABLE IF NOT EXISTS public.person_field_definitions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    label text NOT NULL,
    field_type text NOT NULL,
    options jsonb,
    is_required boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 100,
    help_text text,
    validation_regex text,
    applies_to_kind text NOT NULL DEFAULT 'both'::text,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.person_field_values ----
CREATE TABLE IF NOT EXISTS public.person_field_values (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    person_id uuid NOT NULL,
    field_definition_id uuid NOT NULL,
    value jsonb NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.person_identifiers ----
CREATE TABLE IF NOT EXISTS public.person_identifiers (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    person_id uuid NOT NULL,
    kind text NOT NULL,
    value_raw text NOT NULL,
    value_normalized text NOT NULL,
    status text NOT NULL DEFAULT 'provisional'::text,
    is_primary boolean NOT NULL DEFAULT false,
    verified_at timestamp with time zone,
    verified_by uuid,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.persons ----
CREATE TABLE IF NOT EXISTS public.persons (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    kind text NOT NULL DEFAULT 'individual'::text,
    display_name text NOT NULL,
    legal_name text,
    visibility_scope text NOT NULL DEFAULT 'internal_general'::text,
    is_active boolean NOT NULL DEFAULT true,
    notes text,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.price_alert_notifications ----
CREATE TABLE IF NOT EXISTS public.price_alert_notifications (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    alert_rule_id uuid NOT NULL,
    product_id uuid NOT NULL,
    sale_price_type_id uuid,
    title text NOT NULL,
    message text NOT NULL,
    current_price numeric,
    previous_price numeric,
    change_percent numeric,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.price_alert_rules ----
CREATE TABLE IF NOT EXISTS public.price_alert_rules (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    product_id uuid NOT NULL,
    sale_price_type_id uuid,
    operator text NOT NULL,
    target_value numeric,
    target_currency text NOT NULL DEFAULT 'toman'::text,
    baseline_price numeric,
    baseline_change_percent numeric,
    stock_status_from text,
    stock_status_to text,
    is_active boolean NOT NULL DEFAULT true,
    is_repeatable boolean NOT NULL DEFAULT false,
    last_triggered_at timestamp with time zone,
    triggered_count integer NOT NULL DEFAULT 0,
    note text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.price_calculation_snapshots ----
CREATE TABLE IF NOT EXISTS public.price_calculation_snapshots (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL,
    purchase_price_id uuid,
    pricing_rule_id uuid,
    settlement_type_id uuid,
    input_purchase_price numeric NOT NULL,
    input_currency currency_code NOT NULL,
    currency_rate numeric NOT NULL,
    purchase_price_toman numeric NOT NULL,
    shipping_cost numeric NOT NULL DEFAULT 0,
    margin_amount numeric NOT NULL DEFAULT 0,
    final_sale_price numeric NOT NULL,
    rounded_sale_price numeric NOT NULL,
    calculation_details jsonb,
    calculated_by uuid,
    calculated_at timestamp with time zone NOT NULL DEFAULT now(),
    sale_price_type_id uuid
);

-- ---- Table: public.price_change_reasons ----
CREATE TABLE IF NOT EXISTS public.price_change_reasons (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    title text NOT NULL,
    description text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.price_list_items ----
CREATE TABLE IF NOT EXISTS public.price_list_items (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    price_list_id uuid NOT NULL,
    product_id uuid NOT NULL,
    unit_price numeric(18,2) NOT NULL,
    min_qty numeric(18,3) DEFAULT 1
);

-- ---- Table: public.price_lists ----
CREATE TABLE IF NOT EXISTS public.price_lists (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    currency text NOT NULL DEFAULT 'IRR'::text,
    is_active boolean NOT NULL DEFAULT true,
    effective_from date,
    effective_to date,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.pricing_board_access_requests ----
CREATE TABLE IF NOT EXISTS public.pricing_board_access_requests (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    board_key text NOT NULL,
    user_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'pending'::text,
    requested_at timestamp with time zone NOT NULL DEFAULT now(),
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    review_note text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.pricing_board_settings ----
CREATE TABLE IF NOT EXISTS public.pricing_board_settings (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    board_key text NOT NULL,
    sale_price_type_id uuid NOT NULL,
    title text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    updated_by uuid,
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.pricing_board_viewer_sessions ----
CREATE TABLE IF NOT EXISTS public.pricing_board_viewer_sessions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    board_key text NOT NULL,
    user_id uuid NOT NULL,
    sale_price_type_id uuid,
    entered_at timestamp with time zone NOT NULL DEFAULT now(),
    last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
    left_at timestamp with time zone,
    user_agent text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.pricing_recompute_queue ----
CREATE TABLE IF NOT EXISTS public.pricing_recompute_queue (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL,
    reason text NOT NULL,
    source_table text,
    source_id uuid,
    sale_price_type_id uuid,
    status text NOT NULL DEFAULT 'pending'::text,
    priority integer NOT NULL DEFAULT 100,
    attempts integer NOT NULL DEFAULT 0,
    enqueued_at timestamp with time zone NOT NULL DEFAULT now(),
    started_at timestamp with time zone,
    processed_at timestamp with time zone,
    error text,
    created_by uuid
);

-- ---- Table: public.pricing_rules ----
CREATE TABLE IF NOT EXISTS public.pricing_rules (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    version integer NOT NULL DEFAULT 1,
    is_active boolean NOT NULL DEFAULT true,
    priority integer NOT NULL DEFAULT 100,
    conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
    actions jsonb NOT NULL DEFAULT '{}'::jsonb,
    effective_from date,
    effective_to date,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    rule_name text,
    product_type product_type,
    category_id uuid,
    brand_id uuid,
    min_purchase_price_toman numeric,
    max_purchase_price_toman numeric,
    settlement_type_id uuid,
    margin_type margin_type,
    margin_value numeric,
    fixed_margin_value numeric,
    sale_price_type_id uuid
);

-- ---- Table: public.product_attribute_groups ----
CREATE TABLE IF NOT EXISTS public.product_attribute_groups (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    key text NOT NULL,
    label_fa text NOT NULL,
    value_type text NOT NULL DEFAULT 'select'::text,
    is_active boolean NOT NULL DEFAULT true,
    is_system boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.product_attributes ----
CREATE TABLE IF NOT EXISTS public.product_attributes (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    type product_attribute_type NOT NULL,
    name text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    group_id uuid,
    category_id uuid
);

-- ---- Table: public.product_category_attribute_values ----
CREATE TABLE IF NOT EXISTS public.product_category_attribute_values (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL,
    category_attribute_id uuid NOT NULL,
    value text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.product_computed_prices ----
CREATE TABLE IF NOT EXISTS public.product_computed_prices (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL,
    sale_price_type_id uuid NOT NULL,
    purchase_price_id uuid,
    pricing_rule_id uuid,
    input_purchase_price numeric NOT NULL,
    input_currency text NOT NULL,
    currency_rate numeric NOT NULL,
    purchase_price_toman numeric NOT NULL,
    shipping_cost numeric NOT NULL DEFAULT 0,
    margin_amount numeric NOT NULL DEFAULT 0,
    final_sale_price numeric NOT NULL,
    rounded_sale_price numeric NOT NULL,
    computed_at timestamp with time zone NOT NULL DEFAULT now(),
    computed_by uuid,
    source text NOT NULL DEFAULT 'manual'::text
);

-- ---- Table: public.product_interaction_events ----
CREATE TABLE IF NOT EXISTS public.product_interaction_events (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid,
    product_id uuid NOT NULL,
    event_type text NOT NULL,
    source text NOT NULL,
    sale_price_type_id uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.product_label_links ----
CREATE TABLE IF NOT EXISTS public.product_label_links (
    product_id uuid NOT NULL,
    label_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.product_labels ----
CREATE TABLE IF NOT EXISTS public.product_labels (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    title text NOT NULL,
    color text NOT NULL DEFAULT '#0ea5e9'::text,
    description text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    weight integer NOT NULL DEFAULT 0,
    visibility text NOT NULL DEFAULT 'public'::text
);

-- ---- Table: public.product_owner_assignments ----
CREATE TABLE IF NOT EXISTS public.product_owner_assignments (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL,
    user_id uuid NOT NULL,
    assigned_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.product_recommendation_overrides ----
CREATE TABLE IF NOT EXISTS public.product_recommendation_overrides (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL,
    recommended_product_id uuid NOT NULL,
    priority integer NOT NULL DEFAULT 0,
    is_pinned boolean NOT NULL DEFAULT false,
    is_disabled boolean NOT NULL DEFAULT false,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.product_sale_price_history ----
CREATE TABLE IF NOT EXISTS public.product_sale_price_history (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL,
    snapshot_id uuid,
    old_sale_price numeric,
    new_sale_price numeric NOT NULL,
    change_amount numeric,
    change_percent numeric,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    sale_price_type_id uuid
);

-- ---- Table: public.product_sku_counters ----
CREATE TABLE IF NOT EXISTS public.product_sku_counters (
    year integer NOT NULL,
    last_value integer NOT NULL DEFAULT 0,
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.product_suppliers ----
CREATE TABLE IF NOT EXISTS public.product_suppliers (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL,
    supplier_id uuid NOT NULL,
    is_primary boolean NOT NULL DEFAULT false,
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    auto_added boolean NOT NULL DEFAULT false
);

-- ---- Table: public.products ----
CREATE TABLE IF NOT EXISTS public.products (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    sku text,
    name text NOT NULL,
    description text,
    unit text,
    category text,
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    brand_id uuid,
    category_id uuid,
    product_type product_type NOT NULL DEFAULT 'iranian'::product_type,
    base_currency text NOT NULL DEFAULT 'toman'::text,
    stock_status stock_status NOT NULL DEFAULT 'unknown'::stock_status,
    status product_status NOT NULL DEFAULT 'active'::product_status,
    technical_notes text,
    updated_by uuid,
    color text,
    capacity text,
    model text,
    primary_spec text,
    dedup_key text DEFAULT 
CASE
    WHEN ((brand_id IS NULL) OR (category_id IS NULL)) THEN NULL::text
    ELSE (((((((((brand_id)::text || '|'::text) || (category_id)::text) || '|'::text) || COALESCE(normalize_fa(model), ''::text)) || '|'::text) || COALESCE(normalize_fa(color), ''::text)) || '|'::text) || COALESCE(normalize_fa(capacity), ''::text))
END
);

-- ---- Table: public.profile_field_definitions ----
CREATE TABLE IF NOT EXISTS public.profile_field_definitions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    label text NOT NULL,
    field_type profile_field_type NOT NULL DEFAULT 'text'::profile_field_type,
    options jsonb NOT NULL DEFAULT '[]'::jsonb,
    is_required boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    show_on_register boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    help_text text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.profile_field_values ----
CREATE TABLE IF NOT EXISTS public.profile_field_values (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    field_name text NOT NULL,
    value jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.profiles ----
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid NOT NULL,
    full_name text,
    phone text,
    avatar_url text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'active'::text,
    "position" text,
    registered_at timestamp with time zone NOT NULL DEFAULT now(),
    birth_date date
);

-- ---- Table: public.purchase_items ----
CREATE TABLE IF NOT EXISTS public.purchase_items (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    purchase_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity numeric(18,3) NOT NULL,
    unit_price numeric(18,2) NOT NULL,
    line_total numeric(18,2) NOT NULL
);

-- ---- Table: public.purchase_prices ----
CREATE TABLE IF NOT EXISTS public.purchase_prices (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL,
    supplier_id uuid,
    purchase_price numeric NOT NULL,
    currency currency_code NOT NULL DEFAULT 'toman'::currency_code,
    effective_at timestamp with time zone NOT NULL DEFAULT now(),
    expires_at timestamp with time zone,
    reason_id uuid,
    private_note text,
    registered_by uuid,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.purchase_receipts ----
CREATE TABLE IF NOT EXISTS public.purchase_receipts (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL,
    uploaded_by uuid NOT NULL,
    storage_path text NOT NULL,
    file_name text NOT NULL,
    file_size bigint,
    mime_type text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.purchase_request_status_history ----
CREATE TABLE IF NOT EXISTS public.purchase_request_status_history (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL,
    from_status text,
    to_status text NOT NULL,
    changed_by uuid NOT NULL,
    note text,
    changed_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.purchase_requests ----
CREATE TABLE IF NOT EXISTS public.purchase_requests (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    inquiry_id uuid,
    product_id uuid NOT NULL,
    quantity numeric NOT NULL,
    unit text NOT NULL DEFAULT 'عدد'::text,
    requested_by uuid NOT NULL,
    assigned_to uuid,
    status text NOT NULL DEFAULT 'pending'::text,
    notes text,
    expected_price numeric,
    final_price numeric,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.purchases ----
CREATE TABLE IF NOT EXISTS public.purchases (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    number text,
    supplier_id uuid,
    status text NOT NULL DEFAULT 'draft'::text,
    total_amount numeric(18,2) NOT NULL DEFAULT 0,
    notes text,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    product_id uuid,
    purchase_price numeric(18,2),
    currency text,
    quantity integer NOT NULL DEFAULT 1,
    purchase_date date NOT NULL DEFAULT CURRENT_DATE,
    payment_term_id uuid,
    cash_price numeric(18,2),
    cash_price_currency text,
    paid_at timestamp with time zone,
    paid_by uuid
);

-- ---- Table: public.recent_purchase_settings ----
CREATE TABLE IF NOT EXISTS public.recent_purchase_settings (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    singleton boolean NOT NULL DEFAULT true,
    limited_after_hours numeric(6,2) NOT NULL DEFAULT 6,
    unavailable_after_hours numeric(6,2) NOT NULL DEFAULT 12,
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_by uuid
);

-- ---- Table: public.role_permissions ----
CREATE TABLE IF NOT EXISTS public.role_permissions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    role_name text NOT NULL,
    module text NOT NULL,
    can_view boolean NOT NULL DEFAULT true,
    can_create boolean NOT NULL DEFAULT false,
    can_update boolean NOT NULL DEFAULT false,
    can_delete boolean NOT NULL DEFAULT false,
    can_approve boolean NOT NULL DEFAULT false,
    can_export boolean NOT NULL DEFAULT false,
    can_view_sensitive boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.sale_list_items ----
CREATE TABLE IF NOT EXISTS public.sale_list_items (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    sale_list_id uuid NOT NULL,
    product_id uuid NOT NULL,
    current_price numeric(18,2) NOT NULL,
    previous_price numeric(18,2),
    change_amount numeric(18,2),
    change_percent numeric(8,2),
    stock_status text,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.sale_list_versions ----
CREATE TABLE IF NOT EXISTS public.sale_list_versions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    sale_list_id uuid NOT NULL,
    version_number integer NOT NULL,
    snapshot_data jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.sale_lists ----
CREATE TABLE IF NOT EXISTS public.sale_lists (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    terms_text text,
    sale_price_type_id uuid NOT NULL,
    created_by uuid NOT NULL,
    version_number integer NOT NULL DEFAULT 1,
    status text NOT NULL DEFAULT 'draft'::text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    selected_columns jsonb,
    published_at timestamp with time zone,
    seller_info text,
    pdf_brand_order jsonb,
    pdf_product_order_by_brand jsonb,
    settlement_type_id uuid
);

-- ---- Table: public.sale_price_types ----
CREATE TABLE IF NOT EXISTS public.sale_price_types (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    code text NOT NULL,
    title text NOT NULL,
    description text,
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 100,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.sales_quote_counters ----
CREATE TABLE IF NOT EXISTS public.sales_quote_counters (
    year integer NOT NULL,
    last_value integer NOT NULL DEFAULT 0,
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.sales_quote_items ----
CREATE TABLE IF NOT EXISTS public.sales_quote_items (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    quote_id uuid NOT NULL,
    product_id uuid,
    free_item_name text,
    sku_snapshot text,
    title_snapshot text,
    sale_price_type_id uuid,
    quantity numeric NOT NULL,
    unit_price numeric NOT NULL,
    discount_amount numeric NOT NULL DEFAULT 0,
    line_total numeric NOT NULL,
    source sales_quote_item_source NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.sales_quote_send_queue ----
CREATE TABLE IF NOT EXISTS public.sales_quote_send_queue (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    share_log_id uuid,
    quote_id uuid NOT NULL,
    channel text NOT NULL,
    recipient text NOT NULL,
    message_text text,
    pdf_attached boolean NOT NULL DEFAULT true,
    status text NOT NULL DEFAULT 'pending'::text,
    attempts integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 3,
    last_error text,
    scheduled_at timestamp with time zone NOT NULL DEFAULT now(),
    locked_at timestamp with time zone,
    processed_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.sales_quote_share_logs ----
CREATE TABLE IF NOT EXISTS public.sales_quote_share_logs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    quote_id uuid NOT NULL,
    channel text NOT NULL,
    recipient text NOT NULL,
    status text NOT NULL DEFAULT 'draft'::text,
    message_text text,
    pdf_attached boolean NOT NULL DEFAULT false,
    attempted_by uuid,
    attempted_at timestamp with time zone NOT NULL DEFAULT now(),
    result_message text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.sales_quotes ----
CREATE TABLE IF NOT EXISTS public.sales_quotes (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    quote_number text NOT NULL,
    customer_name text NOT NULL,
    customer_phone text NOT NULL,
    customer_note text,
    salesperson_id uuid,
    status sales_quote_status NOT NULL DEFAULT 'draft'::sales_quote_status,
    subtotal_amount numeric NOT NULL DEFAULT 0,
    discount_amount numeric NOT NULL DEFAULT 0,
    final_amount numeric NOT NULL DEFAULT 0,
    expires_at timestamp with time zone,
    canceled_at timestamp with time zone,
    canceled_by uuid,
    cancel_reason text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.salesperson_capital_allocations ----
CREATE TABLE IF NOT EXISTS public.salesperson_capital_allocations (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    capital_snapshot_id uuid NOT NULL,
    capital_date date NOT NULL,
    salesperson_id uuid NOT NULL,
    score numeric NOT NULL DEFAULT 0,
    score_source text NOT NULL DEFAULT 'employee_scores.monthly_score'::text,
    total_score numeric NOT NULL DEFAULT 0,
    system_suggested_amount numeric NOT NULL DEFAULT 0,
    final_amount numeric NOT NULL DEFAULT 0,
    override_reason text,
    status text NOT NULL DEFAULT 'draft'::text,
    created_by uuid,
    approved_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    held_amount numeric NOT NULL DEFAULT 0,
    consumed_amount numeric NOT NULL DEFAULT 0
);

-- ---- Table: public.score_snapshots ----
CREATE TABLE IF NOT EXISTS public.score_snapshots (
    id bigint NOT NULL DEFAULT nextval('score_snapshots_id_seq'::regclass),
    employee_id uuid NOT NULL,
    daily_score numeric NOT NULL DEFAULT 0,
    weekly_score numeric NOT NULL DEFAULT 0,
    monthly_score numeric NOT NULL DEFAULT 0,
    total_score numeric NOT NULL DEFAULT 0,
    normalized_score numeric NOT NULL DEFAULT 0,
    captured_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.settlement_types ----
CREATE TABLE IF NOT EXISTS public.settlement_types (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    code text NOT NULL,
    title text NOT NULL,
    description text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    sort_order integer NOT NULL DEFAULT 0
);

-- ---- Table: public.shipping_cost_rules ----
CREATE TABLE IF NOT EXISTS public.shipping_cost_rules (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    title text NOT NULL,
    cost_type shipping_cost_type NOT NULL,
    cost_value numeric NOT NULL,
    product_type product_type,
    category_id uuid,
    min_purchase_price numeric,
    max_purchase_price numeric,
    is_active boolean NOT NULL DEFAULT true,
    priority integer NOT NULL DEFAULT 100,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    product_id uuid,
    brand_id uuid,
    sort_order integer NOT NULL DEFAULT 0,
    cost_currency text
);

-- ---- Table: public.shop_settings ----
CREATE TABLE IF NOT EXISTS public.shop_settings (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    key text NOT NULL,
    value text NOT NULL DEFAULT ''::text,
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_by uuid
);

-- ---- Table: public.stock_alert_requests ----
CREATE TABLE IF NOT EXISTS public.stock_alert_requests (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL,
    customer_name text NOT NULL,
    customer_phone text NOT NULL,
    salesperson_id uuid,
    note text,
    status stock_alert_status NOT NULL DEFAULT 'open'::stock_alert_status,
    priority stock_alert_priority NOT NULL DEFAULT 'normal'::stock_alert_priority,
    requested_at timestamp with time zone NOT NULL DEFAULT now(),
    resolved_at timestamp with time zone,
    resolved_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.suppliers ----
CREATE TABLE IF NOT EXISTS public.suppliers (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    phone text,
    email text,
    address text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    contact_name text,
    city text,
    notes text,
    trust_level text,
    is_active boolean NOT NULL DEFAULT true,
    status text NOT NULL DEFAULT 'active'::text,
    created_by uuid
);

-- ---- Table: public.tasks ----
CREATE TABLE IF NOT EXISTS public.tasks (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    title text NOT NULL,
    description text,
    assigned_to uuid,
    status text NOT NULL DEFAULT 'pending'::text,
    priority text NOT NULL DEFAULT 'normal'::text,
    due_date date,
    reference_type text,
    reference_id uuid,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    completed_at timestamp with time zone
);

-- ---- Table: public.user_roles ----
CREATE TABLE IF NOT EXISTS public.user_roles (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    role app_role NOT NULL,
    assigned_by uuid,
    assigned_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.validation_rules ----
CREATE TABLE IF NOT EXISTS public.validation_rules (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    scope text NOT NULL,
    field_key text NOT NULL,
    rule_type text NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    severity text NOT NULL DEFAULT 'warning'::text,
    message text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.waybill_custom_fields ----
CREATE TABLE IF NOT EXISTS public.waybill_custom_fields (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    field_key text NOT NULL,
    field_label text NOT NULL,
    field_type text NOT NULL DEFAULT 'text'::text,
    field_options jsonb,
    is_required boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.waybill_items ----
CREATE TABLE IF NOT EXISTS public.waybill_items (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    waybill_id uuid NOT NULL,
    invoice_item_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity numeric NOT NULL,
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Table: public.waybill_number_counter ----
CREATE TABLE IF NOT EXISTS public.waybill_number_counter (
    day date NOT NULL,
    last_value integer NOT NULL DEFAULT 0
);

-- ---- Table: public.waybills ----
CREATE TABLE IF NOT EXISTS public.waybills (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL,
    waybill_number text NOT NULL,
    sender_name text NOT NULL,
    sender_phone text NOT NULL,
    receiver_name text NOT NULL,
    receiver_phone text NOT NULL,
    customer_accounting_code text,
    shipping_company text NOT NULL,
    destination_city text NOT NULL,
    destination_address text,
    shipping_notes text,
    status text NOT NULL DEFAULT 'draft'::text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    custom_data jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- ---- Table: public.workflow_settings ----
CREATE TABLE IF NOT EXISTS public.workflow_settings (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    process_key text NOT NULL,
    process_name_fa text NOT NULL,
    uploader_role text,
    reviewer_role text,
    timer_minutes integer NOT NULL DEFAULT 10,
    penalty_enabled boolean NOT NULL DEFAULT true,
    penalty_for text,
    is_active boolean NOT NULL DEFAULT true,
    updated_by uuid,
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);


-- ============ CONSTRAINTS (PK / UNIQUE / CHECK / FK) ============
ALTER TABLE public.academy_courses ADD CONSTRAINT academy_courses_pkey PRIMARY KEY (id);
ALTER TABLE public.academy_lessons ADD CONSTRAINT academy_lessons_pkey PRIMARY KEY (id);
ALTER TABLE public.academy_quiz_attempts ADD CONSTRAINT academy_quiz_attempts_pkey PRIMARY KEY (id);
ALTER TABLE public.academy_quiz_questions ADD CONSTRAINT academy_quiz_questions_pkey PRIMARY KEY (id);
ALTER TABLE public.academy_quizzes ADD CONSTRAINT academy_quizzes_pkey PRIMARY KEY (id);
ALTER TABLE public.academy_user_progress ADD CONSTRAINT academy_user_progress_pkey PRIMARY KEY (id);
ALTER TABLE public.achievements ADD CONSTRAINT achievements_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_conversations ADD CONSTRAINT ai_conversations_pkey PRIMARY KEY (id);
ALTER TABLE public.appeal_reviewers ADD CONSTRAINT appeal_reviewers_pkey PRIMARY KEY (id);
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.bank_accounts ADD CONSTRAINT bank_accounts_pkey PRIMARY KEY (id);
ALTER TABLE public.bot_api_key_label_access ADD CONSTRAINT bot_api_key_label_access_pkey PRIMARY KEY (api_key_id, label_id);
ALTER TABLE public.bot_api_key_table_access ADD CONSTRAINT bot_api_key_table_access_pkey PRIMARY KEY (id);
ALTER TABLE public.bot_api_keys ADD CONSTRAINT bot_api_keys_pkey PRIMARY KEY (id);
ALTER TABLE public.bot_api_usage_logs ADD CONSTRAINT bot_api_usage_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.brands ADD CONSTRAINT brands_pkey PRIMARY KEY (id);
ALTER TABLE public.call_logs ADD CONSTRAINT call_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.capital_allocation_ledger ADD CONSTRAINT capital_allocation_ledger_pkey PRIMARY KEY (id);
ALTER TABLE public.categories ADD CONSTRAINT categories_pkey PRIMARY KEY (id);
ALTER TABLE public.category_product_attributes ADD CONSTRAINT category_product_attributes_pkey PRIMARY KEY (id);
ALTER TABLE public.credit_requests ADD CONSTRAINT credit_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.credit_score_snapshots ADD CONSTRAINT credit_score_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE public.credit_scoring_rules ADD CONSTRAINT credit_scoring_rules_pkey PRIMARY KEY (id);
ALTER TABLE public.currencies ADD CONSTRAINT currencies_pkey PRIMARY KEY (id);
ALTER TABLE public.currency_rate_fetches ADD CONSTRAINT currency_rate_fetches_pkey PRIMARY KEY (id);
ALTER TABLE public.currency_rates ADD CONSTRAINT currency_rates_pkey PRIMARY KEY (id);
ALTER TABLE public.currency_sources ADD CONSTRAINT currency_sources_pkey PRIMARY KEY (id);
ALTER TABLE public.custom_roles ADD CONSTRAINT custom_roles_pkey PRIMARY KEY (id);
ALTER TABLE public.customer_capital_allocations ADD CONSTRAINT customer_capital_allocations_pkey PRIMARY KEY (id);
ALTER TABLE public.customer_credit_balance ADD CONSTRAINT customer_credit_balance_pkey PRIMARY KEY (customer_id);
ALTER TABLE public.customer_credit_ledger ADD CONSTRAINT customer_credit_ledger_pkey PRIMARY KEY (id);
ALTER TABLE public.customer_credit_profile ADD CONSTRAINT customer_credit_profile_pkey PRIMARY KEY (id);
ALTER TABLE public.customers ADD CONSTRAINT customers_pkey PRIMARY KEY (id);
ALTER TABLE public.daily_capital_inputs ADD CONSTRAINT daily_capital_inputs_pkey PRIMARY KEY (id);
ALTER TABLE public.daily_capital_snapshots ADD CONSTRAINT daily_capital_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE public.daily_mood_entries ADD CONSTRAINT daily_mood_entries_pkey PRIMARY KEY (id);
ALTER TABLE public.daily_mood_hafez_poems ADD CONSTRAINT daily_mood_hafez_poems_pkey PRIMARY KEY (id);
ALTER TABLE public.daily_mood_questions ADD CONSTRAINT daily_mood_questions_pkey PRIMARY KEY (id);
ALTER TABLE public.daily_mood_scenarios ADD CONSTRAINT daily_mood_scenarios_pkey PRIMARY KEY (id);
ALTER TABLE public.delivery_receipt_status_history ADD CONSTRAINT delivery_receipt_status_history_pkey PRIMARY KEY (id);
ALTER TABLE public.delivery_receipts ADD CONSTRAINT delivery_receipts_pkey PRIMARY KEY (id);
ALTER TABLE public.document_status_history ADD CONSTRAINT document_status_history_pkey PRIMARY KEY (id);
ALTER TABLE public.documents ADD CONSTRAINT documents_pkey PRIMARY KEY (id);
ALTER TABLE public.dynamic_table_cells ADD CONSTRAINT dynamic_table_cells_pkey PRIMARY KEY (id);
ALTER TABLE public.dynamic_table_columns ADD CONSTRAINT dynamic_table_columns_pkey PRIMARY KEY (id);
ALTER TABLE public.dynamic_table_row_counters ADD CONSTRAINT dynamic_table_row_counters_pkey PRIMARY KEY (table_id);
ALTER TABLE public.dynamic_table_rows ADD CONSTRAINT dynamic_table_rows_pkey PRIMARY KEY (id);
ALTER TABLE public.dynamic_tables ADD CONSTRAINT dynamic_tables_pkey PRIMARY KEY (id);
ALTER TABLE public.employee_achievements ADD CONSTRAINT employee_achievements_pkey PRIMARY KEY (id);
ALTER TABLE public.employee_leagues ADD CONSTRAINT employee_leagues_pkey PRIMARY KEY (id);
ALTER TABLE public.employee_level_up_events ADD CONSTRAINT employee_level_up_events_pkey PRIMARY KEY (id);
ALTER TABLE public.employee_mission_progress ADD CONSTRAINT employee_mission_progress_pkey PRIMARY KEY (id);
ALTER TABLE public.employee_progress ADD CONSTRAINT employee_progress_pkey PRIMARY KEY (employee_id);
ALTER TABLE public.employee_score_events ADD CONSTRAINT employee_score_events_pkey PRIMARY KEY (id);
ALTER TABLE public.employee_scores ADD CONSTRAINT employee_scores_pkey PRIMARY KEY (employee_id);
ALTER TABLE public.employee_streaks ADD CONSTRAINT employee_streaks_pkey PRIMARY KEY (id);
ALTER TABLE public.external_parties ADD CONSTRAINT external_parties_pkey PRIMARY KEY (id);
ALTER TABLE public.feedback ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);
ALTER TABLE public.feedback_items ADD CONSTRAINT feedback_items_pkey PRIMARY KEY (id);
ALTER TABLE public.gamification_kpi_rules ADD CONSTRAINT gamification_kpi_rules_pkey PRIMARY KEY (id);
ALTER TABLE public.gamification_kpis ADD CONSTRAINT gamification_kpis_pkey PRIMARY KEY (id);
ALTER TABLE public.gamification_rewards ADD CONSTRAINT gamification_rewards_pkey PRIMARY KEY (id);
ALTER TABLE public.inquiries ADD CONSTRAINT inquiries_pkey PRIMARY KEY (id);
ALTER TABLE public.inquiry_price_cache ADD CONSTRAINT inquiry_price_cache_pkey PRIMARY KEY (id);
ALTER TABLE public.inquiry_replies ADD CONSTRAINT inquiry_replies_pkey PRIMARY KEY (id);
ALTER TABLE public.inquiry_status_history ADD CONSTRAINT inquiry_status_history_pkey PRIMARY KEY (id);
ALTER TABLE public.inquiry_transfers ADD CONSTRAINT inquiry_transfers_pkey PRIMARY KEY (id);
ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);
ALTER TABLE public.invoice_workflow_stages ADD CONSTRAINT invoice_workflow_stages_pkey PRIMARY KEY (id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);
ALTER TABLE public.journal_lines ADD CONSTRAINT journal_lines_pkey PRIMARY KEY (id);
ALTER TABLE public.knowledge_articles ADD CONSTRAINT knowledge_articles_pkey PRIMARY KEY (id);
ALTER TABLE public.knowledge_confirmations ADD CONSTRAINT knowledge_confirmations_pkey PRIMARY KEY (id);
ALTER TABLE public.knowledge_documents ADD CONSTRAINT knowledge_documents_pkey PRIMARY KEY (id);
ALTER TABLE public.league_seasons ADD CONSTRAINT league_seasons_pkey PRIMARY KEY (id);
ALTER TABLE public.league_settings ADD CONSTRAINT league_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.market_indicators ADD CONSTRAINT market_indicators_pkey PRIMARY KEY (id);
ALTER TABLE public.market_product_match_events ADD CONSTRAINT market_product_match_events_pkey PRIMARY KEY (id);
ALTER TABLE public.market_product_matches ADD CONSTRAINT market_product_matches_pkey PRIMARY KEY (id);
ALTER TABLE public.market_rate_ingestion_runs ADD CONSTRAINT market_rate_ingestion_runs_pkey PRIMARY KEY (id);
ALTER TABLE public.market_rate_source_mappings ADD CONSTRAINT market_rate_source_mappings_pkey PRIMARY KEY (id);
ALTER TABLE public.market_rate_sources ADD CONSTRAINT market_rate_sources_pkey PRIMARY KEY (id);
ALTER TABLE public.market_rate_ticks ADD CONSTRAINT market_rate_ticks_pkey PRIMARY KEY (id);
ALTER TABLE public.marketing_channels ADD CONSTRAINT marketing_channels_pkey PRIMARY KEY (id);
ALTER TABLE public.message_embeddings ADD CONSTRAINT message_embeddings_pkey PRIMARY KEY (message_id);
ALTER TABLE public.messages ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
ALTER TABLE public.messenger_attachments ADD CONSTRAINT messenger_attachments_pkey PRIMARY KEY (id);
ALTER TABLE public.messenger_group_members ADD CONSTRAINT messenger_group_members_pkey PRIMARY KEY (id);
ALTER TABLE public.messenger_groups ADD CONSTRAINT messenger_groups_pkey PRIMARY KEY (id);
ALTER TABLE public.messenger_messages ADD CONSTRAINT messenger_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.messenger_read_receipts ADD CONSTRAINT messenger_read_receipts_pkey PRIMARY KEY (id);
ALTER TABLE public.missions ADD CONSTRAINT missions_pkey PRIMARY KEY (id);
ALTER TABLE public.notification_events ADD CONSTRAINT notification_events_pkey PRIMARY KEY (id);
ALTER TABLE public.notification_queue ADD CONSTRAINT notification_queue_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_receipt_custom_fields ADD CONSTRAINT payment_receipt_custom_fields_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_receipt_documents ADD CONSTRAINT payment_receipt_documents_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_receipt_links ADD CONSTRAINT payment_receipt_links_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_receipts ADD CONSTRAINT payment_receipts_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_terms ADD CONSTRAINT payment_terms_pkey PRIMARY KEY (id);
ALTER TABLE public.penalty_appeals ADD CONSTRAINT penalty_appeals_pkey PRIMARY KEY (id);
ALTER TABLE public.performance_penalties ADD CONSTRAINT performance_penalties_pkey PRIMARY KEY (id);
ALTER TABLE public.person_context_links ADD CONSTRAINT person_context_links_pkey PRIMARY KEY (id);
ALTER TABLE public.person_field_definitions ADD CONSTRAINT person_field_definitions_pkey PRIMARY KEY (id);
ALTER TABLE public.person_field_values ADD CONSTRAINT person_field_values_pkey PRIMARY KEY (id);
ALTER TABLE public.person_identifiers ADD CONSTRAINT person_identifiers_pkey PRIMARY KEY (id);
ALTER TABLE public.persons ADD CONSTRAINT persons_pkey PRIMARY KEY (id);
ALTER TABLE public.price_alert_notifications ADD CONSTRAINT price_alert_notifications_pkey PRIMARY KEY (id);
ALTER TABLE public.price_alert_rules ADD CONSTRAINT price_alert_rules_pkey PRIMARY KEY (id);
ALTER TABLE public.price_calculation_snapshots ADD CONSTRAINT price_calculation_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE public.price_change_reasons ADD CONSTRAINT price_change_reasons_pkey PRIMARY KEY (id);
ALTER TABLE public.price_list_items ADD CONSTRAINT price_list_items_pkey PRIMARY KEY (id);
ALTER TABLE public.price_lists ADD CONSTRAINT price_lists_pkey PRIMARY KEY (id);
ALTER TABLE public.pricing_board_access_requests ADD CONSTRAINT pricing_board_access_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.pricing_board_settings ADD CONSTRAINT pricing_board_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.pricing_board_viewer_sessions ADD CONSTRAINT pricing_board_viewer_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.pricing_recompute_queue ADD CONSTRAINT pricing_recompute_queue_pkey PRIMARY KEY (id);
ALTER TABLE public.pricing_rules ADD CONSTRAINT pricing_rules_pkey PRIMARY KEY (id);
ALTER TABLE public.product_attribute_groups ADD CONSTRAINT product_attribute_groups_pkey PRIMARY KEY (id);
ALTER TABLE public.product_attributes ADD CONSTRAINT product_attributes_pkey PRIMARY KEY (id);
ALTER TABLE public.product_category_attribute_values ADD CONSTRAINT product_category_attribute_values_pkey PRIMARY KEY (id);
ALTER TABLE public.product_computed_prices ADD CONSTRAINT product_computed_prices_pkey PRIMARY KEY (id);
ALTER TABLE public.product_interaction_events ADD CONSTRAINT product_interaction_events_pkey PRIMARY KEY (id);
ALTER TABLE public.product_label_links ADD CONSTRAINT product_label_links_pkey PRIMARY KEY (product_id, label_id);
ALTER TABLE public.product_labels ADD CONSTRAINT product_labels_pkey PRIMARY KEY (id);
ALTER TABLE public.product_owner_assignments ADD CONSTRAINT product_owner_assignments_pkey PRIMARY KEY (id);
ALTER TABLE public.product_recommendation_overrides ADD CONSTRAINT product_recommendation_overrides_pkey PRIMARY KEY (id);
ALTER TABLE public.product_sale_price_history ADD CONSTRAINT product_sale_price_history_pkey PRIMARY KEY (id);
ALTER TABLE public.product_sku_counters ADD CONSTRAINT product_sku_counters_pkey PRIMARY KEY (year);
ALTER TABLE public.product_suppliers ADD CONSTRAINT product_suppliers_pkey PRIMARY KEY (id);
ALTER TABLE public.products ADD CONSTRAINT products_pkey PRIMARY KEY (id);
ALTER TABLE public.profile_field_definitions ADD CONSTRAINT profile_field_definitions_pkey PRIMARY KEY (id);
ALTER TABLE public.profile_field_values ADD CONSTRAINT profile_field_values_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.purchase_items ADD CONSTRAINT purchase_items_pkey PRIMARY KEY (id);
ALTER TABLE public.purchase_prices ADD CONSTRAINT purchase_prices_pkey PRIMARY KEY (id);
ALTER TABLE public.purchase_receipts ADD CONSTRAINT purchase_receipts_pkey PRIMARY KEY (id);
ALTER TABLE public.purchase_request_status_history ADD CONSTRAINT purchase_request_status_history_pkey PRIMARY KEY (id);
ALTER TABLE public.purchase_requests ADD CONSTRAINT purchase_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.purchases ADD CONSTRAINT purchases_pkey PRIMARY KEY (id);
ALTER TABLE public.recent_purchase_settings ADD CONSTRAINT recent_purchase_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);
ALTER TABLE public.sale_list_items ADD CONSTRAINT sale_list_items_pkey PRIMARY KEY (id);
ALTER TABLE public.sale_list_versions ADD CONSTRAINT sale_list_versions_pkey PRIMARY KEY (id);
ALTER TABLE public.sale_lists ADD CONSTRAINT sale_lists_pkey PRIMARY KEY (id);
ALTER TABLE public.sale_price_types ADD CONSTRAINT sale_price_types_pkey PRIMARY KEY (id);
ALTER TABLE public.sales_quote_counters ADD CONSTRAINT sales_quote_counters_pkey PRIMARY KEY (year);
ALTER TABLE public.sales_quote_items ADD CONSTRAINT sales_quote_items_pkey PRIMARY KEY (id);
ALTER TABLE public.sales_quote_send_queue ADD CONSTRAINT sales_quote_send_queue_pkey PRIMARY KEY (id);
ALTER TABLE public.sales_quote_share_logs ADD CONSTRAINT sales_quote_share_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.sales_quotes ADD CONSTRAINT sales_quotes_pkey PRIMARY KEY (id);
ALTER TABLE public.salesperson_capital_allocations ADD CONSTRAINT salesperson_capital_allocations_pkey PRIMARY KEY (id);
ALTER TABLE public.score_snapshots ADD CONSTRAINT score_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE public.settlement_types ADD CONSTRAINT settlement_types_pkey PRIMARY KEY (id);
ALTER TABLE public.shipping_cost_rules ADD CONSTRAINT shipping_cost_rules_pkey PRIMARY KEY (id);
ALTER TABLE public.shop_settings ADD CONSTRAINT shop_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.stock_alert_requests ADD CONSTRAINT stock_alert_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);
ALTER TABLE public.validation_rules ADD CONSTRAINT validation_rules_pkey PRIMARY KEY (id);
ALTER TABLE public.waybill_custom_fields ADD CONSTRAINT waybill_custom_fields_pkey PRIMARY KEY (id);
ALTER TABLE public.waybill_items ADD CONSTRAINT waybill_items_pkey PRIMARY KEY (id);
ALTER TABLE public.waybill_number_counter ADD CONSTRAINT waybill_number_counter_pkey PRIMARY KEY (day);
ALTER TABLE public.waybills ADD CONSTRAINT waybills_pkey PRIMARY KEY (id);
ALTER TABLE public.workflow_settings ADD CONSTRAINT workflow_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.academy_quizzes ADD CONSTRAINT academy_quizzes_lesson_id_key UNIQUE (lesson_id);
ALTER TABLE public.academy_user_progress ADD CONSTRAINT academy_user_progress_user_id_course_id_lesson_id_key UNIQUE (user_id, course_id, lesson_id);
ALTER TABLE public.achievements ADD CONSTRAINT achievements_key_key UNIQUE (key);
ALTER TABLE public.appeal_reviewers ADD CONSTRAINT appeal_reviewers_appeal_id_reviewer_id_key UNIQUE (appeal_id, reviewer_id);
ALTER TABLE public.bot_api_key_table_access ADD CONSTRAINT bot_api_key_table_access_api_key_id_table_id_key UNIQUE (api_key_id, table_id);
ALTER TABLE public.brands ADD CONSTRAINT brands_slug_key UNIQUE (slug);
ALTER TABLE public.categories ADD CONSTRAINT categories_slug_key UNIQUE (slug);
ALTER TABLE public.category_product_attributes ADD CONSTRAINT cpa_unique_category_key UNIQUE (category_id, attribute_key);
ALTER TABLE public.credit_scoring_rules ADD CONSTRAINT credit_scoring_rules_parameter_name_key UNIQUE (parameter_name);
ALTER TABLE public.currencies ADD CONSTRAINT currencies_code_key UNIQUE (code);
ALTER TABLE public.currencies ADD CONSTRAINT currencies_code_unique UNIQUE (code);
ALTER TABLE public.custom_roles ADD CONSTRAINT custom_roles_name_key UNIQUE (name);
ALTER TABLE public.customer_credit_profile ADD CONSTRAINT customer_credit_profile_customer_id_key UNIQUE (customer_id);
ALTER TABLE public.daily_mood_scenarios ADD CONSTRAINT daily_mood_scenarios_scenario_key_key UNIQUE (scenario_key);
ALTER TABLE public.dynamic_table_cells ADD CONSTRAINT dynamic_table_cells_row_col_unique UNIQUE (row_id, column_id);
ALTER TABLE public.dynamic_table_cells ADD CONSTRAINT dynamic_table_cells_row_id_column_id_key UNIQUE (row_id, column_id);
ALTER TABLE public.dynamic_table_columns ADD CONSTRAINT dynamic_table_columns_table_id_column_key_key UNIQUE (table_id, column_key);
ALTER TABLE public.dynamic_table_rows ADD CONSTRAINT dynamic_table_rows_table_id_row_number_key UNIQUE (table_id, row_number);
ALTER TABLE public.dynamic_tables ADD CONSTRAINT dynamic_tables_slug_key UNIQUE (slug);
ALTER TABLE public.employee_achievements ADD CONSTRAINT employee_achievements_employee_id_achievement_id_key UNIQUE (employee_id, achievement_id);
ALTER TABLE public.employee_leagues ADD CONSTRAINT employee_leagues_employee_id_season_id_key UNIQUE (employee_id, season_id);
ALTER TABLE public.employee_mission_progress ADD CONSTRAINT employee_mission_progress_employee_id_mission_id_period_key_key UNIQUE (employee_id, mission_id, period_key);
ALTER TABLE public.employee_streaks ADD CONSTRAINT employee_streaks_employee_id_streak_type_key UNIQUE (employee_id, streak_type);
ALTER TABLE public.external_parties ADD CONSTRAINT external_parties_accounting_code_key UNIQUE (accounting_code);
ALTER TABLE public.gamification_kpi_rules ADD CONSTRAINT gamification_kpi_rules_event_key_key UNIQUE (event_key);
ALTER TABLE public.gamification_kpis ADD CONSTRAINT gamification_kpis_key_key UNIQUE (key);
ALTER TABLE public.gamification_rewards ADD CONSTRAINT gamification_rewards_key_key UNIQUE (key);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_number_key UNIQUE (number);
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_source_unique UNIQUE (source_type, source_id);
ALTER TABLE public.knowledge_articles ADD CONSTRAINT knowledge_articles_slug_key UNIQUE (slug);
ALTER TABLE public.knowledge_confirmations ADD CONSTRAINT knowledge_confirmations_document_id_user_id_key UNIQUE (document_id, user_id);
ALTER TABLE public.league_seasons ADD CONSTRAINT league_seasons_season_name_key UNIQUE (season_name);
ALTER TABLE public.market_indicators ADD CONSTRAINT market_indicators_code_key UNIQUE (code);
ALTER TABLE public.market_rate_source_mappings ADD CONSTRAINT market_rate_source_mappings_source_id_indicator_id_key UNIQUE (source_id, indicator_id);
ALTER TABLE public.market_rate_sources ADD CONSTRAINT market_rate_sources_code_key UNIQUE (code);
ALTER TABLE public.messenger_group_members ADD CONSTRAINT messenger_group_members_group_id_user_id_key UNIQUE (group_id, user_id);
ALTER TABLE public.messenger_read_receipts ADD CONSTRAINT messenger_read_receipts_message_id_user_id_key UNIQUE (message_id, user_id);
ALTER TABLE public.missions ADD CONSTRAINT missions_key_key UNIQUE (key);
ALTER TABLE public.payment_receipt_custom_fields ADD CONSTRAINT payment_receipt_custom_fields_field_key_key UNIQUE (field_key);
ALTER TABLE public.payment_receipt_links ADD CONSTRAINT payment_receipt_links_unique UNIQUE (receipt_id, invoice_id);
ALTER TABLE public.payment_terms ADD CONSTRAINT payment_terms_name_unique UNIQUE (name);
ALTER TABLE public.penalty_appeals ADD CONSTRAINT penalty_appeals_penalty_id_key UNIQUE (penalty_id);
ALTER TABLE public.person_field_definitions ADD CONSTRAINT person_field_definitions_name_key UNIQUE (name);
ALTER TABLE public.person_field_values ADD CONSTRAINT person_field_values_person_id_field_definition_id_key UNIQUE (person_id, field_definition_id);
ALTER TABLE public.price_list_items ADD CONSTRAINT price_list_items_price_list_id_product_id_key UNIQUE (price_list_id, product_id);
ALTER TABLE public.pricing_board_settings ADD CONSTRAINT pricing_board_settings_board_key_key UNIQUE (board_key);
ALTER TABLE public.product_attribute_groups ADD CONSTRAINT product_attribute_groups_key_key UNIQUE (key);
ALTER TABLE public.product_category_attribute_values ADD CONSTRAINT pcav_unique_product_attr UNIQUE (product_id, category_attribute_id);
ALTER TABLE public.product_computed_prices ADD CONSTRAINT product_computed_prices_product_id_sale_price_type_id_key UNIQUE (product_id, sale_price_type_id);
ALTER TABLE public.product_owner_assignments ADD CONSTRAINT product_owner_assignments_product_id_user_id_key UNIQUE (product_id, user_id);
ALTER TABLE public.product_recommendation_overrides ADD CONSTRAINT pro_unique UNIQUE (product_id, recommended_product_id);
ALTER TABLE public.product_suppliers ADD CONSTRAINT product_suppliers_product_id_supplier_id_key UNIQUE (product_id, supplier_id);
ALTER TABLE public.products ADD CONSTRAINT products_sku_key UNIQUE (sku);
ALTER TABLE public.products ADD CONSTRAINT products_sku_unique UNIQUE (sku);
ALTER TABLE public.profile_field_definitions ADD CONSTRAINT profile_field_definitions_name_key UNIQUE (name);
ALTER TABLE public.profile_field_values ADD CONSTRAINT profile_field_values_user_id_field_name_key UNIQUE (user_id, field_name);
ALTER TABLE public.purchases ADD CONSTRAINT purchases_number_key UNIQUE (number);
ALTER TABLE public.recent_purchase_settings ADD CONSTRAINT recent_purchase_settings_singleton_key UNIQUE (singleton);
ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_role_name_module_key UNIQUE (role_name, module);
ALTER TABLE public.sale_price_types ADD CONSTRAINT sale_price_types_code_key UNIQUE (code);
ALTER TABLE public.sales_quotes ADD CONSTRAINT sales_quotes_quote_number_key UNIQUE (quote_number);
ALTER TABLE public.settlement_types ADD CONSTRAINT settlement_types_code_key UNIQUE (code);
ALTER TABLE public.shop_settings ADD CONSTRAINT shop_settings_key_key UNIQUE (key);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);
ALTER TABLE public.validation_rules ADD CONSTRAINT validation_rules_unique UNIQUE (scope, field_key, rule_type);
ALTER TABLE public.waybill_custom_fields ADD CONSTRAINT waybill_custom_fields_field_key_key UNIQUE (field_key);
ALTER TABLE public.waybill_items ADD CONSTRAINT waybill_items_waybill_id_invoice_item_id_key UNIQUE (waybill_id, invoice_item_id);
ALTER TABLE public.waybills ADD CONSTRAINT waybills_waybill_number_key UNIQUE (waybill_number);
ALTER TABLE public.workflow_settings ADD CONSTRAINT workflow_settings_process_key_key UNIQUE (process_key);
ALTER TABLE public.academy_quizzes ADD CONSTRAINT academy_quizzes_passing_score_check CHECK (((passing_score >= 0) AND (passing_score <= 100)));
ALTER TABLE public.achievements ADD CONSTRAINT achievements_condition_operator_chk CHECK (((condition_operator IS NULL) OR (condition_operator = ANY (ARRAY['>='::text, '>'::text, '='::text, '<='::text, '<'::text]))));
ALTER TABLE public.achievements ADD CONSTRAINT achievements_condition_value_chk CHECK (((condition_value IS NULL) OR (condition_value > (0)::numeric)));
ALTER TABLE public.achievements ADD CONSTRAINT achievements_rule_type_check CHECK ((rule_type = ANY (ARRAY['manual'::text, 'level'::text, 'streak'::text, 'score'::text, 'missions_completed'::text])));
ALTER TABLE public.achievements ADD CONSTRAINT achievements_xp_reward_chk CHECK ((xp_reward >= 0));
ALTER TABLE public.ai_conversations ADD CONSTRAINT ai_conversations_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])));
ALTER TABLE public.appeal_reviewers ADD CONSTRAINT appeal_reviewers_role_check CHECK ((role = ANY (ARRAY['manager'::text, 'representative'::text, 'neutral'::text])));
ALTER TABLE public.appeal_reviewers ADD CONSTRAINT appeal_reviewers_vote_check CHECK ((vote = ANY (ARRAY['accept'::text, 'reject'::text])));
ALTER TABLE public.bot_api_keys ADD CONSTRAINT bot_api_keys_name_len CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 120)));
ALTER TABLE public.call_logs ADD CONSTRAINT call_logs_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])));
ALTER TABLE public.capital_allocation_ledger ADD CONSTRAINT capital_allocation_ledger_allocation_kind_check CHECK ((allocation_kind = ANY (ARRAY['customer'::text, 'salesperson'::text])));
ALTER TABLE public.capital_allocation_ledger ADD CONSTRAINT capital_allocation_ledger_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['hold'::text, 'release'::text, 'consume'::text, 'refund'::text])));
ALTER TABLE public.categories ADD CONSTRAINT categories_naming_template_len_chk CHECK (((naming_template IS NULL) OR (char_length(naming_template) <= 300)));
ALTER TABLE public.categories ADD CONSTRAINT categories_primary_spec_label_len_chk CHECK (((primary_spec_label IS NULL) OR (char_length(primary_spec_label) <= 80)));
ALTER TABLE public.category_product_attributes ADD CONSTRAINT cpa_attribute_key_chk CHECK (((attribute_key ~ '^[a-z0-9_]+$'::text) AND ((char_length(attribute_key) >= 1) AND (char_length(attribute_key) <= 60))));
ALTER TABLE public.category_product_attributes ADD CONSTRAINT cpa_help_text_len_chk CHECK (((help_text IS NULL) OR (char_length(help_text) <= 500)));
ALTER TABLE public.category_product_attributes ADD CONSTRAINT cpa_input_type_chk CHECK ((input_type = ANY (ARRAY['text'::text, 'number'::text, 'select'::text, 'boolean'::text, 'date'::text])));
ALTER TABLE public.category_product_attributes ADD CONSTRAINT cpa_label_fa_len_chk CHECK (((char_length(label_fa) >= 1) AND (char_length(label_fa) <= 120)));
ALTER TABLE public.category_product_attributes ADD CONSTRAINT cpa_options_is_array_chk CHECK ((jsonb_typeof(options) = 'array'::text));
ALTER TABLE public.category_product_attributes ADD CONSTRAINT cpa_sort_order_chk CHECK ((sort_order >= 0));
ALTER TABLE public.credit_requests ADD CONSTRAINT credit_requests_requested_amount_check CHECK ((requested_amount > (0)::numeric));
ALTER TABLE public.credit_requests ADD CONSTRAINT credit_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE public.credit_score_snapshots ADD CONSTRAINT credit_score_snapshots_score_check CHECK (((score >= 0) AND (score <= 100)));
ALTER TABLE public.credit_scoring_rules ADD CONSTRAINT credit_scoring_rules_weight_check CHECK (((weight >= (0)::numeric) AND (weight <= (1)::numeric)));
ALTER TABLE public.credit_scoring_rules ADD CONSTRAINT credit_scoring_rules_window_months_chk CHECK (((window_months >= 1) AND (window_months <= 60)));
ALTER TABLE public.currency_rate_fetches ADD CONSTRAINT currency_rate_fetches_rate_check CHECK ((rate > (0)::numeric));
ALTER TABLE public.currency_rate_fetches ADD CONSTRAINT currency_rate_fetches_status_check CHECK ((status = ANY (ARRAY['pending_review'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE public.currency_rates ADD CONSTRAINT currency_rates_rate_to_toman_check CHECK ((rate_to_toman > (0)::numeric));
ALTER TABLE public.customer_capital_allocations ADD CONSTRAINT ccap_final_nonneg CHECK ((final_amount >= (0)::numeric));
ALTER TABLE public.customer_capital_allocations ADD CONSTRAINT ccap_status_chk CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text])));
ALTER TABLE public.customer_capital_allocations ADD CONSTRAINT ccap_suggested_nonneg CHECK ((system_suggested_amount >= (0)::numeric));
ALTER TABLE public.customer_capital_allocations ADD CONSTRAINT customer_capital_allocations_consumed_amount_check CHECK ((consumed_amount >= (0)::numeric));
ALTER TABLE public.customer_capital_allocations ADD CONSTRAINT customer_capital_allocations_held_amount_check CHECK ((held_amount >= (0)::numeric));
ALTER TABLE public.customer_credit_ledger ADD CONSTRAINT customer_credit_ledger_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['hold'::text, 'release'::text, 'charge'::text, 'payment'::text, 'adjustment'::text])));
ALTER TABLE public.customer_credit_profile ADD CONSTRAINT customer_credit_profile_credit_limit_check CHECK ((credit_limit >= (0)::numeric));
ALTER TABLE public.customer_credit_profile ADD CONSTRAINT customer_credit_profile_credit_score_check CHECK (((credit_score >= 0) AND (credit_score <= 100)));
ALTER TABLE public.customers ADD CONSTRAINT customers_accounting_code_format CHECK (((accounting_code IS NULL) OR (accounting_code ~ '^[A-Za-z0-9_-]{1,30}$'::text)));
ALTER TABLE public.customers ADD CONSTRAINT customers_birth_date_not_future CHECK (((birth_date IS NULL) OR (birth_date <= CURRENT_DATE))) NOT VALID;
ALTER TABLE public.delivery_receipts ADD CONSTRAINT delivery_receipts_status_check CHECK ((status = ANY (ARRAY['pending_review'::text, 'confirmed'::text, 'rejected'::text, 'expired'::text])));
ALTER TABLE public.delivery_receipts ADD CONSTRAINT delivery_receipts_type_check CHECK ((type = ANY (ARRAY['shipping_receipt'::text, 'delivery_receipt'::text])));
ALTER TABLE public.documents ADD CONSTRAINT documents_reference_type_check CHECK (((reference_type = ANY (ARRAY['inquiry'::text, 'purchase_request'::text])) OR (reference_type IS NULL)));
ALTER TABLE public.documents ADD CONSTRAINT documents_status_check CHECK ((status = ANY (ARRAY['pending_review'::text, 'confirmed'::text, 'rejected'::text, 'expired'::text])));
ALTER TABLE public.documents ADD CONSTRAINT documents_type_check CHECK ((type = ANY (ARRAY['bijak'::text, 'invoice'::text, 'havale'::text])));
ALTER TABLE public.dynamic_table_columns ADD CONSTRAINT dynamic_columns_computed_requires_key CHECK (((is_computed = false) OR (formula_key IS NOT NULL)));
ALTER TABLE public.dynamic_table_columns ADD CONSTRAINT dynamic_columns_formula_key_whitelist CHECK (((formula_key IS NULL) OR (formula_key = ANY (ARRAY['latest_purchase_price_toman'::text, 'min_sale_price'::text, 'latest_batch_average_price'::text, 'price_gap_to_market_avg'::text, 'price_gap_percent_to_market_avg'::text]))));
ALTER TABLE public.dynamic_table_columns ADD CONSTRAINT dynamic_columns_key_format CHECK (((column_key ~ '^[a-z0-9_]+$'::text) AND ((length(column_key) >= 1) AND (length(column_key) <= 64))));
ALTER TABLE public.dynamic_table_columns ADD CONSTRAINT dynamic_columns_label_len CHECK (((length(btrim(label)) >= 1) AND (length(btrim(label)) <= 120)));
ALTER TABLE public.dynamic_tables ADD CONSTRAINT dynamic_tables_access_level_check CHECK ((access_level = ANY (ARRAY['all'::text, 'manager_only'::text, 'finance_only'::text, 'admin_only'::text, 'sales_only'::text, 'custom'::text])));
ALTER TABLE public.dynamic_tables ADD CONSTRAINT dynamic_tables_allowed_roles_is_array CHECK ((jsonb_typeof(allowed_roles) = 'array'::text));
ALTER TABLE public.dynamic_tables ADD CONSTRAINT dynamic_tables_name_len CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 120)));
ALTER TABLE public.dynamic_tables ADD CONSTRAINT dynamic_tables_slug_format CHECK (((slug ~ '^[a-z0-9-]+$'::text) AND ((length(slug) >= 2) AND (length(slug) <= 64))));
ALTER TABLE public.feedback_items ADD CONSTRAINT feedback_items_status_check CHECK ((status = ANY (ARRAY['new'::text, 'reviewing'::text, 'accepted'::text, 'rejected'::text, 'converted_to_task'::text, 'closed'::text])));
ALTER TABLE public.feedback_items ADD CONSTRAINT feedback_items_type_check CHECK ((type = ANY (ARRAY['bug'::text, 'process_issue'::text, 'improvement'::text, 'operational'::text])));
ALTER TABLE public.gamification_kpi_rules ADD CONSTRAINT gamification_kpi_rules_xp_amount_check CHECK ((xp_amount >= (0)::numeric));
ALTER TABLE public.gamification_kpis ADD CONSTRAINT gamification_kpis_direction_check CHECK ((direction = ANY (ARRAY['higher_better'::text, 'lower_better'::text])));
ALTER TABLE public.gamification_kpis ADD CONSTRAINT gamification_kpis_team_scope_check CHECK ((team_scope = ANY (ARRAY['all'::text, 'sales'::text, 'support'::text, 'manager'::text])));
ALTER TABLE public.gamification_rewards ADD CONSTRAINT gamification_rewards_reward_type_chk CHECK ((reward_type = ANY (ARRAY['gift_card'::text, 'cash_bonus'::text, 'commission_bonus'::text, 'paid_leave'::text, 'badge_reward'::text, 'custom'::text])));
ALTER TABLE public.gamification_rewards ADD CONSTRAINT gamification_rewards_reward_unit_chk CHECK ((reward_unit = ANY (ARRAY['toman'::text, 'day'::text, 'percent'::text, 'point'::text, 'item'::text, 'custom'::text])));
ALTER TABLE public.gamification_rewards ADD CONSTRAINT gamification_rewards_trigger_type_chk CHECK ((trigger_type = ANY (ARRAY['level_reached'::text, 'achievement_unlocked'::text, 'mission_completed'::text, 'league_reached'::text, 'season_top_rank'::text])));
ALTER TABLE public.invoices ADD CONSTRAINT invoices_invoice_type_check CHECK ((invoice_type = ANY (ARRAY['pre_invoice'::text, 'advance_payment'::text])));
ALTER TABLE public.invoices ADD CONSTRAINT invoices_type_check CHECK ((type = ANY (ARRAY['pre_invoice'::text, 'invoice'::text])));
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_status_chk CHECK ((status = ANY (ARRAY['draft'::text, 'posted'::text, 'void'::text])));
ALTER TABLE public.journal_lines ADD CONSTRAINT journal_lines_account_kind_chk CHECK ((account_kind = ANY (ARRAY['customer_credit'::text, 'bank'::text, 'external_party'::text, 'invoice_ar'::text, 'clearing'::text, 'other'::text])));
ALTER TABLE public.journal_lines ADD CONSTRAINT journal_lines_credit_nonneg CHECK ((credit >= (0)::numeric));
ALTER TABLE public.journal_lines ADD CONSTRAINT journal_lines_debit_nonneg CHECK ((debit >= (0)::numeric));
ALTER TABLE public.journal_lines ADD CONSTRAINT journal_lines_one_side CHECK (((NOT ((debit > (0)::numeric) AND (credit > (0)::numeric))) AND (NOT ((debit = (0)::numeric) AND (credit = (0)::numeric)))));
ALTER TABLE public.knowledge_documents ADD CONSTRAINT knowledge_documents_access_level_check CHECK ((access_level = ANY (ARRAY['all'::text, 'manager_only'::text, 'finance_only'::text, 'admin_only'::text])));
ALTER TABLE public.knowledge_documents ADD CONSTRAINT knowledge_documents_category_check CHECK ((category = ANY (ARRAY['sales_rules'::text, 'purchase_rules'::text, 'accounting'::text, 'warehouse'::text, 'product_training'::text, 'circulars'::text, 'general'::text])));
ALTER TABLE public.league_seasons ADD CONSTRAINT league_seasons_status_chk CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'closed'::text])));
ALTER TABLE public.league_settings ADD CONSTRAINT league_settings_demotion_percent_check CHECK (((demotion_percent >= (0)::numeric) AND (demotion_percent <= (100)::numeric)));
ALTER TABLE public.league_settings ADD CONSTRAINT league_settings_promotion_percent_check CHECK (((promotion_percent >= (0)::numeric) AND (promotion_percent <= (100)::numeric)));
ALTER TABLE public.league_settings ADD CONSTRAINT league_settings_season_duration_days_check CHECK ((season_duration_days > 0));
ALTER TABLE public.market_indicators ADD CONSTRAINT market_indicators_category_check CHECK ((category = ANY (ARRAY['currency'::text, 'gold'::text, 'coin'::text, 'official'::text, 'crypto'::text, 'manual'::text])));
ALTER TABLE public.market_product_matches ADD CONSTRAINT mpm_approved_requires_afrakala CHECK (((match_status <> 'approved'::market_match_status) OR (afrakala_product_id IS NOT NULL)));
ALTER TABLE public.market_product_matches ADD CONSTRAINT mpm_confidence_range CHECK (((confidence_score IS NULL) OR ((confidence_score >= (0)::numeric) AND (confidence_score <= (100)::numeric))));
ALTER TABLE public.market_product_matches ADD CONSTRAINT mpm_source_ref_present CHECK (((source_product_url IS NOT NULL) OR (source_product_id IS NOT NULL)));
ALTER TABLE public.market_rate_ingestion_runs ADD CONSTRAINT market_rate_ingestion_runs_status_check CHECK ((status = ANY (ARRAY['started'::text, 'completed'::text, 'failed'::text, 'skipped'::text])));
ALTER TABLE public.market_rate_sources ADD CONSTRAINT market_rate_sources_source_type_check CHECK ((source_type = ANY (ARRAY['manual'::text, 'api'::text, 'scraper'::text])));
ALTER TABLE public.market_rate_ticks ADD CONSTRAINT market_rate_ticks_status_check CHECK ((status = ANY (ARRAY['accepted'::text, 'suspect'::text, 'rejected'::text])));
ALTER TABLE public.market_rate_ticks ADD CONSTRAINT market_rate_ticks_value_check CHECK ((value > (0)::numeric));
ALTER TABLE public.marketing_channels ADD CONSTRAINT marketing_channels_daily_quota_nonneg CHECK (((daily_quota IS NULL) OR (daily_quota >= 0)));
ALTER TABLE public.marketing_channels ADD CONSTRAINT marketing_channels_weight_check CHECK (((weight >= 0) AND (weight <= 100)));
ALTER TABLE public.messenger_group_members ADD CONSTRAINT messenger_group_members_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'member'::text, 'viewer'::text, 'purchaser'::text])));
ALTER TABLE public.messenger_groups ADD CONSTRAINT messenger_groups_type_check CHECK ((type = ANY (ARRAY['private'::text, 'group'::text, 'operational'::text])));
ALTER TABLE public.messenger_messages ADD CONSTRAINT messenger_messages_type_check CHECK ((type = ANY (ARRAY['text'::text, 'image'::text, 'video'::text, 'audio'::text, 'file'::text, 'system'::text, 'inquiry'::text])));
ALTER TABLE public.missions ADD CONSTRAINT missions_condition_operator_chk CHECK (((condition_operator IS NULL) OR (condition_operator = ANY (ARRAY['>='::text, '>'::text, '='::text, '<='::text, '<'::text]))));
ALTER TABLE public.missions ADD CONSTRAINT missions_dates_chk CHECK (((starts_at IS NULL) OR (ends_at IS NULL) OR (ends_at > starts_at)));
ALTER TABLE public.missions ADD CONSTRAINT missions_mission_type_chk CHECK ((mission_type = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text, 'custom'::text])));
ALTER TABLE public.missions ADD CONSTRAINT missions_repeat_rule_chk CHECK ((repeat_rule = ANY (ARRAY['none'::text, 'daily'::text, 'weekly'::text, 'monthly'::text])));
ALTER TABLE public.notification_queue ADD CONSTRAINT notification_queue_type_check CHECK ((type = ANY (ARRAY['stock_alert'::text, 'system'::text, 'task'::text, 'payment'::text])));
ALTER TABLE public.payment_receipt_custom_fields ADD CONSTRAINT payment_receipt_custom_fields_field_type_check CHECK ((field_type = ANY (ARRAY['text'::text, 'number'::text, 'date'::text, 'select'::text])));
ALTER TABLE public.payment_receipt_custom_fields ADD CONSTRAINT prcf_key_format CHECK ((field_key ~ '^[a-z][a-z0-9_]{0,29}$'::text));
ALTER TABLE public.payment_receipt_custom_fields ADD CONSTRAINT prcf_label_len CHECK (((char_length(field_label) >= 1) AND (char_length(field_label) <= 100)));
ALTER TABLE public.payment_receipt_documents ADD CONSTRAINT payment_receipt_documents_confidence_check CHECK (((extraction_confidence IS NULL) OR ((extraction_confidence >= (0)::numeric) AND (extraction_confidence <= (1)::numeric))));
ALTER TABLE public.payment_receipt_documents ADD CONSTRAINT payment_receipt_documents_extraction_status_check CHECK ((extraction_status = ANY (ARRAY['pending'::text, 'extracted'::text, 'needs_review'::text, 'failed'::text])));
ALTER TABLE public.payment_receipt_documents ADD CONSTRAINT payment_receipt_documents_file_size_check CHECK ((file_size >= 0));
ALTER TABLE public.payment_receipt_links ADD CONSTRAINT payment_receipt_links_amount_check CHECK ((amount > (0)::numeric));
ALTER TABLE public.payment_receipts ADD CONSTRAINT payment_receipts_amount_check CHECK ((amount > (0)::numeric));
ALTER TABLE public.payment_receipts ADD CONSTRAINT payment_receipts_document_channel_check CHECK (((document_channel IS NULL) OR (document_channel = ANY (ARRAY['card_to_card'::text, 'paya'::text, 'pol'::text, 'satna'::text, 'cash'::text, 'other'::text]))));
ALTER TABLE public.payment_receipts ADD CONSTRAINT payment_receipts_posting_status_check CHECK ((posting_status = ANY (ARRAY['unposted'::text, 'posted'::text])));
ALTER TABLE public.payment_receipts ADD CONSTRAINT payment_receipts_receipt_time_format_check CHECK (((receipt_time IS NULL) OR (receipt_time ~ '^\d{2}:\d{2}$'::text)));
ALTER TABLE public.payment_receipts ADD CONSTRAINT payment_receipts_receipt_type_check CHECK ((receipt_type = ANY (ARRAY['payment'::text, 'prepayment'::text])));
ALTER TABLE public.payment_receipts ADD CONSTRAINT payment_receipts_receiver_exclusive_chk CHECK ((((destination_bank_account_id IS NOT NULL) AND (receiver_party_id IS NULL)) OR ((destination_bank_account_id IS NULL) AND (receiver_party_id IS NOT NULL)) OR ((status = 'pending_review'::text) AND (destination_bank_account_id IS NULL) AND (receiver_party_id IS NULL))));
ALTER TABLE public.payment_receipts ADD CONSTRAINT payment_receipts_status_check CHECK ((status = ANY (ARRAY['pending_review'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE public.payment_terms ADD CONSTRAINT payment_terms_days_check CHECK (((days IS NULL) OR (days >= 0)));
ALTER TABLE public.penalty_appeals ADD CONSTRAINT penalty_appeals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text])));
ALTER TABLE public.performance_penalties ADD CONSTRAINT performance_penalties_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])));
ALTER TABLE public.performance_penalties ADD CONSTRAINT performance_penalties_type_check CHECK ((type = ANY (ARRAY['no_response_primary'::text, 'no_response_secondary'::text, 'no_confirm_store'::text, 'repeated_invalid_answer'::text, 'frequent_delay'::text, 'frequent_price_edit'::text, 'wrong_inquiry'::text, 'free_product_attempt'::text])));
ALTER TABLE public.person_context_links ADD CONSTRAINT person_context_links_context_kind_check CHECK ((context_kind = ANY (ARRAY['customer'::text, 'supplier'::text, 'driver'::text, 'sender'::text, 'receiver'::text, 'referrer'::text, 'marketer'::text, 'representative'::text, 'complainant'::text, 'returner'::text, 'staff_link'::text, 'credit_party'::text, 'accounting_party'::text, 'delivery_party'::text, 'purchase_owner'::text, 'sales_expert'::text, 'warehouse_owner'::text, 'other'::text])));
ALTER TABLE public.person_context_links ADD CONSTRAINT person_context_links_ref_pair_check CHECK ((((ref_table IS NULL) AND (ref_id IS NULL)) OR ((ref_table IS NOT NULL) AND (ref_id IS NOT NULL))));
ALTER TABLE public.person_context_links ADD CONSTRAINT person_context_links_time_range_check CHECK (((ended_at IS NULL) OR (ended_at >= started_at)));
ALTER TABLE public.person_field_definitions ADD CONSTRAINT person_field_definitions_applies_to_kind_chk CHECK ((applies_to_kind = ANY (ARRAY['individual'::text, 'organization'::text, 'both'::text])));
ALTER TABLE public.person_field_definitions ADD CONSTRAINT person_field_definitions_field_type_chk CHECK ((field_type = ANY (ARRAY['text'::text, 'number'::text, 'date'::text, 'bool'::text, 'select'::text, 'multiselect'::text, 'jsonb'::text])));
ALTER TABLE public.person_field_definitions ADD CONSTRAINT person_field_definitions_label_not_blank CHECK ((length(btrim(label)) > 0));
ALTER TABLE public.person_field_definitions ADD CONSTRAINT person_field_definitions_name_not_blank CHECK ((length(btrim(name)) > 0));
ALTER TABLE public.person_identifiers ADD CONSTRAINT person_identifiers_kind_check CHECK ((kind = ANY (ARRAY['mobile_e164'::text, 'landline'::text, 'national_id_ir'::text, 'tax_id_ir'::text, 'company_reg_id_ir'::text, 'email'::text, 'iban'::text, 'custom'::text])));
ALTER TABLE public.person_identifiers ADD CONSTRAINT person_identifiers_status_check CHECK ((status = ANY (ARRAY['provisional'::text, 'confirmed'::text, 'revoked'::text])));
ALTER TABLE public.person_identifiers ADD CONSTRAINT person_identifiers_value_normalized_not_blank CHECK ((length(btrim(value_normalized)) > 0));
ALTER TABLE public.person_identifiers ADD CONSTRAINT person_identifiers_value_raw_not_blank CHECK ((length(btrim(value_raw)) > 0));
ALTER TABLE public.persons ADD CONSTRAINT persons_display_name_not_blank CHECK ((length(btrim(display_name)) > 0));
ALTER TABLE public.persons ADD CONSTRAINT persons_kind_check CHECK ((kind = ANY (ARRAY['individual'::text, 'organization'::text])));
ALTER TABLE public.persons ADD CONSTRAINT persons_visibility_scope_check CHECK ((visibility_scope = ANY (ARRAY['internal_general'::text, 'restricted_finance'::text, 'restricted_executive'::text])));
ALTER TABLE public.price_alert_rules ADD CONSTRAINT par_currency_chk CHECK ((target_currency = ANY (ARRAY['toman'::text, 'usd'::text])));
ALTER TABLE public.price_alert_rules ADD CONSTRAINT par_note_len CHECK (((note IS NULL) OR (char_length(note) <= 500)));
ALTER TABLE public.price_alert_rules ADD CONSTRAINT par_operator_chk CHECK ((operator = ANY (ARRAY['below_price'::text, 'above_price'::text, 'increase_percent'::text, 'decrease_percent'::text, 'stock_status_changed'::text, 'below_usd_price'::text, 'above_usd_price'::text])));
ALTER TABLE public.pricing_board_access_requests ADD CONSTRAINT pba_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE public.pricing_recompute_queue ADD CONSTRAINT pricing_recompute_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'failed'::text, 'cancelled'::text])));
ALTER TABLE public.product_attribute_groups ADD CONSTRAINT product_attribute_groups_value_type_check CHECK ((value_type = ANY (ARRAY['select'::text, 'text'::text, 'number'::text])));
ALTER TABLE public.product_category_attribute_values ADD CONSTRAINT pcav_value_len_chk CHECK (((value IS NULL) OR (char_length(value) <= 500)));
ALTER TABLE public.product_interaction_events ADD CONSTRAINT product_interaction_events_event_type_check CHECK ((event_type = ANY (ARRAY['search_result_viewed'::text, 'price_checked'::text, 'chart_opened'::text, 'product_details_opened'::text, 'board_price_viewed'::text])));
ALTER TABLE public.product_interaction_events ADD CONSTRAINT product_interaction_events_source_check CHECK ((source = ANY (ARRAY['sales_search'::text, 'live_price_list'::text, 'amin_hozoor_board'::text, 'product_details'::text, 'management_dashboard'::text])));
ALTER TABLE public.product_labels ADD CONSTRAINT product_labels_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'internal'::text])));
ALTER TABLE public.product_labels ADD CONSTRAINT product_labels_weight_check CHECK (((weight >= 0) AND (weight <= 100)));
ALTER TABLE public.product_recommendation_overrides ADD CONSTRAINT pro_no_self CHECK ((product_id <> recommended_product_id));
ALTER TABLE public.products ADD CONSTRAINT products_primary_spec_len_chk CHECK (((primary_spec IS NULL) OR (char_length(primary_spec) <= 100)));
ALTER TABLE public.profile_field_definitions ADD CONSTRAINT profile_field_name_format CHECK (((name ~ '^[a-z_][a-z0-9_]*$'::text) AND ((length(name) >= 2) AND (length(name) <= 50))));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_birth_date_not_future CHECK (((birth_date IS NULL) OR (birth_date <= CURRENT_DATE))) NOT VALID;
ALTER TABLE public.purchase_prices ADD CONSTRAINT purchase_prices_purchase_price_check CHECK ((purchase_price >= (0)::numeric));
ALTER TABLE public.purchase_requests ADD CONSTRAINT purchase_requests_quantity_check CHECK ((quantity > (0)::numeric));
ALTER TABLE public.purchase_requests ADD CONSTRAINT purchase_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'purchased'::text, 'delivered'::text, 'cancelled'::text])));
ALTER TABLE public.purchases ADD CONSTRAINT purchases_cash_price_currency_check CHECK (((cash_price_currency IS NULL) OR (cash_price_currency = ANY (ARRAY['toman'::text, 'usd'::text, 'aed'::text]))));
ALTER TABLE public.purchases ADD CONSTRAINT purchases_currency_check CHECK (((currency IS NULL) OR (currency = ANY (ARRAY['toman'::text, 'usd'::text, 'aed'::text]))));
ALTER TABLE public.purchases ADD CONSTRAINT purchases_quantity_positive CHECK ((quantity >= 1));
ALTER TABLE public.recent_purchase_settings ADD CONSTRAINT recent_purchase_settings_hours_chk CHECK (((limited_after_hours > (0)::numeric) AND (unavailable_after_hours > limited_after_hours)));
ALTER TABLE public.sale_lists ADD CONSTRAINT sale_lists_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])));
ALTER TABLE public.sales_quote_items ADD CONSTRAINT sales_quote_items_discount_le_line CHECK ((discount_amount <= (quantity * unit_price)));
ALTER TABLE public.sales_quote_items ADD CONSTRAINT sales_quote_items_discount_nonneg CHECK ((discount_amount >= (0)::numeric));
ALTER TABLE public.sales_quote_items ADD CONSTRAINT sales_quote_items_identity CHECK ((((source = 'product_price'::sales_quote_item_source) AND (product_id IS NOT NULL)) OR ((source = ANY (ARRAY['manual'::sales_quote_item_source, 'quick_price'::sales_quote_item_source])) AND (free_item_name IS NOT NULL) AND (length(btrim(free_item_name)) > 0))));
ALTER TABLE public.sales_quote_items ADD CONSTRAINT sales_quote_items_price_pos CHECK ((unit_price > (0)::numeric));
ALTER TABLE public.sales_quote_items ADD CONSTRAINT sales_quote_items_qty_pos CHECK ((quantity > (0)::numeric));
ALTER TABLE public.sales_quote_send_queue ADD CONSTRAINT sqsq_channel_check CHECK ((channel = ANY (ARRAY['whatsapp'::text, 'telegram'::text, 'sms'::text, 'eitaa'::text, 'bale'::text, 'rubika'::text, 'manual_link'::text])));
ALTER TABLE public.sales_quote_send_queue ADD CONSTRAINT sqsq_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'failed'::text, 'canceled'::text])));
ALTER TABLE public.sales_quote_share_logs ADD CONSTRAINT sales_quote_share_logs_channel_check CHECK ((channel = ANY (ARRAY['whatsapp'::text, 'telegram'::text, 'sms'::text, 'eitaa'::text, 'bale'::text, 'rubika'::text, 'manual_link'::text])));
ALTER TABLE public.sales_quote_share_logs ADD CONSTRAINT sales_quote_share_logs_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'queued'::text, 'sent'::text, 'failed'::text, 'canceled'::text])));
ALTER TABLE public.sales_quotes ADD CONSTRAINT sales_quotes_amounts_nonneg CHECK (((subtotal_amount >= (0)::numeric) AND (discount_amount >= (0)::numeric) AND (final_amount >= (0)::numeric)));
ALTER TABLE public.salesperson_capital_allocations ADD CONSTRAINT salesperson_capital_allocations_consumed_amount_check CHECK ((consumed_amount >= (0)::numeric));
ALTER TABLE public.salesperson_capital_allocations ADD CONSTRAINT salesperson_capital_allocations_held_amount_check CHECK ((held_amount >= (0)::numeric));
ALTER TABLE public.salesperson_capital_allocations ADD CONSTRAINT scap_final_nonneg CHECK ((final_amount >= (0)::numeric));
ALTER TABLE public.salesperson_capital_allocations ADD CONSTRAINT scap_status_chk CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text])));
ALTER TABLE public.salesperson_capital_allocations ADD CONSTRAINT scap_suggested_nonneg CHECK ((system_suggested_amount >= (0)::numeric));
ALTER TABLE public.shipping_cost_rules ADD CONSTRAINT shipping_cost_rules_cost_value_check CHECK ((cost_value >= (0)::numeric));
ALTER TABLE public.stock_alert_requests ADD CONSTRAINT stock_alert_requests_name_len CHECK (((char_length(btrim(customer_name)) >= 2) AND (char_length(customer_name) <= 200)));
ALTER TABLE public.stock_alert_requests ADD CONSTRAINT stock_alert_requests_note_len CHECK (((note IS NULL) OR (char_length(note) <= 500)));
ALTER TABLE public.stock_alert_requests ADD CONSTRAINT stock_alert_requests_phone_len CHECK (((char_length(btrim(customer_phone)) >= 4) AND (char_length(customer_phone) <= 40)));
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'rejected'::text])));
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_trust_level_check CHECK ((trust_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'done'::text, 'blocked'::text, 'canceled'::text])));
ALTER TABLE public.validation_rules ADD CONSTRAINT validation_rules_rule_type_chk CHECK ((rule_type = ANY (ARRAY['required'::text, 'accounting_code_valid'::text])));
ALTER TABLE public.validation_rules ADD CONSTRAINT validation_rules_scope_chk CHECK ((scope = ANY (ARRAY['receipt'::text, 'journal_entry'::text, 'invoice'::text, 'purchase'::text])));
ALTER TABLE public.validation_rules ADD CONSTRAINT validation_rules_severity_chk CHECK ((severity = ANY (ARRAY['warning'::text, 'blocking'::text])));
ALTER TABLE public.waybill_custom_fields ADD CONSTRAINT waybill_custom_fields_field_type_check CHECK ((field_type = ANY (ARRAY['text'::text, 'number'::text, 'date'::text, 'select'::text])));
ALTER TABLE public.waybill_custom_fields ADD CONSTRAINT waybill_custom_fields_key_format CHECK ((field_key ~ '^[a-z][a-z0-9_]{0,29}$'::text));
ALTER TABLE public.waybill_custom_fields ADD CONSTRAINT waybill_custom_fields_label_len CHECK (((char_length(field_label) >= 1) AND (char_length(field_label) <= 100)));
ALTER TABLE public.waybill_items ADD CONSTRAINT waybill_items_quantity_check CHECK ((quantity > (0)::numeric));
ALTER TABLE public.waybills ADD CONSTRAINT waybills_destination_city_check CHECK (((char_length(btrim(destination_city)) >= 1) AND (char_length(btrim(destination_city)) <= 200)));
ALTER TABLE public.waybills ADD CONSTRAINT waybills_receiver_name_check CHECK (((char_length(btrim(receiver_name)) >= 2) AND (char_length(btrim(receiver_name)) <= 150)));
ALTER TABLE public.waybills ADD CONSTRAINT waybills_receiver_phone_check CHECK (((char_length(btrim(receiver_phone)) >= 4) AND (char_length(btrim(receiver_phone)) <= 40)));
ALTER TABLE public.waybills ADD CONSTRAINT waybills_sender_name_check CHECK (((char_length(btrim(sender_name)) >= 2) AND (char_length(btrim(sender_name)) <= 150)));
ALTER TABLE public.waybills ADD CONSTRAINT waybills_sender_phone_check CHECK (((char_length(btrim(sender_phone)) >= 4) AND (char_length(btrim(sender_phone)) <= 40)));
ALTER TABLE public.waybills ADD CONSTRAINT waybills_shipping_company_check CHECK (((char_length(btrim(shipping_company)) >= 1) AND (char_length(btrim(shipping_company)) <= 200)));
ALTER TABLE public.waybills ADD CONSTRAINT waybills_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'registered'::text, 'delivered_to_carrier'::text, 'sent'::text, 'delivered_to_customer'::text, 'canceled'::text])));
ALTER TABLE public.workflow_settings ADD CONSTRAINT workflow_settings_penalty_for_check CHECK ((penalty_for = ANY (ARRAY['uploader'::text, 'reviewer'::text, 'both'::text])));
ALTER TABLE public.academy_courses ADD CONSTRAINT academy_courses_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.academy_lessons ADD CONSTRAINT academy_lessons_course_id_fkey FOREIGN KEY (course_id) REFERENCES academy_courses(id) ON DELETE CASCADE;
ALTER TABLE public.academy_quiz_attempts ADD CONSTRAINT academy_quiz_attempts_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES academy_quizzes(id) ON DELETE CASCADE;
ALTER TABLE public.academy_quiz_attempts ADD CONSTRAINT academy_quiz_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.academy_quiz_questions ADD CONSTRAINT academy_quiz_questions_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES academy_quizzes(id) ON DELETE CASCADE;
ALTER TABLE public.academy_quizzes ADD CONSTRAINT academy_quizzes_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES academy_lessons(id) ON DELETE CASCADE;
ALTER TABLE public.academy_user_progress ADD CONSTRAINT academy_user_progress_course_id_fkey FOREIGN KEY (course_id) REFERENCES academy_courses(id) ON DELETE CASCADE;
ALTER TABLE public.academy_user_progress ADD CONSTRAINT academy_user_progress_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES academy_lessons(id) ON DELETE CASCADE;
ALTER TABLE public.academy_user_progress ADD CONSTRAINT academy_user_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.ai_conversations ADD CONSTRAINT ai_conversations_group_id_fkey FOREIGN KEY (group_id) REFERENCES messenger_groups(id) ON DELETE CASCADE;
ALTER TABLE public.ai_conversations ADD CONSTRAINT ai_conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.appeal_reviewers ADD CONSTRAINT appeal_reviewers_appeal_id_fkey FOREIGN KEY (appeal_id) REFERENCES penalty_appeals(id) ON DELETE CASCADE;
ALTER TABLE public.appeal_reviewers ADD CONSTRAINT appeal_reviewers_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id);
ALTER TABLE public.bot_api_key_label_access ADD CONSTRAINT bot_api_key_label_access_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES bot_api_keys(id) ON DELETE CASCADE;
ALTER TABLE public.bot_api_key_label_access ADD CONSTRAINT bot_api_key_label_access_label_id_fkey FOREIGN KEY (label_id) REFERENCES product_labels(id) ON DELETE CASCADE;
ALTER TABLE public.bot_api_key_table_access ADD CONSTRAINT bot_api_key_table_access_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES bot_api_keys(id) ON DELETE CASCADE;
ALTER TABLE public.bot_api_key_table_access ADD CONSTRAINT bot_api_key_table_access_table_id_fkey FOREIGN KEY (table_id) REFERENCES dynamic_tables(id) ON DELETE CASCADE;
ALTER TABLE public.bot_api_usage_logs ADD CONSTRAINT bot_api_usage_logs_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES bot_api_keys(id) ON DELETE SET NULL;
ALTER TABLE public.categories ADD CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE public.category_product_attributes ADD CONSTRAINT category_product_attributes_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE;
ALTER TABLE public.credit_requests ADD CONSTRAINT credit_requests_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public.credit_requests ADD CONSTRAINT credit_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES profiles(id);
ALTER TABLE public.credit_requests ADD CONSTRAINT credit_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES profiles(id);
ALTER TABLE public.credit_score_snapshots ADD CONSTRAINT credit_score_snapshots_calculated_by_fkey FOREIGN KEY (calculated_by) REFERENCES profiles(id);
ALTER TABLE public.credit_score_snapshots ADD CONSTRAINT credit_score_snapshots_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public.credit_scoring_rules ADD CONSTRAINT credit_scoring_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
ALTER TABLE public.currency_rate_fetches ADD CONSTRAINT currency_rate_fetches_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES profiles(id);
ALTER TABLE public.currency_rate_fetches ADD CONSTRAINT currency_rate_fetches_fetched_by_fkey FOREIGN KEY (fetched_by) REFERENCES profiles(id);
ALTER TABLE public.currency_rate_fetches ADD CONSTRAINT currency_rate_fetches_source_id_fkey FOREIGN KEY (source_id) REFERENCES currency_sources(id) ON DELETE CASCADE;
ALTER TABLE public.currency_rates ADD CONSTRAINT currency_rates_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES profiles(id);
ALTER TABLE public.currency_rates ADD CONSTRAINT currency_rates_currency_fkey FOREIGN KEY (currency) REFERENCES currencies(code) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE public.currency_rates ADD CONSTRAINT currency_rates_fetch_source_id_fkey FOREIGN KEY (fetch_source_id) REFERENCES currency_sources(id);
ALTER TABLE public.customer_capital_allocations ADD CONSTRAINT customer_capital_allocations_capital_snapshot_id_fkey FOREIGN KEY (capital_snapshot_id) REFERENCES daily_capital_snapshots(id) ON DELETE CASCADE;
ALTER TABLE public.customer_capital_allocations ADD CONSTRAINT customer_capital_allocations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public.customer_capital_allocations ADD CONSTRAINT customer_capital_allocations_salesperson_allocation_id_fkey FOREIGN KEY (salesperson_allocation_id) REFERENCES salesperson_capital_allocations(id) ON DELETE CASCADE;
ALTER TABLE public.customer_credit_balance ADD CONSTRAINT customer_credit_balance_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public.customer_credit_ledger ADD CONSTRAINT customer_credit_ledger_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public.customer_credit_profile ADD CONSTRAINT customer_credit_profile_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public.customers ADD CONSTRAINT customers_person_id_fkey FOREIGN KEY (person_id) REFERENCES persons(id);
ALTER TABLE public.customers ADD CONSTRAINT customers_responsible_id_fkey FOREIGN KEY (responsible_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.daily_capital_snapshots ADD CONSTRAINT daily_capital_snapshots_input_id_fkey FOREIGN KEY (input_id) REFERENCES daily_capital_inputs(id) ON DELETE SET NULL;
ALTER TABLE public.delivery_receipt_status_history ADD CONSTRAINT delivery_receipt_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id);
ALTER TABLE public.delivery_receipt_status_history ADD CONSTRAINT delivery_receipt_status_history_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES delivery_receipts(id) ON DELETE CASCADE;
ALTER TABLE public.delivery_receipts ADD CONSTRAINT delivery_receipts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE public.delivery_receipts ADD CONSTRAINT delivery_receipts_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id);
ALTER TABLE public.delivery_receipts ADD CONSTRAINT delivery_receipts_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
ALTER TABLE public.delivery_receipts ADD CONSTRAINT delivery_receipts_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);
ALTER TABLE public.document_status_history ADD CONSTRAINT document_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id);
ALTER TABLE public.document_status_history ADD CONSTRAINT document_status_history_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;
ALTER TABLE public.documents ADD CONSTRAINT documents_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
ALTER TABLE public.documents ADD CONSTRAINT documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);
ALTER TABLE public.dynamic_table_cells ADD CONSTRAINT dynamic_table_cells_column_id_fkey FOREIGN KEY (column_id) REFERENCES dynamic_table_columns(id) ON DELETE CASCADE;
ALTER TABLE public.dynamic_table_cells ADD CONSTRAINT dynamic_table_cells_row_id_fkey FOREIGN KEY (row_id) REFERENCES dynamic_table_rows(id) ON DELETE CASCADE;
ALTER TABLE public.dynamic_table_cells ADD CONSTRAINT dynamic_table_cells_table_id_fkey FOREIGN KEY (table_id) REFERENCES dynamic_tables(id) ON DELETE CASCADE;
ALTER TABLE public.dynamic_table_columns ADD CONSTRAINT dynamic_table_columns_table_id_fkey FOREIGN KEY (table_id) REFERENCES dynamic_tables(id) ON DELETE CASCADE;
ALTER TABLE public.dynamic_table_row_counters ADD CONSTRAINT dynamic_table_row_counters_table_id_fkey FOREIGN KEY (table_id) REFERENCES dynamic_tables(id) ON DELETE CASCADE;
ALTER TABLE public.dynamic_table_rows ADD CONSTRAINT dynamic_table_rows_table_id_fkey FOREIGN KEY (table_id) REFERENCES dynamic_tables(id) ON DELETE CASCADE;
ALTER TABLE public.employee_achievements ADD CONSTRAINT employee_achievements_achievement_id_fkey FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE;
ALTER TABLE public.employee_achievements ADD CONSTRAINT employee_achievements_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.employee_leagues ADD CONSTRAINT employee_leagues_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.employee_leagues ADD CONSTRAINT employee_leagues_season_id_fkey FOREIGN KEY (season_id) REFERENCES league_seasons(id) ON DELETE CASCADE;
ALTER TABLE public.employee_level_up_events ADD CONSTRAINT employee_level_up_events_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.employee_mission_progress ADD CONSTRAINT employee_mission_progress_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.employee_mission_progress ADD CONSTRAINT employee_mission_progress_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE;
ALTER TABLE public.employee_progress ADD CONSTRAINT employee_progress_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.employee_streaks ADD CONSTRAINT employee_streaks_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.feedback ADD CONSTRAINT feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.inquiries ADD CONSTRAINT inquiries_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id);
ALTER TABLE public.inquiries ADD CONSTRAINT inquiries_group_id_fkey FOREIGN KEY (group_id) REFERENCES messenger_groups(id) ON DELETE CASCADE;
ALTER TABLE public.inquiries ADD CONSTRAINT inquiries_message_id_fkey FOREIGN KEY (message_id) REFERENCES messenger_messages(id);
ALTER TABLE public.inquiries ADD CONSTRAINT inquiries_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE public.inquiries ADD CONSTRAINT inquiries_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id);
ALTER TABLE public.inquiry_price_cache ADD CONSTRAINT inquiry_price_cache_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.inquiry_price_cache ADD CONSTRAINT inquiry_price_cache_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE public.inquiry_replies ADD CONSTRAINT inquiry_replies_inquiry_id_fkey FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE;
ALTER TABLE public.inquiry_replies ADD CONSTRAINT inquiry_replies_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.inquiry_status_history ADD CONSTRAINT inquiry_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id);
ALTER TABLE public.inquiry_status_history ADD CONSTRAINT inquiry_status_history_inquiry_id_fkey FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE;
ALTER TABLE public.inquiry_transfers ADD CONSTRAINT inquiry_transfers_from_user_fkey FOREIGN KEY (from_user) REFERENCES auth.users(id);
ALTER TABLE public.inquiry_transfers ADD CONSTRAINT inquiry_transfers_inquiry_id_fkey FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE;
ALTER TABLE public.inquiry_transfers ADD CONSTRAINT inquiry_transfers_to_user_fkey FOREIGN KEY (to_user) REFERENCES auth.users(id);
ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES auth.users(id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_sale_price_type_id_fkey FOREIGN KEY (sale_price_type_id) REFERENCES sale_price_types(id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_settlement_type_id_fkey FOREIGN KEY (settlement_type_id) REFERENCES settlement_types(id) ON DELETE SET NULL;
ALTER TABLE public.journal_lines ADD CONSTRAINT journal_lines_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE;
ALTER TABLE public.knowledge_articles ADD CONSTRAINT knowledge_articles_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id);
ALTER TABLE public.knowledge_confirmations ADD CONSTRAINT knowledge_confirmations_document_id_fkey FOREIGN KEY (document_id) REFERENCES knowledge_documents(id) ON DELETE CASCADE;
ALTER TABLE public.knowledge_confirmations ADD CONSTRAINT knowledge_confirmations_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.knowledge_documents ADD CONSTRAINT knowledge_documents_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.market_product_match_events ADD CONSTRAINT market_product_match_events_match_id_fkey FOREIGN KEY (match_id) REFERENCES market_product_matches(id) ON DELETE CASCADE;
ALTER TABLE public.market_product_matches ADD CONSTRAINT market_product_matches_afrakala_product_id_fkey FOREIGN KEY (afrakala_product_id) REFERENCES products(id) ON DELETE RESTRICT;
ALTER TABLE public.market_rate_ingestion_runs ADD CONSTRAINT market_rate_ingestion_runs_source_id_fkey FOREIGN KEY (source_id) REFERENCES market_rate_sources(id) ON DELETE SET NULL;
ALTER TABLE public.market_rate_source_mappings ADD CONSTRAINT market_rate_source_mappings_indicator_id_fkey FOREIGN KEY (indicator_id) REFERENCES market_indicators(id) ON DELETE CASCADE;
ALTER TABLE public.market_rate_source_mappings ADD CONSTRAINT market_rate_source_mappings_source_id_fkey FOREIGN KEY (source_id) REFERENCES market_rate_sources(id) ON DELETE CASCADE;
ALTER TABLE public.market_rate_ticks ADD CONSTRAINT market_rate_ticks_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.market_rate_ticks ADD CONSTRAINT market_rate_ticks_indicator_id_fkey FOREIGN KEY (indicator_id) REFERENCES market_indicators(id) ON DELETE RESTRICT;
ALTER TABLE public.market_rate_ticks ADD CONSTRAINT market_rate_ticks_source_id_fkey FOREIGN KEY (source_id) REFERENCES market_rate_sources(id) ON DELETE RESTRICT;
ALTER TABLE public.message_embeddings ADD CONSTRAINT message_embeddings_group_id_fkey FOREIGN KEY (group_id) REFERENCES messenger_groups(id) ON DELETE CASCADE;
ALTER TABLE public.message_embeddings ADD CONSTRAINT message_embeddings_message_id_fkey FOREIGN KEY (message_id) REFERENCES messenger_messages(id) ON DELETE CASCADE;
ALTER TABLE public.messages ADD CONSTRAINT messages_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.messages ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.messenger_attachments ADD CONSTRAINT messenger_attachments_message_id_fkey FOREIGN KEY (message_id) REFERENCES messenger_messages(id) ON DELETE CASCADE;
ALTER TABLE public.messenger_group_members ADD CONSTRAINT messenger_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES messenger_groups(id) ON DELETE CASCADE;
ALTER TABLE public.messenger_group_members ADD CONSTRAINT messenger_group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.messenger_groups ADD CONSTRAINT messenger_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.messenger_messages ADD CONSTRAINT messenger_messages_group_id_fkey FOREIGN KEY (group_id) REFERENCES messenger_groups(id) ON DELETE CASCADE;
ALTER TABLE public.messenger_messages ADD CONSTRAINT messenger_messages_reply_to_fkey FOREIGN KEY (reply_to) REFERENCES messenger_messages(id) ON DELETE SET NULL;
ALTER TABLE public.messenger_messages ADD CONSTRAINT messenger_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.messenger_read_receipts ADD CONSTRAINT messenger_read_receipts_message_id_fkey FOREIGN KEY (message_id) REFERENCES messenger_messages(id) ON DELETE CASCADE;
ALTER TABLE public.messenger_read_receipts ADD CONSTRAINT messenger_read_receipts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.notification_queue ADD CONSTRAINT notification_queue_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.payment_receipt_documents ADD CONSTRAINT payment_receipt_documents_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES payment_receipts(id) ON DELETE CASCADE;
ALTER TABLE public.payment_receipt_links ADD CONSTRAINT payment_receipt_links_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT;
ALTER TABLE public.payment_receipt_links ADD CONSTRAINT payment_receipt_links_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES payment_receipts(id) ON DELETE CASCADE;
ALTER TABLE public.payment_receipts ADD CONSTRAINT payment_receipts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;
ALTER TABLE public.payment_receipts ADD CONSTRAINT payment_receipts_destination_bank_account_id_fkey FOREIGN KEY (destination_bank_account_id) REFERENCES bank_accounts(id);
ALTER TABLE public.payment_receipts ADD CONSTRAINT payment_receipts_receiver_party_id_fkey FOREIGN KEY (receiver_party_id) REFERENCES external_parties(id);
ALTER TABLE public.payment_receipts ADD CONSTRAINT payment_receipts_source_bank_account_id_fkey FOREIGN KEY (source_bank_account_id) REFERENCES bank_accounts(id);
ALTER TABLE public.penalty_appeals ADD CONSTRAINT penalty_appeals_appellant_id_fkey FOREIGN KEY (appellant_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.penalty_appeals ADD CONSTRAINT penalty_appeals_penalty_id_fkey FOREIGN KEY (penalty_id) REFERENCES performance_penalties(id) ON DELETE CASCADE;
ALTER TABLE public.performance_penalties ADD CONSTRAINT performance_penalties_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.performance_penalties ADD CONSTRAINT performance_penalties_inquiry_id_fkey FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE SET NULL;
ALTER TABLE public.performance_penalties ADD CONSTRAINT performance_penalties_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.person_context_links ADD CONSTRAINT person_context_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.person_context_links ADD CONSTRAINT person_context_links_person_id_fkey FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE;
ALTER TABLE public.person_field_definitions ADD CONSTRAINT person_field_definitions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.person_field_values ADD CONSTRAINT person_field_values_field_definition_id_fkey FOREIGN KEY (field_definition_id) REFERENCES person_field_definitions(id) ON DELETE RESTRICT;
ALTER TABLE public.person_field_values ADD CONSTRAINT person_field_values_person_id_fkey FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE;
ALTER TABLE public.person_field_values ADD CONSTRAINT person_field_values_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
ALTER TABLE public.person_identifiers ADD CONSTRAINT person_identifiers_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.person_identifiers ADD CONSTRAINT person_identifiers_person_id_fkey FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE;
ALTER TABLE public.person_identifiers ADD CONSTRAINT person_identifiers_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES auth.users(id);
ALTER TABLE public.persons ADD CONSTRAINT persons_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.price_alert_notifications ADD CONSTRAINT price_alert_notifications_alert_rule_id_fkey FOREIGN KEY (alert_rule_id) REFERENCES price_alert_rules(id) ON DELETE CASCADE;
ALTER TABLE public.price_alert_rules ADD CONSTRAINT price_alert_rules_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public.price_alert_rules ADD CONSTRAINT price_alert_rules_sale_price_type_id_fkey FOREIGN KEY (sale_price_type_id) REFERENCES sale_price_types(id) ON DELETE SET NULL;
ALTER TABLE public.price_calculation_snapshots ADD CONSTRAINT price_calculation_snapshots_pricing_rule_id_fkey FOREIGN KEY (pricing_rule_id) REFERENCES pricing_rules(id) ON DELETE SET NULL;
ALTER TABLE public.price_calculation_snapshots ADD CONSTRAINT price_calculation_snapshots_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public.price_calculation_snapshots ADD CONSTRAINT price_calculation_snapshots_purchase_price_id_fkey FOREIGN KEY (purchase_price_id) REFERENCES purchase_prices(id) ON DELETE SET NULL;
ALTER TABLE public.price_calculation_snapshots ADD CONSTRAINT price_calculation_snapshots_sale_price_type_id_fkey FOREIGN KEY (sale_price_type_id) REFERENCES sale_price_types(id) ON DELETE SET NULL;
ALTER TABLE public.price_calculation_snapshots ADD CONSTRAINT price_calculation_snapshots_settlement_type_id_fkey FOREIGN KEY (settlement_type_id) REFERENCES settlement_types(id) ON DELETE SET NULL;
ALTER TABLE public.price_list_items ADD CONSTRAINT price_list_items_price_list_id_fkey FOREIGN KEY (price_list_id) REFERENCES price_lists(id) ON DELETE CASCADE;
ALTER TABLE public.price_list_items ADD CONSTRAINT price_list_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public.pricing_board_settings ADD CONSTRAINT pricing_board_settings_sale_price_type_id_fkey FOREIGN KEY (sale_price_type_id) REFERENCES sale_price_types(id) ON DELETE RESTRICT;
ALTER TABLE public.pricing_recompute_queue ADD CONSTRAINT pricing_recompute_queue_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public.pricing_recompute_queue ADD CONSTRAINT pricing_recompute_queue_sale_price_type_id_fkey FOREIGN KEY (sale_price_type_id) REFERENCES sale_price_types(id) ON DELETE SET NULL;
ALTER TABLE public.pricing_rules ADD CONSTRAINT pricing_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.pricing_rules ADD CONSTRAINT pricing_rules_sale_price_type_id_fkey FOREIGN KEY (sale_price_type_id) REFERENCES sale_price_types(id) ON DELETE SET NULL;
ALTER TABLE public.pricing_rules ADD CONSTRAINT pricing_rules_settlement_type_id_fkey FOREIGN KEY (settlement_type_id) REFERENCES settlement_types(id) ON DELETE SET NULL;
ALTER TABLE public.product_attributes ADD CONSTRAINT product_attributes_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE public.product_attributes ADD CONSTRAINT product_attributes_group_id_fkey FOREIGN KEY (group_id) REFERENCES product_attribute_groups(id) ON DELETE RESTRICT;
ALTER TABLE public.product_category_attribute_values ADD CONSTRAINT product_category_attribute_values_category_attribute_id_fkey FOREIGN KEY (category_attribute_id) REFERENCES category_product_attributes(id) ON DELETE CASCADE;
ALTER TABLE public.product_category_attribute_values ADD CONSTRAINT product_category_attribute_values_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public.product_computed_prices ADD CONSTRAINT product_computed_prices_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public.product_computed_prices ADD CONSTRAINT product_computed_prices_sale_price_type_id_fkey FOREIGN KEY (sale_price_type_id) REFERENCES sale_price_types(id) ON DELETE CASCADE;
ALTER TABLE public.product_interaction_events ADD CONSTRAINT product_interaction_events_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public.product_interaction_events ADD CONSTRAINT product_interaction_events_sale_price_type_id_fkey FOREIGN KEY (sale_price_type_id) REFERENCES sale_price_types(id) ON DELETE SET NULL;
ALTER TABLE public.product_interaction_events ADD CONSTRAINT product_interaction_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.product_label_links ADD CONSTRAINT product_label_links_label_id_fkey FOREIGN KEY (label_id) REFERENCES product_labels(id) ON DELETE CASCADE;
ALTER TABLE public.product_label_links ADD CONSTRAINT product_label_links_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public.product_owner_assignments ADD CONSTRAINT product_owner_assignments_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public.product_recommendation_overrides ADD CONSTRAINT product_recommendation_overrides_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.product_recommendation_overrides ADD CONSTRAINT product_recommendation_overrides_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public.product_recommendation_overrides ADD CONSTRAINT product_recommendation_overrides_recommended_product_id_fkey FOREIGN KEY (recommended_product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public.product_sale_price_history ADD CONSTRAINT product_sale_price_history_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public.product_sale_price_history ADD CONSTRAINT product_sale_price_history_sale_price_type_id_fkey FOREIGN KEY (sale_price_type_id) REFERENCES sale_price_types(id) ON DELETE SET NULL;
ALTER TABLE public.product_sale_price_history ADD CONSTRAINT product_sale_price_history_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES price_calculation_snapshots(id) ON DELETE SET NULL;
ALTER TABLE public.product_suppliers ADD CONSTRAINT product_suppliers_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public.product_suppliers ADD CONSTRAINT product_suppliers_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE;
ALTER TABLE public.products ADD CONSTRAINT products_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD CONSTRAINT products_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.profile_field_values ADD CONSTRAINT profile_field_values_field_name_fkey FOREIGN KEY (field_name) REFERENCES profile_field_definitions(name) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.profile_field_values ADD CONSTRAINT profile_field_values_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_items ADD CONSTRAINT purchase_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE public.purchase_items ADD CONSTRAINT purchase_items_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_prices ADD CONSTRAINT purchase_prices_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_prices ADD CONSTRAINT purchase_prices_reason_id_fkey FOREIGN KEY (reason_id) REFERENCES price_change_reasons(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_prices ADD CONSTRAINT purchase_prices_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_receipts ADD CONSTRAINT purchase_receipts_request_id_fkey FOREIGN KEY (request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_receipts ADD CONSTRAINT purchase_receipts_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);
ALTER TABLE public.purchase_request_status_history ADD CONSTRAINT purchase_request_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id);
ALTER TABLE public.purchase_request_status_history ADD CONSTRAINT purchase_request_status_history_request_id_fkey FOREIGN KEY (request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_requests ADD CONSTRAINT purchase_requests_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id);
ALTER TABLE public.purchase_requests ADD CONSTRAINT purchase_requests_inquiry_id_fkey FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_requests ADD CONSTRAINT purchase_requests_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE public.purchase_requests ADD CONSTRAINT purchase_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id);
ALTER TABLE public.purchases ADD CONSTRAINT purchases_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.purchases ADD CONSTRAINT purchases_paid_by_fkey FOREIGN KEY (paid_by) REFERENCES auth.users(id);
ALTER TABLE public.purchases ADD CONSTRAINT purchases_payment_term_id_fkey FOREIGN KEY (payment_term_id) REFERENCES payment_terms(id) ON DELETE SET NULL;
ALTER TABLE public.purchases ADD CONSTRAINT purchases_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE public.purchases ADD CONSTRAINT purchases_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
ALTER TABLE public.sale_list_items ADD CONSTRAINT sale_list_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;
ALTER TABLE public.sale_list_items ADD CONSTRAINT sale_list_items_sale_list_id_fkey FOREIGN KEY (sale_list_id) REFERENCES sale_lists(id) ON DELETE CASCADE;
ALTER TABLE public.sale_list_versions ADD CONSTRAINT sale_list_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
ALTER TABLE public.sale_list_versions ADD CONSTRAINT sale_list_versions_sale_list_id_fkey FOREIGN KEY (sale_list_id) REFERENCES sale_lists(id) ON DELETE CASCADE;
ALTER TABLE public.sale_lists ADD CONSTRAINT sale_lists_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.sale_lists ADD CONSTRAINT sale_lists_sale_price_type_id_fkey FOREIGN KEY (sale_price_type_id) REFERENCES sale_price_types(id) ON DELETE RESTRICT;
ALTER TABLE public.sale_lists ADD CONSTRAINT sale_lists_settlement_type_id_fkey FOREIGN KEY (settlement_type_id) REFERENCES settlement_types(id) ON DELETE SET NULL;
ALTER TABLE public.sales_quote_items ADD CONSTRAINT sales_quote_items_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES sales_quotes(id) ON DELETE CASCADE;
ALTER TABLE public.sales_quote_send_queue ADD CONSTRAINT sales_quote_send_queue_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES sales_quotes(id) ON DELETE CASCADE;
ALTER TABLE public.sales_quote_send_queue ADD CONSTRAINT sales_quote_send_queue_share_log_id_fkey FOREIGN KEY (share_log_id) REFERENCES sales_quote_share_logs(id) ON DELETE CASCADE;
ALTER TABLE public.sales_quote_share_logs ADD CONSTRAINT sales_quote_share_logs_attempted_by_fkey FOREIGN KEY (attempted_by) REFERENCES profiles(id);
ALTER TABLE public.sales_quote_share_logs ADD CONSTRAINT sales_quote_share_logs_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES sales_quotes(id) ON DELETE CASCADE;
ALTER TABLE public.salesperson_capital_allocations ADD CONSTRAINT salesperson_capital_allocations_capital_snapshot_id_fkey FOREIGN KEY (capital_snapshot_id) REFERENCES daily_capital_snapshots(id) ON DELETE CASCADE;
ALTER TABLE public.shipping_cost_rules ADD CONSTRAINT shipping_cost_rules_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL;
ALTER TABLE public.shipping_cost_rules ADD CONSTRAINT shipping_cost_rules_cost_currency_fkey FOREIGN KEY (cost_currency) REFERENCES currencies(code) ON DELETE RESTRICT;
ALTER TABLE public.shipping_cost_rules ADD CONSTRAINT shipping_cost_rules_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES auth.users(id);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.waybill_items ADD CONSTRAINT waybill_items_invoice_item_id_fkey FOREIGN KEY (invoice_item_id) REFERENCES invoice_items(id) ON DELETE RESTRICT;
ALTER TABLE public.waybill_items ADD CONSTRAINT waybill_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;
ALTER TABLE public.waybill_items ADD CONSTRAINT waybill_items_waybill_id_fkey FOREIGN KEY (waybill_id) REFERENCES waybills(id) ON DELETE CASCADE;
ALTER TABLE public.waybills ADD CONSTRAINT waybills_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.waybills ADD CONSTRAINT waybills_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT;
ALTER TABLE public.workflow_settings ADD CONSTRAINT workflow_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


-- ============ INDEXES ============
CREATE INDEX idx_academy_courses_published ON public.academy_courses USING btree (is_published);
CREATE INDEX idx_academy_lessons_course ON public.academy_lessons USING btree (course_id, order_index);
CREATE INDEX idx_academy_quiz_attempts_user ON public.academy_quiz_attempts USING btree (user_id, quiz_id);
CREATE INDEX idx_academy_quiz_questions_quiz ON public.academy_quiz_questions USING btree (quiz_id, order_index);
CREATE INDEX idx_academy_user_progress_user ON public.academy_user_progress USING btree (user_id, course_id);
CREATE UNIQUE INDEX achievements_condition_uniq ON public.achievements USING btree (condition_event_key, condition_operator, condition_value) WHERE ((condition_event_key IS NOT NULL) AND (condition_operator IS NOT NULL) AND (condition_value IS NOT NULL));
CREATE INDEX ai_conversations_user_group_created_idx ON public.ai_conversations USING btree (user_id, group_id, created_at DESC);
CREATE INDEX idx_reviewers_appeal ON public.appeal_reviewers USING btree (appeal_id);
CREATE INDEX idx_reviewers_reviewer ON public.appeal_reviewers USING btree (reviewer_id);
CREATE INDEX audit_logs_actor_idx ON public.audit_logs USING btree (actor_id, created_at DESC);
CREATE INDEX audit_logs_entity_idx ON public.audit_logs USING btree (entity_type, entity_id);
CREATE INDEX idx_audit_promo_used_day ON public.audit_logs USING btree (action, created_at) WHERE (action = 'promotion_suggestion_used'::text);
CREATE INDEX bakla_label_idx ON public.bot_api_key_label_access USING btree (label_id);
CREATE INDEX idx_bakta_key ON public.bot_api_key_table_access USING btree (api_key_id);
CREATE INDEX idx_bakta_table ON public.bot_api_key_table_access USING btree (table_id);
CREATE INDEX idx_bot_api_keys_active ON public.bot_api_keys USING btree (is_active);
CREATE INDEX idx_bot_api_keys_prefix ON public.bot_api_keys USING btree (key_prefix);
CREATE INDEX idx_bot_usage_error_created ON public.bot_api_usage_logs USING btree (error_code, created_at DESC) WHERE (error_code IS NOT NULL);
CREATE INDEX idx_bot_usage_ip_created ON public.bot_api_usage_logs USING btree (ip, created_at DESC);
CREATE INDEX idx_bot_usage_key_created ON public.bot_api_usage_logs USING btree (api_key_id, created_at DESC);
CREATE INDEX idx_bot_usage_key_time ON public.bot_api_usage_logs USING btree (api_key_id, created_at DESC);
CREATE INDEX idx_bot_usage_status_created ON public.bot_api_usage_logs USING btree (status_code, created_at DESC);
CREATE INDEX idx_bot_usage_table_created ON public.bot_api_usage_logs USING btree (table_id, created_at DESC);
CREATE INDEX idx_bot_usage_time ON public.bot_api_usage_logs USING btree (created_at DESC);
CREATE INDEX brands_active_idx ON public.brands USING btree (is_active);
CREATE INDEX brands_name_idx ON public.brands USING btree (name);
CREATE INDEX idx_brands_name_trgm ON public.brands USING gin (name gin_trgm_ops);
CREATE INDEX idx_call_logs_employee_time ON public.call_logs USING btree (employee_id, started_at DESC);
CREATE INDEX idx_call_logs_external ON public.call_logs USING btree (external_id) WHERE (external_id IS NOT NULL);
CREATE INDEX idx_cal_alloc ON public.capital_allocation_ledger USING btree (allocation_kind, allocation_id, created_at);
CREATE INDEX idx_cal_ref ON public.capital_allocation_ledger USING btree (reference_type, reference_id);
CREATE INDEX categories_name_idx ON public.categories USING btree (name);
CREATE INDEX categories_parent_idx ON public.categories USING btree (parent_id);
CREATE INDEX idx_categories_name_trgm ON public.categories USING gin (name gin_trgm_ops);
CREATE INDEX cpa_category_active_idx ON public.category_product_attributes USING btree (category_id, is_active, sort_order);
CREATE INDEX idx_credit_requests_customer ON public.credit_requests USING btree (customer_id);
CREATE INDEX idx_credit_requests_status ON public.credit_requests USING btree (status);
CREATE INDEX idx_css_customer_calc ON public.credit_score_snapshots USING btree (customer_id, calculated_at DESC);
CREATE INDEX idx_crf_currency ON public.currency_rate_fetches USING btree (currency);
CREATE INDEX idx_crf_fetched_at ON public.currency_rate_fetches USING btree (fetched_at DESC);
CREATE INDEX idx_crf_source_fetched ON public.currency_rate_fetches USING btree (source_id, fetched_at DESC);
CREATE INDEX idx_crf_status ON public.currency_rate_fetches USING btree (status);
CREATE INDEX currency_rates_currency_idx ON public.currency_rates USING btree (currency);
CREATE INDEX currency_rates_effective_idx ON public.currency_rates USING btree (currency, effective_at DESC);
CREATE INDEX idx_currency_rates_active ON public.currency_rates USING btree (currency, is_active, effective_at DESC);
CREATE INDEX idx_currency_rates_currency_active_eff ON public.currency_rates USING btree (currency, is_active, effective_at DESC);
CREATE INDEX idx_currency_rates_currency_eff ON public.currency_rates USING btree (currency, effective_at DESC);
CREATE UNIQUE INDEX ccap_alloc_customer_uniq ON public.customer_capital_allocations USING btree (salesperson_allocation_id, customer_id);
CREATE INDEX ccap_customer_date_idx ON public.customer_capital_allocations USING btree (customer_id, capital_date);
CREATE INDEX ccap_salesperson_date_idx ON public.customer_capital_allocations USING btree (salesperson_id, capital_date);
CREATE INDEX ccap_snapshot_idx ON public.customer_capital_allocations USING btree (capital_snapshot_id);
CREATE INDEX ledger_created_at_idx ON public.customer_credit_ledger USING btree (created_at DESC);
CREATE INDEX ledger_customer_id_idx ON public.customer_credit_ledger USING btree (customer_id);
CREATE INDEX ledger_reference_idx ON public.customer_credit_ledger USING btree (reference_type, reference_id);
CREATE INDEX idx_ccp_credit_limit ON public.customer_credit_profile USING btree (credit_limit);
CREATE INDEX idx_ccp_credit_score ON public.customer_credit_profile USING btree (credit_score);
CREATE INDEX idx_ccp_customer ON public.customer_credit_profile USING btree (customer_id);
CREATE INDEX idx_ccp_customer_id ON public.customer_credit_profile USING btree (customer_id);
CREATE INDEX idx_ccp_outstanding_balance ON public.customer_credit_profile USING btree (outstanding_balance);
CREATE INDEX idx_ccp_total_purchases ON public.customer_credit_profile USING btree (total_purchases);
CREATE UNIQUE INDEX customers_accounting_code_unique_idx ON public.customers USING btree (accounting_code) WHERE (accounting_code IS NOT NULL);
CREATE INDEX customers_name_idx ON public.customers USING btree (lower(name));
CREATE INDEX customers_person_id_idx ON public.customers USING btree (person_id);
CREATE INDEX customers_phone_idx ON public.customers USING btree (phone);
CREATE INDEX idx_customers_responsible_id ON public.customers USING btree (responsible_id);
CREATE UNIQUE INDEX daily_capital_inputs_date_uidx ON public.daily_capital_inputs USING btree (capital_date);
CREATE INDEX daily_capital_snapshots_date_created_idx ON public.daily_capital_snapshots USING btree (capital_date, created_at DESC);
CREATE UNIQUE INDEX uq_dcs_active_singleton ON public.daily_capital_snapshots USING btree (is_active) WHERE is_active;
CREATE INDEX daily_mood_entries_created_idx ON public.daily_mood_entries USING btree (created_at DESC);
CREATE INDEX daily_mood_entries_followup_idx ON public.daily_mood_entries USING btree (wants_follow_up);
CREATE INDEX daily_mood_entries_mood_date_idx ON public.daily_mood_entries USING btree (mood_date DESC);
CREATE INDEX daily_mood_entries_mood_key_idx ON public.daily_mood_entries USING btree (mood_key);
CREATE INDEX daily_mood_entries_status_idx ON public.daily_mood_entries USING btree (status);
CREATE UNIQUE INDEX daily_mood_entries_user_date_uniq ON public.daily_mood_entries USING btree (user_id, mood_date);
CREATE INDEX daily_mood_entries_user_idx ON public.daily_mood_entries USING btree (user_id);
CREATE INDEX daily_mood_questions_scenario_idx ON public.daily_mood_questions USING btree (scenario_key, sort_order);
CREATE INDEX delivery_receipt_status_history_receipt_idx ON public.delivery_receipt_status_history USING btree (receipt_id);
CREATE INDEX delivery_receipts_customer_id_idx ON public.delivery_receipts USING btree (customer_id);
CREATE INDEX delivery_receipts_invoice_id_idx ON public.delivery_receipts USING btree (invoice_id);
CREATE INDEX delivery_receipts_pending_deadline_idx ON public.delivery_receipts USING btree (review_deadline) WHERE (status = 'pending_review'::text);
CREATE INDEX delivery_receipts_status_idx ON public.delivery_receipts USING btree (status);
CREATE INDEX delivery_receipts_type_idx ON public.delivery_receipts USING btree (type);
CREATE INDEX delivery_receipts_uploaded_by_idx ON public.delivery_receipts USING btree (uploaded_by);
CREATE INDEX document_status_history_document_idx ON public.document_status_history USING btree (document_id);
CREATE INDEX documents_pending_deadline_idx ON public.documents USING btree (review_deadline) WHERE (status = 'pending_review'::text);
CREATE INDEX documents_reference_id_idx ON public.documents USING btree (reference_id);
CREATE INDEX documents_status_idx ON public.documents USING btree (status);
CREATE INDEX documents_type_idx ON public.documents USING btree (type);
CREATE INDEX documents_uploaded_by_idx ON public.documents USING btree (uploaded_by);
CREATE INDEX idx_dyn_cells_datetime_desc ON public.dynamic_table_cells USING btree (column_id, value_datetime DESC) WHERE (value_datetime IS NOT NULL);
CREATE INDEX idx_dyn_cells_text_lookup ON public.dynamic_table_cells USING btree (column_id, value_text) WHERE (value_text IS NOT NULL);
CREATE INDEX idx_dynamic_cells_boolean ON public.dynamic_table_cells USING btree (table_id, column_id, value_boolean);
CREATE INDEX idx_dynamic_cells_date ON public.dynamic_table_cells USING btree (table_id, column_id, value_date);
CREATE INDEX idx_dynamic_cells_datetime ON public.dynamic_table_cells USING btree (table_id, column_id, value_datetime);
CREATE INDEX idx_dynamic_cells_number ON public.dynamic_table_cells USING btree (table_id, column_id, value_number);
CREATE INDEX idx_dynamic_cells_table_col ON public.dynamic_table_cells USING btree (table_id, column_id);
CREATE INDEX idx_dynamic_cells_text ON public.dynamic_table_cells USING btree (table_id, column_id, value_text);
CREATE INDEX idx_dynamic_cells_text_trgm ON public.dynamic_table_cells USING gin (value_text gin_trgm_ops) WHERE (value_text IS NOT NULL);
CREATE INDEX idx_dynamic_columns_table ON public.dynamic_table_columns USING btree (table_id, sort_order);
CREATE INDEX idx_dynamic_rows_table_active ON public.dynamic_table_rows USING btree (table_id, is_active);
CREATE INDEX idx_dynamic_rows_table_rownum ON public.dynamic_table_rows USING btree (table_id, row_number);
CREATE INDEX idx_dynamic_tables_access_level ON public.dynamic_tables USING btree (access_level) WHERE (is_active = true);
CREATE INDEX idx_dynamic_tables_active ON public.dynamic_tables USING btree (is_active);
CREATE INDEX idx_employee_achievements_employee ON public.employee_achievements USING btree (employee_id, unlocked_at DESC);
CREATE INDEX idx_employee_leagues_employee ON public.employee_leagues USING btree (employee_id, created_at DESC);
CREATE INDEX idx_employee_leagues_season ON public.employee_leagues USING btree (season_id, league, rank);
CREATE INDEX idx_employee_level_up_events_employee ON public.employee_level_up_events USING btree (employee_id, created_at DESC);
CREATE INDEX idx_emp_mission_progress_emp_mission ON public.employee_mission_progress USING btree (employee_id, mission_id);
CREATE INDEX idx_emp_mission_progress_employee ON public.employee_mission_progress USING btree (employee_id, period_key);
CREATE INDEX idx_employee_progress_level ON public.employee_progress USING btree (level DESC);
CREATE INDEX idx_score_events_employee ON public.employee_score_events USING btree (employee_id, triggered_at DESC);
CREATE INDEX idx_score_events_employee_type ON public.employee_score_events USING btree (employee_id, event_type);
CREATE UNIQUE INDEX uniq_score_events_source ON public.employee_score_events USING btree (source_table, source_id, event_type) WHERE ((source_table IS NOT NULL) AND (source_id IS NOT NULL));
CREATE INDEX idx_employee_scores_monthly ON public.employee_scores USING btree (monthly_score DESC);
CREATE INDEX idx_employee_scores_monthly_desc ON public.employee_scores USING btree (monthly_score DESC);
CREATE INDEX idx_employee_scores_total ON public.employee_scores USING btree (total_score DESC);
CREATE INDEX idx_feedback_assigned ON public.feedback_items USING btree (assigned_to);
CREATE INDEX idx_feedback_status ON public.feedback_items USING btree (status);
CREATE INDEX idx_feedback_submitted ON public.feedback_items USING btree (submitted_by);
CREATE INDEX idx_feedback_type ON public.feedback_items USING btree (type);
CREATE INDEX idx_gamification_kpi_rules_active ON public.gamification_kpi_rules USING btree (is_active) WHERE (is_active = true);
CREATE INDEX idx_gamification_kpi_rules_sort ON public.gamification_kpi_rules USING btree (sort_order);
CREATE INDEX idx_gamification_kpis_enabled ON public.gamification_kpis USING btree (enabled) WHERE (enabled = true);
CREATE INDEX idx_rewards_active ON public.gamification_rewards USING btree (is_active, sort_order);
CREATE INDEX idx_rewards_trigger ON public.gamification_rewards USING btree (trigger_type, trigger_ref_id);
CREATE INDEX idx_inquiries_group_status ON public.inquiries USING btree (group_id, status);
CREATE INDEX idx_inquiries_product_open ON public.inquiries USING btree (product_id) WHERE (status = ANY (ARRAY['pending'::inquiry_status, 'warning_5min'::inquiry_status, 'danger_8min'::inquiry_status, 'critical_10min'::inquiry_status, 'transfer_available'::inquiry_status, 'transferred'::inquiry_status]));
CREATE INDEX idx_inquiry_price_cache ON public.inquiry_price_cache USING btree (product_id, valid_until);
CREATE INDEX idx_inquiry_status_history ON public.inquiry_status_history USING btree (inquiry_id, changed_at);
CREATE INDEX invoice_items_invoice_id_idx ON public.invoice_items USING btree (invoice_id);
CREATE INDEX invoice_items_product_id_idx ON public.invoice_items USING btree (product_id);
CREATE INDEX idx_invoices_commitment_due ON public.invoices USING btree (commitment_confirmed, due_date) WHERE (commitment_confirmed = true);
CREATE INDEX idx_invoices_customer_due ON public.invoices USING btree (customer_id, due_date);
CREATE INDEX idx_invoices_customer_status ON public.invoices USING btree (customer_id, status);
CREATE INDEX idx_invoices_invoice_type ON public.invoices USING btree (invoice_type);
CREATE INDEX invoices_created_at_idx ON public.invoices USING btree (created_at DESC);
CREATE INDEX invoices_created_by_idx ON public.invoices USING btree (created_by);
CREATE INDEX invoices_customer_id_idx ON public.invoices USING btree (customer_id);
CREATE INDEX invoices_customer_idx ON public.invoices USING btree (customer_id, issue_date DESC);
CREATE INDEX invoices_settlement_type_id_idx ON public.invoices USING btree (settlement_type_id);
CREATE INDEX invoices_type_idx ON public.invoices USING btree (type);
CREATE INDEX idx_journal_entries_entry_date ON public.journal_entries USING btree (entry_date);
CREATE INDEX idx_journal_entries_source ON public.journal_entries USING btree (source_type, source_id);
CREATE INDEX idx_journal_lines_account ON public.journal_lines USING btree (account_kind, account_ref_id);
CREATE INDEX idx_journal_lines_entry ON public.journal_lines USING btree (journal_entry_id);
CREATE INDEX idx_kconf_doc_user ON public.knowledge_confirmations USING btree (document_id, user_id);
CREATE INDEX idx_kd_access ON public.knowledge_documents USING btree (access_level);
CREATE INDEX idx_kd_category ON public.knowledge_documents USING btree (category);
CREATE INDEX idx_kd_published ON public.knowledge_documents USING btree (is_published);
CREATE INDEX idx_league_seasons_active ON public.league_seasons USING btree (is_active) WHERE is_active;
CREATE INDEX idx_league_seasons_dates ON public.league_seasons USING btree (starts_at, ends_at);
CREATE INDEX idx_league_seasons_status ON public.league_seasons USING btree (status);
CREATE UNIQUE INDEX league_settings_tier_uniq ON public.league_settings USING btree (tier) WHERE (tier IS NOT NULL);
CREATE INDEX idx_mpme_created ON public.market_product_match_events USING btree (created_at);
CREATE INDEX idx_mpme_match ON public.market_product_match_events USING btree (match_id);
CREATE INDEX idx_mpme_type ON public.market_product_match_events USING btree (event_type);
CREATE INDEX idx_mpm_afrakala_product ON public.market_product_matches USING btree (afrakala_product_id);
CREATE INDEX idx_mpm_last_seen ON public.market_product_matches USING btree (last_seen_at);
CREATE INDEX idx_mpm_normalized_title_trgm ON public.market_product_matches USING gin (normalized_source_title gin_trgm_ops) WHERE (normalized_source_title IS NOT NULL);
CREATE INDEX idx_mpm_source_status ON public.market_product_matches USING btree (source_name, match_status);
CREATE UNIQUE INDEX uq_mpm_source_id ON public.market_product_matches USING btree (source_name, source_product_id) WHERE (source_product_id IS NOT NULL);
CREATE UNIQUE INDEX uq_mpm_source_url ON public.market_product_matches USING btree (source_name, source_product_url) WHERE (source_product_url IS NOT NULL);
CREATE INDEX idx_mrir_source ON public.market_rate_ingestion_runs USING btree (source_code, started_at DESC);
CREATE INDEX idx_mrir_started_at ON public.market_rate_ingestion_runs USING btree (started_at DESC);
CREATE INDEX idx_mrsm_source ON public.market_rate_source_mappings USING btree (source_id) WHERE (is_enabled = true);
CREATE INDEX market_rate_ticks_created_idx ON public.market_rate_ticks USING btree (created_at DESC);
CREATE INDEX market_rate_ticks_indicator_observed_idx ON public.market_rate_ticks USING btree (indicator_id, observed_at DESC);
CREATE INDEX market_rate_ticks_source_observed_idx ON public.market_rate_ticks USING btree (source_id, observed_at DESC);
CREATE INDEX market_rate_ticks_status_idx ON public.market_rate_ticks USING btree (status);
CREATE INDEX idx_marketing_channels_active ON public.marketing_channels USING btree (is_active);
CREATE INDEX idx_marketing_channels_sort ON public.marketing_channels USING btree (sort_order);
CREATE UNIQUE INDEX marketing_channels_name_norm_uq ON public.marketing_channels USING btree (lower(btrim(name)));
CREATE INDEX message_embeddings_group_idx ON public.message_embeddings USING btree (group_id);
CREATE INDEX message_embeddings_vec_idx ON public.message_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX messages_recipient_idx ON public.messages USING btree (recipient_id, is_read, created_at DESC);
CREATE INDEX idx_messenger_attachments_message ON public.messenger_attachments USING btree (message_id);
CREATE UNIQUE INDEX ux_messenger_attachments_file_path ON public.messenger_attachments USING btree (file_path);
CREATE INDEX idx_messenger_group_members_group ON public.messenger_group_members USING btree (group_id);
CREATE INDEX idx_messenger_group_members_user ON public.messenger_group_members USING btree (user_id);
CREATE INDEX idx_messenger_messages_group_created ON public.messenger_messages USING btree (group_id, created_at DESC);
CREATE INDEX idx_messenger_messages_sender ON public.messenger_messages USING btree (sender_id);
CREATE INDEX idx_messenger_read_receipts_message ON public.messenger_read_receipts USING btree (message_id);
CREATE INDEX idx_messenger_read_receipts_user ON public.messenger_read_receipts USING btree (user_id);
CREATE INDEX idx_missions_enabled_sort ON public.missions USING btree (enabled, sort_order);
CREATE UNIQUE INDEX missions_definition_uniq ON public.missions USING btree (mission_type, condition_event_key, condition_operator, condition_value, repeat_rule) WHERE (condition_event_key IS NOT NULL);
CREATE INDEX ne_created_at_idx ON public.notification_events USING btree (created_at DESC);
CREATE INDEX ne_event_type_idx ON public.notification_events USING btree (event_type);
CREATE INDEX ne_status_idx ON public.notification_events USING btree (status);
CREATE INDEX ne_user_id_idx ON public.notification_events USING btree (user_id);
CREATE INDEX idx_nq_created ON public.notification_queue USING btree (created_at DESC);
CREATE INDEX idx_nq_user ON public.notification_queue USING btree (user_id);
CREATE INDEX idx_nq_user_unread ON public.notification_queue USING btree (user_id, is_read) WHERE (is_read = false);
CREATE INDEX idx_prcf_active_sort ON public.payment_receipt_custom_fields USING btree (is_active, sort_order);
CREATE INDEX idx_prd_receipt_id ON public.payment_receipt_documents USING btree (receipt_id);
CREATE INDEX idx_prd_uploaded_by ON public.payment_receipt_documents USING btree (uploaded_by);
CREATE INDEX idx_payment_receipt_links_invoice_id ON public.payment_receipt_links USING btree (invoice_id);
CREATE INDEX idx_payment_receipt_links_receipt_id ON public.payment_receipt_links USING btree (receipt_id);
CREATE INDEX idx_prl_invoice ON public.payment_receipt_links USING btree (invoice_id);
CREATE INDEX idx_prl_invoice_id ON public.payment_receipt_links USING btree (invoice_id);
CREATE INDEX idx_prl_receipt_id ON public.payment_receipt_links USING btree (receipt_id);
CREATE INDEX idx_payment_receipts_dest_bank ON public.payment_receipts USING btree (destination_bank_account_id);
CREATE INDEX idx_payment_receipts_duplicate_check ON public.payment_receipts USING btree (tracking_number, amount, payment_date, bank_name) WHERE (status <> 'rejected'::text);
CREATE INDEX idx_payment_receipts_receiver_party ON public.payment_receipts USING btree (receiver_party_id);
CREATE INDEX idx_payment_receipts_src_bank ON public.payment_receipts USING btree (source_bank_account_id);
CREATE INDEX idx_payment_receipts_status ON public.payment_receipts USING btree (status);
CREATE INDEX idx_payment_receipts_status_date ON public.payment_receipts USING btree (status, payment_date);
CREATE INDEX receipts_created_at_idx ON public.payment_receipts USING btree (created_at DESC);
CREATE INDEX receipts_customer_id_idx ON public.payment_receipts USING btree (customer_id);
CREATE INDEX receipts_status_idx ON public.payment_receipts USING btree (status);
CREATE INDEX receipts_tracking_idx ON public.payment_receipts USING btree (tracking_number);
CREATE INDEX idx_payment_terms_active ON public.payment_terms USING btree (is_active);
CREATE INDEX idx_appeals_appellant ON public.penalty_appeals USING btree (appellant_id);
CREATE INDEX idx_appeals_status ON public.penalty_appeals USING btree (status);
CREATE INDEX idx_penalties_active ON public.performance_penalties USING btree (is_active);
CREATE INDEX idx_penalties_inquiry ON public.performance_penalties USING btree (inquiry_id);
CREATE INDEX idx_penalties_user_created ON public.performance_penalties USING btree (user_id, created_at DESC);
CREATE INDEX idx_pcl_context_kind ON public.person_context_links USING btree (context_kind);
CREATE INDEX idx_pcl_ended_at ON public.person_context_links USING btree (ended_at);
CREATE INDEX idx_pcl_person_id ON public.person_context_links USING btree (person_id);
CREATE INDEX idx_pcl_ref ON public.person_context_links USING btree (ref_table, ref_id);
CREATE UNIQUE INDEX uq_pcl_active_ref ON public.person_context_links USING btree (person_id, context_kind, ref_table, ref_id) WHERE ((ended_at IS NULL) AND (ref_table IS NOT NULL) AND (ref_id IS NOT NULL));
CREATE INDEX idx_pfd_applies_to_kind ON public.person_field_definitions USING btree (applies_to_kind);
CREATE INDEX idx_pfd_is_active ON public.person_field_definitions USING btree (is_active);
CREATE INDEX idx_pfd_sort_order ON public.person_field_definitions USING btree (sort_order);
CREATE INDEX idx_pfv_field_definition_id ON public.person_field_values USING btree (field_definition_id);
CREATE INDEX idx_pfv_person_id ON public.person_field_values USING btree (person_id);
CREATE INDEX idx_person_identifiers_kind ON public.person_identifiers USING btree (kind);
CREATE INDEX idx_person_identifiers_kind_value ON public.person_identifiers USING btree (kind, value_normalized);
CREATE INDEX idx_person_identifiers_person_id ON public.person_identifiers USING btree (person_id);
CREATE UNIQUE INDEX uq_person_identifiers_active_kind_value ON public.person_identifiers USING btree (kind, value_normalized) WHERE (status = ANY (ARRAY['provisional'::text, 'confirmed'::text]));
CREATE UNIQUE INDEX uq_person_identifiers_confirmed_kind_value ON public.person_identifiers USING btree (kind, value_normalized) WHERE (status = 'confirmed'::text);
CREATE UNIQUE INDEX uq_person_identifiers_primary_active ON public.person_identifiers USING btree (person_id, kind) WHERE ((is_primary = true) AND (status <> 'revoked'::text));
CREATE INDEX idx_persons_is_active ON public.persons USING btree (is_active);
CREATE INDEX idx_persons_kind ON public.persons USING btree (kind);
CREATE INDEX idx_persons_visibility_scope ON public.persons USING btree (visibility_scope);
CREATE INDEX idx_pan_created ON public.price_alert_notifications USING btree (created_at DESC);
CREATE INDEX idx_pan_product ON public.price_alert_notifications USING btree (product_id);
CREATE INDEX idx_pan_unread ON public.price_alert_notifications USING btree (user_id, is_read);
CREATE INDEX idx_pan_user ON public.price_alert_notifications USING btree (user_id);
CREATE INDEX idx_par_active ON public.price_alert_rules USING btree (is_active);
CREATE INDEX idx_par_last_trig ON public.price_alert_rules USING btree (last_triggered_at);
CREATE INDEX idx_par_lookup_active ON public.price_alert_rules USING btree (product_id, sale_price_type_id, is_active);
CREATE INDEX idx_par_operator ON public.price_alert_rules USING btree (operator);
CREATE INDEX idx_par_product ON public.price_alert_rules USING btree (product_id);
CREATE INDEX idx_par_spt ON public.price_alert_rules USING btree (sale_price_type_id);
CREATE INDEX idx_par_user ON public.price_alert_rules USING btree (user_id);
CREATE UNIQUE INDEX uq_par_active_dedup ON public.price_alert_rules USING btree (user_id, product_id, COALESCE((sale_price_type_id)::text, '-'::text), operator, COALESCE(target_value, ('-1'::integer)::numeric), target_currency) WHERE (is_active = true);
CREATE INDEX idx_snapshots_product_calc ON public.price_calculation_snapshots USING btree (product_id, calculated_at DESC);
CREATE INDEX idx_snapshots_product_type_calc ON public.price_calculation_snapshots USING btree (product_id, sale_price_type_id, calculated_at DESC);
CREATE INDEX idx_snapshots_sale_price_type ON public.price_calculation_snapshots USING btree (sale_price_type_id);
CREATE INDEX snapshots_product_idx ON public.price_calculation_snapshots USING btree (product_id);
CREATE INDEX snapshots_time_idx ON public.price_calculation_snapshots USING btree (calculated_at DESC);
CREATE INDEX pba_requested_at_idx ON public.pricing_board_access_requests USING btree (requested_at DESC);
CREATE INDEX pba_status_idx ON public.pricing_board_access_requests USING btree (status);
CREATE UNIQUE INDEX pba_unique_user_board ON public.pricing_board_access_requests USING btree (board_key, user_id);
CREATE INDEX pbvs_last_seen_idx ON public.pricing_board_viewer_sessions USING btree (board_key, last_seen_at DESC);
CREATE UNIQUE INDEX pbvs_unique_active ON public.pricing_board_viewer_sessions USING btree (board_key, user_id) WHERE (left_at IS NULL);
CREATE INDEX idx_prq_pending_pri_eq ON public.pricing_recompute_queue USING btree (status, priority, enqueued_at) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));
CREATE INDEX idx_prq_product ON public.pricing_recompute_queue USING btree (product_id);
CREATE INDEX idx_prq_reason ON public.pricing_recompute_queue USING btree (reason);
CREATE INDEX idx_prq_source ON public.pricing_recompute_queue USING btree (source_table, source_id);
CREATE UNIQUE INDEX uq_prq_pending_dedupe ON public.pricing_recompute_queue USING btree (product_id, reason, COALESCE(source_table, ''::text), COALESCE(source_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(sale_price_type_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));
CREATE INDEX idx_pricing_rules_active_prio ON public.pricing_rules USING btree (is_active, priority);
CREATE INDEX idx_pricing_rules_brand ON public.pricing_rules USING btree (brand_id);
CREATE INDEX idx_pricing_rules_category ON public.pricing_rules USING btree (category_id);
CREATE INDEX idx_pricing_rules_product_type ON public.pricing_rules USING btree (product_type);
CREATE INDEX idx_pricing_rules_sale_price_type ON public.pricing_rules USING btree (sale_price_type_id);
CREATE INDEX pricing_rules_active_idx ON public.pricing_rules USING btree (is_active, priority);
CREATE INDEX idx_pag_active ON public.product_attribute_groups USING btree (is_active);
CREATE INDEX idx_pag_sort ON public.product_attribute_groups USING btree (sort_order);
CREATE INDEX idx_product_attributes_group ON public.product_attributes USING btree (group_id);
CREATE INDEX idx_product_attributes_type_category_name ON public.product_attributes USING btree (type, category_id, name);
CREATE INDEX product_attributes_type_active_idx ON public.product_attributes USING btree (type, is_active);
CREATE UNIQUE INDEX product_attributes_type_name_unique ON public.product_attributes USING btree (type, lower(name));
CREATE UNIQUE INDEX uq_product_attributes_model_per_category ON public.product_attributes USING btree (category_id, lower(btrim(name))) WHERE ((type = 'model'::product_attribute_type) AND (category_id IS NOT NULL));
CREATE INDEX idx_pcav_value_trgm ON public.product_category_attribute_values USING gin (value gin_trgm_ops);
CREATE INDEX pcav_attr_idx ON public.product_category_attribute_values USING btree (category_attribute_id);
CREATE INDEX pcav_product_idx ON public.product_category_attribute_values USING btree (product_id);
CREATE INDEX idx_pcp_currency ON public.product_computed_prices USING btree (input_currency);
CREATE INDEX idx_pcp_product ON public.product_computed_prices USING btree (product_id);
CREATE INDEX idx_pie_created ON public.product_interaction_events USING btree (created_at DESC);
CREATE INDEX idx_pie_event_created ON public.product_interaction_events USING btree (event_type, created_at DESC);
CREATE INDEX idx_pie_product_created ON public.product_interaction_events USING btree (product_id, created_at DESC);
CREATE INDEX idx_pie_source_created ON public.product_interaction_events USING btree (source, created_at DESC);
CREATE INDEX idx_pie_spt_created ON public.product_interaction_events USING btree (sale_price_type_id, created_at DESC);
CREATE INDEX idx_pie_user_created ON public.product_interaction_events USING btree (user_id, created_at DESC);
CREATE INDEX product_label_links_label_idx ON public.product_label_links USING btree (label_id);
CREATE INDEX idx_product_labels_visibility ON public.product_labels USING btree (visibility);
CREATE INDEX product_labels_active_idx ON public.product_labels USING btree (is_active);
CREATE INDEX product_owner_product_idx ON public.product_owner_assignments USING btree (product_id);
CREATE INDEX product_owner_user_idx ON public.product_owner_assignments USING btree (user_id);
CREATE INDEX idx_pro_product ON public.product_recommendation_overrides USING btree (product_id);
CREATE INDEX idx_pro_recommended ON public.product_recommendation_overrides USING btree (recommended_product_id);
CREATE INDEX idx_psph_product_type_created ON public.product_sale_price_history USING btree (product_id, sale_price_type_id, created_at DESC);
CREATE INDEX idx_sale_history_product_type_created ON public.product_sale_price_history USING btree (product_id, sale_price_type_id, created_at DESC);
CREATE INDEX idx_sale_history_sale_price_type ON public.product_sale_price_history USING btree (sale_price_type_id);
CREATE INDEX idx_sale_price_history_product ON public.product_sale_price_history USING btree (product_id, created_at DESC);
CREATE INDEX sale_history_product_idx ON public.product_sale_price_history USING btree (product_id);
CREATE INDEX sale_history_time_idx ON public.product_sale_price_history USING btree (created_at DESC);
CREATE INDEX idx_ps_auto_added ON public.product_suppliers USING btree (auto_added) WHERE (auto_added = true);
CREATE INDEX idx_ps_product ON public.product_suppliers USING btree (product_id);
CREATE INDEX idx_ps_supplier ON public.product_suppliers USING btree (supplier_id);
CREATE INDEX idx_products_capacity_trgm ON public.products USING gin (capacity gin_trgm_ops) WHERE (capacity IS NOT NULL);
CREATE INDEX idx_products_color_trgm ON public.products USING gin (color gin_trgm_ops) WHERE (color IS NOT NULL);
CREATE INDEX idx_products_model_trgm ON public.products USING gin (model gin_trgm_ops) WHERE (model IS NOT NULL);
CREATE INDEX idx_products_name_trgm ON public.products USING gin (name gin_trgm_ops);
CREATE INDEX idx_products_primary_spec_trgm ON public.products USING gin (primary_spec gin_trgm_ops) WHERE (primary_spec IS NOT NULL);
CREATE INDEX idx_products_sku_trgm ON public.products USING gin (sku gin_trgm_ops) WHERE (sku IS NOT NULL);
CREATE INDEX products_brand_idx ON public.products USING btree (brand_id);
CREATE INDEX products_category_idx ON public.products USING btree (category_id);
CREATE UNIQUE INDEX products_dedup_key_unique ON public.products USING btree (dedup_key) WHERE ((dedup_key IS NOT NULL) AND (status <> 'discontinued'::product_status));
CREATE INDEX products_name_idx ON public.products USING btree (name);
CREATE INDEX products_sku_idx ON public.products USING btree (sku);
CREATE INDEX products_status_idx ON public.products USING btree (status);
CREATE INDEX products_stock_idx ON public.products USING btree (stock_status);
CREATE INDEX products_type_idx ON public.products USING btree (product_type);
CREATE INDEX idx_profile_field_defs_active ON public.profile_field_definitions USING btree (is_active, sort_order);
CREATE INDEX idx_pfv_user ON public.profile_field_values USING btree (user_id);
CREATE INDEX idx_profiles_full_name_lower ON public.profiles USING btree (lower(full_name));
CREATE INDEX idx_profiles_status ON public.profiles USING btree (status);
CREATE INDEX idx_purchase_prices_product_active ON public.purchase_prices USING btree (product_id, is_active);
CREATE INDEX idx_purchase_prices_product_eff ON public.purchase_prices USING btree (product_id, effective_at DESC);
CREATE INDEX purchase_prices_effective_idx ON public.purchase_prices USING btree (product_id, effective_at DESC);
CREATE INDEX purchase_prices_product_idx ON public.purchase_prices USING btree (product_id);
CREATE INDEX purchase_receipts_request_id_idx ON public.purchase_receipts USING btree (request_id);
CREATE INDEX purchase_request_status_history_request_id_idx ON public.purchase_request_status_history USING btree (request_id);
CREATE INDEX purchase_requests_assigned_to_idx ON public.purchase_requests USING btree (assigned_to);
CREATE INDEX purchase_requests_inquiry_id_idx ON public.purchase_requests USING btree (inquiry_id);
CREATE INDEX purchase_requests_product_id_idx ON public.purchase_requests USING btree (product_id);
CREATE INDEX purchase_requests_requested_by_idx ON public.purchase_requests USING btree (requested_by);
CREATE INDEX purchase_requests_status_idx ON public.purchase_requests USING btree (status);
CREATE INDEX idx_purchases_paid_at ON public.purchases USING btree (paid_at);
CREATE INDEX idx_purchases_payment_term ON public.purchases USING btree (payment_term_id);
CREATE INDEX idx_purchases_purchase_date ON public.purchases USING btree (purchase_date);
CREATE INDEX idx_purchases_supplier_paid ON public.purchases USING btree (supplier_id, paid_at);
CREATE INDEX purchases_created_by_idx ON public.purchases USING btree (created_by);
CREATE INDEX purchases_product_id_idx ON public.purchases USING btree (product_id);
CREATE INDEX purchases_purchase_date_idx ON public.purchases USING btree (purchase_date DESC);
CREATE INDEX purchases_supplier_id_idx ON public.purchases USING btree (supplier_id);
CREATE INDEX idx_role_permissions_module ON public.role_permissions USING btree (module);
CREATE INDEX idx_role_permissions_role_name ON public.role_permissions USING btree (role_name);
CREATE INDEX idx_sale_list_items_list ON public.sale_list_items USING btree (sale_list_id);
CREATE INDEX idx_sale_list_items_product ON public.sale_list_items USING btree (product_id);
CREATE INDEX idx_sale_list_items_sale_list_id_sort ON public.sale_list_items USING btree (sale_list_id, sort_order);
CREATE INDEX idx_sale_list_versions_list ON public.sale_list_versions USING btree (sale_list_id);
CREATE INDEX idx_sale_list_versions_num ON public.sale_list_versions USING btree (sale_list_id, version_number);
CREATE INDEX idx_sale_lists_created_at ON public.sale_lists USING btree (created_at DESC);
CREATE INDEX idx_sale_lists_created_by ON public.sale_lists USING btree (created_by);
CREATE INDEX idx_sale_lists_settlement_type_id ON public.sale_lists USING btree (settlement_type_id);
CREATE INDEX idx_sale_lists_status ON public.sale_lists USING btree (status);
CREATE INDEX idx_sale_price_types_active ON public.sale_price_types USING btree (is_active);
CREATE INDEX idx_sale_price_types_sort ON public.sale_price_types USING btree (sort_order);
CREATE UNIQUE INDEX sale_price_types_title_unique_active ON public.sale_price_types USING btree (lower(TRIM(BOTH FROM title))) WHERE (is_active = true);
CREATE INDEX idx_sales_quote_items_product ON public.sales_quote_items USING btree (product_id);
CREATE INDEX idx_sales_quote_items_quote ON public.sales_quote_items USING btree (quote_id);
CREATE INDEX idx_sqsq_channel ON public.sales_quote_send_queue USING btree (channel);
CREATE INDEX idx_sqsq_created_at_desc ON public.sales_quote_send_queue USING btree (created_at DESC);
CREATE INDEX idx_sqsq_quote_id ON public.sales_quote_send_queue USING btree (quote_id);
CREATE INDEX idx_sqsq_scheduled_at ON public.sales_quote_send_queue USING btree (scheduled_at);
CREATE INDEX idx_sqsq_share_log_id ON public.sales_quote_send_queue USING btree (share_log_id);
CREATE INDEX idx_sqsq_status ON public.sales_quote_send_queue USING btree (status);
CREATE INDEX idx_sqsl_attempted_at_desc ON public.sales_quote_share_logs USING btree (attempted_at DESC);
CREATE INDEX idx_sqsl_attempted_by ON public.sales_quote_share_logs USING btree (attempted_by);
CREATE INDEX idx_sqsl_channel ON public.sales_quote_share_logs USING btree (channel);
CREATE INDEX idx_sqsl_quote_id ON public.sales_quote_share_logs USING btree (quote_id);
CREATE INDEX idx_sqsl_status ON public.sales_quote_share_logs USING btree (status);
CREATE INDEX idx_sales_quotes_created_at ON public.sales_quotes USING btree (created_at DESC);
CREATE INDEX idx_sales_quotes_customer_phone ON public.sales_quotes USING btree (customer_phone);
CREATE INDEX idx_sales_quotes_salesperson ON public.sales_quotes USING btree (salesperson_id);
CREATE INDEX idx_sales_quotes_status ON public.sales_quotes USING btree (status);
CREATE INDEX scap_capital_date_idx ON public.salesperson_capital_allocations USING btree (capital_date);
CREATE INDEX scap_salesperson_date_idx ON public.salesperson_capital_allocations USING btree (salesperson_id, capital_date);
CREATE UNIQUE INDEX scap_snapshot_salesperson_uniq ON public.salesperson_capital_allocations USING btree (capital_snapshot_id, salesperson_id);
CREATE INDEX idx_score_snapshots_captured_at ON public.score_snapshots USING btree (captured_at DESC);
CREATE INDEX idx_score_snapshots_employee ON public.score_snapshots USING btree (employee_id);
CREATE INDEX idx_score_snapshots_employee_captured ON public.score_snapshots USING btree (employee_id, captured_at);
CREATE INDEX idx_score_snapshots_employee_time ON public.score_snapshots USING btree (employee_id, captured_at DESC);
CREATE INDEX settlement_types_active_sort_idx ON public.settlement_types USING btree (is_active, sort_order);
CREATE INDEX idx_shipping_rules_active_prio ON public.shipping_cost_rules USING btree (is_active, priority);
CREATE INDEX idx_shipping_rules_brand ON public.shipping_cost_rules USING btree (brand_id) WHERE (brand_id IS NOT NULL);
CREATE INDEX idx_shipping_rules_category ON public.shipping_cost_rules USING btree (category_id) WHERE (category_id IS NOT NULL);
CREATE INDEX idx_shipping_rules_product ON public.shipping_cost_rules USING btree (product_id) WHERE (product_id IS NOT NULL);
CREATE INDEX idx_shipping_rules_product_active ON public.shipping_cost_rules USING btree (product_id) WHERE ((is_active = true) AND (product_id IS NOT NULL));
CREATE INDEX idx_shipping_rules_sort_order ON public.shipping_cost_rules USING btree (sort_order);
CREATE INDEX shipping_rules_priority_idx ON public.shipping_cost_rules USING btree (priority);
CREATE INDEX shipping_rules_product_type_idx ON public.shipping_cost_rules USING btree (product_type);
CREATE INDEX idx_stock_alert_requests_phone ON public.stock_alert_requests USING btree (customer_phone);
CREATE INDEX idx_stock_alert_requests_product ON public.stock_alert_requests USING btree (product_id);
CREATE INDEX idx_stock_alert_requests_requested_at ON public.stock_alert_requests USING btree (requested_at DESC);
CREATE INDEX idx_stock_alert_requests_salesperson ON public.stock_alert_requests USING btree (salesperson_id);
CREATE INDEX idx_stock_alert_requests_status ON public.stock_alert_requests USING btree (status);
CREATE UNIQUE INDEX uq_stock_alert_open_per_product_phone ON public.stock_alert_requests USING btree (product_id, customer_phone) WHERE (status = 'open'::stock_alert_status);
CREATE INDEX idx_suppliers_created_by ON public.suppliers USING btree (created_by);
CREATE INDEX idx_suppliers_status ON public.suppliers USING btree (status);
CREATE INDEX idx_suppliers_trust ON public.suppliers USING btree (trust_level);
CREATE INDEX suppliers_name_idx ON public.suppliers USING btree (name);
CREATE INDEX idx_tasks_assigned ON public.tasks USING btree (assigned_to);
CREATE INDEX idx_tasks_created ON public.tasks USING btree (created_at DESC);
CREATE INDEX idx_tasks_ref ON public.tasks USING btree (reference_type, reference_id);
CREATE INDEX idx_tasks_status ON public.tasks USING btree (status);
CREATE INDEX idx_wcf_active_sort ON public.waybill_custom_fields USING btree (is_active, sort_order);
CREATE INDEX idx_waybill_items_invoice_item ON public.waybill_items USING btree (invoice_item_id);
CREATE INDEX idx_waybill_items_waybill ON public.waybill_items USING btree (waybill_id);
CREATE INDEX idx_waybills_invoice ON public.waybills USING btree (invoice_id);
CREATE INDEX idx_waybills_status ON public.waybills USING btree (status);
CREATE INDEX workflow_settings_process_key_idx ON public.workflow_settings USING btree (process_key);


-- ============ FUNCTIONS ============
CREATE OR REPLACE FUNCTION public._archive_prior_allocations_on_active()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_active = true AND (TG_OP='INSERT' OR OLD.is_active = false) THEN
    UPDATE public.customer_capital_allocations
       SET status = 'archived', updated_at = now()
     WHERE capital_snapshot_id <> NEW.id AND status NOT IN ('archived');
    UPDATE public.salesperson_capital_allocations
       SET status = 'archived', updated_at = now()
     WHERE capital_snapshot_id <> NEW.id AND status NOT IN ('archived');
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public._dyn_compute_row_values(p_table_id uuid, p_row_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _out jsonb := '{}'::jsonb;
  _col record;
  _afrakala_pid uuid;
  _afrakala_pid_text text;
  _match_key text;
  _source text;
  _grouping_key text;
  _grouping_col_id uuid;
  _source_col_id uuid;
  _extracted_at_col_id uuid;
  _batch_id_col_id uuid;
  _price_col_id uuid;
  _latest_batch text;
  _avg_price numeric;
  _purchase_price numeric;
  _min_sale numeric;
  _table_slug text;
BEGIN
  -- Determine table slug (used to switch computation strategy)
  SELECT slug INTO _table_slug FROM public.dynamic_tables WHERE id = p_table_id;

  -- Resolve key column ids ONCE for this table (used in non-observatory path)
  SELECT id INTO _source_col_id        FROM public.dynamic_table_columns WHERE table_id = p_table_id AND column_key = 'source';
  SELECT id INTO _extracted_at_col_id  FROM public.dynamic_table_columns WHERE table_id = p_table_id AND column_key = 'extracted_at';
  SELECT id INTO _batch_id_col_id      FROM public.dynamic_table_columns WHERE table_id = p_table_id AND column_key = 'extraction_batch_id';
  SELECT id INTO _price_col_id         FROM public.dynamic_table_columns WHERE table_id = p_table_id AND column_key = 'extracted_price_toman';

  -- Read base values from the current row
  SELECT c.value_text INTO _afrakala_pid_text
  FROM public.dynamic_table_cells c
  JOIN public.dynamic_table_columns col ON col.id = c.column_id
  WHERE c.row_id = p_row_id AND col.column_key = 'afrakala_product_id';

  SELECT c.value_text INTO _match_key
  FROM public.dynamic_table_cells c
  JOIN public.dynamic_table_columns col ON col.id = c.column_id
  WHERE c.row_id = p_row_id AND col.column_key = 'match_key';

  SELECT c.value_text INTO _source
  FROM public.dynamic_table_cells c
  JOIN public.dynamic_table_columns col ON col.id = c.column_id
  WHERE c.row_id = p_row_id AND col.column_key = 'source';

  BEGIN
    _afrakala_pid := NULLIF(btrim(COALESCE(_afrakala_pid_text, '')), '')::uuid;
  EXCEPTION WHEN others THEN
    _afrakala_pid := NULL;
  END;

  -- Latest purchase price (toman) from existing pricing data
  IF _afrakala_pid IS NOT NULL THEN
    SELECT pp.purchase_price INTO _purchase_price
    FROM public.purchase_prices pp
    WHERE pp.product_id = _afrakala_pid
      AND pp.is_active = true
      AND pp.currency = 'toman'::currency_code
    ORDER BY pp.effective_at DESC
    LIMIT 1;

    SELECT MIN(pcp.rounded_sale_price) INTO _min_sale
    FROM public.product_computed_prices pcp
    WHERE pcp.product_id = _afrakala_pid;
  END IF;

  IF _table_slug = 'afrakala-product-price-observatory' THEN
    -- Observatory: _avg_price = average of torob_avg + purchista_avg (non-null)
    SELECT AVG(s.x)::numeric INTO _avg_price
    FROM (
      SELECT c.value_number AS x
      FROM public.dynamic_table_cells c
      JOIN public.dynamic_table_columns col ON col.id = c.column_id
      WHERE c.row_id = p_row_id
        AND col.column_key IN ('torob_avg_price_toman','purchista_avg_price_toman')
        AND c.value_number IS NOT NULL
    ) s;
  ELSE
    -- Existing behavior for Torob/Purchista raw extraction table
    IF _afrakala_pid IS NOT NULL THEN
      _grouping_key := _afrakala_pid_text;
      _grouping_col_id := (SELECT id FROM public.dynamic_table_columns WHERE table_id = p_table_id AND column_key = 'afrakala_product_id');
    ELSIF _match_key IS NOT NULL AND length(btrim(_match_key)) > 0 THEN
      _grouping_key := _match_key;
      _grouping_col_id := (SELECT id FROM public.dynamic_table_columns WHERE table_id = p_table_id AND column_key = 'match_key');
    ELSE
      _grouping_key := NULL;
    END IF;

    IF _grouping_key IS NOT NULL AND _source IS NOT NULL
       AND _source_col_id IS NOT NULL AND _extracted_at_col_id IS NOT NULL
       AND _batch_id_col_id IS NOT NULL AND _price_col_id IS NOT NULL THEN
      WITH peer_rows AS (
        SELECT r.id AS row_id
        FROM public.dynamic_table_rows r
        WHERE r.table_id = p_table_id
          AND r.is_active = true
          AND EXISTS (
            SELECT 1 FROM public.dynamic_table_cells cs
            WHERE cs.row_id = r.id AND cs.column_id = _source_col_id AND cs.value_text = _source
          )
          AND EXISTS (
            SELECT 1 FROM public.dynamic_table_cells cg
            WHERE cg.row_id = r.id AND cg.column_id = _grouping_col_id AND cg.value_text = _grouping_key
          )
      ),
      latest AS (
        SELECT cb.value_text AS batch_id
        FROM peer_rows pr
        JOIN public.dynamic_table_cells ce ON ce.row_id = pr.row_id AND ce.column_id = _extracted_at_col_id
        JOIN public.dynamic_table_cells cb ON cb.row_id = pr.row_id AND cb.column_id = _batch_id_col_id
        ORDER BY ce.value_datetime DESC NULLS LAST
        LIMIT 1
      )
      SELECT batch_id INTO _latest_batch FROM latest;

      IF _latest_batch IS NOT NULL THEN
        SELECT AVG(cp.value_number)::numeric INTO _avg_price
        FROM public.dynamic_table_rows r
        JOIN public.dynamic_table_cells cs ON cs.row_id = r.id AND cs.column_id = _source_col_id AND cs.value_text = _source
        JOIN public.dynamic_table_cells cg ON cg.row_id = r.id AND cg.column_id = _grouping_col_id AND cg.value_text = _grouping_key
        JOIN public.dynamic_table_cells cb ON cb.row_id = r.id AND cb.column_id = _batch_id_col_id AND cb.value_text = _latest_batch
        JOIN public.dynamic_table_cells cp ON cp.row_id = r.id AND cp.column_id = _price_col_id
        WHERE r.table_id = p_table_id
          AND r.is_active = true
          AND cp.value_number IS NOT NULL
          AND cp.value_number > 0;
      END IF;
    END IF;
  END IF;

  -- Build output for each computed column in this table
  FOR _col IN
    SELECT column_key, formula_key
    FROM public.dynamic_table_columns
    WHERE table_id = p_table_id AND is_computed = true AND formula_key IS NOT NULL
  LOOP
    IF _col.formula_key = 'latest_purchase_price_toman' THEN
      _out := _out || jsonb_build_object(_col.column_key, to_jsonb(_purchase_price));
    ELSIF _col.formula_key = 'min_sale_price' THEN
      _out := _out || jsonb_build_object(_col.column_key, to_jsonb(_min_sale));
    ELSIF _col.formula_key = 'latest_batch_average_price' THEN
      _out := _out || jsonb_build_object(_col.column_key, to_jsonb(_avg_price));
    ELSIF _col.formula_key = 'price_gap_to_market_avg' THEN
      IF _min_sale IS NOT NULL AND _avg_price IS NOT NULL THEN
        _out := _out || jsonb_build_object(_col.column_key, to_jsonb((_min_sale - _avg_price)::numeric));
      ELSE
        _out := _out || jsonb_build_object(_col.column_key, 'null'::jsonb);
      END IF;
    ELSIF _col.formula_key = 'price_gap_percent_to_market_avg' THEN
      IF _min_sale IS NOT NULL AND _avg_price IS NOT NULL AND _avg_price <> 0 THEN
        _out := _out || jsonb_build_object(
          _col.column_key,
          to_jsonb(round(((_min_sale - _avg_price) / _avg_price * 100)::numeric, 2))
        );
      ELSE
        _out := _out || jsonb_build_object(_col.column_key, 'null'::jsonb);
      END IF;
    END IF;
  END LOOP;

  RETURN _out;
END;
$function$
;

CREATE OR REPLACE FUNCTION public._ensure_credit_balance(p_customer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.customer_credit_balance (customer_id, available_credit, held_credit)
  VALUES (
    p_customer_id,
    COALESCE((SELECT credit_limit FROM public.customer_credit_profile WHERE customer_id = p_customer_id LIMIT 1), 0),
    0
  )
  ON CONFLICT (customer_id) DO NOTHING;
END;
$function$
;

CREATE OR REPLACE FUNCTION public._mi_require_privileged()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public._obs_compute_row_values(p_row_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _table_id uuid;
  _slug text;
  _vals jsonb;
  _torob_avg numeric;
  _purchista_avg numeric;
  _torob_min numeric;
  _purchista_min numeric;
  _stock_status text;
  _product_labels text;
  _afrakala_pid_text text;
  _afrakala_pid uuid;
  _min_sale numeric;
  _market_avg numeric;
  _market_min numeric;
  _gap_to_min numeric;
  _gap_pct numeric;
  _status text;
  _base numeric;
  _score numeric;
  _msg text;
BEGIN
  SELECT r.table_id INTO _table_id FROM public.dynamic_table_rows r WHERE r.id = p_row_id;
  IF _table_id IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT t.slug INTO _slug FROM public.dynamic_tables t WHERE t.id = _table_id;
  IF _slug IS DISTINCT FROM 'afrakala-product-price-observatory' THEN
    RETURN '{}'::jsonb;
  END IF;

  -- Collect needed cells in one pass
  SELECT jsonb_object_agg(
           col.column_key,
           jsonb_build_object('n', c.value_number, 't', c.value_text)
         )
    INTO _vals
  FROM public.dynamic_table_cells c
  JOIN public.dynamic_table_columns col ON col.id = c.column_id
  WHERE c.row_id = p_row_id
    AND col.column_key IN (
      'torob_avg_price_toman','purchista_avg_price_toman',
      'torob_min_price_toman','purchista_min_price_toman',
      'stock_status','product_labels','afrakala_product_id'
    );

  IF _vals IS NULL THEN _vals := '{}'::jsonb; END IF;

  _torob_avg      := NULLIF(_vals->'torob_avg_price_toman'->>'n','')::numeric;
  _purchista_avg  := NULLIF(_vals->'purchista_avg_price_toman'->>'n','')::numeric;
  _torob_min      := NULLIF(_vals->'torob_min_price_toman'->>'n','')::numeric;
  _purchista_min  := NULLIF(_vals->'purchista_min_price_toman'->>'n','')::numeric;
  _stock_status   := _vals->'stock_status'->>'t';
  _product_labels := _vals->'product_labels'->>'t';
  _afrakala_pid_text := _vals->'afrakala_product_id'->>'t';

  BEGIN
    _afrakala_pid := NULLIF(btrim(COALESCE(_afrakala_pid_text,'')),'')::uuid;
  EXCEPTION WHEN others THEN
    _afrakala_pid := NULL;
  END;

  -- afrakala min sale price (same source as 'min_sale_price' formula)
  IF _afrakala_pid IS NOT NULL THEN
    SELECT MIN(pcp.rounded_sale_price) INTO _min_sale
    FROM public.product_computed_prices pcp
    WHERE pcp.product_id = _afrakala_pid;
  END IF;

  -- market_avg
  IF _torob_avg IS NOT NULL AND _purchista_avg IS NOT NULL THEN
    _market_avg := (_torob_avg + _purchista_avg) / 2.0;
  ELSIF _torob_avg IS NOT NULL THEN
    _market_avg := _torob_avg;
  ELSIF _purchista_avg IS NOT NULL THEN
    _market_avg := _purchista_avg;
  END IF;

  -- market_min
  IF _torob_min IS NOT NULL AND _purchista_min IS NOT NULL THEN
    _market_min := LEAST(_torob_min, _purchista_min);
  ELSIF _torob_min IS NOT NULL THEN
    _market_min := _torob_min;
  ELSIF _purchista_min IS NOT NULL THEN
    _market_min := _purchista_min;
  END IF;

  -- price gap to market min
  IF _market_min IS NOT NULL AND _min_sale IS NOT NULL THEN
    _gap_to_min := _min_sale - _market_min;
  END IF;

  -- competitive_price_status
  IF _market_avg IS NULL OR _min_sale IS NULL OR _market_avg = 0 THEN
    _status := 'unknown';
  ELSE
    _gap_pct := (_min_sale - _market_avg) / _market_avg;
    IF _gap_pct <= -0.03 THEN
      _status := 'below_market';
    ELSIF _gap_pct >= 0.03 THEN
      _status := 'above_market';
    ELSE
      _status := 'near_market';
    END IF;
  END IF;

  -- sales_opportunity_score
  IF _market_avg IS NULL OR _min_sale IS NULL OR _market_avg = 0 THEN
    _score := NULL;
  ELSE
    _base := 50;
    _base := _base + GREATEST(-40, LEAST(40, ((_market_avg - _min_sale) / _market_avg) * 100 * 2));
    IF _stock_status IN ('in_stock','available','موجود') THEN
      _base := _base + 10;
    ELSIF _stock_status IN ('out_of_stock','unavailable','ناموجود') THEN
      _base := _base - 30;
    END IF;
    IF _product_labels IS NOT NULL
       AND (_product_labels ILIKE '%پرفروش%' OR _product_labels ILIKE '%ویژه%') THEN
      _base := _base + 5;
    END IF;
    _score := GREATEST(0, LEAST(100, round(_base)));
  END IF;

  -- suggested_sales_message
  _msg := CASE _status
    WHEN 'below_market' THEN 'این محصول از میانگین بازار ارزان‌تر است؛ برای مشتریانی که قیمت را مقایسه می‌کنند گزینه خوبی است.'
    WHEN 'near_market'  THEN 'قیمت این محصول نزدیک به بازار است؛ روی موجودی، گارانتی و سرعت تحویل تأکید کنید.'
    WHEN 'above_market' THEN 'قیمت این محصول بالاتر از میانگین بازار است؛ قبل از پیشنهاد، شرایط فروش یا تخفیف را بررسی کنید.'
    ELSE 'داده بازار کافی برای پیشنهاد قیمت موجود نیست.'
  END;

  RETURN jsonb_build_object(
    'market_avg_price_toman',  to_jsonb(_market_avg),
    'price_gap_to_market_min', to_jsonb(_gap_to_min),
    'competitive_price_status', to_jsonb(_status),
    'sales_opportunity_score', to_jsonb(_score),
    'sales_priority_rank',     'null'::jsonb,
    'suggested_sales_message', to_jsonb(_msg)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public._par_after_price_history_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.check_price_alerts_for_product(
    NEW.product_id,
    NEW.sale_price_type_id,
    NEW.new_sale_price,
    NEW.old_sale_price,
    NEW.change_percent
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block price writes due to alert evaluation failure
  RETURN NEW;
END;$function$
;

CREATE OR REPLACE FUNCTION public._par_latest_usd_rate()
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT rate_to_toman FROM public.currency_rates
  WHERE currency = 'USD' AND is_active = true
  ORDER BY effective_at DESC LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public._par_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;$function$
;

CREATE OR REPLACE FUNCTION public._validate_allocation_amounts()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.held_amount + NEW.consumed_amount > NEW.final_amount THEN
    RAISE EXCEPTION 'held_amount(%) + consumed_amount(%) از final_amount(%) بیشتر است',
      NEW.held_amount, NEW.consumed_amount, NEW.final_amount;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.add_dynamic_table_column(p_table_id uuid, p_column_key text, p_label text, p_data_type text, p_is_required boolean DEFAULT false, p_is_filterable boolean DEFAULT false, p_is_editable_by_bot boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _new_id uuid;
  _next_order int;
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_column_key !~ '^[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'invalid column_key';
  END IF;

  IF p_data_type NOT IN ('text','number','boolean','date','datetime','phone','tag','status') THEN
    RAISE EXCEPTION 'invalid data_type';
  END IF;

  IF EXISTS (
    SELECT 1 FROM dynamic_table_columns
    WHERE table_id = p_table_id AND column_key = p_column_key
  ) THEN
    RAISE EXCEPTION 'column_key already exists';
  END IF;

  SELECT COALESCE(MAX(sort_order), -1) + 1 INTO _next_order
  FROM dynamic_table_columns WHERE table_id = p_table_id;

  INSERT INTO dynamic_table_columns(
    table_id, column_key, label, data_type,
    is_required, is_filterable, is_editable_by_bot, sort_order
  ) VALUES (
    p_table_id, p_column_key, p_label, p_data_type::dynamic_column_data_type,
    p_is_required, p_is_filterable, p_is_editable_by_bot, _next_order
  ) RETURNING id INTO _new_id;

  INSERT INTO audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'dynamic_table_column', _new_id::text, 'created',
          jsonb_build_object('table_id', p_table_id, 'column_key', p_column_key, 'data_type', p_data_type));

  RETURN _new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.add_employee_xp(_employee_id uuid, _xp numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec public.employee_progress%ROWTYPE;
  old_level integer;
  leveled_up boolean := false;
BEGIN
  INSERT INTO public.employee_progress(employee_id, xp_next_level)
  VALUES (_employee_id, public.calc_xp_for_level(1))
  ON CONFLICT (employee_id) DO NOTHING;

  SELECT * INTO rec FROM public.employee_progress WHERE employee_id = _employee_id FOR UPDATE;

  IF _xp IS NULL OR _xp <= 0 THEN
    RETURN jsonb_build_object(
      'employee_id', rec.employee_id,
      'level', rec.level,
      'xp_current', rec.xp_current,
      'xp_total', rec.xp_total,
      'xp_next_level', rec.xp_next_level,
      'leveled_up', false
    );
  END IF;

  old_level := rec.level;
  rec.xp_current := rec.xp_current + _xp;
  rec.xp_total := rec.xp_total + _xp;

  WHILE rec.xp_current >= rec.xp_next_level LOOP
    rec.xp_current := rec.xp_current - rec.xp_next_level;
    rec.level := rec.level + 1;
    rec.xp_next_level := public.calc_xp_for_level(rec.level);
    leveled_up := true;
  END LOOP;

  IF leveled_up THEN
    rec.last_level_up := now();
    INSERT INTO public.employee_level_up_events(employee_id, old_level, new_level, xp_total)
    VALUES (_employee_id, old_level, rec.level, rec.xp_total);
  END IF;

  UPDATE public.employee_progress
  SET level = rec.level,
      xp_current = rec.xp_current,
      xp_total = rec.xp_total,
      xp_next_level = rec.xp_next_level,
      last_level_up = rec.last_level_up
  WHERE employee_id = _employee_id;

  RETURN jsonb_build_object(
    'employee_id', rec.employee_id,
    'level', rec.level,
    'xp_current', rec.xp_current,
    'xp_total', rec.xp_total,
    'xp_next_level', rec.xp_next_level,
    'leveled_up', leveled_up,
    'old_level', old_level,
    'new_level', rec.level
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.add_messenger_group_member(p_group_id uuid, p_user_id uuid, p_role text DEFAULT 'member'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_role NOT IN ('admin','member','viewer','purchaser') THEN
    RAISE EXCEPTION 'INVALID_ROLE' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.messenger_group_members
    WHERE group_id = p_group_id AND user_id = v_uid AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'NOT_GROUP_ADMIN' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.messenger_group_members(group_id, user_id, role)
  VALUES (p_group_id, p_user_id, p_role)
  ON CONFLICT (group_id, user_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'ALREADY_MEMBER' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_gamification_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'total_employees', (SELECT count(*) FROM public.employee_progress),
    'avg_xp', COALESCE((SELECT round(avg(xp_total)::numeric, 1) FROM public.employee_progress), 0),
    'avg_level', COALESCE((SELECT round(avg(level)::numeric, 1) FROM public.employee_progress), 0),
    'top_players', COALESCE((
      SELECT jsonb_agg(t)
      FROM (
        SELECT ep.employee_id, p.full_name, ep.level, ep.xp_total
        FROM public.employee_progress ep
        LEFT JOIN public.profiles p ON p.id = ep.employee_id
        ORDER BY ep.xp_total DESC
        LIMIT 5
      ) t
    ), '[]'::jsonb),
    'league_distribution', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('league', league, 'count', cnt))
      FROM (
        SELECT league, count(*) AS cnt
        FROM public.employee_leagues el
        WHERE el.season = (SELECT id::text FROM public.league_seasons WHERE is_active LIMIT 1)
           OR NOT EXISTS (SELECT 1 FROM public.league_seasons WHERE is_active)
        GROUP BY league
      ) s
    ), '[]'::jsonb),
    'xp_distribution', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('bucket', bucket, 'count', cnt) ORDER BY ord)
      FROM (
        SELECT
          CASE
            WHEN xp_total < 500 THEN '0-500'
            WHEN xp_total < 2000 THEN '500-2k'
            WHEN xp_total < 5000 THEN '2k-5k'
            WHEN xp_total < 10000 THEN '5k-10k'
            ELSE '10k+'
          END AS bucket,
          CASE
            WHEN xp_total < 500 THEN 1
            WHEN xp_total < 2000 THEN 2
            WHEN xp_total < 5000 THEN 3
            WHEN xp_total < 10000 THEN 4
            ELSE 5
          END AS ord,
          count(*) AS cnt
        FROM public.employee_progress
        GROUP BY bucket, ord
      ) s
    ), '[]'::jsonb),
    'missions_completion', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('mission', title_fa, 'completed', completed, 'total', total))
      FROM (
        SELECT m.title_fa,
               count(emp.*) FILTER (WHERE emp.completed) AS completed,
               count(emp.*) AS total
        FROM public.missions m
        LEFT JOIN public.employee_mission_progress emp ON emp.mission_id = m.id
        WHERE m.enabled
        GROUP BY m.title_fa
        ORDER BY total DESC
        LIMIT 10
      ) s
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.api_dynamic_table_query_rows(p_table_slug text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _table_id uuid;
  _eff_limit int := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
  _eff_offset int := GREATEST(COALESCE(p_offset, 0), 0);
  _total bigint;
  _rows jsonb;
  _filter_key text;
  _filter_val text;
  _col record;
  _where_extra text := '';
  _sql text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::app_role[]) THEN
    RAISE EXCEPTION 'دسترسی لازم را ندارید.' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO _table_id FROM public.dynamic_tables WHERE slug = p_table_slug AND is_active = true;
  IF _table_id IS NULL THEN
    RAISE EXCEPTION 'جدول یافت نشد یا غیرفعال است.' USING ERRCODE = 'P0002';
  END IF;

  -- Build EXISTS clauses for each filter (only on filterable columns)
  IF p_filters IS NOT NULL AND jsonb_typeof(p_filters) = 'object' THEN
    FOR _filter_key, _filter_val IN
      SELECT key, value::text FROM jsonb_each_text(p_filters)
    LOOP
      SELECT * INTO _col FROM public.dynamic_table_columns
      WHERE table_id = _table_id AND column_key = _filter_key AND is_filterable = true;
      IF NOT FOUND THEN CONTINUE; END IF;

      _where_extra := _where_extra || format(
        ' AND EXISTS (SELECT 1 FROM public.dynamic_table_cells c WHERE c.row_id = r.id AND c.column_id = %L AND %s)',
        _col.id,
        CASE _col.data_type
          WHEN 'number' THEN format('c.value_number = %L::numeric', _filter_val)
          WHEN 'boolean' THEN format('c.value_boolean = %L::boolean',
            CASE WHEN lower(_filter_val) IN ('true','1','yes') THEN 'true' ELSE 'false' END)
          WHEN 'date' THEN format('c.value_date = %L::date', _filter_val)
          WHEN 'datetime' THEN format('c.value_datetime = %L::timestamptz', _filter_val)
          ELSE format('c.value_text = %L', _filter_val)
        END
      );
    END LOOP;
  END IF;

  -- Total count
  EXECUTE format(
    'SELECT count(*) FROM public.dynamic_table_rows r WHERE r.table_id = %L AND r.is_active = true %s',
    _table_id, _where_extra
  ) INTO _total;

  -- Page rows aggregated with cells
  _sql := format($f$
    WITH page AS (
      SELECT r.id, r.row_number
      FROM public.dynamic_table_rows r
      WHERE r.table_id = %L AND r.is_active = true %s
      ORDER BY r.row_number ASC
      LIMIT %s OFFSET %s
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'row_id', p.id,
      'row_number', p.row_number,
      'values', COALESCE((
        SELECT jsonb_object_agg(col.column_key,
          CASE col.data_type
            WHEN 'number' THEN to_jsonb(c.value_number)
            WHEN 'boolean' THEN to_jsonb(c.value_boolean)
            WHEN 'date' THEN to_jsonb(c.value_date)
            WHEN 'datetime' THEN to_jsonb(c.value_datetime)
            ELSE to_jsonb(c.value_text)
          END
        )
        FROM public.dynamic_table_cells c
        JOIN public.dynamic_table_columns col ON col.id = c.column_id
        WHERE c.row_id = p.id
      ), '{}'::jsonb)
    ) ORDER BY p.row_number), '[]'::jsonb)
    FROM page p
  $f$, _table_id, _where_extra, _eff_limit, _eff_offset);

  EXECUTE _sql INTO _rows;

  RETURN jsonb_build_object(
    'table_slug', p_table_slug,
    'total', _total,
    'limit', _eff_limit,
    'offset', _eff_offset,
    'rows', _rows
  );
END; $function$
;

CREATE OR REPLACE FUNCTION public.api_dynamic_table_update_cell(p_table_slug text, p_row_id uuid, p_column_key text, p_value text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _table_id uuid;
  _col record;
  _v_text text; _v_num numeric; _v_bool boolean; _v_date date; _v_dt timestamptz;
  _val text := NULLIF(btrim(COALESCE(p_value, '')), '');
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::app_role[]) THEN
    RAISE EXCEPTION 'دسترسی لازم را ندارید.' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO _table_id FROM public.dynamic_tables WHERE slug = p_table_slug AND is_active = true;
  IF _table_id IS NULL THEN
    RAISE EXCEPTION 'جدول یافت نشد یا غیرفعال است.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO _col FROM public.dynamic_table_columns
  WHERE table_id = _table_id AND column_key = p_column_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ستون یافت نشد.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT _col.is_editable_by_bot THEN
    RAISE EXCEPTION 'این ستون توسط ربات قابل ویرایش نیست.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.dynamic_table_rows WHERE id = p_row_id AND table_id = _table_id) THEN
    RAISE EXCEPTION 'ردیف یافت نشد.' USING ERRCODE = 'P0002';
  END IF;

  BEGIN
    IF _col.data_type = 'number' THEN _v_num := _val::numeric;
    ELSIF _col.data_type = 'boolean' THEN _v_bool := (_val ILIKE 'true' OR _val = '1' OR _val ILIKE 'yes');
    ELSIF _col.data_type = 'date' THEN _v_date := _val::date;
    ELSIF _col.data_type = 'datetime' THEN _v_dt := _val::timestamptz;
    ELSE _v_text := _val;
    END IF;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'مقدار نامعتبر برای ستون %', _col.label USING ERRCODE = '22023';
  END;

  INSERT INTO public.dynamic_table_cells(
    table_id, row_id, column_id,
    value_text, value_number, value_boolean, value_date, value_datetime
  ) VALUES (
    _table_id, p_row_id, _col.id, _v_text, _v_num, _v_bool, _v_date, _v_dt
  )
  ON CONFLICT (row_id, column_id) DO UPDATE SET
    value_text = EXCLUDED.value_text,
    value_number = EXCLUDED.value_number,
    value_boolean = EXCLUDED.value_boolean,
    value_date = EXCLUDED.value_date,
    value_datetime = EXCLUDED.value_datetime,
    updated_at = now();

  INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (_uid, 'dynamic_table_cells', p_row_id::text, 'dynamic_table_cell_updated',
    jsonb_build_object(
      'table_slug', p_table_slug,
      'column_key', p_column_key,
      'value', p_value
    ));

  RETURN jsonb_build_object('ok', true, 'row_id', p_row_id, 'column_key', p_column_key);
END; $function$
;

CREATE OR REPLACE FUNCTION public.approve_currency_fetch(p_fetch_id uuid, p_deactivate_previous boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_fetch currency_rate_fetches%ROWTYPE;
  v_old_rate numeric;
  v_threshold numeric;
  v_diff_pct numeric;
  v_new_rate_id uuid;
  v_source_name text;
  r_user RECORD;
BEGIN
  IF NOT has_any_role(v_user, ARRAY['admin'::app_role, 'accountant'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_fetch FROM currency_rate_fetches WHERE id = p_fetch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'fetch not found'; END IF;
  IF v_fetch.status <> 'pending_review' THEN RAISE EXCEPTION 'already processed'; END IF;

  -- Latest active rate for diff
  SELECT rate_to_toman INTO v_old_rate
    FROM currency_rates
    WHERE currency = v_fetch.currency AND is_active = true
    ORDER BY effective_at DESC LIMIT 1;

  IF p_deactivate_previous THEN
    UPDATE currency_rates SET is_active = false
      WHERE currency = v_fetch.currency AND is_active = true;
  END IF;

  SELECT name INTO v_source_name FROM currency_sources WHERE id = v_fetch.source_id;

  INSERT INTO currency_rates(currency, rate_to_toman, source_name, is_active, approved_by, approved_at, fetch_source_id)
    VALUES (v_fetch.currency, v_fetch.rate, COALESCE(v_source_name, 'منبع خودکار'), true, v_user, now(), v_fetch.source_id)
    RETURNING id INTO v_new_rate_id;

  UPDATE currency_rate_fetches
    SET status = 'approved', approved_by = v_user, approved_at = now()
    WHERE id = p_fetch_id;

  INSERT INTO audit_logs(action, entity_type, entity_id, actor_id, diff)
    VALUES ('currency_rate_approved', 'currency_rate_fetches', p_fetch_id::text, v_user,
      jsonb_build_object('currency', v_fetch.currency, 'rate', v_fetch.rate, 'old_rate', v_old_rate));

  -- Alert if threshold exceeded
  IF v_old_rate IS NOT NULL AND v_old_rate > 0 THEN
    SELECT COALESCE(NULLIF(value,'')::numeric, 5) INTO v_threshold
      FROM shop_settings WHERE key = 'alert_threshold_percent';
    v_threshold := COALESCE(v_threshold, 5);
    v_diff_pct := abs(v_fetch.rate - v_old_rate) / v_old_rate * 100;

    IF v_diff_pct >= v_threshold THEN
      FOR r_user IN
        SELECT DISTINCT p.id
          FROM profiles p
          JOIN user_roles ur ON ur.user_id = p.id
          WHERE ur.role IN ('admin','accountant')
      LOOP
        INSERT INTO notification_queue(user_id, title, body, type, reference_type, reference_id)
          VALUES (
            r_user.id,
            'هشدار تغییر نرخ ارز',
            format('نرخ %s از %s به %s تغییر کرده است (%s٪)', v_fetch.currency, round(v_old_rate,2), round(v_fetch.rate,2), round(v_diff_pct,2)),
            'system',
            'currency_rates',
            v_new_rate_id
          );
      END LOOP;

      INSERT INTO audit_logs(action, entity_type, entity_id, actor_id, diff)
        VALUES ('currency_rate_alert', 'currency_rates', v_new_rate_id::text, v_user,
          jsonb_build_object('currency', v_fetch.currency, 'old_rate', v_old_rate, 'new_rate', v_fetch.rate, 'diff_pct', v_diff_pct, 'threshold', v_threshold));
    END IF;
  END IF;

  RETURN v_new_rate_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_pending_user(_user_id uuid, _role app_role, _position text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  UPDATE public.profiles
  SET status = 'active',
      is_active = true,
      position = COALESCE(_position, position),
      updated_at = now()
  WHERE id = _user_id;

  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'user', _user_id::text, 'user_approved',
          jsonb_build_object('role', _role, 'position', _position));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.array_to_halfvec(integer[], integer, boolean)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_halfvec$function$
;

CREATE OR REPLACE FUNCTION public.array_to_halfvec(double precision[], integer, boolean)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_halfvec$function$
;

CREATE OR REPLACE FUNCTION public.array_to_halfvec(real[], integer, boolean)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_halfvec$function$
;

CREATE OR REPLACE FUNCTION public.array_to_halfvec(numeric[], integer, boolean)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_halfvec$function$
;

CREATE OR REPLACE FUNCTION public.array_to_sparsevec(real[], integer, boolean)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_sparsevec$function$
;

CREATE OR REPLACE FUNCTION public.array_to_sparsevec(numeric[], integer, boolean)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_sparsevec$function$
;

CREATE OR REPLACE FUNCTION public.array_to_sparsevec(double precision[], integer, boolean)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_sparsevec$function$
;

CREATE OR REPLACE FUNCTION public.array_to_sparsevec(integer[], integer, boolean)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_sparsevec$function$
;

CREATE OR REPLACE FUNCTION public.array_to_vector(integer[], integer, boolean)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_vector$function$
;

CREATE OR REPLACE FUNCTION public.array_to_vector(numeric[], integer, boolean)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_vector$function$
;

CREATE OR REPLACE FUNCTION public.array_to_vector(double precision[], integer, boolean)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_vector$function$
;

CREATE OR REPLACE FUNCTION public.array_to_vector(real[], integer, boolean)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_vector$function$
;

CREATE OR REPLACE FUNCTION public.assign_user_role(_target_user uuid, _role app_role)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden: only admins can assign roles' using errcode = '42501';
  end if;

  insert into public.user_roles (user_id, role, assigned_by)
  values (_target_user, _role, auth.uid())
  on conflict (user_id, role) do nothing;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_bot_api_keys()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF tg_op = 'INSERT' THEN
    INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'bot_api_keys', new.id::text, 'bot_api_key_created',
      jsonb_build_object('name', new.name, 'allowed_table_ids', new.allowed_table_ids));
  END IF;
  RETURN new;
END; $function$
;

CREATE OR REPLACE FUNCTION public.audit_brands()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (tg_op = 'INSERT') THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'brands', new.id::text, 'brand_created',
      jsonb_build_object('name', new.name, 'slug', new.slug, 'is_active', new.is_active));
    RETURN new;
  ELSIF (tg_op = 'UPDATE') THEN
    IF (old.is_active IS DISTINCT FROM new.is_active) THEN
      INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      VALUES (auth.uid(), 'brands', new.id::text, 'brand_status_changed',
        jsonb_build_object('name', new.name, 'old', old.is_active, 'new', new.is_active));
    ELSE
      INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      VALUES (auth.uid(), 'brands', new.id::text, 'brand_updated',
        jsonb_build_object('old', to_jsonb(old) - 'updated_at', 'new', to_jsonb(new) - 'updated_at'));
    END IF;
    RETURN new;
  END IF;
  RETURN null;
END; $function$
;

CREATE OR REPLACE FUNCTION public.audit_categories()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (tg_op = 'INSERT') THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'categories', new.id::text, 'category_created',
      jsonb_build_object('name', new.name, 'slug', new.slug, 'parent_id', new.parent_id, 'is_active', new.is_active));
    RETURN new;
  ELSIF (tg_op = 'UPDATE') THEN
    IF (old.is_active IS DISTINCT FROM new.is_active) THEN
      INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      VALUES (auth.uid(), 'categories', new.id::text, 'category_status_changed',
        jsonb_build_object('name', new.name, 'old', old.is_active, 'new', new.is_active));
    ELSE
      INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      VALUES (auth.uid(), 'categories', new.id::text, 'category_updated',
        jsonb_build_object('old', to_jsonb(old) - 'updated_at', 'new', to_jsonb(new) - 'updated_at'));
    END IF;
    RETURN new;
  END IF;
  RETURN null;
END; $function$
;

CREATE OR REPLACE FUNCTION public.audit_credit_rule_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, diff)
  VALUES (auth.uid(), 'credit_rule_updated', 'credit_scoring_rules', NEW.id::text,
          jsonb_build_object('parameter', NEW.parameter_name, 'weight', NEW.weight, 'is_active', NEW.is_active));
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.audit_currency_rates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (tg_op = 'INSERT') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'currency_rates', new.id::text, 'currency_rate_created',
      jsonb_build_object('currency', new.currency, 'rate_to_toman', new.rate_to_toman, 'effective_at', new.effective_at));
    return new;
  elsif (tg_op = 'UPDATE') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'currency_rates', new.id::text, 'currency_rate_updated',
      jsonb_build_object('old', to_jsonb(old) - 'updated_at', 'new', to_jsonb(new) - 'updated_at'));
    return new;
  end if;
  return null;
end; $function$
;

CREATE OR REPLACE FUNCTION public.audit_customer_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff, created_at)
    VALUES (auth.uid(), 'customer_created', 'customer', NEW.id::text,
      jsonb_build_object('name', NEW.name, 'phone', NEW.phone, 'city', NEW.city), now());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff, created_at)
    VALUES (auth.uid(), 'customer_updated', 'customer', NEW.id::text,
      jsonb_build_object(
        'name',  jsonb_build_object('old', OLD.name,  'new', NEW.name),
        'phone', jsonb_build_object('old', OLD.phone, 'new', NEW.phone),
        'city',  jsonb_build_object('old', OLD.city,  'new', NEW.city),
        'notes', jsonb_build_object('old', OLD.notes, 'new', NEW.notes),
        'is_active', jsonb_build_object('old', OLD.is_active, 'new', NEW.is_active)
      ), now());
    RETURN NEW;
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.audit_daily_capital_inputs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (
    auth.uid(),
    'daily_capital_input',
    COALESCE(NEW.id, OLD.id)::text,
    LOWER(TG_OP),
    jsonb_build_object(
      'capital_date', COALESCE(NEW.capital_date, OLD.capital_date),
      'old', CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
      'new', CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_daily_capital_snapshots()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_action text;
BEGIN
  v_action := CASE
    WHEN NEW.override_reason IS NOT NULL
      AND NEW.final_capital IS DISTINCT FROM NEW.system_suggested_capital
    THEN 'override' ELSE 'create'
  END;

  INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (
    auth.uid(),
    'daily_capital_snapshot',
    NEW.id::text,
    v_action,
    jsonb_build_object(
      'capital_date', NEW.capital_date,
      'system_suggested_capital', NEW.system_suggested_capital,
      'final_capital', NEW.final_capital,
      'override_reason', NEW.override_reason,
      'formula_version', NEW.formula_version
    )
  );
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_dynamic_table_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF tg_op = 'INSERT' THEN
    INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'dynamic_table_columns', new.id::text, 'dynamic_table_column_created',
      jsonb_build_object('table_id', new.table_id, 'column_key', new.column_key, 'data_type', new.data_type));
  END IF;
  RETURN new;
END; $function$
;

CREATE OR REPLACE FUNCTION public.audit_dynamic_table_rows()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF tg_op = 'INSERT' THEN
    INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'dynamic_table_rows', new.id::text, 'dynamic_table_row_created',
      jsonb_build_object('table_id', new.table_id, 'row_number', new.row_number));
  END IF;
  RETURN new;
END; $function$
;

CREATE OR REPLACE FUNCTION public.audit_dynamic_tables()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF tg_op = 'INSERT' THEN
    INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'dynamic_tables', new.id::text, 'dynamic_table_created',
      jsonb_build_object('name', new.name, 'slug', new.slug));
    RETURN new;
  ELSIF tg_op = 'UPDATE' THEN
    IF old.is_active = true AND new.is_active = false THEN
      INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
      VALUES (auth.uid(), 'dynamic_tables', new.id::text, 'dynamic_table_deactivated',
        jsonb_build_object('name', new.name, 'slug', new.slug));
    END IF;
    RETURN new;
  END IF;
  RETURN null;
END; $function$
;

CREATE OR REPLACE FUNCTION public.audit_invoice_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff, created_at)
  VALUES (
    COALESCE(NEW.created_by, auth.uid()),
    'invoice_created', 'invoice', NEW.id::text,
    jsonb_build_object(
      'customer_id',        NEW.customer_id,
      'type',               NEW.type,
      'sale_price_type_id', NEW.sale_price_type_id,
      'total_amount',       NEW.total_amount,
      'status',             NEW.status
    ),
    now()
  );
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.audit_invoice_item_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff, created_at)
  VALUES (
    auth.uid(),
    'invoice_item_added', 'invoice_item', NEW.id::text,
    jsonb_build_object(
      'invoice_id', NEW.invoice_id,
      'product_id', NEW.product_id,
      'quantity',   NEW.quantity,
      'unit_price', NEW.unit_price,
      'line_total', NEW.line_total
    ),
    now()
  );
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.audit_person_context_links_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
  VALUES (
    'person.context_link.add', 'person_context_link', NEW.id::text, auth.uid(),
    jsonb_build_object(
      'person_id',    NEW.person_id,
      'context_kind', NEW.context_kind,
      'ref_table',    NEW.ref_table,
      'ref_id',       NEW.ref_id,
      'started_at',   NEW.started_at
    )
  );
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.audit_person_context_links_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_diff jsonb := '{}'::jsonb;
BEGIN
  -- Dedicated remove event when ended_at transitions from NULL to a value.
  IF OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
    VALUES (
      'person.context_link.remove', 'person_context_link', NEW.id::text, auth.uid(),
      jsonb_build_object(
        'person_id',    NEW.person_id,
        'context_kind', NEW.context_kind,
        'ref_table',    NEW.ref_table,
        'ref_id',       NEW.ref_id,
        'ended_at',     NEW.ended_at
      )
    );
  END IF;

  IF NEW.context_kind IS DISTINCT FROM OLD.context_kind THEN v_diff := v_diff || jsonb_build_object('context_kind', jsonb_build_object('old', OLD.context_kind, 'new', NEW.context_kind)); END IF;
  IF NEW.ref_table    IS DISTINCT FROM OLD.ref_table    THEN v_diff := v_diff || jsonb_build_object('ref_table',    jsonb_build_object('old', OLD.ref_table,    'new', NEW.ref_table));    END IF;
  IF NEW.ref_id       IS DISTINCT FROM OLD.ref_id       THEN v_diff := v_diff || jsonb_build_object('ref_id',       jsonb_build_object('old', OLD.ref_id,       'new', NEW.ref_id));       END IF;
  IF NEW.note         IS DISTINCT FROM OLD.note         THEN v_diff := v_diff || jsonb_build_object('note',         jsonb_build_object('old', OLD.note,         'new', NEW.note));         END IF;
  IF NEW.started_at   IS DISTINCT FROM OLD.started_at   THEN v_diff := v_diff || jsonb_build_object('started_at',   jsonb_build_object('old', OLD.started_at,   'new', NEW.started_at));   END IF;
  IF NEW.ended_at     IS DISTINCT FROM OLD.ended_at     THEN v_diff := v_diff || jsonb_build_object('ended_at',     jsonb_build_object('old', OLD.ended_at,     'new', NEW.ended_at));     END IF;

  IF v_diff <> '{}'::jsonb THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
    VALUES ('person.context_link.update', 'person_context_link', NEW.id::text, auth.uid(), v_diff);
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.audit_person_field_definitions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'person_field_definition', NEW.id::text, 'create',
      jsonb_build_object(
        'name', NEW.name, 'label', NEW.label, 'field_type', NEW.field_type,
        'is_required', NEW.is_required, 'is_active', NEW.is_active,
        'applies_to_kind', NEW.applies_to_kind));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'person_field_definition', NEW.id::text, 'update',
      jsonb_strip_nulls(jsonb_build_object(
        'label',  CASE WHEN OLD.label IS DISTINCT FROM NEW.label THEN jsonb_build_object('from', OLD.label, 'to', NEW.label) END,
        'field_type', CASE WHEN OLD.field_type IS DISTINCT FROM NEW.field_type THEN jsonb_build_object('from', OLD.field_type, 'to', NEW.field_type) END,
        'is_required', CASE WHEN OLD.is_required IS DISTINCT FROM NEW.is_required THEN jsonb_build_object('from', OLD.is_required, 'to', NEW.is_required) END,
        'is_active', CASE WHEN OLD.is_active IS DISTINCT FROM NEW.is_active THEN jsonb_build_object('from', OLD.is_active, 'to', NEW.is_active) END,
        'applies_to_kind', CASE WHEN OLD.applies_to_kind IS DISTINCT FROM NEW.applies_to_kind THEN jsonb_build_object('from', OLD.applies_to_kind, 'to', NEW.applies_to_kind) END,
        'sort_order', CASE WHEN OLD.sort_order IS DISTINCT FROM NEW.sort_order THEN jsonb_build_object('from', OLD.sort_order, 'to', NEW.sort_order) END
      )));
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_person_field_values()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'person_field_value', NEW.id::text, 'create',
      jsonb_build_object('person_id', NEW.person_id, 'field_definition_id', NEW.field_definition_id, 'value', NEW.value));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.value IS DISTINCT FROM NEW.value THEN
      INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      VALUES (auth.uid(), 'person_field_value', NEW.id::text, 'update',
        jsonb_build_object('person_id', NEW.person_id, 'field_definition_id', NEW.field_definition_id,
          'value', jsonb_build_object('from', OLD.value, 'to', NEW.value)));
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_person_identifiers_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'person_identifier', NEW.id::text, 'person.identifier.add',
    jsonb_build_object(
      'person_id', NEW.person_id,
      'kind', NEW.kind,
      'value_normalized', NEW.value_normalized,
      'status', NEW.status,
      'is_primary', NEW.is_primary
    ));
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_person_identifiers_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  action_name text := 'person.identifier.update';
  diff_obj jsonb := '{}'::jsonb;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'revoked' THEN
    action_name := 'person.identifier.revoke';
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    diff_obj := diff_obj || jsonb_build_object('status',
      jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  IF OLD.value_normalized IS DISTINCT FROM NEW.value_normalized THEN
    diff_obj := diff_obj || jsonb_build_object('value_normalized',
      jsonb_build_object('from', OLD.value_normalized, 'to', NEW.value_normalized));
  END IF;
  IF OLD.kind IS DISTINCT FROM NEW.kind THEN
    diff_obj := diff_obj || jsonb_build_object('kind',
      jsonb_build_object('from', OLD.kind, 'to', NEW.kind));
  END IF;
  IF OLD.is_primary IS DISTINCT FROM NEW.is_primary THEN
    diff_obj := diff_obj || jsonb_build_object('is_primary',
      jsonb_build_object('from', OLD.is_primary, 'to', NEW.is_primary));
  END IF;

  IF diff_obj <> '{}'::jsonb THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'person_identifier', NEW.id::text, action_name,
      diff_obj || jsonb_build_object('person_id', NEW.person_id));
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_persons_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
  VALUES (
    'person.create', 'person', NEW.id::text, auth.uid(),
    jsonb_build_object(
      'kind', NEW.kind,
      'display_name', NEW.display_name,
      'legal_name', NEW.legal_name,
      'visibility_scope', NEW.visibility_scope,
      'is_active', NEW.is_active
    )
  );
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.audit_persons_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_diff jsonb := '{}'::jsonb;
BEGIN
  -- Visibility scope changes get their own dedicated event for sensitivity.
  IF NEW.visibility_scope IS DISTINCT FROM OLD.visibility_scope THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
    VALUES (
      'person.visibility_change', 'person', NEW.id::text, auth.uid(),
      jsonb_build_object('old', OLD.visibility_scope, 'new', NEW.visibility_scope)
    );
  END IF;

  IF NEW.kind         IS DISTINCT FROM OLD.kind         THEN v_diff := v_diff || jsonb_build_object('kind',         jsonb_build_object('old', OLD.kind,         'new', NEW.kind));         END IF;
  IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN v_diff := v_diff || jsonb_build_object('display_name', jsonb_build_object('old', OLD.display_name, 'new', NEW.display_name)); END IF;
  IF NEW.legal_name   IS DISTINCT FROM OLD.legal_name   THEN v_diff := v_diff || jsonb_build_object('legal_name',   jsonb_build_object('old', OLD.legal_name,   'new', NEW.legal_name));   END IF;
  IF NEW.is_active    IS DISTINCT FROM OLD.is_active    THEN v_diff := v_diff || jsonb_build_object('is_active',    jsonb_build_object('old', OLD.is_active,    'new', NEW.is_active));    END IF;
  IF NEW.notes        IS DISTINCT FROM OLD.notes        THEN v_diff := v_diff || jsonb_build_object('notes',        jsonb_build_object('old', OLD.notes,        'new', NEW.notes));        END IF;

  IF v_diff <> '{}'::jsonb THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
    VALUES ('person.update', 'person', NEW.id::text, auth.uid(), v_diff);
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.audit_price_change_reasons()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (tg_op = 'INSERT') THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'price_change_reasons', new.id::text, 'price_change_reason_created',
      jsonb_build_object('title', new.title, 'is_active', new.is_active));
    RETURN new;
  ELSIF (tg_op = 'UPDATE') THEN
    IF (old.is_active IS DISTINCT FROM new.is_active) THEN
      INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      VALUES (auth.uid(), 'price_change_reasons', new.id::text, 'price_change_reason_status_changed',
        jsonb_build_object('title', new.title, 'old', old.is_active, 'new', new.is_active));
    ELSE
      INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      VALUES (auth.uid(), 'price_change_reasons', new.id::text, 'price_change_reason_updated',
        jsonb_build_object('old', to_jsonb(old) - 'updated_at', 'new', to_jsonb(new) - 'updated_at'));
    END IF;
    RETURN new;
  END IF;
  RETURN null;
END; $function$
;

CREATE OR REPLACE FUNCTION public.audit_price_snapshots()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  values (auth.uid(), 'price_calculation_snapshots', new.id::text, 'price_calculated_snapshot_created',
    jsonb_build_object('product_id', new.product_id, 'final_sale_price', new.final_sale_price, 'rounded_sale_price', new.rounded_sale_price, 'pricing_rule_id', new.pricing_rule_id));
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.audit_pricing_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (tg_op = 'INSERT') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'pricing_rules', new.id::text, 'pricing_rule_created',
      jsonb_build_object('rule_name', coalesce(new.rule_name, new.name), 'margin_type', new.margin_type, 'margin_value', new.margin_value, 'priority', new.priority));
    return new;
  elsif (tg_op = 'UPDATE') then
    if (old.is_active is true and new.is_active is false) then
      insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      values (auth.uid(), 'pricing_rules', new.id::text, 'pricing_rule_disabled',
        jsonb_build_object('rule_name', coalesce(new.rule_name, new.name)));
    else
      insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      values (auth.uid(), 'pricing_rules', new.id::text, 'pricing_rule_updated',
        jsonb_build_object('old', to_jsonb(old) - 'updated_at', 'new', to_jsonb(new) - 'updated_at'));
    end if;
    return new;
  end if;
  return null;
end; $function$
;

CREATE OR REPLACE FUNCTION public.audit_product_label_links()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (tg_op = 'INSERT') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'product_label_links', new.product_id::text, 'product_label_added',
            jsonb_build_object('label_id', new.label_id));
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'product_label_links', old.product_id::text, 'product_label_removed',
            jsonb_build_object('label_id', old.label_id));
    return old;
  end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_product_owners()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (tg_op = 'INSERT') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'product_owner_assignments', new.product_id::text, 'product_owner_assigned',
            jsonb_build_object('user_id', new.user_id, 'assigned_by', new.assigned_by));
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'product_owner_assignments', old.product_id::text, 'product_owner_revoked',
            jsonb_build_object('user_id', old.user_id));
    return old;
  end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_product_suppliers_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
  VALUES ('product_supplier_unlinked', 'product_supplier', OLD.id::text, auth.uid(),
    jsonb_build_object('product_id', OLD.product_id, 'supplier_id', OLD.supplier_id));
  RETURN OLD;
END $function$
;

CREATE OR REPLACE FUNCTION public.audit_product_suppliers_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
  VALUES ('product_supplier_linked', 'product_supplier', NEW.id::text, auth.uid(),
    jsonb_build_object('product_id', NEW.product_id, 'supplier_id', NEW.supplier_id));
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.audit_products()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (tg_op = 'INSERT') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'products', new.id::text, 'product_created',
            jsonb_build_object('name', new.name, 'sku', new.sku, 'status', new.status));
    return new;
  elsif (tg_op = 'UPDATE') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'products', new.id::text, 'product_updated',
            jsonb_build_object(
              'old', to_jsonb(old) - 'created_at' - 'updated_at',
              'new', to_jsonb(new) - 'created_at' - 'updated_at'
            ));
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'products', old.id::text, 'product_deleted',
            jsonb_build_object('name', old.name, 'sku', old.sku));
    return old;
  end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_purchase_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, diff, created_at)
  VALUES (
    NEW.created_by,
    'purchase_created',
    'purchase',
    NEW.id::text,
    jsonb_build_object(
      'product_id',     NEW.product_id,
      'supplier_id',    NEW.supplier_id,
      'purchase_price', NEW.purchase_price,
      'currency',       NEW.currency,
      'quantity',       NEW.quantity,
      'purchase_date',  NEW.purchase_date
    ),
    now()
  );
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_purchase_prices()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _sku text;
begin
  if (tg_op = 'INSERT') then
    select sku into _sku from public.products where id = new.product_id;
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'purchase_prices', new.id::text, 'purchase_price_created',
      jsonb_build_object('product_id', new.product_id, 'sku', _sku, 'price', new.purchase_price, 'currency', new.currency, 'supplier_id', new.supplier_id));
    return new;
  elsif (tg_op = 'UPDATE') then
    select sku into _sku from public.products where id = new.product_id;
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'purchase_prices', new.id::text, 'purchase_price_updated',
      jsonb_build_object('product_id', new.product_id, 'sku', _sku,
        'old', to_jsonb(old) - 'updated_at', 'new', to_jsonb(new) - 'updated_at'));
    return new;
  end if;
  return null;
end; $function$
;

CREATE OR REPLACE FUNCTION public.audit_sale_lists()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (tg_op = 'INSERT') THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'sale_lists', new.id::text, 'sale_list_created',
            jsonb_build_object('name', new.name, 'sale_price_type_id', new.sale_price_type_id, 'created_by', new.created_by));
    RETURN new;
  END IF;
  RETURN null;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_sale_price_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  values (auth.uid(), 'product_sale_price_history', new.id::text, 'sale_price_history_created',
    jsonb_build_object('product_id', new.product_id, 'old', new.old_sale_price, 'new', new.new_sale_price, 'change_amount', new.change_amount, 'change_percent', new.change_percent));
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.audit_sale_price_types()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (tg_op = 'INSERT') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'sale_price_types', new.id::text, 'sale_price_type_created',
      jsonb_build_object('code', new.code, 'title', new.title, 'sort_order', new.sort_order));
    return new;
  elsif (tg_op = 'UPDATE') then
    if (old.is_active is true and new.is_active is false) then
      insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      values (auth.uid(), 'sale_price_types', new.id::text, 'sale_price_type_disabled',
        jsonb_build_object('code', new.code, 'title', new.title));
    else
      insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      values (auth.uid(), 'sale_price_types', new.id::text, 'sale_price_type_updated',
        jsonb_build_object('old', to_jsonb(old) - 'updated_at', 'new', to_jsonb(new) - 'updated_at'));
    end if;
    return new;
  end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_sales_quote_send_queue()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (tg_op = 'INSERT') THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'sales_quote_send_queue', new.id::text, 'sales_quote_send_queue_created',
      jsonb_build_object(
        'quote_id', new.quote_id,
        'share_log_id', new.share_log_id,
        'channel', new.channel,
        'recipient', new.recipient,
        'status', new.status,
        'pdf_attached', new.pdf_attached,
        'created_by', new.created_by
      ));
    RETURN new;
  ELSIF (tg_op = 'UPDATE') THEN
    IF (old.status IS DISTINCT FROM new.status) THEN
      IF (new.status = 'canceled') THEN
        INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
        VALUES (auth.uid(), 'sales_quote_send_queue', new.id::text, 'sales_quote_send_queue_canceled',
          jsonb_build_object('quote_id', new.quote_id, 'old_status', old.status));
      ELSIF (new.status = 'failed') THEN
        INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
        VALUES (auth.uid(), 'sales_quote_send_queue', new.id::text, 'sales_quote_send_queue_failed',
          jsonb_build_object(
            'quote_id', new.quote_id,
            'attempts', new.attempts,
            'max_attempts', new.max_attempts,
            'last_error', new.last_error
          ));
      ELSE
        INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
        VALUES (auth.uid(), 'sales_quote_send_queue', new.id::text, 'sales_quote_send_queue_status_changed',
          jsonb_build_object(
            'quote_id', new.quote_id,
            'old_status', old.status,
            'new_status', new.status,
            'attempts', new.attempts
          ));
      END IF;
    END IF;
    RETURN new;
  END IF;
  RETURN null;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_sales_quote_share_logs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (tg_op = 'INSERT') THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'sales_quote_share_logs', new.id::text, 'sales_quote_share_log_created',
      jsonb_build_object(
        'quote_id', new.quote_id,
        'channel', new.channel,
        'recipient', new.recipient,
        'status', new.status,
        'pdf_attached', new.pdf_attached,
        'attempted_by', new.attempted_by
      ));
    RETURN new;
  END IF;
  RETURN null;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_sales_quotes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (tg_op = 'INSERT') THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'sales_quotes', new.id::text, 'sales_quote_created',
      jsonb_build_object(
        'quote_number', new.quote_number,
        'customer_name', new.customer_name,
        'customer_phone', new.customer_phone,
        'salesperson_id', new.salesperson_id,
        'subtotal_amount', new.subtotal_amount,
        'discount_amount', new.discount_amount,
        'final_amount', new.final_amount
      ));
    RETURN new;
  ELSIF (tg_op = 'UPDATE') THEN
    IF (old.status IS DISTINCT FROM new.status) THEN
      IF new.status = 'canceled' THEN
        INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
        VALUES (auth.uid(), 'sales_quotes', new.id::text, 'sales_quote_canceled',
          jsonb_build_object(
            'quote_number', new.quote_number,
            'canceled_by', new.canceled_by,
            'cancel_reason', new.cancel_reason,
            'canceled_at', new.canceled_at
          ));
      ELSE
        INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
        VALUES (auth.uid(), 'sales_quotes', new.id::text, 'sales_quote_status_changed',
          jsonb_build_object(
            'quote_number', new.quote_number,
            'old_status', old.status,
            'new_status', new.status,
            'changed_by', auth.uid()
          ));
      END IF;
    END IF;
    RETURN new;
  END IF;
  RETURN null;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_settlement_types()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'settlement_types', NEW.id::text, 'insert', to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'settlement_types', NEW.id::text, 'update',
      jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'settlement_types', OLD.id::text, 'delete', to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_shipping_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (tg_op = 'INSERT') THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'shipping_cost_rules', new.id::text, 'shipping_cost_rule_created',
      jsonb_build_object('title', new.title, 'cost_type', new.cost_type, 'cost_value', new.cost_value));
    RETURN new;
  ELSIF (tg_op = 'UPDATE') THEN
    IF (old.is_active IS DISTINCT FROM new.is_active) THEN
      INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      VALUES (auth.uid(), 'shipping_cost_rules', new.id::text, 'shipping_cost_rule_status_changed',
        jsonb_build_object('old_is_active', old.is_active, 'new_is_active', new.is_active));
    END IF;
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'shipping_cost_rules', new.id::text, 'shipping_cost_rule_updated',
      jsonb_build_object('old', to_jsonb(old) - 'updated_at', 'new', to_jsonb(new) - 'updated_at'));
    RETURN new;
  ELSIF (tg_op = 'DELETE') THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'shipping_cost_rules', old.id::text, 'shipping_cost_rule_deleted',
      jsonb_build_object('old', to_jsonb(old) - 'updated_at'));
    RETURN old;
  END IF;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_stock_alert_requests()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare _sku text;
begin
  if (tg_op = 'INSERT') then
    select sku into _sku from public.products where id = new.product_id;
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'stock_alert_requests', new.id::text, 'stock_alert_created',
      jsonb_build_object(
        'product_id', new.product_id,
        'sku', _sku,
        'customer_name', new.customer_name,
        'customer_phone', new.customer_phone,
        'salesperson_id', new.salesperson_id,
        'priority', new.priority
      ));
    return new;
  elsif (tg_op = 'UPDATE') then
    if (old.status is distinct from new.status) then
      insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      values (auth.uid(), 'stock_alert_requests', new.id::text, 'stock_alert_status_changed',
        jsonb_build_object(
          'old_status', old.status,
          'new_status', new.status,
          'resolved_by', new.resolved_by,
          'resolved_at', new.resolved_at
        ));
    end if;
    return new;
  end if;
  return null;
end; $function$
;

CREATE OR REPLACE FUNCTION public.audit_suppliers_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
  VALUES (
    'supplier_created', 'supplier', NEW.id::text, auth.uid(),
    jsonb_build_object(
      'name', NEW.name, 'contact_name', NEW.contact_name, 'phone', NEW.phone,
      'city', NEW.city, 'trust_level', NEW.trust_level, 'status', NEW.status
    )
  );
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.audit_suppliers_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_diff jsonb := '{}'::jsonb;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
    VALUES ('supplier_status_changed', 'supplier', NEW.id::text, auth.uid(),
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status));
    RETURN NEW;
  END IF;

  IF NEW.name IS DISTINCT FROM OLD.name THEN v_diff := v_diff || jsonb_build_object('name', jsonb_build_object('old', OLD.name, 'new', NEW.name)); END IF;
  IF NEW.contact_name IS DISTINCT FROM OLD.contact_name THEN v_diff := v_diff || jsonb_build_object('contact_name', jsonb_build_object('old', OLD.contact_name, 'new', NEW.contact_name)); END IF;
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN v_diff := v_diff || jsonb_build_object('phone', jsonb_build_object('old', OLD.phone, 'new', NEW.phone)); END IF;
  IF NEW.city IS DISTINCT FROM OLD.city THEN v_diff := v_diff || jsonb_build_object('city', jsonb_build_object('old', OLD.city, 'new', NEW.city)); END IF;
  IF NEW.trust_level IS DISTINCT FROM OLD.trust_level THEN v_diff := v_diff || jsonb_build_object('trust_level', jsonb_build_object('old', OLD.trust_level, 'new', NEW.trust_level)); END IF;
  IF NEW.notes IS DISTINCT FROM OLD.notes THEN v_diff := v_diff || jsonb_build_object('notes', jsonb_build_object('old', OLD.notes, 'new', NEW.notes)); END IF;

  IF v_diff <> '{}'::jsonb THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
    VALUES ('supplier_updated', 'supplier', NEW.id::text, auth.uid(), v_diff);
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.audit_user_roles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (tg_op = 'INSERT') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'user_roles', new.user_id::text, 'role_assigned',
            jsonb_build_object('role', new.role, 'assigned_by', new.assigned_by));
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'user_roles', old.user_id::text, 'role_revoked',
            jsonb_build_object('role', old.role));
    return old;
  elsif (tg_op = 'UPDATE') then
    insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    values (auth.uid(), 'user_roles', new.user_id::text, 'role_updated',
            jsonb_build_object('old_role', old.role, 'new_role', new.role));
    return new;
  end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_link_supplier_on_purchase()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.supplier_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.product_suppliers (product_id, supplier_id, is_primary, auto_added, notes)
  VALUES (NEW.product_id, NEW.supplier_id, false, true, 'افزوده‌شده خودکار از ثبت خرید')
  ON CONFLICT (product_id, supplier_id) DO NOTHING;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_submit_penalty(p_inquiry_id uuid, p_user_id uuid, p_type text, p_severity text, p_description text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_penalty_id uuid;
  v_event_type text;
  v_default_score numeric;
  v_score_value numeric;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- جلوگیری از تکرار برای (inquiry, user, type) فعال
  IF EXISTS (
    SELECT 1 FROM public.performance_penalties
    WHERE inquiry_id = p_inquiry_id
      AND user_id = p_user_id
      AND type = p_type
      AND is_active = true
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.performance_penalties (
    user_id, inquiry_id, type, severity, description, created_by
  ) VALUES (
    p_user_id, p_inquiry_id, p_type, p_severity, p_description, NULL
  )
  RETURNING id INTO v_penalty_id;

  -- Audit
  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, diff)
  VALUES (
    'penalty', v_penalty_id::text, 'auto_created', p_user_id,
    jsonb_build_object(
      'type', p_type,
      'severity', p_severity,
      'inquiry_id', p_inquiry_id,
      'description', p_description
    )
  );

  -- In-app notification
  INSERT INTO public.notification_events (
    user_id, title, body, type, reference_type, reference_id
  ) VALUES (
    p_user_id,
    'کارت قرمز جدید',
    'کارت قرمز در پرونده عملکرد شما ثبت شد.',
    'red_card_issued',
    'penalty',
    v_penalty_id
  );

  -- ---- جدید: ثبت event منفی در سیستم گیمیفیکیشن ----
  v_event_type := 'penalty_' || p_type;
  v_default_score := CASE lower(coalesce(p_severity, 'medium'))
    WHEN 'low' THEN -5
    WHEN 'medium' THEN -10
    WHEN 'high' THEN -20
    WHEN 'critical' THEN -50
    ELSE -10
  END;
  v_score_value := public.get_kpi_xp(v_event_type, v_default_score);

  INSERT INTO public.employee_score_events (
    employee_id, event_type, source_table, source_id, triggered_at, payload
  ) VALUES (
    p_user_id,
    v_event_type,
    'performance_penalties',
    v_penalty_id::text,
    now(),
    jsonb_build_object(
      'severity', p_severity,
      'inquiry_id', p_inquiry_id,
      'penalty_type', p_type,
      'score_value', v_score_value
    )
  )
  ON CONFLICT (source_table, source_id, event_type) DO NOTHING;

  RETURN v_penalty_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.award_accountant_payment_score()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  enabled_txt text;
  promised_days int;
  grace int;
  actual_days numeric;
  amount numeric;
  ref_rate numeric;
  raw_score numeric;
  final_score numeric;
  reason text;
BEGIN
  IF NEW.paid_at IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.paid_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT value INTO enabled_txt FROM public.shop_settings WHERE key = 'purchase_score_enabled';
  IF COALESCE(enabled_txt,'true') <> 'true' THEN RETURN NEW; END IF;
  IF NEW.paid_by IS NULL THEN RETURN NEW; END IF;

  SELECT pt.days INTO promised_days FROM public.payment_terms pt WHERE pt.id = NEW.payment_term_id;
  promised_days := COALESCE(promised_days, 0);
  grace := public.get_numeric_setting('purchase_score_grace_days', 2)::int;
  ref_rate := public.get_numeric_setting('accountant_daily_interest_rate', 0.001);

  actual_days := EXTRACT(EPOCH FROM (NEW.paid_at - NEW.purchase_date::timestamptz)) / 86400.0;
  amount := COALESCE(NEW.purchase_price,0) * COALESCE(NEW.quantity,1);

  IF actual_days > promised_days + grace THEN
    final_score := -round((actual_days - promised_days - grace) * amount * ref_rate / 100000.0, 2);
    reason := 'late_payment_penalty';
  ELSIF actual_days <= promised_days * 0.5 THEN
    final_score := 0;
    reason := 'paid_too_early';
  ELSE
    raw_score := (actual_days - promised_days * 0.5) * amount * ref_rate;
    final_score := round(raw_score / 100000.0, 2);
    reason := 'used_term_well';
  END IF;

  INSERT INTO public.employee_score_events (employee_id, event_type, source_table, source_id, payload)
  VALUES (NEW.paid_by, 'payment_late_pay_score', 'purchases', NEW.id::text,
          jsonb_build_object(
            'score', final_score,
            'reason', reason,
            'promised_days', promised_days,
            'actual_days', actual_days,
            'grace', grace,
            'reference_daily_rate', ref_rate,
            'amount', amount
          ));
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.award_buyer_purchase_score()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  enabled_txt text;
  ref_rate numeric;
  promised_days int;
  amount numeric;
  implied_daily numeric;
  raw_score numeric;
  final_score numeric;
BEGIN
  SELECT value INTO enabled_txt FROM public.shop_settings WHERE key = 'purchase_score_enabled';
  IF COALESCE(enabled_txt,'true') <> 'true' THEN RETURN NEW; END IF;
  IF NEW.created_by IS NULL THEN RETURN NEW; END IF;

  ref_rate := public.get_numeric_setting('accountant_daily_interest_rate', 0.001);

  SELECT pt.days INTO promised_days FROM public.payment_terms pt WHERE pt.id = NEW.payment_term_id;
  IF promised_days IS NULL OR promised_days <= 0 THEN
    INSERT INTO public.employee_score_events (employee_id, event_type, source_table, source_id, payload)
    VALUES (NEW.created_by, 'purchase_long_term_score', 'purchases', NEW.id::text,
            jsonb_build_object('score', 0, 'reason', 'cash_or_no_term'));
    RETURN NEW;
  END IF;

  amount := COALESCE(NEW.purchase_price,0) * COALESCE(NEW.quantity,1);

  IF NEW.cash_price IS NULL OR NEW.cash_price <= 0 THEN
    INSERT INTO public.employee_score_events (employee_id, event_type, source_table, source_id, payload)
    VALUES (NEW.created_by, 'purchase_long_term_score', 'purchases', NEW.id::text,
            jsonb_build_object('score', 0, 'reason', 'missing_cash_price', 'promised_days', promised_days));
    RETURN NEW;
  END IF;

  implied_daily := ((NEW.purchase_price - NEW.cash_price) / NEW.cash_price) / promised_days;
  raw_score := (ref_rate - implied_daily) * promised_days * amount;
  final_score := round(raw_score / 100000.0, 2);
  IF final_score < 0 THEN final_score := 0; END IF;

  INSERT INTO public.employee_score_events (employee_id, event_type, source_table, source_id, payload)
  VALUES (NEW.created_by, 'purchase_long_term_score', 'purchases', NEW.id::text,
          jsonb_build_object(
            'score', final_score,
            'promised_days', promised_days,
            'cash_price', NEW.cash_price,
            'purchase_price', NEW.purchase_price,
            'implied_daily_cost', implied_daily,
            'reference_daily_rate', ref_rate,
            'amount', amount
          ));
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.award_inquiry_response_score()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target_user uuid;
  v_response_seconds numeric;
  v_event_type text;
  v_score_value numeric;
BEGIN
  -- فقط زمانی که answered_at تازه set شده
  IF NEW.answered_at IS NULL OR OLD.answered_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_target_user := COALESCE(NEW.assigned_to, NEW.requested_by);
  IF v_target_user IS NULL THEN
    RETURN NEW;
  END IF;

  v_response_seconds := EXTRACT(EPOCH FROM (NEW.answered_at - NEW.created_at));

  IF v_response_seconds < 120 THEN
    v_event_type := 'inquiry_answered_fast';
    v_score_value := public.get_kpi_xp(v_event_type, 10);
  ELSIF v_response_seconds < 300 THEN
    v_event_type := 'inquiry_answered_normal';
    v_score_value := public.get_kpi_xp(v_event_type, 5);
  ELSIF v_response_seconds < 600 THEN
    v_event_type := 'inquiry_answered_slow';
    v_score_value := public.get_kpi_xp(v_event_type, 2);
  ELSE
    -- محدوده کارت قرمز — بدون event
    RETURN NEW;
  END IF;

  INSERT INTO public.employee_score_events (
    employee_id, event_type, source_table, source_id, triggered_at, payload
  ) VALUES (
    v_target_user,
    v_event_type,
    'inquiries',
    NEW.id::text,
    NEW.answered_at,
    jsonb_build_object(
      'response_seconds', v_response_seconds,
      'score_value', v_score_value,
      'inquiry_id', NEW.id
    )
  )
  ON CONFLICT (source_table, source_id, event_type) DO NOTHING;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.award_xp_from_score(_employee_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_total numeric;
  last_converted numeric;
  delta numeric;
  xp_to_add numeric;
BEGIN
  SELECT total_score INTO current_total
  FROM public.employee_scores
  WHERE employee_id = _employee_id;

  IF current_total IS NULL THEN
    RETURN jsonb_build_object('xp_added', 0, 'reason', 'no_score');
  END IF;

  INSERT INTO public.employee_progress(employee_id, xp_next_level)
  VALUES (_employee_id, public.calc_xp_for_level(1))
  ON CONFLICT (employee_id) DO NOTHING;

  SELECT last_score_converted INTO last_converted
  FROM public.employee_progress
  WHERE employee_id = _employee_id;

  delta := GREATEST(current_total - COALESCE(last_converted, 0), 0);
  xp_to_add := floor(delta / 100);

  UPDATE public.employee_progress
  SET last_score_converted = current_total
  WHERE employee_id = _employee_id;

  IF xp_to_add > 0 THEN
    RETURN public.add_employee_xp(_employee_id, xp_to_add) || jsonb_build_object('xp_added', xp_to_add);
  END IF;

  RETURN jsonb_build_object('xp_added', 0, 'score_delta', delta);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.binary_quantize(halfvec)
 RETURNS bit
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_binary_quantize$function$
;

CREATE OR REPLACE FUNCTION public.binary_quantize(vector)
 RETURNS bit
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$binary_quantize$function$
;

CREATE OR REPLACE FUNCTION public.bot_authenticate_key(p_raw_key text)
 RETURNS TABLE(key_id uuid, name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _hash text;
  _id uuid;
  _name text;
  _active boolean;
  _expires timestamptz;
BEGIN
  IF p_raw_key IS NULL OR length(btrim(p_raw_key)) < 8 THEN
    RAISE EXCEPTION 'invalid_key';
  END IF;

  _hash := encode(extensions.digest(p_raw_key, 'sha256'), 'hex');

  SELECT k.id, k.name, k.is_active, k.expires_at
    INTO _id, _name, _active, _expires
  FROM public.bot_api_keys k
  WHERE k.key_hash = _hash;

  IF _id IS NULL THEN RAISE EXCEPTION 'invalid_key'; END IF;
  IF NOT _active THEN RAISE EXCEPTION 'inactive_key'; END IF;
  IF _expires IS NOT NULL AND _expires < now() THEN RAISE EXCEPTION 'expired_key'; END IF;

  UPDATE public.bot_api_keys SET last_used_at = now() WHERE id = _id;

  RETURN QUERY SELECT _id, _name;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bot_check_rate_limit(p_key_id uuid, p_ip text)
 RETURNS TABLE(ok boolean, retry_after_seconds integer, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _per_min_count int;
  _per_day_count int;
  _ip_fail_count int;
  _max_per_min constant int := 120;
  _max_per_day constant int := 5000;
  _max_ip_fail constant int := 30;
BEGIN
  IF p_key_id IS NOT NULL THEN
    SELECT count(*) INTO _per_min_count
      FROM public.bot_api_usage_logs
      WHERE api_key_id = p_key_id
        AND created_at >= now() - interval '1 minute';
    IF _per_min_count >= _max_per_min THEN
      RETURN QUERY SELECT false, 60, 'rate_limit_per_minute'::text;
      RETURN;
    END IF;

    SELECT count(*) INTO _per_day_count
      FROM public.bot_api_usage_logs
      WHERE api_key_id = p_key_id
        AND created_at >= now() - interval '1 day';
    IF _per_day_count >= _max_per_day THEN
      RETURN QUERY SELECT false, 3600, 'rate_limit_per_day'::text;
      RETURN;
    END IF;
  ELSIF p_ip IS NOT NULL THEN
    -- Unauthenticated IP-based limit (failed attempts)
    SELECT count(*) INTO _ip_fail_count
      FROM public.bot_api_usage_logs
      WHERE ip = p_ip
        AND api_key_id IS NULL
        AND status_code >= 400
        AND created_at >= now() - interval '10 minutes';
    IF _ip_fail_count >= _max_ip_fail THEN
      RETURN QUERY SELECT false, 600, 'rate_limit_ip_failures'::text;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT true, 0, ''::text;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bot_create_table_row(p_key_id uuid, p_table_id uuid, p_values jsonb)
 RETURNS TABLE(out_row_id uuid, out_row_number bigint, out_is_active boolean, out_created_at timestamp with time zone, out_updated_at timestamp with time zone, out_values jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _can_update boolean;
  _allowed uuid[];
  _row_id uuid;
  _row_num bigint;
  _now timestamptz := now();
  _key text;
  _val jsonb;
  _col record;
  _applied text[] := '{}'::text[];
  _missing_label text;
BEGIN
  -- 1) Access check
  SELECT a.can_update, a.allowed_update_columns
    INTO _can_update, _allowed
  FROM public.bot_api_key_table_access a
  WHERE a.api_key_id = p_key_id AND a.table_id = p_table_id;

  IF _can_update IS NULL THEN RAISE EXCEPTION 'forbidden_table'; END IF;
  IF NOT _can_update THEN RAISE EXCEPTION 'forbidden_update'; END IF;

  -- 2) Body shape
  IF p_values IS NULL OR jsonb_typeof(p_values) <> 'object' THEN
    RAISE EXCEPTION 'invalid_values';
  END IF;

  -- 3) Validate every supplied key BEFORE inserting the row
  FOR _key, _val IN SELECT key, value FROM jsonb_each(p_values) LOOP
    SELECT c.id, c.column_key, c.label, c.data_type::text AS data_type
      INTO _col
    FROM public.dynamic_table_columns c
    WHERE c.table_id = p_table_id AND c.column_key = _key;

    IF _col.id IS NULL THEN
      RAISE EXCEPTION 'unknown_column:%', _key;
    END IF;
    IF NOT (_col.id = ANY (COALESCE(_allowed, '{}'::uuid[]))) THEN
      RAISE EXCEPTION 'column_not_allowed:%', _key;
    END IF;
  END LOOP;

  -- 4) Required columns check (any required column must have a non-null/non-empty value)
  SELECT c.label INTO _missing_label
  FROM public.dynamic_table_columns c
  WHERE c.table_id = p_table_id AND c.is_required = true
    AND (
      NOT (p_values ? c.column_key)
      OR jsonb_typeof(p_values -> c.column_key) = 'null'
      OR (jsonb_typeof(p_values -> c.column_key) = 'string'
          AND length(btrim(p_values ->> c.column_key)) = 0)
    )
  LIMIT 1;

  IF _missing_label IS NOT NULL THEN
    RAISE EXCEPTION 'required_column_missing:%', _missing_label;
  END IF;

  -- 5) Allocate row number
  INSERT INTO public.dynamic_table_row_counters(table_id, last_value, updated_at)
  VALUES (p_table_id, 1, _now)
  ON CONFLICT (table_id) DO UPDATE
    SET last_value = public.dynamic_table_row_counters.last_value + 1,
        updated_at = _now
  RETURNING last_value INTO _row_num;

  -- 6) Create row
  INSERT INTO public.dynamic_table_rows(table_id, row_number)
  VALUES (p_table_id, _row_num)
  RETURNING id INTO _row_id;

  -- 7) Insert cells with type validation
  FOR _key, _val IN SELECT key, value FROM jsonb_each(p_values) LOOP
    SELECT c.id, c.column_key, c.label, c.data_type::text AS data_type
      INTO _col
    FROM public.dynamic_table_columns c
    WHERE c.table_id = p_table_id AND c.column_key = _key;

    -- (already validated above)

    DECLARE
      _value_text text := NULL;
      _value_number numeric := NULL;
      _value_boolean boolean := NULL;
      _value_date date := NULL;
      _value_datetime timestamptz := NULL;
      _raw_text text;
    BEGIN
      IF _val IS NULL OR jsonb_typeof(_val) = 'null' THEN
        CONTINUE; -- skip null
      ELSIF _col.data_type = 'number' THEN
        BEGIN
          _value_number := (_val #>> '{}')::numeric;
        EXCEPTION WHEN others THEN
          RAISE EXCEPTION 'invalid_number_for_column:%', _key;
        END;
      ELSIF _col.data_type = 'boolean' THEN
        IF jsonb_typeof(_val) = 'boolean' THEN
          _value_boolean := (_val)::text::boolean;
        ELSE
          _raw_text := lower(_val #>> '{}');
          IF _raw_text IN ('true','1','yes') THEN _value_boolean := true;
          ELSIF _raw_text IN ('false','0','no') THEN _value_boolean := false;
          ELSE RAISE EXCEPTION 'invalid_boolean_for_column:%', _key;
          END IF;
        END IF;
      ELSIF _col.data_type = 'date' THEN
        BEGIN _value_date := (_val #>> '{}')::date;
        EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_date_for_column:%', _key; END;
      ELSIF _col.data_type = 'datetime' THEN
        BEGIN _value_datetime := (_val #>> '{}')::timestamptz;
        EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_datetime_for_column:%', _key; END;
      ELSE
        _raw_text := _val #>> '{}';
        IF _raw_text IS NOT NULL AND length(_raw_text) > 10000 THEN
          RAISE EXCEPTION 'value_too_long_for_column:%', _key;
        END IF;
        _value_text := _raw_text;
      END IF;

      INSERT INTO public.dynamic_table_cells
        (table_id, row_id, column_id, value_text, value_number, value_boolean, value_date, value_datetime)
      VALUES
        (p_table_id, _row_id, _col.id, _value_text, _value_number, _value_boolean, _value_date, _value_datetime);

      _applied := array_append(_applied, _key);
    END;
  END LOOP;

  -- 8) Audit
  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (NULL, 'dynamic_table_row', _row_id::text, 'bot_row_created',
          jsonb_build_object(
            'api_key_id', p_key_id,
            'table_id', p_table_id,
            'row_number', _row_num,
            'applied_keys', _applied,
            'values', p_values
          ));

  -- 9) Return full row (pivot cells -> jsonb)
  RETURN QUERY
  SELECT
    r.id,
    r.row_number,
    r.is_active,
    r.created_at,
    r.updated_at,
    COALESCE(
      (SELECT jsonb_object_agg(
        col.column_key,
        CASE col.data_type::text
          WHEN 'number'   THEN to_jsonb(c.value_number)
          WHEN 'boolean'  THEN to_jsonb(c.value_boolean)
          WHEN 'date'     THEN to_jsonb(c.value_date)
          WHEN 'datetime' THEN to_jsonb(c.value_datetime)
          ELSE to_jsonb(c.value_text)
        END)
       FROM public.dynamic_table_cells c
       JOIN public.dynamic_table_columns col ON col.id = c.column_id
       WHERE c.row_id = r.id AND c.table_id = p_table_id),
      '{}'::jsonb)
  FROM public.dynamic_table_rows r
  WHERE r.id = _row_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bot_get_product_for_key(p_key_id uuid, p_product_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed boolean;
  v_result jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.product_label_links pll
    JOIN public.bot_api_key_label_access kla ON kla.label_id = pll.label_id
    WHERE pll.product_id = p_product_id AND kla.api_key_id = p_key_id
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'forbidden_product';
  END IF;

  SELECT jsonb_build_object(
    'id', p.id,
    'sku', p.sku,
    'name', p.name,
    'description', p.description,
    'technical_notes', p.technical_notes,
    'status', p.status,
    'stock_status', p.stock_status,
    'unit', p.unit,
    'color', p.color,
    'capacity', p.capacity,
    'model', p.model,
    'primary_spec', p.primary_spec,
    'updated_at', p.updated_at,
    'created_at', p.created_at,
    'brand', (SELECT jsonb_build_object('id', b.id, 'name', b.name) FROM public.brands b WHERE b.id = p.brand_id),
    'category', (SELECT jsonb_build_object('id', c.id, 'name', c.name) FROM public.categories c WHERE c.id = p.category_id),
    'labels', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'color', l.color))
      FROM public.product_label_links pll
      JOIN public.product_labels l ON l.id = pll.label_id
      WHERE pll.product_id = p.id
    ), '[]'::jsonb),
    'prices', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sale_price_type_id', spt.id,
        'sale_price_type_title', spt.title,
        'rounded_sale_price', pcp.rounded_sale_price,
        'final_sale_price', pcp.final_sale_price,
        'computed_at', pcp.computed_at
      ))
      FROM public.product_computed_prices pcp
      JOIN public.sale_price_types spt ON spt.id = pcp.sale_price_type_id
      WHERE pcp.product_id = p.id AND spt.is_active = true
    ), '[]'::jsonb),
    'attributes', COALESCE((
      SELECT jsonb_object_agg(cpa.attribute_key, pcav.value)
      FROM public.product_category_attribute_values pcav
      JOIN public.category_product_attributes cpa ON cpa.id = pcav.category_attribute_id
      WHERE pcav.product_id = p.id
    ), '{}'::jsonb)
  ) INTO v_result
  FROM public.products p
  WHERE p.id = p_product_id;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bot_key_stats_today()
 RETURNS TABLE(api_key_id uuid, requests_today bigint, errors_today bigint, last_used_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT
      l.api_key_id,
      count(*)                                                        AS requests_today,
      count(*) FILTER (WHERE l.status_code >= 400)                    AS errors_today,
      max(l.created_at)                                               AS last_used_at
    FROM public.bot_api_usage_logs l
    WHERE l.api_key_id IS NOT NULL
      AND l.created_at >= date_trunc('day', now())
    GROUP BY l.api_key_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bot_list_products_for_key(p_key_id uuid, p_label_id uuid DEFAULT NULL::uuid, p_updated_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50)
 RETURNS TABLE(total_count bigint, product jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_offset integer := GREATEST(0, (COALESCE(p_page,1) - 1) * COALESCE(p_page_size,50));
  v_limit  integer := LEAST(100, GREATEST(1, COALESCE(p_page_size,50)));
  v_has_any boolean;
BEGIN
  -- Confirm key has at least one allowed label
  SELECT EXISTS (SELECT 1 FROM public.bot_api_key_label_access WHERE api_key_id = p_key_id) INTO v_has_any;
  IF NOT v_has_any THEN
    RAISE EXCEPTION 'forbidden_no_labels';
  END IF;

  -- If specific label requested, ensure it's in allowlist
  IF p_label_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.bot_api_key_label_access
                   WHERE api_key_id = p_key_id AND label_id = p_label_id) THEN
      RAISE EXCEPTION 'forbidden_label';
    END IF;
  END IF;

  RETURN QUERY
  WITH allowed AS (
    SELECT label_id FROM public.bot_api_key_label_access WHERE api_key_id = p_key_id
  ),
  matched AS (
    SELECT DISTINCT pll.product_id
    FROM public.product_label_links pll
    JOIN allowed a ON a.label_id = pll.label_id
    WHERE p_label_id IS NULL OR pll.label_id = p_label_id
  ),
  base AS (
    SELECT p.*
    FROM public.products p
    JOIN matched m ON m.product_id = p.id
    WHERE (p_updated_since IS NULL OR p.updated_at >= p_updated_since)
  ),
  counted AS (SELECT count(*)::bigint AS c FROM base),
  page AS (
    SELECT * FROM base ORDER BY updated_at DESC NULLS LAST, id ASC
    LIMIT v_limit OFFSET v_offset
  )
  SELECT
    (SELECT c FROM counted) AS total_count,
    jsonb_build_object(
      'id', pg.id,
      'sku', pg.sku,
      'name', pg.name,
      'description', pg.description,
      'status', pg.status,
      'stock_status', pg.stock_status,
      'unit', pg.unit,
      'color', pg.color,
      'capacity', pg.capacity,
      'model', pg.model,
      'primary_spec', pg.primary_spec,
      'updated_at', pg.updated_at,
      'brand', (SELECT jsonb_build_object('id', b.id, 'name', b.name)
                FROM public.brands b WHERE b.id = pg.brand_id),
      'category', (SELECT jsonb_build_object('id', c.id, 'name', c.name)
                   FROM public.categories c WHERE c.id = pg.category_id),
      'labels', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'color', l.color))
        FROM public.product_label_links pll
        JOIN public.product_labels l ON l.id = pll.label_id
        WHERE pll.product_id = pg.id
      ), '[]'::jsonb),
      'prices', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'sale_price_type_id', spt.id,
          'sale_price_type_title', spt.title,
          'rounded_sale_price', pcp.rounded_sale_price,
          'final_sale_price', pcp.final_sale_price,
          'computed_at', pcp.computed_at
        ))
        FROM public.product_computed_prices pcp
        JOIN public.sale_price_types spt ON spt.id = pcp.sale_price_type_id
        WHERE pcp.product_id = pg.id AND spt.is_active = true
      ), '[]'::jsonb)
    ) AS product
  FROM page pg;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bot_query_table_rows(p_key_id uuid, p_table_id uuid, p_search text DEFAULT NULL::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50)
 RETURNS TABLE(total_count bigint, out_row_id uuid, out_row_number bigint, out_is_active boolean, out_created_at timestamp with time zone, out_updated_at timestamp with time zone, out_values jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _can_read boolean;
  _limit int;
  _offset int;
  _search_like text;
  _search_num numeric;
  _total bigint;
BEGIN
  -- Verify access mapping
  SELECT a.can_read INTO _can_read
  FROM public.bot_api_key_table_access a
  WHERE a.api_key_id = p_key_id AND a.table_id = p_table_id;

  IF _can_read IS NULL THEN RAISE EXCEPTION 'forbidden_table'; END IF;
  IF NOT _can_read THEN RAISE EXCEPTION 'forbidden_read'; END IF;

  _limit := GREATEST(1, LEAST(COALESCE(p_page_size, 50), 100));
  _offset := GREATEST(0, (GREATEST(1, COALESCE(p_page, 1)) - 1) * _limit);

  CREATE TEMP TABLE IF NOT EXISTS _bot_q_rows (
    row_id uuid, row_number bigint, is_active boolean,
    created_at timestamptz, updated_at timestamptz
  ) ON COMMIT DROP;
  TRUNCATE _bot_q_rows;

  INSERT INTO _bot_q_rows (row_id, row_number, is_active, created_at, updated_at)
  SELECT r.id, r.row_number, r.is_active, r.created_at, r.updated_at
  FROM public.dynamic_table_rows r
  WHERE r.table_id = p_table_id AND r.is_active = true;

  IF p_search IS NOT NULL AND length(btrim(p_search)) > 0 THEN
    _search_like := '%' || btrim(p_search) || '%';
    BEGIN _search_num := btrim(p_search)::numeric; EXCEPTION WHEN others THEN _search_num := NULL; END;

    DELETE FROM _bot_q_rows q WHERE NOT (
      (_search_num IS NOT NULL AND q.row_number = _search_num::bigint)
      OR EXISTS (
        SELECT 1
        FROM public.dynamic_table_cells c
        JOIN public.dynamic_table_columns col ON col.id = c.column_id
        WHERE c.row_id = q.row_id
          AND c.table_id = p_table_id
          AND col.data_type::text IN ('text','phone','tag','status')
          AND c.value_text ILIKE _search_like
      )
    );
  END IF;

  SELECT count(*) INTO _total FROM _bot_q_rows;

  RETURN QUERY
  WITH windowed AS (
    SELECT q.row_id, q.row_number, q.is_active, q.created_at, q.updated_at
    FROM _bot_q_rows q
    ORDER BY q.row_number ASC
    LIMIT _limit OFFSET _offset
  ),
  pivoted AS (
    SELECT w.row_id,
      COALESCE(jsonb_object_agg(
        col.column_key,
        CASE col.data_type::text
          WHEN 'number' THEN to_jsonb(c.value_number)
          WHEN 'boolean' THEN to_jsonb(c.value_boolean)
          WHEN 'date' THEN to_jsonb(c.value_date)
          WHEN 'datetime' THEN to_jsonb(c.value_datetime)
          ELSE to_jsonb(c.value_text)
        END
      ) FILTER (WHERE col.column_key IS NOT NULL), '{}'::jsonb) AS vals
    FROM windowed w
    LEFT JOIN public.dynamic_table_cells c ON c.row_id = w.row_id AND c.table_id = p_table_id
    LEFT JOIN public.dynamic_table_columns col ON col.id = c.column_id
    GROUP BY w.row_id
  )
  SELECT _total, w.row_id, w.row_number, w.is_active, w.created_at, w.updated_at,
         COALESCE(p.vals, '{}'::jsonb)
  FROM windowed w
  LEFT JOIN pivoted p ON p.row_id = w.row_id
  ORDER BY w.row_number ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bot_suspicious_ips(p_limit integer DEFAULT 20)
 RETURNS TABLE(ip text, failed_count bigint, last_attempt_at timestamp with time zone, distinct_endpoints bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT
      l.ip,
      count(*)                       AS failed_count,
      max(l.created_at)              AS last_attempt_at,
      count(DISTINCT l.endpoint)     AS distinct_endpoints
    FROM public.bot_api_usage_logs l
    WHERE l.ip IS NOT NULL
      AND l.status_code >= 400
      AND l.created_at >= now() - interval '24 hours'
    GROUP BY l.ip
    HAVING count(*) >= 5
    ORDER BY count(*) DESC
    LIMIT GREATEST(1, LEAST(p_limit, 100));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bot_update_table_row(p_key_id uuid, p_table_id uuid, p_row_id uuid, p_values jsonb)
 RETURNS TABLE(updated_count integer, applied_keys text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _can_update boolean;
  _allowed uuid[];
  _row_table uuid;
  _key text;
  _val jsonb;
  _col record;
  _applied text[] := '{}'::text[];
  _now timestamptz := now();
BEGIN
  -- Access check
  SELECT a.can_update, a.allowed_update_columns
    INTO _can_update, _allowed
  FROM public.bot_api_key_table_access a
  WHERE a.api_key_id = p_key_id AND a.table_id = p_table_id;

  IF _can_update IS NULL THEN RAISE EXCEPTION 'forbidden_table'; END IF;
  IF NOT _can_update THEN RAISE EXCEPTION 'forbidden_update'; END IF;

  -- Verify row belongs to the table
  SELECT r.table_id INTO _row_table FROM public.dynamic_table_rows r WHERE r.id = p_row_id;
  IF _row_table IS NULL THEN RAISE EXCEPTION 'row_not_found'; END IF;
  IF _row_table <> p_table_id THEN RAISE EXCEPTION 'row_table_mismatch'; END IF;

  IF p_values IS NULL OR jsonb_typeof(p_values) <> 'object' THEN
    RAISE EXCEPTION 'invalid_values';
  END IF;

  -- Iterate keys
  FOR _key, _val IN SELECT key, value FROM jsonb_each(p_values) LOOP
    SELECT c.id, c.column_key, c.label, c.data_type::text AS data_type
      INTO _col
    FROM public.dynamic_table_columns c
    WHERE c.table_id = p_table_id AND c.column_key = _key;

    IF _col.id IS NULL THEN
      RAISE EXCEPTION 'unknown_column:%', _key;
    END IF;
    IF NOT (_col.id = ANY (COALESCE(_allowed, '{}'::uuid[]))) THEN
      RAISE EXCEPTION 'column_not_allowed:%', _key;
    END IF;

    -- Type-aware upsert into dynamic_table_cells
    DECLARE
      _value_text text := NULL;
      _value_number numeric := NULL;
      _value_boolean boolean := NULL;
      _value_date date := NULL;
      _value_datetime timestamptz := NULL;
      _raw_text text;
    BEGIN
      IF _val IS NULL OR jsonb_typeof(_val) = 'null' THEN
        -- Pass: all NULLs → clear cell
        NULL;
      ELSIF _col.data_type = 'number' THEN
        BEGIN
          _value_number := (_val #>> '{}')::numeric;
        EXCEPTION WHEN others THEN
          RAISE EXCEPTION 'invalid_number_for_column:%', _key;
        END;
      ELSIF _col.data_type = 'boolean' THEN
        IF jsonb_typeof(_val) = 'boolean' THEN
          _value_boolean := (_val)::text::boolean;
        ELSE
          _raw_text := lower(_val #>> '{}');
          IF _raw_text IN ('true','1','yes') THEN _value_boolean := true;
          ELSIF _raw_text IN ('false','0','no') THEN _value_boolean := false;
          ELSE RAISE EXCEPTION 'invalid_boolean_for_column:%', _key;
          END IF;
        END IF;
      ELSIF _col.data_type = 'date' THEN
        BEGIN _value_date := (_val #>> '{}')::date;
        EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_date_for_column:%', _key; END;
      ELSIF _col.data_type = 'datetime' THEN
        BEGIN _value_datetime := (_val #>> '{}')::timestamptz;
        EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_datetime_for_column:%', _key; END;
      ELSE
        _raw_text := _val #>> '{}';
        IF _raw_text IS NOT NULL AND length(_raw_text) > 10000 THEN
          RAISE EXCEPTION 'value_too_long_for_column:%', _key;
        END IF;
        _value_text := _raw_text;
      END IF;

      INSERT INTO public.dynamic_table_cells
        (table_id, row_id, column_id, value_text, value_number, value_boolean, value_date, value_datetime)
      VALUES
        (p_table_id, p_row_id, _col.id, _value_text, _value_number, _value_boolean, _value_date, _value_datetime)
      ON CONFLICT (row_id, column_id) DO UPDATE SET
        value_text = EXCLUDED.value_text,
        value_number = EXCLUDED.value_number,
        value_boolean = EXCLUDED.value_boolean,
        value_date = EXCLUDED.value_date,
        value_datetime = EXCLUDED.value_datetime,
        updated_at = _now;

      _applied := array_append(_applied, _key);
    END;
  END LOOP;

  -- Touch row
  UPDATE public.dynamic_table_rows SET updated_at = _now WHERE id = p_row_id;

  -- Audit
  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (NULL, 'dynamic_table_row', p_row_id::text, 'bot_row_updated',
          jsonb_build_object(
            'api_key_id', p_key_id,
            'table_id', p_table_id,
            'applied_keys', _applied,
            'values', p_values
          ));

  RETURN QUERY SELECT array_length(_applied, 1) AS updated_count, _applied AS applied_keys;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bot_upsert_table_row(p_key_id uuid, p_table_id uuid, p_unique_by text[], p_values jsonb)
 RETURNS TABLE(out_mode text, out_row_id uuid, out_row_number bigint, out_is_active boolean, out_created_at timestamp with time zone, out_updated_at timestamp with time zone, out_values jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _can_update boolean;
  _allowed uuid[];
  _key text;
  _col record;
  _val jsonb;
  _raw_text text;
  _col_ids uuid[] := '{}'::uuid[];
  _v_texts text[] := '{}'::text[];
  _v_nums  numeric[] := '{}'::numeric[];
  _v_bools boolean[] := '{}'::boolean[];
  _v_dates date[] := '{}'::date[];
  _v_dts   timestamptz[] := '{}'::timestamptz[];
  _dtypes  text[] := '{}'::text[];
  _matched uuid[];
  _existing_row uuid;
  _new_row uuid;
  _update_values jsonb;
  _strip_key text;
BEGIN
  -- 1) Access check
  SELECT a.can_update, a.allowed_update_columns
    INTO _can_update, _allowed
  FROM public.bot_api_key_table_access a
  WHERE a.api_key_id = p_key_id AND a.table_id = p_table_id;

  IF _can_update IS NULL THEN RAISE EXCEPTION 'forbidden_table'; END IF;
  IF NOT _can_update THEN RAISE EXCEPTION 'forbidden_update'; END IF;

  IF p_values IS NULL OR jsonb_typeof(p_values) <> 'object' THEN
    RAISE EXCEPTION 'invalid_values';
  END IF;

  IF p_unique_by IS NULL OR array_length(p_unique_by, 1) IS NULL THEN
    RAISE EXCEPTION 'invalid_unique_by';
  END IF;

  -- 2) Reject computed columns explicitly
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_values) k
    JOIN public.dynamic_table_columns c
      ON c.table_id = p_table_id AND c.column_key = k
    WHERE c.is_computed = true
  ) THEN
    RAISE EXCEPTION 'column_not_allowed:%',
      (SELECT c.column_key
       FROM jsonb_object_keys(p_values) k
       JOIN public.dynamic_table_columns c
         ON c.table_id = p_table_id AND c.column_key = k
       WHERE c.is_computed = true
       LIMIT 1);
  END IF;

  -- 3) Validate + normalize each unique_by key into parallel arrays
  FOREACH _key IN ARRAY p_unique_by LOOP
    SELECT c.id, c.column_key, c.label, c.data_type::text AS data_type, c.is_computed
      INTO _col
    FROM public.dynamic_table_columns c
    WHERE c.table_id = p_table_id AND c.column_key = _key;

    IF _col.id IS NULL THEN
      RAISE EXCEPTION 'unknown_column:%', _key;
    END IF;
    IF _col.is_computed THEN
      RAISE EXCEPTION 'invalid_unique_by';
    END IF;

    IF NOT (p_values ? _key) OR jsonb_typeof(p_values -> _key) = 'null' THEN
      RAISE EXCEPTION 'required_column_missing:%', _key;
    END IF;

    _val := p_values -> _key;
    _raw_text := _val #>> '{}';

    DECLARE
      _vt text := NULL; _vn numeric := NULL; _vb boolean := NULL;
      _vd date := NULL; _vdt timestamptz := NULL;
    BEGIN
      IF _col.data_type = 'number' THEN
        BEGIN _vn := _raw_text::numeric;
        EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_number_for_column:%', _key; END;
      ELSIF _col.data_type = 'boolean' THEN
        IF jsonb_typeof(_val) = 'boolean' THEN
          _vb := (_val)::text::boolean;
        ELSE
          IF lower(_raw_text) IN ('true','1','yes') THEN _vb := true;
          ELSIF lower(_raw_text) IN ('false','0','no') THEN _vb := false;
          ELSE RAISE EXCEPTION 'invalid_boolean_for_column:%', _key;
          END IF;
        END IF;
      ELSIF _col.data_type = 'date' THEN
        BEGIN _vd := _raw_text::date;
        EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_date_for_column:%', _key; END;
      ELSIF _col.data_type = 'datetime' THEN
        BEGIN _vdt := _raw_text::timestamptz;
        EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_datetime_for_column:%', _key; END;
      ELSE
        IF _raw_text IS NULL OR length(btrim(_raw_text)) = 0 THEN
          RAISE EXCEPTION 'required_column_missing:%', _key;
        END IF;
        _vt := _raw_text;
      END IF;

      _col_ids := array_append(_col_ids, _col.id);
      _v_texts := array_append(_v_texts, _vt);
      _v_nums  := array_append(_v_nums, _vn);
      _v_bools := array_append(_v_bools, _vb);
      _v_dates := array_append(_v_dates, _vd);
      _v_dts   := array_append(_v_dts, _vdt);
      _dtypes  := array_append(_dtypes, _col.data_type);
    END;
  END LOOP;

  -- 4) Set-based match: row must satisfy ALL unique_by keys
  SELECT array_agg(row_id) INTO _matched
  FROM (
    SELECT cl.row_id
    FROM public.dynamic_table_cells cl
    JOIN unnest(_col_ids, _v_texts, _v_nums, _v_bools, _v_dates, _v_dts, _dtypes)
      WITH ORDINALITY AS u(col_id, vt, vn, vb, vd, vdt, dt, idx)
      ON cl.column_id = u.col_id
    WHERE cl.table_id = p_table_id
      AND CASE u.dt
        WHEN 'number'   THEN cl.value_number   IS NOT DISTINCT FROM u.vn
        WHEN 'boolean'  THEN cl.value_boolean  IS NOT DISTINCT FROM u.vb
        WHEN 'date'     THEN cl.value_date     IS NOT DISTINCT FROM u.vd
        WHEN 'datetime' THEN cl.value_datetime IS NOT DISTINCT FROM u.vdt
        ELSE cl.value_text IS NOT DISTINCT FROM u.vt
      END
    GROUP BY cl.row_id
    HAVING count(*) = array_length(_col_ids, 1)
    LIMIT 2
  ) m;

  IF _matched IS NOT NULL AND array_length(_matched, 1) > 1 THEN
    RAISE EXCEPTION 'duplicate_match';
  END IF;

  -- 5) UPDATE path
  IF _matched IS NOT NULL AND array_length(_matched, 1) = 1 THEN
    _existing_row := _matched[1];

    -- DT.7C-FIX: strip unique_by keys from the payload before delegating to
    -- bot_update_table_row. These keys are match identifiers, not values the
    -- bot is allowed (or trying) to change. Any OTHER key in payload still
    -- goes through bot_update_table_row's allowed_update_columns check.
    _update_values := p_values;
    FOREACH _strip_key IN ARRAY p_unique_by LOOP
      _update_values := _update_values - _strip_key;
    END LOOP;

    -- Only call the update if there is at least one mutable key left.
    IF _update_values IS NOT NULL
       AND jsonb_typeof(_update_values) = 'object'
       AND (SELECT count(*) FROM jsonb_object_keys(_update_values)) > 0 THEN
      PERFORM public.bot_update_table_row(p_key_id, p_table_id, _existing_row, _update_values);
    END IF;

    RETURN QUERY
    SELECT 'updated'::text, r.id, r.row_number, r.is_active, r.created_at, r.updated_at,
      COALESCE(
        (SELECT jsonb_object_agg(col.column_key,
          CASE col.data_type::text
            WHEN 'number'   THEN to_jsonb(c.value_number)
            WHEN 'boolean'  THEN to_jsonb(c.value_boolean)
            WHEN 'date'     THEN to_jsonb(c.value_date)
            WHEN 'datetime' THEN to_jsonb(c.value_datetime)
            ELSE to_jsonb(c.value_text)
          END)
         FROM public.dynamic_table_cells c
         JOIN public.dynamic_table_columns col ON col.id = c.column_id
         WHERE c.row_id = r.id AND c.table_id = p_table_id),
        '{}'::jsonb)
    FROM public.dynamic_table_rows r
    WHERE r.id = _existing_row;
    RETURN;
  END IF;

  -- 6) CREATE path
  SELECT bc.out_row_id INTO _new_row
  FROM public.bot_create_table_row(p_key_id, p_table_id, p_values) AS bc;

  RETURN QUERY
  SELECT 'created'::text, r.id, r.row_number, r.is_active, r.created_at, r.updated_at,
    COALESCE(
      (SELECT jsonb_object_agg(col.column_key,
        CASE col.data_type::text
          WHEN 'number'   THEN to_jsonb(c.value_number)
          WHEN 'boolean'  THEN to_jsonb(c.value_boolean)
          WHEN 'date'     THEN to_jsonb(c.value_date)
          WHEN 'datetime' THEN to_jsonb(c.value_datetime)
          ELSE to_jsonb(c.value_text)
        END)
       FROM public.dynamic_table_cells c
       JOIN public.dynamic_table_columns col ON col.id = c.column_id
       WHERE c.row_id = r.id AND c.table_id = p_table_id),
      '{}'::jsonb)
  FROM public.dynamic_table_rows r
  WHERE r.id = _new_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calc_xp_for_level(_level integer)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT floor(100 * power(GREATEST(_level, 1)::numeric, 1.5));
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_credit_score(_customer_id uuid)
 RETURNS TABLE(score integer, credit_limit numeric, params jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_window_months integer := 6;
  v_window_start  timestamptz;

  v_paid_purchase_amount numeric := 0;
  v_invoice_amount_in_window numeric := 0;
  v_total_purchases_all numeric := 0;
  v_last_purchase timestamptz;
  v_outstanding numeric := 0;
  v_late integer := 0;

  v_avg_paid numeric := 0;

  -- settlement speed
  v_avg_delta_days numeric := NULL;     -- weighted average (by paid amount) delta_days
  v_early_count    integer := 0;
  v_ontime_count   integer := 0;
  v_late_pay_count integer := 0;        -- payment events with delta>0 (informational)
  v_settlement_score numeric := 50;     -- neutral when no data

  v_score numeric := 0;
  v_purchase_score numeric := 0;
  v_payment_score numeric := 0;
  v_late_score numeric := 0;
  v_recent_score numeric := 0;
  v_outstanding_score numeric := 0;
  v_base_limit numeric := 100000000;
  v_final_limit numeric;
  v_params jsonb;

  w_purchase    numeric := 0.25;
  w_payment     numeric := 0.25;
  w_late        numeric := 0.10;
  w_recent      numeric := 0.10;
  w_outstanding numeric := 0.10;
  w_settlement  numeric := 0.20;
BEGIN
  -- Load weights
  SELECT weight INTO w_purchase    FROM credit_scoring_rules WHERE parameter_name='purchase_history' AND is_active;
  SELECT weight INTO w_payment     FROM credit_scoring_rules WHERE parameter_name='payment_history'  AND is_active;
  SELECT weight INTO w_late        FROM credit_scoring_rules WHERE parameter_name='late_payments'    AND is_active;
  SELECT weight INTO w_recent      FROM credit_scoring_rules WHERE parameter_name='recent_activity'  AND is_active;
  SELECT weight INTO w_outstanding FROM credit_scoring_rules WHERE parameter_name='outstanding_ratio' AND is_active;
  SELECT weight INTO w_settlement  FROM credit_scoring_rules WHERE parameter_name='settlement_speed' AND is_active;
  w_purchase    := COALESCE(w_purchase, 0.25);
  w_payment     := COALESCE(w_payment, 0.25);
  w_late        := COALESCE(w_late, 0);
  w_recent      := COALESCE(w_recent, 0.10);
  w_outstanding := COALESCE(w_outstanding, 0.10);
  w_settlement  := COALESCE(w_settlement, 0);

  -- Resolve window
  SELECT window_months INTO v_window_months FROM credit_scoring_rules WHERE parameter_name='payment_history' LIMIT 1;
  IF v_window_months IS NULL THEN
    SELECT window_months INTO v_window_months FROM credit_scoring_rules WHERE parameter_name='purchase_history' LIMIT 1;
  END IF;
  v_window_months := COALESCE(v_window_months, 6);
  v_window_start := (CURRENT_DATE - (v_window_months || ' months')::interval)::timestamptz;

  -- Legacy total_purchases (issued, all-time, non-draft/cancelled)
  SELECT COALESCE(SUM(total_amount),0), MAX(issue_date::timestamptz)
    INTO v_total_purchases_all, v_last_purchase
  FROM invoices
  WHERE customer_id = _customer_id
    AND COALESCE(status,'') NOT IN ('draft','cancelled');

  -- Per-invoice qualifying payments inside window
  WITH inv AS (
    SELECT i.id, i.total_amount
    FROM invoices i
    WHERE i.customer_id = _customer_id
      AND COALESCE(i.status,'') NOT IN ('draft','cancelled')
  ),
  pay AS (
    SELECT prl.invoice_id, COALESCE(SUM(prl.amount),0) AS paid_in_window
    FROM payment_receipt_links prl
    JOIN payment_receipts pr ON pr.id = prl.receipt_id
    WHERE pr.status::text IN ('approved','verified','confirmed','posted')
      AND pr.payment_date >= v_window_start::date
      AND prl.invoice_id IN (SELECT id FROM inv)
    GROUP BY prl.invoice_id
  )
  SELECT
    COALESCE(SUM(LEAST(p.paid_in_window, inv.total_amount)),0),
    COALESCE(SUM(inv.total_amount) FILTER (WHERE p.paid_in_window > 0),0)
  INTO v_paid_purchase_amount, v_invoice_amount_in_window
  FROM inv
  LEFT JOIN pay p ON p.invoice_id = inv.id;

  -- Outstanding from cache (refresh deferred)
  SELECT COALESCE(outstanding_balance,0)
    INTO v_outstanding
  FROM customer_credit_profile WHERE customer_id = _customer_id;

  -- Settlement speed: weighted avg delta_days = payment_date - due_date
  -- Each qualifying payment-link in window where invoice has a due_date
  WITH ev AS (
    SELECT
      prl.amount AS w,
      (pr.payment_date - i.due_date)::int AS delta_days
    FROM payment_receipt_links prl
    JOIN payment_receipts pr ON pr.id = prl.receipt_id
    JOIN invoices i ON i.id = prl.invoice_id
    WHERE i.customer_id = _customer_id
      AND COALESCE(i.status,'') NOT IN ('draft','cancelled')
      AND i.due_date IS NOT NULL
      AND pr.status::text IN ('approved','verified','confirmed','posted')
      AND pr.payment_date >= v_window_start::date
      AND COALESCE(prl.amount,0) > 0
  )
  SELECT
    CASE WHEN COALESCE(SUM(w),0) > 0
         THEN SUM(w * delta_days) / SUM(w)
         ELSE NULL END,
    COALESCE(SUM(CASE WHEN delta_days < 0 THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN delta_days = 0 THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN delta_days > 0 THEN 1 ELSE 0 END),0)
  INTO v_avg_delta_days, v_early_count, v_ontime_count, v_late_pay_count
  FROM ev;

  IF v_avg_delta_days IS NULL THEN
    v_settlement_score := 50; -- neutral when no qualifying payments
  ELSE
    v_settlement_score := GREATEST(0, LEAST(100, 50 + ((-v_avg_delta_days) * 2)));
  END IF;

  -- late_payments_count: invoices whose latest qualifying payment is > 7 days after due_date (window-scoped)
  WITH last_pay AS (
    SELECT prl.invoice_id, MAX(pr.payment_date) AS last_payment_date
    FROM payment_receipt_links prl
    JOIN payment_receipts pr ON pr.id = prl.receipt_id
    JOIN invoices i ON i.id = prl.invoice_id
    WHERE i.customer_id = _customer_id
      AND COALESCE(i.status,'') NOT IN ('draft','cancelled')
      AND i.due_date IS NOT NULL
      AND pr.status::text IN ('approved','verified','confirmed','posted')
      AND pr.payment_date >= v_window_start::date
    GROUP BY prl.invoice_id
  )
  SELECT COUNT(*)::int INTO v_late
  FROM last_pay lp
  JOIN invoices i ON i.id = lp.invoice_id
  WHERE (lp.last_payment_date - i.due_date) > 7;

  v_late := COALESCE(v_late, 0);

  -- Average paid_purchase across customers (window-based)
  SELECT COALESCE(AVG(t),0) INTO v_avg_paid FROM (
    SELECT COALESCE(SUM(LEAST(p.paid_in_window, inv.total_amount)),0) AS t
    FROM (
      SELECT i.id, i.customer_id, i.total_amount
      FROM invoices i
      WHERE COALESCE(i.status,'') NOT IN ('draft','cancelled')
    ) inv
    LEFT JOIN (
      SELECT prl.invoice_id, COALESCE(SUM(prl.amount),0) AS paid_in_window
      FROM payment_receipt_links prl
      JOIN payment_receipts pr ON pr.id = prl.receipt_id
      WHERE pr.status::text IN ('approved','verified','confirmed','posted')
        AND pr.payment_date >= v_window_start::date
      GROUP BY prl.invoice_id
    ) p ON p.invoice_id = inv.id
    GROUP BY inv.customer_id
  ) s;

  -- Sub-scores
  IF v_avg_paid > 0 THEN
    v_purchase_score := LEAST(100, (v_paid_purchase_amount / v_avg_paid) * 50);
  ELSIF v_paid_purchase_amount > 0 THEN
    v_purchase_score := 50;
  ELSE
    v_purchase_score := 0;
  END IF;

  IF v_invoice_amount_in_window > 0 THEN
    v_payment_score := LEAST(100, (v_paid_purchase_amount / v_invoice_amount_in_window) * 100);
  ELSE
    v_payment_score := 50;
  END IF;

  v_late_score := GREATEST(0, 100 - v_late * 10);

  IF v_last_purchase IS NOT NULL THEN
    v_recent_score := GREATEST(0, 100 - EXTRACT(DAY FROM (now() - v_last_purchase))::numeric / 3.65);
  ELSE
    v_recent_score := 30;
  END IF;

  IF v_total_purchases_all > 0 THEN
    v_outstanding_score := GREATEST(0, 100 - (v_outstanding / GREATEST(v_total_purchases_all,1)) * 100);
  ELSE
    v_outstanding_score := 100;
  END IF;

  v_score := v_purchase_score    * w_purchase
           + v_payment_score     * w_payment
           + v_late_score        * w_late
           + v_recent_score      * w_recent
           + v_outstanding_score * w_outstanding
           + v_settlement_score  * w_settlement;
  v_score := GREATEST(0, LEAST(100, v_score));
  v_final_limit := v_base_limit * (v_score / 100.0);

  v_params := jsonb_build_object(
    'window_months', v_window_months,
    'window_start', v_window_start,
    'paid_purchase_amount', v_paid_purchase_amount,
    'invoice_amount_in_window', v_invoice_amount_in_window,
    'total_purchases_all_time', v_total_purchases_all,
    'outstanding', v_outstanding,
    'late_payments', v_late,
    'avg_paid_purchase', v_avg_paid,
    'settlement', jsonb_build_object(
      'avg_delta_days', v_avg_delta_days,
      'early_payments', v_early_count,
      'ontime_payments', v_ontime_count,
      'late_payment_events', v_late_pay_count,
      'late_invoices_gt_7d', v_late
    ),
    'sub_scores', jsonb_build_object(
      'purchase', v_purchase_score, 'payment', v_payment_score,
      'late', v_late_score, 'recent', v_recent_score,
      'outstanding', v_outstanding_score, 'settlement', v_settlement_score
    ),
    'weights', jsonb_build_object(
      'purchase_history', w_purchase, 'payment_history', w_payment,
      'late_payments', w_late, 'recent_activity', w_recent,
      'outstanding_ratio', w_outstanding, 'settlement_speed', w_settlement
    ),
    'base_limit', v_base_limit,
    'qualifying_receipt_statuses', jsonb_build_array('approved','verified','confirmed','posted')
  );

  -- Upsert profile (now also refreshing late_payments_count)
  INSERT INTO customer_credit_profile (customer_id, total_purchases, total_paid, last_purchase_date, credit_score, credit_limit, late_payments_count)
    VALUES (_customer_id, v_total_purchases_all, v_paid_purchase_amount, v_last_purchase, ROUND(v_score)::int, ROUND(v_final_limit,2), v_late)
    ON CONFLICT (customer_id) DO UPDATE SET
      total_purchases = EXCLUDED.total_purchases,
      total_paid = EXCLUDED.total_paid,
      last_purchase_date = EXCLUDED.last_purchase_date,
      credit_score = EXCLUDED.credit_score,
      credit_limit = EXCLUDED.credit_limit,
      late_payments_count = EXCLUDED.late_payments_count,
      updated_at = now();

  INSERT INTO credit_score_snapshots (customer_id, score, credit_limit, params_used, calculated_by)
    VALUES (_customer_id, ROUND(v_score)::int, ROUND(v_final_limit,2), v_params, auth.uid());

  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, diff)
    VALUES (auth.uid(), 'credit_score_calculated', 'customer_credit_profile', _customer_id::text,
            jsonb_build_object(
              'score', ROUND(v_score)::int,
              'credit_limit', ROUND(v_final_limit,2),
              'window_months', v_window_months,
              'paid_purchase_amount', v_paid_purchase_amount,
              'avg_delta_days', v_avg_delta_days,
              'late_invoices_gt_7d', v_late
            ));

  RETURN QUERY SELECT ROUND(v_score)::int, ROUND(v_final_limit,2), v_params;
END $function$
;

CREATE OR REPLACE FUNCTION public.calculate_employee_score(_employee_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _now timestamptz := now();
  _day_start timestamptz := date_trunc('day', _now);
  _week_start timestamptz := date_trunc('week', _now);
  _month_start timestamptz := date_trunc('month', _now);
  _prev_month_start timestamptz := date_trunc('month', _now - interval '1 month');
  _prev_month_end timestamptz := date_trunc('month', _now);

  _kpi RECORD;
  _value numeric;
  _value_d numeric;
  _value_w numeric;
  _value_t numeric;
  _scaled numeric;
  _scaled_d numeric;
  _scaled_w numeric;
  _scaled_t numeric;
  _period text;

  _daily numeric := 0;
  _weekly numeric := 0;
  _monthly numeric := 0;
  _total numeric := 0;
  _active_minutes numeric := 0;
  _normalized numeric := 0;
  _breakdown jsonb := '{}'::jsonb;

  _inbound_d int; _outbound_d int; _talk_d numeric;
  _inbound_w int; _outbound_w int; _talk_w numeric;
  _inbound_m int; _outbound_m int; _talk_m numeric;
  _inbound_t int; _outbound_t int; _talk_t numeric;

  _sales_d numeric; _sales_w numeric; _sales_m numeric; _sales_t numeric;
  _sales_count_d int; _sales_count_w int; _sales_count_m int; _sales_count_t int;

  _new_cust_m int := 0;
  _deals_d int := 0; _deals_w int := 0; _deals_m int := 0; _deals_t int := 0;

  _prev_month_sales numeric;
  _growth numeric := 0;

  _is_log_scale boolean;

  _collected_amount numeric := 0;
  _issued_sales_for_blend numeric;
  _blended_sales_m numeric;
  _window_months int := 6;

  _is_sales boolean;
BEGIN
  _is_sales := public.has_role(_employee_id, 'sales'::public.app_role);

  -- Calls (apply to everyone)
  SELECT COALESCE(SUM(CASE WHEN direction='inbound' THEN 1 ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN direction='outbound' THEN 1 ELSE 0 END),0),
         COALESCE(SUM(duration_seconds)/60.0,0)
    INTO _inbound_d,_outbound_d,_talk_d
    FROM public.call_logs WHERE employee_id=_employee_id AND started_at>=_day_start;

  SELECT COALESCE(SUM(CASE WHEN direction='inbound' THEN 1 ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN direction='outbound' THEN 1 ELSE 0 END),0),
         COALESCE(SUM(duration_seconds)/60.0,0)
    INTO _inbound_w,_outbound_w,_talk_w
    FROM public.call_logs WHERE employee_id=_employee_id AND started_at>=_week_start;

  SELECT COALESCE(SUM(CASE WHEN direction='inbound' THEN 1 ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN direction='outbound' THEN 1 ELSE 0 END),0),
         COALESCE(SUM(duration_seconds)/60.0,0)
    INTO _inbound_m,_outbound_m,_talk_m
    FROM public.call_logs WHERE employee_id=_employee_id AND started_at>=_month_start;

  SELECT COALESCE(SUM(CASE WHEN direction='inbound' THEN 1 ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN direction='outbound' THEN 1 ELSE 0 END),0),
         COALESCE(SUM(duration_seconds)/60.0,0)
    INTO _inbound_t,_outbound_t,_talk_t
    FROM public.call_logs WHERE employee_id=_employee_id;

  -- Sales-derived KPIs only for users with 'sales' role
  IF _is_sales THEN
    SELECT
      COALESCE(SUM(CASE WHEN created_at>=_day_start   THEN COALESCE(total_amount,0) ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN created_at>=_week_start  THEN COALESCE(total_amount,0) ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN created_at>=_month_start THEN COALESCE(total_amount,0) ELSE 0 END),0),
      COALESCE(SUM(COALESCE(total_amount,0)),0),
      COALESCE(SUM(CASE WHEN created_at>=_day_start   THEN 1 ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN created_at>=_week_start  THEN 1 ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN created_at>=_month_start THEN 1 ELSE 0 END),0),
      COUNT(*)
      INTO _sales_d,_sales_w,_sales_m,_sales_t,
           _sales_count_d,_sales_count_w,_sales_count_m,_sales_count_t
      FROM public.invoices WHERE created_by=_employee_id;

    _deals_d := _sales_count_d;
    _deals_w := _sales_count_w;
    _deals_m := _sales_count_m;
    _deals_t := _sales_count_t;

    SELECT COALESCE(SUM(COALESCE(total_amount,0)),0)
      INTO _prev_month_sales
      FROM public.invoices
      WHERE created_by=_employee_id
        AND created_at>=_prev_month_start AND created_at<_prev_month_end;
    IF _prev_month_sales > 0 THEN
      _growth := ((_sales_m - _prev_month_sales)/_prev_month_sales)*100;
    END IF;

    SELECT COALESCE(SUM(capped),0) INTO _collected_amount
    FROM (
      SELECT LEAST(COALESCE(i.total_amount,0), COALESCE(SUM(prl.amount),0)) AS capped
      FROM public.invoices i
      JOIN public.payment_receipt_links prl ON prl.invoice_id = i.id
      JOIN public.payment_receipts pr       ON pr.id = prl.receipt_id
      WHERE i.created_by = _employee_id
        AND COALESCE(i.status,'') NOT IN ('draft','cancelled')
        AND pr.status IN ('approved','verified','confirmed','posted')
        AND pr.payment_date >= (_now - (_window_months || ' months')::interval)::date
      GROUP BY i.id, i.total_amount
    ) per_invoice;
  ELSE
    _sales_d := 0; _sales_w := 0; _sales_m := 0; _sales_t := 0;
    _sales_count_d := 0; _sales_count_w := 0; _sales_count_m := 0; _sales_count_t := 0;
    _deals_d := 0; _deals_w := 0; _deals_m := 0; _deals_t := 0;
    _prev_month_sales := 0; _growth := 0;
    _collected_amount := 0;
  END IF;

  -- new_customers KPI: only for sales role (responsibility-based, sales-context)
  IF _is_sales THEN
    SELECT COALESCE(COUNT(*),0) INTO _new_cust_m
      FROM public.customers
      WHERE responsible_id=_employee_id
        AND created_at >= _month_start;
  ELSE
    _new_cust_m := 0;
  END IF;

  _issued_sales_for_blend := _sales_m;
  _blended_sales_m := (0.8 * _collected_amount) + (0.2 * _issued_sales_for_blend);

  _active_minutes := GREATEST(_talk_m + (_deals_m * 3) + (_sales_count_m * 2), 1);

  FOR _kpi IN SELECT key, weight FROM public.gamification_kpis WHERE enabled=true LOOP
    _is_log_scale := _kpi.key IN ('total_sales','cumulative_sales');
    _period := 'monthly';

    CASE _kpi.key
      WHEN 'inbound_calls'         THEN _value:=_inbound_m;  _value_d:=_inbound_d;  _value_w:=_inbound_w;  _value_t:=_inbound_t;
      WHEN 'outbound_calls'        THEN _value:=_outbound_m; _value_d:=_outbound_d; _value_w:=_outbound_w; _value_t:=_outbound_t;
      WHEN 'talk_minutes'          THEN _value:=_talk_m;     _value_d:=_talk_d;     _value_w:=_talk_w;     _value_t:=_talk_t;
      WHEN 'total_sales'           THEN _value:=_blended_sales_m; _value_d:=_sales_d; _value_w:=_sales_w; _value_t:=_sales_t;
      WHEN 'new_customers'         THEN _value:=_new_cust_m; _value_d:=0;           _value_w:=0;           _value_t:=_new_cust_m;
      WHEN 'active_work_hours'     THEN _value:=_active_minutes/60.0; _value_d:=0; _value_w:=0; _value_t:=_value;
      WHEN 'deals_registered'      THEN _value:=_deals_m;    _value_d:=_deals_d;    _value_w:=_deals_w;    _value_t:=_deals_t;
      WHEN 'sales_per_talk_minute' THEN _value := CASE WHEN _talk_m>0 THEN _sales_m/_talk_m ELSE 0 END;
                                        _value_d := CASE WHEN _talk_d>0 THEN _sales_d/_talk_d ELSE 0 END;
                                        _value_w := CASE WHEN _talk_w>0 THEN _sales_w/_talk_w ELSE 0 END;
                                        _value_t := CASE WHEN _talk_t>0 THEN _sales_t/_talk_t ELSE 0 END;
      WHEN 'growth_vs_last_month'  THEN _value:=_growth; _value_d:=0; _value_w:=0; _value_t:=_growth;
      WHEN 'cumulative_sales'      THEN _value:=_sales_t; _value_d:=_sales_d; _value_w:=_sales_w; _value_t:=_sales_t; _period:='total';
      ELSE _value:=0; _value_d:=0; _value_w:=0; _value_t:=0;
    END CASE;

    IF _is_log_scale THEN
      _scaled   := ln(GREATEST(_value,0)   + 1);
      _scaled_d := ln(GREATEST(_value_d,0) + 1);
      _scaled_w := ln(GREATEST(_value_w,0) + 1);
      _scaled_t := ln(GREATEST(_value_t,0) + 1);
    ELSE
      _scaled   := _value;
      _scaled_d := _value_d;
      _scaled_w := _value_w;
      _scaled_t := _value_t;
    END IF;

    _daily   := _daily   + (_scaled_d * _kpi.weight);
    _weekly  := _weekly  + (_scaled_w * _kpi.weight);
    _monthly := _monthly + (_scaled   * _kpi.weight);
    _total   := _total   + (_scaled_t * _kpi.weight);

    _breakdown := _breakdown || jsonb_build_object(_kpi.key, jsonb_build_object(
      'value',        _value,
      'weight',       _kpi.weight,
      'contribution', _scaled * _kpi.weight,
      'period',       _period,
      'scaled',       _is_log_scale
    ));
  END LOOP;

  _breakdown := _breakdown || jsonb_build_object(
    'is_sales',               _is_sales,
    'collected_sales_amount', _collected_amount,
    'issued_sales_amount',    _issued_sales_for_blend,
    'collected_sales_score',  0.8 * _collected_amount,
    'issued_sales_score',     0.2 * _issued_sales_for_blend,
    'sales_score_source',     '80_collected_20_issued',
    'window_months',          _window_months
  );

  _normalized := CASE WHEN _active_minutes>0 THEN _monthly/_active_minutes ELSE 0 END;

  INSERT INTO public.employee_scores (
    employee_id, daily_score, weekly_score, monthly_score, total_score,
    normalized_score, active_work_minutes, breakdown, last_calculated_at
  ) VALUES (
    _employee_id, _daily, _weekly, _monthly, _total,
    _normalized, _active_minutes, _breakdown, _now
  )
  ON CONFLICT (employee_id) DO UPDATE SET
    daily_score=EXCLUDED.daily_score,
    weekly_score=EXCLUDED.weekly_score,
    monthly_score=EXCLUDED.monthly_score,
    total_score=EXCLUDED.total_score,
    normalized_score=EXCLUDED.normalized_score,
    active_work_minutes=EXCLUDED.active_work_minutes,
    breakdown=EXCLUDED.breakdown,
    last_calculated_at=EXCLUDED.last_calculated_at,
    updated_at=now();

  RETURN jsonb_build_object(
    'employee_id',       _employee_id,
    'daily_score',       _daily,
    'weekly_score',      _weekly,
    'monthly_score',     _monthly,
    'total_score',       _total,
    'normalized_score',  _normalized,
    'breakdown',         _breakdown
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_salesperson_collected_sales(p_employee_id uuid, p_window_months integer DEFAULT 6)
 RETURNS TABLE(employee_id uuid, window_months integer, window_start date, collected_amount numeric, linked_invoice_count integer, qualifying_receipt_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_window int;
  v_start date;
  v_is_priv boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF p_employee_id IS NULL THEN
    RAISE EXCEPTION 'p_employee_id is required' USING ERRCODE = '22023';
  END IF;

  v_is_priv := public.has_any_role(v_uid, ARRAY['admin','manager','accountant']::public.app_role[]);

  -- sales role: only own data; viewer or others: forbidden
  IF NOT v_is_priv THEN
    IF public.has_role(v_uid, 'sales'::public.app_role) THEN
      IF p_employee_id <> v_uid THEN
        RAISE EXCEPTION 'forbidden: sales may only query own collected sales' USING ERRCODE = '42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_window := GREATEST(1, LEAST(COALESCE(p_window_months, 6), 60));
  v_start := (now() - (v_window || ' months')::interval)::date;

  RETURN QUERY
  WITH eligible AS (
    SELECT
      i.id              AS invoice_id,
      i.total_amount    AS invoice_total,
      prl.id            AS link_id,
      prl.amount        AS link_amount,
      pr.id             AS receipt_id
    FROM public.invoices i
    JOIN public.payment_receipt_links prl ON prl.invoice_id = i.id
    JOIN public.payment_receipts pr       ON pr.id = prl.receipt_id
    WHERE i.created_by = p_employee_id
      AND COALESCE(i.status, '') NOT IN ('draft','cancelled')
      AND pr.status IN ('approved','verified','confirmed','posted')
      AND pr.payment_date >= v_start
  ),
  per_invoice AS (
    SELECT
      invoice_id,
      LEAST(COALESCE(invoice_total, 0), COALESCE(SUM(link_amount), 0)) AS capped_amount,
      COUNT(DISTINCT receipt_id) AS receipt_cnt
    FROM eligible
    GROUP BY invoice_id, invoice_total
  )
  SELECT
    p_employee_id,
    v_window,
    v_start,
    COALESCE(SUM(capped_amount), 0)::numeric        AS collected_amount,
    COALESCE(COUNT(*), 0)::int                      AS linked_invoice_count,
    COALESCE(SUM(receipt_cnt), 0)::int              AS qualifying_receipt_count
  FROM per_invoice;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.can_issue_customer_invoice(p_customer_id uuid)
 RETURNS TABLE(can_issue boolean, customer_id uuid, overdue_amount numeric, overdue_count integer, oldest_due_date date, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_amount numeric := 0;
  v_count  integer := 0;
  v_oldest date;
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'p_customer_id الزامی است' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(outstanding_amount),0)::numeric,
         COUNT(*)::int,
         MIN(due_date)
    INTO v_amount, v_count, v_oldest
  FROM public.vw_customer_receivables
  WHERE customer_id = p_customer_id
    AND is_overdue = true
    AND outstanding_amount > 0;

  IF v_count = 0 THEN
    RETURN QUERY SELECT true, p_customer_id, 0::numeric, 0, NULL::date, NULL::text;
  ELSE
    RETURN QUERY SELECT
      false,
      p_customer_id,
      v_amount,
      v_count,
      v_oldest,
      'این مشتری دارای مانده معوق است و تا زمان تسویه، امکان صدور فاکتور یا پیش‌فاکتور جدید ندارد.'::text;
  END IF;
END
$function$
;

CREATE OR REPLACE FUNCTION public.can_use_customer_capital_allocation(p_customer_id uuid, p_amount numeric)
 RETURNS TABLE(can_use boolean, available numeric, customer_allocation_id uuid, salesperson_allocation_id uuid, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _snap uuid;
  _cca record;
  _sca record;
  _c_avail numeric;
  _s_avail numeric;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'sales'::app_role,'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  SELECT id INTO _snap FROM public.daily_capital_snapshots WHERE is_active = true;
  IF _snap IS NULL THEN
    RETURN QUERY SELECT false, 0::numeric, NULL::uuid, NULL::uuid, 'هیچ snapshot سرمایه فعال وجود ندارد'::text;
    RETURN;
  END IF;

  SELECT * INTO _cca FROM public.customer_capital_allocations
   WHERE customer_id = p_customer_id AND capital_snapshot_id = _snap AND status = 'approved';
  IF _cca.id IS NULL THEN
    RETURN QUERY SELECT false, 0::numeric, NULL::uuid, NULL::uuid, 'مشتری در snapshot فعال تخصیص تأییدشده ندارد'::text;
    RETURN;
  END IF;

  SELECT * INTO _sca FROM public.salesperson_capital_allocations
   WHERE id = _cca.salesperson_allocation_id AND status = 'approved';
  IF _sca.id IS NULL THEN
    RETURN QUERY SELECT false, 0::numeric, _cca.id, NULL::uuid, 'فروشنده تخصیص تأییدشده ندارد'::text;
    RETURN;
  END IF;

  _c_avail := _cca.final_amount - _cca.held_amount - _cca.consumed_amount;
  _s_avail := _sca.final_amount - _sca.held_amount - _sca.consumed_amount;

  IF p_amount > _c_avail OR p_amount > _s_avail THEN
    RETURN QUERY SELECT false, LEAST(_c_avail,_s_avail), _cca.id, _sca.id,
      ('سهم سرمایه کافی نیست (مشتری: '||_c_avail||'، فروشنده: '||_s_avail||')')::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, LEAST(_c_avail,_s_avail), _cca.id, _sca.id, 'ok'::text;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_invoice(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_inv record;
  v_is_authorized boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  -- Role check: admin or accountant only
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_user AND role IN ('admin','accountant')
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'forbidden: only admin or accountant can cancel invoices' USING ERRCODE = '42501';
  END IF;

  -- Lock and load invoice
  SELECT id, customer_id, total_amount, status, type, invoice_type, created_by
    INTO v_inv
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_inv.status <> 'draft' THEN
    RAISE EXCEPTION 'only draft invoices can be canceled (current: %)', v_inv.status USING ERRCODE = '22023';
  END IF;

  -- Update status
  UPDATE public.invoices
     SET status = 'canceled', updated_at = now()
   WHERE id = p_invoice_id;

  -- Release credit when applicable (pre_invoice with credit hold)
  IF v_inv.invoice_type = 'pre_invoice' AND v_inv.customer_id IS NOT NULL AND COALESCE(v_inv.total_amount,0) > 0 THEN
    BEGIN
      PERFORM public.release_credit(
        p_customer_id := v_inv.customer_id,
        p_amount := v_inv.total_amount,
        p_invoice_id := v_inv.id,
        p_user_id := v_user
      );
    EXCEPTION WHEN OTHERS THEN
      -- Roll back the cancellation by raising; transaction will undo the UPDATE above.
      RAISE EXCEPTION 'release_credit failed: %', SQLERRM;
    END;
  END IF;

  -- Audit log
  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (
    v_user,
    'invoice',
    p_invoice_id,
    'invoice_canceled',
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'reason', 'manual_cancel',
      'canceled_by', v_user,
      'invoice_type', v_inv.invoice_type,
      'amount', v_inv.total_amount
    )
  );

  RETURN jsonb_build_object('ok', true, 'invoice_id', p_invoice_id, 'status', 'canceled');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.capture_score_snapshots()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _count integer;
BEGIN
  INSERT INTO public.score_snapshots (
    employee_id, daily_score, weekly_score, monthly_score,
    total_score, normalized_score, captured_at
  )
  SELECT employee_id, daily_score, weekly_score, monthly_score,
         total_score, normalized_score, now()
  FROM public.employee_scores;
  GET DIAGNOSTICS _count = ROW_COUNT;

  -- retention: 90 days
  DELETE FROM public.score_snapshots
   WHERE captured_at < now() - interval '90 days';

  RETURN _count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_and_unlock_achievements_for_employee(_employee_id uuid, _event_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ach record;
  current_count bigint;
  passes boolean;
  unlock_id uuid;
  unlocked_count int := 0;
  results jsonb := '[]'::jsonb;
BEGIN
  -- Guard: never let our own reward events recurse
  IF _event_type IS NULL OR _event_type = 'achievement_unlocked' THEN
    RETURN jsonb_build_object('unlocked', 0, 'skipped', 'self_event_or_null');
  END IF;

  -- Fast count of employee events for this event type
  SELECT count(*) INTO current_count
  FROM public.employee_score_events
  WHERE employee_id = _employee_id AND event_type = _event_type;

  FOR ach IN
    SELECT a.id, a.title_fa, a.condition_event_key, a.condition_operator,
           a.condition_value, a.xp_reward
    FROM public.achievements a
    WHERE a.enabled = true
      AND a.condition_event_key = _event_type
      AND a.condition_operator IS NOT NULL
      AND a.condition_value IS NOT NULL
      AND a.condition_value > 0
      -- skip if already unlocked for this employee
      AND NOT EXISTS (
        SELECT 1 FROM public.employee_achievements ea
        WHERE ea.employee_id = _employee_id AND ea.achievement_id = a.id
      )
  LOOP
    passes := CASE ach.condition_operator
      WHEN '>=' THEN current_count >= ach.condition_value
      WHEN '>'  THEN current_count >  ach.condition_value
      WHEN '='  THEN current_count =  ach.condition_value
      WHEN '<=' THEN current_count <= ach.condition_value
      WHEN '<'  THEN current_count <  ach.condition_value
      ELSE NULL
    END;

    IF passes IS NULL THEN
      RAISE WARNING 'Invalid operator % for achievement %', ach.condition_operator, ach.id;
      CONTINUE;
    END IF;

    IF passes THEN
      -- Insert unlock; unique(employee_id, achievement_id) guarantees idempotence
      BEGIN
        INSERT INTO public.employee_achievements
          (employee_id, achievement_id, unlocked_at, xp_awarded,
           source_event_type, source_event_count)
        VALUES
          (_employee_id, ach.id, now(), COALESCE(ach.xp_reward, 0),
           _event_type, current_count)
        RETURNING id INTO unlock_id;
      EXCEPTION WHEN unique_violation THEN
        CONTINUE;
      END;

      unlocked_count := unlocked_count + 1;

      -- Award XP and record a reward score event (event_type avoids loop)
      IF COALESCE(ach.xp_reward, 0) > 0 THEN
        PERFORM public.add_employee_xp(_employee_id, ach.xp_reward);
        INSERT INTO public.employee_score_events
          (employee_id, event_type, source_table, source_id, payload)
        VALUES
          (_employee_id, 'achievement_unlocked', 'employee_achievements',
           unlock_id::text,
           jsonb_build_object(
             'achievement_id', ach.id,
             'title_fa', ach.title_fa,
             'xp_awarded', ach.xp_reward
           ));
      END IF;

      -- Audit log (one entry per unlock)
      INSERT INTO public.audit_logs
        (actor_id, entity_type, entity_id, action, diff)
      VALUES
        (_employee_id, 'gamification_achievement', ach.id::text,
         'achievement_unlocked',
         jsonb_build_object(
           'employee_id', _employee_id,
           'achievement_id', ach.id,
           'title_fa', ach.title_fa,
           'condition_event_key', ach.condition_event_key,
           'condition_operator', ach.condition_operator,
           'condition_value', ach.condition_value,
           'current_value', current_count,
           'xp_awarded', COALESCE(ach.xp_reward, 0),
           'unlocked_at', now()
         ));

      results := results || jsonb_build_object(
        'achievement_id', ach.id,
        'title_fa', ach.title_fa,
        'xp_awarded', COALESCE(ach.xp_reward, 0),
        'current_value', current_count
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('unlocked', unlocked_count, 'items', results);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_and_update_mission_progress_for_employee(_employee_id uuid, _event_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  m record;
  ps timestamptz; pe timestamptz; pk text;
  current_count numeric;
  passes boolean;
  prev_completed boolean;
  prev_progress_id uuid;
  reward int;
  completed_count int := 0;
  results jsonb := '[]'::jsonb;
BEGIN
  IF _event_type IS NULL OR _event_type IN ('mission_completed', 'achievement_unlocked') THEN
    RETURN jsonb_build_object('completed', 0, 'items', results);
  END IF;

  FOR m IN
    SELECT * FROM public.missions
    WHERE enabled = true
      AND condition_event_key = _event_type
      AND condition_value IS NOT NULL
      AND condition_operator IN ('>=','>','=','<=','<')
  LOOP
    -- Inline period
    CASE m.mission_type
      WHEN 'daily' THEN
        ps := date_trunc('day', now()); pe := ps + interval '1 day';
        pk := 'd:' || to_char(ps, 'YYYY-MM-DD');
      WHEN 'weekly' THEN
        ps := date_trunc('week', now()); pe := ps + interval '1 week';
        pk := 'w:' || to_char(ps, 'IYYY-IW');
      WHEN 'monthly' THEN
        ps := date_trunc('month', now()); pe := ps + interval '1 month';
        pk := 'm:' || to_char(ps, 'YYYY-MM');
      WHEN 'custom' THEN
        ps := COALESCE(m.starts_at, m.created_at);
        pe := COALESCE(m.ends_at, ps + interval '100 years');
        pk := 'c:' || m.id::text;
      ELSE
        CONTINUE;
    END CASE;

    IF m.mission_type = 'custom' AND now() NOT BETWEEN ps AND pe THEN
      CONTINUE;
    END IF;

    SELECT COUNT(*)::numeric INTO current_count
    FROM public.employee_score_events e
    WHERE e.employee_id = _employee_id
      AND e.event_type = _event_type
      AND e.triggered_at >= ps
      AND e.triggered_at <  pe;

    passes := CASE m.condition_operator
      WHEN '>=' THEN current_count >= m.condition_value
      WHEN '>'  THEN current_count >  m.condition_value
      WHEN '='  THEN current_count =  m.condition_value
      WHEN '<=' THEN current_count <= m.condition_value
      WHEN '<'  THEN current_count <  m.condition_value
      ELSE false
    END;

    SELECT id, completed
      INTO prev_progress_id, prev_completed
    FROM public.employee_mission_progress
    WHERE employee_id = _employee_id
      AND mission_id  = m.id
      AND period_key  = pk
    LIMIT 1;

    IF prev_progress_id IS NULL THEN
      INSERT INTO public.employee_mission_progress (
        employee_id, mission_id, period_key, period_start, period_end,
        progress, current_value, target_value, completed, completed_at,
        xp_awarded, source_event_type
      ) VALUES (
        _employee_id, m.id, pk, ps, pe,
        current_count, current_count, m.condition_value,
        passes, CASE WHEN passes THEN now() ELSE NULL END,
        0, _event_type
      )
      RETURNING id INTO prev_progress_id;
      prev_completed := false;
    ELSE
      UPDATE public.employee_mission_progress
        SET progress = current_count,
            current_value = current_count,
            target_value = m.condition_value,
            period_start = ps,
            period_end   = pe,
            source_event_type = _event_type,
            completed = (completed OR passes),
            completed_at = COALESCE(completed_at, CASE WHEN passes THEN now() ELSE NULL END)
        WHERE id = prev_progress_id;
    END IF;

    IF passes AND NOT COALESCE(prev_completed, false) THEN
      reward := COALESCE(m.xp_reward, 0);
      IF reward > 0 THEN
        PERFORM public.add_employee_xp(_employee_id, reward);
        UPDATE public.employee_mission_progress
          SET xp_awarded = reward
          WHERE id = prev_progress_id;
        INSERT INTO public.employee_score_events (
          employee_id, event_type, source_table, source_id, payload
        ) VALUES (
          _employee_id, 'mission_completed', 'missions', m.id::text,
          jsonb_build_object(
            'mission_id', m.id,
            'title_fa', m.title_fa,
            'reward_xp', reward,
            'period_start', ps,
            'period_end', pe,
            'current_value', current_count,
            'target_value', m.condition_value
          )
        );
      END IF;

      INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      VALUES (
        _employee_id, 'gamification_mission', m.id::text, 'mission_completed',
        jsonb_build_object(
          'employee_id', _employee_id,
          'mission_id', m.id,
          'title_fa', m.title_fa,
          'mission_type', m.mission_type,
          'condition_event_key', m.condition_event_key,
          'condition_operator', m.condition_operator,
          'condition_value', m.condition_value,
          'current_value', current_count,
          'reward_xp', reward,
          'period_start', ps,
          'period_end', pe,
          'completed_at', now()
        )
      );

      completed_count := completed_count + 1;
      results := results || jsonb_build_object(
        'mission_id', m.id, 'title_fa', m.title_fa, 'reward_xp', reward
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('completed', completed_count, 'items', results);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_price_alerts_for_product(p_product_id uuid, p_sale_price_type_id uuid, p_current_price numeric, p_previous_price numeric DEFAULT NULL::numeric, p_change_percent numeric DEFAULT NULL::numeric)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_triggered integer := 0;
  v_match boolean;
  v_product_name text;
  v_spt_name text;
  v_title text;
  v_message text;
  v_usd_rate numeric;
  v_current_usd numeric;
  v_cooldown interval := interval '6 hours';
BEGIN
  IF p_current_price IS NULL OR p_product_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT name INTO v_product_name FROM products WHERE id = p_product_id;
  IF p_sale_price_type_id IS NOT NULL THEN
    SELECT name INTO v_spt_name FROM sale_price_types WHERE id = p_sale_price_type_id;
  END IF;

  v_usd_rate := public._par_latest_usd_rate();
  IF v_usd_rate IS NOT NULL AND v_usd_rate > 0 THEN
    v_current_usd := p_current_price / v_usd_rate;
  END IF;

  FOR r IN
    SELECT * FROM price_alert_rules
    WHERE product_id = p_product_id
      AND is_active = true
      AND (sale_price_type_id IS NULL OR sale_price_type_id = p_sale_price_type_id)
  LOOP
    v_match := false;

    -- Cooldown for repeatable
    IF r.is_repeatable = true AND r.last_triggered_at IS NOT NULL
       AND r.last_triggered_at > now() - v_cooldown THEN
      CONTINUE;
    END IF;

    -- Evaluate operator
    IF r.operator = 'below_price' AND r.target_value IS NOT NULL THEN
      v_match := p_current_price < r.target_value;
    ELSIF r.operator = 'above_price' AND r.target_value IS NOT NULL THEN
      v_match := p_current_price > r.target_value;
    ELSIF r.operator = 'increase_percent' AND r.target_value IS NOT NULL
          AND p_change_percent IS NOT NULL THEN
      v_match := p_change_percent >= r.target_value;
    ELSIF r.operator = 'decrease_percent' AND r.target_value IS NOT NULL
          AND p_change_percent IS NOT NULL THEN
      v_match := p_change_percent <= -1 * r.target_value;
    ELSIF r.operator = 'below_usd_price' AND r.target_value IS NOT NULL
          AND v_current_usd IS NOT NULL THEN
      v_match := v_current_usd < r.target_value;
    ELSIF r.operator = 'above_usd_price' AND r.target_value IS NOT NULL
          AND v_current_usd IS NOT NULL THEN
      v_match := v_current_usd > r.target_value;
    ELSIF r.operator = 'stock_status_changed' THEN
      -- Stock change is handled by separate path; skip in price-trigger context
      v_match := false;
    END IF;

    IF v_match THEN
      v_title := COALESCE(v_product_name, 'محصول');
      v_message := CASE r.operator
        WHEN 'below_price' THEN format('قیمت %s کمتر از %s تومان شد.', COALESCE(v_product_name,''), to_char(r.target_value,'FM999G999G999G999'))
        WHEN 'above_price' THEN format('قیمت %s بیشتر از %s تومان شد.', COALESCE(v_product_name,''), to_char(r.target_value,'FM999G999G999G999'))
        WHEN 'increase_percent' THEN format('قیمت %s نسبت به آپدیت قبلی %s%% افزایش یافت.', COALESCE(v_product_name,''), to_char(p_change_percent,'FM990D0'))
        WHEN 'decrease_percent' THEN format('قیمت %s نسبت به آپدیت قبلی %s%% کاهش یافت.', COALESCE(v_product_name,''), to_char(abs(p_change_percent),'FM990D0'))
        WHEN 'below_usd_price' THEN format('قیمت دلاری %s کمتر از %s دلار شد.', COALESCE(v_product_name,''), to_char(r.target_value,'FM999G999G999'))
        WHEN 'above_usd_price' THEN format('قیمت دلاری %s بیشتر از %s دلار شد.', COALESCE(v_product_name,''), to_char(r.target_value,'FM999G999G999'))
        ELSE format('شرط هشدار قیمت %s برقرار شد.', COALESCE(v_product_name,''))
      END;

      INSERT INTO price_alert_notifications(
        user_id, alert_rule_id, product_id, sale_price_type_id,
        title, message, current_price, previous_price, change_percent
      ) VALUES (
        r.user_id, r.id, p_product_id, p_sale_price_type_id,
        v_title, v_message, p_current_price, p_previous_price, p_change_percent
      );

      INSERT INTO notification_events(event_type, user_id, channel, payload, status)
      VALUES (
        'price_alert_triggered', r.user_id, 'internal',
        jsonb_build_object(
          'alert_rule_id', r.id,
          'product_id', p_product_id,
          'sale_price_type_id', p_sale_price_type_id,
          'operator', r.operator,
          'target_value', r.target_value,
          'current_price', p_current_price,
          'previous_price', p_previous_price,
          'change_percent', p_change_percent,
          'title', v_title,
          'message', v_message
        ),
        'pending'
      );

      UPDATE price_alert_rules
      SET last_triggered_at = now(),
          triggered_count = triggered_count + 1,
          is_active = CASE WHEN is_repeatable THEN is_active ELSE false END
      WHERE id = r.id;

      v_triggered := v_triggered + 1;
    END IF;
  END LOOP;

  RETURN v_triggered;
END;$function$
;

CREATE OR REPLACE FUNCTION public.claim_next_quote_send_queue_item()
 RETURNS sales_quote_send_queue
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row public.sales_quote_send_queue;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::app_role[]) THEN
    RAISE EXCEPTION 'دسترسی لازم را ندارید.' USING ERRCODE = '42501';
  END IF;

  WITH next_item AS (
    SELECT id
    FROM public.sales_quote_send_queue
    WHERE status = 'pending'
      AND scheduled_at <= now()
      AND attempts < max_attempts
    ORDER BY scheduled_at ASC, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.sales_quote_send_queue q
  SET status = 'processing',
      locked_at = now(),
      attempts = q.attempts + 1,
      updated_at = now()
  FROM next_item
  WHERE q.id = next_item.id
  RETURNING q.* INTO _row;

  RETURN _row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_pricing_recompute_jobs(_batch_size integer DEFAULT 25, _max_attempts integer DEFAULT 3)
 RETURNS SETOF pricing_recompute_queue
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _batch_size IS NULL OR _batch_size < 1 THEN
    _batch_size := 25;
  END IF;
  IF _batch_size > 100 THEN
    _batch_size := 100;
  END IF;

  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM public.pricing_recompute_queue
    WHERE status = 'pending'
      AND attempts < _max_attempts
    ORDER BY priority ASC, enqueued_at ASC
    LIMIT _batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.pricing_recompute_queue q
  SET status = 'processing',
      started_at = now(),
      attempts = q.attempts + 1
  FROM picked
  WHERE q.id = picked.id
  RETURNING q.*;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_stale_auto_suppliers()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  removed_count integer := 0;
BEGIN
  WITH candidates AS (
    SELECT ps.id, ps.product_id, ps.supplier_id, p.brand_id
    FROM public.product_suppliers ps
    JOIN public.products p ON p.id = ps.product_id
    WHERE ps.auto_added = true
  ),
  last_product_purchase AS (
    SELECT c.id,
           MAX(pp.effective_at) AS last_at
    FROM candidates c
    LEFT JOIN public.purchase_prices pp
      ON pp.product_id = c.product_id
     AND pp.supplier_id = c.supplier_id
    GROUP BY c.id
  ),
  to_remove AS (
    SELECT c.id
    FROM candidates c
    JOIN last_product_purchase lpp ON lpp.id = c.id
    WHERE (lpp.last_at IS NULL OR lpp.last_at < now() - INTERVAL '100 days')
      AND NOT EXISTS (
        SELECT 1
        FROM public.purchase_prices pp2
        JOIN public.products p2 ON p2.id = pp2.product_id
        WHERE pp2.supplier_id = c.supplier_id
          AND p2.brand_id IS NOT DISTINCT FROM c.brand_id
          AND pp2.effective_at >= now() - INTERVAL '100 days'
      )
  )
  DELETE FROM public.product_suppliers ps
  USING to_remove tr
  WHERE ps.id = tr.id;

  GET DIAGNOSTICS removed_count = ROW_COUNT;
  RETURN removed_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_invoice_task(p_task_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_task record;
BEGIN
  IF NOT public.has_any_role(v_user, ARRAY['admin','accountant']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id;
  IF v_task.id IS NULL THEN RAISE EXCEPTION 'task not found'; END IF;

  UPDATE public.tasks
    SET status = 'done', completed_at = now(), updated_at = now()
    WHERE id = p_task_id;

  IF v_task.reference_type = 'invoice' AND v_task.reference_id IS NOT NULL THEN
    UPDATE public.invoices
      SET status = 'final', updated_at = now()
      WHERE id = v_task.reference_id AND status = 'pending_accountant';

    INSERT INTO public.audit_logs(entity_type, entity_id, action, actor_id, diff)
    VALUES ('invoice', v_task.reference_id::text, 'task_completed_invoice', v_user,
            jsonb_build_object('task_id', p_task_id));
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_quote_send_queue_item(p_queue_id uuid, p_success boolean, p_error text DEFAULT NULL::text)
 RETURNS sales_quote_send_queue
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row public.sales_quote_send_queue;
  _action text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::app_role[]) THEN
    RAISE EXCEPTION 'دسترسی لازم را ندارید.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row FROM public.sales_quote_send_queue WHERE id = p_queue_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'رکورد یافت نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF p_success THEN
    UPDATE public.sales_quote_send_queue
    SET status = 'sent',
        processed_at = now(),
        last_error = NULL,
        locked_at = NULL,
        updated_at = now()
    WHERE id = p_queue_id
    RETURNING * INTO _row;
    _action := 'sales_quote_send_queue_sent';
  ELSE
    IF _row.attempts >= _row.max_attempts THEN
      UPDATE public.sales_quote_send_queue
      SET status = 'failed',
          processed_at = now(),
          last_error = p_error,
          locked_at = NULL,
          updated_at = now()
      WHERE id = p_queue_id
      RETURNING * INTO _row;
      _action := 'sales_quote_send_queue_failed';
    ELSE
      UPDATE public.sales_quote_send_queue
      SET status = 'pending',
          locked_at = NULL,
          last_error = p_error,
          scheduled_at = now() + interval '2 minutes',
          updated_at = now()
      WHERE id = p_queue_id
      RETURNING * INTO _row;
      _action := 'sales_quote_send_queue_retry_scheduled';
    END IF;
  END IF;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_uid, 'sales_quote_send_queue', _row.id::text, _action,
    jsonb_build_object(
      'quote_id', _row.quote_id,
      'attempts', _row.attempts,
      'max_attempts', _row.max_attempts,
      'status', _row.status,
      'last_error', _row.last_error,
      'scheduled_at', _row.scheduled_at,
      'processed_at', _row.processed_at
    ));

  RETURN _row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.compute_customer_capital_allocations(p_salesperson_allocation_id uuid)
 RETURNS TABLE(salesperson_allocation_id uuid, capital_snapshot_id uuid, capital_date date, salesperson_id uuid, salesperson_final_amount numeric, customer_id uuid, customer_score numeric, total_customer_score numeric, system_suggested_amount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_alloc record;
  v_total numeric;
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT s.id, s.capital_snapshot_id, s.capital_date, s.salesperson_id, s.final_amount
    INTO v_alloc
  FROM public.salesperson_capital_allocations s
  WHERE s.id = p_salesperson_allocation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'salesperson_allocation not found' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(COALESCE(ccp.credit_score,0)), 0) INTO v_total
  FROM public.customers c
  LEFT JOIN public.customer_credit_profile ccp
    ON ccp.customer_id = c.id AND ccp.is_active = true
  WHERE c.responsible_id = v_alloc.salesperson_id
    AND c.is_active = true;

  RETURN QUERY
  SELECT
    v_alloc.id,
    v_alloc.capital_snapshot_id,
    v_alloc.capital_date,
    v_alloc.salesperson_id,
    v_alloc.final_amount,
    c.id,
    COALESCE(ccp.credit_score, 0)::numeric,
    v_total,
    CASE
      WHEN v_total > 0 AND COALESCE(ccp.credit_score,0) > 0
        THEN ROUND(v_alloc.final_amount * COALESCE(ccp.credit_score,0)::numeric / v_total)
      ELSE 0
    END
  FROM public.customers c
  LEFT JOIN public.customer_credit_profile ccp
    ON ccp.customer_id = c.id AND ccp.is_active = true
  WHERE c.responsible_id = v_alloc.salesperson_id
    AND c.is_active = true
  ORDER BY COALESCE(ccp.credit_score,0) DESC, c.id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.compute_daily_capital(p_capital_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(capital_date date, formula_version text, system_suggested_capital numeric, total_receivables numeric, overdue_receivables numeric, due_today_receivables numeric, future_receivables numeric, total_payables numeric, overdue_payables numeric, due_today_payables numeric, future_payables numeric, input_id uuid, bank_balance numeric, cash_balance numeric, incoming_checks numeric, outgoing_checks numeric, external_receivables numeric, external_payables numeric, near_term_expenses numeric, risk_reserve numeric, blocked_funds numeric, inventory_liquidity_value numeric, manual_adjustment numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  i public.daily_capital_inputs%ROWTYPE;
  v_total_r numeric; v_over_r numeric; v_today_r numeric; v_future_r numeric;
  v_total_p numeric; v_over_p numeric; v_today_p numeric; v_future_p numeric;
  v_suggested numeric;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_capital_date IS NULL THEN
    p_capital_date := CURRENT_DATE;
  END IF;

  SELECT * INTO i FROM public.daily_capital_inputs WHERE capital_date = p_capital_date;

  -- Receivables relative to p_capital_date (SECURITY DEFINER bypasses view grants).
  SELECT
    COALESCE(SUM(outstanding_amount), 0),
    COALESCE(SUM(outstanding_amount) FILTER (WHERE due_date <  p_capital_date), 0),
    COALESCE(SUM(outstanding_amount) FILTER (WHERE due_date =  p_capital_date), 0),
    COALESCE(SUM(outstanding_amount) FILTER (WHERE due_date >  p_capital_date), 0)
  INTO v_total_r, v_over_r, v_today_r, v_future_r
  FROM public.vw_customer_receivables;

  -- Payables relative to p_capital_date (only unpaid).
  SELECT
    COALESCE(SUM(outstanding_amount), 0),
    COALESCE(SUM(outstanding_amount) FILTER (WHERE due_date <  p_capital_date), 0),
    COALESCE(SUM(outstanding_amount) FILTER (WHERE due_date =  p_capital_date), 0),
    COALESCE(SUM(outstanding_amount) FILTER (WHERE due_date >  p_capital_date), 0)
  INTO v_total_p, v_over_p, v_today_p, v_future_p
  FROM public.vw_supplier_payables
  WHERE is_paid = false;

  v_suggested :=
      COALESCE(i.bank_balance,0)
    + COALESCE(i.cash_balance,0)
    + COALESCE(i.incoming_checks,0)
    + COALESCE(v_today_r,0)
    + COALESCE(i.external_receivables,0)
    + COALESCE(i.inventory_liquidity_value,0)
    + COALESCE(i.manual_adjustment,0)
    - COALESCE(v_today_p,0)
    - COALESCE(i.outgoing_checks,0)
    - COALESCE(i.external_payables,0)
    - COALESCE(i.near_term_expenses,0)
    - COALESCE(i.risk_reserve,0)
    - COALESCE(i.blocked_funds,0);

  IF v_suggested < 0 THEN v_suggested := 0; END IF;

  capital_date              := p_capital_date;
  formula_version           := 'v1';
  system_suggested_capital  := v_suggested;
  total_receivables         := v_total_r;
  overdue_receivables       := v_over_r;
  due_today_receivables     := v_today_r;
  future_receivables        := v_future_r;
  total_payables            := v_total_p;
  overdue_payables          := v_over_p;
  due_today_payables        := v_today_p;
  future_payables           := v_future_p;
  input_id                  := i.id;
  bank_balance              := COALESCE(i.bank_balance,0);
  cash_balance              := COALESCE(i.cash_balance,0);
  incoming_checks           := COALESCE(i.incoming_checks,0);
  outgoing_checks           := COALESCE(i.outgoing_checks,0);
  external_receivables      := COALESCE(i.external_receivables,0);
  external_payables         := COALESCE(i.external_payables,0);
  near_term_expenses        := COALESCE(i.near_term_expenses,0);
  risk_reserve              := COALESCE(i.risk_reserve,0);
  blocked_funds             := COALESCE(i.blocked_funds,0);
  inventory_liquidity_value := COALESCE(i.inventory_liquidity_value,0);
  manual_adjustment         := COALESCE(i.manual_adjustment,0);

  RETURN NEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.compute_promotion_scores(_channel_id uuid DEFAULT NULL::uuid, _min_score numeric DEFAULT 0, _limit integer DEFAULT 200)
 RETURNS SETOF v_promotion_suggestions
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT *
  FROM public.v_promotion_suggestions
  WHERE score > 0
    AND (_channel_id IS NULL OR channel_id = _channel_id)
    AND score >= COALESCE(_min_score, 0)
    AND (daily_quota IS NULL OR daily_quota = 0 OR used_today < daily_quota)
  ORDER BY score DESC
  LIMIT GREATEST(COALESCE(_limit, 200), 1);
$function$
;

CREATE OR REPLACE FUNCTION public.compute_salesperson_capital_allocations(p_capital_snapshot_id uuid)
 RETURNS TABLE(capital_snapshot_id uuid, capital_date date, daily_final_capital numeric, salesperson_id uuid, score numeric, total_score numeric, system_suggested_amount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_snap public.daily_capital_snapshots%ROWTYPE;
  v_total numeric;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::public.app_role[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_snap FROM public.daily_capital_snapshots WHERE id = p_capital_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'daily capital snapshot not found' USING ERRCODE = '22023';
  END IF;

  -- Sum of monthly scores across users with 'sales' role
  SELECT COALESCE(SUM(es.monthly_score), 0)
    INTO v_total
  FROM public.employee_scores es
  JOIN public.user_roles ur ON ur.user_id = es.employee_id AND ur.role = 'sales'::public.app_role;

  RETURN QUERY
  SELECT
    v_snap.id,
    v_snap.capital_date,
    v_snap.final_capital,
    es.employee_id AS salesperson_id,
    es.monthly_score AS score,
    v_total AS total_score,
    CASE
      WHEN v_total > 0 THEN ROUND(v_snap.final_capital * (es.monthly_score / v_total))
      ELSE 0
    END AS system_suggested_amount
  FROM public.employee_scores es
  JOIN public.user_roles ur ON ur.user_id = es.employee_id AND ur.role = 'sales'::public.app_role
  ORDER BY es.monthly_score DESC NULLS LAST;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.consume_capital_allocation(p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _cca_id uuid; _sca_id uuid;
  _c_held numeric; _s_held numeric;
  _c_consumed numeric; _s_consumed numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'مبلغ باید بزرگتر از صفر باشد'; END IF;
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  SELECT allocation_id INTO _cca_id FROM public.capital_allocation_ledger
   WHERE allocation_kind='customer' AND reference_type='invoice' AND reference_id=p_invoice_id AND transaction_type='hold'
   ORDER BY created_at DESC LIMIT 1;
  SELECT allocation_id INTO _sca_id FROM public.capital_allocation_ledger
   WHERE allocation_kind='salesperson' AND reference_type='invoice' AND reference_id=p_invoice_id AND transaction_type='hold'
   ORDER BY created_at DESC LIMIT 1;
  IF _cca_id IS NULL OR _sca_id IS NULL THEN RAISE EXCEPTION 'hold قبلی برای این فاکتور یافت نشد'; END IF;

  SELECT held_amount, consumed_amount INTO _c_held, _c_consumed FROM public.customer_capital_allocations WHERE id=_cca_id FOR UPDATE;
  SELECT held_amount, consumed_amount INTO _s_held, _s_consumed FROM public.salesperson_capital_allocations WHERE id=_sca_id FOR UPDATE;
  IF p_amount > _c_held OR p_amount > _s_held THEN RAISE EXCEPTION 'مقدار consume بیش از held است'; END IF;

  UPDATE public.customer_capital_allocations SET held_amount = held_amount - p_amount, consumed_amount = consumed_amount + p_amount, updated_at=now() WHERE id=_cca_id;
  INSERT INTO public.capital_allocation_ledger(allocation_kind, allocation_id, transaction_type, amount, held_before, held_after, consumed_before, consumed_after, reference_type, reference_id, actor_id)
  VALUES ('customer', _cca_id, 'consume', p_amount, _c_held, _c_held - p_amount, _c_consumed, _c_consumed + p_amount, 'invoice', p_invoice_id, COALESCE(p_user_id, auth.uid()));

  UPDATE public.salesperson_capital_allocations SET held_amount = held_amount - p_amount, consumed_amount = consumed_amount + p_amount, updated_at=now() WHERE id=_sca_id;
  INSERT INTO public.capital_allocation_ledger(allocation_kind, allocation_id, transaction_type, amount, held_before, held_after, consumed_before, consumed_after, reference_type, reference_id, actor_id)
  VALUES ('salesperson', _sca_id, 'consume', p_amount, _s_held, _s_held - p_amount, _s_consumed, _s_consumed + p_amount, 'invoice', p_invoice_id, COALESCE(p_user_id, auth.uid()));

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff)
  VALUES (COALESCE(p_user_id, auth.uid()),'capital_allocation_consume','invoice',p_invoice_id::text,
          jsonb_build_object('amount', p_amount));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cosine_distance(halfvec, halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_cosine_distance$function$
;

CREATE OR REPLACE FUNCTION public.cosine_distance(sparsevec, sparsevec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_cosine_distance$function$
;

CREATE OR REPLACE FUNCTION public.cosine_distance(vector, vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$cosine_distance$function$
;

CREATE OR REPLACE FUNCTION public.create_bot_api_key(p_name text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(id uuid, raw_key text, key_prefix text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
  _raw text;
  _prefix text;
  _hash text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_name IS NULL OR length(btrim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name_required';
  END IF;

  _raw := 'bk_' || encode(extensions.gen_random_bytes(20), 'hex');
  _prefix := substring(_raw FROM 1 FOR 10);
  _hash := encode(extensions.digest(_raw, 'sha256'), 'hex');

  INSERT INTO public.bot_api_keys (name, key_hash, key_prefix, is_active, created_by, expires_at)
  VALUES (btrim(p_name), _hash, _prefix, true, _uid, p_expires_at)
  RETURNING bot_api_keys.id INTO _id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_uid, 'bot_api_keys', _id::text, 'bot_api_key_created',
          jsonb_build_object('name', btrim(p_name), 'expires_at', p_expires_at, 'key_prefix', _prefix));

  RETURN QUERY SELECT _id, _raw, _prefix;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_custom_role(_name text, _display_name text DEFAULT NULL::text, _description text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE new_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'permission denied'; END IF;
  IF _name IS NULL OR length(_name) < 2 OR length(_name) > 50 THEN RAISE EXCEPTION 'invalid role name length'; END IF;
  IF _name !~ '^[a-z_][a-z0-9_]*$' THEN RAISE EXCEPTION 'role name must be lowercase letters/digits/underscores'; END IF;

  INSERT INTO public.custom_roles (name, display_name, description, is_system, is_active, created_by)
  VALUES (_name, COALESCE(_display_name, _name), _description, false, true, auth.uid())
  RETURNING id INTO new_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'role', new_id::text, 'role_created', jsonb_build_object('name', _name, 'display_name', _display_name));
  RETURN new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_delivery_receipt(p_type text, p_storage_path text, p_file_name text, p_file_size bigint, p_mime_type text, p_invoice_id uuid DEFAULT NULL::uuid, p_customer_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_receipt_id uuid;
  v_timer_minutes int;
  v_reviewer uuid;
  v_deadline timestamptz;
begin
  if not (
    public.has_role(auth.uid(), 'manager') or
    public.has_role(auth.uid(), 'admin') or
    public.has_role(auth.uid(), 'sales')
  ) then
    raise exception 'دسترسی ندارید';
  end if;

  if p_type not in ('shipping_receipt','delivery_receipt') then
    raise exception 'نوع رسید نامعتبر است';
  end if;

  select timer_minutes into v_timer_minutes
  from public.workflow_settings
  where process_key = p_type and is_active = true;

  v_timer_minutes := coalesce(v_timer_minutes, 180);
  v_deadline := now() + (v_timer_minutes || ' minutes')::interval;

  insert into public.delivery_receipts (
    type, storage_path, file_name, file_size, mime_type,
    invoice_id, customer_id, uploaded_by, notes, review_deadline
  ) values (
    p_type, p_storage_path, p_file_name, p_file_size, p_mime_type,
    p_invoice_id, p_customer_id, auth.uid(), p_notes, v_deadline
  )
  returning id into v_receipt_id;

  insert into public.delivery_receipt_status_history
    (receipt_id, from_status, to_status, changed_by, note)
  values
    (v_receipt_id, null, 'pending_review', auth.uid(), 'رسید آپلود شد');

  select p.id into v_reviewer
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.id
  where p.is_active = true and ur.role = 'sales'
  order by p.created_at asc
  limit 1;

  if v_reviewer is not null then
    insert into public.notification_events
      (event_type, user_id, channel, payload, status)
    values (
      'delivery_receipt_pending',
      v_reviewer,
      'in_app',
      jsonb_build_object(
        'title', 'رسید جدید در انتظار تأیید',
        'body', 'یک رسید جدید برای تأیید آپلود شده است.',
        'reference_type', 'delivery_receipt',
        'reference_id', v_receipt_id,
        'deadline', v_deadline
      ),
      'pending'
    );
  end if;

  insert into public.audit_logs
    (entity_type, entity_id, action, actor_id, diff)
  values (
    'delivery_receipt', v_receipt_id::text, 'created',
    auth.uid(),
    jsonb_build_object('type', p_type, 'file_name', p_file_name)
  );

  return v_receipt_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_document(p_type text, p_storage_path text, p_file_name text, p_file_size bigint, p_mime_type text, p_reference_id uuid DEFAULT NULL::uuid, p_reference_type text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_doc_id uuid;
  v_reviewer uuid;
begin
  if not (
    public.has_role(auth.uid(),'accountant') or
    public.has_role(auth.uid(),'admin') or
    public.has_role(auth.uid(),'manager')
  ) then
    raise exception 'فقط حسابدار یا مدیر می‌تواند سند آپلود کند';
  end if;

  insert into public.documents (
    type, storage_path, file_name, file_size, mime_type,
    reference_id, reference_type, uploaded_by, notes
  ) values (
    p_type, p_storage_path, p_file_name, p_file_size, p_mime_type,
    p_reference_id, p_reference_type, auth.uid(), p_notes
  ) returning id into v_doc_id;

  insert into public.document_status_history(document_id, from_status, to_status, changed_by, note)
  values (v_doc_id, null, 'pending_review', auth.uid(), 'سند آپلود شد');

  select p.id into v_reviewer
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.id
  where coalesce(p.is_active, true) = true
    and ur.role = 'manager'
  order by p.created_at asc
  limit 1;

  if v_reviewer is not null then
    insert into public.notification_events(event_type, user_id, channel, payload, status)
    values (
      'document_pending_review', v_reviewer, 'in_app',
      jsonb_build_object(
        'title','سند جدید در انتظار تأیید',
        'body','یک ' || p_type || ' جدید برای تأیید آپلود شده است.',
        'reference_type','document',
        'reference_id', v_doc_id,
        'deadline', (now() + interval '10 minutes')
      ),
      'pending'
    );
  end if;

  insert into public.audit_logs(entity_type, entity_id, action, actor_id, diff)
  values ('document', v_doc_id::text, 'created', auth.uid(),
          jsonb_build_object('type', p_type, 'file_name', p_file_name));

  return v_doc_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_dynamic_table_row(p_table_id uuid, p_values jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row_id uuid;
  _row_num bigint;
  _col record;
  _val text;
  _v_num numeric;
  _v_bool boolean;
  _v_date date;
  _v_dt timestamptz;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::app_role[]) THEN
    RAISE EXCEPTION 'دسترسی لازم را ندارید.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dynamic_tables WHERE id = p_table_id AND is_active = true) THEN
    RAISE EXCEPTION 'جدول یافت نشد یا غیرفعال است.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.dynamic_table_row_counters(table_id, last_value, updated_at)
  VALUES (p_table_id, 1, now())
  ON CONFLICT (table_id) DO UPDATE
    SET last_value = public.dynamic_table_row_counters.last_value + 1,
        updated_at = now()
  RETURNING last_value INTO _row_num;

  INSERT INTO public.dynamic_table_rows(table_id, row_number)
  VALUES (p_table_id, _row_num)
  RETURNING id INTO _row_id;

  FOR _col IN
    SELECT * FROM public.dynamic_table_columns WHERE table_id = p_table_id
  LOOP
    _val := NULLIF(btrim(COALESCE(p_values->>_col.column_key, '')), '');
    IF _val IS NULL THEN
      IF _col.is_required THEN
        RAISE EXCEPTION 'مقدار ستون % الزامی است.', _col.label USING ERRCODE = '22023';
      END IF;
      CONTINUE;
    END IF;

    _v_num := NULL; _v_bool := NULL; _v_date := NULL; _v_dt := NULL;

    BEGIN
      IF _col.data_type = 'number' THEN
        _v_num := _val::numeric;
      ELSIF _col.data_type = 'boolean' THEN
        _v_bool := (_val ILIKE 'true' OR _val = '1' OR _val ILIKE 'yes');
      ELSIF _col.data_type = 'date' THEN
        _v_date := _val::date;
      ELSIF _col.data_type = 'datetime' THEN
        _v_dt := _val::timestamptz;
      END IF;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'مقدار نامعتبر برای ستون %', _col.label USING ERRCODE = '22023';
    END;

    INSERT INTO public.dynamic_table_cells(
      table_id, row_id, column_id,
      value_text, value_number, value_boolean, value_date, value_datetime
    ) VALUES (
      p_table_id, _row_id, _col.id,
      CASE WHEN _col.data_type IN ('number','boolean','date','datetime') THEN NULL ELSE _val END,
      _v_num, _v_bool, _v_date, _v_dt
    );
  END LOOP;

  RETURN _row_id;
END; $function$
;

CREATE OR REPLACE FUNCTION public.create_inquiry(p_group_id uuid, p_product_id uuid, p_assigned_to uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_msg_id uuid;
BEGIN
  IF NOT public.is_messenger_group_member(p_group_id, auth.uid()) THEN
    RAISE EXCEPTION 'شما عضو این گروه نیستید.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id AND COALESCE(is_active,true) = true) THEN
    RAISE EXCEPTION 'محصول انتخاب‌شده در کاتالوگ وجود ندارد یا غیرفعال است.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.inquiries 
    WHERE product_id = p_product_id AND group_id = p_group_id
    AND status IN ('pending','warning_5min','danger_8min','critical_10min','transfer_available','transferred')) THEN
    RAISE EXCEPTION 'برای این محصول در این گروه یک استعلام باز وجود دارد.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.inquiry_price_cache 
    WHERE product_id = p_product_id AND valid_until > now()) THEN
    RAISE EXCEPTION 'این محصول قیمت معتبر دارد، لطفاً استعلام ثبت نکنید.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.messenger_group_members 
    WHERE group_id = p_group_id AND user_id = p_assigned_to AND role = 'purchaser') THEN
    RAISE EXCEPTION 'مسئول خرید انتخاب‌شده در این گروه دارای نقش خریدار نیست.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.messenger_messages(group_id, sender_id, content, type)
  VALUES (p_group_id, auth.uid(), '', 'inquiry')
  RETURNING id INTO v_msg_id;

  INSERT INTO public.inquiries(product_id, group_id, requested_by, assigned_to, status, message_id)
  VALUES (p_product_id, p_group_id, auth.uid(), p_assigned_to, 'pending', v_msg_id)
  RETURNING id INTO v_id;

  INSERT INTO public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by)
  VALUES (v_id, NULL, 'pending', auth.uid());

  RETURN v_id;
END; $function$
;

CREATE OR REPLACE FUNCTION public.create_messenger_group(p_name text, p_type text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_group_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_type NOT IN ('private','group','operational') THEN
    RAISE EXCEPTION 'INVALID_TYPE' USING ERRCODE = '22023';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) < 1 OR length(trim(p_name)) > 120 THEN
    RAISE EXCEPTION 'INVALID_NAME' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.messenger_groups(name, type, created_by)
  VALUES (trim(p_name), p_type, v_uid)
  RETURNING id INTO v_group_id;

  INSERT INTO public.messenger_group_members(group_id, user_id, role)
  VALUES (v_group_id, v_uid, 'admin');

  RETURN v_group_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_purchase_request(p_product_id uuid, p_quantity numeric, p_unit text, p_inquiry_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_expected_price numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request_id uuid;
  v_assigned_to uuid;
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'احراز هویت لازم است';
  end if;

  if not (
    public.has_role(v_caller, 'sales') or
    public.has_role(v_caller, 'manager') or
    public.has_role(v_caller, 'admin')
  ) then
    raise exception 'دسترسی برای ثبت درخواست خرید ندارید';
  end if;

  select p.id into v_assigned_to
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.id
  where p.is_active = true and ur.role = 'manager'
  order by p.created_at asc
  limit 1;

  insert into public.purchase_requests (
    product_id, quantity, unit, inquiry_id,
    requested_by, assigned_to, notes, expected_price
  ) values (
    p_product_id, p_quantity, coalesce(p_unit, 'عدد'), p_inquiry_id,
    v_caller, v_assigned_to, p_notes, p_expected_price
  )
  returning id into v_request_id;

  insert into public.purchase_request_status_history
    (request_id, from_status, to_status, changed_by, note)
  values
    (v_request_id, null, 'pending', v_caller, 'درخواست ایجاد شد');

  if v_assigned_to is not null then
    insert into public.notification_events
      (event_type, user_id, channel, payload, status)
    values (
      'purchase_request_new', v_assigned_to, 'in_app',
      jsonb_build_object(
        'title','درخواست خرید جدید',
        'body','یک درخواست خرید جدید برای بررسی ثبت شده است.',
        'reference_type','purchase_request',
        'reference_id', v_request_id
      ),
      'pending'
    );
  end if;

  insert into public.audit_logs
    (entity_type, entity_id, action, actor_id, diff)
  values (
    'purchase_request', v_request_id::text, 'created',
    v_caller,
    jsonb_build_object('product_id', p_product_id, 'quantity', p_quantity)
  );

  return v_request_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_sales_quote_with_items(p_customer_name text, p_customer_phone text, p_customer_note text, p_expires_at timestamp with time zone, p_subtotal_amount numeric, p_discount_amount numeric, p_final_amount numeric, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _quote_id uuid;
  _quote_number text;
  _item jsonb;
  _items_count int := 0;
  _sum_subtotal numeric := 0;
  _sum_discount numeric := 0;
  _sum_final numeric := 0;
  _src_product int := 0;
  _src_quick int := 0;
  _src_manual int := 0;
  _qty numeric;
  _price numeric;
  _disc numeric;
  _line numeric;
  _src text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_any_role(_uid, ARRAY['admin','manager','sales']::app_role[]) THEN
    RAISE EXCEPTION 'دسترسی لازم برای ایجاد پیش‌فاکتور را ندارید.' USING ERRCODE = '42501';
  END IF;

  IF p_customer_name IS NULL OR btrim(p_customer_name) = '' THEN
    RAISE EXCEPTION 'نام مشتری الزامی است.' USING ERRCODE = '22023';
  END IF;
  IF p_customer_phone IS NULL OR btrim(p_customer_phone) = '' THEN
    RAISE EXCEPTION 'شماره تماس مشتری الزامی است.' USING ERRCODE = '22023';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'پیش‌فاکتور باید حداقل یک آیتم داشته باشد.' USING ERRCODE = '22023';
  END IF;

  -- Validate items + compute sums
  FOR _item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    _qty := COALESCE((_item->>'quantity')::numeric, 0);
    _price := COALESCE((_item->>'unit_price')::numeric, 0);
    _disc := COALESCE((_item->>'discount_amount')::numeric, 0);
    _line := COALESCE((_item->>'line_total')::numeric, 0);
    _src := _item->>'source';

    IF _qty <= 0 THEN
      RAISE EXCEPTION 'تعداد آیتم باید بزرگ‌تر از صفر باشد.' USING ERRCODE = '22023';
    END IF;
    IF _price <= 0 THEN
      RAISE EXCEPTION 'قیمت واحد آیتم باید بزرگ‌تر از صفر باشد.' USING ERRCODE = '22023';
    END IF;
    IF _disc < 0 THEN
      RAISE EXCEPTION 'تخفیف نمی‌تواند منفی باشد.' USING ERRCODE = '22023';
    END IF;
    IF _line < 0 THEN
      RAISE EXCEPTION 'جمع آیتم نمی‌تواند منفی باشد.' USING ERRCODE = '22023';
    END IF;
    IF _disc > _qty * _price THEN
      RAISE EXCEPTION 'تخفیف نمی‌تواند بیشتر از مبلغ آیتم باشد.' USING ERRCODE = '22023';
    END IF;
    IF _src NOT IN ('product_price','quick_price','manual') THEN
      RAISE EXCEPTION 'منبع آیتم نامعتبر است: %', COALESCE(_src,'(null)') USING ERRCODE = '22023';
    END IF;

    _items_count := _items_count + 1;
    _sum_subtotal := _sum_subtotal + (_qty * _price);
    _sum_discount := _sum_discount + _disc;
    _sum_final := _sum_final + _line;

    IF _src = 'product_price' THEN _src_product := _src_product + 1;
    ELSIF _src = 'quick_price' THEN _src_quick := _src_quick + 1;
    ELSE _src_manual := _src_manual + 1;
    END IF;
  END LOOP;

  -- Compare with provided totals (1 toman tolerance)
  IF abs(COALESCE(p_subtotal_amount,0) - _sum_subtotal) > 1
     OR abs(COALESCE(p_discount_amount,0) - _sum_discount) > 1
     OR abs(COALESCE(p_final_amount,0) - _sum_final) > 1 THEN
    RAISE EXCEPTION 'مجموع مبالغ ارسالی با مجموع آیتم‌ها همخوانی ندارد.' USING ERRCODE = '22023';
  END IF;

  -- Insert quote (trigger assigns quote_number + salesperson_id)
  INSERT INTO public.sales_quotes (
    customer_name, customer_phone, customer_note, expires_at,
    subtotal_amount, discount_amount, final_amount,
    salesperson_id, quote_number
  ) VALUES (
    btrim(p_customer_name), btrim(p_customer_phone),
    NULLIF(btrim(COALESCE(p_customer_note,'')),''),
    p_expires_at,
    _sum_subtotal, _sum_discount, _sum_final,
    _uid, ''
  )
  RETURNING id, quote_number INTO _quote_id, _quote_number;

  -- Insert items
  INSERT INTO public.sales_quote_items (
    quote_id, product_id, free_item_name, sku_snapshot, title_snapshot,
    sale_price_type_id, quantity, unit_price, discount_amount, line_total, source
  )
  SELECT
    _quote_id,
    NULLIF(elem->>'product_id','')::uuid,
    NULLIF(elem->>'free_item_name',''),
    NULLIF(elem->>'sku_snapshot',''),
    NULLIF(elem->>'title_snapshot',''),
    NULLIF(elem->>'sale_price_type_id','')::uuid,
    (elem->>'quantity')::numeric,
    (elem->>'unit_price')::numeric,
    COALESCE((elem->>'discount_amount')::numeric, 0),
    (elem->>'line_total')::numeric,
    (elem->>'source')::sales_quote_item_source
  FROM jsonb_array_elements(p_items) AS elem;

  -- Supplemental audit
  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_uid, 'sales_quotes', _quote_id::text, 'sales_quote_items_added',
    jsonb_build_object(
      'quote_id', _quote_id,
      'item_count', _items_count,
      'subtotal_from_items', round(_sum_subtotal),
      'discount_from_items', round(_sum_discount),
      'final_from_items', round(_sum_final),
      'sources_count', jsonb_build_object(
        'product_price', _src_product,
        'quick_price', _src_quick,
        'manual', _src_manual
      )
    ));

  RETURN jsonb_build_object('id', _quote_id, 'quote_number', _quote_number);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_waybill_for_invoice(p_invoice_id uuid, p_sender_name text, p_sender_phone text, p_receiver_name text, p_receiver_phone text, p_shipping_company text, p_destination_city text, p_customer_accounting_code text DEFAULT NULL::text, p_destination_address text DEFAULT NULL::text, p_shipping_notes text DEFAULT NULL::text, p_register boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_seq int;
  v_number text;
  v_waybill_id uuid;
  v_existing uuid;
  v_status text;
BEGIN
  IF NOT public.has_any_role(v_user, ARRAY['admin','manager','sales']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.invoices WHERE id = p_invoice_id) THEN
    RAISE EXCEPTION 'invoice not found';
  END IF;

  SELECT id INTO v_existing FROM public.waybills
    WHERE invoice_id = p_invoice_id AND status <> 'canceled' LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'a waybill already exists for this invoice';
  END IF;

  -- Get next sequence for today
  INSERT INTO public.waybill_number_counter(day, last_value)
    VALUES (v_today, 1)
    ON CONFLICT (day) DO UPDATE SET last_value = waybill_number_counter.last_value + 1
    RETURNING last_value INTO v_seq;

  v_number := 'WB-' || to_char(v_today, 'YYYYMMDD') || '-' || lpad(v_seq::text, 3, '0');
  v_status := CASE WHEN p_register THEN 'registered' ELSE 'draft' END;

  INSERT INTO public.waybills (
    invoice_id, waybill_number, sender_name, sender_phone,
    receiver_name, receiver_phone, customer_accounting_code,
    shipping_company, destination_city, destination_address,
    shipping_notes, status, created_by
  ) VALUES (
    p_invoice_id, v_number,
    btrim(p_sender_name), btrim(p_sender_phone),
    btrim(p_receiver_name), btrim(p_receiver_phone),
    NULLIF(btrim(p_customer_accounting_code), ''),
    btrim(p_shipping_company), btrim(p_destination_city),
    NULLIF(btrim(p_destination_address), ''),
    NULLIF(btrim(p_shipping_notes), ''),
    v_status, v_user
  )
  RETURNING id INTO v_waybill_id;

  -- Copy all invoice items
  INSERT INTO public.waybill_items (waybill_id, invoice_item_id, product_id, quantity)
  SELECT v_waybill_id, ii.id, ii.product_id, ii.quantity
  FROM public.invoice_items ii
  WHERE ii.invoice_id = p_invoice_id;

  INSERT INTO public.audit_logs(entity_type, entity_id, action, actor_id, diff)
  VALUES ('waybill', v_waybill_id::text, 'waybill_created', v_user,
          jsonb_build_object('invoice_id', p_invoice_id, 'waybill_number', v_number, 'status', v_status));

  RETURN v_waybill_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_waybills_batch(p_invoice_id uuid, p_waybills jsonb, p_register boolean DEFAULT false)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_seq int;
  v_number text;
  v_status text;
  v_waybill_id uuid;
  v_ids uuid[] := '{}';
  v_w jsonb;
  v_item jsonb;
  v_existing uuid;
  v_total_qty numeric;
  v_invoice_qty numeric;
  v_rec record;
BEGIN
  IF NOT public.has_any_role(v_user, ARRAY['admin','manager','sales']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.invoices WHERE id = p_invoice_id) THEN
    RAISE EXCEPTION 'invoice not found';
  END IF;

  SELECT id INTO v_existing FROM public.waybills
    WHERE invoice_id = p_invoice_id AND status <> 'canceled' LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'a waybill already exists for this invoice';
  END IF;

  IF jsonb_typeof(p_waybills) <> 'array' OR jsonb_array_length(p_waybills) = 0 THEN
    RAISE EXCEPTION 'no waybills provided';
  END IF;

  FOR v_rec IN
    SELECT (it->>'invoice_item_id')::uuid AS invoice_item_id,
           SUM((it->>'quantity')::numeric) AS total_qty
    FROM jsonb_array_elements(p_waybills) w
    CROSS JOIN LATERAL jsonb_array_elements(w->'items') it
    GROUP BY (it->>'invoice_item_id')::uuid
  LOOP
    SELECT quantity INTO v_invoice_qty FROM public.invoice_items
      WHERE id = v_rec.invoice_item_id AND invoice_id = p_invoice_id;
    IF v_invoice_qty IS NULL THEN
      RAISE EXCEPTION 'invoice item % not found in invoice', v_rec.invoice_item_id;
    END IF;
    IF v_rec.total_qty <> v_invoice_qty THEN
      RAISE EXCEPTION 'sum of split quantity (%) does not match invoice item quantity (%) for item %',
        v_rec.total_qty, v_invoice_qty, v_rec.invoice_item_id;
    END IF;
  END LOOP;

  v_status := CASE WHEN p_register THEN 'registered' ELSE 'draft' END;

  FOR v_w IN SELECT * FROM jsonb_array_elements(p_waybills) LOOP
    INSERT INTO public.waybill_number_counter(day, last_value)
      VALUES (v_today, 1)
      ON CONFLICT (day) DO UPDATE SET last_value = waybill_number_counter.last_value + 1
      RETURNING last_value INTO v_seq;

    v_number := 'WB-' || to_char(v_today, 'YYYYMMDD') || '-' || lpad(v_seq::text, 3, '0');

    INSERT INTO public.waybills (
      invoice_id, waybill_number, sender_name, sender_phone,
      receiver_name, receiver_phone, customer_accounting_code,
      shipping_company, destination_city, destination_address,
      shipping_notes, status, created_by, custom_data
    ) VALUES (
      p_invoice_id, v_number,
      btrim(v_w->>'sender_name'), btrim(v_w->>'sender_phone'),
      btrim(v_w->>'receiver_name'), btrim(v_w->>'receiver_phone'),
      NULLIF(btrim(coalesce(v_w->>'customer_accounting_code','')), ''),
      btrim(v_w->>'shipping_company'), btrim(v_w->>'destination_city'),
      NULLIF(btrim(coalesce(v_w->>'destination_address','')), ''),
      NULLIF(btrim(coalesce(v_w->>'shipping_notes','')), ''),
      v_status, v_user,
      coalesce(v_w->'custom_data', '{}'::jsonb)
    )
    RETURNING id INTO v_waybill_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_w->'items') LOOP
      v_total_qty := (v_item->>'quantity')::numeric;
      IF v_total_qty IS NULL OR v_total_qty <= 0 THEN CONTINUE; END IF;
      INSERT INTO public.waybill_items (waybill_id, invoice_item_id, product_id, quantity)
      VALUES (
        v_waybill_id,
        (v_item->>'invoice_item_id')::uuid,
        (v_item->>'product_id')::uuid,
        v_total_qty
      );
    END LOOP;

    v_ids := array_append(v_ids, v_waybill_id);
  END LOOP;

  INSERT INTO public.audit_logs(entity_type, entity_id, action, actor_id, diff)
  VALUES ('waybill', p_invoice_id::text, 'waybill_batch_created', v_user,
          jsonb_build_object('invoice_id', p_invoice_id, 'waybill_ids', to_jsonb(v_ids), 'count', array_length(v_ids,1)));

  RETURN v_ids;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.currencies_normalize_code()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.code := lower(trim(NEW.code));
  NEW.updated_at := now();
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.customer_clear_person(p_customer_id uuid, p_note text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_person_id uuid;
  v_updated       int;
  v_closed        int;
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'شناسه مشتری الزامی است' USING ERRCODE = '22023';
  END IF;

  SELECT person_id INTO v_old_person_id
  FROM public.customers
  WHERE id = p_customer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'مشتری یافت نشد یا دسترسی به آن ندارید' USING ERRCODE = 'P0002';
  END IF;

  IF v_old_person_id IS NULL THEN
    -- No-op; nothing to clear.
    RETURN false;
  END IF;

  -- Close active customer context link(s) for this customer.
  UPDATE public.person_context_links
     SET ended_at = now(),
         note     = COALESCE(p_note, note)
   WHERE context_kind = 'customer'
     AND ref_table    = 'customers'
     AND ref_id       = p_customer_id
     AND ended_at IS NULL;
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  -- Clear the FK on customers.
  UPDATE public.customers
     SET person_id = NULL
   WHERE id = p_customer_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'دسترسی لازم برای ویرایش این مشتری را ندارید' USING ERRCODE = '42501';
  END IF;

  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.customer_set_person(p_customer_id uuid, p_person_id uuid, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_person_id uuid;
  v_existing_link uuid;
  v_new_link      uuid;
  v_updated       int;
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'شناسه مشتری الزامی است' USING ERRCODE = '22023';
  END IF;
  IF p_person_id IS NULL THEN
    RAISE EXCEPTION 'شناسه شخص الزامی است' USING ERRCODE = '22023';
  END IF;

  -- Visibility check via persons RLS (SELECT). Invisible/missing → safe message.
  PERFORM 1 FROM public.persons WHERE id = p_person_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'شخص مرتبط یافت نشد یا دسترسی به آن ندارید' USING ERRCODE = 'P0002';
  END IF;

  -- Read current person_id via customers RLS. Missing/invisible → safe message.
  SELECT person_id INTO v_old_person_id
  FROM public.customers
  WHERE id = p_customer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'مشتری یافت نشد یا دسترسی به آن ندارید' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent path: same person already linked and an active context link exists.
  IF v_old_person_id IS NOT NULL AND v_old_person_id = p_person_id THEN
    SELECT id INTO v_existing_link
    FROM public.person_context_links
    WHERE person_id    = p_person_id
      AND context_kind = 'customer'
      AND ref_table    = 'customers'
      AND ref_id       = p_customer_id
      AND ended_at IS NULL
    LIMIT 1;

    IF v_existing_link IS NOT NULL THEN
      IF p_note IS NOT NULL THEN
        UPDATE public.person_context_links
           SET note = p_note
         WHERE id = v_existing_link;
      END IF;
      RETURN v_existing_link;
    END IF;
    -- No active link though person_id matches — fall through to create one.
  END IF;

  -- Close active link(s) for this customer regardless of which person they point to,
  -- so the (customer ↔ active person) invariant is maintained.
  UPDATE public.person_context_links
     SET ended_at = now()
   WHERE context_kind = 'customer'
     AND ref_table    = 'customers'
     AND ref_id       = p_customer_id
     AND ended_at IS NULL;

  -- Update customers.person_id (RLS enforced here).
  UPDATE public.customers
     SET person_id = p_person_id
   WHERE id = p_customer_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'دسترسی لازم برای ویرایش این مشتری را ندارید' USING ERRCODE = '42501';
  END IF;

  -- Open a fresh active context link.
  INSERT INTO public.person_context_links(
    person_id, context_kind, ref_table, ref_id, note, started_at, created_by
  )
  VALUES (
    p_person_id, 'customer', 'customers', p_customer_id, p_note, now(), auth.uid()
  )
  RETURNING id INTO v_new_link;

  RETURN v_new_link;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.daily_mood_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_action text;
  v_diff jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'daily_mood_created';
    v_diff := jsonb_build_object(
      'mood_key', NEW.mood_key,
      'wants_follow_up', NEW.wants_follow_up,
      'mood_date', NEW.mood_date
    );
    INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
    VALUES (v_actor, 'daily_mood_entries', NEW.id::text, v_action, v_diff);
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
    VALUES (
      v_actor, 'daily_mood_entries', NEW.id::text,
      CASE WHEN NEW.status = 'archived' THEN 'daily_mood_archived' ELSE 'daily_mood_status_changed' END,
      jsonb_build_object(
        'target_user_id', NEW.user_id,
        'previous_status', OLD.status,
        'new_status', NEW.status
      )
    );
  END IF;

  IF NEW.manager_note IS DISTINCT FROM OLD.manager_note THEN
    INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
    VALUES (
      v_actor, 'daily_mood_entries', NEW.id::text, 'daily_mood_manager_note_updated',
      jsonb_build_object('target_user_id', NEW.user_id, 'changed_fields', ARRAY['manager_note'])
    );
  END IF;

  IF v_actor = NEW.user_id AND (
    NEW.mood_key IS DISTINCT FROM OLD.mood_key OR
    NEW.reasons IS DISTINCT FROM OLD.reasons OR
    NEW.answers IS DISTINCT FROM OLD.answers OR
    NEW.free_text IS DISTINCT FROM OLD.free_text OR
    NEW.wants_follow_up IS DISTINCT FROM OLD.wants_follow_up
  ) THEN
    INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
    VALUES (
      v_actor, 'daily_mood_entries', NEW.id::text, 'daily_mood_updated',
      jsonb_build_object('mood_key', NEW.mood_key)
    );
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.daily_mood_validate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.free_text IS NOT NULL AND length(NEW.free_text) > 2000 THEN
    RAISE EXCEPTION 'free_text too long';
  END IF;
  IF NEW.manager_note IS NOT NULL AND length(NEW.manager_note) > 2000 THEN
    RAISE EXCEPTION 'manager_note too long';
  END IF;
  IF NEW.wants_follow_up NOT IN ('no','later','seen','important') THEN
    RAISE EXCEPTION 'invalid wants_follow_up';
  END IF;
  IF NEW.status NOT IN ('new','seen','follow_up_needed','in_review','resolved','archived') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.deactivate_user(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  UPDATE public.profiles
  SET status = 'inactive', is_active = false, updated_at = now()
  WHERE id = _user_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'user', _user_id::text, 'user_deactivated', '{}'::jsonb);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_bot_api_key_table_access(p_key_id uuid, p_table_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  DELETE FROM public.bot_api_key_table_access
  WHERE api_key_id = p_key_id AND table_id = p_table_id;

  UPDATE public.bot_api_keys k
  SET allowed_table_ids = COALESCE((
    SELECT array_agg(DISTINCT a.table_id)
    FROM public.bot_api_key_table_access a
    WHERE a.api_key_id = k.id
  ), '{}'::uuid[])
  WHERE k.id = p_key_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_uid, 'bot_api_keys', p_key_id::text, 'bot_api_key_access_removed',
          jsonb_build_object('table_id', p_table_id));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.dyn_table_role_can_view(_user_id uuid, _access_level text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _allowed jsonb;
BEGIN
  -- Admin / manager always see everything
  IF public.has_any_role(_user_id, ARRAY['admin','manager']::app_role[]) THEN
    RETURN true;
  END IF;

  IF _access_level = 'all' THEN RETURN true; END IF;
  IF _access_level = 'manager_only' THEN RETURN false; END IF; -- handled above
  IF _access_level = 'admin_only' THEN RETURN false; END IF;
  IF _access_level = 'finance_only' THEN
    RETURN public.has_role(_user_id, 'accountant'::app_role);
  END IF;
  IF _access_level = 'sales_only' THEN
    RETURN public.has_role(_user_id, 'sales'::app_role);
  END IF;

  -- 'custom' is row-specific so this overload returns false; the row-aware
  -- overload below handles that case via allowed_roles.
  RETURN false;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.dyn_table_role_can_view(_user_id uuid, _access_level text, _allowed_roles jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _role_text text;
BEGIN
  IF _access_level <> 'custom' THEN
    RETURN public.dyn_table_role_can_view(_user_id, _access_level);
  END IF;

  -- Custom: admin/manager always pass
  IF public.has_any_role(_user_id, ARRAY['admin','manager']::app_role[]) THEN
    RETURN true;
  END IF;

  IF _allowed_roles IS NULL OR jsonb_typeof(_allowed_roles) <> 'array' THEN
    RETURN false;
  END IF;

  -- Iterate the allowed_roles array; match against app_role enum
  FOR _role_text IN SELECT jsonb_array_elements_text(_allowed_roles) LOOP
    BEGIN
      IF public.has_role(_user_id, _role_text::app_role) THEN
        RETURN true;
      END IF;
    EXCEPTION WHEN invalid_text_representation THEN
      -- ignore unknown role names
      NULL;
    END;
  END LOOP;

  RETURN false;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.dyn_tables_log_access_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.access_level IS DISTINCT FROM OLD.access_level) THEN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, diff)
    VALUES (
      auth.uid(),
      'dynamic_table_access_changed',
      'dynamic_tables',
      NEW.id::text,
      jsonb_build_object(
        'old_access_level', OLD.access_level,
        'new_access_level', NEW.access_level
      )
    );
  END IF;

  IF (NEW.allowed_roles IS DISTINCT FROM OLD.allowed_roles) THEN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, diff)
    VALUES (
      auth.uid(),
      'dynamic_table_role_assignment',
      'dynamic_tables',
      NEW.id::text,
      jsonb_build_object(
        'old_allowed_roles', OLD.allowed_roles,
        'new_allowed_roles', NEW.allowed_roles
      )
    );
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.dynamic_rows_stamp_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF tg_op = 'INSERT' THEN
    new.created_by := COALESCE(new.created_by, auth.uid());
  END IF;
  RETURN new;
END; $function$
;

CREATE OR REPLACE FUNCTION public.dynamic_tables_stamp_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF tg_op = 'INSERT' THEN
    new.created_by := COALESCE(new.created_by, auth.uid());
    new.owner_id := COALESCE(new.owner_id, auth.uid());
  END IF;
  RETURN new;
END; $function$
;

CREATE OR REPLACE FUNCTION public.enforce_no_overdue_on_commitment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_check_required boolean := false;
  v_can boolean;
  v_amount numeric;
  v_count integer;
  v_oldest date;
  v_reason text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.commitment_confirmed,false) = true
       OR COALESCE(NEW.invoice_type,'') = 'pre_invoice' THEN
      v_check_required := true;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF COALESCE(NEW.commitment_confirmed,false) = true
       AND COALESCE(OLD.commitment_confirmed,false) = false THEN
      v_check_required := true;
    END IF;
  END IF;

  IF NOT v_check_required THEN
    RETURN NEW;
  END IF;

  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT can_issue, overdue_amount, overdue_count, oldest_due_date, reason
    INTO v_can, v_amount, v_count, v_oldest, v_reason
  FROM public.can_issue_customer_invoice(NEW.customer_id);

  IF v_can = false THEN
    -- توجه: هرگونه INSERT به audit_logs اینجا با همین RAISE rollback می‌شود.
    -- بنابراین audit ثبت بلاک باید سمت UI / فاز جدا با مکانیزم non-transactional انجام شود.
    RAISE EXCEPTION '%', v_reason USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_pricing_recompute(_product_ids uuid[], _reason text, _source_table text DEFAULT NULL::text, _source_id uuid DEFAULT NULL::uuid, _sale_price_type_id uuid DEFAULT NULL::uuid, _priority integer DEFAULT 100)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inserted_count integer := 0;
BEGIN
  IF _product_ids IS NULL OR array_length(_product_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.pricing_recompute_queue (
    product_id, reason, source_table, source_id, sale_price_type_id, priority, status
  )
  SELECT DISTINCT pid, _reason, _source_table, _source_id, _sale_price_type_id, _priority, 'pending'
  FROM unnest(_product_ids) AS pid
  WHERE pid IS NOT NULL
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.expire_pending_delivery_receipts()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rec record;
  v_penalty_enabled boolean;
begin
  for v_rec in
    select dr.id, dr.uploaded_by, dr.type
    from public.delivery_receipts dr
    where dr.status = 'pending_review'
    and dr.review_deadline < now()
    for update
  loop
    update public.delivery_receipts
    set status = 'expired', updated_at = now()
    where id = v_rec.id;

    insert into public.delivery_receipt_status_history
      (receipt_id, from_status, to_status, changed_by, note)
    values
      (v_rec.id, 'pending_review', 'expired', null,
       'منقضی شد — تأییدکننده در مهلت مقرر پاسخ نداد');

    select penalty_enabled into v_penalty_enabled
    from public.workflow_settings
    where process_key = v_rec.type and is_active = true;

    if coalesce(v_penalty_enabled, true) then
      perform public.auto_submit_penalty(
        null,
        v_rec.uploaded_by,
        'no_confirm_store',
        'low',
        'عدم آپلود رسید ' || v_rec.type || ' در مهلت مقرر'
      );
    end if;

    insert into public.notification_events
      (event_type, user_id, channel, payload, status)
    values (
      'delivery_receipt_expired',
      v_rec.uploaded_by,
      'in_app',
      jsonb_build_object(
        'title', 'رسید منقضی شد',
        'body', 'مهلت آپلود رسید به پایان رسید.',
        'reference_type', 'delivery_receipt',
        'reference_id', v_rec.id
      ),
      'pending'
    );
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.expire_pending_documents()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_doc record;
  v_manager uuid;
begin
  for v_doc in
    select id, uploaded_by
    from public.documents
    where status = 'pending_review' and review_deadline < now()
    for update
  loop
    update public.documents set status = 'expired', updated_at = now() where id = v_doc.id;

    insert into public.document_status_history(document_id, from_status, to_status, changed_by, note)
    values (v_doc.id, 'pending_review', 'expired', null,
            'منقضی شد — مسئول فروشگاه در ۱۰ دقیقه پاسخ نداد');

    select p.id into v_manager
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id
    where coalesce(p.is_active, true) = true and ur.role = 'manager'
    order by p.created_at asc limit 1;

    if v_manager is not null then
      perform public.auto_submit_penalty(
        null, v_manager, 'no_confirm_store', 'low',
        'عدم تأیید سند ' || v_doc.id::text || ' در مهلت ۱۰ دقیقه'
      );
    end if;

    insert into public.notification_events(event_type, user_id, channel, payload, status)
    values (
      'document_expired', v_doc.uploaded_by, 'in_app',
      jsonb_build_object(
        'title','سند منقضی شد',
        'body','مسئول فروشگاه در مهلت مقرر پاسخ نداد.',
        'reference_type','document',
        'reference_id', v_doc.id
      ),
      'pending'
    );
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.export_dynamic_table_rows(p_table_id uuid, p_filters jsonb DEFAULT '[]'::jsonb, p_search text DEFAULT NULL::text, p_show_inactive boolean DEFAULT false, p_limit integer DEFAULT 5000)
 RETURNS TABLE(total_count bigint, exported_count bigint, out_row_id uuid, out_row_number bigint, out_is_active boolean, out_created_at timestamp with time zone, out_values jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _filter jsonb;
  _col_id uuid;
  _col_type text;
  _op text;
  _val text;
  _val2 text;
  _search_like text;
  _search_num numeric;
  _limit int;
  _total bigint := 0;
  _exported bigint := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  _limit := GREATEST(1, LEAST(COALESCE(p_limit, 5000), 5000));

  CREATE TEMP TABLE IF NOT EXISTS _x_rows (
    row_id uuid,
    row_number bigint,
    is_active boolean,
    created_at timestamptz
  ) ON COMMIT DROP;
  TRUNCATE _x_rows;

  INSERT INTO _x_rows (row_id, row_number, is_active, created_at)
  SELECT r.id, r.row_number, r.is_active, r.created_at
  FROM public.dynamic_table_rows r
  WHERE r.table_id = p_table_id
    AND (p_show_inactive OR r.is_active = true);

  IF p_search IS NOT NULL AND length(btrim(p_search)) > 0 THEN
    _search_like := '%' || btrim(p_search) || '%';
    BEGIN _search_num := btrim(p_search)::numeric; EXCEPTION WHEN others THEN _search_num := NULL; END;

    DELETE FROM _x_rows q
    WHERE NOT (
      (_search_num IS NOT NULL AND q.row_number = _search_num::bigint)
      OR EXISTS (
        SELECT 1
        FROM public.dynamic_table_cells c
        JOIN public.dynamic_table_columns col ON col.id = c.column_id
        WHERE c.row_id = q.row_id
          AND c.table_id = p_table_id
          AND col.data_type::text IN ('text','phone','tag','status')
          AND c.value_text ILIKE _search_like
      )
    );
  END IF;

  IF p_filters IS NOT NULL AND jsonb_typeof(p_filters) = 'array' THEN
    FOR _filter IN SELECT * FROM jsonb_array_elements(p_filters) LOOP
      _col_id := NULLIF(_filter->>'column_id','')::uuid;
      _op := lower(COALESCE(_filter->>'op',''));
      _val := _filter->>'value';
      _val2 := _filter->>'value2';

      IF _col_id IS NULL OR _op = '' THEN CONTINUE; END IF;

      SELECT col.data_type::text INTO _col_type
      FROM public.dynamic_table_columns col
      WHERE col.id = _col_id AND col.table_id = p_table_id;
      IF _col_type IS NULL THEN CONTINUE; END IF;

      IF _col_type = 'boolean' THEN
        IF _op = 'empty' THEN
          DELETE FROM _x_rows q WHERE EXISTS (
            SELECT 1 FROM public.dynamic_table_cells c
            WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_boolean IS NOT NULL
          );
        ELSIF _op IN ('true','false','equals') THEN
          DELETE FROM _x_rows q WHERE NOT EXISTS (
            SELECT 1 FROM public.dynamic_table_cells c
            WHERE c.row_id = q.row_id AND c.column_id = _col_id
              AND c.value_boolean = (CASE WHEN _op = 'true' OR _val = 'true' THEN true ELSE false END)
          );
        END IF;

      ELSIF _col_type = 'number' THEN
        IF _val IS NULL OR _val = '' THEN CONTINUE; END IF;
        DECLARE _n numeric;
        BEGIN
          BEGIN _n := _val::numeric; EXCEPTION WHEN others THEN CONTINUE; END;
          IF _op = 'equals' OR _op = 'eq' THEN
            DELETE FROM _x_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_number = _n);
          ELSIF _op IN ('greater_than','gt') THEN
            DELETE FROM _x_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_number > _n);
          ELSIF _op IN ('less_than','lt') THEN
            DELETE FROM _x_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_number < _n);
          END IF;
        END;

      ELSIF _col_type = 'date' THEN
        DECLARE _d date; _d2 date;
        BEGIN
          BEGIN _d := NULLIF(_val,'')::date; EXCEPTION WHEN others THEN _d := NULL; END;
          BEGIN _d2 := NULLIF(_val2,'')::date; EXCEPTION WHEN others THEN _d2 := NULL; END;
          IF _d IS NOT NULL THEN
            DELETE FROM _x_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_date >= _d);
          END IF;
          IF _d2 IS NOT NULL THEN
            DELETE FROM _x_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_date <= _d2);
          END IF;
        END;

      ELSIF _col_type = 'datetime' THEN
        DECLARE _ts timestamptz; _ts2 timestamptz;
        BEGIN
          BEGIN _ts := NULLIF(_val,'')::timestamptz; EXCEPTION WHEN others THEN _ts := NULL; END;
          BEGIN _ts2 := NULLIF(_val2,'')::timestamptz; EXCEPTION WHEN others THEN _ts2 := NULL; END;
          IF _ts IS NOT NULL THEN
            DELETE FROM _x_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_datetime >= _ts);
          END IF;
          IF _ts2 IS NOT NULL THEN
            DELETE FROM _x_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_datetime <= _ts2);
          END IF;
        END;

      ELSE
        IF _val IS NOT NULL AND _val <> '' THEN
          DECLARE _like text := '%' || btrim(_val) || '%';
          BEGIN
            DELETE FROM _x_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_text ILIKE _like);
          END;
        END IF;
      END IF;
    END LOOP;
  END IF;

  SELECT count(*) INTO _total FROM _x_rows;
  _exported := LEAST(_total, _limit);

  -- Audit log entry (one per export call)
  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, diff)
  VALUES (
    'dynamic_table',
    p_table_id::text,
    'export_csv',
    _uid,
    jsonb_build_object(
      'table_id', p_table_id,
      'filters', COALESCE(p_filters, '[]'::jsonb),
      'search', p_search,
      'show_inactive', p_show_inactive,
      'total_count', _total,
      'exported_count', _exported,
      'limit', _limit
    )
  );

  RETURN QUERY
  WITH windowed AS (
    SELECT q.row_id, q.row_number, q.is_active, q.created_at
    FROM _x_rows q
    ORDER BY q.row_number ASC
    LIMIT _limit
  ),
  pivoted AS (
    SELECT w.row_id,
           COALESCE(
             jsonb_object_agg(
               col.column_key,
               CASE col.data_type::text
                 WHEN 'number'   THEN to_jsonb(c.value_number)
                 WHEN 'boolean'  THEN to_jsonb(c.value_boolean)
                 WHEN 'date'     THEN to_jsonb(c.value_date)
                 WHEN 'datetime' THEN to_jsonb(c.value_datetime)
                 ELSE                  to_jsonb(c.value_text)
               END
             ) FILTER (WHERE col.column_key IS NOT NULL),
             '{}'::jsonb
           ) AS vals
    FROM windowed w
    LEFT JOIN public.dynamic_table_cells c ON c.row_id = w.row_id AND c.table_id = p_table_id
    LEFT JOIN public.dynamic_table_columns col ON col.id = c.column_id
    GROUP BY w.row_id
  )
  SELECT _total AS total_count,
         _exported AS exported_count,
         w.row_id, w.row_number, w.is_active, w.created_at,
         COALESCE(p.vals, '{}'::jsonb) AS out_values
  FROM windowed w
  LEFT JOIN pivoted p ON p.row_id = w.row_id
  ORDER BY w.row_number ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.feedback_items_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fill_sale_list_item_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_spt uuid;
  v_new numeric;
  v_old numeric;
BEGIN
  SELECT sale_price_type_id INTO v_spt FROM public.sale_lists WHERE id = NEW.sale_list_id;
  IF v_spt IS NULL THEN RETURN NEW; END IF;

  -- Canonical: latest product_computed_prices
  SELECT rounded_sale_price INTO v_new
  FROM public.product_computed_prices
  WHERE product_id = NEW.product_id
    AND sale_price_type_id = v_spt
    AND rounded_sale_price IS NOT NULL AND rounded_sale_price > 0
  ORDER BY computed_at DESC
  LIMIT 1;

  -- Fallback to history if no computed price
  IF v_new IS NULL THEN
    SELECT new_sale_price INTO v_new
    FROM public.product_sale_price_history
    WHERE product_id = NEW.product_id
      AND sale_price_type_id = v_spt
      AND new_sale_price IS NOT NULL AND new_sale_price > 0
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- Previous price from history (best-effort)
  SELECT COALESCE(old_sale_price, new_sale_price) INTO v_old
  FROM public.product_sale_price_history
  WHERE product_id = NEW.product_id
    AND sale_price_type_id = v_spt
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_new IS NOT NULL THEN
    NEW.current_price := v_new;
    NEW.previous_price := v_old;
    IF v_old IS NOT NULL AND v_old <> 0 THEN
      NEW.change_amount := v_new - v_old;
      NEW.change_percent := ROUND(((v_new - v_old) / v_old) * 100, 2);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.find_duplicate_product(p_brand_id uuid, p_category_id uuid, p_model text, p_color text, p_capacity text, p_exclude_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, name text, sku text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.name, p.sku
  FROM public.products p
  WHERE p_brand_id IS NOT NULL
    AND p_category_id IS NOT NULL
    AND p.brand_id = p_brand_id
    AND p.category_id = p_category_id
    AND coalesce(public.normalize_fa(p.model), '')    = coalesce(public.normalize_fa(p_model), '')
    AND coalesce(public.normalize_fa(p.color), '')    = coalesce(public.normalize_fa(p_color), '')
    AND coalesce(public.normalize_fa(p.capacity), '') = coalesce(public.normalize_fa(p_capacity), '')
    AND p.status <> 'discontinued'
    AND (p_exclude_id IS NULL OR p.id <> p_exclude_id)
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.find_or_create_model(p_name text, p_category_id uuid)
 RETURNS TABLE(id uuid, name text, category_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_norm text;
  v_id uuid;
  v_name text;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'name_required';
  END IF;
  IF p_category_id IS NULL THEN
    RAISE EXCEPTION 'category_required';
  END IF;

  -- Permission: only authenticated users with products.create may invoke
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_norm := lower(btrim(p_name));

  -- Look for existing in same category
  SELECT pa.id, pa.name INTO v_id, v_name
  FROM public.product_attributes pa
  WHERE pa.type = 'model'
    AND pa.category_id = p_category_id
    AND lower(btrim(pa.name)) = v_norm
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, v_name, p_category_id;
    RETURN;
  END IF;

  -- Insert new
  INSERT INTO public.product_attributes (type, name, category_id, is_active, created_by)
  VALUES ('model', btrim(p_name), p_category_id, true, auth.uid())
  RETURNING product_attributes.id, product_attributes.name INTO v_id, v_name;

  RETURN QUERY SELECT v_id, v_name, p_category_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.finish_market_rate_ingestion_run(p_run_id uuid, p_status text, p_fetched integer, p_inserted integer, p_suspect integer, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'احراز هویت لازم است'; END IF;
  IF NOT (public.has_role(v_uid,'admin'::public.app_role)
       OR public.has_role(v_uid,'manager'::public.app_role)
       OR public.has_role(v_uid,'accountant'::public.app_role)) THEN
    RAISE EXCEPTION 'دسترسی لازم نیست';
  END IF;
  IF p_status NOT IN ('completed','failed','skipped') THEN
    RAISE EXCEPTION 'وضعیت نامعتبر';
  END IF;

  UPDATE public.market_rate_ingestion_runs
     SET status = p_status,
         fetched_count = COALESCE(p_fetched, 0),
         inserted_count = COALESCE(p_inserted, 0),
         suspect_count = COALESCE(p_suspect, 0),
         error_message = p_error,
         finished_at = now()
   WHERE id = p_run_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.finish_market_rate_ingestion_run_system(p_run_id uuid, p_status text, p_fetched integer, p_inserted integer, p_suspect integer, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'system RPC: not callable by authenticated users';
  END IF;
  IF p_status NOT IN ('completed','failed','skipped') THEN
    RAISE EXCEPTION 'وضعیت نامعتبر';
  END IF;

  UPDATE public.market_rate_ingestion_runs
     SET status = p_status,
         fetched_count = COALESCE(p_fetched, 0),
         inserted_count = COALESCE(p_inserted, 0),
         suspect_count = COALESCE(p_suspect, 0),
         error_message = p_error,
         finished_at = now()
   WHERE id = p_run_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.gamification_analytics_achievements(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(achievement_id uuid, title_fa text, xp_reward integer, enabled boolean, unlocks bigint, last_unlock timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.gamification_assert_manager();
  RETURN QUERY
  WITH ea AS (
    SELECT achievement_id,
           count(*) FILTER (WHERE unlocked_at >= p_from AND unlocked_at < p_to)::bigint AS unlocks,
           max(unlocked_at) AS last_unlock
    FROM public.employee_achievements
    GROUP BY achievement_id
  )
  SELECT a.id, a.title_fa, a.xp_reward, a.enabled,
         COALESCE(ea.unlocks, 0), ea.last_unlock
  FROM public.achievements a
  LEFT JOIN ea ON ea.achievement_id = a.id
  ORDER BY COALESCE(ea.unlocks, 0) DESC, a.title_fa ASC
  LIMIT 100;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.gamification_analytics_active_season()
 RETURNS TABLE(id uuid, title_fa text, starts_at timestamp with time zone, ends_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.gamification_assert_manager();
  RETURN QUERY
  SELECT s.id, s.title_fa, s.starts_at, s.ends_at
  FROM public.league_seasons s
  WHERE s.status = 'active'
  ORDER BY s.starts_at DESC
  LIMIT 1;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.gamification_analytics_employees()
 RETURNS TABLE(id uuid, full_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.gamification_assert_manager();
  RETURN QUERY
  SELECT DISTINCT p.id, p.full_name
  FROM public.profiles p
  WHERE EXISTS (SELECT 1 FROM public.employee_score_events e WHERE e.employee_id = p.id)
  ORDER BY p.full_name ASC
  LIMIT 500;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.gamification_analytics_kpi_effectiveness(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(event_key text, title_fa text, xp_amount numeric, is_active boolean, events_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.gamification_assert_manager();
  RETURN QUERY
  WITH ev AS (
    SELECT event_type, count(*)::bigint AS c
    FROM public.employee_score_events
    WHERE triggered_at >= p_from AND triggered_at < p_to
    GROUP BY event_type
  )
  SELECT
    COALESCE(r.event_key, ev.event_type)               AS event_key,
    r.title_fa,
    r.xp_amount,
    COALESCE(r.is_active, false)                       AS is_active,
    COALESCE(ev.c, 0)                                  AS events_count
  FROM public.gamification_kpi_rules r
  FULL OUTER JOIN ev ON ev.event_type = r.event_key
  ORDER BY events_count DESC NULLS LAST
  LIMIT 200;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.gamification_analytics_league_distribution()
 RETURNS TABLE(league text, employees_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.gamification_assert_manager();
  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (employee_id) employee_id, league::text AS league
    FROM public.employee_leagues
    ORDER BY employee_id, created_at DESC
  )
  SELECT league, count(*)::bigint
  FROM latest
  GROUP BY league
  ORDER BY 1;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.gamification_analytics_missions(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(mission_id uuid, title_fa text, xp_reward integer, enabled boolean, completions bigint, unique_employees bigint, avg_progress numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.gamification_assert_manager();
  RETURN QUERY
  WITH p AS (
    SELECT mission_id,
           count(*) FILTER (WHERE completed = true AND completed_at >= p_from AND completed_at < p_to)::bigint AS completions,
           count(DISTINCT employee_id) FILTER (WHERE completed = true AND completed_at >= p_from AND completed_at < p_to)::bigint AS uniq,
           round(avg(progress) FILTER (WHERE created_at >= p_from AND created_at < p_to), 2) AS avgp
    FROM public.employee_mission_progress
    GROUP BY mission_id
  )
  SELECT m.id,
         m.title_fa,
         m.xp_reward,
         m.enabled,
         COALESCE(p.completions, 0),
         COALESCE(p.uniq, 0),
         COALESCE(p.avgp, 0)
  FROM public.missions m
  LEFT JOIN p ON p.mission_id = m.id
  ORDER BY COALESCE(p.completions, 0) DESC, m.title_fa ASC
  LIMIT 100;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.gamification_analytics_risk(p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer DEFAULT 50)
 RETURNS TABLE(employee_id uuid, full_name text, events_in_window bigint, last_event_at timestamp with time zone, current_league text, status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
  PERFORM public.gamification_assert_manager();
  RETURN QUERY
  WITH agg AS (
    SELECT employee_id,
           count(*) FILTER (WHERE triggered_at >= p_from AND triggered_at < p_to)::bigint AS in_win,
           max(triggered_at) AS last_at
    FROM public.employee_score_events
    GROUP BY employee_id
  ),
  lg AS (
    SELECT DISTINCT ON (employee_id) employee_id, league::text AS league
    FROM public.employee_leagues
    ORDER BY employee_id, created_at DESC
  )
  SELECT a.employee_id,
         p.full_name,
         a.in_win,
         a.last_at,
         lg.league,
         CASE
           WHEN a.in_win = 0 THEN 'inactive'
           WHEN a.in_win < 5 THEN 'low'
           ELSE 'normal'
         END AS status
  FROM agg a
  LEFT JOIN public.profiles p ON p.id = a.employee_id
  LEFT JOIN lg ON lg.employee_id = a.employee_id
  WHERE a.in_win < 5
  ORDER BY a.in_win ASC, a.last_at ASC NULLS FIRST
  LIMIT v_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.gamification_analytics_summary(p_from timestamp with time zone, p_to timestamp with time zone, p_employee_id uuid DEFAULT NULL::uuid, p_event_type text DEFAULT NULL::text)
 RETURNS TABLE(total_events bigint, total_achievements bigint, total_missions_completed bigint, active_employees bigint, avg_events_per_employee numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.gamification_assert_manager();
  RETURN QUERY
  WITH ev AS (
    SELECT employee_id
    FROM public.employee_score_events
    WHERE triggered_at >= p_from AND triggered_at < p_to
      AND (p_employee_id IS NULL OR employee_id = p_employee_id)
      AND (p_event_type IS NULL OR event_type = p_event_type)
  ),
  ach AS (
    SELECT 1 FROM public.employee_achievements
    WHERE unlocked_at >= p_from AND unlocked_at < p_to
      AND (p_employee_id IS NULL OR employee_id = p_employee_id)
  ),
  mis AS (
    SELECT 1 FROM public.employee_mission_progress
    WHERE completed = true
      AND completed_at IS NOT NULL
      AND completed_at >= p_from AND completed_at < p_to
      AND (p_employee_id IS NULL OR employee_id = p_employee_id)
  )
  SELECT
    (SELECT count(*) FROM ev)::bigint                                  AS total_events,
    (SELECT count(*) FROM ach)::bigint                                 AS total_achievements,
    (SELECT count(*) FROM mis)::bigint                                 AS total_missions_completed,
    (SELECT count(DISTINCT employee_id) FROM ev)::bigint               AS active_employees,
    CASE WHEN (SELECT count(DISTINCT employee_id) FROM ev) > 0
         THEN round(((SELECT count(*) FROM ev))::numeric / (SELECT count(DISTINCT employee_id) FROM ev), 2)
         ELSE 0
    END                                                                AS avg_events_per_employee;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.gamification_analytics_top_employees(p_from timestamp with time zone, p_to timestamp with time zone, p_event_type text DEFAULT NULL::text, p_limit integer DEFAULT 50)
 RETURNS TABLE(employee_id uuid, full_name text, events_count bigint, missions_count bigint, achievements_count bigint, current_league text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
  PERFORM public.gamification_assert_manager();
  RETURN QUERY
  WITH ev AS (
    SELECT employee_id, count(*)::bigint AS c
    FROM public.employee_score_events
    WHERE triggered_at >= p_from AND triggered_at < p_to
      AND (p_event_type IS NULL OR event_type = p_event_type)
    GROUP BY employee_id
  ),
  mis AS (
    SELECT employee_id, count(*)::bigint AS c
    FROM public.employee_mission_progress
    WHERE completed = true AND completed_at IS NOT NULL
      AND completed_at >= p_from AND completed_at < p_to
    GROUP BY employee_id
  ),
  ach AS (
    SELECT employee_id, count(*)::bigint AS c
    FROM public.employee_achievements
    WHERE unlocked_at >= p_from AND unlocked_at < p_to
    GROUP BY employee_id
  ),
  lg AS (
    SELECT DISTINCT ON (employee_id) employee_id, league::text AS league
    FROM public.employee_leagues
    ORDER BY employee_id, created_at DESC
  )
  SELECT
    ev.employee_id,
    p.full_name,
    ev.c                                  AS events_count,
    COALESCE(mis.c, 0)                    AS missions_count,
    COALESCE(ach.c, 0)                    AS achievements_count,
    lg.league                             AS current_league
  FROM ev
  LEFT JOIN public.profiles p ON p.id = ev.employee_id
  LEFT JOIN mis ON mis.employee_id = ev.employee_id
  LEFT JOIN ach ON ach.employee_id = ev.employee_id
  LEFT JOIN lg  ON lg.employee_id  = ev.employee_id
  ORDER BY ev.c DESC
  LIMIT v_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.gamification_analytics_trend(p_from timestamp with time zone, p_to timestamp with time zone, p_employee_id uuid DEFAULT NULL::uuid, p_event_type text DEFAULT NULL::text)
 RETURNS TABLE(day date, event_type text, cnt bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_to timestamptz := LEAST(p_to, p_from + interval '90 days');
BEGIN
  PERFORM public.gamification_assert_manager();
  RETURN QUERY
  SELECT (e.triggered_at AT TIME ZONE 'UTC')::date AS day,
         e.event_type,
         count(*)::bigint AS cnt
  FROM public.employee_score_events e
  WHERE e.triggered_at >= p_from AND e.triggered_at < v_to
    AND (p_employee_id IS NULL OR e.employee_id = p_employee_id)
    AND (p_event_type IS NULL OR e.event_type = p_event_type)
  GROUP BY 1, 2
  ORDER BY 1 ASC, 2 ASC
  LIMIT 5000;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.gamification_assert_manager()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز: فقط مدیر یا مدیر ارشد می‌تواند داده‌های تحلیلی را ببیند' USING ERRCODE = '42501';
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_birthday_notifications()
 RETURNS TABLE(created_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller uuid := auth.uid();
  v_template text;
  v_today date := current_date;
  v_count integer := 0;
  r_person record;
  r_recipient record;
  v_title text;
  v_body text;
  v_ref_type text;
  v_ref_id uuid;
  v_exists boolean;
begin
  -- Auth + role gate
  if v_caller is null then
    raise exception 'authentication required';
  end if;
  if not has_any_role(v_caller, array['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]) then
    raise exception 'insufficient privileges';
  end if;

  -- Load message template (fallback if missing)
  select coalesce(nullif(value, ''), '🎂 تولدت مبارک!')
    into v_template
  from public.shop_settings
  where key = 'birthday_message_template'
  limit 1;
  if v_template is null then
    v_template := '🎂 تولدت مبارک!';
  end if;

  -- Iterate customers + users whose birthday matches today (day+month)
  for r_person in
    select 'customer'::text as kind, c.id as person_id, c.name as person_name
      from public.customers c
      where c.birth_date is not null
        and c.is_active = true
        and extract(month from c.birth_date) = extract(month from v_today)
        and extract(day   from c.birth_date) = extract(day   from v_today)
    union all
    select 'user'::text as kind, p.id as person_id,
           coalesce(p.full_name, p.email, 'کاربر') as person_name
      from public.profiles p
      where p.birth_date is not null
        and extract(month from p.birth_date) = extract(month from v_today)
        and extract(day   from p.birth_date) = extract(day   from v_today)
  loop
    v_ref_type := r_person.kind;
    v_ref_id   := r_person.person_id;
    v_title := case r_person.kind
                 when 'customer' then 'تولد مشتری: ' || r_person.person_name
                 else 'تولد کاربر: ' || r_person.person_name
               end;
    v_body  := v_template || E'\n' ||
               case r_person.kind when 'customer' then 'مشتری: ' else 'کاربر: ' end
               || r_person.person_name;

    -- For each admin/accountant recipient
    for r_recipient in
      select distinct ur.user_id
      from public.user_roles ur
      where ur.role in ('admin'::app_role, 'accountant'::app_role)
    loop
      -- Dedupe: same recipient, same person, type=birthday, today
      select exists(
        select 1 from public.notification_queue n
        where n.user_id = r_recipient.user_id
          and n.type = 'birthday'
          and n.reference_type = v_ref_type
          and n.reference_id = v_ref_id
          and n.created_at >= v_today::timestamptz
          and n.created_at <  (v_today + 1)::timestamptz
      ) into v_exists;

      if not v_exists then
        insert into public.notification_queue
          (user_id, title, body, type, reference_type, reference_id)
        values
          (r_recipient.user_id, v_title, v_body, 'birthday', v_ref_type, v_ref_id);
        v_count := v_count + 1;

        insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
        values (
          v_caller,
          v_ref_type,
          v_ref_id::text,
          'birthday_notification_sent',
          jsonb_build_object(
            'recipient_id', r_recipient.user_id,
            'person_kind',  v_ref_type,
            'person_id',    v_ref_id,
            'person_name',  r_person.person_name,
            'date',         v_today
          )
        );
      end if;
    end loop;
  end loop;

  return query select v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_sale_price_type_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  next_num int;
  new_code text;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM '^SPT-(\d+)$') AS int)), 0) + 1
    INTO next_num
  FROM public.sale_price_types
  WHERE code ~ '^SPT-\d+$';

  LOOP
    new_code := 'SPT-' || LPAD(next_num::text, 3, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.sale_price_types WHERE code = new_code);
    next_num := next_num + 1;
  END LOOP;

  RETURN new_code;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_current_league(_employee_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  season_rec public.league_seasons%ROWTYPE;
  el public.employee_leagues%ROWTYPE;
BEGIN
  SELECT * INTO season_rec FROM public.league_seasons WHERE is_active ORDER BY start_date DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('league', NULL, 'season', NULL);
  END IF;

  SELECT * INTO el
  FROM public.employee_leagues
  WHERE employee_id = _employee_id AND season_id = season_rec.id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'employee_id', _employee_id,
      'season_id', season_rec.id,
      'season_name', season_rec.season_name,
      'league', 'Bronze',
      'rank', NULL,
      'score', 0,
      'promoted', false,
      'demoted', false
    );
  END IF;

  RETURN jsonb_build_object(
    'employee_id', el.employee_id,
    'season_id', season_rec.id,
    'season_name', season_rec.season_name,
    'league', el.league,
    'rank', el.rank,
    'score', el.score,
    'promoted', el.promoted,
    'demoted', el.demoted
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_customer_credit(p_customer_id uuid)
 RETURNS TABLE(available_credit numeric, held_credit numeric, total_purchases numeric, outstanding_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role, 'sales'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  PERFORM public._ensure_credit_balance(p_customer_id);

  RETURN QUERY
  SELECT
    b.available_credit,
    b.held_credit,
    COALESCE(p.total_purchases, 0)::numeric,
    COALESCE(p.outstanding_balance, 0)::numeric
  FROM public.customer_credit_balance b
  LEFT JOIN public.customer_credit_profile p ON p.customer_id = b.customer_id
  WHERE b.customer_id = p_customer_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_delivery_receipts(p_type text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_invoice_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, type text, status text, file_name text, file_size bigint, storage_path text, invoice_id uuid, customer_id uuid, uploaded_by uuid, uploader_name text, reviewed_by uuid, reviewer_name text, notes text, created_at timestamp with time zone, review_deadline timestamp with time zone, reviewed_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    dr.id, dr.type, dr.status, dr.file_name, dr.file_size,
    dr.storage_path, dr.invoice_id, dr.customer_id,
    dr.uploaded_by,
    up.full_name as uploader_name,
    dr.reviewed_by,
    rv.full_name as reviewer_name,
    dr.notes, dr.created_at, dr.review_deadline, dr.reviewed_at
  from public.delivery_receipts dr
  join public.profiles up on up.id = dr.uploaded_by
  left join public.profiles rv on rv.id = dr.reviewed_by
  where
    (p_type is null or dr.type = p_type) and
    (p_status is null or dr.status = p_status) and
    (p_invoice_id is null or dr.invoice_id = p_invoice_id) and
    (
      dr.uploaded_by = auth.uid() or
      public.has_role(auth.uid(), 'admin') or
      public.has_role(auth.uid(), 'manager') or
      public.has_role(auth.uid(), 'sales')
    )
  order by dr.created_at desc
  limit p_limit offset p_offset;
$function$
;

CREATE OR REPLACE FUNCTION public.get_documents(p_type text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, type text, status text, file_name text, file_size bigint, storage_path text, reference_id uuid, reference_type text, uploaded_by uuid, uploader_name text, reviewed_by uuid, reviewer_name text, notes text, created_at timestamp with time zone, review_deadline timestamp with time zone, reviewed_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    d.id, d.type, d.status, d.file_name, d.file_size,
    d.storage_path, d.reference_id, d.reference_type,
    d.uploaded_by, up.full_name,
    d.reviewed_by, rv.full_name,
    d.notes, d.created_at, d.review_deadline, d.reviewed_at
  from public.documents d
  join public.profiles up on up.id = d.uploaded_by
  left join public.profiles rv on rv.id = d.reviewed_by
  where (p_type is null or d.type = p_type)
    and (p_status is null or d.status = p_status)
    and (
      d.uploaded_by = auth.uid() or
      public.has_role(auth.uid(),'admin') or
      public.has_role(auth.uid(),'manager')
    )
  order by d.created_at desc
  limit p_limit offset p_offset;
$function$
;

CREATE OR REPLACE FUNCTION public.get_employee_progress(_employee_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec public.employee_progress%ROWTYPE;
  pct numeric;
BEGIN
  -- Access control: caller must be the same employee, an admin, or a manager.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF auth.uid() <> _employee_id
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
     AND NOT public.has_role(auth.uid(), 'manager'::public.app_role) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO rec FROM public.employee_progress WHERE employee_id = _employee_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'employee_id', _employee_id,
      'level', 1,
      'xp_current', 0,
      'xp_total', 0,
      'xp_next_level', public.calc_xp_for_level(1),
      'progress_percent', 0,
      'last_level_up', NULL
    );
  END IF;

  pct := CASE
    WHEN rec.xp_next_level > 0
      THEN LEAST(100, ROUND((rec.xp_current / rec.xp_next_level) * 100, 2))
    ELSE 0
  END;

  RETURN jsonb_build_object(
    'employee_id', rec.employee_id,
    'level', rec.level,
    'xp_current', rec.xp_current,
    'xp_total', rec.xp_total,
    'xp_next_level', rec.xp_next_level,
    'progress_percent', pct,
    'last_level_up', rec.last_level_up
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_employee_rank(_employee_id uuid)
 RETURNS TABLE(employee_id uuid, daily_score numeric, weekly_score numeric, monthly_score numeric, total_score numeric, daily_rank bigint, weekly_rank bigint, monthly_rank bigint, all_time_rank bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH ranked AS (
    SELECT
      es.employee_id AS emp_id,
      es.daily_score, es.weekly_score, es.monthly_score, es.total_score,
      RANK() OVER (ORDER BY es.daily_score   DESC) AS d_rank,
      RANK() OVER (ORDER BY es.weekly_score  DESC) AS w_rank,
      RANK() OVER (ORDER BY es.monthly_score DESC) AS m_rank,
      RANK() OVER (ORDER BY es.total_score   DESC) AS a_rank
    FROM public.employee_scores es
  )
  SELECT
    r.emp_id        AS employee_id,
    r.daily_score, r.weekly_score, r.monthly_score, r.total_score,
    r.d_rank        AS daily_rank,
    r.w_rank        AS weekly_rank,
    r.m_rank        AS monthly_rank,
    r.a_rank        AS all_time_rank
  FROM ranked r
  WHERE r.emp_id = _employee_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_kpi_xp(p_event_key text, p_default numeric)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT xp_amount
       FROM public.gamification_kpi_rules
      WHERE event_key = p_event_key
        AND is_active = true
      LIMIT 1),
    p_default
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_leaderboard(_period text DEFAULT 'monthly'::text, _team text DEFAULT NULL::text, _department text DEFAULT NULL::text, _role text DEFAULT NULL::text, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
 RETURNS TABLE(employee_id uuid, full_name text, team text, department text, role text, score numeric, rank bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      es.employee_id AS emp_id,
      p.full_name    AS full_name_v,
      NULL::text     AS team_v,
      NULL::text     AS dept_v,
      ur.role::text  AS role_v,
      CASE _period
        WHEN 'daily'    THEN es.daily_score
        WHEN 'weekly'   THEN es.weekly_score
        WHEN 'monthly'  THEN es.monthly_score
        WHEN 'all_time' THEN es.total_score
        ELSE es.monthly_score
      END AS score_v
    FROM public.employee_scores es
    LEFT JOIN public.profiles p ON p.id = es.employee_id
    LEFT JOIN LATERAL (
      SELECT ur2.role FROM public.user_roles ur2 WHERE ur2.user_id = es.employee_id LIMIT 1
    ) ur ON TRUE
  ),
  filtered AS (
    SELECT * FROM base
    WHERE (_team       IS NULL OR team_v = _team)
      AND (_department IS NULL OR dept_v = _department)
      AND (_role       IS NULL OR role_v = _role)
  ),
  ranked AS (
    SELECT f.*, RANK() OVER (ORDER BY f.score_v DESC) AS rnk FROM filtered f
  )
  SELECT
    r.emp_id      AS employee_id,
    r.full_name_v AS full_name,
    r.team_v      AS team,
    r.dept_v      AS department,
    r.role_v      AS role,
    r.score_v     AS score,
    r.rnk         AS rank
  FROM ranked r
  ORDER BY r.rnk, r.emp_id
  LIMIT GREATEST(_limit, 0)
  OFFSET GREATEST(_offset, 0);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_leaderboard_all_time(_team text DEFAULT NULL::text, _department text DEFAULT NULL::text, _role text DEFAULT NULL::text, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
 RETURNS TABLE(employee_id uuid, full_name text, team text, department text, role text, score numeric, rank bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT * FROM public.get_leaderboard('all_time', _team, _department, _role, _limit, _offset);
$function$
;

CREATE OR REPLACE FUNCTION public.get_leaderboard_daily(_team text DEFAULT NULL::text, _department text DEFAULT NULL::text, _role text DEFAULT NULL::text, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
 RETURNS TABLE(employee_id uuid, full_name text, team text, department text, role text, score numeric, rank bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT * FROM public.get_leaderboard('daily', _team, _department, _role, _limit, _offset);
$function$
;

CREATE OR REPLACE FUNCTION public.get_leaderboard_monthly(_team text DEFAULT NULL::text, _department text DEFAULT NULL::text, _role text DEFAULT NULL::text, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
 RETURNS TABLE(employee_id uuid, full_name text, team text, department text, role text, score numeric, rank bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT * FROM public.get_leaderboard('monthly', _team, _department, _role, _limit, _offset);
$function$
;

CREATE OR REPLACE FUNCTION public.get_leaderboard_weekly(_team text DEFAULT NULL::text, _department text DEFAULT NULL::text, _role text DEFAULT NULL::text, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
 RETURNS TABLE(employee_id uuid, full_name text, team text, department text, role text, score numeric, rank bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT * FROM public.get_leaderboard('weekly', _team, _department, _role, _limit, _offset);
$function$
;

CREATE OR REPLACE FUNCTION public.get_league_leaderboard(_league league_tier, _limit integer DEFAULT 100, _offset integer DEFAULT 0)
 RETURNS TABLE(employee_id uuid, full_name text, league league_tier, score numeric, rank integer, promoted boolean, demoted boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  season_id_v uuid;
BEGIN
  SELECT id INTO season_id_v FROM public.league_seasons WHERE is_active ORDER BY start_date DESC LIMIT 1;
  IF season_id_v IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    el.employee_id,
    p.full_name,
    el.league,
    el.score,
    RANK() OVER (ORDER BY el.score DESC)::integer AS rank,
    el.promoted,
    el.demoted
  FROM public.employee_leagues el
  LEFT JOIN public.profiles p ON p.id = el.employee_id
  WHERE el.season_id = season_id_v AND el.league = _league
  ORDER BY el.score DESC
  LIMIT _limit OFFSET _offset;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_numeric_setting(_key text, _default numeric)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(NULLIF(value,'')::numeric, _default)
  FROM public.shop_settings WHERE key = _key
  UNION ALL SELECT _default
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_observatory_pdf_hints_for_products(p_product_ids uuid[])
 RETURNS TABLE(product_id uuid, has_price_advantage boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _table_id uuid;
  _col_pid uuid;
  _col_show_pdf uuid;
  _col_watch uuid;
BEGIN
  IF p_product_ids IS NULL OR array_length(p_product_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO _table_id
    FROM public.dynamic_tables
   WHERE slug = 'afrakala-product-price-observatory';
  IF _table_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO _col_pid
    FROM public.dynamic_table_columns
   WHERE table_id = _table_id AND column_key = 'afrakala_product_id';
  SELECT id INTO _col_show_pdf
    FROM public.dynamic_table_columns
   WHERE table_id = _table_id AND column_key = 'show_in_pdf';
  SELECT id INTO _col_watch
    FROM public.dynamic_table_columns
   WHERE table_id = _table_id AND column_key = 'is_watch_active';

  IF _col_pid IS NULL OR _col_show_pdf IS NULL OR _col_watch IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH valid_rows AS (
    SELECT r.id AS row_id,
           c_pid.value_text::uuid AS pid
      FROM public.dynamic_table_rows r
      JOIN public.dynamic_table_cells c_pid
        ON c_pid.row_id = r.id AND c_pid.column_id = _col_pid
      JOIN public.dynamic_table_cells c_show
        ON c_show.row_id = r.id AND c_show.column_id = _col_show_pdf
      JOIN public.dynamic_table_cells c_watch
        ON c_watch.row_id = r.id AND c_watch.column_id = _col_watch
     WHERE r.table_id = _table_id
       AND COALESCE(r.is_active, true) = true
       AND COALESCE(c_show.value_boolean, false) = true
       AND COALESCE(c_watch.value_boolean, false) = true
       AND c_pid.value_text ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       AND c_pid.value_text::uuid = ANY (p_product_ids)
  ),
  computed AS (
    SELECT vr.pid AS product_id,
           public._obs_compute_row_values(vr.row_id) AS v
      FROM valid_rows vr
  )
  SELECT c.product_id,
         (
           NULLIF(c.v->>'competitive_price_status','') = 'below_market'
           AND COALESCE(NULLIF(c.v->>'sales_opportunity_score','')::numeric, 0) >= 60
         ) AS has_price_advantage
    FROM computed c;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_observatory_snippets_for_products(p_product_ids uuid[])
 RETURNS TABLE(product_id uuid, competitive_price_status text, sales_opportunity_score numeric, suggested_sales_message text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _table_id uuid;
  _col_pid uuid;
  _col_show uuid;
  _col_watch uuid;
BEGIN
  IF p_product_ids IS NULL OR array_length(p_product_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO _table_id
    FROM public.dynamic_tables
   WHERE slug = 'afrakala-product-price-observatory';
  IF _table_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO _col_pid
    FROM public.dynamic_table_columns
   WHERE table_id = _table_id AND column_key = 'afrakala_product_id';
  SELECT id INTO _col_show
    FROM public.dynamic_table_columns
   WHERE table_id = _table_id AND column_key = 'show_in_quick_sales_search';
  SELECT id INTO _col_watch
    FROM public.dynamic_table_columns
   WHERE table_id = _table_id AND column_key = 'is_watch_active';

  IF _col_pid IS NULL OR _col_show IS NULL OR _col_watch IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH valid_rows AS (
    SELECT r.id AS row_id,
           c_pid.value_text::uuid AS pid
      FROM public.dynamic_table_rows r
      JOIN public.dynamic_table_cells c_pid
        ON c_pid.row_id = r.id AND c_pid.column_id = _col_pid
      JOIN public.dynamic_table_cells c_show
        ON c_show.row_id = r.id AND c_show.column_id = _col_show
      JOIN public.dynamic_table_cells c_watch
        ON c_watch.row_id = r.id AND c_watch.column_id = _col_watch
     WHERE r.table_id = _table_id
       AND COALESCE(r.is_active, true) = true
       AND COALESCE(c_show.value_boolean, false) = true
       AND COALESCE(c_watch.value_boolean, false) = true
       AND c_pid.value_text ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       AND c_pid.value_text::uuid = ANY (p_product_ids)
  ),
  computed AS (
    SELECT vr.pid AS product_id,
           public._obs_compute_row_values(vr.row_id) AS v
      FROM valid_rows vr
  )
  SELECT c.product_id,
         NULLIF(c.v->>'competitive_price_status', '')::text       AS competitive_price_status,
         NULLIF(c.v->>'sales_opportunity_score', '')::numeric     AS sales_opportunity_score,
         NULLIF(c.v->>'suggested_sales_message', '')::text        AS suggested_sales_message
    FROM computed c;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_payable_detail(p_supplier_id uuid DEFAULT NULL::uuid, p_purchase_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(supplier_id uuid, supplier_name text, purchase_id uuid, purchase_date date, due_date date, payment_term_days integer, purchase_total_amount numeric, cash_price numeric, currency text, paid_at timestamp with time zone, outstanding_amount numeric, is_paid boolean, is_overdue boolean, item_id uuid, product_id uuid, product_name text, item_quantity numeric, item_unit_price numeric, item_line_total numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_supplier_id IS NULL AND p_purchase_id IS NULL THEN
    RAISE EXCEPTION 'p_supplier_id or p_purchase_id required' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    v.supplier_id, v.supplier_name, v.purchase_id, v.purchase_date, v.due_date,
    v.payment_term_days, v.purchase_total_amount, v.cash_price, v.currency,
    v.paid_at, v.outstanding_amount, v.is_paid, v.is_overdue,
    pi.id AS item_id,
    COALESCE(pi.product_id, pu.product_id) AS product_id,
    pr.name AS product_name,
    COALESCE(pi.quantity, pu.quantity) AS item_quantity,
    COALESCE(pi.unit_price, pu.purchase_price) AS item_unit_price,
    COALESCE(pi.line_total, pu.purchase_price * pu.quantity) AS item_line_total
  FROM public.vw_supplier_payables v
  JOIN public.purchases pu              ON pu.id = v.purchase_id
  LEFT JOIN public.purchase_items pi    ON pi.purchase_id = v.purchase_id
  LEFT JOIN public.products pr          ON pr.id = COALESCE(pi.product_id, pu.product_id)
  WHERE (p_purchase_id IS NULL OR v.purchase_id = p_purchase_id)
    AND (p_supplier_id IS NULL OR v.supplier_id = p_supplier_id)
  ORDER BY v.purchase_date DESC NULLS LAST;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_payables_list(p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date, p_supplier_id uuid DEFAULT NULL::uuid, p_due_filter text DEFAULT 'all'::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_include_paid boolean DEFAULT false)
 RETURNS TABLE(supplier_id uuid, supplier_name text, purchase_id uuid, purchase_date date, due_date date, payment_term_days integer, purchase_total_amount numeric, cash_price numeric, currency text, paid_at timestamp with time zone, outstanding_amount numeric, is_paid boolean, days_until_due integer, is_overdue boolean, product_summary text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit  int  := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset int  := GREATEST(COALESCE(p_offset, 0), 0);
  v_search text := NULLIF(trim(COALESCE(p_search, '')), '');
  v_filter text := COALESCE(p_due_filter, 'all');
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_filter NOT IN ('all','overdue','today','tomorrow','future') THEN
    RAISE EXCEPTION 'invalid due filter: %', v_filter USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    v.supplier_id, v.supplier_name, v.purchase_id, v.purchase_date, v.due_date,
    v.payment_term_days, v.purchase_total_amount, v.cash_price, v.currency,
    v.paid_at, v.outstanding_amount, v.is_paid, v.days_until_due, v.is_overdue,
    v.product_summary, v.created_at
  FROM public.vw_supplier_payables v
  WHERE (p_include_paid OR v.is_paid = false)
    AND (p_supplier_id IS NULL OR v.supplier_id = p_supplier_id)
    AND (p_from_date   IS NULL OR v.due_date   >= p_from_date)
    AND (p_to_date     IS NULL OR v.due_date   <= p_to_date)
    AND (
      v_filter = 'all'
      OR (v_filter = 'overdue'  AND v.is_overdue)
      OR (v_filter = 'today'    AND v.due_date = CURRENT_DATE)
      OR (v_filter = 'tomorrow' AND v.due_date = CURRENT_DATE + 1)
      OR (v_filter = 'future'   AND v.due_date > CURRENT_DATE + 1)
    )
    AND (
      v_search IS NULL
      OR v.supplier_name    ILIKE '%'||v_search||'%'
      OR v.purchase_id::text ILIKE '%'||v_search||'%'
    )
  ORDER BY v.is_overdue DESC, v.due_date NULLS LAST, v.outstanding_amount DESC
  LIMIT v_limit OFFSET v_offset;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_payables_summary(p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date, p_supplier_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(total_outstanding numeric, overdue_outstanding numeric, due_today numeric, due_tomorrow numeric, future_outstanding numeric, items_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(v.outstanding_amount), 0)::numeric                                              AS total_outstanding,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.is_overdue), 0)::numeric                  AS overdue_outstanding,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.due_date = CURRENT_DATE), 0)::numeric     AS due_today,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.due_date = CURRENT_DATE + 1), 0)::numeric AS due_tomorrow,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.due_date > CURRENT_DATE + 1), 0)::numeric AS future_outstanding,
    COUNT(*)::bigint                                                                              AS items_count
  FROM public.vw_supplier_payables v
  WHERE v.is_paid = false
    AND (p_supplier_id IS NULL OR v.supplier_id = p_supplier_id)
    AND (p_from_date   IS NULL OR v.due_date   >= p_from_date)
    AND (p_to_date     IS NULL OR v.due_date   <= p_to_date);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_product_price_bounds(_product_id uuid, _sale_price_type_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(min_price numeric, max_price numeric, cap_price numeric, selected_price numeric, has_any boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_min numeric;
  v_max numeric;
  v_sel numeric;
BEGIN
  -- Latest price per active sale_price_type for this product
  WITH latest_per_type AS (
    SELECT DISTINCT ON (h.sale_price_type_id)
      h.sale_price_type_id,
      h.new_sale_price
    FROM public.product_sale_price_history h
    JOIN public.sale_price_types t ON t.id = h.sale_price_type_id
    WHERE h.product_id = _product_id
      AND t.is_active = true
      AND h.new_sale_price IS NOT NULL
      AND h.new_sale_price > 0
    ORDER BY h.sale_price_type_id, h.created_at DESC
  )
  SELECT MIN(new_sale_price), MAX(new_sale_price)
  INTO v_min, v_max
  FROM latest_per_type;

  IF _sale_price_type_id IS NOT NULL THEN
    SELECT new_sale_price
    INTO v_sel
    FROM public.product_sale_price_history
    WHERE product_id = _product_id
      AND sale_price_type_id = _sale_price_type_id
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  RETURN QUERY
  SELECT
    v_min,
    v_max,
    CASE WHEN v_max IS NULL THEN NULL ELSE round(v_max * 1.05) END,
    v_sel,
    (v_min IS NOT NULL);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_product_recommendations(p_product_id uuid)
 RETURNS TABLE(product_id uuid, name text, sku text, brand_name text, category_name text, stock_status text, current_price numeric, recommendation_score numeric, reason text, is_pinned boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_brand_id uuid;
  v_category_id uuid;
  v_price numeric;
  v_price_low numeric;
  v_price_high numeric;
BEGIN
  SELECT p.brand_id, p.category_id INTO v_brand_id, v_category_id
  FROM public.products p WHERE p.id = p_product_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT AVG(rounded_sale_price)::numeric
    INTO v_price
  FROM public.product_computed_prices pcp
  WHERE pcp.product_id = p_product_id;

  IF v_price IS NOT NULL AND v_price > 0 THEN
    v_price_low  := v_price * 0.7;
    v_price_high := v_price * 1.3;
  END IF;

  RETURN QUERY
  WITH
  co_view AS (
    SELECT b.product_id AS rec_id, COUNT(DISTINCT a.user_id)::numeric AS cnt
    FROM public.product_interaction_events a
    JOIN public.product_interaction_events b
      ON a.user_id = b.user_id
     AND a.user_id IS NOT NULL
     AND b.product_id <> a.product_id
     AND abs(extract(epoch FROM (b.created_at - a.created_at))) <= 1800
    WHERE a.product_id = p_product_id
      AND a.created_at > now() - interval '30 days'
      AND b.created_at > now() - interval '30 days'
    GROUP BY b.product_id
  ),
  trending AS (
    SELECT pie.product_id AS rec_id,
           (COUNT(*) FILTER (WHERE pie.event_type = 'price_checked') * 4
          + COUNT(*) FILTER (WHERE pie.event_type = 'board_price_viewed') * 3
          + COUNT(*) FILTER (WHERE pie.event_type IN ('chart_opened','product_details_opened')) * 2
          + COUNT(*) FILTER (WHERE pie.event_type = 'search_result_viewed'))::numeric AS score
    FROM public.product_interaction_events pie
    WHERE pie.created_at > now() - interval '7 days'
      AND pie.product_id <> p_product_id
    GROUP BY pie.product_id
  ),
  trending_max AS (
    SELECT GREATEST(COALESCE(MAX(score), 0), 1) AS max_score FROM trending
  ),
  candidates AS (
    SELECT p.id AS rec_id
    FROM public.products p
    WHERE p.id <> p_product_id
      AND p.is_active = true
      AND p.status = 'active'
      AND (
        (v_category_id IS NOT NULL AND p.category_id = v_category_id)
        OR (v_brand_id IS NOT NULL AND p.brand_id = v_brand_id)
        OR EXISTS (SELECT 1 FROM co_view cv WHERE cv.rec_id = p.id)
        OR EXISTS (SELECT 1 FROM trending tr WHERE tr.rec_id = p.id)
      )
  ),
  cand_price AS (
    SELECT pcp.product_id AS rec_id, AVG(pcp.rounded_sale_price)::numeric AS price
    FROM public.product_computed_prices pcp
    GROUP BY pcp.product_id
  ),
  overrides AS (
    SELECT pro.recommended_product_id AS rec_id,
           pro.is_pinned,
           pro.is_disabled,
           pro.priority
    FROM public.product_recommendation_overrides pro
    WHERE pro.product_id = p_product_id
  ),
  scored AS (
    SELECT
      c.rec_id,
      COALESCE(cv.cnt, 0) AS co_view_cnt,
      CASE WHEN v_category_id IS NOT NULL AND p.category_id = v_category_id THEN 1 ELSE 0 END AS same_cat,
      CASE WHEN v_brand_id IS NOT NULL AND p.brand_id = v_brand_id THEN 1 ELSE 0 END AS same_brand,
      CASE WHEN v_price_low IS NOT NULL AND cp.price BETWEEN v_price_low AND v_price_high THEN 1 ELSE 0 END AS price_match,
      COALESCE(tr.score, 0) / (SELECT max_score FROM trending_max) AS trend_norm,
      p.stock_status::text AS stock_text,
      cp.price AS cand_price,
      p.name AS p_name,
      p.sku AS p_sku,
      b.name AS brand_name,
      cat.name AS category_name,
      ov.is_pinned,
      ov.is_disabled,
      ov.priority
    FROM candidates c
    JOIN public.products p ON p.id = c.rec_id
    LEFT JOIN public.brands b ON b.id = p.brand_id
    LEFT JOIN public.categories cat ON cat.id = p.category_id
    LEFT JOIN co_view cv ON cv.rec_id = c.rec_id
    LEFT JOIN trending tr ON tr.rec_id = c.rec_id
    LEFT JOIN cand_price cp ON cp.rec_id = c.rec_id
    LEFT JOIN overrides ov ON ov.rec_id = c.rec_id
  ),
  final_scored AS (
    SELECT
      s.*,
      (
        LEAST(s.co_view_cnt, 10) * 0.4 * 4
        + s.same_cat   * 3
        + s.same_brand * 2
        + s.price_match * 2
        + s.trend_norm * 1
      )
      * CASE WHEN s.stock_text IN ('out_of_stock','unknown') THEN 0.6 ELSE 1.0 END AS base_score
    FROM scored s
    WHERE COALESCE(s.is_disabled, false) = false
  )
  SELECT
    fs.rec_id,
    fs.p_name,
    fs.p_sku,
    fs.brand_name,
    fs.category_name,
    fs.stock_text,
    fs.cand_price,
    ROUND(
      CASE WHEN fs.is_pinned THEN fs.base_score + 1000 + COALESCE(fs.priority, 0)
           ELSE fs.base_score END
    , 3) AS recommendation_score,
    CASE
      WHEN fs.is_pinned THEN 'pinned'
      WHEN fs.co_view_cnt >= 1 THEN 'co_viewed'
      WHEN fs.same_cat = 1 THEN 'same_category'
      WHEN fs.same_brand = 1 THEN 'same_brand'
      WHEN fs.price_match = 1 THEN 'price_range'
      WHEN fs.trend_norm > 0 THEN 'trending'
      ELSE 'related'
    END::text AS reason,
    COALESCE(fs.is_pinned, false) AS is_pinned
  FROM final_scored fs
  ORDER BY recommendation_score DESC NULLS LAST
  LIMIT 5;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_product_sale_price(_product_id uuid, _sale_price_type_id uuid DEFAULT NULL::uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT new_sale_price
  FROM public.product_sale_price_history
  WHERE product_id = _product_id
    AND ( _sale_price_type_id IS NULL OR sale_price_type_id = _sale_price_type_id )
  ORDER BY created_at DESC
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_purchase_requests(p_status text DEFAULT NULL::text, p_product_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, product_id uuid, product_name text, quantity numeric, unit text, status text, requested_by uuid, requester_name text, assigned_to uuid, assignee_name text, inquiry_id uuid, expected_price numeric, final_price numeric, notes text, created_at timestamp with time zone, receipt_count bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    pr.id,
    pr.product_id,
    p.name as product_name,
    pr.quantity,
    pr.unit,
    pr.status,
    pr.requested_by,
    rq.full_name as requester_name,
    pr.assigned_to,
    aq.full_name as assignee_name,
    pr.inquiry_id,
    pr.expected_price,
    pr.final_price,
    pr.notes,
    pr.created_at,
    count(rc.id) as receipt_count
  from public.purchase_requests pr
  join public.products p on p.id = pr.product_id
  join public.profiles rq on rq.id = pr.requested_by
  left join public.profiles aq on aq.id = pr.assigned_to
  left join public.purchase_receipts rc on rc.request_id = pr.id
  where
    (p_status is null or pr.status = p_status) and
    (p_product_id is null or pr.product_id = p_product_id) and
    (
      pr.requested_by = auth.uid() or
      pr.assigned_to = auth.uid() or
      public.has_role(auth.uid(), 'admin') or
      public.has_role(auth.uid(), 'manager')
    )
  group by pr.id, p.name, rq.full_name, aq.full_name
  order by pr.created_at desc
  limit p_limit offset p_offset;
$function$
;

CREATE OR REPLACE FUNCTION public.get_rank_neighbors(_employee_id uuid, _period text DEFAULT 'monthly'::text, _window integer DEFAULT 3)
 RETURNS TABLE(employee_id uuid, full_name text, score numeric, rank bigint, relative_position text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH ranked AS (
    SELECT
      es.employee_id AS emp_id,
      p.full_name    AS full_name,
      CASE _period
        WHEN 'daily'    THEN es.daily_score
        WHEN 'weekly'   THEN es.weekly_score
        WHEN 'all_time' THEN es.total_score
        ELSE es.monthly_score
      END AS score_v,
      RANK() OVER (ORDER BY
        CASE _period
          WHEN 'daily'    THEN es.daily_score
          WHEN 'weekly'   THEN es.weekly_score
          WHEN 'all_time' THEN es.total_score
          ELSE es.monthly_score
        END DESC
      ) AS rnk
    FROM public.employee_scores es
    LEFT JOIN public.profiles p ON p.id = es.employee_id
  ),
  me AS (
    SELECT r.rnk AS r FROM ranked r WHERE r.emp_id = _employee_id LIMIT 1
  )
  SELECT
    r.emp_id    AS employee_id,
    r.full_name AS full_name,
    r.score_v   AS score,
    r.rnk       AS rank,
    CASE
      WHEN r.emp_id = _employee_id THEN 'self'
      WHEN r.rnk < (SELECT m.r FROM me m) THEN 'above'
      ELSE 'below'
    END AS relative_position
  FROM ranked r, me
  WHERE r.rnk BETWEEN (me.r - _window) AND (me.r + _window)
  ORDER BY r.rnk;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_receivable_detail(p_customer_id uuid DEFAULT NULL::uuid, p_invoice_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(customer_id uuid, customer_name text, customer_phone text, invoice_id uuid, invoice_number text, invoice_type text, invoice_status text, issue_date date, due_date date, total_amount numeric, deposit_amount numeric, confirmed_paid_amount numeric, outstanding_amount numeric, is_overdue boolean, receipt_id uuid, receipt_amount numeric, receipt_status text, receipt_payment_date date, receipt_tracking_number text, receipt_bank_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_customer_id IS NULL AND p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'p_customer_id or p_invoice_id required' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    v.customer_id, v.customer_name, c.phone AS customer_phone,
    v.invoice_id, v.invoice_number, v.invoice_type, v.invoice_status,
    i.issue_date, v.due_date,
    v.total_amount, v.deposit_amount, v.confirmed_paid_amount,
    v.outstanding_amount, v.is_overdue,
    pr.id AS receipt_id, prl.amount AS receipt_amount, pr.status AS receipt_status,
    pr.payment_date AS receipt_payment_date,
    pr.tracking_number AS receipt_tracking_number,
    pr.bank_name AS receipt_bank_name
  FROM public.vw_customer_receivables v
  JOIN public.invoices i               ON i.id = v.invoice_id
  LEFT JOIN public.customers c         ON c.id = v.customer_id
  LEFT JOIN public.payment_receipt_links prl ON prl.invoice_id = v.invoice_id
  LEFT JOIN public.payment_receipts    pr   ON pr.id = prl.receipt_id
  WHERE (p_invoice_id  IS NULL OR v.invoice_id  = p_invoice_id)
    AND (p_customer_id IS NULL OR v.customer_id = p_customer_id)
  ORDER BY v.due_date NULLS LAST, pr.payment_date NULLS LAST;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_receivables_list(p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date, p_customer_id uuid DEFAULT NULL::uuid, p_due_filter text DEFAULT 'all'::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(customer_id uuid, customer_name text, invoice_id uuid, invoice_number text, invoice_type text, invoice_status text, due_date date, total_amount numeric, deposit_amount numeric, confirmed_paid_amount numeric, outstanding_amount numeric, days_until_due integer, is_overdue boolean, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit  int  := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset int  := GREATEST(COALESCE(p_offset, 0), 0);
  v_search text := NULLIF(trim(COALESCE(p_search, '')), '');
  v_filter text := COALESCE(p_due_filter, 'all');
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_filter NOT IN ('all','overdue','today','tomorrow','future') THEN
    RAISE EXCEPTION 'invalid due filter: %', v_filter USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    v.customer_id, v.customer_name, v.invoice_id, v.invoice_number,
    v.invoice_type, v.invoice_status, v.due_date, v.total_amount,
    v.deposit_amount, v.confirmed_paid_amount, v.outstanding_amount,
    v.days_until_due, v.is_overdue, v.created_at
  FROM public.vw_customer_receivables v
  WHERE (p_customer_id IS NULL OR v.customer_id = p_customer_id)
    AND (p_from_date   IS NULL OR v.due_date   >= p_from_date)
    AND (p_to_date     IS NULL OR v.due_date   <= p_to_date)
    AND (
      v_filter = 'all'
      OR (v_filter = 'overdue'  AND v.is_overdue)
      OR (v_filter = 'today'    AND v.due_date = CURRENT_DATE)
      OR (v_filter = 'tomorrow' AND v.due_date = CURRENT_DATE + 1)
      OR (v_filter = 'future'   AND v.due_date > CURRENT_DATE + 1)
    )
    AND (
      v_search IS NULL
      OR v.customer_name  ILIKE '%'||v_search||'%'
      OR v.invoice_number ILIKE '%'||v_search||'%'
    )
  ORDER BY v.is_overdue DESC, v.due_date NULLS LAST, v.outstanding_amount DESC
  LIMIT v_limit OFFSET v_offset;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_receivables_summary(p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date, p_customer_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(total_outstanding numeric, overdue_outstanding numeric, due_today numeric, due_tomorrow numeric, future_outstanding numeric, items_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(v.outstanding_amount), 0)::numeric                                              AS total_outstanding,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.is_overdue), 0)::numeric                  AS overdue_outstanding,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.due_date = CURRENT_DATE), 0)::numeric     AS due_today,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.due_date = CURRENT_DATE + 1), 0)::numeric AS due_tomorrow,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.due_date > CURRENT_DATE + 1), 0)::numeric AS future_outstanding,
    COUNT(*)::bigint                                                                              AS items_count
  FROM public.vw_customer_receivables v
  WHERE (p_customer_id IS NULL OR v.customer_id = p_customer_id)
    AND (p_from_date   IS NULL OR v.due_date   >= p_from_date)
    AND (p_to_date     IS NULL OR v.due_date   <= p_to_date);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_recent_purchase_label(p_product_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_last timestamptz;
  v_limited numeric;
  v_unavail numeric;
  v_hours numeric;
  v_status text;
  v_is_today boolean;
BEGIN
  IF p_product_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'none',
      'is_today_purchase', false,
      'last_purchase_at', NULL,
      'hours_since', NULL
    );
  END IF;

  SELECT limited_after_hours, unavailable_after_hours
    INTO v_limited, v_unavail
  FROM public.recent_purchase_settings
  WHERE singleton = true
  LIMIT 1;

  IF v_limited IS NULL THEN
    v_limited := 6;
    v_unavail := 12;
  END IF;

  SELECT MAX(created_at) INTO v_last
  FROM public.purchases
  WHERE product_id = p_product_id
    AND status IS DISTINCT FROM 'cancelled';

  IF v_last IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'none',
      'is_today_purchase', false,
      'last_purchase_at', NULL,
      'hours_since', NULL
    );
  END IF;

  v_hours := EXTRACT(EPOCH FROM (now() - v_last)) / 3600.0;

  IF v_hours < v_limited THEN
    v_status := 'full';
    v_is_today := true;
  ELSIF v_hours < v_unavail THEN
    v_status := 'limited';
    v_is_today := true;
  ELSE
    v_status := 'none';
    v_is_today := false;
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'is_today_purchase', v_is_today,
    'last_purchase_at', v_last,
    'hours_since', round(v_hours::numeric, 2)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_sales_search_products(p_search text DEFAULT ''::text, p_brand_ids uuid[] DEFAULT NULL::uuid[], p_category_ids uuid[] DEFAULT NULL::uuid[], p_label_ids uuid[] DEFAULT NULL::uuid[], p_stock_status text DEFAULT NULL::text, p_product_type text DEFAULT NULL::text, p_only_with_price boolean DEFAULT false, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, sku text, product_type text, stock_status text, color text, capacity text, model text, description text, primary_spec text, brand jsonb, category jsonb, labels jsonb, prices jsonb, is_unavailable_for_sales boolean, has_purchase_price boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_privileged boolean := false;
  v_is_sales boolean := false;
  v_term text := COALESCE(NULLIF(public.normalize_fa_text(p_search), ''), '');
  v_pattern text;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_has_labels boolean := (p_label_ids IS NOT NULL AND array_length(p_label_ids, 1) IS NOT NULL);
  v_has_term boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  v_is_privileged := has_any_role(v_uid, ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]);
  v_is_sales := has_any_role(v_uid, ARRAY['sales'::app_role]) OR v_is_privileged;

  IF NOT v_is_sales THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Allow label-only browsing without a search term.
  -- Otherwise, require at least 2 characters in the search term.
  IF NOT v_has_labels AND length(v_term) < 2 THEN
    RETURN;
  END IF;

  v_has_term := length(v_term) >= 2;
  v_pattern := '%' || replace(replace(v_term, '%', ''), '_', '') || '%';

  RETURN QUERY
  WITH base AS (
    SELECT p.id, p.name, p.sku, p.product_type::text AS product_type,
           p.stock_status::text AS stock_status,
           p.color, p.capacity, p.model, p.description, p.primary_spec,
           p.brand_id, p.category_id
    FROM products p
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.is_active = true
      AND (
        NOT v_has_term
        OR (
             public.normalize_fa_text(p.name) ILIKE v_pattern
          OR (p.sku IS NOT NULL AND public.normalize_fa_text(p.sku) ILIKE v_pattern)
          OR (p.model IS NOT NULL AND public.normalize_fa_text(p.model) ILIKE v_pattern)
          OR (p.color IS NOT NULL AND public.normalize_fa_text(p.color) ILIKE v_pattern)
          OR (p.capacity IS NOT NULL AND public.normalize_fa_text(p.capacity) ILIKE v_pattern)
          OR (p.primary_spec IS NOT NULL AND public.normalize_fa_text(p.primary_spec) ILIKE v_pattern)
          OR (b.name IS NOT NULL AND public.normalize_fa_text(b.name) ILIKE v_pattern)
          OR (c.name IS NOT NULL AND public.normalize_fa_text(c.name) ILIKE v_pattern)
          OR EXISTS (
            SELECT 1 FROM product_category_attribute_values pcav
            WHERE pcav.product_id = p.id
              AND pcav.value IS NOT NULL
              AND public.normalize_fa_text(pcav.value) ILIKE v_pattern
          )
        )
      )
      AND (p_brand_ids IS NULL OR p.brand_id = ANY(p_brand_ids))
      AND (p_category_ids IS NULL OR p.category_id = ANY(p_category_ids))
      AND (p_stock_status IS NULL OR p.stock_status::text = p_stock_status)
      AND (p_product_type IS NULL OR p.product_type::text = p_product_type)
      AND (
        NOT v_has_labels
        OR EXISTS (
          SELECT 1 FROM product_label_links pll
          WHERE pll.product_id = p.id AND pll.label_id = ANY(p_label_ids)
        )
      )
      AND (
        v_is_privileged
        OR p.stock_status::text <> 'unavailable'
        OR EXISTS (SELECT 1 FROM product_computed_prices pcp WHERE pcp.product_id = p.id)
      )
    ORDER BY p.name ASC
    LIMIT v_limit OFFSET v_offset
  ),
  with_prices AS (
    SELECT b.*,
      (
        SELECT jsonb_agg(jsonb_build_object(
          'sale_price_type_id', spt.id,
          'code', spt.code,
          'title', spt.title,
          'sort_order', spt.sort_order,
          'current_price', pcp.rounded_sale_price,
          'previous_price', (
            SELECT h2.new_sale_price
            FROM product_sale_price_history h2
            WHERE h2.product_id = b.id
              AND h2.sale_price_type_id = spt.id
              AND h2.created_at < (
                SELECT MAX(h3.created_at) FROM product_sale_price_history h3
                WHERE h3.product_id = b.id AND h3.sale_price_type_id = spt.id
              )
            ORDER BY h2.created_at DESC LIMIT 1
          ),
          'last_updated_at', (
            SELECT MAX(h.created_at) FROM product_sale_price_history h
            WHERE h.product_id = b.id AND h.sale_price_type_id = spt.id
          )
        ) ORDER BY spt.sort_order, spt.title)
        FROM sale_price_types spt
        JOIN product_computed_prices pcp ON pcp.product_id = b.id AND pcp.sale_price_type_id = spt.id
        WHERE spt.is_active = true
          AND (NOT (b.stock_status = 'unavailable' AND NOT v_is_privileged))
      ) AS prices_json,
      (b.stock_status = 'unavailable') AS is_unavailable_for_sales,
      EXISTS (
        SELECT 1 FROM purchase_prices pp
        WHERE pp.product_id = b.id AND pp.is_active = true
      ) AS has_purchase_price
    FROM base b
  )
  SELECT
    wp.id, wp.name, wp.sku, wp.product_type, wp.stock_status,
    wp.color, wp.capacity, wp.model, wp.description, wp.primary_spec,
    (SELECT jsonb_build_object('id', br.id, 'name', br.name) FROM brands br WHERE br.id = wp.brand_id) AS brand,
    (SELECT jsonb_build_object('id', ca.id, 'name', ca.name) FROM categories ca WHERE ca.id = wp.category_id) AS category,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', pl.id, 'title', pl.title, 'color', pl.color, 'visibility', pl.visibility))
      FROM product_label_links pll
      JOIN product_labels pl ON pl.id = pll.label_id
      WHERE pll.product_id = wp.id
        AND (v_is_privileged OR pl.visibility <> 'internal')
    ), '[]'::jsonb) AS labels,
    COALESCE(wp.prices_json, '[]'::jsonb) AS prices,
    wp.is_unavailable_for_sales,
    wp.has_purchase_price
  FROM with_prices wp
  WHERE (
    NOT p_only_with_price
    OR jsonb_array_length(COALESCE(wp.prices_json, '[]'::jsonb)) > 0
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_penalties(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, type text, severity text, description text, is_active boolean, created_at timestamp with time zone, inquiry_id uuid, has_appeal boolean, appeal_status text, can_appeal boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target uuid;
BEGIN
  v_target := COALESCE(p_user_id, auth.uid());

  IF v_target <> auth.uid()
     AND NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  THEN
    RAISE EXCEPTION 'دسترسی ندارید';
  END IF;

  RETURN QUERY
  SELECT
    pp.id,
    pp.type,
    pp.severity,
    pp.description,
    pp.is_active,
    pp.created_at,
    pp.inquiry_id,
    EXISTS (SELECT 1 FROM public.penalty_appeals pa WHERE pa.penalty_id = pp.id) AS has_appeal,
    (SELECT pa.status FROM public.penalty_appeals pa WHERE pa.penalty_id = pp.id) AS appeal_status,
    (
      pp.is_active = true
      AND pp.created_at > now() - interval '24 hours'
      AND NOT EXISTS (SELECT 1 FROM public.penalty_appeals pa WHERE pa.penalty_id = pp.id)
    ) AS can_appeal
  FROM public.performance_penalties pp
  WHERE pp.user_id = v_target
  ORDER BY pp.created_at DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_workflow_setting(p_process_key text)
 RETURNS workflow_settings
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT * FROM public.workflow_settings WHERE process_key = p_process_key;
$function$
;

CREATE OR REPLACE FUNCTION public.get_workflow_settings()
 RETURNS SETOF workflow_settings
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT * FROM public.workflow_settings ORDER BY process_key;
$function$
;

CREATE OR REPLACE FUNCTION public.gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_extract_query_trgm$function$
;

CREATE OR REPLACE FUNCTION public.gin_extract_value_trgm(text, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_extract_value_trgm$function$
;

CREATE OR REPLACE FUNCTION public.gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_trgm_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal)
 RETURNS "char"
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_trgm_triconsistent$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_compress$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_consistent(internal, text, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_decompress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_decompress$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_distance(internal, text, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_distance$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_in(cstring)
 RETURNS gtrgm
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_in$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_options(internal)
 RETURNS void
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE
AS '$libdir/pg_trgm', $function$gtrgm_options$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_out(gtrgm)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_out$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_penalty$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_picksplit$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_same(gtrgm, gtrgm, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_same$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_union(internal, internal)
 RETURNS gtrgm
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_union$function$
;

CREATE OR REPLACE FUNCTION public.guard_accountant_purchase_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Admin/manager bypass guard
  IF public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]) THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'accountant'::app_role) THEN
    -- Accountant may only set paid_at/paid_by; everything else must remain unchanged
    IF NEW.product_id      IS DISTINCT FROM OLD.product_id      OR
       NEW.supplier_id     IS DISTINCT FROM OLD.supplier_id     OR
       NEW.payment_term_id IS DISTINCT FROM OLD.payment_term_id OR
       NEW.purchase_price  IS DISTINCT FROM OLD.purchase_price  OR
       NEW.cash_price      IS DISTINCT FROM OLD.cash_price      OR
       NEW.cash_price_currency IS DISTINCT FROM OLD.cash_price_currency OR
       NEW.currency        IS DISTINCT FROM OLD.currency        OR
       NEW.quantity        IS DISTINCT FROM OLD.quantity        OR
       NEW.purchase_date   IS DISTINCT FROM OLD.purchase_date   OR
       NEW.total_amount    IS DISTINCT FROM OLD.total_amount    OR
       NEW.notes           IS DISTINCT FROM OLD.notes           OR
       NEW.status          IS DISTINCT FROM OLD.status          OR
       NEW.created_by      IS DISTINCT FROM OLD.created_by      OR
       NEW.number          IS DISTINCT FROM OLD.number
    THEN
      RAISE EXCEPTION 'حسابدار فقط مجاز به ثبت زمان پرداخت است';
    END IF;

    IF NEW.paid_at IS NOT NULL AND NEW.paid_by IS NULL THEN
      NEW.paid_by := auth.uid();
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.halfvec(halfvec, integer, boolean)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_accum(double precision[], halfvec)
 RETURNS double precision[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_accum$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_add(halfvec, halfvec)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_add$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_avg(double precision[])
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_avg$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_cmp(halfvec, halfvec)
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_cmp$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_combine(double precision[], double precision[])
 RETURNS double precision[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_combine$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_concat(halfvec, halfvec)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_concat$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_eq(halfvec, halfvec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_eq$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_ge(halfvec, halfvec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_ge$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_gt(halfvec, halfvec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_gt$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_in(cstring, oid, integer)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_in$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_l2_squared_distance(halfvec, halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_l2_squared_distance$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_le(halfvec, halfvec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_le$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_lt(halfvec, halfvec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_lt$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_mul(halfvec, halfvec)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_mul$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_ne(halfvec, halfvec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_ne$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_negative_inner_product(halfvec, halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_negative_inner_product$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_out(halfvec)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_out$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_recv(internal, oid, integer)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_recv$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_send(halfvec)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_send$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_spherical_distance(halfvec, halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_spherical_distance$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_sub(halfvec, halfvec)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_sub$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_to_float4(halfvec, integer, boolean)
 RETURNS real[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_to_float4$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_to_sparsevec(halfvec, integer, boolean)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_to_sparsevec$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_to_vector(halfvec, integer, boolean)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_to_vector$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_typmod_in(cstring[])
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_typmod_in$function$
;

CREATE OR REPLACE FUNCTION public.hamming_distance(bit, bit)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$hamming_distance$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_first boolean;
  v_full_name text;
  v_phone text;
  v_position text;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
  v_phone := NEW.raw_user_meta_data->>'phone';
  v_position := NEW.raw_user_meta_data->>'position_proposed';

  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first;

  INSERT INTO public.profiles (id, full_name, phone, position, status, is_active, registered_at)
  VALUES (
    NEW.id,
    v_full_name,
    v_phone,
    v_position,
    CASE WHEN is_first THEN 'active' ELSE 'pending' END,
    true,
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  -- First user becomes admin
  IF is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Audit log (actor = the new user)
  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (NEW.id, 'user', NEW.id::text, 'user_registered',
          jsonb_build_object('email', NEW.email, 'full_name', v_full_name, 'phone', v_phone));

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  insert into public.user_roles (user_id, role) values (new.id, 'viewer');
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles app_role[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select exists(select 1 from public.user_roles where user_id = _user_id and role = any(_roles)) $function$
;

CREATE OR REPLACE FUNCTION public.has_dynamic_permission(_user_id uuid, _module text, _action text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _col text;
  _matched boolean;
  _exists boolean;
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Admin shortcut
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'::app_role
  ) THEN
    RETURN true;
  END IF;

  _col := CASE _action
    WHEN 'view' THEN 'can_view'
    WHEN 'create' THEN 'can_create'
    WHEN 'update' THEN 'can_update'
    WHEN 'delete' THEN 'can_delete'
    WHEN 'approve' THEN 'can_approve'
    WHEN 'export' THEN 'can_export'
    WHEN 'view_sensitive' THEN 'can_view_sensitive'
    ELSE NULL
  END;

  IF _col IS NULL THEN
    RETURN false;
  END IF;

  -- Check if any dynamic row exists for this user's roles + module
  EXECUTE format($f$
    SELECT
      EXISTS (
        SELECT 1
        FROM public.role_permissions rp
        JOIN public.user_roles ur
          ON ur.role::text = rp.role_name
        WHERE ur.user_id = $1
          AND rp.module = $2
      ),
      COALESCE(bool_or(rp.%I), false)
    FROM public.role_permissions rp
    JOIN public.user_roles ur
      ON ur.role::text = rp.role_name
    WHERE ur.user_id = $1
      AND rp.module = $2
  $f$, _col)
  INTO _exists, _matched
  USING _user_id, _module;

  IF _exists THEN
    RETURN _matched;
  END IF;

  -- Fallback: sensible defaults based on legacy static matrix
  IF _action IN ('view') THEN
    RETURN public.has_any_role(_user_id, ARRAY['admin','manager','accountant','sales','viewer']::app_role[]);
  ELSIF _action IN ('create','update') THEN
    RETURN public.has_any_role(_user_id, ARRAY['admin','manager']::app_role[]);
  ELSIF _action = 'delete' THEN
    RETURN public.has_role(_user_id, 'admin'::app_role);
  ELSIF _action IN ('approve','export') THEN
    RETURN public.has_any_role(_user_id, ARRAY['admin','manager','accountant']::app_role[]);
  ELSIF _action = 'view_sensitive' THEN
    RETURN public.has_any_role(_user_id, ARRAY['admin','manager','accountant']::app_role[]);
  END IF;

  RETURN false;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select exists(select 1 from public.user_roles where user_id = _user_id and role = _role) $function$
;

CREATE OR REPLACE FUNCTION public.hnsw_bit_support(internal)
 RETURNS internal
 LANGUAGE c
AS '$libdir/vector', $function$hnsw_bit_support$function$
;

CREATE OR REPLACE FUNCTION public.hnsw_halfvec_support(internal)
 RETURNS internal
 LANGUAGE c
AS '$libdir/vector', $function$hnsw_halfvec_support$function$
;

CREATE OR REPLACE FUNCTION public.hnsw_sparsevec_support(internal)
 RETURNS internal
 LANGUAGE c
AS '$libdir/vector', $function$hnsw_sparsevec_support$function$
;

CREATE OR REPLACE FUNCTION public.hnswhandler(internal)
 RETURNS index_am_handler
 LANGUAGE c
AS '$libdir/vector', $function$hnswhandler$function$
;

CREATE OR REPLACE FUNCTION public.hold_capital_allocation(p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _snap uuid;
  _cca record;
  _sca record;
  _c_avail numeric;
  _s_avail numeric;
  _c_held_before numeric;
  _s_held_before numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'مبلغ باید بزرگتر از صفر باشد'; END IF;
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'sales'::app_role,'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  SELECT id INTO _snap FROM public.daily_capital_snapshots WHERE is_active = true;
  IF _snap IS NULL THEN RAISE EXCEPTION 'هیچ snapshot سرمایه فعال وجود ندارد'; END IF;

  SELECT * INTO _cca FROM public.customer_capital_allocations
   WHERE customer_id = p_customer_id AND capital_snapshot_id = _snap AND status='approved'
   FOR UPDATE;
  IF _cca.id IS NULL THEN RAISE EXCEPTION 'مشتری در snapshot فعال تخصیص تأییدشده ندارد'; END IF;

  SELECT * INTO _sca FROM public.salesperson_capital_allocations
   WHERE id = _cca.salesperson_allocation_id AND status='approved'
   FOR UPDATE;
  IF _sca.id IS NULL THEN RAISE EXCEPTION 'فروشنده تخصیص تأییدشده ندارد'; END IF;

  _c_avail := _cca.final_amount - _cca.held_amount - _cca.consumed_amount;
  _s_avail := _sca.final_amount - _sca.held_amount - _sca.consumed_amount;
  IF p_amount > _c_avail THEN RAISE EXCEPTION 'سهم سرمایه مشتری کافی نیست (مانده: %)', _c_avail; END IF;
  IF p_amount > _s_avail THEN RAISE EXCEPTION 'سهم سرمایه فروشنده کافی نیست (مانده: %)', _s_avail; END IF;

  _c_held_before := _cca.held_amount;
  _s_held_before := _sca.held_amount;

  UPDATE public.customer_capital_allocations
     SET held_amount = held_amount + p_amount, updated_at = now()
   WHERE id = _cca.id;
  INSERT INTO public.capital_allocation_ledger
    (allocation_kind, allocation_id, transaction_type, amount,
     held_before, held_after, consumed_before, consumed_after,
     reference_type, reference_id, actor_id, metadata)
  VALUES ('customer', _cca.id, 'hold', p_amount,
          _c_held_before, _c_held_before + p_amount, _cca.consumed_amount, _cca.consumed_amount,
          'invoice', p_invoice_id, COALESCE(p_user_id, auth.uid()),
          jsonb_build_object('customer_id', p_customer_id, 'snapshot_id', _snap));

  UPDATE public.salesperson_capital_allocations
     SET held_amount = held_amount + p_amount, updated_at = now()
   WHERE id = _sca.id;
  INSERT INTO public.capital_allocation_ledger
    (allocation_kind, allocation_id, transaction_type, amount,
     held_before, held_after, consumed_before, consumed_after,
     reference_type, reference_id, actor_id, metadata)
  VALUES ('salesperson', _sca.id, 'hold', p_amount,
          _s_held_before, _s_held_before + p_amount, _sca.consumed_amount, _sca.consumed_amount,
          'invoice', p_invoice_id, COALESCE(p_user_id, auth.uid()),
          jsonb_build_object('salesperson_id', _sca.salesperson_id, 'snapshot_id', _snap, 'customer_allocation_id', _cca.id));

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff)
  VALUES (COALESCE(p_user_id, auth.uid()), 'capital_allocation_hold', 'invoice', p_invoice_id::text,
          jsonb_build_object('amount', p_amount, 'customer_allocation_id', _cca.id, 'salesperson_allocation_id', _sca.id));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.hold_credit(p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_available numeric;
  v_held numeric;
  v_new_available numeric;
  v_new_held numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ باید بزرگتر از صفر باشد';
  END IF;

  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'sales'::app_role, 'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  PERFORM public._ensure_credit_balance(p_customer_id);

  SELECT available_credit, held_credit
    INTO v_available, v_held
    FROM public.customer_credit_balance
   WHERE customer_id = p_customer_id
   FOR UPDATE;

  IF v_available < p_amount THEN
    RAISE EXCEPTION 'اعتبار کافی نیست (موجودی: %، درخواست: %)', v_available, p_amount;
  END IF;

  v_new_available := v_available - p_amount;
  v_new_held := v_held + p_amount;

  UPDATE public.customer_credit_balance
     SET available_credit = v_new_available,
         held_credit = v_new_held,
         last_transaction_at = now(),
         updated_at = now()
   WHERE customer_id = p_customer_id;

  INSERT INTO public.customer_credit_ledger
    (customer_id, transaction_type, amount, balance_before, balance_after, reference_type, reference_id, description, created_by)
  VALUES
    (p_customer_id, 'hold', -p_amount, v_available, v_new_available, 'invoice', p_invoice_id, 'مسدودسازی اعتبار برای پیش‌فاکتور', p_user_id);

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, diff)
  VALUES (
    COALESCE(p_user_id, auth.uid()),
    'credit_hold',
    'customer',
    p_customer_id::text,
    jsonb_build_object('amount', p_amount, 'invoice_id', p_invoice_id, 'balance_before', v_available, 'balance_after', v_new_available)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.import_dynamic_table_rows(p_table_id uuid, p_rows jsonb, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _session_id uuid := COALESCE(p_session_id, gen_random_uuid());
  _row jsonb;
  _row_id uuid;
  _row_num bigint;
  _col record;
  _val text;
  _v_num numeric;
  _v_bool boolean;
  _v_date date;
  _v_dt timestamptz;
  _inserted int := 0;
  _total int := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::app_role[]) THEN
    RAISE EXCEPTION 'دسترسی لازم را ندارید.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dynamic_tables WHERE id = p_table_id AND is_active = true) THEN
    RAISE EXCEPTION 'جدول یافت نشد یا غیرفعال است.' USING ERRCODE = 'P0002';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'ورودی باید آرایه‌ای از ردیف‌ها باشد.' USING ERRCODE = '22023';
  END IF;

  _total := jsonb_array_length(p_rows);
  IF _total = 0 THEN
    RETURN jsonb_build_object(
      'inserted', 0, 'total', 0,
      'session_id', _session_id, 'atomic', true
    );
  END IF;
  IF _total > 5000 THEN
    RAISE EXCEPTION 'حداکثر ۵۰۰۰ ردیف در هر واردسازی مجاز است.' USING ERRCODE = '22023';
  END IF;

  -- The whole loop runs inside the function's implicit transaction;
  -- any RAISE EXCEPTION rolls back ALL inserts from this call (atomic).
  FOR _row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO public.dynamic_table_row_counters(table_id, last_value, updated_at)
    VALUES (p_table_id, 1, now())
    ON CONFLICT (table_id) DO UPDATE
      SET last_value = public.dynamic_table_row_counters.last_value + 1,
          updated_at = now()
    RETURNING last_value INTO _row_num;

    INSERT INTO public.dynamic_table_rows(table_id, row_number)
    VALUES (p_table_id, _row_num)
    RETURNING id INTO _row_id;

    FOR _col IN
      SELECT * FROM public.dynamic_table_columns WHERE table_id = p_table_id
    LOOP
      _val := NULLIF(btrim(COALESCE(_row->>_col.column_key, '')), '');

      IF _val IS NULL THEN
        IF _col.is_required THEN
          RAISE EXCEPTION 'مقدار ستون «%» الزامی است.', _col.label USING ERRCODE = '22023';
        END IF;
        CONTINUE;
      END IF;

      _v_num := NULL; _v_bool := NULL; _v_date := NULL; _v_dt := NULL;

      BEGIN
        IF _col.data_type = 'number' THEN
          _v_num := _val::numeric;
        ELSIF _col.data_type = 'boolean' THEN
          IF _val ILIKE 'true' OR _val = '1' OR _val ILIKE 'yes' OR _val = 'بله' THEN
            _v_bool := true;
          ELSIF _val ILIKE 'false' OR _val = '0' OR _val ILIKE 'no' OR _val = 'خیر' THEN
            _v_bool := false;
          ELSE
            RAISE EXCEPTION 'مقدار بولی نامعتبر';
          END IF;
        ELSIF _col.data_type = 'date' THEN
          _v_date := _val::date;
        ELSIF _col.data_type = 'datetime' THEN
          _v_dt := _val::timestamptz;
        END IF;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'مقدار نامعتبر برای ستون «%»: %', _col.label, _val USING ERRCODE = '22023';
      END;

      INSERT INTO public.dynamic_table_cells(
        table_id, row_id, column_id,
        value_text, value_number, value_boolean, value_date, value_datetime
      ) VALUES (
        p_table_id, _row_id, _col.id,
        CASE WHEN _col.data_type IN ('number','boolean','date','datetime') THEN NULL ELSE _val END,
        _v_num, _v_bool, _v_date, _v_dt
      );
    END LOOP;

    _inserted := _inserted + 1;
  END LOOP;

  INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (
    _uid,
    'dynamic_table',
    p_table_id::text,
    'csv_import',
    jsonb_build_object(
      'table_id', p_table_id,
      'import_session_id', _session_id,
      'total_rows', _total,
      'inserted_rows', _inserted,
      'atomic', true,
      'imported_at', now()
    )
  );

  RETURN jsonb_build_object(
    'inserted', _inserted,
    'total', _total,
    'session_id', _session_id,
    'atomic', true
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.increase_credit(p_customer_id uuid, p_amount numeric, p_receipt_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_available numeric;
  v_held numeric;
  v_new_available numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ باید بزرگتر از صفر باشد';
  END IF;

  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز برای افزایش اعتبار';
  END IF;

  PERFORM public._ensure_credit_balance(p_customer_id);

  SELECT available_credit, held_credit
    INTO v_available, v_held
    FROM public.customer_credit_balance
   WHERE customer_id = p_customer_id
   FOR UPDATE;

  v_new_available := v_available + p_amount;

  UPDATE public.customer_credit_balance
     SET available_credit = v_new_available,
         last_transaction_at = now(),
         updated_at = now()
   WHERE customer_id = p_customer_id;

  INSERT INTO public.customer_credit_ledger
    (customer_id, transaction_type, amount, balance_before, balance_after, reference_type, reference_id, description, created_by)
  VALUES
    (p_customer_id, 'payment', p_amount, v_available, v_new_available, 'receipt', p_receipt_id, 'افزایش اعتبار با تأیید فیش واریزی', p_user_id);

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, diff)
  VALUES (
    COALESCE(p_user_id, auth.uid()),
    'credit_payment',
    'customer',
    p_customer_id::text,
    jsonb_build_object('amount', p_amount, 'receipt_id', p_receipt_id, 'balance_before', v_available, 'balance_after', v_new_available)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.inner_product(sparsevec, sparsevec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_inner_product$function$
;

CREATE OR REPLACE FUNCTION public.inner_product(vector, vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$inner_product$function$
;

CREATE OR REPLACE FUNCTION public.inner_product(halfvec, halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_inner_product$function$
;

CREATE OR REPLACE FUNCTION public.invoices_log_type_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.invoice_type = 'advance_payment' THEN
      INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      VALUES (
        auth.uid(), 'invoice', NEW.id::text, 'advance_payment_issued',
        jsonb_build_object(
          'invoice_id', NEW.id,
          'issued_by', NEW.issued_by,
          'total_amount', NEW.total_amount,
          'customer_id', NEW.customer_id
        )
      );
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND COALESCE(OLD.invoice_type,'') <> COALESCE(NEW.invoice_type,'') THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (
      auth.uid(), 'invoice', NEW.id::text, 'invoice_type_changed',
      jsonb_build_object('old', OLD.invoice_type, 'new', NEW.invoice_type)
    );
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_board_approved(_user_id uuid, _board_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_board_manager(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.pricing_board_access_requests
      WHERE user_id = _user_id
        AND board_key = _board_key
        AND status = 'approved'
    );
$function$
;

CREATE OR REPLACE FUNCTION public.is_board_manager(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','manager','accountant')
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_hr_manager(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','manager')
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_messenger_group_member(_group_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.messenger_group_members
    WHERE group_id = _group_id AND user_id = _user_id
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_product_owner(_user_id uuid, _product_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.product_owner_assignments
    WHERE user_id = _user_id AND product_id = _product_id
  )
$function$
;

CREATE OR REPLACE FUNCTION public.ivfflat_bit_support(internal)
 RETURNS internal
 LANGUAGE c
AS '$libdir/vector', $function$ivfflat_bit_support$function$
;

CREATE OR REPLACE FUNCTION public.ivfflat_halfvec_support(internal)
 RETURNS internal
 LANGUAGE c
AS '$libdir/vector', $function$ivfflat_halfvec_support$function$
;

CREATE OR REPLACE FUNCTION public.ivfflathandler(internal)
 RETURNS index_am_handler
 LANGUAGE c
AS '$libdir/vector', $function$ivfflathandler$function$
;

CREATE OR REPLACE FUNCTION public.jaccard_distance(bit, bit)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$jaccard_distance$function$
;

CREATE OR REPLACE FUNCTION public.kd_bump_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.title IS DISTINCT FROM OLD.title)
     OR (NEW.content IS DISTINCT FROM OLD.content)
     OR (NEW.category IS DISTINCT FROM OLD.category)
     OR (NEW.access_level IS DISTINCT FROM OLD.access_level) THEN
    NEW.version := COALESCE(OLD.version, 1) + 1;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.kd_role_can_view(_uid uuid, _access_level text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE _access_level
    WHEN 'all' THEN true
    WHEN 'manager_only' THEN public.has_any_role(_uid, ARRAY['admin'::app_role,'manager'::app_role])
    WHEN 'finance_only' THEN public.has_any_role(_uid, ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role])
    WHEN 'admin_only' THEN public.has_role(_uid, 'admin'::app_role)
    ELSE false
  END
$function$
;

CREATE OR REPLACE FUNCTION public.l1_distance(halfvec, halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_l1_distance$function$
;

CREATE OR REPLACE FUNCTION public.l1_distance(sparsevec, sparsevec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_l1_distance$function$
;

CREATE OR REPLACE FUNCTION public.l1_distance(vector, vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$l1_distance$function$
;

CREATE OR REPLACE FUNCTION public.l2_distance(halfvec, halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_l2_distance$function$
;

CREATE OR REPLACE FUNCTION public.l2_distance(sparsevec, sparsevec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_l2_distance$function$
;

CREATE OR REPLACE FUNCTION public.l2_distance(vector, vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$l2_distance$function$
;

CREATE OR REPLACE FUNCTION public.l2_norm(sparsevec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_l2_norm$function$
;

CREATE OR REPLACE FUNCTION public.l2_norm(halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_l2_norm$function$
;

CREATE OR REPLACE FUNCTION public.l2_normalize(halfvec)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_l2_normalize$function$
;

CREATE OR REPLACE FUNCTION public.l2_normalize(vector)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$l2_normalize$function$
;

CREATE OR REPLACE FUNCTION public.l2_normalize(sparsevec)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_l2_normalize$function$
;

CREATE OR REPLACE FUNCTION public.league_tier_from_index(_idx integer)
 RETURNS league_tier
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE LEAST(GREATEST(_idx, 1), 6)
    WHEN 1 THEN 'Bronze'::public.league_tier
    WHEN 2 THEN 'Silver'::public.league_tier
    WHEN 3 THEN 'Gold'::public.league_tier
    WHEN 4 THEN 'Platinum'::public.league_tier
    WHEN 5 THEN 'Diamond'::public.league_tier
    WHEN 6 THEN 'Legend'::public.league_tier
  END;
$function$
;

CREATE OR REPLACE FUNCTION public.league_tier_index(_tier league_tier)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE _tier
    WHEN 'Bronze'   THEN 1
    WHEN 'Silver'   THEN 2
    WHEN 'Gold'     THEN 3
    WHEN 'Platinum' THEN 4
    WHEN 'Diamond'  THEN 5
    WHEN 'Legend'   THEN 6
  END;
$function$
;

CREATE OR REPLACE FUNCTION public.list_market_rate_ticks_public(p_indicator_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 15)
 RETURNS TABLE(id uuid, indicator_id uuid, source_id uuid, value numeric, unit text, observed_at timestamp with time zone, jalali_date_label text, change_amount numeric, change_percent numeric, status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'احراز هویت لازم است'; END IF;
  IF NOT (
       public.has_role(v_uid,'admin'::public.app_role)
    OR public.has_role(v_uid,'manager'::public.app_role)
    OR public.has_role(v_uid,'accountant'::public.app_role)
    OR public.has_role(v_uid,'sales'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'دسترسی به نرخ‌های بازار مجاز نیست';
  END IF;

  RETURN QUERY
  SELECT t.id, t.indicator_id, t.source_id, t.value, t.unit, t.observed_at,
         t.jalali_date_label, t.change_amount, t.change_percent, t.status
  FROM public.market_rate_ticks t
  WHERE t.status = 'accepted'
    AND (p_indicator_id IS NULL OR t.indicator_id = p_indicator_id)
  ORDER BY t.observed_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 15), 1), 50);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_customer_responsible_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.responsible_id::text,'') IS DISTINCT FROM COALESCE(NEW.responsible_id::text,'') THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (
      auth.uid(),
      'customer',
      NEW.id::text,
      'customer_responsible_changed',
      jsonb_build_object(
        'customer_id', NEW.id,
        'old_responsible_id', OLD.responsible_id,
        'new_responsible_id', NEW.responsible_id
      )
    );
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_event(_entity_type text, _entity_id text, _action text, _diff jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  values (auth.uid(), _entity_type, _entity_id, _action, _diff);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.log_invoice_issuance_blocked_overdue(p_customer_id uuid, p_overdue_amount numeric, p_overdue_count integer, p_oldest_due_date date, p_invoice_type text DEFAULT NULL::text, p_commitment_confirmed boolean DEFAULT NULL::boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_can boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'p_customer_id الزامی است' USING ERRCODE = '22023';
  END IF;

  -- محافظت در برابر لاگ جعلی: فقط اگر مشتری واقعاً معوقه دارد، ثبت شود
  SELECT can_issue INTO v_can
  FROM public.can_issue_customer_invoice(p_customer_id);
  IF v_can IS DISTINCT FROM false THEN
    RETURN;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, diff)
  VALUES (
    v_uid,
    'invoice_issuance_blocked_overdue',
    'invoice',
    p_customer_id::text,
    jsonb_build_object(
      'customer_id', p_customer_id,
      'invoice_type', p_invoice_type,
      'commitment_confirmed', p_commitment_confirmed,
      'overdue_amount', p_overdue_amount,
      'overdue_count', p_overdue_count,
      'oldest_due_date', p_oldest_due_date,
      'source', 'ui_pre_check'
    )
  );
END
$function$
;

CREATE OR REPLACE FUNCTION public.log_market_product_match_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.market_product_match_events
      (match_id, event_type, old_status, new_status, actor, details)
    VALUES
      (NEW.id, 'created', NULL, NEW.match_status, NEW.matched_by,
       jsonb_build_object('source_name', NEW.source_name));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.match_status IS DISTINCT FROM OLD.match_status THEN
      INSERT INTO public.market_product_match_events
        (match_id, event_type, old_status, new_status, actor, actor_user_id, details)
      VALUES
        (NEW.id, 'status_changed', OLD.match_status, NEW.match_status,
         COALESCE(NEW.matched_by,'system'::public.market_match_actor),
         NEW.reviewed_by, '{}'::jsonb);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count int;
BEGIN
  UPDATE public.notification_queue
    SET is_read = true, read_at = now()
    WHERE user_id = auth.uid() AND is_read = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.notification_queue
    SET is_read = true, read_at = now()
    WHERE id = p_notification_id AND user_id = auth.uid();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.market_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$
;

CREATE OR REPLACE FUNCTION public.messenger_attachment_path_owner(_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT split_part(_name, '/', 1) = auth.uid()::text
$function$
;

CREATE OR REPLACE FUNCTION public.messenger_attachment_size_ok(_name text, _size bigint)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE lower(regexp_replace(_name, '^.*\.', ''))
    WHEN 'jpg'  THEN _size <= 5242880
    WHEN 'jpeg' THEN _size <= 5242880
    WHEN 'png'  THEN _size <= 5242880
    WHEN 'webp' THEN _size <= 5242880
    WHEN 'mp4'  THEN _size <= 52428800
    WHEN 'webm' THEN _size <= 52428800
    WHEN 'pdf'  THEN _size <= 20971520
    WHEN 'doc'  THEN _size <= 10485760
    WHEN 'docx' THEN _size <= 10485760
    WHEN 'zip'  THEN _size <= 5242880
    WHEN 'xlsx' THEN _size <= 5242880
    ELSE false
  END
$function$
;

CREATE OR REPLACE FUNCTION public.messenger_attachment_visible(_name text, _uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.messenger_attachments a
    JOIN public.messenger_messages m ON m.id = a.message_id
    WHERE a.file_path = _name
      AND public.is_messenger_group_member(m.group_id, _uid)
  )
$function$
;

CREATE OR REPLACE FUNCTION public.mi_get_demand_growth(p_days integer DEFAULT 1)
 RETURNS TABLE(current_score numeric, previous_score numeric, growth_percent numeric, status text, range_days integer, current_event_count integer, previous_event_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 1), 1), 365);
  v_cur_start timestamptz;
  v_prev_start timestamptz;
  v_cur_score numeric;
  v_prev_score numeric;
  v_cur_count integer;
  v_prev_count integer;
  v_growth numeric;
  v_status text;
BEGIN
  PERFORM _mi_require_privileged();

  IF v_days = 1 THEN
    v_cur_start  := date_trunc('day', now());
    v_prev_start := date_trunc('day', now()) - interval '1 day';
  ELSE
    v_cur_start  := now() - make_interval(days => v_days);
    v_prev_start := now() - make_interval(days => v_days * 2);
  END IF;

  SELECT
    COALESCE(SUM(CASE event_type
      WHEN 'price_checked' THEN 4
      WHEN 'board_price_viewed' THEN 3
      WHEN 'chart_opened' THEN 2
      WHEN 'search_result_viewed' THEN 1
      WHEN 'product_details_opened' THEN 2
      ELSE 0 END), 0)::numeric,
    COUNT(*)::int
  INTO v_cur_score, v_cur_count
  FROM product_interaction_events
  WHERE created_at >= v_cur_start
    AND (v_days = 1 OR created_at < now());

  SELECT
    COALESCE(SUM(CASE event_type
      WHEN 'price_checked' THEN 4
      WHEN 'board_price_viewed' THEN 3
      WHEN 'chart_opened' THEN 2
      WHEN 'search_result_viewed' THEN 1
      WHEN 'product_details_opened' THEN 2
      ELSE 0 END), 0)::numeric,
    COUNT(*)::int
  INTO v_prev_score, v_prev_count
  FROM product_interaction_events
  WHERE created_at >= v_prev_start
    AND created_at < v_cur_start;

  IF v_prev_score = 0 AND v_cur_score = 0 THEN
    v_growth := 0;
    v_status := 'no_data';
  ELSIF v_prev_score = 0 THEN
    v_growth := 100;
    v_status := 'strong_growth';
  ELSE
    v_growth := ROUND(((v_cur_score - v_prev_score) / v_prev_score) * 100, 2);
    v_status := CASE
      WHEN v_growth >= 50 THEN 'strong_growth'
      WHEN v_growth >= 10 THEN 'moderate_growth'
      WHEN v_growth > -10 THEN 'flat'
      ELSE 'declining'
    END;
  END IF;

  RETURN QUERY SELECT v_cur_score, v_prev_score, v_growth, v_status, v_days, v_cur_count, v_prev_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mi_get_emerging_products(p_days integer DEFAULT 7, p_limit integer DEFAULT 10)
 RETURNS TABLE(product_id uuid, name text, sku text, brand jsonb, category jsonb, stock_status text, current_score integer, previous_score integer, growth_percent numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 7), 1), 365);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
  v_min_score integer := 6;
BEGIN
  PERFORM _mi_require_privileged();
  RETURN QUERY
  WITH cur AS (
    SELECT e.product_id,
      SUM(CASE e.event_type
        WHEN 'price_checked' THEN 4 WHEN 'board_price_viewed' THEN 3
        WHEN 'chart_opened' THEN 2 WHEN 'product_details_opened' THEN 2
        WHEN 'search_result_viewed' THEN 1 ELSE 0 END)::int AS score
    FROM product_interaction_events e
    WHERE e.created_at >= now() - make_interval(days => v_days)
    GROUP BY e.product_id
  ),
  prev AS (
    SELECT e.product_id,
      SUM(CASE e.event_type
        WHEN 'price_checked' THEN 4 WHEN 'board_price_viewed' THEN 3
        WHEN 'chart_opened' THEN 2 WHEN 'product_details_opened' THEN 2
        WHEN 'search_result_viewed' THEN 1 ELSE 0 END)::int AS score
    FROM product_interaction_events e
    WHERE e.created_at >= now() - make_interval(days => v_days * 2)
      AND e.created_at <  now() - make_interval(days => v_days)
    GROUP BY e.product_id
  ),
  top_trending AS (
    SELECT cur.product_id FROM cur ORDER BY cur.score DESC LIMIT 10
  ),
  joined AS (
    SELECT c.product_id, c.score AS cur_score, COALESCE(p.score, 0) AS prev_score,
      CASE WHEN COALESCE(p.score, 0) = 0 THEN 999
           ELSE ROUND(((c.score - p.score)::numeric / p.score) * 100, 2) END AS growth_percent
    FROM cur c
    LEFT JOIN prev p ON p.product_id = c.product_id
    WHERE c.score >= v_min_score
      AND (COALESCE(p.score, 0) = 0 OR c.score >= 2 * p.score)
      AND c.product_id NOT IN (SELECT top_trending.product_id FROM top_trending)
  )
  SELECT p.id, p.name, p.sku,
    (SELECT jsonb_build_object('id', b.id, 'name', b.name) FROM brands b WHERE b.id = p.brand_id),
    (SELECT jsonb_build_object('id', c2.id, 'name', c2.name) FROM categories c2 WHERE c2.id = p.category_id),
    p.stock_status::text,
    j.cur_score, j.prev_score, j.growth_percent
  FROM joined j
  JOIN products p ON p.id = j.product_id
    AND p.is_active = true
    AND p.stock_status::text IN ('available','limited')
  ORDER BY j.growth_percent DESC, j.cur_score DESC
  LIMIT v_limit;
END; $function$
;

CREATE OR REPLACE FUNCTION public.mi_get_hot_brands(p_days integer DEFAULT 7, p_limit integer DEFAULT 10)
 RETURNS TABLE(brand_id uuid, brand_name text, interaction_count integer, unique_product_count integer, previous_count integer, growth_percent numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 7), 1), 365);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
BEGIN
  PERFORM _mi_require_privileged();

  RETURN QUERY
  WITH cur AS (
    SELECT p.brand_id,
           COUNT(*)::int AS cnt,
           COUNT(DISTINCT e.product_id)::int AS upc
    FROM product_interaction_events e
    JOIN products p ON p.id = e.product_id
    WHERE e.created_at >= now() - make_interval(days => v_days)
      AND p.brand_id IS NOT NULL
    GROUP BY p.brand_id
  ),
  prev AS (
    SELECT p.brand_id, COUNT(*)::int AS cnt
    FROM product_interaction_events e
    JOIN products p ON p.id = e.product_id
    WHERE e.created_at >= now() - make_interval(days => v_days * 2)
      AND e.created_at <  now() - make_interval(days => v_days)
      AND p.brand_id IS NOT NULL
    GROUP BY p.brand_id
  )
  SELECT
    c.brand_id,
    b.name AS brand_name,
    c.cnt AS interaction_count,
    c.upc AS unique_product_count,
    COALESCE(pr.cnt, 0) AS previous_count,
    CASE
      WHEN COALESCE(pr.cnt, 0) = 0 AND c.cnt > 0 THEN 100
      WHEN COALESCE(pr.cnt, 0) = 0 THEN 0
      ELSE ROUND(((c.cnt - pr.cnt)::numeric / pr.cnt) * 100, 2)
    END AS growth_percent
  FROM cur c
  JOIN brands b ON b.id = c.brand_id
  LEFT JOIN prev pr ON pr.brand_id = c.brand_id
  ORDER BY c.cnt DESC
  LIMIT v_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mi_get_hot_categories(p_days integer DEFAULT 7, p_limit integer DEFAULT 10)
 RETURNS TABLE(category_id uuid, category_name text, interaction_count integer, unique_product_count integer, previous_count integer, growth_percent numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 7), 1), 365);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
BEGIN
  PERFORM _mi_require_privileged();

  RETURN QUERY
  WITH cur AS (
    SELECT p.category_id,
           COUNT(*)::int AS cnt,
           COUNT(DISTINCT e.product_id)::int AS upc
    FROM product_interaction_events e
    JOIN products p ON p.id = e.product_id
    WHERE e.created_at >= now() - make_interval(days => v_days)
      AND p.category_id IS NOT NULL
    GROUP BY p.category_id
  ),
  prev AS (
    SELECT p.category_id, COUNT(*)::int AS cnt
    FROM product_interaction_events e
    JOIN products p ON p.id = e.product_id
    WHERE e.created_at >= now() - make_interval(days => v_days * 2)
      AND e.created_at <  now() - make_interval(days => v_days)
      AND p.category_id IS NOT NULL
    GROUP BY p.category_id
  )
  SELECT
    c.category_id,
    cat.name AS category_name,
    c.cnt AS interaction_count,
    c.upc AS unique_product_count,
    COALESCE(pr.cnt, 0) AS previous_count,
    CASE
      WHEN COALESCE(pr.cnt, 0) = 0 AND c.cnt > 0 THEN 100
      WHEN COALESCE(pr.cnt, 0) = 0 THEN 0
      ELSE ROUND(((c.cnt - pr.cnt)::numeric / pr.cnt) * 100, 2)
    END AS growth_percent
  FROM cur c
  JOIN categories cat ON cat.id = c.category_id
  LEFT JOIN prev pr ON pr.category_id = c.category_id
  ORDER BY c.cnt DESC
  LIMIT v_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mi_get_market_index(p_days integer DEFAULT 7)
 RETURNS TABLE(index_change_percent numeric, product_count integer, rising_count integer, falling_count integer, flat_count integer, status text, range_days integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 7), 1), 365);
BEGIN
  PERFORM _mi_require_privileged();

  RETURN QUERY
  WITH window_history AS (
    SELECT h.product_id, h.sale_price_type_id, h.new_sale_price, h.created_at,
           ROW_NUMBER() OVER (PARTITION BY h.product_id, h.sale_price_type_id ORDER BY h.created_at ASC)  AS rn_first,
           ROW_NUMBER() OVER (PARTITION BY h.product_id, h.sale_price_type_id ORDER BY h.created_at DESC) AS rn_last
    FROM product_sale_price_history h
    WHERE h.created_at >= now() - make_interval(days => v_days)
      AND h.sale_price_type_id IS NOT NULL
  ),
  pairs AS (
    SELECT f.product_id, f.sale_price_type_id,
           f.new_sale_price AS start_price,
           l.new_sale_price AS end_price
    FROM window_history f
    JOIN window_history l
      ON l.product_id = f.product_id
     AND l.sale_price_type_id = f.sale_price_type_id
     AND l.rn_last = 1
    WHERE f.rn_first = 1
      AND f.new_sale_price IS NOT NULL
      AND l.new_sale_price IS NOT NULL
      AND f.new_sale_price > 0
  ),
  filtered AS (
    SELECT pr.product_id,
           AVG((pr.end_price - pr.start_price) / pr.start_price * 100) AS change_pct
    FROM pairs pr
    JOIN products p ON p.id = pr.product_id
    WHERE p.is_active = true
      AND p.stock_status::text IN ('available','limited')
    GROUP BY pr.product_id
  ),
  agg AS (
    SELECT
      ROUND(AVG(change_pct)::numeric, 2) AS index_change_percent,
      COUNT(*)::int AS product_count,
      COUNT(*) FILTER (WHERE change_pct > 0.0001)::int AS rising_count,
      COUNT(*) FILTER (WHERE change_pct < -0.0001)::int AS falling_count,
      COUNT(*) FILTER (WHERE change_pct BETWEEN -0.0001 AND 0.0001)::int AS flat_count
    FROM filtered
  )
  SELECT
    a.index_change_percent,
    a.product_count,
    a.rising_count,
    a.falling_count,
    a.flat_count,
    CASE
      WHEN a.product_count = 0 THEN 'no_data'
      WHEN a.index_change_percent > 1 THEN 'rising'
      WHEN a.index_change_percent < -1 THEN 'falling'
      WHEN ABS(a.index_change_percent) <= 0.5 THEN 'flat'
      ELSE 'volatile'
    END AS status,
    v_days AS range_days
  FROM agg a;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mi_get_price_movers(p_days integer DEFAULT 7, p_direction text DEFAULT 'up'::text, p_sale_price_type_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 10)
 RETURNS TABLE(product_id uuid, name text, sku text, brand jsonb, category jsonb, stock_status text, sale_price_type_id uuid, sale_price_type_title text, start_price numeric, end_price numeric, change_amount numeric, change_percent numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 7), 1), 365);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
  v_dir text := lower(COALESCE(p_direction, 'up'));
BEGIN
  PERFORM _mi_require_privileged();
  IF v_dir NOT IN ('up','down') THEN v_dir := 'up'; END IF;

  RETURN QUERY
  WITH window_history AS (
    SELECT h.product_id, h.sale_price_type_id, h.new_sale_price, h.created_at,
           ROW_NUMBER() OVER (PARTITION BY h.product_id, h.sale_price_type_id ORDER BY h.created_at ASC)  AS rn_first,
           ROW_NUMBER() OVER (PARTITION BY h.product_id, h.sale_price_type_id ORDER BY h.created_at DESC) AS rn_last
    FROM product_sale_price_history h
    WHERE h.created_at >= now() - make_interval(days => v_days)
      AND h.sale_price_type_id IS NOT NULL
      AND (p_sale_price_type_id IS NULL OR h.sale_price_type_id = p_sale_price_type_id)
  ),
  pairs AS (
    SELECT f.product_id, f.sale_price_type_id,
           f.new_sale_price AS start_price,
           l.new_sale_price AS end_price
    FROM window_history f
    JOIN window_history l
      ON l.product_id = f.product_id
     AND l.sale_price_type_id = f.sale_price_type_id
     AND l.rn_last = 1
    WHERE f.rn_first = 1
      AND f.new_sale_price IS NOT NULL
      AND l.new_sale_price IS NOT NULL
      AND f.new_sale_price > 0
      AND f.new_sale_price <> l.new_sale_price
  ),
  scored AS (
    SELECT pr.product_id, pr.sale_price_type_id, pr.start_price, pr.end_price,
           (pr.end_price - pr.start_price) AS change_amount,
           ROUND(((pr.end_price - pr.start_price) / pr.start_price) * 100, 2) AS change_percent
    FROM pairs pr
  )
  SELECT
    p.id AS product_id,
    p.name,
    p.sku,
    (SELECT jsonb_build_object('id', b.id, 'name', b.name) FROM brands b WHERE b.id = p.brand_id) AS brand,
    (SELECT jsonb_build_object('id', c.id, 'name', c.name) FROM categories c WHERE c.id = p.category_id) AS category,
    p.stock_status::text,
    s.sale_price_type_id,
    spt.title AS sale_price_type_title,
    s.start_price, s.end_price, s.change_amount, s.change_percent
  FROM scored s
  JOIN products p ON p.id = s.product_id AND p.is_active = true
  JOIN sale_price_types spt ON spt.id = s.sale_price_type_id
  WHERE (v_dir = 'up'   AND s.change_percent > 0)
     OR (v_dir = 'down' AND s.change_percent < 0)
  ORDER BY (CASE WHEN v_dir = 'up' THEN s.change_percent ELSE -s.change_percent END) DESC
  LIMIT v_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mi_get_seller_favorite_products(p_days integer DEFAULT 7, p_limit integer DEFAULT 10)
 RETURNS TABLE(product_id uuid, name text, sku text, brand jsonb, category jsonb, stock_status text, interaction_count integer, last_interaction_at timestamp with time zone, current_price numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 7), 1), 365);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
BEGIN
  PERFORM _mi_require_privileged();

  RETURN QUERY
  WITH sales_users AS (
    SELECT ur.user_id FROM user_roles ur WHERE ur.role = 'sales'::app_role
  ),
  agg AS (
    SELECT e.product_id,
           COUNT(*)::int AS interaction_count,
           MAX(e.created_at) AS last_interaction_at
    FROM product_interaction_events e
    JOIN sales_users su ON su.user_id = e.user_id
    WHERE e.created_at >= now() - make_interval(days => v_days)
    GROUP BY e.product_id
  ),
  latest_price AS (
    SELECT DISTINCT ON (h.product_id) h.product_id, h.new_sale_price
    FROM product_sale_price_history h
    WHERE h.product_id IN (SELECT product_id FROM agg)
    ORDER BY h.product_id, h.created_at DESC
  )
  SELECT
    p.id AS product_id,
    p.name, p.sku,
    (SELECT jsonb_build_object('id', b.id, 'name', b.name) FROM brands b WHERE b.id = p.brand_id) AS brand,
    (SELECT jsonb_build_object('id', c.id, 'name', c.name) FROM categories c WHERE c.id = p.category_id) AS category,
    p.stock_status::text,
    a.interaction_count,
    a.last_interaction_at,
    lp.new_sale_price AS current_price
  FROM agg a
  JOIN products p ON p.id = a.product_id AND p.is_active = true
  LEFT JOIN latest_price lp ON lp.product_id = a.product_id
  ORDER BY a.interaction_count DESC, a.last_interaction_at DESC
  LIMIT v_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mi_get_seller_top_products(p_days integer DEFAULT 7, p_limit integer DEFAULT 10)
 RETURNS TABLE(product_id uuid, name text, sku text, brand jsonb, category jsonb, stock_status text, seller_interaction_count integer, unique_seller_count integer, last_interaction_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 7), 1), 365);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
BEGIN
  PERFORM _mi_require_privileged();

  RETURN QUERY
  WITH sellers AS (
    SELECT DISTINCT user_id FROM user_roles WHERE role = 'sales'::app_role
  ),
  agg AS (
    SELECT
      e.product_id,
      COUNT(*)::int AS seller_interaction_count,
      COUNT(DISTINCT e.user_id)::int AS unique_seller_count,
      MAX(e.created_at) AS last_interaction_at
    FROM product_interaction_events e
    JOIN sellers s ON s.user_id = e.user_id
    WHERE e.created_at >= now() - make_interval(days => v_days)
      AND e.event_type IN ('price_checked','chart_opened','product_details_opened','search_result_viewed')
    GROUP BY e.product_id
  )
  SELECT
    p.id AS product_id,
    p.name,
    p.sku,
    (SELECT jsonb_build_object('id', b.id, 'name', b.name) FROM brands b WHERE b.id = p.brand_id) AS brand,
    (SELECT jsonb_build_object('id', c.id, 'name', c.name) FROM categories c WHERE c.id = p.category_id) AS category,
    p.stock_status::text,
    a.seller_interaction_count,
    a.unique_seller_count,
    a.last_interaction_at
  FROM agg a
  JOIN products p ON p.id = a.product_id AND p.is_active = true
  ORDER BY a.seller_interaction_count DESC, a.unique_seller_count DESC, p.name ASC
  LIMIT v_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mi_get_top_checked_today(p_limit integer DEFAULT 10)
 RETURNS TABLE(product_id uuid, name text, sku text, brand jsonb, category jsonb, stock_status text, current_price numeric, price_check_count integer, unique_user_count integer, last_interaction_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
BEGIN
  PERFORM _mi_require_privileged();
  RETURN QUERY
  WITH agg AS (
    SELECT e.product_id,
      COUNT(*) FILTER (WHERE e.event_type IN ('price_checked','board_price_viewed'))::int AS price_check_count,
      COUNT(DISTINCT e.user_id) FILTER (WHERE e.user_id IS NOT NULL)::int AS unique_user_count,
      MAX(e.created_at) AS last_interaction_at
    FROM product_interaction_events e
    WHERE e.created_at >= date_trunc('day', now())
      AND e.event_type IN ('price_checked','board_price_viewed','chart_opened','product_details_opened','search_result_viewed')
    GROUP BY e.product_id
    HAVING COUNT(*) FILTER (WHERE e.event_type IN ('price_checked','board_price_viewed')) > 0
  ),
  latest_price AS (
    SELECT DISTINCT ON (h.product_id) h.product_id, h.new_sale_price
    FROM product_sale_price_history h
    WHERE h.product_id IN (SELECT agg.product_id FROM agg)
    ORDER BY h.product_id, h.created_at DESC
  )
  SELECT p.id, p.name, p.sku,
    (SELECT jsonb_build_object('id', b.id, 'name', b.name) FROM brands b WHERE b.id = p.brand_id),
    (SELECT jsonb_build_object('id', c.id, 'name', c.name) FROM categories c WHERE c.id = p.category_id),
    p.stock_status::text,
    lp.new_sale_price, a.price_check_count, a.unique_user_count, a.last_interaction_at
  FROM agg a
  JOIN products p ON p.id = a.product_id AND p.is_active = true
  LEFT JOIN latest_price lp ON lp.product_id = a.product_id
  ORDER BY a.price_check_count DESC, a.unique_user_count DESC, p.name ASC
  LIMIT v_limit;
END; $function$
;

CREATE OR REPLACE FUNCTION public.mi_get_trending_products(p_days integer DEFAULT 7, p_limit integer DEFAULT 10)
 RETURNS TABLE(product_id uuid, name text, sku text, brand jsonb, category jsonb, stock_status text, search_count integer, price_view_count integer, chart_view_count integer, board_view_count integer, trend_score integer, current_price numeric, previous_price numeric, change_percent numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 7), 1), 365);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
BEGIN
  PERFORM _mi_require_privileged();
  RETURN QUERY
  WITH agg AS (
    SELECT e.product_id,
      COUNT(*) FILTER (WHERE e.event_type = 'search_result_viewed')::int AS search_count,
      COUNT(*) FILTER (WHERE e.event_type = 'price_checked')::int        AS price_view_count,
      COUNT(*) FILTER (WHERE e.event_type = 'chart_opened')::int         AS chart_view_count,
      COUNT(*) FILTER (WHERE e.event_type = 'board_price_viewed')::int   AS board_view_count
    FROM product_interaction_events e
    WHERE e.created_at >= now() - make_interval(days => v_days)
    GROUP BY e.product_id
  ),
  scored AS (
    SELECT a.product_id, a.search_count, a.price_view_count, a.chart_view_count, a.board_view_count,
      (a.search_count*3 + a.price_view_count*4 + a.chart_view_count*2 + a.board_view_count*1) AS trend_score
    FROM agg a
  ),
  latest_price AS (
    SELECT DISTINCT ON (h.product_id)
      h.product_id, h.new_sale_price, h.old_sale_price, h.change_percent, h.created_at
    FROM product_sale_price_history h
    WHERE h.product_id IN (SELECT scored.product_id FROM scored)
    ORDER BY h.product_id, h.created_at DESC
  )
  SELECT p.id, p.name, p.sku,
    (SELECT jsonb_build_object('id', b.id, 'name', b.name) FROM brands b WHERE b.id = p.brand_id),
    (SELECT jsonb_build_object('id', c.id, 'name', c.name) FROM categories c WHERE c.id = p.category_id),
    p.stock_status::text,
    s.search_count, s.price_view_count, s.chart_view_count, s.board_view_count, s.trend_score,
    lp.new_sale_price, lp.old_sale_price, lp.change_percent
  FROM scored s
  JOIN products p ON p.id = s.product_id AND p.is_active = true
  LEFT JOIN latest_price lp ON lp.product_id = s.product_id
  ORDER BY s.trend_score DESC, p.name ASC
  LIMIT v_limit;
END; $function$
;

CREATE OR REPLACE FUNCTION public.next_product_sku(_year integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _next integer;
  _sku text;
begin
  insert into public.product_sku_counters (year, last_value, updated_at)
  values (_year, 1, now())
  on conflict (year) do update
    set last_value = public.product_sku_counters.last_value + 1,
        updated_at = now()
  returning last_value into _next;

  _sku := 'AFK-' || _year::text || '-' || lpad(_next::text, 5, '0');
  return _sku;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.next_sales_quote_number(_year integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _next integer;
BEGIN
  INSERT INTO public.sales_quote_counters (year, last_value, updated_at)
  VALUES (_year, 1, now())
  ON CONFLICT (year) DO UPDATE
    SET last_value = public.sales_quote_counters.last_value + 1,
        updated_at = now()
  RETURNING last_value INTO _next;

  RETURN 'SQ-' || _year::text || '-' || lpad(_next::text, 6, '0');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_fa(input text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$
  SELECT NULLIF(
    regexp_replace(
      lower(
        translate(
          coalesce(input, ''),
          'كيىﻱﻲﻳﻴةۀﺁﺂﺃﺄإأﺇﺈؤئﺅﺉ' ||
          '٠١٢٣٤٥٦٧٨٩' ||
          '۰۱۲۳۴۵۶۷۸۹' ||
          E'\u200c\u200f\u200e\u064b\u064c\u064d\u064e\u064f\u0650\u0651\u0652',
          'كيييييههاااااايييي' ||
          '0123456789' ||
          '0123456789' ||
          '            '
        )
      ),
      '\s+', ' ', 'g'
    ),
    ''
  );
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_fa_text(input text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT CASE WHEN input IS NULL THEN NULL ELSE
    regexp_replace(
      translate(
        lower(input),
        'يىكٔ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
        'ییک 01234567890123456789'
      ),
      '\s+', ' ', 'g'
    )
  END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_on_stock_available()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_req record;
  v_prices text;
  v_count int := 0;
BEGIN
  IF NEW.stock_status IS DISTINCT FROM OLD.stock_status
     AND NEW.stock_status = 'available'
     AND OLD.stock_status IN ('unavailable','limited','unknown') THEN

    -- Build price summary string (latest per sale_price_type)
    SELECT string_agg(
             COALESCE(spt.name, 'قیمت') || ': ' || to_char(h.new_sale_price, 'FM999,999,999,999'),
             E'\n'
           )
      INTO v_prices
    FROM (
      SELECT DISTINCT ON (sale_price_type_id)
             sale_price_type_id, new_sale_price
      FROM public.product_sale_price_history
      WHERE product_id = NEW.id
      ORDER BY sale_price_type_id, created_at DESC
    ) h
    LEFT JOIN public.sale_price_types spt ON spt.id = h.sale_price_type_id;

    FOR v_req IN
      SELECT id, salesperson_id, customer_name, customer_phone
      FROM public.stock_alert_requests
      WHERE product_id = NEW.id
        AND status = 'open'
        AND salesperson_id IS NOT NULL
      LIMIT 100
    LOOP
      INSERT INTO public.notification_queue(user_id, title, body, type, reference_type, reference_id)
      VALUES (
        v_req.salesperson_id,
        'موجود شدن کالا',
        'محصول «' || COALESCE(NEW.name, '') || '» موجود شد.' || E'\n' ||
        'مشتری: ' || v_req.customer_name || ' (' || v_req.customer_phone || ')' ||
        CASE WHEN v_prices IS NOT NULL THEN E'\n\nقیمت‌ها:\n' || v_prices ELSE '' END,
        'stock_alert',
        'stock_alert_request',
        v_req.id
      );

      UPDATE public.stock_alert_requests
        SET status = 'notified', updated_at = now()
        WHERE id = v_req.id;

      INSERT INTO public.audit_logs(entity_type, entity_id, action, actor_id, diff)
      VALUES ('stock_alert_request', v_req.id::text, 'stock_alert_notified', auth.uid(),
              jsonb_build_object('product_id', NEW.id, 'salesperson_id', v_req.salesperson_id));

      v_count := v_count + 1;
    END LOOP;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't break the product update if notification fails
  RAISE WARNING 'notify_on_stock_available failed: %', SQLERRM;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.post_receipt_accounting(p_receipt_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_receipt public.payment_receipts%ROWTYPE;
  v_link record;
  v_paid numeric;
  v_total numeric;
  v_new_status text;
  v_invoice_updates jsonb := '[]'::jsonb;
  v_journal_id uuid;
  v_existing_journal uuid;
  v_debit_kind text;
  v_debit_ref uuid;
  v_debit_desc text;
  v_balance record;
  v_journal_summary jsonb;
  v_receiver_code text;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز برای ثبت سند حسابداری فیش';
  END IF;

  SELECT * INTO v_receipt
    FROM public.payment_receipts
   WHERE id = p_receipt_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'فیش یافت نشد';
  END IF;

  IF v_receipt.posting_status = 'posted' THEN
    RETURN jsonb_build_object('already_posted', true, 'posted_at', v_receipt.posted_at);
  END IF;

  IF v_receipt.status <> 'approved' THEN
    RAISE EXCEPTION 'فقط فیش تأییدشده قابل ثبت در حسابداری است';
  END IF;

  IF (v_receipt.destination_bank_account_id IS NULL AND v_receipt.receiver_party_id IS NULL)
     OR (v_receipt.destination_bank_account_id IS NOT NULL AND v_receipt.receiver_party_id IS NOT NULL) THEN
    RAISE EXCEPTION 'برای ثبت سند، باید دقیقاً یکی از «بانک ما» یا «طرف خارجی» به‌عنوان گیرنده انتخاب شده باشد';
  END IF;

  -- Resolve receiver accounting code from chosen receiver entity
  IF v_receipt.receiver_accounting_code IS NOT NULL AND length(trim(v_receipt.receiver_accounting_code)) > 0 THEN
    v_receiver_code := v_receipt.receiver_accounting_code;
  ELSIF v_receipt.receiver_party_id IS NOT NULL THEN
    SELECT accounting_code INTO v_receiver_code FROM public.external_parties WHERE id = v_receipt.receiver_party_id;
  ELSIF v_receipt.destination_bank_account_id IS NOT NULL THEN
    SELECT COALESCE(accounting_code, NULL) INTO v_receiver_code
      FROM public.bank_accounts WHERE id = v_receipt.destination_bank_account_id;
  END IF;

  -- Enforce blocking rules from validation_rules for journal_entry scope
  IF EXISTS (
    SELECT 1 FROM public.validation_rules
    WHERE scope='journal_entry' AND enabled AND severity='blocking'
      AND field_key='payer_accounting_code' AND rule_type='required'
  ) AND (v_receipt.payer_accounting_code IS NULL OR length(trim(v_receipt.payer_accounting_code)) = 0) THEN
    RAISE EXCEPTION 'کد آسان واریزکننده برای ثبت سند حسابداری اجباری است.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.validation_rules
    WHERE scope='journal_entry' AND enabled AND severity='blocking'
      AND field_key='receiver_accounting_code' AND rule_type='required'
  ) AND (v_receiver_code IS NULL OR length(trim(v_receiver_code)) = 0) THEN
    RAISE EXCEPTION 'کد آسان گیرنده برای ثبت سند حسابداری اجباری است.';
  END IF;

  UPDATE public.payment_receipts
     SET posting_status = 'posted',
         posted_at = now()
   WHERE id = p_receipt_id;

  PERFORM public.increase_credit(
    v_receipt.customer_id,
    v_receipt.amount,
    v_receipt.id,
    p_user_id
  );

  -- Allocate to invoices
  FOR v_link IN
    SELECT prl.invoice_id, prl.amount AS link_amount, i.total_amount, i.status
      FROM public.payment_receipt_links prl
      JOIN public.invoices i ON i.id = prl.invoice_id
     WHERE prl.receipt_id = p_receipt_id
  LOOP
    SELECT COALESCE(SUM(amount), 0) INTO v_paid
      FROM public.payment_receipt_links
     WHERE invoice_id = v_link.invoice_id;

    v_total := v_link.total_amount;
    IF v_paid >= v_total THEN
      v_new_status := 'paid';
    ELSIF v_paid > 0 THEN
      v_new_status := 'partially_paid';
    ELSE
      v_new_status := 'unpaid';
    END IF;

    UPDATE public.invoices SET status = v_new_status WHERE id = v_link.invoice_id;

    v_invoice_updates := v_invoice_updates || jsonb_build_object(
      'invoice_id', v_link.invoice_id,
      'paid_total', v_paid,
      'new_status', v_new_status
    );
  END LOOP;

  -- Create journal entry (idempotent)
  SELECT id INTO v_existing_journal
    FROM public.journal_entries
   WHERE source_type = 'payment_receipt' AND source_id = v_receipt.id;

  IF v_existing_journal IS NULL THEN
    IF v_receipt.destination_bank_account_id IS NOT NULL THEN
      v_debit_kind := 'bank';
      v_debit_ref  := v_receipt.destination_bank_account_id;
      v_debit_desc := 'واریز به حساب بانکی شرکت';
    ELSE
      v_debit_kind := 'external_party';
      v_debit_ref  := v_receipt.receiver_party_id;
      v_debit_desc := 'پرداخت به طرف خارجی';
    END IF;

    INSERT INTO public.journal_entries(
      source_type, source_id, entry_date, description, status, posted_by,
      payer_accounting_code, receiver_accounting_code
    )
    VALUES (
      'payment_receipt', v_receipt.id, v_receipt.payment_date,
      'سند فیش واریزی شماره ' || v_receipt.tracking_number, 'posted', p_user_id,
      NULLIF(trim(COALESCE(v_receipt.payer_accounting_code,'')), ''),
      NULLIF(trim(COALESCE(v_receiver_code,'')), '')
    )
    RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines(journal_entry_id, line_no, kind, ref_id, debit, credit, description)
    VALUES
      (v_journal_id, 1, v_debit_kind, v_debit_ref, v_receipt.amount, 0, v_debit_desc),
      (v_journal_id, 2, 'customer', v_receipt.customer_id, 0, v_receipt.amount, 'افزایش اعتبار/کاهش بدهی مشتری');
  ELSE
    v_journal_id := v_existing_journal;
    UPDATE public.journal_entries
       SET payer_accounting_code = COALESCE(payer_accounting_code, NULLIF(trim(COALESCE(v_receipt.payer_accounting_code,'')), '')),
           receiver_accounting_code = COALESCE(receiver_accounting_code, NULLIF(trim(COALESCE(v_receiver_code,'')), ''))
     WHERE id = v_journal_id;
  END IF;

  SELECT public.get_customer_credit(v_receipt.customer_id) INTO v_balance;

  v_journal_summary := jsonb_build_object(
    'journal_id', v_journal_id,
    'debit_kind', v_debit_kind,
    'debit_ref', v_debit_ref
  );

  RETURN jsonb_build_object(
    'posted', true,
    'invoice_updates', v_invoice_updates,
    'customer_credit', row_to_json(v_balance),
    'journal', v_journal_summary
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.post_receipt_journal(_receipt_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  entry_id uuid;
BEGIN
  SELECT id, customer_id, amount, payment_date, payer_accounting_code,
         beneficiary_accounting_code, receiver_accounting_code, tracking_number
    INTO r
  FROM public.payment_receipts
  WHERE id = _receipt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'فیش پیدا نشد: %', _receipt_id;
  END IF;

  -- Skip if already posted
  IF EXISTS (SELECT 1 FROM public.journal_entries
             WHERE source_type = 'payment_receipt' AND source_id = _receipt_id::text) THEN
    SELECT id INTO entry_id FROM public.journal_entries
      WHERE source_type = 'payment_receipt' AND source_id = _receipt_id::text
      LIMIT 1;
    RETURN entry_id;
  END IF;

  INSERT INTO public.journal_entries (
    source_type, source_id, entry_date, status,
    payer_accounting_code, receiver_accounting_code, description
  ) VALUES (
    'payment_receipt', _receipt_id::text, COALESCE(r.payment_date, CURRENT_DATE), 'posted',
    r.payer_accounting_code,
    COALESCE(r.beneficiary_accounting_code, r.receiver_accounting_code),
    'سند خودکار فیش واریزی - شماره پیگیری ' || COALESCE(r.tracking_number, '')
  )
  RETURNING id INTO entry_id;

  -- Debit: beneficiary (طلبکار - بدهی ما به او کم می‌شود)
  INSERT INTO public.journal_lines (journal_entry_id, line_no, account_kind, debit, credit, description)
  VALUES (
    entry_id, 1, 'accounting_code',
    r.amount, 0,
    'بدهکار: ' || COALESCE(r.beneficiary_accounting_code, r.receiver_accounting_code, '—')
  );

  -- Credit: payer (پرداخت‌کننده - بدهی او به ما کم می‌شود)
  INSERT INTO public.journal_lines (journal_entry_id, line_no, account_kind, debit, credit, description)
  VALUES (
    entry_id, 2, 'accounting_code',
    0, r.amount,
    'بستانکار: ' || COALESCE(r.payer_accounting_code, '—')
  );

  RETURN entry_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.preview_league_season_changes(_season_id uuid)
 RETURNS TABLE(employee_id uuid, full_name text, current_tier league_tier, score numeric, rank_in_tier integer, suggested_action text, target_tier league_tier)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT (has_role(v_uid, 'admin') OR has_role(v_uid, 'manager')) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT
      el.employee_id,
      el.league AS current_tier,
      el.score,
      ROW_NUMBER() OVER (PARTITION BY el.league ORDER BY el.score DESC, el.employee_id) AS rnk,
      COUNT(*)    OVER (PARTITION BY el.league) AS total_in_tier
    FROM public.employee_leagues el
    WHERE el.season_id = _season_id
    LIMIT 5000
  ),
  tiers AS (
    SELECT tier, sort_order, promotion_percent, demotion_percent
    FROM public.league_settings
    WHERE tier IS NOT NULL AND is_active = true
  ),
  decided AS (
    SELECT
      r.employee_id,
      r.current_tier,
      r.score,
      r.rnk::int AS rank_in_tier,
      CASE
        WHEN r.rnk <= GREATEST(1, FLOOR(r.total_in_tier * t.promotion_percent / 100.0))
             AND EXISTS (SELECT 1 FROM tiers tu WHERE tu.sort_order = t.sort_order + 1)
          THEN 'promote'
        WHEN r.rnk > (r.total_in_tier - GREATEST(0, FLOOR(r.total_in_tier * t.demotion_percent / 100.0)))
             AND EXISTS (SELECT 1 FROM tiers td WHERE td.sort_order = t.sort_order - 1)
          THEN 'demote'
        ELSE 'stay'
      END AS suggested_action,
      t.sort_order AS cur_order
    FROM ranked r
    JOIN tiers t ON t.tier = r.current_tier
  )
  SELECT
    d.employee_id,
    COALESCE(p.full_name, p.email, d.employee_id::text) AS full_name,
    d.current_tier,
    d.score,
    d.rank_in_tier,
    d.suggested_action,
    CASE d.suggested_action
      WHEN 'promote' THEN (SELECT tier FROM tiers WHERE sort_order = d.cur_order + 1)
      WHEN 'demote'  THEN (SELECT tier FROM tiers WHERE sort_order = d.cur_order - 1)
      ELSE d.current_tier
    END AS target_tier
  FROM decided d
  LEFT JOIN public.profiles p ON p.id = d.employee_id
  ORDER BY d.cur_order DESC, d.rank_in_tier ASC
  LIMIT 5000;
END$function$
;

CREATE OR REPLACE FUNCTION public.products_assign_sku()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _year integer := extract(year from coalesce(new.created_at, now()))::integer;
  _attempts integer := 0;
begin
  if (tg_op = 'INSERT') then
    if new.sku is null or btrim(new.sku) = '' then
      loop
        new.sku := public.next_product_sku(_year);
        exit when not exists (select 1 from public.products where sku = new.sku);
        _attempts := _attempts + 1;
        if _attempts > 5 then
          raise exception 'could not allocate unique sku after % attempts', _attempts;
        end if;
      end loop;
    end if;
  elsif (tg_op = 'UPDATE') then
    -- Make SKU immutable
    if new.sku is distinct from old.sku then
      new.sku := old.sku;
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.products_stamp_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (tg_op = 'INSERT') then
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_by := coalesce(new.updated_by, auth.uid());
  elsif (tg_op = 'UPDATE') then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.products_validate_base_currency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_active BOOLEAN;
BEGIN
  IF NEW.base_currency IS NULL OR length(trim(NEW.base_currency)) = 0 THEN
    RAISE EXCEPTION 'base_currency is required';
  END IF;
  NEW.base_currency := lower(trim(NEW.base_currency));
  SELECT is_active INTO v_active FROM public.currencies WHERE code = NEW.base_currency;
  IF v_active IS NULL THEN
    RAISE EXCEPTION 'currency code "%" does not exist', NEW.base_currency;
  END IF;
  IF NOT v_active THEN
    RAISE EXCEPTION 'currency code "%" is not active', NEW.base_currency;
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.query_dynamic_table_rows(p_table_id uuid, p_filters jsonb DEFAULT '[]'::jsonb, p_search text DEFAULT NULL::text, p_show_inactive boolean DEFAULT false, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(total_count bigint, out_row_id uuid, out_row_number bigint, out_is_active boolean, out_created_at timestamp with time zone, out_values jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _filter jsonb;
  _col_id uuid;
  _col_type text;
  _op text;
  _val text;
  _val2 text;
  _search_like text;
  _search_num numeric;
  _limit int;
  _offset int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  _limit := GREATEST(1, LEAST(COALESCE(p_limit, 200), 500));
  _offset := GREATEST(0, COALESCE(p_offset, 0));

  CREATE TEMP TABLE IF NOT EXISTS _q_rows (
    row_id uuid,
    row_number bigint,
    is_active boolean,
    created_at timestamptz
  ) ON COMMIT DROP;
  TRUNCATE _q_rows;

  INSERT INTO _q_rows (row_id, row_number, is_active, created_at)
  SELECT r.id, r.row_number, r.is_active, r.created_at
  FROM public.dynamic_table_rows r
  WHERE r.table_id = p_table_id
    AND (p_show_inactive OR r.is_active = true);

  IF p_search IS NOT NULL AND length(btrim(p_search)) > 0 THEN
    _search_like := '%' || btrim(p_search) || '%';
    BEGIN
      _search_num := btrim(p_search)::numeric;
    EXCEPTION WHEN others THEN
      _search_num := NULL;
    END;

    DELETE FROM _q_rows q
    WHERE NOT (
      (_search_num IS NOT NULL AND q.row_number = _search_num::bigint)
      OR EXISTS (
        SELECT 1
        FROM public.dynamic_table_cells c
        JOIN public.dynamic_table_columns col ON col.id = c.column_id
        WHERE c.row_id = q.row_id
          AND c.table_id = p_table_id
          AND col.data_type::text IN ('text','phone','tag','status')
          AND c.value_text ILIKE _search_like
      )
    );
  END IF;

  IF p_filters IS NOT NULL AND jsonb_typeof(p_filters) = 'array' THEN
    FOR _filter IN SELECT * FROM jsonb_array_elements(p_filters) LOOP
      _col_id := NULLIF(_filter->>'column_id','')::uuid;
      _op := lower(COALESCE(_filter->>'op',''));
      _val := _filter->>'value';
      _val2 := _filter->>'value2';

      IF _col_id IS NULL OR _op = '' THEN CONTINUE; END IF;

      SELECT col.data_type::text INTO _col_type
      FROM public.dynamic_table_columns col
      WHERE col.id = _col_id AND col.table_id = p_table_id;
      IF _col_type IS NULL THEN CONTINUE; END IF;

      IF _col_type = 'boolean' THEN
        IF _op = 'empty' THEN
          DELETE FROM _q_rows q WHERE EXISTS (
            SELECT 1 FROM public.dynamic_table_cells c
            WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_boolean IS NOT NULL
          );
        ELSIF _op IN ('true','false','equals') THEN
          DELETE FROM _q_rows q WHERE NOT EXISTS (
            SELECT 1 FROM public.dynamic_table_cells c
            WHERE c.row_id = q.row_id AND c.column_id = _col_id
              AND c.value_boolean = (CASE WHEN _op = 'true' OR _val = 'true' THEN true ELSE false END)
          );
        END IF;

      ELSIF _col_type = 'number' THEN
        IF _val IS NULL OR _val = '' THEN CONTINUE; END IF;
        DECLARE _n numeric;
        BEGIN
          BEGIN _n := _val::numeric; EXCEPTION WHEN others THEN CONTINUE; END;
          IF _op = 'equals' OR _op = 'eq' THEN
            DELETE FROM _q_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_number = _n
            );
          ELSIF _op IN ('greater_than','gt') THEN
            DELETE FROM _q_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_number > _n
            );
          ELSIF _op IN ('less_than','lt') THEN
            DELETE FROM _q_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_number < _n
            );
          END IF;
        END;

      ELSIF _col_type = 'date' THEN
        DECLARE _d date; _d2 date;
        BEGIN
          BEGIN _d := NULLIF(_val,'')::date; EXCEPTION WHEN others THEN _d := NULL; END;
          BEGIN _d2 := NULLIF(_val2,'')::date; EXCEPTION WHEN others THEN _d2 := NULL; END;
          IF _d IS NOT NULL THEN
            DELETE FROM _q_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_date >= _d
            );
          END IF;
          IF _d2 IS NOT NULL THEN
            DELETE FROM _q_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_date <= _d2
            );
          END IF;
        END;

      ELSIF _col_type = 'datetime' THEN
        DECLARE _ts timestamptz; _ts2 timestamptz;
        BEGIN
          BEGIN _ts := NULLIF(_val,'')::timestamptz; EXCEPTION WHEN others THEN _ts := NULL; END;
          BEGIN _ts2 := NULLIF(_val2,'')::timestamptz; EXCEPTION WHEN others THEN _ts2 := NULL; END;
          IF _ts IS NOT NULL THEN
            DELETE FROM _q_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_datetime >= _ts
            );
          END IF;
          IF _ts2 IS NOT NULL THEN
            DELETE FROM _q_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_datetime <= _ts2
            );
          END IF;
        END;

      ELSE
        IF _val IS NOT NULL AND _val <> '' THEN
          DECLARE _like text := '%' || btrim(_val) || '%';
          BEGIN
            DELETE FROM _q_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_text ILIKE _like
            );
          END;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN QUERY
  WITH counted AS (
    SELECT count(*)::bigint AS total FROM _q_rows
  ),
  windowed AS (
    SELECT q.row_id, q.row_number, q.is_active, q.created_at
    FROM _q_rows q
    ORDER BY q.row_number ASC
    LIMIT _limit OFFSET _offset
  ),
  pivoted AS (
    SELECT w.row_id,
           COALESCE(
             jsonb_object_agg(
               col.column_key,
               CASE col.data_type::text
                 WHEN 'number'   THEN to_jsonb(c.value_number)
                 WHEN 'boolean'  THEN to_jsonb(c.value_boolean)
                 WHEN 'date'     THEN to_jsonb(c.value_date)
                 WHEN 'datetime' THEN to_jsonb(c.value_datetime)
                 ELSE                  to_jsonb(c.value_text)
               END
             ) FILTER (WHERE col.column_key IS NOT NULL),
             '{}'::jsonb
           ) AS vals
    FROM windowed w
    LEFT JOIN public.dynamic_table_cells c ON c.row_id = w.row_id AND c.table_id = p_table_id
    LEFT JOIN public.dynamic_table_columns col ON col.id = c.column_id
    GROUP BY w.row_id
  )
  SELECT (SELECT total FROM counted) AS total_count,
         w.row_id, w.row_number, w.is_active, w.created_at,
         COALESCE(p.vals, '{}'::jsonb) AS out_values
  FROM windowed w
  LEFT JOIN pivoted p ON p.row_id = w.row_id
  ORDER BY w.row_number ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.query_dynamic_table_rows_v2(p_table_id uuid, p_filters jsonb DEFAULT '[]'::jsonb, p_search text DEFAULT NULL::text, p_show_inactive boolean DEFAULT false, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(total_count bigint, out_row_id uuid, out_row_number bigint, out_is_active boolean, out_created_at timestamp with time zone, out_values jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _slug text;
BEGIN
  SELECT slug INTO _slug FROM public.dynamic_tables WHERE id = p_table_id;

  RETURN QUERY
  SELECT q.total_count,
         q.out_row_id,
         q.out_row_number,
         q.out_is_active,
         q.out_created_at,
         COALESCE(q.out_values, '{}'::jsonb)
           || public._dyn_compute_row_values(p_table_id, q.out_row_id)
           || CASE
                WHEN _slug = 'afrakala-product-price-observatory'
                  THEN public._obs_compute_row_values(q.out_row_id)
                ELSE '{}'::jsonb
              END
  FROM public.query_dynamic_table_rows(p_table_id, p_filters, p_search, p_show_inactive, p_limit, p_offset) q;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.quick_approve_user(_user_id uuid, _role text DEFAULT 'sales'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _role_enum app_role;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admin can approve users';
  END IF;

  BEGIN
    _role_enum := _role::app_role;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid role: %', _role;
  END;

  UPDATE public.profiles
  SET status = 'active', is_active = true, updated_at = now()
  WHERE id = _user_id;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, _role_enum)
  ON CONFLICT (user_id, role) DO NOTHING;

  BEGIN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    VALUES (auth.uid(), 'user_quick_approved', 'profile', _user_id, jsonb_build_object('role', _role));
  EXCEPTION WHEN undefined_table THEN NULL;
        WHEN undefined_column THEN NULL; END;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reactivate_user(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admin can reactivate users';
  END IF;

  UPDATE public.profiles
  SET status = 'active', is_active = true, updated_at = now()
  WHERE id = _user_id;

  BEGIN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    VALUES (auth.uid(), 'user_reactivated', 'profile', _user_id, '{}'::jsonb);
  EXCEPTION WHEN undefined_table THEN NULL;
        WHEN undefined_column THEN NULL; END;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.recompute_all_employee_scores()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _emp uuid;
  _count int := 0;
BEGIN
  FOR _emp IN
    SELECT DISTINCT employee_id FROM (
      SELECT created_by AS employee_id FROM public.invoices WHERE created_by IS NOT NULL
      UNION
      SELECT employee_id FROM public.call_logs WHERE employee_id IS NOT NULL
      UNION
      SELECT employee_id FROM public.employee_scores
    ) src
  LOOP
    BEGIN
      PERFORM public.calculate_employee_score(_emp);
      _count := _count + 1;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
  RETURN _count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.recompute_customer_credit_scores(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(customer_id uuid, score integer, credit_limit numeric, status text, error text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_limit integer;
  v_offset integer;
  r record;
  v_score integer;
  v_limit_amt numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'manager'::app_role)
    OR public.has_role(v_uid, 'accountant'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden: only admin/manager/accountant may run batch recompute';
  END IF;

  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
  v_offset := GREATEST(0, COALESCE(p_offset, 0));

  FOR r IN
    SELECT c.id
    FROM public.customers c
    WHERE c.is_active = true
    ORDER BY c.id
    LIMIT v_limit OFFSET v_offset
  LOOP
    BEGIN
      SELECT cs.score, cs.credit_limit
        INTO v_score, v_limit_amt
        FROM public.calculate_credit_score(r.id) AS cs;

      customer_id := r.id;
      score := v_score;
      credit_limit := v_limit_amt;
      status := 'ok';
      error := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      customer_id := r.id;
      score := NULL;
      credit_limit := NULL;
      status := 'error';
      error := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;

  RETURN;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.recompute_employee_scores_on_call_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _emp uuid;
BEGIN
  IF TG_OP='DELETE' THEN _emp := OLD.employee_id; ELSE _emp := NEW.employee_id; END IF;
  IF _emp IS NOT NULL THEN
    BEGIN
      PERFORM public.calculate_employee_score(_emp);
      INSERT INTO public.employee_score_events(employee_id, event_type, source_table, source_id, payload)
      VALUES (_emp, 'call_'||lower(TG_OP), 'call_logs',
              COALESCE(NEW.id::text, OLD.id::text),
              jsonb_build_object('op', TG_OP));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.recompute_employee_scores_on_invoice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _emp uuid;
BEGIN
  IF TG_OP='DELETE' THEN _emp := OLD.created_by; ELSE _emp := NEW.created_by; END IF;
  IF _emp IS NOT NULL THEN
    BEGIN
      PERFORM public.calculate_employee_score(_emp);
      INSERT INTO public.employee_score_events(employee_id, event_type, source_table, source_id, payload)
      VALUES (_emp, 'invoice_'||lower(TG_OP), 'invoices',
              COALESCE(NEW.id::text, OLD.id::text),
              jsonb_build_object('op', TG_OP));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.recompute_employee_scores_on_receipt()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _emp uuid;
  _whitelist text[] := ARRAY['approved','verified','confirmed','posted'];
  _old_status text;
  _new_status text;
  _receipt_id uuid;
  _should_run boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _new_status := NEW.status;
    _receipt_id := NEW.id;
    _should_run := (_new_status = ANY(_whitelist));
  ELSIF TG_OP = 'DELETE' THEN
    _old_status := OLD.status;
    _receipt_id := OLD.id;
    _should_run := (_old_status = ANY(_whitelist));
  ELSE -- UPDATE
    _old_status := OLD.status;
    _new_status := NEW.status;
    _receipt_id := COALESCE(NEW.id, OLD.id);
    _should_run := (_old_status IS DISTINCT FROM _new_status)
                   AND ( (_old_status = ANY(_whitelist)) OR (_new_status = ANY(_whitelist)) );
  END IF;

  IF NOT _should_run THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  FOR _emp IN
    SELECT DISTINCT i.created_by
    FROM public.payment_receipt_links prl
    JOIN public.invoices i ON i.id = prl.invoice_id
    JOIN public.user_roles ur ON ur.user_id = i.created_by AND ur.role = 'sales'::public.app_role
    WHERE prl.receipt_id = _receipt_id
      AND i.created_by IS NOT NULL
  LOOP
    -- Recompute in its own block: failure here must not be hidden silently
    -- but also must not block the parent DML. Keep recompute isolated from logging.
    BEGIN
      PERFORM public.calculate_employee_score(_emp);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    -- Logging in a SEPARATE block: a logging failure cannot roll back recompute.
    BEGIN
      INSERT INTO public.employee_score_events(employee_id, event_type, source_table, source_id, payload)
      VALUES (
        _emp,
        'receipt_'||lower(TG_OP),
        'payment_receipts',
        _receipt_id::text,
        jsonb_build_object('op', TG_OP, 'old_status', _old_status, 'new_status', _new_status)
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.recompute_employee_scores_on_receipt_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _emp uuid;
  _invoice_id uuid;
  _link_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _invoice_id := NEW.invoice_id;
    _link_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    _invoice_id := OLD.invoice_id;
    _link_id := OLD.id;
  ELSE
    _invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
    _link_id := COALESCE(NEW.id, OLD.id);
  END IF;

  IF _invoice_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT i.created_by INTO _emp
  FROM public.invoices i
  JOIN public.user_roles ur ON ur.user_id = i.created_by AND ur.role = 'sales'::public.app_role
  WHERE i.id = _invoice_id;

  IF _emp IS NOT NULL THEN
    BEGIN
      PERFORM public.calculate_employee_score(_emp);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      INSERT INTO public.employee_score_events(employee_id, event_type, source_table, source_id, payload)
      VALUES (
        _emp,
        'receipt_link_'||lower(TG_OP),
        'payment_receipt_links',
        _link_id::text,
        jsonb_build_object('op', TG_OP, 'invoice_id', _invoice_id)
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_currency_fetch(p_source_id uuid, p_currency currency_code, p_rate numeric, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_count int;
  v_id uuid;
BEGIN
  IF NOT has_any_role(v_user, ARRAY['admin'::app_role, 'accountant'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_rate IS NULL OR p_rate <= 0 THEN
    RAISE EXCEPTION 'invalid rate';
  END IF;

  -- Rate limit: 10/hour per source
  SELECT count(*) INTO v_count
    FROM currency_rate_fetches
    WHERE source_id = p_source_id
      AND fetched_at > now() - interval '1 hour';
  IF v_count >= 10 THEN
    RAISE EXCEPTION 'rate limit exceeded';
  END IF;

  INSERT INTO currency_rate_fetches(source_id, currency, rate, fetched_by, note)
    VALUES (p_source_id, p_currency, p_rate, v_user, p_note)
    RETURNING id INTO v_id;

  INSERT INTO audit_logs(action, entity_type, entity_id, actor_id, diff)
    VALUES ('currency_rate_fetched', 'currency_rate_fetches', v_id::text, v_user,
      jsonb_build_object('source_id', p_source_id, 'currency', p_currency, 'rate', p_rate));

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_external_market_rate_tick(p_indicator_id uuid, p_source_id uuid, p_value numeric, p_observed_at timestamp with time zone, p_source_reported_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_raw_payload jsonb DEFAULT NULL::jsonb, p_unit text DEFAULT 'toman'::text)
 RETURNS TABLE(tick_id uuid, status_out text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_prev numeric; v_change_amt numeric; v_change_pct numeric;
  v_status text := 'accepted'; v_note text;
  v_id uuid; v_ic text; v_sc text; v_conf numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'احراز هویت لازم است'; END IF;
  IF NOT (public.has_role(v_uid,'admin'::public.app_role)
       OR public.has_role(v_uid,'manager'::public.app_role)
       OR public.has_role(v_uid,'accountant'::public.app_role)) THEN
    RAISE EXCEPTION 'دسترسی لازم برای ثبت نرخ خارجی نیست';
  END IF;
  IF p_value IS NULL OR p_value <= 0 THEN
    RAISE EXCEPTION 'مقدار نامعتبر برای نرخ خارجی';
  END IF;

  -- Previous accepted rate for change calc + suspect threshold
  SELECT value INTO v_prev FROM public.market_rate_ticks
   WHERE indicator_id = p_indicator_id AND status = 'accepted'
   ORDER BY observed_at DESC LIMIT 1;

  IF v_prev IS NOT NULL THEN
    v_change_amt := p_value - v_prev;
    v_change_pct := (v_change_amt / v_prev) * 100;
    IF abs(v_change_pct) > 3 THEN
      v_status := 'suspect';
      v_note := 'تغییر بیش از ۳٪ نسبت به آخرین نرخ تأییدشده';
    END IF;
  END IF;

  IF p_source_reported_at IS NOT NULL AND p_source_reported_at < now() - interval '24 hours' THEN
    v_status := 'suspect';
    v_note := COALESCE(v_note || ' | ', '') || 'داده منبع قدیمی‌تر از ۲۴ ساعت';
  END IF;

  SELECT confidence_weight INTO v_conf FROM public.market_rate_sources WHERE id = p_source_id;

  INSERT INTO public.market_rate_ticks
    (indicator_id, source_id, value, unit, observed_at, source_reported_at,
     change_amount, change_percent, status, note, raw_payload, confidence_score, created_by)
  VALUES (p_indicator_id, p_source_id, p_value, COALESCE(p_unit,'toman'), p_observed_at, p_source_reported_at,
     v_change_amt, v_change_pct, v_status, v_note, p_raw_payload, v_conf, v_uid)
  RETURNING id INTO v_id;

  SELECT code INTO v_ic FROM public.market_indicators WHERE id = p_indicator_id;
  SELECT code INTO v_sc FROM public.market_rate_sources WHERE id = p_source_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (v_uid, 'market_rate_tick', v_id, 'market_rate_external_ingested',
    jsonb_build_object(
      'indicator_code', v_ic, 'source_code', v_sc,
      'value', p_value, 'unit', COALESCE(p_unit,'toman'),
      'observed_at', p_observed_at, 'source_reported_at', p_source_reported_at,
      'status', v_status, 'change_percent', v_change_pct
    ));

  RETURN QUERY SELECT v_id, v_status;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_external_market_rate_tick_system(p_indicator_id uuid, p_source_id uuid, p_value numeric, p_observed_at timestamp with time zone, p_source_reported_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_raw_payload jsonb DEFAULT NULL::jsonb, p_unit text DEFAULT 'toman'::text)
 RETURNS TABLE(tick_id uuid, status_out text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_prev numeric; v_change_amt numeric; v_change_pct numeric;
  v_status text := 'accepted'; v_note text;
  v_id uuid; v_ic text; v_sc text; v_conf numeric;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'system RPC: not callable by authenticated users';
  END IF;
  IF p_value IS NULL OR p_value <= 0 THEN
    RAISE EXCEPTION 'مقدار نامعتبر برای نرخ خارجی';
  END IF;

  SELECT value INTO v_prev FROM public.market_rate_ticks
   WHERE indicator_id = p_indicator_id AND status = 'accepted'
   ORDER BY observed_at DESC LIMIT 1;

  IF v_prev IS NOT NULL THEN
    v_change_amt := p_value - v_prev;
    v_change_pct := (v_change_amt / v_prev) * 100;
    IF abs(v_change_pct) > 3 THEN
      v_status := 'suspect';
      v_note := 'تغییر بیش از ۳٪ نسبت به آخرین نرخ تأییدشده';
    END IF;
  END IF;

  IF p_source_reported_at IS NOT NULL AND p_source_reported_at < now() - interval '24 hours' THEN
    v_status := 'suspect';
    v_note := COALESCE(v_note || ' | ', '') || 'داده منبع قدیمی‌تر از ۲۴ ساعت';
  END IF;

  SELECT confidence_weight INTO v_conf FROM public.market_rate_sources WHERE id = p_source_id;

  INSERT INTO public.market_rate_ticks
    (indicator_id, source_id, value, unit, observed_at, source_reported_at,
     change_amount, change_percent, status, note, raw_payload, confidence_score, created_by)
  VALUES (p_indicator_id, p_source_id, p_value, COALESCE(p_unit,'toman'), p_observed_at, p_source_reported_at,
     v_change_amt, v_change_pct, v_status, v_note, p_raw_payload, v_conf, NULL)
  RETURNING id INTO v_id;

  SELECT code INTO v_ic FROM public.market_indicators WHERE id = p_indicator_id;
  SELECT code INTO v_sc FROM public.market_rate_sources WHERE id = p_source_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (NULL, 'market_rate_tick', v_id, 'market_rate_external_ingested_system',
    jsonb_build_object(
      'indicator_code', v_ic, 'source_code', v_sc,
      'value', p_value, 'unit', COALESCE(p_unit,'toman'),
      'observed_at', p_observed_at, 'source_reported_at', p_source_reported_at,
      'status', v_status, 'change_percent', v_change_pct,
      'initiated_by', 'system_cron'
    ));

  RETURN QUERY SELECT v_id, v_status;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_market_rate_tick(p_indicator_id uuid, p_source_id uuid, p_value numeric, p_observed_at timestamp with time zone, p_status text DEFAULT 'accepted'::text, p_note text DEFAULT NULL::text, p_unit text DEFAULT 'toman'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_prev numeric; v_change_amt numeric; v_change_pct numeric;
  v_id uuid; v_ic text; v_sc text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'احراز هویت لازم است'; END IF;
  IF NOT (public.has_role(v_uid,'admin'::public.app_role)
       OR public.has_role(v_uid,'manager'::public.app_role)
       OR public.has_role(v_uid,'accountant'::public.app_role)) THEN
    RAISE EXCEPTION 'دسترسی لازم برای ثبت نرخ وجود ندارد';
  END IF;
  IF p_value IS NULL OR p_value <= 0 THEN RAISE EXCEPTION 'مقدار نرخ باید بزرگ‌تر از صفر باشد'; END IF;
  IF p_status NOT IN ('accepted','suspect','rejected') THEN RAISE EXCEPTION 'وضعیت نامعتبر'; END IF;

  SELECT value INTO v_prev FROM public.market_rate_ticks
  WHERE indicator_id = p_indicator_id AND status = 'accepted'
  ORDER BY observed_at DESC LIMIT 1;

  IF v_prev IS NOT NULL THEN
    v_change_amt := p_value - v_prev;
    v_change_pct := (v_change_amt / v_prev) * 100;
  END IF;

  INSERT INTO public.market_rate_ticks
    (indicator_id, source_id, value, unit, observed_at, change_amount, change_percent, status, note, created_by)
  VALUES (p_indicator_id, p_source_id, p_value, COALESCE(p_unit,'toman'), p_observed_at, v_change_amt, v_change_pct, p_status, p_note, v_uid)
  RETURNING id INTO v_id;

  SELECT code INTO v_ic FROM public.market_indicators WHERE id = p_indicator_id;
  SELECT code INTO v_sc FROM public.market_rate_sources WHERE id = p_source_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (v_uid, 'market_rate_tick', v_id::text, 'market_rate_created',
    jsonb_build_object('indicator_code', v_ic, 'source_code', v_sc, 'value', p_value,
      'unit', COALESCE(p_unit,'toman'), 'observed_at', p_observed_at, 'status', p_status,
      'change_amount', v_change_amt, 'change_percent', v_change_pct));

  RETURN v_id;
END; $function$
;

CREATE OR REPLACE FUNCTION public.refresh_all_sale_list_prices()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  WITH latest AS (
    SELECT DISTINCT ON (pcp.product_id, pcp.sale_price_type_id)
      pcp.product_id,
      pcp.sale_price_type_id,
      pcp.rounded_sale_price AS new_price
    FROM public.product_computed_prices pcp
    WHERE pcp.rounded_sale_price IS NOT NULL AND pcp.rounded_sale_price > 0
    ORDER BY pcp.product_id, pcp.sale_price_type_id, pcp.computed_at DESC
  ),
  hist AS (
    SELECT DISTINCT ON (h.product_id, h.sale_price_type_id)
      h.product_id, h.sale_price_type_id, h.old_sale_price, h.new_sale_price
    FROM public.product_sale_price_history h
    ORDER BY h.product_id, h.sale_price_type_id, h.created_at DESC
  )
  UPDATE public.sale_list_items sli
  SET
    current_price  = l.new_price,
    previous_price = COALESCE(hist.old_sale_price, hist.new_sale_price),
    change_amount  = CASE WHEN COALESCE(hist.old_sale_price, hist.new_sale_price) IS NOT NULL
                          THEN l.new_price - COALESCE(hist.old_sale_price, hist.new_sale_price)
                          ELSE NULL END,
    change_percent = CASE WHEN COALESCE(hist.old_sale_price, hist.new_sale_price) IS NOT NULL
                           AND COALESCE(hist.old_sale_price, hist.new_sale_price) <> 0
                          THEN ROUND(((l.new_price - COALESCE(hist.old_sale_price, hist.new_sale_price))
                                    / COALESCE(hist.old_sale_price, hist.new_sale_price)) * 100, 2)
                          ELSE NULL END
  FROM public.sale_lists sl
  JOIN latest l ON sl.sale_price_type_id = l.sale_price_type_id
  LEFT JOIN hist ON hist.product_id = l.product_id AND hist.sale_price_type_id = l.sale_price_type_id
  WHERE sli.sale_list_id = sl.id
    AND sli.product_id = l.product_id
    AND (sli.current_price IS DISTINCT FROM l.new_price);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_sale_list_prices(p_list_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  WITH latest AS (
    SELECT DISTINCT ON (pcp.product_id, pcp.sale_price_type_id)
      pcp.product_id,
      pcp.sale_price_type_id,
      pcp.rounded_sale_price AS new_price
    FROM public.product_computed_prices pcp
    WHERE pcp.rounded_sale_price IS NOT NULL AND pcp.rounded_sale_price > 0
    ORDER BY pcp.product_id, pcp.sale_price_type_id, pcp.computed_at DESC
  ),
  hist AS (
    SELECT DISTINCT ON (h.product_id, h.sale_price_type_id)
      h.product_id, h.sale_price_type_id, h.old_sale_price, h.new_sale_price
    FROM public.product_sale_price_history h
    ORDER BY h.product_id, h.sale_price_type_id, h.created_at DESC
  )
  UPDATE public.sale_list_items sli
  SET
    current_price  = l.new_price,
    previous_price = COALESCE(hist.old_sale_price, hist.new_sale_price),
    change_amount  = CASE WHEN COALESCE(hist.old_sale_price, hist.new_sale_price) IS NOT NULL
                          THEN l.new_price - COALESCE(hist.old_sale_price, hist.new_sale_price)
                          ELSE NULL END,
    change_percent = CASE WHEN COALESCE(hist.old_sale_price, hist.new_sale_price) IS NOT NULL
                           AND COALESCE(hist.old_sale_price, hist.new_sale_price) <> 0
                          THEN ROUND(((l.new_price - COALESCE(hist.old_sale_price, hist.new_sale_price))
                                    / COALESCE(hist.old_sale_price, hist.new_sale_price)) * 100, 2)
                          ELSE NULL END
  FROM public.sale_lists sl
  JOIN latest l ON sl.sale_price_type_id = l.sale_price_type_id
  LEFT JOIN hist ON hist.product_id = l.product_id AND hist.sale_price_type_id = l.sale_price_type_id
  WHERE sli.sale_list_id = p_list_id
    AND sli.sale_list_id = sl.id
    AND sli.product_id = l.product_id
    AND (sli.current_price IS DISTINCT FROM l.new_price);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.refund_capital_allocation(p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _cca_id uuid; _sca_id uuid;
  _c_held numeric; _s_held numeric;
  _c_consumed numeric; _s_consumed numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'مبلغ باید بزرگتر از صفر باشد'; END IF;
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  SELECT allocation_id INTO _cca_id FROM public.capital_allocation_ledger
   WHERE allocation_kind='customer' AND reference_type='invoice' AND reference_id=p_invoice_id AND transaction_type='consume'
   ORDER BY created_at DESC LIMIT 1;
  SELECT allocation_id INTO _sca_id FROM public.capital_allocation_ledger
   WHERE allocation_kind='salesperson' AND reference_type='invoice' AND reference_id=p_invoice_id AND transaction_type='consume'
   ORDER BY created_at DESC LIMIT 1;
  IF _cca_id IS NULL OR _sca_id IS NULL THEN RAISE EXCEPTION 'consume قبلی برای این فاکتور یافت نشد'; END IF;

  SELECT held_amount, consumed_amount INTO _c_held, _c_consumed FROM public.customer_capital_allocations WHERE id=_cca_id FOR UPDATE;
  SELECT held_amount, consumed_amount INTO _s_held, _s_consumed FROM public.salesperson_capital_allocations WHERE id=_sca_id FOR UPDATE;
  IF p_amount > _c_consumed OR p_amount > _s_consumed THEN RAISE EXCEPTION 'مقدار refund بیش از consumed است'; END IF;

  UPDATE public.customer_capital_allocations SET consumed_amount = consumed_amount - p_amount, updated_at=now() WHERE id=_cca_id;
  INSERT INTO public.capital_allocation_ledger(allocation_kind, allocation_id, transaction_type, amount, held_before, held_after, consumed_before, consumed_after, reference_type, reference_id, actor_id)
  VALUES ('customer', _cca_id, 'refund', p_amount, _c_held, _c_held, _c_consumed, _c_consumed - p_amount, 'invoice', p_invoice_id, COALESCE(p_user_id, auth.uid()));

  UPDATE public.salesperson_capital_allocations SET consumed_amount = consumed_amount - p_amount, updated_at=now() WHERE id=_sca_id;
  INSERT INTO public.capital_allocation_ledger(allocation_kind, allocation_id, transaction_type, amount, held_before, held_after, consumed_before, consumed_after, reference_type, reference_id, actor_id)
  VALUES ('salesperson', _sca_id, 'refund', p_amount, _s_held, _s_held, _s_consumed, _s_consumed - p_amount, 'invoice', p_invoice_id, COALESCE(p_user_id, auth.uid()));

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff)
  VALUES (COALESCE(p_user_id, auth.uid()),'capital_allocation_refund','invoice',p_invoice_id::text,
          jsonb_build_object('amount', p_amount));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_currency_fetch(p_fetch_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF NOT has_any_role(v_user, ARRAY['admin'::app_role, 'accountant'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE currency_rate_fetches
    SET status = 'rejected', approved_by = v_user, approved_at = now(),
        note = COALESCE(p_reason, note)
    WHERE id = p_fetch_id AND status = 'pending_review';

  INSERT INTO audit_logs(action, entity_type, entity_id, actor_id, diff)
    VALUES ('currency_rate_rejected', 'currency_rate_fetches', p_fetch_id::text, v_user,
      jsonb_build_object('reason', p_reason));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_pending_user(_user_id uuid, _notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  UPDATE public.profiles
  SET status = 'rejected', is_active = false, updated_at = now()
  WHERE id = _user_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'user', _user_id::text, 'user_rejected',
          jsonb_build_object('notes', _notes));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.release_capital_allocation(p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _cca_id uuid; _sca_id uuid;
  _c_held numeric; _s_held numeric;
  _c_consumed numeric; _s_consumed numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'مبلغ باید بزرگتر از صفر باشد'; END IF;
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'sales'::app_role,'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  SELECT allocation_id INTO _cca_id FROM public.capital_allocation_ledger
   WHERE allocation_kind='customer' AND reference_type='invoice' AND reference_id=p_invoice_id AND transaction_type='hold'
   ORDER BY created_at DESC LIMIT 1;
  SELECT allocation_id INTO _sca_id FROM public.capital_allocation_ledger
   WHERE allocation_kind='salesperson' AND reference_type='invoice' AND reference_id=p_invoice_id AND transaction_type='hold'
   ORDER BY created_at DESC LIMIT 1;
  IF _cca_id IS NULL OR _sca_id IS NULL THEN RAISE EXCEPTION 'hold قبلی برای این فاکتور یافت نشد'; END IF;

  SELECT held_amount, consumed_amount INTO _c_held, _c_consumed FROM public.customer_capital_allocations WHERE id=_cca_id FOR UPDATE;
  SELECT held_amount, consumed_amount INTO _s_held, _s_consumed FROM public.salesperson_capital_allocations WHERE id=_sca_id FOR UPDATE;
  IF p_amount > _c_held OR p_amount > _s_held THEN RAISE EXCEPTION 'مقدار release بیش از held است'; END IF;

  UPDATE public.customer_capital_allocations SET held_amount = held_amount - p_amount, updated_at=now() WHERE id=_cca_id;
  INSERT INTO public.capital_allocation_ledger(allocation_kind, allocation_id, transaction_type, amount, held_before, held_after, consumed_before, consumed_after, reference_type, reference_id, actor_id)
  VALUES ('customer', _cca_id, 'release', p_amount, _c_held, _c_held - p_amount, _c_consumed, _c_consumed, 'invoice', p_invoice_id, COALESCE(p_user_id, auth.uid()));

  UPDATE public.salesperson_capital_allocations SET held_amount = held_amount - p_amount, updated_at=now() WHERE id=_sca_id;
  INSERT INTO public.capital_allocation_ledger(allocation_kind, allocation_id, transaction_type, amount, held_before, held_after, consumed_before, consumed_after, reference_type, reference_id, actor_id)
  VALUES ('salesperson', _sca_id, 'release', p_amount, _s_held, _s_held - p_amount, _s_consumed, _s_consumed, 'invoice', p_invoice_id, COALESCE(p_user_id, auth.uid()));

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff)
  VALUES (COALESCE(p_user_id, auth.uid()),'capital_allocation_release','invoice',p_invoice_id::text,
          jsonb_build_object('amount', p_amount));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.release_credit(p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_available numeric;
  v_held numeric;
  v_new_available numeric;
  v_new_held numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ باید بزرگتر از صفر باشد';
  END IF;

  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'sales'::app_role, 'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  PERFORM public._ensure_credit_balance(p_customer_id);

  SELECT available_credit, held_credit
    INTO v_available, v_held
    FROM public.customer_credit_balance
   WHERE customer_id = p_customer_id
   FOR UPDATE;

  v_new_available := v_available + p_amount;
  v_new_held := GREATEST(v_held - p_amount, 0);

  UPDATE public.customer_credit_balance
     SET available_credit = v_new_available,
         held_credit = v_new_held,
         last_transaction_at = now(),
         updated_at = now()
   WHERE customer_id = p_customer_id;

  INSERT INTO public.customer_credit_ledger
    (customer_id, transaction_type, amount, balance_before, balance_after, reference_type, reference_id, description, created_by)
  VALUES
    (p_customer_id, 'release', p_amount, v_available, v_new_available, 'invoice', p_invoice_id, 'آزادسازی اعتبار از پیش‌فاکتور', p_user_id);

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, diff)
  VALUES (
    COALESCE(p_user_id, auth.uid()),
    'credit_release',
    'customer',
    p_customer_id::text,
    jsonb_build_object('amount', p_amount, 'invoice_id', p_invoice_id, 'balance_before', v_available, 'balance_after', v_new_available)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.release_stale_quote_send_locks()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _count integer := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::app_role[]) THEN
    RAISE EXCEPTION 'دسترسی لازم را ندارید.' USING ERRCODE = '42501';
  END IF;

  WITH released AS (
    UPDATE public.sales_quote_send_queue
    SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
        locked_at = NULL,
        last_error = 'Processing lock expired',
        processed_at = CASE WHEN attempts >= max_attempts THEN now() ELSE processed_at END,
        updated_at = now()
    WHERE status = 'processing'
      AND locked_at IS NOT NULL
      AND locked_at < now() - interval '10 minutes'
    RETURNING id
  )
  SELECT count(*) INTO _count FROM released;

  RETURN _count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reorder_dynamic_table_columns(p_table_id uuid, p_ordered_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _i int := 0;
  _id uuid;
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOREACH _id IN ARRAY p_ordered_ids LOOP
    UPDATE dynamic_table_columns
    SET sort_order = _i
    WHERE id = _id AND table_id = p_table_id;
    _i := _i + 1;
  END LOOP;

  INSERT INTO audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'dynamic_table', p_table_id::text, 'columns_reordered',
          jsonb_build_object('order', p_ordered_ids));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reply_inquiry(p_inquiry_id uuid, p_price bigint, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_inquiry public.inquiries%ROWTYPE; v_new_status public.inquiry_status; v_valid_until timestamptz;
BEGIN
  SELECT * INTO v_inquiry FROM public.inquiries WHERE id = p_inquiry_id;
  IF v_inquiry.id IS NULL THEN
    RAISE EXCEPTION 'استعلام یافت نشد.' USING ERRCODE = 'P0001';
  END IF;
  IF v_inquiry.assigned_to != auth.uid() THEN
    IF NOT EXISTS (SELECT 1 FROM public.messenger_group_members 
      WHERE group_id = v_inquiry.group_id AND user_id = auth.uid() AND role = 'purchaser') THEN
      RAISE EXCEPTION 'فقط مسئول خرید مجاز به ثبت قیمت است.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF now() - v_inquiry.created_at <= interval '10 minutes' THEN
    v_new_status := 'completed_on_time';
  ELSE
    v_new_status := 'completed_late';
  END IF;

  INSERT INTO public.inquiry_replies(inquiry_id, user_id, price, note)
  VALUES (p_inquiry_id, auth.uid(), p_price, p_note);

  v_valid_until := now() + interval '7 days';
  INSERT INTO public.inquiry_price_cache(product_id, price, valid_until, created_by)
  VALUES (v_inquiry.product_id, p_price, v_valid_until, auth.uid());

  UPDATE public.inquiries SET status = v_new_status, answered_at = now(), closed_at = now()
  WHERE id = p_inquiry_id;

  INSERT INTO public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by)
  VALUES (p_inquiry_id, v_inquiry.status, v_new_status, auth.uid());
END; $function$
;

CREATE OR REPLACE FUNCTION public.requeue_failed_quote_send_item(p_queue_id uuid)
 RETURNS sales_quote_send_queue
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row public.sales_quote_send_queue;
  _old public.sales_quote_send_queue;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::app_role[]) THEN
    RAISE EXCEPTION 'دسترسی لازم را ندارید.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _old FROM public.sales_quote_send_queue WHERE id = p_queue_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'رکورد یافت نشد.' USING ERRCODE = 'P0002';
  END IF;
  IF _old.status <> 'failed' THEN
    RAISE EXCEPTION 'فقط رکوردهای ناموفق قابل بازگردانی هستند.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.sales_quote_send_queue
  SET status = 'pending',
      scheduled_at = now(),
      locked_at = NULL,
      processed_at = NULL,
      last_error = NULL,
      updated_at = now()
  WHERE id = p_queue_id
  RETURNING * INTO _row;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_uid, 'sales_quote_send_queue', _row.id::text, 'sales_quote_send_queue_requeued',
    jsonb_build_object(
      'quote_id', _row.quote_id,
      'attempts', _row.attempts,
      'max_attempts', _row.max_attempts,
      'old_status', _old.status,
      'new_status', _row.status
    ));

  RETURN _row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_market_product_match(p_source_name market_match_source, p_source_product_url text DEFAULT NULL::text, p_source_product_id text DEFAULT NULL::text)
 RETURNS TABLE(match_id uuid, afrakala_product_id uuid, match_status market_match_status, confidence_score numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_source_product_id IS NOT NULL THEN
    RETURN QUERY
      SELECT m.id, m.afrakala_product_id, m.match_status, m.confidence_score
      FROM public.market_product_matches m
      WHERE m.source_name = p_source_name
        AND m.source_product_id = p_source_product_id
        AND m.match_status = 'approved'
      LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  IF p_source_product_url IS NOT NULL THEN
    RETURN QUERY
      SELECT m.id, m.afrakala_product_id, m.match_status, m.confidence_score
      FROM public.market_product_matches m
      WHERE m.source_name = p_source_name
        AND m.source_product_url = p_source_product_url
        AND m.match_status = 'approved'
      LIMIT 1;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.review_delivery_receipt(p_receipt_id uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old_status text;
  v_uploader uuid;
  v_type text;
begin
  if not (
    public.has_role(auth.uid(), 'admin') or
    public.has_role(auth.uid(), 'manager') or
    public.has_role(auth.uid(), 'sales')
  ) then
    raise exception 'دسترسی ندارید';
  end if;

  if p_decision not in ('confirmed','rejected') then
    raise exception 'تصمیم نامعتبر است';
  end if;

  select status, uploaded_by, type
  into v_old_status, v_uploader, v_type
  from public.delivery_receipts
  where id = p_receipt_id;

  if not found then
    raise exception 'رسید یافت نشد';
  end if;

  if v_old_status <> 'pending_review' then
    raise exception 'این رسید قبلاً بررسی شده است';
  end if;

  update public.delivery_receipts
  set
    status = p_decision,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  where id = p_receipt_id;

  insert into public.delivery_receipt_status_history
    (receipt_id, from_status, to_status, changed_by, note)
  values
    (p_receipt_id, v_old_status, p_decision, auth.uid(), p_note);

  insert into public.notification_events
    (event_type, user_id, channel, payload, status)
  values (
    'delivery_receipt_reviewed',
    v_uploader,
    'in_app',
    jsonb_build_object(
      'title', case p_decision when 'confirmed' then 'رسید تأیید شد' else 'رسید رد شد' end,
      'body', case p_decision
        when 'confirmed' then 'رسید شما تأیید شد.'
        else 'رسید شما رد شد. لطفاً دوباره بررسی کنید.'
      end,
      'reference_type', 'delivery_receipt',
      'reference_id', p_receipt_id
    ),
    'pending'
  );

  insert into public.audit_logs
    (entity_type, entity_id, action, actor_id, diff)
  values (
    'delivery_receipt', p_receipt_id::text, p_decision,
    auth.uid(),
    jsonb_build_object('note', p_note)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.review_document(p_document_id uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old_status text;
  v_uploader uuid;
begin
  if p_decision not in ('confirmed','rejected') then
    raise exception 'تصمیم نامعتبر';
  end if;

  if not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager')) then
    raise exception 'فقط مدیر می‌تواند سند را تأیید یا رد کند';
  end if;

  select status, uploaded_by into v_old_status, v_uploader
  from public.documents where id = p_document_id for update;

  if not found then raise exception 'سند یافت نشد'; end if;
  if v_old_status <> 'pending_review' then
    raise exception 'این سند قبلاً بررسی شده است';
  end if;

  update public.documents
    set status = p_decision,
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        updated_at = now()
    where id = p_document_id;

  insert into public.document_status_history(document_id, from_status, to_status, changed_by, note)
  values (p_document_id, v_old_status, p_decision, auth.uid(), p_note);

  insert into public.notification_events(event_type, user_id, channel, payload, status)
  values (
    'document_reviewed', v_uploader, 'in_app',
    jsonb_build_object(
      'title', case p_decision when 'confirmed' then 'سند تأیید شد' else 'سند رد شد' end,
      'body',  case p_decision when 'confirmed' then 'سند شما با موفقیت تأیید شد.' else 'سند شما رد شد. لطفاً دوباره بررسی کنید.' end,
      'reference_type','document',
      'reference_id', p_document_id
    ),
    'pending'
  );

  insert into public.audit_logs(entity_type, entity_id, action, actor_id, diff)
  values ('document', p_document_id::text, p_decision, auth.uid(),
          jsonb_build_object('note', p_note));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.review_market_product_match_approve(p_match_id uuid, p_afrakala_product_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS market_product_matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_product_name text;
  v_row public.market_product_matches;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'manager'::app_role)) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  IF p_afrakala_product_id IS NULL THEN
    RAISE EXCEPTION 'afrakala_product_id is required to approve' USING ERRCODE = '22023';
  END IF;

  SELECT name INTO v_product_name FROM public.products WHERE id = p_afrakala_product_id;
  IF v_product_name IS NULL THEN
    RAISE EXCEPTION 'product not found' USING ERRCODE = '23503';
  END IF;

  UPDATE public.market_product_matches
  SET afrakala_product_id = p_afrakala_product_id,
      afrakala_product_name_snapshot = v_product_name,
      match_status = 'approved'::market_match_status,
      matched_by = 'human'::market_match_actor,
      reviewed_by = v_uid,
      reviewed_at = now(),
      reject_reason = NULL,
      notes = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_match_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'match not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.review_market_product_match_disable(p_match_id uuid, p_reason text, p_notes text DEFAULT NULL::text)
 RETURNS market_product_matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.market_product_matches;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'manager'::app_role)) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.market_product_matches
  SET match_status = 'disabled'::market_match_status,
      matched_by = 'human'::market_match_actor,
      reviewed_by = v_uid,
      reviewed_at = now(),
      reject_reason = btrim(p_reason),
      notes = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_match_id
    AND match_status IN ('approved'::market_match_status, 'needs_review'::market_match_status, 'pending'::market_match_status)
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'match not found or not disable-able' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.review_market_product_match_reject(p_match_id uuid, p_reject_reason text, p_notes text DEFAULT NULL::text)
 RETURNS market_product_matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.market_product_matches;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'manager'::app_role)) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  IF p_reject_reason IS NULL OR length(btrim(p_reject_reason)) = 0 THEN
    RAISE EXCEPTION 'reject_reason is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.market_product_matches
  SET match_status = 'rejected'::market_match_status,
      matched_by = 'human'::market_match_actor,
      reviewed_by = v_uid,
      reviewed_at = now(),
      reject_reason = btrim(p_reject_reason),
      notes = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_match_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'match not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.revoke_user_role(_target_user uuid, _role app_role)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden: only admins can revoke roles' using errcode = '42501';
  end if;

  if _target_user = auth.uid() and _role = 'admin' then
    raise exception 'forbidden: admins cannot revoke their own admin role' using errcode = '42501';
  end if;

  delete from public.user_roles
  where user_id = _target_user and role = _role;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sale_lists_audit_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Publish transitions are audited by the application (manual insert with recipients).
  -- Skip auditing here to prevent duplicates.
  IF (OLD.status IS DISTINCT FROM NEW.status) AND NEW.status = 'published' THEN
    RETURN NEW;
  END IF;

  -- Version bump
  IF (OLD.version_number IS DISTINCT FROM NEW.version_number) THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
    VALUES (
      'sale_list_versioned',
      'sale_list',
      NEW.id::text,
      auth.uid(),
      jsonb_build_object(
        'old_version', OLD.version_number,
        'new_version', NEW.version_number,
        'name', NEW.name
      )
    );
  -- Metadata changes
  ELSIF (OLD.name IS DISTINCT FROM NEW.name)
     OR (OLD.description IS DISTINCT FROM NEW.description)
     OR (OLD.terms_text IS DISTINCT FROM NEW.terms_text)
     OR (OLD.selected_columns IS DISTINCT FROM NEW.selected_columns) THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
    VALUES (
      'sale_list_updated',
      'sale_list',
      NEW.id::text,
      auth.uid(),
      jsonb_build_object('name', NEW.name)
    );
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sales_quotes_assign_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _year integer := extract(year from coalesce(new.created_at, now()))::integer;
  _attempts integer := 0;
BEGIN
  IF (tg_op = 'INSERT') THEN
    IF new.quote_number IS NULL OR btrim(new.quote_number) = '' THEN
      LOOP
        new.quote_number := public.next_sales_quote_number(_year);
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.sales_quotes WHERE quote_number = new.quote_number);
        _attempts := _attempts + 1;
        IF _attempts > 5 THEN
          RAISE EXCEPTION 'could not allocate unique quote_number after % attempts', _attempts;
        END IF;
      END LOOP;
    END IF;
    -- stamp salesperson if missing
    new.salesperson_id := coalesce(new.salesperson_id, auth.uid());
  ELSIF (tg_op = 'UPDATE') THEN
    -- Make quote_number immutable
    IF new.quote_number IS DISTINCT FROM old.quote_number THEN
      new.quote_number := old.quote_number;
    END IF;
  END IF;
  RETURN new;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sales_quotes_validate_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (tg_op = 'UPDATE' AND old.status IS DISTINCT FROM new.status) THEN
    -- Final states cannot be changed
    IF old.status IN ('accepted','rejected','canceled') THEN
      RAISE EXCEPTION 'cannot change status of a finalized quote (%, %)', old.quote_number, old.status
        USING ERRCODE = '22023';
    END IF;
    -- Allowed transitions
    IF NOT (
      (old.status = 'draft' AND new.status IN ('sent','canceled'))
      OR (old.status = 'sent' AND new.status IN ('accepted','rejected','canceled'))
    ) THEN
      RAISE EXCEPTION 'invalid status transition: % -> %', old.status, new.status
        USING ERRCODE = '22023';
    END IF;

    IF new.status = 'canceled' THEN
      new.canceled_at := coalesce(new.canceled_at, now());
      new.canceled_by := coalesce(new.canceled_by, auth.uid());
    END IF;
  END IF;
  RETURN new;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.save_customer_capital_allocations(p_salesperson_allocation_id uuid, p_allocations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_alloc record;
  v_total numeric;
  v_item jsonb;
  v_customer_id uuid;
  v_final numeric;
  v_reason text;
  v_score numeric;
  v_suggested numeric;
  v_existing record;
  v_action text;
  v_row_id uuid;
  v_count int := 0;
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'p_allocations must be a JSON array' USING ERRCODE = '22023';
  END IF;

  SELECT s.id, s.capital_snapshot_id, s.capital_date, s.salesperson_id, s.final_amount
    INTO v_alloc
  FROM public.salesperson_capital_allocations s
  WHERE s.id = p_salesperson_allocation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'salesperson_allocation not found' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(COALESCE(ccp.credit_score,0)), 0) INTO v_total
  FROM public.customers c
  LEFT JOIN public.customer_credit_profile ccp
    ON ccp.customer_id = c.id AND ccp.is_active = true
  WHERE c.responsible_id = v_alloc.salesperson_id
    AND c.is_active = true;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_customer_id := (v_item->>'customer_id')::uuid;
    v_final := COALESCE((v_item->>'final_amount')::numeric, 0);
    v_reason := NULLIF(btrim(COALESCE(v_item->>'override_reason','')), '');

    IF v_customer_id IS NULL THEN
      RAISE EXCEPTION 'customer_id required' USING ERRCODE = '22023';
    END IF;
    IF v_final < 0 THEN
      RAISE EXCEPTION 'final_amount must be >= 0' USING ERRCODE = '22023';
    END IF;

    -- verify customer belongs to this salesperson (active); allow missing/zero score
    SELECT COALESCE(ccp.credit_score, 0)::numeric INTO v_score
    FROM public.customers c
    LEFT JOIN public.customer_credit_profile ccp
      ON ccp.customer_id = c.id AND ccp.is_active = true
    WHERE c.id = v_customer_id
      AND c.responsible_id = v_alloc.salesperson_id
      AND c.is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'customer % is not eligible for this salesperson', v_customer_id USING ERRCODE = '22023';
    END IF;

    v_suggested := CASE
      WHEN v_total > 0 AND v_score > 0 THEN ROUND(v_alloc.final_amount * v_score / v_total)
      ELSE 0
    END;

    -- detect existing for action classification
    SELECT id INTO v_existing
    FROM public.customer_capital_allocations
    WHERE salesperson_allocation_id = v_alloc.id AND customer_id = v_customer_id;

    INSERT INTO public.customer_capital_allocations (
      salesperson_allocation_id, capital_snapshot_id, capital_date,
      salesperson_id, customer_id,
      customer_score, score_source, total_customer_score,
      system_suggested_amount, final_amount, override_reason,
      status, created_by, approved_by
    ) VALUES (
      v_alloc.id, v_alloc.capital_snapshot_id, v_alloc.capital_date,
      v_alloc.salesperson_id, v_customer_id,
      v_score, 'customer_credit_profile.credit_score', v_total,
      v_suggested, v_final, v_reason,
      'approved', auth.uid(), auth.uid()
    )
    ON CONFLICT (salesperson_allocation_id, customer_id) DO UPDATE
      SET customer_score = EXCLUDED.customer_score,
          total_customer_score = EXCLUDED.total_customer_score,
          system_suggested_amount = EXCLUDED.system_suggested_amount,
          final_amount = EXCLUDED.final_amount,
          override_reason = EXCLUDED.override_reason,
          status = 'approved',
          approved_by = auth.uid(),
          updated_at = now()
    RETURNING id INTO v_row_id;

    IF v_existing.id IS NULL THEN
      v_action := 'create';
    ELSIF ROUND(v_final) <> ROUND(v_suggested) THEN
      v_action := 'override';
    ELSE
      v_action := 'update';
    END IF;

    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (
      auth.uid(),
      'customer_capital_allocation',
      v_row_id::text,
      v_action,
      jsonb_build_object(
        'salesperson_allocation_id', v_alloc.id,
        'capital_snapshot_id', v_alloc.capital_snapshot_id,
        'capital_date', v_alloc.capital_date,
        'salesperson_id', v_alloc.salesperson_id,
        'customer_id', v_customer_id,
        'customer_score', v_score,
        'total_customer_score', v_total,
        'suggested', v_suggested,
        'final', v_final,
        'override_reason', v_reason
      )
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('saved', v_count);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.save_daily_capital_snapshot(p_capital_date date, p_final_capital numeric, p_override_reason text DEFAULT NULL::text)
 RETURNS daily_capital_snapshots
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c record;
  s public.daily_capital_snapshots;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_capital_date IS NULL THEN
    RAISE EXCEPTION 'capital_date is required' USING ERRCODE = '22023';
  END IF;
  IF p_final_capital IS NULL OR p_final_capital < 0 THEN
    RAISE EXCEPTION 'final_capital must be >= 0' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO c FROM public.compute_daily_capital(p_capital_date);

  IF p_final_capital <> c.system_suggested_capital
     AND (p_override_reason IS NULL OR length(btrim(p_override_reason)) = 0) THEN
    RAISE EXCEPTION 'override_reason is required when final differs from suggested'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.daily_capital_snapshots(
    capital_date, system_suggested_capital, final_capital,
    total_receivables, overdue_receivables, due_today_receivables, future_receivables,
    total_payables, overdue_payables, due_today_payables, future_payables,
    input_id, formula_version, override_reason, approved_by, created_by
  ) VALUES (
    p_capital_date, c.system_suggested_capital, p_final_capital,
    c.total_receivables, c.overdue_receivables, c.due_today_receivables, c.future_receivables,
    c.total_payables, c.overdue_payables, c.due_today_payables, c.future_payables,
    c.input_id, c.formula_version, NULLIF(btrim(p_override_reason),''), auth.uid(), auth.uid()
  )
  RETURNING * INTO s;

  RETURN s;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.save_salesperson_capital_allocations(p_capital_snapshot_id uuid, p_allocations jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_snap public.daily_capital_snapshots%ROWTYPE;
  v_total numeric;
  v_actor uuid := auth.uid();
  v_count integer := 0;
  v_item jsonb;
  v_sp uuid;
  v_final numeric;
  v_reason text;
  v_score numeric;
  v_suggested numeric;
  v_existing public.salesperson_capital_allocations%ROWTYPE;
  v_alloc_id uuid;
  v_action text;
BEGIN
  IF NOT public.has_any_role(v_actor, ARRAY['admin','manager','accountant']::public.app_role[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_snap FROM public.daily_capital_snapshots WHERE id = p_capital_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'daily capital snapshot not found' USING ERRCODE = '22023';
  END IF;

  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'p_allocations must be a JSON array' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(es.monthly_score), 0)
    INTO v_total
  FROM public.employee_scores es
  JOIN public.user_roles ur ON ur.user_id = es.employee_id AND ur.role = 'sales'::public.app_role;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_sp := NULLIF(v_item->>'salesperson_id','')::uuid;
    v_final := COALESCE((v_item->>'final_amount')::numeric, 0);
    v_reason := NULLIF(v_item->>'override_reason','');

    IF v_sp IS NULL THEN
      RAISE EXCEPTION 'salesperson_id required' USING ERRCODE = '22023';
    END IF;
    IF v_final < 0 THEN
      RAISE EXCEPTION 'final_amount cannot be negative' USING ERRCODE = '22023';
    END IF;

    -- Verify salesperson role + recompute server-side suggested
    SELECT es.monthly_score INTO v_score
    FROM public.employee_scores es
    JOIN public.user_roles ur ON ur.user_id = es.employee_id AND ur.role = 'sales'::public.app_role
    WHERE es.employee_id = v_sp;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'user % is not a salesperson with score', v_sp USING ERRCODE = '22023';
    END IF;

    v_suggested := CASE
      WHEN v_total > 0 THEN ROUND(v_snap.final_capital * (v_score / v_total))
      ELSE 0
    END;

    IF ROUND(v_final) <> v_suggested AND v_reason IS NULL THEN
      RAISE EXCEPTION 'override_reason required when final_amount differs from suggested' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_existing
    FROM public.salesperson_capital_allocations
    WHERE capital_snapshot_id = p_capital_snapshot_id AND salesperson_id = v_sp;

    IF FOUND THEN
      UPDATE public.salesperson_capital_allocations
        SET score = v_score,
            total_score = v_total,
            system_suggested_amount = v_suggested,
            final_amount = v_final,
            override_reason = v_reason,
            status = 'approved',
            approved_by = v_actor,
            updated_at = now()
        WHERE id = v_existing.id
        RETURNING id INTO v_alloc_id;
      v_action := CASE WHEN ROUND(v_final) <> v_suggested THEN 'override' ELSE 'update' END;
    ELSE
      INSERT INTO public.salesperson_capital_allocations(
        capital_snapshot_id, capital_date, salesperson_id,
        score, total_score, system_suggested_amount, final_amount,
        override_reason, status, created_by, approved_by
      ) VALUES (
        p_capital_snapshot_id, v_snap.capital_date, v_sp,
        v_score, v_total, v_suggested, v_final,
        v_reason, 'approved', v_actor, v_actor
      ) RETURNING id INTO v_alloc_id;
      v_action := 'create';
    END IF;

    INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
    VALUES (
      v_actor,
      'salesperson_capital_allocation',
      v_alloc_id::text,
      v_action,
      jsonb_build_object(
        'capital_snapshot_id', p_capital_snapshot_id,
        'capital_date', v_snap.capital_date,
        'salesperson_id', v_sp,
        'score', v_score,
        'total_score', v_total,
        'suggested', v_suggested,
        'final', v_final,
        'override_reason', v_reason
      )
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.search_messenger_messages_semantic(p_group_id uuid, p_query_embedding vector, p_limit integer DEFAULT 10)
 RETURNS TABLE(message_id uuid, content text, created_at timestamp with time zone, sender_id uuid, similarity double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT m.id, m.content, m.created_at, m.sender_id,
         1 - (e.embedding <=> p_query_embedding) AS similarity
  FROM public.message_embeddings e
  JOIN public.messenger_messages m ON m.id = e.message_id
  WHERE e.group_id = p_group_id
    AND public.is_messenger_group_member(p_group_id, auth.uid())
    AND m.deleted_at IS NULL
  ORDER BY e.embedding <=> p_query_embedding
  LIMIT LEAST(p_limit, 50);
$function$
;

CREATE OR REPLACE FUNCTION public.search_product_ids(p_term text, p_limit integer DEFAULT 200)
 RETURNS TABLE(id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_term text := COALESCE(NULLIF(public.normalize_fa_text(p_term), ''), '');
  v_pattern text;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF length(v_term) < 2 THEN
    RETURN;
  END IF;

  v_pattern := '%' || replace(replace(v_term, '%', ''), '_', '') || '%';

  RETURN QUERY
  SELECT DISTINCT p.id
  FROM products p
  LEFT JOIN brands b ON b.id = p.brand_id
  LEFT JOIN categories c ON c.id = p.category_id
  WHERE
       public.normalize_fa_text(p.name) ILIKE v_pattern
    OR (p.sku IS NOT NULL AND public.normalize_fa_text(p.sku) ILIKE v_pattern)
    OR (p.model IS NOT NULL AND public.normalize_fa_text(p.model) ILIKE v_pattern)
    OR (p.color IS NOT NULL AND public.normalize_fa_text(p.color) ILIKE v_pattern)
    OR (p.capacity IS NOT NULL AND public.normalize_fa_text(p.capacity) ILIKE v_pattern)
    OR (p.primary_spec IS NOT NULL AND public.normalize_fa_text(p.primary_spec) ILIKE v_pattern)
    OR (b.name IS NOT NULL AND public.normalize_fa_text(b.name) ILIKE v_pattern)
    OR (c.name IS NOT NULL AND public.normalize_fa_text(c.name) ILIKE v_pattern)
    OR EXISTS (
      SELECT 1 FROM product_category_attribute_values pcav
      WHERE pcav.product_id = p.id
        AND pcav.value IS NOT NULL
        AND public.normalize_fa_text(pcav.value) ILIKE v_pattern
    )
  LIMIT v_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.send_invoice_to_accountant(p_invoice_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_inv record;
  v_task_id uuid;
  v_existing uuid;
BEGIN
  IF NOT public.has_any_role(v_user, ARRAY['admin','manager','sales']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT i.id, i.status, i.type, i.number, i.total_amount, i.customer_id, c.name AS customer_name
    INTO v_inv
  FROM public.invoices i
  LEFT JOIN public.customers c ON c.id = i.customer_id
  WHERE i.id = p_invoice_id;

  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'invoice not found'; END IF;
  IF v_inv.status <> 'draft' THEN RAISE EXCEPTION 'only draft invoices can be sent to accountant'; END IF;

  UPDATE public.invoices SET status = 'pending_accountant', updated_at = now() WHERE id = p_invoice_id;

  -- Avoid duplicate task
  SELECT id INTO v_existing
  FROM public.tasks
  WHERE reference_type = 'invoice' AND reference_id = p_invoice_id AND status IN ('pending','in_progress')
  LIMIT 1;

  IF v_existing IS NULL THEN
    INSERT INTO public.tasks (title, description, status, priority, reference_type, reference_id, created_by)
    VALUES (
      'بررسی پیش‌فاکتور',
      'پیش‌فاکتور ' || COALESCE(v_inv.number, p_invoice_id::text)
        || ' — مشتری: ' || COALESCE(v_inv.customer_name, '—')
        || ' — مبلغ: ' || to_char(v_inv.total_amount, 'FM999,999,999,999'),
      'pending', 'normal', 'invoice', p_invoice_id, v_user
    )
    RETURNING id INTO v_task_id;
  ELSE
    v_task_id := v_existing;
  END IF;

  INSERT INTO public.audit_logs(entity_type, entity_id, action, actor_id, diff)
  VALUES ('invoice', p_invoice_id::text, 'invoice_sent_to_accountant', v_user,
          jsonb_build_object('new_status','pending_accountant','task_id',v_task_id));

  RETURN v_task_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.send_messenger_message(p_group_id uuid, p_content text, p_type text DEFAULT 'text'::text, p_reply_to uuid DEFAULT NULL::uuid)
 RETURNS messenger_messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.messenger_messages;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_messenger_group_member(p_group_id, v_uid) THEN
    RAISE EXCEPTION 'NOT_GROUP_MEMBER' USING ERRCODE = '42501';
  END IF;

  IF p_type NOT IN ('text','image','video','audio','file') THEN
    RAISE EXCEPTION 'INVALID_TYPE' USING ERRCODE = '22023';
  END IF;

  IF p_content IS NULL OR length(p_content) < 1 OR length(p_content) > 4000 THEN
    RAISE EXCEPTION 'INVALID_CONTENT' USING ERRCODE = '22023';
  END IF;

  IF p_reply_to IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.messenger_messages
      WHERE id = p_reply_to AND group_id = p_group_id
    ) THEN
      RAISE EXCEPTION 'INVALID_REPLY_TARGET' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.messenger_messages(group_id, sender_id, content, type, reply_to)
  VALUES (p_group_id, v_uid, p_content, p_type, p_reply_to)
  RETURNING * INTO v_row;

  INSERT INTO public.messenger_read_receipts(message_id, user_id)
  VALUES (v_row.id, v_uid)
  ON CONFLICT (message_id, user_id) DO NOTHING;

  RETURN v_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.send_messenger_message_with_attachment(p_group_id uuid, p_content text, p_type text, p_reply_to uuid, p_file_path text, p_file_name text, p_file_type text, p_file_size bigint)
 RETURNS messenger_messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.messenger_messages;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_messenger_group_member(p_group_id, v_uid) THEN
    RAISE EXCEPTION 'NOT_GROUP_MEMBER' USING ERRCODE = '42501';
  END IF;

  IF p_type NOT IN ('text','image','video','audio','file') THEN
    RAISE EXCEPTION 'INVALID_TYPE' USING ERRCODE = '22023';
  END IF;

  IF p_content IS NULL OR length(p_content) < 1 OR length(p_content) > 4000 THEN
    RAISE EXCEPTION 'INVALID_CONTENT' USING ERRCODE = '22023';
  END IF;

  IF p_file_size IS NULL OR p_file_size < 1 OR p_file_size > 52428800 THEN
    RAISE EXCEPTION 'INVALID_FILE_SIZE' USING ERRCODE = '22023';
  END IF;

  IF NOT public.messenger_attachment_size_ok(p_file_path, p_file_size) THEN
    RAISE EXCEPTION 'FILE_SIZE_TYPE_LIMIT' USING ERRCODE = '22023';
  END IF;

  IF split_part(p_file_path, '/', 1) <> v_uid::text THEN
    RAISE EXCEPTION 'INVALID_FILE_PATH_OWNER' USING ERRCODE = '42501';
  END IF;

  IF p_reply_to IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.messenger_messages
      WHERE id = p_reply_to AND group_id = p_group_id
    ) THEN
      RAISE EXCEPTION 'INVALID_REPLY_TARGET' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.messenger_messages(group_id, sender_id, content, type, reply_to)
  VALUES (p_group_id, v_uid, p_content, p_type, p_reply_to)
  RETURNING * INTO v_row;

  INSERT INTO public.messenger_attachments(message_id, file_path, file_name, file_type, file_size)
  VALUES (v_row.id, p_file_path, p_file_name, p_file_type, p_file_size);

  INSERT INTO public.messenger_read_receipts(message_id, user_id)
  VALUES (v_row.id, v_uid)
  ON CONFLICT (message_id, user_id) DO NOTHING;

  RETURN v_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_bot_api_key_active(p_key_id uuid, p_is_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.bot_api_keys SET is_active = p_is_active WHERE id = p_key_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_uid, 'bot_api_keys', p_key_id::text,
          CASE WHEN p_is_active THEN 'bot_api_key_activated' ELSE 'bot_api_key_deactivated' END,
          jsonb_build_object('is_active', p_is_active));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_bot_api_key_table_access(p_key_id uuid, p_table_id uuid, p_can_read boolean, p_can_update boolean, p_allowed_update_columns uuid[] DEFAULT '{}'::uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _valid_cols uuid[];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Verify key + table exist
  IF NOT EXISTS (SELECT 1 FROM public.bot_api_keys WHERE id = p_key_id) THEN
    RAISE EXCEPTION 'key_not_found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dynamic_tables WHERE id = p_table_id) THEN
    RAISE EXCEPTION 'table_not_found';
  END IF;

  -- Constrain allowed_update_columns to columns that actually belong to that table
  SELECT COALESCE(array_agg(c.id), '{}'::uuid[]) INTO _valid_cols
  FROM public.dynamic_table_columns c
  WHERE c.table_id = p_table_id
    AND c.id = ANY (COALESCE(p_allowed_update_columns, '{}'::uuid[]));

  INSERT INTO public.bot_api_key_table_access
    (api_key_id, table_id, can_read, can_update, allowed_update_columns)
  VALUES (p_key_id, p_table_id, COALESCE(p_can_read, true), COALESCE(p_can_update, false), _valid_cols)
  ON CONFLICT (api_key_id, table_id) DO UPDATE
    SET can_read = EXCLUDED.can_read,
        can_update = EXCLUDED.can_update,
        allowed_update_columns = EXCLUDED.allowed_update_columns,
        updated_at = now();

  -- Maintain legacy allowed_table_ids array for back-compat
  UPDATE public.bot_api_keys k
  SET allowed_table_ids = COALESCE((
    SELECT array_agg(DISTINCT a.table_id)
    FROM public.bot_api_key_table_access a
    WHERE a.api_key_id = k.id
  ), '{}'::uuid[])
  WHERE k.id = p_key_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_uid, 'bot_api_keys', p_key_id::text, 'bot_api_key_access_updated',
          jsonb_build_object(
            'table_id', p_table_id,
            'can_read', COALESCE(p_can_read, true),
            'can_update', COALESCE(p_can_update, false),
            'allowed_update_columns', _valid_cols
          ));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_dynamic_table_row_active(p_row_id uuid, p_is_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE dynamic_table_rows
  SET is_active = p_is_active, updated_at = now()
  WHERE id = p_row_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'row not found';
  END IF;

  INSERT INTO audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'dynamic_table_row', p_row_id::text,
          CASE WHEN p_is_active THEN 'activated' ELSE 'deactivated' END,
          jsonb_build_object('is_active', p_is_active));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_limit(real)
 RETURNS real
 LANGUAGE c
 STRICT
AS '$libdir/pg_trgm', $function$set_limit$function$
;

CREATE OR REPLACE FUNCTION public.set_market_rate_tick_status(p_tick_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_uid uuid := auth.uid(); v_old text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'احراز هویت لازم است'; END IF;
  IF NOT (public.has_role(v_uid,'admin'::public.app_role)
       OR public.has_role(v_uid,'manager'::public.app_role)
       OR public.has_role(v_uid,'accountant'::public.app_role)) THEN
    RAISE EXCEPTION 'دسترسی لازم نیست';
  END IF;
  IF p_status NOT IN ('accepted','suspect','rejected') THEN RAISE EXCEPTION 'وضعیت نامعتبر'; END IF;
  SELECT status INTO v_old FROM public.market_rate_ticks WHERE id = p_tick_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'نرخ یافت نشد'; END IF;
  UPDATE public.market_rate_ticks SET status = p_status, note = COALESCE(p_note, note) WHERE id = p_tick_id;
  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (v_uid, 'market_rate_tick', p_tick_id::text, 'market_rate_status_changed',
    jsonb_build_object('from', v_old, 'to', p_status, 'note', p_note));
END; $function$
;

CREATE OR REPLACE FUNCTION public.set_marketing_channels_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_profile_field_value(_user_id uuid, _field_name text, _value jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Auth required';
  END IF;
  IF auth.uid() <> _user_id AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  INSERT INTO public.profile_field_values (user_id, field_name, value)
  VALUES (_user_id, _field_name, _value)
  ON CONFLICT (user_id, field_name)
  DO UPDATE SET value = EXCLUDED.value, updated_at = now();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_sale_price_type_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    NEW.code := public.generate_sale_price_type_code();
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END $function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at_now()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.settle_league_season()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  active_season public.league_seasons%ROWTYPE;
  next_start date;
  next_end date;
  next_name text;
  next_id uuid;
  total_count integer;
  promote_cut integer;
  demote_cut integer;
BEGIN
  SELECT * INTO active_season FROM public.league_seasons WHERE is_active ORDER BY start_date DESC LIMIT 1;

  -- If no active season, bootstrap current month and exit
  IF NOT FOUND THEN
    next_start := date_trunc('month', current_date)::date;
    next_end := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
    next_name := to_char(next_start, 'YYYY-MM');
    INSERT INTO public.league_seasons(season_name, start_date, end_date, is_active)
    VALUES (next_name, next_start, next_end, true)
    ON CONFLICT (season_name) DO UPDATE SET is_active = true
    RETURNING id INTO next_id;
    RETURN jsonb_build_object('bootstrapped', true, 'season_id', next_id);
  END IF;

  -- 1. Snapshot final monthly scores into the active season
  INSERT INTO public.employee_leagues(employee_id, season_id, league, score)
  SELECT es.employee_id, active_season.id, 'Bronze'::public.league_tier, COALESCE(es.monthly_score, 0)
  FROM public.employee_scores es
  ON CONFLICT (employee_id, season_id) DO UPDATE
    SET score = EXCLUDED.score;

  -- 2. Compute rank within current league tier
  WITH ranked AS (
    SELECT id,
           league,
           RANK() OVER (PARTITION BY league ORDER BY score DESC) AS r,
           COUNT(*) OVER (PARTITION BY league) AS tier_count
    FROM public.employee_leagues
    WHERE season_id = active_season.id
  )
  UPDATE public.employee_leagues el
  SET rank = ranked.r
  FROM ranked
  WHERE el.id = ranked.id;

  -- Mark active as settled
  UPDATE public.league_seasons
  SET is_active = false, settled_at = now()
  WHERE id = active_season.id;

  -- 3. Open next month's season
  next_start := (active_season.end_date + interval '1 day')::date;
  next_end := (date_trunc('month', next_start) + interval '1 month - 1 day')::date;
  next_name := to_char(next_start, 'YYYY-MM');

  INSERT INTO public.league_seasons(season_name, start_date, end_date, is_active)
  VALUES (next_name, next_start, next_end, true)
  ON CONFLICT (season_name) DO UPDATE SET is_active = true, start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date
  RETURNING id INTO next_id;

  -- 4. Carry forward members to the new season with promotion/demotion
  --    Within each tier of the just-settled season:
  --      top 20% -> promoted (tier + 1, capped at Legend)
  --      bottom 20% -> demoted (tier - 1, floored at Bronze)
  --      else stays
  INSERT INTO public.employee_leagues(employee_id, season_id, league, score, promoted, demoted)
  SELECT
    el.employee_id,
    next_id,
    CASE
      WHEN el.rank <= GREATEST(1, ceil(tier_count * 0.2))::int
        THEN public.league_tier_from_index(public.league_tier_index(el.league) + 1)
      WHEN el.rank > tier_count - GREATEST(1, floor(tier_count * 0.2))::int
        AND public.league_tier_index(el.league) > 1
        THEN public.league_tier_from_index(public.league_tier_index(el.league) - 1)
      ELSE el.league
    END AS new_league,
    0 AS score,
    (el.rank <= GREATEST(1, ceil(tier_count * 0.2))::int) AS promoted,
    (el.rank > tier_count - GREATEST(1, floor(tier_count * 0.2))::int
      AND public.league_tier_index(el.league) > 1) AS demoted
  FROM (
    SELECT
      el.*,
      COUNT(*) OVER (PARTITION BY el.league) AS tier_count
    FROM public.employee_leagues el
    WHERE el.season_id = active_season.id
  ) el
  ON CONFLICT (employee_id, season_id) DO NOTHING;

  SELECT COUNT(*) INTO total_count FROM public.employee_leagues WHERE season_id = active_season.id;

  RETURN jsonb_build_object(
    'settled_season_id', active_season.id,
    'settled_season_name', active_season.season_name,
    'new_season_id', next_id,
    'new_season_name', next_name,
    'employees_settled', total_count
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.show_limit()
 RETURNS real
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$show_limit$function$
;

CREATE OR REPLACE FUNCTION public.show_trgm(text)
 RETURNS text[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$show_trgm$function$
;

CREATE OR REPLACE FUNCTION public.similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity$function$
;

CREATE OR REPLACE FUNCTION public.similarity_dist(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity_dist$function$
;

CREATE OR REPLACE FUNCTION public.similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity_op$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec(sparsevec, integer, boolean)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_cmp(sparsevec, sparsevec)
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_cmp$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_eq(sparsevec, sparsevec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_eq$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_ge(sparsevec, sparsevec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_ge$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_gt(sparsevec, sparsevec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_gt$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_in(cstring, oid, integer)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_in$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_l2_squared_distance(sparsevec, sparsevec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_l2_squared_distance$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_le(sparsevec, sparsevec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_le$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_lt(sparsevec, sparsevec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_lt$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_ne(sparsevec, sparsevec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_ne$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_negative_inner_product(sparsevec, sparsevec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_negative_inner_product$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_out(sparsevec)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_out$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_recv(internal, oid, integer)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_recv$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_send(sparsevec)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_send$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_to_halfvec(sparsevec, integer, boolean)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_to_halfvec$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_to_vector(sparsevec, integer, boolean)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_to_vector$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_typmod_in(cstring[])
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_typmod_in$function$
;

CREATE OR REPLACE FUNCTION public.stamp_created_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (tg_op = 'INSERT') then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.stamp_registered_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (tg_op = 'INSERT') then
    new.registered_by := coalesce(new.registered_by, auth.uid());
  end if;
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.start_league_season(_name text, _start date, _end date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.league_seasons SET is_active = false WHERE is_active;

  INSERT INTO public.league_seasons(season_name, start_date, end_date, is_active)
  VALUES (_name, _start, _end, true)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.start_market_rate_ingestion_run(p_source_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_uid uuid := auth.uid(); v_sid uuid; v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'احراز هویت لازم است'; END IF;
  IF NOT (public.has_role(v_uid,'admin'::public.app_role)
       OR public.has_role(v_uid,'manager'::public.app_role)
       OR public.has_role(v_uid,'accountant'::public.app_role)) THEN
    RAISE EXCEPTION 'دسترسی لازم برای دریافت نرخ خارجی وجود ندارد';
  END IF;

  SELECT id INTO v_sid FROM public.market_rate_sources WHERE code = p_source_code;

  INSERT INTO public.market_rate_ingestion_runs (source_id, source_code, started_by, status)
  VALUES (v_sid, p_source_code, v_uid, 'started')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.start_market_rate_ingestion_run_system(p_source_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_sid uuid; v_id uuid;
BEGIN
  -- Service-role only: callable when there is no authenticated user.
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'system RPC: not callable by authenticated users';
  END IF;

  SELECT id INTO v_sid FROM public.market_rate_sources WHERE code = p_source_code;

  INSERT INTO public.market_rate_ingestion_runs (source_id, source_code, started_by, status)
  VALUES (v_sid, p_source_code, NULL, 'started')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.stock_alert_set_resolved()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (tg_op = 'UPDATE' and old.status is distinct from new.status) then
    if new.status in ('closed','canceled') then
      new.resolved_at := coalesce(new.resolved_at, now());
      new.resolved_by := coalesce(new.resolved_by, auth.uid());
    elsif new.status in ('open','contacted') then
      new.resolved_at := null;
      new.resolved_by := null;
    end if;
  end if;
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity_commutator_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_commutator_op$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity_dist_commutator_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_dist_commutator_op$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity_dist_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_dist_op$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_op$function$
;

CREATE OR REPLACE FUNCTION public.submit_appeal(p_penalty_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_appeal_id uuid;
  v_penalty record;
  v_manager_id uuid;
  v_rep_id uuid;
  v_neutral_id uuid;
BEGIN
  SELECT * INTO v_penalty
  FROM public.performance_penalties
  WHERE id = p_penalty_id
    AND user_id = auth.uid()
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'تخلف یافت نشد یا دسترسی ندارید';
  END IF;

  IF v_penalty.created_at < now() - interval '24 hours' THEN
    RAISE EXCEPTION 'مهلت اعتراض ۲۴ ساعته منقضی شده است';
  END IF;

  IF EXISTS (SELECT 1 FROM public.penalty_appeals WHERE penalty_id = p_penalty_id) THEN
    RAISE EXCEPTION 'قبلاً برای این تخلف اعتراض ثبت شده است';
  END IF;

  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'دلیل اعتراض الزامی است';
  END IF;

  INSERT INTO public.penalty_appeals (penalty_id, appellant_id, reason)
  VALUES (p_penalty_id, auth.uid(), p_reason)
  RETURNING id INTO v_appeal_id;

  -- Reviewer 1: manager (نقش manager)
  SELECT p.id INTO v_manager_id
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role = 'manager'
    AND p.is_active = true
    AND p.id <> auth.uid()
  ORDER BY random()
  LIMIT 1;

  IF v_manager_id IS NOT NULL THEN
    INSERT INTO public.appeal_reviewers (appeal_id, reviewer_id, role)
    VALUES (v_appeal_id, v_manager_id, 'manager');
  END IF;

  -- Reviewer 2: representative (نقش manager دیگر)
  SELECT p.id INTO v_rep_id
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role = 'manager'
    AND p.is_active = true
    AND p.id <> auth.uid()
    AND (v_manager_id IS NULL OR p.id <> v_manager_id)
  ORDER BY random()
  LIMIT 1;

  IF v_rep_id IS NOT NULL THEN
    INSERT INTO public.appeal_reviewers (appeal_id, reviewer_id, role)
    VALUES (v_appeal_id, v_rep_id, 'representative');
  END IF;

  -- Reviewer 3: neutral (نقش admin)
  SELECT p.id INTO v_neutral_id
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role = 'admin'
    AND p.is_active = true
    AND p.id <> auth.uid()
    AND (v_manager_id IS NULL OR p.id <> v_manager_id)
    AND (v_rep_id IS NULL OR p.id <> v_rep_id)
  ORDER BY random()
  LIMIT 1;

  IF v_neutral_id IS NOT NULL THEN
    INSERT INTO public.appeal_reviewers (appeal_id, reviewer_id, role)
    VALUES (v_appeal_id, v_neutral_id, 'neutral');
  END IF;

  -- Notify reviewers
  INSERT INTO public.notification_events (
    user_id, title, body, type, reference_type, reference_id
  )
  SELECT
    ar.reviewer_id,
    'اعتراض جدید برای بررسی',
    'یک اعتراض جدید برای بررسی به شما اختصاص یافت.',
    'appeal_assigned',
    'appeal',
    v_appeal_id
  FROM public.appeal_reviewers ar
  WHERE ar.appeal_id = v_appeal_id;

  -- Audit
  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, diff)
  VALUES (
    'appeal', v_appeal_id::text, 'submitted', auth.uid(),
    jsonb_build_object('penalty_id', p_penalty_id)
  );

  RETURN v_appeal_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(_quiz_id uuid, _answers jsonb)
 RETURNS TABLE(score integer, passed boolean, attempt_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _passing integer;
  _total integer := 0;
  _correct integer := 0;
  _score integer := 0;
  _passed boolean := false;
  _attempt_id uuid;
  r record;
  _ans int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT passing_score INTO _passing FROM public.academy_quizzes WHERE id = _quiz_id;
  IF _passing IS NULL THEN
    RAISE EXCEPTION 'quiz not found';
  END IF;

  FOR r IN
    SELECT id, correct_value FROM public.academy_quiz_questions WHERE quiz_id = _quiz_id
  LOOP
    _total := _total + 1;
    BEGIN
      _ans := (_answers ->> r.id::text)::int;
    EXCEPTION WHEN others THEN
      _ans := NULL;
    END;
    IF _ans IS NOT NULL AND _ans = r.correct_value THEN
      _correct := _correct + 1;
    END IF;
  END LOOP;

  IF _total > 0 THEN
    _score := round((_correct::numeric / _total::numeric) * 100);
  END IF;
  _passed := _score >= _passing;

  INSERT INTO public.academy_quiz_attempts (user_id, quiz_id, score, passed, answers)
  VALUES (_uid, _quiz_id, _score, _passed, _answers)
  RETURNING id INTO _attempt_id;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
  VALUES (
    'academy_quiz_attempt',
    'academy_quiz',
    _quiz_id,
    _uid,
    jsonb_build_object('score', _score, 'passed', _passed, 'total', _total, 'correct', _correct)
  );

  RETURN QUERY SELECT _score, _passed, _attempt_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.subvector(vector, integer, integer)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$subvector$function$
;

CREATE OR REPLACE FUNCTION public.subvector(halfvec, integer, integer)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_subvector$function$
;

CREATE OR REPLACE FUNCTION public.sync_product_price_observatory_rows()
 RETURNS TABLE(inserted_rows integer, updated_rows integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_table_id        uuid;
  v_col_pid         uuid;
  v_col_pname       uuid;
  v_col_sku         uuid;
  v_col_brand       uuid;
  v_col_cat         uuid;
  v_col_model       uuid;
  v_col_color       uuid;
  v_col_capacity    uuid;
  v_col_stock       uuid;
  v_col_labels      uuid;
  v_col_iput        uuid;
  v_inserted        int := 0;
  v_updated         int := 0;
  v_row_id          uuid;
  v_next_rownum     bigint;
  r                 record;
  v_labels_text     text;
BEGIN
  SELECT id INTO v_table_id FROM public.dynamic_tables
   WHERE slug = 'afrakala-product-price-observatory';
  IF v_table_id IS NULL THEN
    RAISE EXCEPTION 'observatory table not found';
  END IF;

  -- column ids
  SELECT id INTO v_col_pid      FROM public.dynamic_table_columns WHERE table_id=v_table_id AND column_key='afrakala_product_id';
  SELECT id INTO v_col_pname    FROM public.dynamic_table_columns WHERE table_id=v_table_id AND column_key='product_name';
  SELECT id INTO v_col_sku      FROM public.dynamic_table_columns WHERE table_id=v_table_id AND column_key='sku';
  SELECT id INTO v_col_brand    FROM public.dynamic_table_columns WHERE table_id=v_table_id AND column_key='brand_name';
  SELECT id INTO v_col_cat      FROM public.dynamic_table_columns WHERE table_id=v_table_id AND column_key='category_name';
  SELECT id INTO v_col_model    FROM public.dynamic_table_columns WHERE table_id=v_table_id AND column_key='model';
  SELECT id INTO v_col_color    FROM public.dynamic_table_columns WHERE table_id=v_table_id AND column_key='color';
  SELECT id INTO v_col_capacity FROM public.dynamic_table_columns WHERE table_id=v_table_id AND column_key='capacity';
  SELECT id INTO v_col_stock    FROM public.dynamic_table_columns WHERE table_id=v_table_id AND column_key='stock_status';
  SELECT id INTO v_col_labels   FROM public.dynamic_table_columns WHERE table_id=v_table_id AND column_key='product_labels';
  SELECT id INTO v_col_iput     FROM public.dynamic_table_columns WHERE table_id=v_table_id AND column_key='internal_price_updated_at';

  FOR r IN
    SELECT p.id, p.sku, p.name, p.model, p.color, p.capacity, p.stock_status::text AS stock_status,
           p.updated_at, b.name AS brand_name, c.name AS category_name
      FROM public.products p
      LEFT JOIN public.brands b     ON b.id = p.brand_id
      LEFT JOIN public.categories c ON c.id = p.category_id
     WHERE p.is_active = true AND p.status = 'active'
  LOOP
    -- aggregate labels as comma-separated text (data_type=tag stored in value_text)
    SELECT string_agg(pl.title, '، ' ORDER BY pl.title)
      INTO v_labels_text
      FROM public.product_label_links pll
      JOIN public.product_labels pl ON pl.id = pll.label_id
     WHERE pll.product_id = r.id AND COALESCE(pl.is_active, true) = true;

    -- find existing row by afrakala_product_id cell
    SELECT cell.row_id INTO v_row_id
      FROM public.dynamic_table_cells cell
      JOIN public.dynamic_table_rows rw ON rw.id = cell.row_id
     WHERE cell.table_id = v_table_id
       AND cell.column_id = v_col_pid
       AND cell.value_text = r.id::text
     LIMIT 1;

    IF v_row_id IS NULL THEN
      SELECT COALESCE(MAX(row_number), 0) + 1 INTO v_next_rownum
        FROM public.dynamic_table_rows WHERE table_id = v_table_id;
      INSERT INTO public.dynamic_table_rows(table_id, row_number, is_active)
      VALUES (v_table_id, v_next_rownum, true)
      RETURNING id INTO v_row_id;
      v_inserted := v_inserted + 1;
    ELSE
      v_updated := v_updated + 1;
    END IF;

    -- upsert system cells only (no bot/computed/user touch)
    INSERT INTO public.dynamic_table_cells(table_id, row_id, column_id, value_text)
    VALUES
      (v_table_id, v_row_id, v_col_pid,      r.id::text),
      (v_table_id, v_row_id, v_col_pname,    r.name),
      (v_table_id, v_row_id, v_col_sku,      r.sku),
      (v_table_id, v_row_id, v_col_brand,    r.brand_name),
      (v_table_id, v_row_id, v_col_cat,      r.category_name),
      (v_table_id, v_row_id, v_col_model,    r.model),
      (v_table_id, v_row_id, v_col_color,    r.color),
      (v_table_id, v_row_id, v_col_capacity, r.capacity),
      (v_table_id, v_row_id, v_col_stock,    r.stock_status),
      (v_table_id, v_row_id, v_col_labels,   v_labels_text)
    ON CONFLICT (row_id, column_id) DO UPDATE
      SET value_text = EXCLUDED.value_text, updated_at = now();

    -- internal_price_updated_at: store products.updated_at as a best-effort proxy
    INSERT INTO public.dynamic_table_cells(table_id, row_id, column_id, value_datetime)
    VALUES (v_table_id, v_row_id, v_col_iput, r.updated_at)
    ON CONFLICT (row_id, column_id) DO UPDATE
      SET value_datetime = EXCLUDED.value_datetime, updated_at = now();
  END LOOP;

  RETURN QUERY SELECT v_inserted, v_updated;
END
$function$
;

CREATE OR REPLACE FUNCTION public.sync_sale_list_items_from_computed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old numeric;
BEGIN
  IF NEW.rounded_sale_price IS NULL OR NEW.rounded_sale_price <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(old_sale_price, new_sale_price) INTO v_old
  FROM public.product_sale_price_history
  WHERE product_id = NEW.product_id
    AND sale_price_type_id = NEW.sale_price_type_id
  ORDER BY created_at DESC
  LIMIT 1;

  UPDATE public.sale_list_items sli
  SET
    current_price  = NEW.rounded_sale_price,
    previous_price = v_old,
    change_amount  = CASE WHEN v_old IS NOT NULL THEN NEW.rounded_sale_price - v_old ELSE NULL END,
    change_percent = CASE WHEN v_old IS NOT NULL AND v_old <> 0
                          THEN ROUND(((NEW.rounded_sale_price - v_old) / v_old) * 100, 2)
                          ELSE NULL END
  FROM public.sale_lists sl
  WHERE sli.sale_list_id = sl.id
    AND sli.product_id = NEW.product_id
    AND sl.sale_price_type_id = NEW.sale_price_type_id
    AND sli.current_price IS DISTINCT FROM NEW.rounded_sale_price;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_sale_list_items_from_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_latest_new NUMERIC;
  v_latest_old NUMERIC;
BEGIN
  -- Get the latest history row for this (product, sale_price_type)
  SELECT new_sale_price, old_sale_price
    INTO v_latest_new, v_latest_old
  FROM public.product_sale_price_history
  WHERE product_id = NEW.product_id
    AND sale_price_type_id = NEW.sale_price_type_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_latest_new IS NULL OR v_latest_new <= 0 THEN
    RETURN NEW;
  END IF;

  -- Update every sale_list_items row that uses this product on a list
  -- whose sale_price_type matches NEW.sale_price_type_id.
  UPDATE public.sale_list_items sli
  SET
    current_price  = v_latest_new,
    previous_price = v_latest_old,
    change_amount  = CASE WHEN v_latest_old IS NOT NULL
                          THEN v_latest_new - v_latest_old
                          ELSE NULL END,
    change_percent = CASE WHEN v_latest_old IS NOT NULL AND v_latest_old <> 0
                          THEN ROUND(((v_latest_new - v_latest_old) / v_latest_old) * 100, 2)
                          ELSE NULL END
  FROM public.sale_lists sl
  WHERE sli.sale_list_id = sl.id
    AND sli.product_id = NEW.product_id
    AND sl.sale_price_type_id = NEW.sale_price_type_id;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_daily_capital_inputs_set_updated()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  IF NEW.updated_by IS NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_pro_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_recent_purchase_settings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tick_inquiries()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record;
  v_target_user uuid;
begin
  for r in select id, status from public.inquiries
    where status = 'pending' and now() - created_at > interval '5 minutes' for update
  loop
    update public.inquiries set status = 'warning_5min' where id = r.id;
    insert into public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by, reason)
    values (r.id, r.status, 'warning_5min', null, 'auto-tick');
  end loop;

  for r in select id, status from public.inquiries
    where status = 'warning_5min' and now() - created_at > interval '8 minutes' for update
  loop
    update public.inquiries set status = 'danger_8min' where id = r.id;
    insert into public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by, reason)
    values (r.id, r.status, 'danger_8min', null, 'auto-tick');
  end loop;

  for r in select id, status, assigned_to, requested_by from public.inquiries
    where status = 'danger_8min' and now() - created_at > interval '10 minutes' for update
  loop
    update public.inquiries set status = 'critical_10min' where id = r.id;
    insert into public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by, reason)
    values (r.id, r.status, 'critical_10min', null, 'auto-tick');

    v_target_user := coalesce(r.assigned_to, r.requested_by);
    if v_target_user is not null then
      perform public.auto_submit_penalty(
        r.id, v_target_user, 'no_response_primary', 'medium',
        'عدم پاسخ مسئول اول طی ۱۰ دقیقه'
      );
    end if;
  end loop;

  for r in select id, status from public.inquiries
    where status = 'critical_10min' and now() - created_at > interval '10 minutes' for update
  loop
    update public.inquiries set status = 'transfer_available' where id = r.id;
    insert into public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by, reason)
    values (r.id, r.status, 'transfer_available', null, 'auto-tick');
  end loop;

  for r in select id, status from public.inquiries
    where status not in ('answered','completed_on_time','completed_late','expired','cancelled','rejected')
    and now() - created_at > interval '30 minutes' for update
  loop
    update public.inquiries set status = 'expired', closed_at = now() where id = r.id;
    insert into public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by, reason)
    values (r.id, r.status, 'expired', null, 'auto-tick');
  end loop;

  perform public.expire_pending_documents();
  perform public.expire_pending_delivery_receipts();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.toggle_custom_role_status(_role_id uuid, _is_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r public.custom_roles%ROWTYPE;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'permission denied'; END IF;
  SELECT * INTO r FROM public.custom_roles WHERE id = _role_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'role not found'; END IF;
  IF r.is_system THEN RAISE EXCEPTION 'cannot disable system roles'; END IF;

  UPDATE public.custom_roles SET is_active = _is_active, updated_at = now() WHERE id = _role_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'role', _role_id::text, 'role_status_changed',
          jsonb_build_object('name', r.name, 'old', r.is_active, 'new', _is_active));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_category_product_attributes_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_pcav_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_product_attributes_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$
;

CREATE OR REPLACE FUNCTION public.touch_validation_rules_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.transfer_inquiry(p_inquiry_id uuid, p_to_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_inquiry public.inquiries%ROWTYPE;
BEGIN
  SELECT * INTO v_inquiry FROM public.inquiries WHERE id = p_inquiry_id;
  IF v_inquiry.id IS NULL THEN
    RAISE EXCEPTION 'استعلام یافت نشد.' USING ERRCODE = 'P0001';
  END IF;
  IF v_inquiry.status NOT IN ('transfer_available','critical_10min') THEN
    RAISE EXCEPTION 'انتقال در این وضعیت مجاز نیست.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_messenger_group_member(v_inquiry.group_id, auth.uid()) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.inquiry_transfers(inquiry_id, from_user, to_user)
  VALUES (p_inquiry_id, v_inquiry.assigned_to, p_to_user);
  UPDATE public.inquiries SET assigned_to = p_to_user, status = 'transferred' WHERE id = p_inquiry_id;
  INSERT INTO public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by)
  VALUES (p_inquiry_id, v_inquiry.status, 'transferred', auth.uid());
END; $function$
;

CREATE OR REPLACE FUNCTION public.trg_award_xp_after_score()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.award_xp_from_score(NEW.employee_id);
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_check_achievements_after_score()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Don't recurse on our own reward events
  IF NEW.event_type IS DISTINCT FROM 'achievement_unlocked' THEN
    PERFORM public.check_and_unlock_achievements_for_employee(NEW.employee_id, NEW.event_type);
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_check_missions_after_score()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.event_type NOT IN ('mission_completed', 'achievement_unlocked') THEN
    PERFORM public.check_and_update_mission_progress_for_employee(NEW.employee_id, NEW.event_type);
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_enqueue_on_currency_rate_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_currency text;
  v_reason text;
  v_product_ids uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_currency := NEW.currency;
    v_reason := CASE WHEN NEW.is_active THEN 'currency_rate_activated' ELSE 'currency_rate_changed' END;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only react to meaningful changes
    IF NEW.currency IS NOT DISTINCT FROM OLD.currency
       AND NEW.rate_to_toman IS NOT DISTINCT FROM OLD.rate_to_toman
       AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active
       AND NEW.effective_at IS NOT DISTINCT FROM OLD.effective_at
    THEN
      RETURN NEW;
    END IF;
    v_currency := NEW.currency;
    v_reason := CASE
      WHEN NEW.is_active AND NOT OLD.is_active THEN 'currency_rate_activated'
      ELSE 'currency_rate_changed'
    END;
  ELSE
    RETURN NEW;
  END IF;

  SELECT array_agg(product_id)
  INTO v_product_ids
  FROM public.v_latest_active_purchase_prices
  WHERE currency::text = v_currency;

  IF v_product_ids IS NOT NULL THEN
    PERFORM public.enqueue_pricing_recompute(
      v_product_ids, v_reason, 'currency_rates', NEW.id, NULL, 100
    );
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_enqueue_on_pricing_rule_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_product_ids uuid[];
BEGIN
  -- Use the relevant row (NEW for I/U, OLD for D)
  IF TG_OP = 'DELETE' THEN
    r := OLD;
  ELSE
    r := NEW;
    -- Skip pure no-op updates
    IF TG_OP = 'UPDATE' THEN
      IF NEW.is_active IS NOT DISTINCT FROM OLD.is_active
         AND NEW.product_type IS NOT DISTINCT FROM OLD.product_type
         AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id
         AND NEW.brand_id IS NOT DISTINCT FROM OLD.brand_id
         AND NEW.sale_price_type_id IS NOT DISTINCT FROM OLD.sale_price_type_id
         AND NEW.settlement_type_id IS NOT DISTINCT FROM OLD.settlement_type_id
         AND NEW.margin_type IS NOT DISTINCT FROM OLD.margin_type
         AND NEW.margin_value IS NOT DISTINCT FROM OLD.margin_value
         AND NEW.fixed_margin_value IS NOT DISTINCT FROM OLD.fixed_margin_value
         AND NEW.priority IS NOT DISTINCT FROM OLD.priority
         AND NEW.min_purchase_price_toman IS NOT DISTINCT FROM OLD.min_purchase_price_toman
         AND NEW.max_purchase_price_toman IS NOT DISTINCT FROM OLD.max_purchase_price_toman
      THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  -- Conservative: enqueue active products that match visible scope.
  -- If no scope is set, enqueue all active products.
  SELECT array_agg(p.id)
  INTO v_product_ids
  FROM public.products p
  WHERE p.is_active = true
    AND (r.product_type IS NULL OR p.product_type = r.product_type)
    AND (r.category_id IS NULL OR p.category_id = r.category_id)
    AND (r.brand_id IS NULL OR p.brand_id = r.brand_id);

  IF v_product_ids IS NOT NULL THEN
    PERFORM public.enqueue_pricing_recompute(
      v_product_ids, 'pricing_rule_changed', 'pricing_rules',
      r.id, r.sale_price_type_id, 110
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_enqueue_on_purchase_price_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reason text;
  v_pid uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_pid := NEW.product_id;
    v_reason := CASE WHEN NEW.is_active THEN 'purchase_price_activated' ELSE 'purchase_price_changed' END;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.purchase_price IS NOT DISTINCT FROM OLD.purchase_price
       AND NEW.currency IS NOT DISTINCT FROM OLD.currency
       AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active
       AND NEW.effective_at IS NOT DISTINCT FROM OLD.effective_at
       AND NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at
    THEN
      RETURN NEW;
    END IF;
    v_pid := NEW.product_id;
    v_reason := CASE
      WHEN NEW.is_active AND NOT OLD.is_active THEN 'purchase_price_activated'
      WHEN NOT NEW.is_active AND OLD.is_active THEN 'purchase_price_deactivated'
      ELSE 'purchase_price_changed'
    END;
  ELSIF TG_OP = 'DELETE' THEN
    v_pid := OLD.product_id;
    v_reason := 'purchase_price_deactivated';
  END IF;

  IF v_pid IS NOT NULL THEN
    PERFORM public.enqueue_pricing_recompute(
      ARRAY[v_pid], v_reason, 'purchase_prices',
      COALESCE(NEW.id, OLD.id), NULL, 90
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_enqueue_on_shipping_rule_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_product_ids uuid[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    r := OLD;
  ELSE
    r := NEW;
    IF TG_OP = 'UPDATE' THEN
      IF NEW.is_active IS NOT DISTINCT FROM OLD.is_active
         AND NEW.cost_type IS NOT DISTINCT FROM OLD.cost_type
         AND NEW.cost_value IS NOT DISTINCT FROM OLD.cost_value
         AND NEW.cost_currency IS NOT DISTINCT FROM OLD.cost_currency
         AND NEW.product_type IS NOT DISTINCT FROM OLD.product_type
         AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id
         AND NEW.brand_id IS NOT DISTINCT FROM OLD.brand_id
         AND NEW.product_id IS NOT DISTINCT FROM OLD.product_id
         AND NEW.priority IS NOT DISTINCT FROM OLD.priority
         AND NEW.min_purchase_price IS NOT DISTINCT FROM OLD.min_purchase_price
         AND NEW.max_purchase_price IS NOT DISTINCT FROM OLD.max_purchase_price
      THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  IF r.product_id IS NOT NULL THEN
    PERFORM public.enqueue_pricing_recompute(
      ARRAY[r.product_id], 'shipping_rule_changed', 'shipping_cost_rules',
      r.id, NULL, 110
    );
  ELSE
    SELECT array_agg(p.id)
    INTO v_product_ids
    FROM public.products p
    WHERE p.is_active = true
      AND (r.product_type IS NULL OR p.product_type = r.product_type)
      AND (r.category_id IS NULL OR p.category_id = r.category_id)
      AND (r.brand_id IS NULL OR p.brand_id = r.brand_id);

    IF v_product_ids IS NOT NULL THEN
      PERFORM public.enqueue_pricing_recompute(
        v_product_ids, 'shipping_rule_changed', 'shipping_cost_rules',
        r.id, NULL, 110
      );
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_post_receipt_on_approve()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved')
     AND NEW.payer_accounting_code IS NOT NULL
     AND COALESCE(NEW.beneficiary_accounting_code, NEW.receiver_accounting_code) IS NOT NULL
  THEN
    PERFORM public.post_receipt_journal(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_dynamic_table_cell(p_row_id uuid, p_column_id uuid, p_value text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _table_id uuid;
  _data_type text;
  _col_label text;
  _v_text text;
  _v_number numeric;
  _v_boolean boolean;
  _v_date date;
  _v_datetime timestamptz;
  _val text := NULLIF(btrim(COALESCE(p_value, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی لازم برای ویرایش سلول را ندارید.' USING ERRCODE = '42501';
  END IF;

  SELECT c.table_id, c.data_type::text, c.label
    INTO _table_id, _data_type, _col_label
  FROM dynamic_table_columns c WHERE c.id = p_column_id;

  IF _table_id IS NULL THEN
    RAISE EXCEPTION 'ستون یافت نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM dynamic_table_rows WHERE id = p_row_id AND table_id = _table_id) THEN
    RAISE EXCEPTION 'ردیف یافت نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF _val IS NULL THEN
    _v_text := NULL; _v_number := NULL; _v_boolean := NULL; _v_date := NULL; _v_datetime := NULL;
  ELSE
    IF _data_type = 'number' THEN
      BEGIN
        _v_number := _val::numeric;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'مقدار وارد شده برای ستون «%» یک عدد معتبر نیست.', _col_label USING ERRCODE = '22023';
      END;
    ELSIF _data_type = 'boolean' THEN
      IF _val IN ('true','t','1','بله','yes') THEN _v_boolean := true;
      ELSIF _val IN ('false','f','0','خیر','no') THEN _v_boolean := false;
      ELSE
        RAISE EXCEPTION 'مقدار «بله/خیر» برای ستون «%» نامعتبر است.', _col_label USING ERRCODE = '22023';
      END IF;
    ELSIF _data_type = 'date' THEN
      BEGIN
        _v_date := _val::date;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'تاریخ وارد شده برای ستون «%» معتبر نیست (قالب درست: YYYY-MM-DD).', _col_label USING ERRCODE = '22023';
      END;
    ELSIF _data_type = 'datetime' THEN
      BEGIN
        _v_datetime := _val::timestamptz;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'تاریخ و ساعت وارد شده برای ستون «%» معتبر نیست.', _col_label USING ERRCODE = '22023';
      END;
    ELSE
      _v_text := _val;
    END IF;
  END IF;

  INSERT INTO dynamic_table_cells(table_id, row_id, column_id,
                                  value_text, value_number, value_boolean, value_date, value_datetime, updated_at)
  VALUES (_table_id, p_row_id, p_column_id,
          _v_text, _v_number, _v_boolean, _v_date, _v_datetime, now())
  ON CONFLICT (row_id, column_id) DO UPDATE
    SET value_text = EXCLUDED.value_text,
        value_number = EXCLUDED.value_number,
        value_boolean = EXCLUDED.value_boolean,
        value_date = EXCLUDED.value_date,
        value_datetime = EXCLUDED.value_datetime,
        updated_at = now();

  UPDATE dynamic_table_rows SET updated_at = now() WHERE id = p_row_id;

  INSERT INTO audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'dynamic_table_cell', p_row_id::text || ':' || p_column_id::text, 'updated',
          jsonb_build_object('value', p_value));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_dynamic_table_column(p_column_id uuid, p_label text, p_is_required boolean, p_is_filterable boolean, p_is_editable_by_bot boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE dynamic_table_columns
  SET label = p_label,
      is_required = p_is_required,
      is_filterable = p_is_filterable,
      is_editable_by_bot = p_is_editable_by_bot
  WHERE id = p_column_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'column not found';
  END IF;

  INSERT INTO audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'dynamic_table_column', p_column_id::text, 'updated',
          jsonb_build_object('label', p_label,
                             'is_required', p_is_required,
                             'is_filterable', p_is_filterable,
                             'is_editable_by_bot', p_is_editable_by_bot));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_inquiry_status(p_inquiry_id uuid, p_new_status inquiry_status)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_current public.inquiry_status; v_group_id uuid;
BEGIN
  SELECT status, group_id INTO v_current, v_group_id FROM public.inquiries WHERE id = p_inquiry_id;
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'استعلام یافت نشد.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_messenger_group_member(v_group_id, auth.uid()) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.inquiries SET status = p_new_status WHERE id = p_inquiry_id;
  INSERT INTO public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by)
  VALUES (p_inquiry_id, v_current, p_new_status, auth.uid());
END; $function$
;

CREATE OR REPLACE FUNCTION public.update_market_rate_source_mapping(p_mapping_id uuid, p_source_symbol text, p_normalize_multiplier numeric, p_is_enabled boolean, p_note text)
 RETURNS market_rate_source_mappings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_old public.market_rate_source_mappings;
  v_new public.market_rate_source_mappings;
  v_source_code text;
  v_indicator_code text;
  v_sym text;
  v_note text;
  v_suspect_activation boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT (
    public.has_role(v_uid, 'admin'::public.app_role)
    OR public.has_role(v_uid, 'manager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Access denied: only admin/manager can update mappings';
  END IF;

  v_sym := btrim(coalesce(p_source_symbol, ''));
  IF length(v_sym) = 0 THEN
    RAISE EXCEPTION 'source_symbol cannot be empty';
  END IF;
  IF length(v_sym) > 100 THEN
    RAISE EXCEPTION 'source_symbol too long (max 100)';
  END IF;
  IF p_normalize_multiplier IS NULL OR p_normalize_multiplier <= 0 THEN
    RAISE EXCEPTION 'normalize_multiplier must be > 0';
  END IF;
  v_note := coalesce(p_note, '');
  IF length(v_note) > 500 THEN
    RAISE EXCEPTION 'note too long (max 500)';
  END IF;

  SELECT * INTO v_old FROM public.market_rate_source_mappings WHERE id = p_mapping_id;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'mapping not found';
  END IF;

  IF p_is_enabled = true AND v_old.is_enabled = false
     AND (coalesce(v_old.note,'') ~ 'نیاز به تأیید' OR coalesce(v_old.note,'') ~ 'مبهم') THEN
    v_suspect_activation := true;
  END IF;

  UPDATE public.market_rate_source_mappings
  SET source_symbol = v_sym,
      normalize_multiplier = p_normalize_multiplier,
      is_enabled = p_is_enabled,
      note = NULLIF(v_note, ''),
      updated_at = now()
  WHERE id = p_mapping_id
  RETURNING * INTO v_new;

  SELECT code INTO v_source_code FROM public.market_rate_sources WHERE id = v_new.source_id;
  SELECT code INTO v_indicator_code FROM public.market_indicators WHERE id = v_new.indicator_id;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
  VALUES (
    'market_rate_mapping_updated',
    'market_rate_source_mapping',
    v_new.id,
    v_uid,
    jsonb_build_object(
      'source_code', v_source_code,
      'indicator_code', v_indicator_code,
      'suspect_activation', v_suspect_activation,
      'before', jsonb_build_object(
        'source_symbol', v_old.source_symbol,
        'normalize_multiplier', v_old.normalize_multiplier,
        'is_enabled', v_old.is_enabled,
        'note', v_old.note
      ),
      'after', jsonb_build_object(
        'source_symbol', v_new.source_symbol,
        'normalize_multiplier', v_new.normalize_multiplier,
        'is_enabled', v_new.is_enabled,
        'note', v_new.note
      )
    )
  );

  RETURN v_new;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_purchase_status(p_request_id uuid, p_new_status text, p_note text DEFAULT NULL::text, p_final_price numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old_status text;
  v_requester uuid;
  v_assignee uuid;
  v_caller uuid := auth.uid();
  v_status_fa text;
begin
  if v_caller is null then
    raise exception 'احراز هویت لازم است';
  end if;

  if p_new_status not in ('pending','approved','purchased','delivered','cancelled') then
    raise exception 'وضعیت نامعتبر است';
  end if;

  select status, requested_by, assigned_to
    into v_old_status, v_requester, v_assignee
  from public.purchase_requests
  where id = p_request_id;

  if not found then
    raise exception 'درخواست یافت نشد';
  end if;

  if not (
    public.has_role(v_caller, 'admin') or
    public.has_role(v_caller, 'manager') or
    v_assignee = v_caller
  ) then
    raise exception 'دسترسی ندارید';
  end if;

  update public.purchase_requests
  set
    status = p_new_status,
    final_price = coalesce(p_final_price, final_price),
    updated_at = now()
  where id = p_request_id;

  insert into public.purchase_request_status_history
    (request_id, from_status, to_status, changed_by, note)
  values
    (p_request_id, v_old_status, p_new_status, v_caller, p_note);

  v_status_fa := case p_new_status
    when 'pending' then 'در انتظار تأیید'
    when 'approved' then 'تأیید شده'
    when 'purchased' then 'خرید انجام شد'
    when 'delivered' then 'تحویل داده شد'
    when 'cancelled' then 'لغو شد'
    else p_new_status
  end;

  insert into public.notification_events
    (event_type, user_id, channel, payload, status)
  values (
    'purchase_status_changed', v_requester, 'in_app',
    jsonb_build_object(
      'title','وضعیت درخواست خرید تغییر کرد',
      'body','وضعیت درخواست خرید شما به «' || v_status_fa || '» تغییر یافت.',
      'reference_type','purchase_request',
      'reference_id', p_request_id,
      'from', v_old_status,
      'to', p_new_status
    ),
    'pending'
  );

  insert into public.audit_logs
    (entity_type, entity_id, action, actor_id, diff)
  values (
    'purchase_request', p_request_id::text, 'status_changed',
    v_caller,
    jsonb_build_object('from', v_old_status, 'to', p_new_status)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_role_permissions(_role_name text, _permissions jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec jsonb;
  changed_modules text[] := ARRAY[]::text[];
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'permission denied'; END IF;

  FOR rec IN SELECT * FROM jsonb_array_elements(_permissions) LOOP
    INSERT INTO public.role_permissions (
      role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive
    ) VALUES (
      _role_name,
      rec->>'module',
      COALESCE((rec->>'can_view')::boolean, false),
      COALESCE((rec->>'can_create')::boolean, false),
      COALESCE((rec->>'can_update')::boolean, false),
      COALESCE((rec->>'can_delete')::boolean, false),
      COALESCE((rec->>'can_approve')::boolean, false),
      COALESCE((rec->>'can_export')::boolean, false),
      COALESCE((rec->>'can_view_sensitive')::boolean, false)
    )
    ON CONFLICT (role_name, module) DO UPDATE SET
      can_view = EXCLUDED.can_view,
      can_create = EXCLUDED.can_create,
      can_update = EXCLUDED.can_update,
      can_delete = EXCLUDED.can_delete,
      can_approve = EXCLUDED.can_approve,
      can_export = EXCLUDED.can_export,
      can_view_sensitive = EXCLUDED.can_view_sensitive,
      updated_at = now();
    changed_modules := array_append(changed_modules, rec->>'module');
  END LOOP;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'role_permissions', _role_name, 'role_permissions_updated',
          jsonb_build_object('role_name', _role_name, 'modules', to_jsonb(changed_modules)));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_sales_quote_status(p_quote_id uuid, p_next sales_quote_status, p_reason text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, status sales_quote_status, cancel_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row public.sales_quotes%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row
  FROM public.sales_quotes sq
  WHERE sq.id = p_quote_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'پیش‌فاکتور یافت نشد.' USING ERRCODE = 'P0002';
  END IF;

  -- Authorization mirrors existing RLS policies on public.sales_quotes
  IF public.has_any_role(_uid, ARRAY['admin','manager']::public.app_role[]) THEN
    NULL;
  ELSIF public.has_role(_uid, 'sales'::public.app_role)
        AND _row.salesperson_id = _uid
        AND p_next IN ('draft'::public.sales_quote_status,
                       'sent'::public.sales_quote_status,
                       'rejected'::public.sales_quote_status,
                       'canceled'::public.sales_quote_status) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'دسترسی لازم برای این عملیات را ندارید.' USING ERRCODE = '42501';
  END IF;

  IF p_next = 'canceled'::public.sales_quote_status
     AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RAISE EXCEPTION 'برای لغو پیش‌فاکتور، دلیل لغو الزامی است.' USING ERRCODE = '22023';
  END IF;

  -- Transition validity + audit are enforced by existing triggers.
  IF p_next = 'canceled'::public.sales_quote_status THEN
    UPDATE public.sales_quotes AS sq
       SET status = p_next,
           cancel_reason = p_reason
     WHERE sq.id = p_quote_id;
  ELSE
    UPDATE public.sales_quotes AS sq
       SET status = p_next
     WHERE sq.id = p_quote_id;
  END IF;

  RETURN QUERY
  SELECT sq.id, sq.status, sq.cancel_reason
  FROM public.sales_quotes sq
  WHERE sq.id = p_quote_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_waybill_status(p_waybill_id uuid, p_new_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_old text;
BEGIN
  IF NOT public.has_any_role(v_user, ARRAY['admin','manager','sales']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_new_status NOT IN ('draft','registered','delivered_to_carrier','sent','delivered_to_customer','canceled') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;

  SELECT status INTO v_old FROM public.waybills WHERE id = p_waybill_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'waybill not found'; END IF;
  IF v_old = p_new_status THEN RETURN; END IF;

  UPDATE public.waybills SET status = p_new_status, updated_at = now() WHERE id = p_waybill_id;

  INSERT INTO public.audit_logs(entity_type, entity_id, action, actor_id, diff)
  VALUES ('waybill', p_waybill_id::text, 'waybill_status_changed', v_user,
          jsonb_build_object('old_status', v_old, 'new_status', p_new_status));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_workflow_setting(p_process_key text, p_uploader_role text DEFAULT NULL::text, p_reviewer_role text DEFAULT NULL::text, p_timer_minutes integer DEFAULT NULL::integer, p_penalty_enabled boolean DEFAULT NULL::boolean, p_penalty_for text DEFAULT NULL::text, p_is_active boolean DEFAULT NULL::boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'فقط مدیر می‌تواند تنظیمات را تغییر دهد';
  END IF;

  UPDATE public.workflow_settings
  SET
    uploader_role   = COALESCE(p_uploader_role,   uploader_role),
    reviewer_role   = COALESCE(p_reviewer_role,   reviewer_role),
    timer_minutes   = COALESCE(p_timer_minutes,   timer_minutes),
    penalty_enabled = COALESCE(p_penalty_enabled, penalty_enabled),
    penalty_for     = COALESCE(p_penalty_for,     penalty_for),
    is_active       = COALESCE(p_is_active,       is_active),
    updated_by      = auth.uid(),
    updated_at      = now()
  WHERE process_key = p_process_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'فرایند یافت نشد: %', p_process_key;
  END IF;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, diff)
  VALUES (
    'workflow_setting', p_process_key, 'updated', auth.uid(),
    jsonb_build_object(
      'timer_minutes',   p_timer_minutes,
      'penalty_enabled', p_penalty_enabled,
      'uploader_role',   p_uploader_role,
      'reviewer_role',   p_reviewer_role,
      'penalty_for',     p_penalty_for,
      'is_active',       p_is_active
    )
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_daily_capital_input(p_capital_date date, p_bank_balance numeric DEFAULT 0, p_cash_balance numeric DEFAULT 0, p_incoming_checks numeric DEFAULT 0, p_outgoing_checks numeric DEFAULT 0, p_external_receivables numeric DEFAULT 0, p_external_payables numeric DEFAULT 0, p_near_term_expenses numeric DEFAULT 0, p_risk_reserve numeric DEFAULT 0, p_blocked_funds numeric DEFAULT 0, p_inventory_liquidity_value numeric DEFAULT 0, p_manual_adjustment numeric DEFAULT 0, p_notes text DEFAULT NULL::text)
 RETURNS daily_capital_inputs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.daily_capital_inputs;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_capital_date IS NULL THEN
    RAISE EXCEPTION 'capital_date is required' USING ERRCODE = '22023';
  END IF;

  -- Disallow negative numeric inputs (defensive; UI may also clamp).
  IF p_bank_balance < 0 OR p_cash_balance < 0 OR p_incoming_checks < 0
     OR p_outgoing_checks < 0 OR p_external_receivables < 0 OR p_external_payables < 0
     OR p_near_term_expenses < 0 OR p_risk_reserve < 0 OR p_blocked_funds < 0
     OR p_inventory_liquidity_value < 0 THEN
    RAISE EXCEPTION 'numeric inputs must be >= 0' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.daily_capital_inputs(
    capital_date, bank_balance, cash_balance, incoming_checks, outgoing_checks,
    external_receivables, external_payables, near_term_expenses, risk_reserve,
    blocked_funds, inventory_liquidity_value, manual_adjustment, notes,
    created_by, updated_by
  ) VALUES (
    p_capital_date, p_bank_balance, p_cash_balance, p_incoming_checks, p_outgoing_checks,
    p_external_receivables, p_external_payables, p_near_term_expenses, p_risk_reserve,
    p_blocked_funds, p_inventory_liquidity_value, p_manual_adjustment, p_notes,
    auth.uid(), auth.uid()
  )
  ON CONFLICT (capital_date) DO UPDATE SET
    bank_balance              = EXCLUDED.bank_balance,
    cash_balance              = EXCLUDED.cash_balance,
    incoming_checks           = EXCLUDED.incoming_checks,
    outgoing_checks           = EXCLUDED.outgoing_checks,
    external_receivables      = EXCLUDED.external_receivables,
    external_payables         = EXCLUDED.external_payables,
    near_term_expenses        = EXCLUDED.near_term_expenses,
    risk_reserve              = EXCLUDED.risk_reserve,
    blocked_funds             = EXCLUDED.blocked_funds,
    inventory_liquidity_value = EXCLUDED.inventory_liquidity_value,
    manual_adjustment         = EXCLUDED.manual_adjustment,
    notes                     = EXCLUDED.notes,
    updated_by                = auth.uid()
  RETURNING * INTO r;

  RETURN r;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_market_product_match_candidate(p_source_name market_match_source, p_source_product_url text, p_source_product_id text, p_source_title text, p_normalized_source_title text DEFAULT NULL::text, p_confidence_score numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(match_id uuid, match_status market_match_status, created_or_updated text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing public.market_product_matches%ROWTYPE;
  v_id uuid;
BEGIN
  IF p_source_product_url IS NULL AND p_source_product_id IS NULL THEN
    RAISE EXCEPTION 'source_product_url or source_product_id is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_source_title IS NULL OR length(btrim(p_source_title)) = 0 THEN
    RAISE EXCEPTION 'source_title is required' USING ERRCODE = 'check_violation';
  END IF;
  IF p_confidence_score IS NOT NULL
     AND (p_confidence_score < 0 OR p_confidence_score > 100) THEN
    RAISE EXCEPTION 'confidence_score must be between 0 and 100'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Lookup by source_product_id first, then by URL
  IF p_source_product_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.market_product_matches
    WHERE source_name = p_source_name
      AND source_product_id = p_source_product_id
    LIMIT 1;
  END IF;
  IF v_existing.id IS NULL AND p_source_product_url IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.market_product_matches
    WHERE source_name = p_source_name
      AND source_product_url = p_source_product_url
    LIMIT 1;
  END IF;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.market_product_matches
       SET source_title = p_source_title,
           normalized_source_title = COALESCE(p_normalized_source_title, normalized_source_title),
           confidence_score = COALESCE(p_confidence_score, confidence_score),
           notes = COALESCE(p_notes, notes),
           last_seen_at = now()
     WHERE id = v_existing.id
     RETURNING id, market_product_matches.match_status INTO v_id, match_status;
    created_or_updated := 'updated';
    match_id := v_id;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Insert new candidate with safe status. NEVER 'approved'.
  INSERT INTO public.market_product_matches (
    source_name, source_product_url, source_product_id,
    source_title, normalized_source_title,
    confidence_score, notes, last_seen_at,
    match_status, matched_by
  ) VALUES (
    p_source_name, p_source_product_url, p_source_product_id,
    p_source_title, p_normalized_source_title,
    p_confidence_score, p_notes, now(),
    'pending'::public.market_match_status,
    'bot'::public.market_match_actor
  )
  RETURNING id, market_product_matches.match_status INTO v_id, match_status;

  created_or_updated := 'created';
  match_id := v_id;
  RETURN NEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_customer_capital_alloc_override()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF ROUND(NEW.final_amount) <> ROUND(NEW.system_suggested_amount)
     AND (NEW.override_reason IS NULL OR length(btrim(NEW.override_reason)) = 0) THEN
    RAISE EXCEPTION 'override_reason required when final_amount differs from system_suggested_amount'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_gamification_reward()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.title_fa IS NULL OR length(btrim(NEW.title_fa)) = 0 THEN
    RAISE EXCEPTION 'عنوان فارسی الزامی است';
  END IF;
  IF NEW.reward_value IS NOT NULL AND NEW.reward_value < 0 THEN
    RAISE EXCEPTION 'مقدار پاداش نمی‌تواند منفی باشد';
  END IF;
  IF NEW.sort_order < 0 THEN
    RAISE EXCEPTION 'ترتیب نمی‌تواند منفی باشد';
  END IF;

  IF NEW.trigger_type IN ('level_reached','season_top_rank') THEN
    IF NEW.trigger_value IS NULL OR NEW.trigger_value <= 0 THEN
      RAISE EXCEPTION 'برای این نوع محرک، مقدار عددی الزامی است';
    END IF;
  END IF;

  IF NEW.trigger_type IN ('achievement_unlocked','mission_completed','league_reached') THEN
    IF NEW.trigger_ref_id IS NULL THEN
      RAISE EXCEPTION 'برای این نوع محرک، انتخاب مرجع الزامی است';
    END IF;
  END IF;

  IF NEW.trigger_value IS NULL THEN NEW.trigger_value := 0; END IF;
  NEW.enabled := NEW.is_active;
  NEW.display_order := NEW.sort_order;
  IF NEW.key IS NULL OR length(btrim(NEW.key)) = 0 THEN
    NEW.key := 'rwd_' || NEW.trigger_type || '_' || COALESCE(NEW.trigger_ref_id::text,'') || '_' || COALESCE(NEW.trigger_value::text,'') || '_' || NEW.reward_type;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.gamification_rewards r
     WHERE r.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
       AND r.trigger_type = NEW.trigger_type
       AND r.reward_type = NEW.reward_type
       AND COALESCE(r.trigger_ref_id::text,'') = COALESCE(NEW.trigger_ref_id::text,'')
       AND COALESCE(r.trigger_value, 0) = COALESCE(NEW.trigger_value, 0)
  ) THEN
    RAISE EXCEPTION 'این پاداش قبلاً تعریف شده است';
  END IF;

  RETURN NEW;
END$function$
;

CREATE OR REPLACE FUNCTION public.validate_invoice_item_price()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice RECORD;
  v_bounds RECORD;
  v_product_name text;
  v_msg text;
BEGIN
  SELECT id, type, sale_price_type_id, customer_id
  INTO v_invoice
  FROM public.invoices
  WHERE id = NEW.invoice_id;

  -- Only enforce on pre_invoice
  IF v_invoice.type IS DISTINCT FROM 'pre_invoice' THEN
    RETURN NEW;
  END IF;

  IF NEW.unit_price IS NULL OR NEW.unit_price <= 0 THEN
    RAISE EXCEPTION 'قیمت واحد ردیف معتبر نیست.' USING ERRCODE = 'P0001';
  END IF;

  SELECT name INTO v_product_name FROM public.products WHERE id = NEW.product_id;
  v_product_name := COALESCE(v_product_name, '—');

  SELECT * INTO v_bounds
  FROM public.get_product_price_bounds(NEW.product_id, v_invoice.sale_price_type_id);

  IF NOT v_bounds.has_any THEN
    v_msg := format('برای محصول «%s» هیچ قیمت فروشی ثبت نشده — ابتدا قیمت‌گذاری کنید.', v_product_name);
    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff, created_at)
    VALUES (auth.uid(), 'invoice_price_blocked', 'invoice_item', NEW.id::text,
      jsonb_build_object('reason','no_price','product_id',NEW.product_id,'attempted',NEW.unit_price), now());
    RAISE EXCEPTION '%', v_msg USING ERRCODE = 'P0001';
  END IF;

  IF NEW.unit_price < v_bounds.min_price THEN
    v_msg := format('قیمت ردیف «%s» (%s) از کمترین قیمت فروش ثبت‌شده (%s) کمتر است.',
      v_product_name, NEW.unit_price::text, v_bounds.min_price::text);
    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff, created_at)
    VALUES (auth.uid(), 'invoice_price_blocked', 'invoice_item', NEW.id::text,
      jsonb_build_object('reason','below_min','product_id',NEW.product_id,
        'attempted',NEW.unit_price,'min',v_bounds.min_price,'max',v_bounds.max_price,
        'cap',v_bounds.cap_price,'selected',v_bounds.selected_price,
        'sale_price_type_id',v_invoice.sale_price_type_id), now());
    RAISE EXCEPTION '%', v_msg USING ERRCODE = 'P0001';
  END IF;

  IF v_bounds.selected_price IS NOT NULL AND NEW.unit_price < v_bounds.selected_price THEN
    v_msg := format('قیمت ردیف «%s» (%s) از قیمت قانون نوع قیمت انتخاب‌شده (%s) کمتر است.',
      v_product_name, NEW.unit_price::text, v_bounds.selected_price::text);
    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff, created_at)
    VALUES (auth.uid(), 'invoice_price_blocked', 'invoice_item', NEW.id::text,
      jsonb_build_object('reason','below_selected','product_id',NEW.product_id,
        'attempted',NEW.unit_price,'selected',v_bounds.selected_price,
        'sale_price_type_id',v_invoice.sale_price_type_id), now());
    RAISE EXCEPTION '%', v_msg USING ERRCODE = 'P0001';
  END IF;

  IF NEW.unit_price > v_bounds.cap_price THEN
    v_msg := format('قیمت ردیف «%s» (%s) بیش از سقف مجاز (%s = ۱.۰۵×بالاترین قیمت) است.',
      v_product_name, NEW.unit_price::text, v_bounds.cap_price::text);
    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff, created_at)
    VALUES (auth.uid(), 'invoice_price_blocked', 'invoice_item', NEW.id::text,
      jsonb_build_object('reason','above_cap','product_id',NEW.product_id,
        'attempted',NEW.unit_price,'cap',v_bounds.cap_price,'max',v_bounds.max_price), now());
    RAISE EXCEPTION '%', v_msg USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_journal_entry_balance(p_journal_entry_id uuid)
 RETURNS TABLE(total_debit numeric, total_credit numeric, is_balanced boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(SUM(debit), 0)  AS total_debit,
    COALESCE(SUM(credit), 0) AS total_credit,
    COALESCE(SUM(debit), 0) = COALESCE(SUM(credit), 0)
      AND COALESCE(SUM(debit), 0) > 0 AS is_balanced
  FROM public.journal_lines
  WHERE journal_entry_id = p_journal_entry_id;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_league_season()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.title_fa IS NULL OR length(btrim(NEW.title_fa)) = 0 THEN
    RAISE EXCEPTION 'عنوان فارسی الزامی است';
  END IF;
  IF NEW.starts_at IS NULL THEN RAISE EXCEPTION 'تاریخ شروع الزامی است'; END IF;
  IF NEW.ends_at   IS NULL THEN RAISE EXCEPTION 'تاریخ پایان الزامی است'; END IF;
  IF NEW.ends_at <= NEW.starts_at THEN
    RAISE EXCEPTION 'تاریخ پایان باید بعد از تاریخ شروع باشد';
  END IF;

  -- keep legacy columns in sync so existing readers keep working
  NEW.season_name := COALESCE(NEW.season_name, NEW.title_fa);
  NEW.start_date  := COALESCE(NEW.start_date, NEW.starts_at::date);
  NEW.end_date    := COALESCE(NEW.end_date, NEW.ends_at::date);
  NEW.is_active   := (NEW.status = 'active');
  NEW.updated_at  := now();

  -- only one active season
  IF NEW.status = 'active' AND EXISTS (
    SELECT 1 FROM public.league_seasons s
     WHERE s.status = 'active' AND s.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION 'فقط یک فصل فعال می‌تواند وجود داشته باشد';
  END IF;

  RETURN NEW;
END$function$
;

CREATE OR REPLACE FUNCTION public.validate_league_setting()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.tier IS NULL THEN
    RAISE EXCEPTION 'لیگ الزامی است';
  END IF;
  IF NEW.title_fa IS NULL OR length(btrim(NEW.title_fa)) = 0 THEN
    RAISE EXCEPTION 'عنوان فارسی الزامی است';
  END IF;
  IF NEW.min_level < 0 THEN RAISE EXCEPTION 'حداقل سطح نمی‌تواند منفی باشد'; END IF;
  IF NEW.min_xp < 0 THEN RAISE EXCEPTION 'حداقل XP نمی‌تواند منفی باشد'; END IF;
  IF NEW.promotion_percent < 0 OR NEW.promotion_percent > 100 THEN
    RAISE EXCEPTION 'درصد ارتقا باید بین ۰ و ۱۰۰ باشد';
  END IF;
  IF NEW.demotion_percent < 0 OR NEW.demotion_percent > 100 THEN
    RAISE EXCEPTION 'درصد سقوط باید بین ۰ و ۱۰۰ باشد';
  END IF;
  IF (NEW.promotion_percent + NEW.demotion_percent) > 100 THEN
    RAISE EXCEPTION 'درصد ارتقا و سقوط نمی‌توانند مجموعاً بیشتر از ۱۰۰ باشند';
  END IF;
  IF NEW.sort_order < 0 THEN RAISE EXCEPTION 'ترتیب نمی‌تواند منفی باشد'; END IF;
  RETURN NEW;
END$function$
;

CREATE OR REPLACE FUNCTION public.validate_person_field_value()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_def_active boolean;
  v_def_kind text;
  v_person_kind text;
BEGIN
  SELECT is_active, applies_to_kind
    INTO v_def_active, v_def_kind
    FROM public.person_field_definitions
   WHERE id = NEW.field_definition_id;

  IF v_def_active IS NULL THEN
    RAISE EXCEPTION 'person_field_values: unknown field_definition_id %', NEW.field_definition_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_def_active = false THEN
    RAISE EXCEPTION 'person_field_values: field definition % is inactive', NEW.field_definition_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT kind INTO v_person_kind FROM public.persons WHERE id = NEW.person_id;
  IF v_person_kind IS NULL THEN
    RAISE EXCEPTION 'person_field_values: unknown person_id %', NEW.person_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_def_kind <> 'both' AND v_def_kind <> v_person_kind THEN
    RAISE EXCEPTION 'person_field_values: applies_to_kind (%) does not match person.kind (%)',
      v_def_kind, v_person_kind
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_person_identifier()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_primary = true AND NEW.status = 'revoked' THEN
    RAISE EXCEPTION 'A revoked identifier cannot be primary';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_profile_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN ('pending','active','inactive','rejected') THEN
    RAISE EXCEPTION 'invalid profile status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_sale_price_positive()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.new_sale_price IS NULL OR NEW.new_sale_price <= 0 THEN
    RAISE EXCEPTION 'قیمت فروش باید بزرگ‌تر از صفر باشد (مقدار دریافتی: %)', NEW.new_sale_price
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_shipping_rule_currency()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.cost_type = 'currency' AND (NEW.cost_currency IS NULL OR length(trim(NEW.cost_currency)) = 0) THEN
    RAISE EXCEPTION 'cost_currency is required when cost_type = currency';
  END IF;
  IF NEW.cost_type <> 'currency' THEN
    NEW.cost_currency := NULL;
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.vector(vector, integer, boolean)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector$function$
;

CREATE OR REPLACE FUNCTION public.vector_accum(double precision[], vector)
 RETURNS double precision[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_accum$function$
;

CREATE OR REPLACE FUNCTION public.vector_add(vector, vector)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_add$function$
;

CREATE OR REPLACE FUNCTION public.vector_avg(double precision[])
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_avg$function$
;

CREATE OR REPLACE FUNCTION public.vector_cmp(vector, vector)
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_cmp$function$
;

CREATE OR REPLACE FUNCTION public.vector_combine(double precision[], double precision[])
 RETURNS double precision[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_combine$function$
;

CREATE OR REPLACE FUNCTION public.vector_concat(vector, vector)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_concat$function$
;

CREATE OR REPLACE FUNCTION public.vector_dims(halfvec)
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_vector_dims$function$
;

CREATE OR REPLACE FUNCTION public.vector_dims(vector)
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_dims$function$
;

CREATE OR REPLACE FUNCTION public.vector_eq(vector, vector)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_eq$function$
;

CREATE OR REPLACE FUNCTION public.vector_ge(vector, vector)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_ge$function$
;

CREATE OR REPLACE FUNCTION public.vector_gt(vector, vector)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_gt$function$
;

CREATE OR REPLACE FUNCTION public.vector_in(cstring, oid, integer)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_in$function$
;

CREATE OR REPLACE FUNCTION public.vector_l2_squared_distance(vector, vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_l2_squared_distance$function$
;

CREATE OR REPLACE FUNCTION public.vector_le(vector, vector)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_le$function$
;

CREATE OR REPLACE FUNCTION public.vector_lt(vector, vector)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_lt$function$
;

CREATE OR REPLACE FUNCTION public.vector_mul(vector, vector)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_mul$function$
;

CREATE OR REPLACE FUNCTION public.vector_ne(vector, vector)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_ne$function$
;

CREATE OR REPLACE FUNCTION public.vector_negative_inner_product(vector, vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_negative_inner_product$function$
;

CREATE OR REPLACE FUNCTION public.vector_norm(vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_norm$function$
;

CREATE OR REPLACE FUNCTION public.vector_out(vector)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_out$function$
;

CREATE OR REPLACE FUNCTION public.vector_recv(internal, oid, integer)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_recv$function$
;

CREATE OR REPLACE FUNCTION public.vector_send(vector)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_send$function$
;

CREATE OR REPLACE FUNCTION public.vector_spherical_distance(vector, vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_spherical_distance$function$
;

CREATE OR REPLACE FUNCTION public.vector_sub(vector, vector)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_sub$function$
;

CREATE OR REPLACE FUNCTION public.vector_to_float4(vector, integer, boolean)
 RETURNS real[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_to_float4$function$
;

CREATE OR REPLACE FUNCTION public.vector_to_halfvec(vector, integer, boolean)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_to_halfvec$function$
;

CREATE OR REPLACE FUNCTION public.vector_to_sparsevec(vector, integer, boolean)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_to_sparsevec$function$
;

CREATE OR REPLACE FUNCTION public.vector_typmod_in(cstring[])
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_typmod_in$function$
;

CREATE OR REPLACE FUNCTION public.vote_on_appeal(p_appeal_id uuid, p_vote text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_accept_count int;
  v_reject_count int;
  v_final_status text;
  v_penalty_id uuid;
BEGIN
  IF p_vote NOT IN ('accept', 'reject') THEN
    RAISE EXCEPTION 'رأی نامعتبر';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.appeal_reviewers
    WHERE appeal_id = p_appeal_id
      AND reviewer_id = auth.uid()
      AND vote IS NULL
  ) THEN
    RAISE EXCEPTION 'دسترسی ندارید یا قبلاً رأی داده‌اید';
  END IF;

  UPDATE public.appeal_reviewers
  SET vote = p_vote, vote_note = p_note, voted_at = now()
  WHERE appeal_id = p_appeal_id
    AND reviewer_id = auth.uid();

  SELECT
    count(*) FILTER (WHERE vote = 'accept'),
    count(*) FILTER (WHERE vote = 'reject')
  INTO v_accept_count, v_reject_count
  FROM public.appeal_reviewers
  WHERE appeal_id = p_appeal_id;

  IF v_accept_count >= 2 THEN
    v_final_status := 'accepted';
  ELSIF v_reject_count >= 2 THEN
    v_final_status := 'rejected';
  ELSE
    RETURN jsonb_build_object(
      'status', 'pending',
      'votes', v_accept_count + v_reject_count
    );
  END IF;

  UPDATE public.penalty_appeals
  SET status = v_final_status, reviewed_at = now()
  WHERE id = p_appeal_id
  RETURNING penalty_id INTO v_penalty_id;

  IF v_final_status = 'accepted' THEN
    UPDATE public.performance_penalties
    SET is_active = false
    WHERE id = v_penalty_id;
  END IF;

  INSERT INTO public.notification_events (
    user_id, title, body, type, reference_type, reference_id
  )
  SELECT
    pa.appellant_id,
    'نتیجه اعتراض',
    CASE v_final_status
      WHEN 'accepted' THEN 'اعتراض شما پذیرفته شد — کارت قرمز حذف شد.'
      ELSE 'اعتراض شما رد شد — تخلف ثبت‌شده باقی می‌ماند.'
    END,
    'appeal_result',
    'appeal',
    p_appeal_id
  FROM public.penalty_appeals pa
  WHERE pa.id = p_appeal_id;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, diff)
  VALUES (
    'appeal', p_appeal_id::text, v_final_status, auth.uid(),
    jsonb_build_object('vote', p_vote, 'accept', v_accept_count, 'reject', v_reject_count)
  );

  RETURN jsonb_build_object('status', v_final_status);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity_commutator_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_commutator_op$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity_dist_commutator_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_dist_commutator_op$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity_dist_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_dist_op$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_op$function$
;



-- ============ TRIGGERS ============
CREATE TRIGGER trg_ac_updated BEFORE UPDATE ON public.academy_courses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_al_updated BEFORE UPDATE ON public.academy_lessons FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_aq_updated BEFORE UPDATE ON public.academy_quizzes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_achievements_updated_at BEFORE UPDATE ON public.achievements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_bank_accounts_updated_at BEFORE UPDATE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
CREATE TRIGGER trg_bakta_updated BEFORE UPDATE ON public.bot_api_key_table_access FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_audit_bot_api_keys AFTER INSERT ON public.bot_api_keys FOR EACH ROW EXECUTE FUNCTION audit_bot_api_keys();
CREATE TRIGGER brands_set_updated_at BEFORE UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_audit_brands AFTER INSERT OR UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION audit_brands();
CREATE TRIGGER trg_call_logs_recompute_employee_score AFTER INSERT OR DELETE OR UPDATE ON public.call_logs FOR EACH ROW EXECUTE FUNCTION recompute_employee_scores_on_call_log();
CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_audit_categories AFTER INSERT OR UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION audit_categories();
CREATE TRIGGER trg_cpa_updated_at BEFORE UPDATE ON public.category_product_attributes FOR EACH ROW EXECUTE FUNCTION touch_category_product_attributes_updated_at();
CREATE TRIGGER trg_cr_updated BEFORE UPDATE ON public.credit_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_csr_audit AFTER UPDATE ON public.credit_scoring_rules FOR EACH ROW EXECUTE FUNCTION audit_credit_rule_change();
CREATE TRIGGER trg_csr_updated BEFORE UPDATE ON public.credit_scoring_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_currencies_normalize BEFORE INSERT OR UPDATE ON public.currencies FOR EACH ROW EXECUTE FUNCTION currencies_normalize_code();
CREATE TRIGGER trg_audit_currency_rates AFTER INSERT OR UPDATE ON public.currency_rates FOR EACH ROW EXECUTE FUNCTION audit_currency_rates();
CREATE TRIGGER trg_currency_rates_updated_at BEFORE UPDATE ON public.currency_rates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_prq_currency_rates AFTER INSERT OR UPDATE ON public.currency_rates FOR EACH ROW EXECUTE FUNCTION trg_enqueue_on_currency_rate_change();
CREATE TRIGGER trg_stamp_currency_rates BEFORE INSERT ON public.currency_rates FOR EACH ROW EXECUTE FUNCTION stamp_created_by();
CREATE TRIGGER trg_currency_sources_updated_at BEFORE UPDATE ON public.currency_sources FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_custom_roles_set_updated_at BEFORE UPDATE ON public.custom_roles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_ccap_updated BEFORE UPDATE ON public.customer_capital_allocations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_ccap_validate_override BEFORE INSERT OR UPDATE ON public.customer_capital_allocations FOR EACH ROW EXECUTE FUNCTION validate_customer_capital_alloc_override();
CREATE TRIGGER trg_validate_cca_amounts BEFORE INSERT OR UPDATE OF held_amount, consumed_amount, final_amount ON public.customer_capital_allocations FOR EACH ROW EXECUTE FUNCTION _validate_allocation_amounts();
CREATE TRIGGER trg_ccp_updated BEFORE UPDATE ON public.customer_credit_profile FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER customers_audit AFTER INSERT OR UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION audit_customer_change();
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_customers_log_responsible AFTER UPDATE OF responsible_id ON public.customers FOR EACH ROW EXECUTE FUNCTION log_customer_responsible_change();
CREATE TRIGGER trg_audit_daily_capital_inputs AFTER INSERT OR UPDATE ON public.daily_capital_inputs FOR EACH ROW EXECUTE FUNCTION audit_daily_capital_inputs();
CREATE TRIGGER trg_daily_capital_inputs_updated BEFORE UPDATE ON public.daily_capital_inputs FOR EACH ROW EXECUTE FUNCTION tg_daily_capital_inputs_set_updated();
CREATE TRIGGER trg_archive_prior_allocations AFTER INSERT OR UPDATE OF is_active ON public.daily_capital_snapshots FOR EACH ROW EXECUTE FUNCTION _archive_prior_allocations_on_active();
CREATE TRIGGER trg_audit_daily_capital_snapshots AFTER INSERT ON public.daily_capital_snapshots FOR EACH ROW EXECUTE FUNCTION audit_daily_capital_snapshots();
CREATE TRIGGER daily_mood_audit_trg AFTER INSERT OR UPDATE ON public.daily_mood_entries FOR EACH ROW EXECUTE FUNCTION daily_mood_audit();
CREATE TRIGGER daily_mood_validate_trg BEFORE INSERT OR UPDATE ON public.daily_mood_entries FOR EACH ROW EXECUTE FUNCTION daily_mood_validate();
CREATE TRIGGER set_delivery_receipts_updated_at BEFORE UPDATE ON public.delivery_receipts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_dynamic_cells_updated BEFORE UPDATE ON public.dynamic_table_cells FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_audit_dynamic_columns AFTER INSERT ON public.dynamic_table_columns FOR EACH ROW EXECUTE FUNCTION audit_dynamic_table_columns();
CREATE TRIGGER trg_audit_dynamic_rows AFTER INSERT ON public.dynamic_table_rows FOR EACH ROW EXECUTE FUNCTION audit_dynamic_table_rows();
CREATE TRIGGER trg_dynamic_rows_stamp BEFORE INSERT ON public.dynamic_table_rows FOR EACH ROW EXECUTE FUNCTION dynamic_rows_stamp_user();
CREATE TRIGGER trg_dynamic_rows_updated BEFORE UPDATE ON public.dynamic_table_rows FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER dyn_tables_audit_access AFTER UPDATE ON public.dynamic_tables FOR EACH ROW EXECUTE FUNCTION dyn_tables_log_access_changes();
CREATE TRIGGER trg_audit_dynamic_tables AFTER INSERT OR UPDATE ON public.dynamic_tables FOR EACH ROW EXECUTE FUNCTION audit_dynamic_tables();
CREATE TRIGGER trg_dynamic_tables_stamp BEFORE INSERT ON public.dynamic_tables FOR EACH ROW EXECUTE FUNCTION dynamic_tables_stamp_user();
CREATE TRIGGER trg_dynamic_tables_updated BEFORE UPDATE ON public.dynamic_tables FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_emp_mission_progress_updated_at BEFORE UPDATE ON public.employee_mission_progress FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
CREATE TRIGGER trg_employee_progress_updated_at BEFORE UPDATE ON public.employee_progress FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
CREATE TRIGGER trg_check_achievements_after_score AFTER INSERT ON public.employee_score_events FOR EACH ROW EXECUTE FUNCTION trg_check_achievements_after_score();
CREATE TRIGGER trg_check_missions_after_score AFTER INSERT ON public.employee_score_events FOR EACH ROW EXECUTE FUNCTION trg_check_missions_after_score();
CREATE TRIGGER trg_employee_scores_award_xp AFTER INSERT OR UPDATE OF total_score ON public.employee_scores FOR EACH ROW EXECUTE FUNCTION trg_award_xp_after_score();
CREATE TRIGGER trg_employee_scores_updated_at BEFORE UPDATE ON public.employee_scores FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_emp_streaks_updated_at BEFORE UPDATE ON public.employee_streaks FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
CREATE TRIGGER trg_external_parties_updated_at BEFORE UPDATE ON public.external_parties FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
CREATE TRIGGER trg_feedback_items_updated_at BEFORE UPDATE ON public.feedback_items FOR EACH ROW EXECUTE FUNCTION feedback_items_set_updated_at();
CREATE TRIGGER trg_gamification_kpi_rules_updated_at BEFORE UPDATE ON public.gamification_kpi_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_gamification_kpis_updated_at BEFORE UPDATE ON public.gamification_kpis FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_gamification_rewards_updated_at BEFORE UPDATE ON public.gamification_rewards FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_validate_gamification_reward BEFORE INSERT OR UPDATE ON public.gamification_rewards FOR EACH ROW EXECUTE FUNCTION validate_gamification_reward();
CREATE TRIGGER trg_award_inquiry_response_score AFTER UPDATE OF answered_at ON public.inquiries FOR EACH ROW EXECUTE FUNCTION award_inquiry_response_score();
CREATE TRIGGER invoice_items_audit_insert AFTER INSERT ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION audit_invoice_item_insert();
CREATE TRIGGER invoice_items_validate_price BEFORE INSERT OR UPDATE OF unit_price, product_id, invoice_id ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION validate_invoice_item_price();
CREATE TRIGGER invoices_audit_insert AFTER INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION audit_invoice_insert();
CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_enforce_no_overdue_on_commitment BEFORE INSERT OR UPDATE OF commitment_confirmed, invoice_type, customer_id ON public.invoices FOR EACH ROW EXECUTE FUNCTION enforce_no_overdue_on_commitment();
CREATE TRIGGER trg_invoices_log_type_changes AFTER INSERT OR UPDATE OF invoice_type ON public.invoices FOR EACH ROW EXECUTE FUNCTION invoices_log_type_changes();
CREATE TRIGGER trg_invoices_recompute_employee_score AFTER INSERT OR DELETE OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION recompute_employee_scores_on_invoice();
CREATE TRIGGER knowledge_updated_at BEFORE UPDATE ON public.knowledge_articles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_kd_bump_version BEFORE UPDATE ON public.knowledge_documents FOR EACH ROW EXECUTE FUNCTION kd_bump_version();
CREATE TRIGGER trg_validate_league_season BEFORE INSERT OR UPDATE ON public.league_seasons FOR EACH ROW EXECUTE FUNCTION validate_league_season();
CREATE TRIGGER trg_league_settings_updated_at BEFORE UPDATE ON public.league_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_validate_league_setting BEFORE INSERT OR UPDATE ON public.league_settings FOR EACH ROW EXECUTE FUNCTION validate_league_setting();
CREATE TRIGGER trg_market_indicators_updated BEFORE UPDATE ON public.market_indicators FOR EACH ROW EXECUTE FUNCTION market_set_updated_at();
CREATE TRIGGER trg_mpm_event_log AFTER INSERT OR UPDATE ON public.market_product_matches FOR EACH ROW EXECUTE FUNCTION log_market_product_match_event();
CREATE TRIGGER trg_mpm_updated_at BEFORE UPDATE ON public.market_product_matches FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_market_rate_sources_updated BEFORE UPDATE ON public.market_rate_sources FOR EACH ROW EXECUTE FUNCTION market_set_updated_at();
CREATE TRIGGER trg_marketing_channels_updated_at BEFORE UPDATE ON public.marketing_channels FOR EACH ROW EXECUTE FUNCTION set_marketing_channels_updated_at();
CREATE TRIGGER missions_set_updated_at BEFORE UPDATE ON public.missions FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
CREATE TRIGGER trg_prcf_updated_at BEFORE UPDATE ON public.payment_receipt_custom_fields FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payment_receipt_links_recompute_employee_score AFTER INSERT OR DELETE OR UPDATE OF amount, invoice_id, receipt_id ON public.payment_receipt_links FOR EACH ROW EXECUTE FUNCTION recompute_employee_scores_on_receipt_link();
CREATE TRIGGER trg_payment_receipts_post_journal AFTER INSERT OR UPDATE OF status ON public.payment_receipts FOR EACH ROW EXECUTE FUNCTION trg_post_receipt_on_approve();
CREATE TRIGGER trg_payment_receipts_recompute_employee_score AFTER INSERT OR DELETE OR UPDATE OF status ON public.payment_receipts FOR EACH ROW EXECUTE FUNCTION recompute_employee_scores_on_receipt();
CREATE TRIGGER trg_payment_receipts_updated_at BEFORE UPDATE ON public.payment_receipts FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();
CREATE TRIGGER payment_terms_set_updated_at BEFORE UPDATE ON public.payment_terms FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_pcl_audit_insert AFTER INSERT ON public.person_context_links FOR EACH ROW EXECUTE FUNCTION audit_person_context_links_insert();
CREATE TRIGGER trg_pcl_audit_update AFTER UPDATE ON public.person_context_links FOR EACH ROW EXECUTE FUNCTION audit_person_context_links_update();
CREATE TRIGGER trg_pcl_set_updated_at BEFORE UPDATE ON public.person_context_links FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_pfd_audit AFTER INSERT OR UPDATE ON public.person_field_definitions FOR EACH ROW EXECUTE FUNCTION audit_person_field_definitions();
CREATE TRIGGER trg_pfd_updated_at BEFORE UPDATE ON public.person_field_definitions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_pfv_audit AFTER INSERT OR UPDATE ON public.person_field_values FOR EACH ROW EXECUTE FUNCTION audit_person_field_values();
CREATE TRIGGER trg_pfv_updated_at BEFORE UPDATE ON public.person_field_values FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_pfv_validate BEFORE INSERT OR UPDATE ON public.person_field_values FOR EACH ROW EXECUTE FUNCTION validate_person_field_value();
CREATE TRIGGER trg_person_identifiers_audit_insert AFTER INSERT ON public.person_identifiers FOR EACH ROW EXECUTE FUNCTION audit_person_identifiers_insert();
CREATE TRIGGER trg_person_identifiers_audit_update AFTER UPDATE ON public.person_identifiers FOR EACH ROW EXECUTE FUNCTION audit_person_identifiers_update();
CREATE TRIGGER trg_person_identifiers_set_updated_at BEFORE UPDATE ON public.person_identifiers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_person_identifiers_validate BEFORE INSERT OR UPDATE ON public.person_identifiers FOR EACH ROW EXECUTE FUNCTION validate_person_identifier();
CREATE TRIGGER trg_persons_audit_insert AFTER INSERT ON public.persons FOR EACH ROW EXECUTE FUNCTION audit_persons_insert();
CREATE TRIGGER trg_persons_audit_update AFTER UPDATE ON public.persons FOR EACH ROW EXECUTE FUNCTION audit_persons_update();
CREATE TRIGGER trg_persons_set_updated_at BEFORE UPDATE ON public.persons FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_par_updated_at BEFORE UPDATE ON public.price_alert_rules FOR EACH ROW EXECUTE FUNCTION _par_set_updated_at();
CREATE TRIGGER trg_audit_price_snapshots AFTER INSERT ON public.price_calculation_snapshots FOR EACH ROW EXECUTE FUNCTION audit_price_snapshots();
CREATE TRIGGER trg_audit_price_change_reasons AFTER INSERT OR UPDATE ON public.price_change_reasons FOR EACH ROW EXECUTE FUNCTION audit_price_change_reasons();
CREATE TRIGGER trg_change_reasons_updated_at BEFORE UPDATE ON public.price_change_reasons FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER price_lists_updated_at BEFORE UPDATE ON public.price_lists FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER pba_touch_updated_at BEFORE UPDATE ON public.pricing_board_access_requests FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_pricing_board_settings_updated_at BEFORE UPDATE ON public.pricing_board_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER pricing_rules_updated_at BEFORE UPDATE ON public.pricing_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_audit_pricing_rules AFTER INSERT OR UPDATE ON public.pricing_rules FOR EACH ROW EXECUTE FUNCTION audit_pricing_rules();
CREATE TRIGGER trg_prq_pricing_rules AFTER INSERT OR DELETE OR UPDATE ON public.pricing_rules FOR EACH ROW EXECUTE FUNCTION trg_enqueue_on_pricing_rule_change();
CREATE TRIGGER trg_pag_updated_at BEFORE UPDATE ON public.product_attribute_groups FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_product_attributes_updated_at BEFORE UPDATE ON public.product_attributes FOR EACH ROW EXECUTE FUNCTION touch_product_attributes_updated_at();
CREATE TRIGGER trg_pcav_updated_at BEFORE UPDATE ON public.product_category_attribute_values FOR EACH ROW EXECUTE FUNCTION touch_pcav_updated_at();
CREATE TRIGGER trg_sync_sale_list_items_from_computed AFTER INSERT OR UPDATE ON public.product_computed_prices FOR EACH ROW EXECUTE FUNCTION sync_sale_list_items_from_computed();
CREATE TRIGGER product_label_links_audit AFTER INSERT OR DELETE ON public.product_label_links FOR EACH ROW EXECUTE FUNCTION audit_product_label_links();
CREATE TRIGGER product_labels_set_updated_at BEFORE UPDATE ON public.product_labels FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER product_owners_audit AFTER INSERT OR DELETE ON public.product_owner_assignments FOR EACH ROW EXECUTE FUNCTION audit_product_owners();
CREATE TRIGGER trg_pro_updated_at BEFORE UPDATE ON public.product_recommendation_overrides FOR EACH ROW EXECUTE FUNCTION tg_pro_set_updated_at();
CREATE TRIGGER trg_audit_sale_price_history AFTER INSERT ON public.product_sale_price_history FOR EACH ROW EXECUTE FUNCTION audit_sale_price_history();
CREATE TRIGGER trg_par_after_price_history AFTER INSERT ON public.product_sale_price_history FOR EACH ROW EXECUTE FUNCTION _par_after_price_history_insert();
CREATE TRIGGER trg_sync_sale_list_items AFTER INSERT OR UPDATE ON public.product_sale_price_history FOR EACH ROW EXECUTE FUNCTION sync_sale_list_items_from_history();
CREATE TRIGGER trg_validate_sale_price_positive BEFORE INSERT OR UPDATE ON public.product_sale_price_history FOR EACH ROW EXECUTE FUNCTION validate_sale_price_positive();
CREATE TRIGGER product_suppliers_audit_delete AFTER DELETE ON public.product_suppliers FOR EACH ROW EXECUTE FUNCTION audit_product_suppliers_delete();
CREATE TRIGGER product_suppliers_audit_insert AFTER INSERT ON public.product_suppliers FOR EACH ROW EXECUTE FUNCTION audit_product_suppliers_insert();
CREATE TRIGGER products_audit AFTER INSERT OR DELETE OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION audit_products();
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER products_stamp_user BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION products_stamp_user();
CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_notify_on_stock_available AFTER UPDATE OF stock_status ON public.products FOR EACH ROW EXECUTE FUNCTION notify_on_stock_available();
CREATE TRIGGER trg_products_assign_sku BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION products_assign_sku();
CREATE TRIGGER trg_products_validate_base_currency BEFORE INSERT OR UPDATE OF base_currency ON public.products FOR EACH ROW EXECUTE FUNCTION products_validate_base_currency();
CREATE TRIGGER trg_pfd_updated_at BEFORE UPDATE ON public.profile_field_definitions FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_pfv_updated_at BEFORE UPDATE ON public.profile_field_values FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER profiles_validate_status BEFORE INSERT OR UPDATE OF status ON public.profiles FOR EACH ROW EXECUTE FUNCTION validate_profile_status();
CREATE TRIGGER trg_audit_purchase_prices AFTER INSERT OR UPDATE ON public.purchase_prices FOR EACH ROW EXECUTE FUNCTION audit_purchase_prices();
CREATE TRIGGER trg_auto_link_supplier_on_purchase AFTER INSERT ON public.purchase_prices FOR EACH ROW EXECUTE FUNCTION auto_link_supplier_on_purchase();
CREATE TRIGGER trg_prq_purchase_prices AFTER INSERT OR DELETE OR UPDATE ON public.purchase_prices FOR EACH ROW EXECUTE FUNCTION trg_enqueue_on_purchase_price_change();
CREATE TRIGGER trg_purchase_prices_updated_at BEFORE UPDATE ON public.purchase_prices FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_stamp_purchase_prices BEFORE INSERT ON public.purchase_prices FOR EACH ROW EXECUTE FUNCTION stamp_registered_by();
CREATE TRIGGER trg_purchase_requests_updated_at BEFORE UPDATE ON public.purchase_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER purchases_audit_insert AFTER INSERT ON public.purchases FOR EACH ROW EXECUTE FUNCTION audit_purchase_insert();
CREATE TRIGGER purchases_updated_at BEFORE UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_award_accountant_payment_score AFTER UPDATE OF paid_at ON public.purchases FOR EACH ROW EXECUTE FUNCTION award_accountant_payment_score();
CREATE TRIGGER trg_award_buyer_purchase_score AFTER INSERT ON public.purchases FOR EACH ROW EXECUTE FUNCTION award_buyer_purchase_score();
CREATE TRIGGER trg_guard_accountant_purchase_update BEFORE UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION guard_accountant_purchase_update();
CREATE TRIGGER trg_recent_purchase_settings_updated_at BEFORE UPDATE ON public.recent_purchase_settings FOR EACH ROW EXECUTE FUNCTION tg_recent_purchase_settings_updated_at();
CREATE TRIGGER trg_role_permissions_set_updated_at BEFORE UPDATE ON public.role_permissions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_fill_sale_list_item_on_insert BEFORE INSERT ON public.sale_list_items FOR EACH ROW EXECUTE FUNCTION fill_sale_list_item_on_insert();
CREATE TRIGGER sale_lists_audit AFTER INSERT ON public.sale_lists FOR EACH ROW EXECUTE FUNCTION audit_sale_lists();
CREATE TRIGGER sale_lists_audit_update_trg AFTER UPDATE ON public.sale_lists FOR EACH ROW EXECUTE FUNCTION sale_lists_audit_update();
CREATE TRIGGER trg_sale_lists_updated_at BEFORE UPDATE ON public.sale_lists FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_audit_sale_price_types AFTER INSERT OR UPDATE ON public.sale_price_types FOR EACH ROW EXECUTE FUNCTION audit_sale_price_types();
CREATE TRIGGER trg_sale_price_types_updated_at BEFORE UPDATE ON public.sale_price_types FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_set_sale_price_type_code BEFORE INSERT ON public.sale_price_types FOR EACH ROW EXECUTE FUNCTION set_sale_price_type_code();
CREATE TRIGGER trg_audit_sales_quote_send_queue AFTER INSERT OR UPDATE ON public.sales_quote_send_queue FOR EACH ROW EXECUTE FUNCTION audit_sales_quote_send_queue();
CREATE TRIGGER trg_sqsq_updated_at BEFORE UPDATE ON public.sales_quote_send_queue FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_audit_sales_quote_share_logs AFTER INSERT ON public.sales_quote_share_logs FOR EACH ROW EXECUTE FUNCTION audit_sales_quote_share_logs();
CREATE TRIGGER trg_audit_sales_quotes AFTER INSERT OR UPDATE ON public.sales_quotes FOR EACH ROW EXECUTE FUNCTION audit_sales_quotes();
CREATE TRIGGER trg_sales_quotes_assign_number BEFORE INSERT OR UPDATE ON public.sales_quotes FOR EACH ROW EXECUTE FUNCTION sales_quotes_assign_number();
CREATE TRIGGER trg_sales_quotes_updated_at BEFORE UPDATE ON public.sales_quotes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sales_quotes_validate_status BEFORE UPDATE ON public.sales_quotes FOR EACH ROW EXECUTE FUNCTION sales_quotes_validate_status();
CREATE TRIGGER trg_scap_updated_at BEFORE UPDATE ON public.salesperson_capital_allocations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_validate_sca_amounts BEFORE INSERT OR UPDATE OF held_amount, consumed_amount, final_amount ON public.salesperson_capital_allocations FOR EACH ROW EXECUTE FUNCTION _validate_allocation_amounts();
CREATE TRIGGER settlement_types_audit AFTER INSERT OR DELETE OR UPDATE ON public.settlement_types FOR EACH ROW EXECUTE FUNCTION audit_settlement_types();
CREATE TRIGGER trg_settlement_types_updated_at BEFORE UPDATE ON public.settlement_types FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_audit_shipping_rules AFTER INSERT OR DELETE OR UPDATE ON public.shipping_cost_rules FOR EACH ROW EXECUTE FUNCTION audit_shipping_rules();
CREATE TRIGGER trg_prq_shipping_rules AFTER INSERT OR DELETE OR UPDATE ON public.shipping_cost_rules FOR EACH ROW EXECUTE FUNCTION trg_enqueue_on_shipping_rule_change();
CREATE TRIGGER trg_shipping_rules_updated_at BEFORE UPDATE ON public.shipping_cost_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_validate_shipping_rule_currency BEFORE INSERT OR UPDATE ON public.shipping_cost_rules FOR EACH ROW EXECUTE FUNCTION validate_shipping_rule_currency();
CREATE TRIGGER trg_audit_stock_alert_requests AFTER INSERT OR UPDATE ON public.stock_alert_requests FOR EACH ROW EXECUTE FUNCTION audit_stock_alert_requests();
CREATE TRIGGER trg_stock_alert_requests_set_updated_at BEFORE UPDATE ON public.stock_alert_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_stock_alert_set_resolved BEFORE UPDATE ON public.stock_alert_requests FOR EACH ROW EXECUTE FUNCTION stock_alert_set_resolved();
CREATE TRIGGER suppliers_audit_insert AFTER INSERT ON public.suppliers FOR EACH ROW EXECUTE FUNCTION audit_suppliers_insert();
CREATE TRIGGER suppliers_audit_update AFTER UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION audit_suppliers_update();
CREATE TRIGGER suppliers_set_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER user_roles_audit AFTER INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION audit_user_roles();
CREATE TRIGGER trg_touch_validation_rules BEFORE UPDATE ON public.validation_rules FOR EACH ROW EXECUTE FUNCTION touch_validation_rules_updated_at();
CREATE TRIGGER trg_wcf_updated_at BEFORE UPDATE ON public.waybill_custom_fields FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_workflow_settings_updated_at BEFORE UPDATE ON public.workflow_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============ ROW LEVEL SECURITY ============
ALTER TABLE public.academy_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appeal_reviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_api_key_label_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_api_key_table_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_api_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capital_allocation_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_product_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_score_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_scoring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currency_rate_fetches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currency_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currency_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_capital_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_credit_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_credit_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_capital_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_capital_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_mood_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_mood_hafez_poems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_mood_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_mood_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_receipt_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynamic_table_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynamic_table_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynamic_table_row_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynamic_table_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynamic_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_level_up_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_mission_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_score_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gamification_kpi_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gamification_kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gamification_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiry_price_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiry_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiry_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiry_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_workflow_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_product_match_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_product_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_rate_ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_rate_source_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_rate_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_rate_ticks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messenger_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messenger_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messenger_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messenger_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messenger_read_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_receipt_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_receipt_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_receipt_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.penalty_appeals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_penalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_context_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_identifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_alert_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_calculation_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_change_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_board_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_board_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_board_viewer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_recompute_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_attribute_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_category_attribute_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_computed_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_interaction_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_label_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_owner_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_recommendation_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_sale_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_sku_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_request_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recent_purchase_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_list_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_price_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_quote_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_quote_send_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_quote_share_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salesperson_capital_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_cost_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_alert_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waybill_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waybill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waybill_number_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waybills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_settings ENABLE ROW LEVEL SECURITY;

-- ---- Policies ----
CREATE POLICY ac_select_authed ON public.academy_courses AS PERMISSIVE FOR SELECT TO authenticated USING (((is_published = true) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])));
CREATE POLICY ac_write_admin_manager ON public.academy_courses AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY al_select_authed ON public.academy_lessons AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.role() = 'authenticated'::text));
CREATE POLICY al_write_admin_manager ON public.academy_lessons AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY aqa_select_own_or_admin ON public.academy_quiz_attempts AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])));
CREATE POLICY aqq_select_admin ON public.academy_quiz_questions AS PERMISSIVE FOR SELECT TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY aqq_write_admin_manager ON public.academy_quiz_questions AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY aq_select_authed ON public.academy_quizzes AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.role() = 'authenticated'::text));
CREATE POLICY aq_write_admin_manager ON public.academy_quizzes AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY aup_insert_own ON public.academy_user_progress AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY aup_select_own_or_admin ON public.academy_user_progress AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])));
CREATE POLICY aup_update_own ON public.academy_user_progress AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Admin/manager insert achievements" ON public.achievements AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "Admin/manager update achievements" ON public.achievements AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "Admin/manager view achievements" ON public.achievements AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY ai_conversations_delete_own ON public.ai_conversations AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY ai_conversations_insert_own ON public.ai_conversations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY ai_conversations_select_own ON public.ai_conversations AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "appellant sees reviewers of own appeal" ON public.appeal_reviewers AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM penalty_appeals pa
  WHERE ((pa.id = appeal_reviewers.appeal_id) AND (pa.appellant_id = auth.uid())))));
CREATE POLICY "managers see all reviewers" ON public.appeal_reviewers AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "reviewer sees own row" ON public.appeal_reviewers AS PERMISSIVE FOR SELECT TO authenticated USING ((reviewer_id = auth.uid()));
CREATE POLICY "admins read audit logs" ON public.audit_logs AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "system inserts audit logs" ON public.audit_logs AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = actor_id));
CREATE POLICY bank_accounts_insert_admin_accountant ON public.bank_accounts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role)));
CREATE POLICY bank_accounts_select_finance ON public.bank_accounts AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'accountant'::app_role)));
CREATE POLICY bank_accounts_update_admin_accountant ON public.bank_accounts AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role)));
CREATE POLICY bakla_admin_manager_all ON public.bot_api_key_label_access AS PERMISSIVE FOR ALL TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY bakta_admin_manager_all ON public.bot_api_key_table_access AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY bot_api_keys_admin_manager_all ON public.bot_api_keys AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY bot_usage_admin_manager_read ON public.bot_api_usage_logs AS PERMISSIVE FOR SELECT TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY "all authenticated read brands" ON public.brands AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY brands_public_read ON public.brands AS PERMISSIVE FOR SELECT TO anon USING (true);
CREATE POLICY "manage brands admin manager accountant" ON public.brands AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY "Admin can delete call logs" ON public.call_logs AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin/manager can insert call logs" ON public.call_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "Admin/manager can update call logs" ON public.call_logs AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "Self/admin/manager can view call logs" ON public.call_logs AS PERMISSIVE FOR SELECT TO authenticated USING (((employee_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY cal_select_admin ON public.capital_allocation_ledger AS PERMISSIVE FOR SELECT TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY cal_select_sales ON public.capital_allocation_ledger AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'sales'::app_role) AND (((allocation_kind = 'salesperson'::text) AND (allocation_id IN ( SELECT salesperson_capital_allocations.id
   FROM salesperson_capital_allocations
  WHERE (salesperson_capital_allocations.salesperson_id = auth.uid())))) OR ((allocation_kind = 'customer'::text) AND (allocation_id IN ( SELECT customer_capital_allocations.id
   FROM customer_capital_allocations
  WHERE (customer_capital_allocations.salesperson_id = auth.uid())))))));
CREATE POLICY "all authenticated read categories" ON public.categories AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY categories_public_read ON public.categories AS PERMISSIVE FOR SELECT TO anon USING (true);
CREATE POLICY "manage categories admin manager accountant" ON public.categories AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY cpa_read_authed ON public.category_product_attributes AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY cpa_write_admin_manager ON public.category_product_attributes AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY cr_insert_sales ON public.credit_requests AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'sales'::app_role, 'accountant'::app_role]));
CREATE POLICY cr_read_privileged ON public.credit_requests AS PERMISSIVE FOR SELECT TO public USING ((has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]) OR (has_role(auth.uid(), 'sales'::app_role) AND (requested_by = auth.uid()))));
CREATE POLICY cr_update_privileged ON public.credit_requests AS PERMISSIVE FOR UPDATE TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]));
CREATE POLICY css_insert_privileged ON public.credit_score_snapshots AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]));
CREATE POLICY css_read_privileged ON public.credit_score_snapshots AS PERMISSIVE FOR SELECT TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY csr_read_privileged ON public.credit_scoring_rules AS PERMISSIVE FOR SELECT TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY csr_write_admin_accountant ON public.credit_scoring_rules AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]));
CREATE POLICY currencies_read_authed ON public.currencies AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY currencies_write_admin_accountant ON public.currencies AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY crf_read ON public.currency_rate_fetches AS PERMISSIVE FOR SELECT TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY crf_write ON public.currency_rate_fetches AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]));
CREATE POLICY currency_rates_read ON public.currency_rates AS PERMISSIVE FOR SELECT TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role, 'sales'::app_role]));
CREATE POLICY currency_rates_write ON public.currency_rates AS PERMISSIVE FOR ALL TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY currency_sources_read ON public.currency_sources AS PERMISSIVE FOR SELECT TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]));
CREATE POLICY currency_sources_write ON public.currency_sources AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]));
CREATE POLICY custom_roles_read_authed ON public.custom_roles AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY custom_roles_write_admin ON public.custom_roles AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY ccap_read_privileged ON public.customer_capital_allocations AS PERMISSIVE FOR SELECT TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY ccap_write_privileged ON public.customer_capital_allocations AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY ccb_read_privileged ON public.customer_credit_balance AS PERMISSIVE FOR SELECT TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY ccb_write_admin_accountant ON public.customer_credit_balance AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]));
CREATE POLICY ccl_read_privileged ON public.customer_credit_ledger AS PERMISSIVE FOR SELECT TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY ccp_select_dynamic_sensitive ON public.customer_credit_profile AS PERMISSIVE FOR SELECT TO authenticated USING (has_dynamic_permission(auth.uid(), 'sales'::text, 'view_sensitive'::text));
CREATE POLICY ccp_write_privileged ON public.customer_credit_profile AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY "manage customers by role" ON public.customers AS PERMISSIVE FOR ALL TO authenticated USING ((has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]) OR (has_role(auth.uid(), 'sales'::app_role) AND ((responsible_id = auth.uid()) OR (responsible_id IS NULL))))) WITH CHECK ((has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]) OR (has_role(auth.uid(), 'sales'::app_role) AND ((responsible_id = auth.uid()) OR (responsible_id IS NULL)))));
CREATE POLICY "read customers by role" ON public.customers AS PERMISSIVE FOR SELECT TO authenticated USING ((has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role, 'viewer'::app_role]) OR (has_role(auth.uid(), 'sales'::app_role) AND ((responsible_id = auth.uid()) OR (responsible_id IS NULL)))));
CREATE POLICY dci_insert ON public.daily_capital_inputs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY dci_select ON public.daily_capital_inputs AS PERMISSIVE FOR SELECT TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY dci_update ON public.daily_capital_inputs AS PERMISSIVE FOR UPDATE TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY dcs_insert ON public.daily_capital_snapshots AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY dcs_select ON public.daily_capital_snapshots AS PERMISSIVE FOR SELECT TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY "managers can update status/notes" ON public.daily_mood_entries AS PERMISSIVE FOR UPDATE TO public USING (is_hr_manager(auth.uid())) WITH CHECK (is_hr_manager(auth.uid()));
CREATE POLICY "managers can view all entries" ON public.daily_mood_entries AS PERMISSIVE FOR SELECT TO public USING (is_hr_manager(auth.uid()));
CREATE POLICY "user can insert own entry today" ON public.daily_mood_entries AS PERMISSIVE FOR INSERT TO public WITH CHECK (((auth.uid() = user_id) AND (mood_date = CURRENT_DATE)));
CREATE POLICY "user can update own entry same day" ON public.daily_mood_entries AS PERMISSIVE FOR UPDATE TO public USING (((auth.uid() = user_id) AND (mood_date = CURRENT_DATE))) WITH CHECK (((auth.uid() = user_id) AND (mood_date = CURRENT_DATE)));
CREATE POLICY "user can view own entries" ON public.daily_mood_entries AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "admin manage hafez" ON public.daily_mood_hafez_poems AS PERMISSIVE FOR ALL TO public USING (is_hr_manager(auth.uid())) WITH CHECK (is_hr_manager(auth.uid()));
CREATE POLICY "hafez readable to authenticated" ON public.daily_mood_hafez_poems AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage questions" ON public.daily_mood_questions AS PERMISSIVE FOR ALL TO public USING (is_hr_manager(auth.uid())) WITH CHECK (is_hr_manager(auth.uid()));
CREATE POLICY "questions readable to authenticated" ON public.daily_mood_questions AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage scenarios" ON public.daily_mood_scenarios AS PERMISSIVE FOR ALL TO public USING (is_hr_manager(auth.uid())) WITH CHECK (is_hr_manager(auth.uid()));
CREATE POLICY "scenarios readable to authenticated" ON public.daily_mood_scenarios AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert history" ON public.delivery_receipt_status_history AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((changed_by = auth.uid()) OR (changed_by IS NULL)));
CREATE POLICY "see history of accessible receipts" ON public.delivery_receipt_status_history AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM delivery_receipts dr
  WHERE ((dr.id = delivery_receipt_status_history.receipt_id) AND ((dr.uploaded_by = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'sales'::app_role))))));
CREATE POLICY "manager and sales can upload" ON public.delivery_receipts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'sales'::app_role)));
CREATE POLICY "managers see all receipts" ON public.delivery_receipts AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "reviewer can update" ON public.delivery_receipts AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'sales'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'sales'::app_role)));
CREATE POLICY "sales sees pending review" ON public.delivery_receipts AS PERMISSIVE FOR SELECT TO authenticated USING (((status = 'pending_review'::text) AND has_role(auth.uid(), 'sales'::app_role)));
CREATE POLICY "uploader sees own receipts" ON public.delivery_receipts AS PERMISSIVE FOR SELECT TO authenticated USING ((uploaded_by = auth.uid()));
CREATE POLICY "insert document history" ON public.document_status_history AS PERMISSIVE FOR INSERT TO public WITH CHECK (((changed_by = auth.uid()) OR (changed_by IS NULL)));
CREATE POLICY "see history of accessible documents" ON public.document_status_history AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM documents d
  WHERE ((d.id = document_status_history.document_id) AND ((d.uploaded_by = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))))));
CREATE POLICY "accountant can insert documents" ON public.documents AS PERMISSIVE FOR INSERT TO public WITH CHECK (((uploaded_by = auth.uid()) AND (has_role(auth.uid(), 'accountant'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "managers see all documents" ON public.documents AS PERMISSIVE FOR SELECT TO public USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "reviewer can update document status" ON public.documents AS PERMISSIVE FOR UPDATE TO public USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "uploader sees own documents" ON public.documents AS PERMISSIVE FOR SELECT TO public USING ((uploaded_by = auth.uid()));
CREATE POLICY dyn_cells_modify_admin_manager ON public.dynamic_table_cells AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY dyn_cells_view_by_access_level ON public.dynamic_table_cells AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM dynamic_tables t
  WHERE ((t.id = dynamic_table_cells.table_id) AND (((t.is_active = true) AND dyn_table_role_can_view(auth.uid(), t.access_level, t.allowed_roles)) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]))))));
CREATE POLICY dyn_cols_modify_admin_manager ON public.dynamic_table_columns AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY dyn_cols_view_by_access_level ON public.dynamic_table_columns AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM dynamic_tables t
  WHERE ((t.id = dynamic_table_columns.table_id) AND (((t.is_active = true) AND dyn_table_role_can_view(auth.uid(), t.access_level, t.allowed_roles)) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]))))));
CREATE POLICY dyn_row_counters_admin_manager ON public.dynamic_table_row_counters AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY dyn_rows_modify_admin_manager ON public.dynamic_table_rows AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY dyn_rows_view_by_access_level ON public.dynamic_table_rows AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM dynamic_tables t
  WHERE ((t.id = dynamic_table_rows.table_id) AND (((t.is_active = true) AND dyn_table_role_can_view(auth.uid(), t.access_level, t.allowed_roles)) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]))))));
CREATE POLICY dyn_tables_insert_admin_manager ON public.dynamic_tables AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY dyn_tables_update_admin_manager ON public.dynamic_tables AS PERMISSIVE FOR UPDATE TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY dyn_tables_view_by_access_level ON public.dynamic_tables AS PERMISSIVE FOR SELECT TO authenticated USING ((((is_active = true) AND dyn_table_role_can_view(auth.uid(), access_level, allowed_roles)) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])));
CREATE POLICY emp_ach_self_or_admin ON public.employee_achievements AS PERMISSIVE FOR SELECT TO authenticated USING (((employee_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY employee_leagues_read_all ON public.employee_leagues AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY level_up_self_or_admin_select ON public.employee_level_up_events AS PERMISSIVE FOR SELECT TO authenticated USING (((employee_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY emp_mission_self_or_admin ON public.employee_mission_progress AS PERMISSIVE FOR SELECT TO authenticated USING (((employee_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY progress_self_or_admin_select ON public.employee_progress AS PERMISSIVE FOR SELECT TO authenticated USING (((employee_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "Admin can view score events" ON public.employee_score_events AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Self/admin/manager can view scores" ON public.employee_scores AS PERMISSIVE FOR SELECT TO authenticated USING (((employee_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY emp_streaks_self_or_admin ON public.employee_streaks AS PERMISSIVE FOR SELECT TO authenticated USING (((employee_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY external_parties_insert_admin_accountant ON public.external_parties AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role)));
CREATE POLICY external_parties_select_finance ON public.external_parties AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'accountant'::app_role)));
CREATE POLICY external_parties_update_admin_accountant ON public.external_parties AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role)));
CREATE POLICY "admins read all feedback" ON public.feedback AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins update feedback" ON public.feedback AS PERMISSIVE FOR UPDATE TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "users insert feedback" ON public.feedback AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "users read own feedback" ON public.feedback AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY fi_delete_admin ON public.feedback_items AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY fi_insert_own ON public.feedback_items AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((submitted_by = auth.uid()));
CREATE POLICY fi_select_own_or_admin_manager ON public.feedback_items AS PERMISSIVE FOR SELECT TO authenticated USING (((submitted_by = auth.uid()) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])));
CREATE POLICY fi_update_admin_manager ON public.feedback_items AS PERMISSIVE FOR UPDATE TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY "Admin/manager can delete kpi rules" ON public.gamification_kpi_rules AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "Admin/manager can insert kpi rules" ON public.gamification_kpi_rules AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "Admin/manager can update kpi rules" ON public.gamification_kpi_rules AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "Admin/manager can view kpi rules" ON public.gamification_kpi_rules AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "Admin/manager can delete kpis" ON public.gamification_kpis AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "Admin/manager can insert kpis" ON public.gamification_kpis AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "Admin/manager can update kpis" ON public.gamification_kpis AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "Authenticated can view kpis" ON public.gamification_kpis AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY rewards_admin_insert ON public.gamification_rewards AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY rewards_admin_select ON public.gamification_rewards AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY rewards_admin_update ON public.gamification_rewards AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY inquiry_insert_rpc ON public.inquiries AS PERMISSIVE FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY inquiry_select ON public.inquiries AS PERMISSIVE FOR SELECT TO authenticated USING (is_messenger_group_member(group_id, auth.uid()));
CREATE POLICY inquiry_update_rpc ON public.inquiries AS PERMISSIVE FOR UPDATE TO service_role USING (true);
CREATE POLICY inquiry_price_cache_select ON public.inquiry_price_cache AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY inquiry_replies_select ON public.inquiry_replies AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM inquiries i
  WHERE ((i.id = inquiry_replies.inquiry_id) AND is_messenger_group_member(i.group_id, auth.uid())))));
CREATE POLICY inquiry_history_select ON public.inquiry_status_history AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM inquiries i
  WHERE ((i.id = inquiry_status_history.inquiry_id) AND is_messenger_group_member(i.group_id, auth.uid())))));
CREATE POLICY inquiry_transfers_select ON public.inquiry_transfers AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM inquiries i
  WHERE ((i.id = inquiry_transfers.inquiry_id) AND is_messenger_group_member(i.group_id, auth.uid())))));
CREATE POLICY invoice_items_select_dynamic ON public.invoice_items AS PERMISSIVE FOR SELECT TO authenticated USING (has_dynamic_permission(auth.uid(), 'invoices'::text, 'view'::text));
CREATE POLICY "sales write invoice_items" ON public.invoice_items AS PERMISSIVE FOR ALL TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'sales'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'sales'::app_role]));
CREATE POLICY iws_select ON public.invoice_workflow_stages AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY iws_write ON public.invoice_workflow_stages AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]));
CREATE POLICY invoices_select_dynamic ON public.invoices AS PERMISSIVE FOR SELECT TO authenticated USING (has_dynamic_permission(auth.uid(), 'invoices'::text, 'view'::text));
CREATE POLICY "sales write invoices" ON public.invoices AS PERMISSIVE FOR ALL TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'sales'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'sales'::app_role]));
CREATE POLICY journal_entries_insert_admin_accountant ON public.journal_entries AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role)));
CREATE POLICY journal_entries_select_finance ON public.journal_entries AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'accountant'::app_role)));
CREATE POLICY journal_entries_update_admin_accountant ON public.journal_entries AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role)));
CREATE POLICY journal_lines_insert_admin_accountant ON public.journal_lines AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role)));
CREATE POLICY journal_lines_select_finance ON public.journal_lines AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'accountant'::app_role)));
CREATE POLICY journal_lines_update_admin_accountant ON public.journal_lines AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role)));
CREATE POLICY "all authenticated read knowledge" ON public.knowledge_articles AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "manager admin write knowledge" ON public.knowledge_articles AS PERMISSIVE FOR ALL TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY kconf_delete_own_or_admin ON public.knowledge_confirmations AS PERMISSIVE FOR DELETE TO authenticated USING (((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY kconf_insert_own ON public.knowledge_confirmations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY kconf_select_own_or_admin ON public.knowledge_confirmations AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY kd_delete_admin ON public.knowledge_documents AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY kd_insert_admin_manager ON public.knowledge_documents AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY kd_select_published_for_role ON public.knowledge_documents AS PERMISSIVE FOR SELECT TO authenticated USING ((((is_published = true) AND kd_role_can_view(auth.uid(), access_level)) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])));
CREATE POLICY kd_update_admin_manager ON public.knowledge_documents AS PERMISSIVE FOR UPDATE TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY league_seasons_admin_insert ON public.league_seasons AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY league_seasons_admin_update ON public.league_seasons AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY league_seasons_read_authenticated ON public.league_seasons AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY league_settings_admin_insert ON public.league_settings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY league_settings_admin_select ON public.league_settings AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY league_settings_admin_update ON public.league_settings AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "indicators read" ON public.market_indicators AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT has_role(auth.uid(), 'admin'::app_role) AS has_role) OR ( SELECT has_role(auth.uid(), 'manager'::app_role) AS has_role) OR ( SELECT has_role(auth.uid(), 'accountant'::app_role) AS has_role) OR ( SELECT has_role(auth.uid(), 'sales'::app_role) AS has_role)));
CREATE POLICY "indicators write" ON public.market_indicators AS PERMISSIVE FOR ALL TO authenticated USING ((( SELECT has_role(auth.uid(), 'admin'::app_role) AS has_role) OR ( SELECT has_role(auth.uid(), 'manager'::app_role) AS has_role) OR ( SELECT has_role(auth.uid(), 'accountant'::app_role) AS has_role))) WITH CHECK ((( SELECT has_role(auth.uid(), 'admin'::app_role) AS has_role) OR ( SELECT has_role(auth.uid(), 'manager'::app_role) AS has_role) OR ( SELECT has_role(auth.uid(), 'accountant'::app_role) AS has_role)));
CREATE POLICY mpm_events_admin_manager_select ON public.market_product_match_events AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY mpm_admin_manager_select ON public.market_product_matches AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "runs read elevated" ON public.market_rate_ingestion_runs AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT has_role(auth.uid(), 'admin'::app_role) AS has_role) OR ( SELECT has_role(auth.uid(), 'manager'::app_role) AS has_role) OR ( SELECT has_role(auth.uid(), 'accountant'::app_role) AS has_role)));
CREATE POLICY "mappings read elevated" ON public.market_rate_source_mappings AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT has_role(auth.uid(), 'admin'::app_role) AS has_role) OR ( SELECT has_role(auth.uid(), 'manager'::app_role) AS has_role) OR ( SELECT has_role(auth.uid(), 'accountant'::app_role) AS has_role)));
CREATE POLICY "mappings write elevated" ON public.market_rate_source_mappings AS PERMISSIVE FOR ALL TO authenticated USING ((( SELECT has_role(auth.uid(), 'admin'::app_role) AS has_role) OR ( SELECT has_role(auth.uid(), 'manager'::app_role) AS has_role))) WITH CHECK ((( SELECT has_role(auth.uid(), 'admin'::app_role) AS has_role) OR ( SELECT has_role(auth.uid(), 'manager'::app_role) AS has_role)));
CREATE POLICY "sources read" ON public.market_rate_sources AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT has_role(auth.uid(), 'admin'::app_role) AS has_role) OR ( SELECT has_role(auth.uid(), 'manager'::app_role) AS has_role) OR ( SELECT has_role(auth.uid(), 'accountant'::app_role) AS has_role) OR ( SELECT has_role(auth.uid(), 'sales'::app_role) AS has_role)));
CREATE POLICY "sources write" ON public.market_rate_sources AS PERMISSIVE FOR ALL TO authenticated USING ((( SELECT has_role(auth.uid(), 'admin'::app_role) AS has_role) OR ( SELECT has_role(auth.uid(), 'manager'::app_role) AS has_role) OR ( SELECT has_role(auth.uid(), 'accountant'::app_role) AS has_role))) WITH CHECK ((( SELECT has_role(auth.uid(), 'admin'::app_role) AS has_role) OR ( SELECT has_role(auth.uid(), 'manager'::app_role) AS has_role) OR ( SELECT has_role(auth.uid(), 'accountant'::app_role) AS has_role)));
CREATE POLICY "ticks insert elevated" ON public.market_rate_ticks AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((( SELECT has_role(auth.uid(), 'admin'::app_role) AS has_role) OR ( SELECT has_role(auth.uid(), 'manager'::app_role) AS has_role) OR ( SELECT has_role(auth.uid(), 'accountant'::app_role) AS has_role)) AND (created_by = ( SELECT auth.uid() AS uid))));
CREATE POLICY "ticks read elevated" ON public.market_rate_ticks AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT has_role(auth.uid(), 'admin'::app_role) AS has_role) OR ( SELECT has_role(auth.uid(), 'manager'::app_role) AS has_role) OR ( SELECT has_role(auth.uid(), 'accountant'::app_role) AS has_role)));
CREATE POLICY "ticks update elevated" ON public.market_rate_ticks AS PERMISSIVE FOR UPDATE TO authenticated USING ((( SELECT has_role(auth.uid(), 'admin'::app_role) AS has_role) OR ( SELECT has_role(auth.uid(), 'manager'::app_role) AS has_role) OR ( SELECT has_role(auth.uid(), 'accountant'::app_role) AS has_role))) WITH CHECK ((( SELECT has_role(auth.uid(), 'admin'::app_role) AS has_role) OR ( SELECT has_role(auth.uid(), 'manager'::app_role) AS has_role) OR ( SELECT has_role(auth.uid(), 'accountant'::app_role) AS has_role)));
CREATE POLICY mc_select_authed ON public.marketing_channels AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY mc_write_admin_accountant ON public.marketing_channels AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]));
CREATE POLICY message_embeddings_insert_sender ON public.message_embeddings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM messenger_messages mm
  WHERE ((mm.id = message_embeddings.message_id) AND (mm.sender_id = auth.uid())))));
CREATE POLICY message_embeddings_select_group_member ON public.message_embeddings AS PERMISSIVE FOR SELECT TO authenticated USING (is_messenger_group_member(group_id, auth.uid()));
CREATE POLICY "recipient updates read flag" ON public.messages AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = recipient_id)) WITH CHECK ((auth.uid() = recipient_id));
CREATE POLICY "users read own messages" ON public.messages AS PERMISSIVE FOR SELECT TO public USING (((auth.uid() = sender_id) OR (auth.uid() = recipient_id)));
CREATE POLICY "users send messages" ON public.messages AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = sender_id));
CREATE POLICY messenger_attachments_delete_sender ON public.messenger_attachments AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM messenger_messages m
  WHERE ((m.id = messenger_attachments.message_id) AND (m.sender_id = auth.uid())))));
CREATE POLICY messenger_attachments_insert_sender ON public.messenger_attachments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM messenger_messages m
  WHERE ((m.id = messenger_attachments.message_id) AND (m.sender_id = auth.uid())))));
CREATE POLICY messenger_attachments_select_members ON public.messenger_attachments AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM messenger_messages m
  WHERE ((m.id = messenger_attachments.message_id) AND is_messenger_group_member(m.group_id, auth.uid())))));
CREATE POLICY messenger_members_delete_creator ON public.messenger_group_members AS PERMISSIVE FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM messenger_groups g
  WHERE ((g.id = messenger_group_members.group_id) AND (g.created_by = auth.uid())))) OR (user_id = auth.uid())));
CREATE POLICY messenger_members_insert_creator ON public.messenger_group_members AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM messenger_groups g
  WHERE ((g.id = messenger_group_members.group_id) AND (g.created_by = auth.uid())))));
CREATE POLICY messenger_members_select_members ON public.messenger_group_members AS PERMISSIVE FOR SELECT TO authenticated USING (is_messenger_group_member(group_id, auth.uid()));
CREATE POLICY messenger_groups_delete_creator ON public.messenger_groups AS PERMISSIVE FOR DELETE TO authenticated USING ((created_by = auth.uid()));
CREATE POLICY messenger_groups_insert_self ON public.messenger_groups AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((created_by = auth.uid()));
CREATE POLICY messenger_groups_select_members ON public.messenger_groups AS PERMISSIVE FOR SELECT TO authenticated USING ((is_messenger_group_member(id, auth.uid()) OR (created_by = auth.uid())));
CREATE POLICY messenger_groups_update_creator ON public.messenger_groups AS PERMISSIVE FOR UPDATE TO authenticated USING ((created_by = auth.uid())) WITH CHECK ((created_by = auth.uid()));
CREATE POLICY messenger_messages_delete_sender ON public.messenger_messages AS PERMISSIVE FOR DELETE TO authenticated USING ((sender_id = auth.uid()));
CREATE POLICY messenger_messages_insert_member ON public.messenger_messages AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((sender_id = auth.uid()) AND is_messenger_group_member(group_id, auth.uid())));
CREATE POLICY messenger_messages_select_members ON public.messenger_messages AS PERMISSIVE FOR SELECT TO authenticated USING (is_messenger_group_member(group_id, auth.uid()));
CREATE POLICY messenger_messages_update_sender ON public.messenger_messages AS PERMISSIVE FOR UPDATE TO authenticated USING ((sender_id = auth.uid())) WITH CHECK ((sender_id = auth.uid()));
CREATE POLICY messenger_receipts_insert_self ON public.messenger_read_receipts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM messenger_messages m
  WHERE ((m.id = messenger_read_receipts.message_id) AND is_messenger_group_member(m.group_id, auth.uid()))))));
CREATE POLICY messenger_receipts_select_members ON public.messenger_read_receipts AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM messenger_messages m
  WHERE ((m.id = messenger_read_receipts.message_id) AND is_messenger_group_member(m.group_id, auth.uid())))));
CREATE POLICY missions_admin_insert ON public.missions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY missions_admin_select ON public.missions AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY missions_admin_update ON public.missions AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY ne_insert_auth ON public.notification_events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY ne_select_own_or_mgr ON public.notification_events AS PERMISSIVE FOR SELECT TO public USING (((auth.uid() = user_id) OR is_board_manager(auth.uid())));
CREATE POLICY ne_update_mgr ON public.notification_events AS PERMISSIVE FOR UPDATE TO public USING (is_board_manager(auth.uid())) WITH CHECK (is_board_manager(auth.uid()));
CREATE POLICY nq_select_own_or_admin ON public.notification_queue AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY nq_update_own ON public.notification_queue AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY prcf_select_authed ON public.payment_receipt_custom_fields AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY prcf_write_admin_accountant ON public.payment_receipt_custom_fields AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]));
CREATE POLICY prd_delete_admin_accountant ON public.payment_receipt_documents AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role)));
CREATE POLICY prd_insert_admin_accountant ON public.payment_receipt_documents AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((uploaded_by = auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role))));
CREATE POLICY prd_select_privileged ON public.payment_receipt_documents AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'accountant'::app_role)));
CREATE POLICY prl_select_privileged ON public.payment_receipt_links AS PERMISSIVE FOR SELECT TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY prl_write_admin_accountant ON public.payment_receipt_links AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]));
CREATE POLICY pr_insert_admin_accountant ON public.payment_receipts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]) AND (created_by = auth.uid())));
CREATE POLICY pr_select_privileged ON public.payment_receipts AS PERMISSIVE FOR SELECT TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY pr_update_admin_accountant ON public.payment_receipts AS PERMISSIVE FOR UPDATE TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]));
CREATE POLICY payment_terms_select_authed ON public.payment_terms AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY payment_terms_write_admin_accountant ON public.payment_terms AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]));
CREATE POLICY "managers see all appeals" ON public.penalty_appeals AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "reviewers see assigned appeals" ON public.penalty_appeals AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM appeal_reviewers ar
  WHERE ((ar.appeal_id = penalty_appeals.id) AND (ar.reviewer_id = auth.uid())))));
CREATE POLICY "user sees own appeals" ON public.penalty_appeals AS PERMISSIVE FOR SELECT TO authenticated USING ((appellant_id = auth.uid()));
CREATE POLICY "managers see all penalties" ON public.performance_penalties AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "user sees own penalties" ON public.performance_penalties AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY person_context_links_insert_admin_manager ON public.person_context_links AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY person_context_links_select_via_person ON public.person_context_links AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM persons p
  WHERE ((p.id = person_context_links.person_id) AND (((p.visibility_scope = 'internal_general'::text) AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role, 'sales'::app_role, 'viewer'::app_role])) OR ((p.visibility_scope = 'restricted_finance'::text) AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])) OR ((p.visibility_scope = 'restricted_executive'::text) AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])))))));
CREATE POLICY person_context_links_update_admin_manager ON public.person_context_links AS PERMISSIVE FOR UPDATE TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY pfd_insert_admin_manager ON public.person_field_definitions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY pfd_select_active_all_authed ON public.person_field_definitions AS PERMISSIVE FOR SELECT TO authenticated USING (((is_active = true) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])));
CREATE POLICY pfd_update_admin_manager ON public.person_field_definitions AS PERMISSIVE FOR UPDATE TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY pfv_insert_admin_manager ON public.person_field_values AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY pfv_select_via_person ON public.person_field_values AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM persons p
  WHERE ((p.id = person_field_values.person_id) AND (((p.visibility_scope = 'internal_general'::text) AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role, 'sales'::app_role, 'viewer'::app_role])) OR ((p.visibility_scope = 'restricted_finance'::text) AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])) OR ((p.visibility_scope = 'restricted_executive'::text) AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])))))));
CREATE POLICY pfv_update_admin_manager ON public.person_field_values AS PERMISSIVE FOR UPDATE TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY person_identifiers_insert_admin_manager ON public.person_identifiers AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY person_identifiers_select_via_person ON public.person_identifiers AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM persons p
  WHERE ((p.id = person_identifiers.person_id) AND (((p.visibility_scope = 'internal_general'::text) AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role, 'sales'::app_role, 'viewer'::app_role])) OR ((p.visibility_scope = 'restricted_finance'::text) AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])) OR ((p.visibility_scope = 'restricted_executive'::text) AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])))))));
CREATE POLICY person_identifiers_update_admin_manager ON public.person_identifiers AS PERMISSIVE FOR UPDATE TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY persons_insert_admin_manager ON public.persons AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY persons_select_by_visibility_scope ON public.persons AS PERMISSIVE FOR SELECT TO authenticated USING ((((visibility_scope = 'internal_general'::text) AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role, 'sales'::app_role, 'viewer'::app_role])) OR ((visibility_scope = 'restricted_finance'::text) AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])) OR ((visibility_scope = 'restricted_executive'::text) AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]))));
CREATE POLICY persons_update_admin_manager ON public.persons AS PERMISSIVE FOR UPDATE TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY pan_delete_own ON public.price_alert_notifications AS PERMISSIVE FOR DELETE TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY pan_select_own ON public.price_alert_notifications AS PERMISSIVE FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY pan_update_own ON public.price_alert_notifications AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY par_delete_own ON public.price_alert_rules AS PERMISSIVE FOR DELETE TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY par_insert_own ON public.price_alert_rules AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY par_select_own ON public.price_alert_rules AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY par_update_own ON public.price_alert_rules AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY snapshots_insert ON public.price_calculation_snapshots AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY snapshots_select_dynamic_sensitive ON public.price_calculation_snapshots AS PERMISSIVE FOR SELECT TO authenticated USING (has_dynamic_permission(auth.uid(), 'pricing'::text, 'view_sensitive'::text));
CREATE POLICY change_reasons_read ON public.price_change_reasons AS PERMISSIVE FOR SELECT TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY "manage change_reasons admin manager accountant" ON public.price_change_reasons AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY "all authenticated read price_list_items" ON public.price_list_items AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "manager admin write price_list_items" ON public.price_list_items AS PERMISSIVE FOR ALL TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY "all authenticated read price_lists" ON public.price_lists AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "manager admin write price_lists" ON public.price_lists AS PERMISSIVE FOR ALL TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY pba_insert_own ON public.pricing_board_access_requests AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY pba_select_own_or_mgr ON public.pricing_board_access_requests AS PERMISSIVE FOR SELECT TO public USING (((auth.uid() = user_id) OR is_board_manager(auth.uid())));
CREATE POLICY pba_update_managers ON public.pricing_board_access_requests AS PERMISSIVE FOR UPDATE TO public USING (is_board_manager(auth.uid())) WITH CHECK (is_board_manager(auth.uid()));
CREATE POLICY pbs_insert_managers ON public.pricing_board_settings AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_board_manager(auth.uid()));
CREATE POLICY pbs_select_auth ON public.pricing_board_settings AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY pbs_update_managers ON public.pricing_board_settings AS PERMISSIVE FOR UPDATE TO public USING (is_board_manager(auth.uid())) WITH CHECK (is_board_manager(auth.uid()));
CREATE POLICY pricing_board_settings_delete_admin ON public.pricing_board_settings AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY pricing_board_settings_insert_privileged ON public.pricing_board_settings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY pricing_board_settings_select_authorized ON public.pricing_board_settings AS PERMISSIVE FOR SELECT TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role, 'sales'::app_role]));
CREATE POLICY pricing_board_settings_update_privileged ON public.pricing_board_settings AS PERMISSIVE FOR UPDATE TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY pbvs_insert_own ON public.pricing_board_viewer_sessions AS PERMISSIVE FOR INSERT TO public WITH CHECK (((auth.uid() = user_id) AND is_board_approved(auth.uid(), board_key)));
CREATE POLICY pbvs_select_own_or_mgr ON public.pricing_board_viewer_sessions AS PERMISSIVE FOR SELECT TO public USING (((auth.uid() = user_id) OR is_board_manager(auth.uid())));
CREATE POLICY pbvs_update_own ON public.pricing_board_viewer_sessions AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY prq_read_admin_manager_accountant ON public.pricing_recompute_queue AS PERMISSIVE FOR SELECT TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY "manager admin write pricing_rules" ON public.pricing_rules AS PERMISSIVE FOR ALL TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY pricing_rules_select_role_scoped ON public.pricing_rules AS PERMISSIVE FOR SELECT TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY pag_delete ON public.product_attribute_groups AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) AND (is_system = false)));
CREATE POLICY pag_insert ON public.product_attribute_groups AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY pag_select ON public.product_attribute_groups AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY pag_update ON public.product_attribute_groups AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY product_attributes_read_authed ON public.product_attributes AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY product_attributes_write_admin_manager ON public.product_attributes AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY pcav_delete_dynamic ON public.product_category_attribute_values AS PERMISSIVE FOR DELETE TO authenticated USING (has_dynamic_permission(auth.uid(), 'products'::text, 'update'::text));
CREATE POLICY pcav_insert_dynamic ON public.product_category_attribute_values AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_dynamic_permission(auth.uid(), 'products'::text, 'create'::text) OR has_dynamic_permission(auth.uid(), 'products'::text, 'update'::text)));
CREATE POLICY pcav_select_dynamic ON public.product_category_attribute_values AS PERMISSIVE FOR SELECT TO authenticated USING (has_dynamic_permission(auth.uid(), 'products'::text, 'view'::text));
CREATE POLICY pcav_update_dynamic ON public.product_category_attribute_values AS PERMISSIVE FOR UPDATE TO authenticated USING (has_dynamic_permission(auth.uid(), 'products'::text, 'update'::text)) WITH CHECK (has_dynamic_permission(auth.uid(), 'products'::text, 'update'::text));
CREATE POLICY pcp_read_privileged ON public.product_computed_prices AS PERMISSIVE FOR SELECT TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY pcp_write_privileged ON public.product_computed_prices AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY pie_select_privileged ON public.product_interaction_events AS PERMISSIVE FOR SELECT TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY "all authenticated read product_label_links" ON public.product_label_links AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "manager admin write product_label_links" ON public.product_label_links AS PERMISSIVE FOR ALL TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY "all authenticated read product_labels" ON public.product_labels AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "manager admin write product_labels" ON public.product_labels AS PERMISSIVE FOR ALL TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY "all authenticated read product_owners" ON public.product_owner_assignments AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "manager admin write product_owners" ON public.product_owner_assignments AS PERMISSIVE FOR ALL TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY pro_select_authed ON public.product_recommendation_overrides AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY pro_write_admin_manager ON public.product_recommendation_overrides AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY psph_select_dynamic_sensitive ON public.product_sale_price_history AS PERMISSIVE FOR SELECT TO authenticated USING (has_dynamic_permission(auth.uid(), 'pricing'::text, 'view_sensitive'::text));
CREATE POLICY sale_history_insert ON public.product_sale_price_history AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY ps_select_role_scoped ON public.product_suppliers AS PERMISSIVE FOR SELECT TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY ps_write_privileged ON public.product_suppliers AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY owners_update_product_stock ON public.products AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_product_owner(auth.uid(), id) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]))) WITH CHECK ((is_product_owner(auth.uid(), id) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])));
CREATE POLICY products_delete_dynamic ON public.products AS PERMISSIVE FOR DELETE TO authenticated USING (has_dynamic_permission(auth.uid(), 'products'::text, 'delete'::text));
CREATE POLICY products_insert_dynamic ON public.products AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_dynamic_permission(auth.uid(), 'products'::text, 'create'::text));
CREATE POLICY products_public_read ON public.products AS PERMISSIVE FOR SELECT TO anon USING ((is_active = true));
CREATE POLICY products_select_dynamic ON public.products AS PERMISSIVE FOR SELECT TO authenticated USING (((auth.role() = 'authenticated'::text) AND has_dynamic_permission(auth.uid(), 'products'::text, 'view'::text)));
CREATE POLICY products_update_dynamic ON public.products AS PERMISSIVE FOR UPDATE TO authenticated USING (has_dynamic_permission(auth.uid(), 'products'::text, 'update'::text)) WITH CHECK (has_dynamic_permission(auth.uid(), 'products'::text, 'update'::text));
CREATE POLICY "Admins can manage profile fields" ON public.profile_field_definitions AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Public can read register form fields" ON public.profile_field_definitions AS PERMISSIVE FOR SELECT TO anon, authenticated USING (((is_active = true) AND (show_on_register = true)));
CREATE POLICY "Admins delete field values" ON public.profile_field_values AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users insert own field values" ON public.profile_field_values AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users see own field values" ON public.profile_field_values AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "Users update own field values" ON public.profile_field_values AS PERMISSIVE FOR UPDATE TO authenticated USING (((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))) WITH CHECK (((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "admins read all profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins update all profiles" ON public.profiles AS PERMISSIVE FOR UPDATE TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "users read own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = id));
CREATE POLICY "users update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = id));
CREATE POLICY "manager admin write purchase_items" ON public.purchase_items AS PERMISSIVE FOR ALL TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY purchase_items_select_role_scoped ON public.purchase_items AS PERMISSIVE FOR SELECT TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY owners_insert_purchase_prices ON public.purchase_prices AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_product_owner(auth.uid(), product_id) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])));
CREATE POLICY owners_select_purchase_prices ON public.purchase_prices AS PERMISSIVE FOR SELECT TO authenticated USING ((is_product_owner(auth.uid(), product_id) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])));
CREATE POLICY owners_update_purchase_prices ON public.purchase_prices AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_product_owner(auth.uid(), product_id) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]))) WITH CHECK ((is_product_owner(auth.uid(), product_id) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])));
CREATE POLICY purchase_prices_select_dynamic_sensitive ON public.purchase_prices AS PERMISSIVE FOR SELECT TO authenticated USING (has_dynamic_permission(auth.uid(), 'pricing'::text, 'view_sensitive'::text));
CREATE POLICY purchase_prices_write ON public.purchase_prices AS PERMISSIVE FOR ALL TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY "assignee can upload receipt" ON public.purchase_receipts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((uploaded_by = auth.uid()));
CREATE POLICY "managers see all receipts" ON public.purchase_receipts AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "participants see receipts" ON public.purchase_receipts AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM purchase_requests pr
  WHERE ((pr.id = purchase_receipts.request_id) AND ((pr.requested_by = auth.uid()) OR (pr.assigned_to = auth.uid()))))));
CREATE POLICY "uploader or manager can delete receipt" ON public.purchase_receipts AS PERMISSIVE FOR DELETE TO authenticated USING (((uploaded_by = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "insert history by participants" ON public.purchase_request_status_history AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((changed_by = auth.uid()));
CREATE POLICY "managers see all history" ON public.purchase_request_status_history AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "see history of own requests" ON public.purchase_request_status_history AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM purchase_requests pr
  WHERE ((pr.id = purchase_request_status_history.request_id) AND ((pr.requested_by = auth.uid()) OR (pr.assigned_to = auth.uid()))))));
CREATE POLICY "assignee sees assigned requests" ON public.purchase_requests AS PERMISSIVE FOR SELECT TO authenticated USING ((assigned_to = auth.uid()));
CREATE POLICY "managers see all requests" ON public.purchase_requests AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "requester sees own requests" ON public.purchase_requests AS PERMISSIVE FOR SELECT TO authenticated USING ((requested_by = auth.uid()));
CREATE POLICY "sales and manager can insert" ON public.purchase_requests AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((requested_by = auth.uid()) AND (has_role(auth.uid(), 'sales'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role))));
CREATE POLICY "update by assignee or manager" ON public.purchase_requests AS PERMISSIVE FOR UPDATE TO authenticated USING (((assigned_to = auth.uid()) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "accountant can mark purchase paid" ON public.purchases AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'accountant'::app_role)) WITH CHECK (has_role(auth.uid(), 'accountant'::app_role));
CREATE POLICY "manager admin write purchases" ON public.purchases AS PERMISSIVE FOR ALL TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY purchases_select_role_scoped ON public.purchases AS PERMISSIVE FOR SELECT TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY "recent_purchase_settings insert elevated" ON public.recent_purchase_settings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "recent_purchase_settings read authenticated" ON public.recent_purchase_settings AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "recent_purchase_settings update elevated" ON public.recent_purchase_settings AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY role_permissions_read_authed ON public.role_permissions AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY role_permissions_write_admin ON public.role_permissions AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY sale_list_items_select_via_parent ON public.sale_list_items AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM sale_lists sl
  WHERE ((sl.id = sale_list_items.sale_list_id) AND ((sl.status = 'published'::text) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]))))));
CREATE POLICY sale_list_items_write_privileged ON public.sale_list_items AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY sale_list_versions_select_via_parent ON public.sale_list_versions AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM sale_lists sl
  WHERE ((sl.id = sale_list_versions.sale_list_id) AND ((sl.status = 'published'::text) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]))))));
CREATE POLICY sale_list_versions_write_privileged ON public.sale_list_versions AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY sale_lists_delete_admin ON public.sale_lists AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY sale_lists_insert_privileged ON public.sale_lists AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]) AND (created_by = auth.uid())));
CREATE POLICY sale_lists_select_published_or_privileged ON public.sale_lists AS PERMISSIVE FOR SELECT TO authenticated USING (((status = 'published'::text) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])));
CREATE POLICY sale_lists_update_privileged ON public.sale_lists AS PERMISSIVE FOR UPDATE TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY sale_price_types_auth_read ON public.sale_price_types AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY sale_price_types_read ON public.sale_price_types AS PERMISSIVE FOR SELECT TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY sale_price_types_write ON public.sale_price_types AS PERMISSIVE FOR ALL TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY sales_quote_counters_no_access ON public.sales_quote_counters AS PERMISSIVE FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY sales_quote_items_delete ON public.sales_quote_items AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM sales_quotes q
  WHERE ((q.id = sales_quote_items.quote_id) AND (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]) OR (has_role(auth.uid(), 'sales'::app_role) AND (q.salesperson_id = auth.uid()) AND (q.status = 'draft'::sales_quote_status)))))));
CREATE POLICY sales_quote_items_insert ON public.sales_quote_items AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM sales_quotes q
  WHERE ((q.id = sales_quote_items.quote_id) AND (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]) OR (has_role(auth.uid(), 'sales'::app_role) AND (q.salesperson_id = auth.uid()) AND (q.status = 'draft'::sales_quote_status)))))));
CREATE POLICY sales_quote_items_select ON public.sales_quote_items AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM sales_quotes q
  WHERE ((q.id = sales_quote_items.quote_id) AND (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]) OR (has_role(auth.uid(), 'sales'::app_role) AND (q.salesperson_id = auth.uid())))))));
CREATE POLICY sales_quote_items_update ON public.sales_quote_items AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM sales_quotes q
  WHERE ((q.id = sales_quote_items.quote_id) AND (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]) OR (has_role(auth.uid(), 'sales'::app_role) AND (q.salesperson_id = auth.uid()) AND (q.status = 'draft'::sales_quote_status))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM sales_quotes q
  WHERE ((q.id = sales_quote_items.quote_id) AND (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]) OR (has_role(auth.uid(), 'sales'::app_role) AND (q.salesperson_id = auth.uid()) AND (q.status = 'draft'::sales_quote_status)))))));
CREATE POLICY sqsq_insert ON public.sales_quote_send_queue AS PERMISSIVE FOR INSERT TO public WITH CHECK (((created_by = auth.uid()) AND (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]) OR (has_role(auth.uid(), 'sales'::app_role) AND (EXISTS ( SELECT 1
   FROM sales_quotes q
  WHERE ((q.id = sales_quote_send_queue.quote_id) AND (q.salesperson_id = auth.uid()))))))));
CREATE POLICY sqsq_select ON public.sales_quote_send_queue AS PERMISSIVE FOR SELECT TO public USING ((has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]) OR (has_role(auth.uid(), 'sales'::app_role) AND (EXISTS ( SELECT 1
   FROM sales_quotes q
  WHERE ((q.id = sales_quote_send_queue.quote_id) AND (q.salesperson_id = auth.uid())))))));
CREATE POLICY sqsq_update_privileged ON public.sales_quote_send_queue AS PERMISSIVE FOR UPDATE TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY sqsq_update_sales_cancel ON public.sales_quote_send_queue AS PERMISSIVE FOR UPDATE TO public USING ((has_role(auth.uid(), 'sales'::app_role) AND (created_by = auth.uid()) AND (status = 'pending'::text) AND (EXISTS ( SELECT 1
   FROM sales_quotes q
  WHERE ((q.id = sales_quote_send_queue.quote_id) AND (q.salesperson_id = auth.uid())))))) WITH CHECK ((has_role(auth.uid(), 'sales'::app_role) AND (created_by = auth.uid()) AND (status = 'canceled'::text)));
CREATE POLICY sqsl_insert ON public.sales_quote_share_logs AS PERMISSIVE FOR INSERT TO public WITH CHECK (((attempted_by = auth.uid()) AND (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]) OR (has_role(auth.uid(), 'sales'::app_role) AND (EXISTS ( SELECT 1
   FROM sales_quotes q
  WHERE ((q.id = sales_quote_share_logs.quote_id) AND (q.salesperson_id = auth.uid()))))))));
CREATE POLICY sqsl_select ON public.sales_quote_share_logs AS PERMISSIVE FOR SELECT TO public USING ((has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]) OR (has_role(auth.uid(), 'sales'::app_role) AND (EXISTS ( SELECT 1
   FROM sales_quotes q
  WHERE ((q.id = sales_quote_share_logs.quote_id) AND (q.salesperson_id = auth.uid())))))));
CREATE POLICY sqsl_update_privileged ON public.sales_quote_share_logs AS PERMISSIVE FOR UPDATE TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY sales_quotes_insert ON public.sales_quotes AS PERMISSIVE FOR INSERT TO public WITH CHECK ((has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]) OR (has_role(auth.uid(), 'sales'::app_role) AND (salesperson_id = auth.uid()))));
CREATE POLICY sales_quotes_select ON public.sales_quotes AS PERMISSIVE FOR SELECT TO public USING ((has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]) OR (has_role(auth.uid(), 'sales'::app_role) AND (salesperson_id = auth.uid()))));
CREATE POLICY sales_quotes_update_privileged ON public.sales_quotes AS PERMISSIVE FOR UPDATE TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY sales_quotes_update_sales_own ON public.sales_quotes AS PERMISSIVE FOR UPDATE TO public USING ((has_role(auth.uid(), 'sales'::app_role) AND (salesperson_id = auth.uid()))) WITH CHECK ((has_role(auth.uid(), 'sales'::app_role) AND (salesperson_id = auth.uid()) AND (status = ANY (ARRAY['draft'::sales_quote_status, 'sent'::sales_quote_status, 'rejected'::sales_quote_status, 'canceled'::sales_quote_status]))));
CREATE POLICY scap_insert ON public.salesperson_capital_allocations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY scap_select ON public.salesperson_capital_allocations AS PERMISSIVE FOR SELECT TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY scap_update ON public.salesperson_capital_allocations AS PERMISSIVE FOR UPDATE TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY "Self/admin/manager view snapshots" ON public.score_snapshots AS PERMISSIVE FOR SELECT TO authenticated USING (((employee_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY settlement_types_read ON public.settlement_types AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY settlement_types_write ON public.settlement_types AS PERMISSIVE FOR ALL TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY shipping_rules_read ON public.shipping_cost_rules AS PERMISSIVE FOR SELECT TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY shipping_rules_write ON public.shipping_cost_rules AS PERMISSIVE FOR ALL TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY shop_settings_read_authed ON public.shop_settings AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY shop_settings_write_accountant_purchase_keys ON public.shop_settings AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'accountant'::app_role) AND (key = ANY (ARRAY['accountant_daily_interest_rate'::text, 'purchase_score_enabled'::text, 'purchase_score_grace_days'::text])))) WITH CHECK ((has_role(auth.uid(), 'accountant'::app_role) AND (key = ANY (ARRAY['accountant_daily_interest_rate'::text, 'purchase_score_enabled'::text, 'purchase_score_grace_days'::text]))));
CREATE POLICY shop_settings_write_admin ON public.shop_settings AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY stock_alert_insert ON public.stock_alert_requests AS PERMISSIVE FOR INSERT TO public WITH CHECK ((has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role, 'sales'::app_role]) AND (salesperson_id = auth.uid())));
CREATE POLICY stock_alert_select ON public.stock_alert_requests AS PERMISSIVE FOR SELECT TO public USING ((has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]) OR (has_role(auth.uid(), 'sales'::app_role) AND (salesperson_id = auth.uid()))));
CREATE POLICY stock_alert_update_privileged ON public.stock_alert_requests AS PERMISSIVE FOR UPDATE TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY stock_alert_update_sales_own ON public.stock_alert_requests AS PERMISSIVE FOR UPDATE TO public USING ((has_role(auth.uid(), 'sales'::app_role) AND (salesperson_id = auth.uid()))) WITH CHECK ((has_role(auth.uid(), 'sales'::app_role) AND (salesperson_id = auth.uid()) AND (status = ANY (ARRAY['open'::stock_alert_status, 'contacted'::stock_alert_status, 'canceled'::stock_alert_status]))));
CREATE POLICY "manager admin write suppliers" ON public.suppliers AS PERMISSIVE FOR ALL TO public USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));
CREATE POLICY suppliers_delete_privileged ON public.suppliers AS PERMISSIVE FOR DELETE TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY suppliers_insert_privileged ON public.suppliers AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY suppliers_select_dynamic ON public.suppliers AS PERMISSIVE FOR SELECT TO authenticated USING (has_dynamic_permission(auth.uid(), 'suppliers'::text, 'view'::text));
CREATE POLICY suppliers_select_role_scoped ON public.suppliers AS PERMISSIVE FOR SELECT TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY suppliers_update_privileged ON public.suppliers AS PERMISSIVE FOR UPDATE TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));
CREATE POLICY tasks_select ON public.tasks AS PERMISSIVE FOR SELECT TO authenticated USING (((assigned_to = auth.uid()) OR (created_by = auth.uid()) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])));
CREATE POLICY tasks_write ON public.tasks AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role, 'manager'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role, 'manager'::app_role]));
CREATE POLICY "admins manage roles" ON public.user_roles AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins read all roles" ON public.user_roles AS PERMISSIVE FOR SELECT TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "users read own roles" ON public.user_roles AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY validation_rules_admin_all ON public.validation_rules AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY validation_rules_select_authenticated ON public.validation_rules AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY wcf_select_authed ON public.waybill_custom_fields AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY wcf_write_admin_accountant ON public.waybill_custom_fields AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]));
CREATE POLICY waybill_items_select ON public.waybill_items AS PERMISSIVE FOR SELECT TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'sales'::app_role, 'accountant'::app_role, 'viewer'::app_role]));
CREATE POLICY waybill_items_write ON public.waybill_items AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'sales'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'sales'::app_role]));
CREATE POLICY waybills_select ON public.waybills AS PERMISSIVE FOR SELECT TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'sales'::app_role, 'accountant'::app_role]));
CREATE POLICY waybills_write ON public.waybills AS PERMISSIVE FOR ALL TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'sales'::app_role])) WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'sales'::app_role]));
CREATE POLICY "all authenticated can read settings" ON public.workflow_settings AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "only admin and manager can update" ON public.workflow_settings AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));


-- ============ GRANTS ============



-- =====================================================
-- SEED DATA
-- =====================================================

-- ---- workflow_settings ----
INSERT INTO public.workflow_settings (id, process_key, process_name_fa, uploader_role, reviewer_role, timer_minutes, penalty_enabled, penalty_for, is_active, updated_by, updated_at) VALUES ('782ec14f-0943-4c98-aed3-e8d4b9e80b56', 'inquiry_response', 'پاسخ استعلام قیمت', NULL, 'manager', 10, true, 'reviewer', true, NULL, '2026-06-25T03:16:58.513487+00:00') ON CONFLICT DO NOTHING;
INSERT INTO public.workflow_settings (id, process_key, process_name_fa, uploader_role, reviewer_role, timer_minutes, penalty_enabled, penalty_for, is_active, updated_by, updated_at) VALUES ('6deee26a-8319-41ea-9dcc-de54b146ea5c', 'bijak_invoice_print', 'بیجک و فاکتور چاپی', 'accountant', 'manager', 10, true, 'reviewer', true, NULL, '2026-06-25T03:16:58.513487+00:00') ON CONFLICT DO NOTHING;
INSERT INTO public.workflow_settings (id, process_key, process_name_fa, uploader_role, reviewer_role, timer_minutes, penalty_enabled, penalty_for, is_active, updated_by, updated_at) VALUES ('f24df85b-4b53-45bf-a531-d16a795b68e3', 'shipping_receipt', 'بیجک باربری و رسید ارسال', 'manager', 'sales', 360, true, 'uploader', true, NULL, '2026-06-25T03:16:58.513487+00:00') ON CONFLICT DO NOTHING;
INSERT INTO public.workflow_settings (id, process_key, process_name_fa, uploader_role, reviewer_role, timer_minutes, penalty_enabled, penalty_for, is_active, updated_by, updated_at) VALUES ('6b6ada85-f97f-42b9-9b44-c73bc201f35d', 'delivery_receipt', 'رسید تحویل به مشتری', 'manager', 'sales', 180, true, 'uploader', true, NULL, '2026-06-25T03:16:58.513487+00:00') ON CONFLICT DO NOTHING;
INSERT INTO public.workflow_settings (id, process_key, process_name_fa, uploader_role, reviewer_role, timer_minutes, penalty_enabled, penalty_for, is_active, updated_by, updated_at) VALUES ('ef7c321d-2754-42c2-8b51-e6c815a62fac', 'purchase_request', 'درخواست خرید', NULL, 'manager', 10, true, 'reviewer', true, NULL, '2026-06-25T03:16:58.513487+00:00') ON CONFLICT DO NOTHING;

-- ---- gamification_kpi_rules ----
INSERT INTO public.gamification_kpi_rules (id, title_fa, title_en, description, event_key, xp_amount, is_active, sort_order, created_at, updated_at) VALUES ('06f71561-0946-4d5e-8e8f-56cb8f4d3161', 'تماس خروجی', 'Outbound call', 'برای هر تماس خروجی موفق', 'outbound_call', 5, true, 10, '2026-04-30T21:36:15.729575+00:00', '2026-04-30T21:36:15.729575+00:00') ON CONFLICT DO NOTHING;
INSERT INTO public.gamification_kpi_rules (id, title_fa, title_en, description, event_key, xp_amount, is_active, sort_order, created_at, updated_at) VALUES ('adc241b3-c0d1-40f0-8838-7545727d2912', 'تماس ورودی', 'Inbound call', 'برای پاسخگویی به تماس ورودی', 'inbound_call', 3, true, 20, '2026-04-30T21:36:15.729575+00:00', '2026-04-30T21:36:15.729575+00:00') ON CONFLICT DO NOTHING;
INSERT INTO public.gamification_kpi_rules (id, title_fa, title_en, description, event_key, xp_amount, is_active, sort_order, created_at, updated_at) VALUES ('623d86f8-47df-4305-9bc5-04710b45c81e', 'ثبت مشتری جدید', 'New customer created', 'برای ایجاد مشتری جدید در CRM', 'new_customer_created', 20, true, 30, '2026-04-30T21:36:15.729575+00:00', '2026-04-30T21:36:15.729575+00:00') ON CONFLICT DO NOTHING;
INSERT INTO public.gamification_kpi_rules (id, title_fa, title_en, description, event_key, xp_amount, is_active, sort_order, created_at, updated_at) VALUES ('52d377f2-0867-4393-9024-7d59aa15375c', 'ثبت یادداشت در CRM', 'CRM note created', 'برای هر یادداشت ثبت‌شده', 'crm_note_created', 2, true, 40, '2026-04-30T21:36:15.729575+00:00', '2026-04-30T21:36:15.729575+00:00') ON CONFLICT DO NOTHING;
INSERT INTO public.gamification_kpi_rules (id, title_fa, title_en, description, event_key, xp_amount, is_active, sort_order, created_at, updated_at) VALUES ('7d044287-9910-4eb9-9079-40c4ed73002f', 'بستن فروش', 'Sale closed', 'برای هر فروش نهایی‌شده', 'sale_closed', 100, true, 50, '2026-04-30T21:36:15.729575+00:00', '2026-04-30T21:36:15.729575+00:00') ON CONFLICT DO NOTHING;
INSERT INTO public.gamification_kpi_rules (id, title_fa, title_en, description, event_key, xp_amount, is_active, sort_order, created_at, updated_at) VALUES ('4f484895-59ac-4f15-8f47-6093365e9c27', 'پیگیری انجام‌شده', 'Followup completed', 'برای انجام پیگیری برنامه‌ریزی‌شده', 'followup_completed', 10, true, 60, '2026-04-30T21:36:15.729575+00:00', '2026-04-30T21:36:15.729575+00:00') ON CONFLICT DO NOTHING;
INSERT INTO public.gamification_kpi_rules (id, title_fa, title_en, description, event_key, xp_amount, is_active, sort_order, created_at, updated_at) VALUES ('05186bce-2ba1-4050-a25c-757344109ff5', 'انجام تسک', 'Task completed', 'برای تکمیل وظیفه‌ها', 'task_completed', 8, true, 70, '2026-04-30T21:36:15.729575+00:00', '2026-04-30T21:36:15.729575+00:00') ON CONFLICT DO NOTHING;
INSERT INTO public.gamification_kpi_rules (id, title_fa, title_en, description, event_key, xp_amount, is_active, sort_order, created_at, updated_at) VALUES ('c2078107-a373-46a5-a964-c73268433df3', 'خرید با مهلت تسویه‌ی هوشمند', NULL, 'امتیاز برای خریدی که با قیمتی نزدیک به نقدی، مهلت تسویه‌ی طولانی‌تر گرفته است', 'purchase_long_term_score', 0, true, 100, '2026-05-06T17:05:16.601283+00:00', '2026-05-06T17:05:16.601283+00:00') ON CONFLICT DO NOTHING;
INSERT INTO public.gamification_kpi_rules (id, title_fa, title_en, description, event_key, xp_amount, is_active, sort_order, created_at, updated_at) VALUES ('67a740c6-f194-4cca-8ed0-7af711ae6a7b', 'بهره‌برداری از مهلت تسویه', NULL, 'امتیاز حسابدار برای پرداخت در نزدیکی پایان مهلت تسویه (بدون دیرکرد)', 'payment_late_pay_score', 0, true, 110, '2026-05-06T17:05:16.601283+00:00', '2026-05-06T17:05:16.601283+00:00') ON CONFLICT DO NOTHING;

-- =====================================================
-- End of export
-- =====================================================
