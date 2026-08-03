CREATE TRIGGER trg_archive_prior_allocations AFTER INSERT OR UPDATE OF is_active ON public.daily_capital_snapshots FOR EACH ROW EXECUTE FUNCTION _archive_prior_allocations_on_active();
