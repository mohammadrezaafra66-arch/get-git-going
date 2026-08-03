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

--
-- Data for Name: salesperson_capital_allocations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.salesperson_capital_allocations (id, capital_snapshot_id, capital_date, salesperson_id, score, score_source, total_score, system_suggested_amount, final_amount, override_reason, status, created_by, approved_by, created_at, updated_at, held_amount, consumed_amount) FROM stdin;
\.


--
-- Data for Name: customer_capital_allocations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.customer_capital_allocations (id, salesperson_allocation_id, capital_snapshot_id, capital_date, salesperson_id, customer_id, customer_score, score_source, total_customer_score, system_suggested_amount, final_amount, override_reason, status, created_by, approved_by, created_at, updated_at, held_amount, consumed_amount, customer_person_id) FROM stdin;
\.


--
-- PostgreSQL database dump complete
--

