
CREATE OR REPLACE FUNCTION public.atlas_settings_touch_asset_cadence(p_asset text, p_ts text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_asset IS NULL OR length(trim(p_asset)) = 0 OR p_asset = 'undefined' THEN
    RAISE EXCEPTION 'p_asset is invalid';
  END IF;

  UPDATE public.atlas_settings
  SET eval_last_by_asset = COALESCE(eval_last_by_asset, '{}'::jsonb)
        || jsonb_build_object(p_asset, p_ts),
      updated_at = p_ts::timestamptz
  WHERE id = 'global';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.atlas_settings_touch_asset_cadence(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.atlas_settings_touch_asset_cadence(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.atlas_settings_touch_asset_cadence(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_settings_touch_asset_cadence(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.atlas_settings_touch_asset_cadence(text, text) TO postgres;
