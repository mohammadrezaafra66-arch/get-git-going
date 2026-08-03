--
-- PostgreSQL database dump
--

-- Dumped from database version 15.6
-- Dumped by pg_dump version 15.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: customer_capital_allocations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customer_capital_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    salesperson_allocation_id uuid NOT NULL,
    capital_snapshot_id uuid NOT NULL,
    capital_date date NOT NULL,
    salesperson_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    customer_score numeric DEFAULT 0 NOT NULL,
    score_source text DEFAULT 'customer_credit_profile.credit_score'::text NOT NULL,
    total_customer_score numeric DEFAULT 0 NOT NULL,
    system_suggested_amount numeric DEFAULT 0 NOT NULL,
    final_amount numeric DEFAULT 0 NOT NULL,
    override_reason text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid,
    approved_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    held_amount numeric DEFAULT 0 NOT NULL,
    consumed_amount numeric DEFAULT 0 NOT NULL,
    customer_person_id uuid NOT NULL,
    CONSTRAINT ccap_final_nonneg CHECK ((final_amount >= (0)::numeric)),
    CONSTRAINT ccap_status_chk CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text]))),
    CONSTRAINT ccap_suggested_nonneg CHECK ((system_suggested_amount >= (0)::numeric)),
    CONSTRAINT customer_capital_allocations_consumed_amount_check CHECK ((consumed_amount >= (0)::numeric)),
    CONSTRAINT customer_capital_allocations_held_amount_check CHECK ((held_amount >= (0)::numeric))
);


ALTER TABLE public.customer_capital_allocations OWNER TO postgres;

--
-- Name: COLUMN customer_capital_allocations.customer_person_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.customer_capital_allocations.customer_person_id IS 'Unified person behind customer_id. Derived by trg_customer_capital_allocations_derive_person (migration 237) - do not write directly. Credit arithmetic still keys on customer_id; see migration 237 header.';


--
-- Name: salesperson_capital_allocations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.salesperson_capital_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    capital_snapshot_id uuid NOT NULL,
    capital_date date NOT NULL,
    salesperson_id uuid NOT NULL,
    score numeric DEFAULT 0 NOT NULL,
    score_source text DEFAULT 'employee_scores.monthly_score'::text NOT NULL,
    total_score numeric DEFAULT 0 NOT NULL,
    system_suggested_amount numeric DEFAULT 0 NOT NULL,
    final_amount numeric DEFAULT 0 NOT NULL,
    override_reason text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid,
    approved_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    held_amount numeric DEFAULT 0 NOT NULL,
    consumed_amount numeric DEFAULT 0 NOT NULL,
    CONSTRAINT salesperson_capital_allocations_consumed_amount_check CHECK ((consumed_amount >= (0)::numeric)),
    CONSTRAINT salesperson_capital_allocations_held_amount_check CHECK ((held_amount >= (0)::numeric)),
    CONSTRAINT scap_final_nonneg CHECK ((final_amount >= (0)::numeric)),
    CONSTRAINT scap_status_chk CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text]))),
    CONSTRAINT scap_suggested_nonneg CHECK ((system_suggested_amount >= (0)::numeric))
);


ALTER TABLE public.salesperson_capital_allocations OWNER TO postgres;

--
-- Name: COLUMN salesperson_capital_allocations.override_reason; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.salesperson_capital_allocations.override_reason IS 'DEPRECATED 2026-08-03 (migration 268, owner decision D8-1): the per-salesperson ceiling override was closed. Existing rows are KEPT as history. Nothing new is written here.';


--
-- Name: customer_capital_allocations customer_capital_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_capital_allocations
    ADD CONSTRAINT customer_capital_allocations_pkey PRIMARY KEY (id);


--
-- Name: salesperson_capital_allocations salesperson_capital_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salesperson_capital_allocations
    ADD CONSTRAINT salesperson_capital_allocations_pkey PRIMARY KEY (id);


--
-- Name: ccap_alloc_customer_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ccap_alloc_customer_uniq ON public.customer_capital_allocations USING btree (salesperson_allocation_id, customer_id);


--
-- Name: ccap_customer_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ccap_customer_date_idx ON public.customer_capital_allocations USING btree (customer_id, capital_date);


--
-- Name: ccap_salesperson_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ccap_salesperson_date_idx ON public.customer_capital_allocations USING btree (salesperson_id, capital_date);


--
-- Name: ccap_snapshot_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ccap_snapshot_idx ON public.customer_capital_allocations USING btree (capital_snapshot_id);


--
-- Name: customer_capital_allocations_customer_person_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX customer_capital_allocations_customer_person_id_idx ON public.customer_capital_allocations USING btree (customer_person_id);


--
-- Name: scap_capital_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX scap_capital_date_idx ON public.salesperson_capital_allocations USING btree (capital_date);


--
-- Name: scap_salesperson_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX scap_salesperson_date_idx ON public.salesperson_capital_allocations USING btree (salesperson_id, capital_date);


--
-- Name: scap_snapshot_salesperson_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX scap_snapshot_salesperson_uniq ON public.salesperson_capital_allocations USING btree (capital_snapshot_id, salesperson_id);


--
-- Name: salesperson_capital_allocations trg_allocation_not_overridable; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_allocation_not_overridable BEFORE INSERT OR UPDATE ON public.salesperson_capital_allocations FOR EACH ROW EXECUTE FUNCTION public.enforce_allocation_not_overridable();


--
-- Name: customer_capital_allocations trg_ccap_updated; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_ccap_updated BEFORE UPDATE ON public.customer_capital_allocations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: customer_capital_allocations trg_ccap_validate_override; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_ccap_validate_override BEFORE INSERT OR UPDATE ON public.customer_capital_allocations FOR EACH ROW EXECUTE FUNCTION public.validate_customer_capital_alloc_override();


--
-- Name: customer_capital_allocations trg_customer_capital_allocations_derive_person; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_customer_capital_allocations_derive_person BEFORE INSERT OR UPDATE OF customer_id ON public.customer_capital_allocations FOR EACH ROW EXECUTE FUNCTION public.tg_credit_derive_customer_person();


--
-- Name: salesperson_capital_allocations trg_scap_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_scap_updated_at BEFORE UPDATE ON public.salesperson_capital_allocations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: customer_capital_allocations trg_validate_cca_amounts; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_validate_cca_amounts BEFORE INSERT OR UPDATE OF held_amount, consumed_amount, final_amount ON public.customer_capital_allocations FOR EACH ROW EXECUTE FUNCTION public._validate_allocation_amounts();


--
-- Name: salesperson_capital_allocations trg_validate_sca_amounts; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_validate_sca_amounts BEFORE INSERT OR UPDATE OF held_amount, consumed_amount, final_amount ON public.salesperson_capital_allocations FOR EACH ROW EXECUTE FUNCTION public._validate_allocation_amounts();


--
-- Name: customer_capital_allocations customer_capital_allocations_capital_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_capital_allocations
    ADD CONSTRAINT customer_capital_allocations_capital_snapshot_id_fkey FOREIGN KEY (capital_snapshot_id) REFERENCES public.daily_capital_snapshots(id) ON DELETE CASCADE;


--
-- Name: customer_capital_allocations customer_capital_allocations_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_capital_allocations
    ADD CONSTRAINT customer_capital_allocations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: customer_capital_allocations customer_capital_allocations_customer_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_capital_allocations
    ADD CONSTRAINT customer_capital_allocations_customer_person_id_fkey FOREIGN KEY (customer_person_id) REFERENCES public.persons(id) ON DELETE RESTRICT;


--
-- Name: customer_capital_allocations customer_capital_allocations_salesperson_allocation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_capital_allocations
    ADD CONSTRAINT customer_capital_allocations_salesperson_allocation_id_fkey FOREIGN KEY (salesperson_allocation_id) REFERENCES public.salesperson_capital_allocations(id) ON DELETE CASCADE;


--
-- Name: salesperson_capital_allocations salesperson_capital_allocations_capital_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salesperson_capital_allocations
    ADD CONSTRAINT salesperson_capital_allocations_capital_snapshot_id_fkey FOREIGN KEY (capital_snapshot_id) REFERENCES public.daily_capital_snapshots(id) ON DELETE CASCADE;


--
-- Name: customer_capital_allocations ccap_read_privileged; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ccap_read_privileged ON public.customer_capital_allocations FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text]));


--
-- Name: customer_capital_allocations ccap_write_privileged; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ccap_write_privileged ON public.customer_capital_allocations TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text])) WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text]));


--
-- Name: customer_capital_allocations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.customer_capital_allocations ENABLE ROW LEVEL SECURITY;

--
-- Name: salesperson_capital_allocations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.salesperson_capital_allocations ENABLE ROW LEVEL SECURITY;

--
-- Name: salesperson_capital_allocations scap_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY scap_insert ON public.salesperson_capital_allocations FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text]));


--
-- Name: salesperson_capital_allocations scap_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY scap_select ON public.salesperson_capital_allocations FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text]));


--
-- Name: salesperson_capital_allocations scap_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY scap_update ON public.salesperson_capital_allocations FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text])) WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text]));


--
-- Name: TABLE customer_capital_allocations; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.customer_capital_allocations TO authenticated;
GRANT ALL ON TABLE public.customer_capital_allocations TO service_role;


--
-- Name: TABLE salesperson_capital_allocations; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.salesperson_capital_allocations TO authenticated;
GRANT ALL ON TABLE public.salesperson_capital_allocations TO service_role;


--
-- PostgreSQL database dump complete
--

