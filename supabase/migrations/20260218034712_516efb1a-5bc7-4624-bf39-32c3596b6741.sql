
-- Cohort cutover: add cohort_id to core tables

-- A) Core paper trading tables
ALTER TABLE IF EXISTS paper_decisions ADD COLUMN IF NOT EXISTS cohort_id text;
ALTER TABLE IF EXISTS paper_positions ADD COLUMN IF NOT EXISTS cohort_id text;
ALTER TABLE IF EXISTS paper_orders ADD COLUMN IF NOT EXISTS cohort_id text;
ALTER TABLE IF EXISTS paper_fills ADD COLUMN IF NOT EXISTS cohort_id text;

-- B) Memory events
ALTER TABLE IF EXISTS atlas_memory_events ADD COLUMN IF NOT EXISTS cohort_id text;

-- C) Brain tables
ALTER TABLE IF EXISTS atlas_brain_log ADD COLUMN IF NOT EXISTS cohort_id text;
ALTER TABLE IF EXISTS scenario_reputation ADD COLUMN IF NOT EXISTS cohort_id text;
ALTER TABLE IF EXISTS strategy_reputation ADD COLUMN IF NOT EXISTS cohort_id text;

-- D) Indexes for filtering
CREATE INDEX IF NOT EXISTS idx_paper_positions_cohort ON paper_positions (cohort_id);
CREATE INDEX IF NOT EXISTS idx_paper_decisions_cohort ON paper_decisions (cohort_id);
CREATE INDEX IF NOT EXISTS idx_memory_events_cohort ON atlas_memory_events (cohort_id);
CREATE INDEX IF NOT EXISTS idx_brain_log_cohort ON atlas_brain_log (cohort_id);
