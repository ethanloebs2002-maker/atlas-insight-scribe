
-- Drop any previous versions
DROP FUNCTION IF EXISTS public.brain_acquire_lease(text, int);
DROP FUNCTION IF EXISTS public.brain_release_lease(text);
DROP FUNCTION IF EXISTS public.brain_renew_lease(text, int);

-- 1) Acquire lease — atomic, explicit ROW_COUNT
CREATE OR REPLACE FUNCTION public.brain_acquire_lease(p_owner text, p_lease_seconds int DEFAULT 90)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rows int;
BEGIN
  UPDATE atlas_brain_cursor
  SET locked_until = now() + make_interval(secs => p_lease_seconds),
      lock_owner = p_owner
  WHERE id = 1
    AND (locked_until IS NULL OR locked_until < now());

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN (v_rows > 0);
END;
$$;

-- 2) Renew lease — only current owner can extend
CREATE OR REPLACE FUNCTION public.brain_renew_lease(p_owner text, p_lease_seconds int DEFAULT 90)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rows int;
BEGIN
  UPDATE atlas_brain_cursor
  SET locked_until = now() + make_interval(secs => p_lease_seconds)
  WHERE id = 1
    AND lock_owner = p_owner
    AND locked_until IS NOT NULL
    AND locked_until > now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN (v_rows > 0);
END;
$$;

-- 3) Release lease — returns boolean
CREATE OR REPLACE FUNCTION public.brain_release_lease(p_owner text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rows int;
BEGIN
  UPDATE atlas_brain_cursor
  SET locked_until = NULL, lock_owner = NULL
  WHERE id = 1 AND lock_owner = p_owner;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN (v_rows > 0);
END;
$$;

-- 4) Revoke PUBLIC execute on all three
REVOKE ALL ON FUNCTION public.brain_acquire_lease(text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.brain_release_lease(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.brain_renew_lease(text, int) FROM PUBLIC;
