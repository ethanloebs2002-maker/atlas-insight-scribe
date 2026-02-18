ALTER TABLE public.atlas_settings
ADD COLUMN IF NOT EXISTS eval_last_by_asset jsonb DEFAULT '{}'::jsonb;