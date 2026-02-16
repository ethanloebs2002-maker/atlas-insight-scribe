CREATE UNIQUE INDEX IF NOT EXISTS tsa_unique_position_scenario
ON public.trade_scenario_attribution(position_id, scenario_key);