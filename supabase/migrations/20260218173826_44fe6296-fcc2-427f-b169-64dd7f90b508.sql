
-- 1) Function: recompute decision.engine_status from current position states
CREATE OR REPLACE FUNCTION public.sync_paper_decision_status_from_positions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_decision_id uuid;
  v_has_open boolean;
  v_has_pending boolean;
  v_has_closed boolean;
BEGIN
  v_decision_id := COALESCE(NEW.decision_id, OLD.decision_id);

  IF v_decision_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT
    COALESCE(bool_or(status = 'OPEN'), false)          AS has_open,
    COALESCE(bool_or(status = 'PENDING_ENTRY'), false) AS has_pending,
    COALESCE(bool_or(status = 'CLOSED'), false)        AS has_closed
  INTO v_has_open, v_has_pending, v_has_closed
  FROM public.paper_positions
  WHERE decision_id = v_decision_id;

  UPDATE public.paper_decisions d
  SET engine_status = CASE
    WHEN v_has_open OR v_has_pending THEN 'EXECUTING'
    WHEN v_has_closed THEN 'COMPLETE'
    ELSE 'REJECTED'
  END
  WHERE d.id = v_decision_id
    AND d.decision_type = 'TRADE_CANDIDATE';

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 2) Trigger
DROP TRIGGER IF EXISTS trg_sync_decision_status_from_positions ON public.paper_positions;

CREATE TRIGGER trg_sync_decision_status_from_positions
AFTER INSERT OR UPDATE OF status, decision_id OR DELETE
ON public.paper_positions
FOR EACH ROW
EXECUTE FUNCTION public.sync_paper_decision_status_from_positions();

-- 3) Harden permissions (SECURITY DEFINER lockdown)
REVOKE EXECUTE ON FUNCTION public.sync_paper_decision_status_from_positions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_paper_decision_status_from_positions() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_paper_decision_status_from_positions() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.sync_paper_decision_status_from_positions() TO service_role;
GRANT  EXECUTE ON FUNCTION public.sync_paper_decision_status_from_positions() TO postgres;
