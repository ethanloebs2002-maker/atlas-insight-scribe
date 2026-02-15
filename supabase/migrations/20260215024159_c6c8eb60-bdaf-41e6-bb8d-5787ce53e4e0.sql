
-- Drop the permissive public read policy on asset_fingerprints
DROP POLICY IF EXISTS "Public read asset_fingerprints" ON public.asset_fingerprints;

-- Create a restrictive policy: only service role (used by edge functions) can read
-- Since the anon/authenticated users never query this table directly, deny public reads
CREATE POLICY "Deny public read asset_fingerprints"
  ON public.asset_fingerprints
  FOR SELECT
  USING (false);
