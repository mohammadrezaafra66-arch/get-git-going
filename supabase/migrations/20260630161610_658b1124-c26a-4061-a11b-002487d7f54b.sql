GRANT SELECT, INSERT, UPDATE, DELETE ON public.dynamic_scoring_parameters TO authenticated;
GRANT ALL ON public.dynamic_scoring_parameters TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dynamic_parameter_weights TO authenticated;
GRANT ALL ON public.dynamic_parameter_weights TO service_role;