
-- ═══════════════════════════════════════════════════════════════
-- PATCH 5 (CORRECTED): Backbone Vol Rollups — safe RLS + DB functions
-- ═══════════════════════════════════════════════════════════════

-- 1) Tables (idempotent)
CREATE TABLE IF NOT EXISTS market_bars_1m (
  symbol text NOT NULL,
  bucket_ts timestamptz NOT NULL,
  open double precision,
  high double precision,
  low double precision,
  close double precision,
  samples_n integer NOT NULL DEFAULT 0,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, bucket_ts)
);

CREATE TABLE IF NOT EXISTS market_volatility_rollups (
  symbol text PRIMARY KEY,
  updated_at timestamptz NOT NULL DEFAULT now(),
  rv_1h double precision,
  rv_4h double precision,
  rv_24h double precision,
  atr_1h double precision,
  atr_4h double precision,
  vol_regime text
);

-- 2) Indexes
CREATE INDEX IF NOT EXISTS market_bars_1m_symbol_bucket_desc_idx
  ON market_bars_1m (symbol, bucket_ts DESC);

CREATE INDEX IF NOT EXISTS market_volatility_rollups_updated_idx
  ON market_volatility_rollups (updated_at DESC);

-- 3) Enable RLS
ALTER TABLE market_bars_1m ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_volatility_rollups ENABLE ROW LEVEL SECURITY;

-- 4) Drop any overly-permissive policies from earlier attempts
DROP POLICY IF EXISTS "Service role full access on market_bars_1m" ON market_bars_1m;
DROP POLICY IF EXISTS "Service role full access on market_volatility_rollups" ON market_volatility_rollups;

-- 5) Secure RLS: authenticated can READ, nobody can WRITE from client
-- (service_role bypasses RLS, so pump/rollup functions still work)

CREATE POLICY "Read market_bars_1m (authenticated)"
  ON market_bars_1m FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "No client writes market_bars_1m"
  ON market_bars_1m FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

CREATE POLICY "No client updates market_bars_1m"
  ON market_bars_1m FOR UPDATE
  TO anon, authenticated
  USING (false);

CREATE POLICY "No client deletes market_bars_1m"
  ON market_bars_1m FOR DELETE
  TO anon, authenticated
  USING (false);

CREATE POLICY "Read market_volatility_rollups (authenticated)"
  ON market_volatility_rollups FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "No client writes market_volatility_rollups"
  ON market_volatility_rollups FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- 6) Deterministic 1m bar upsert (called by pump on every tick)
CREATE OR REPLACE FUNCTION public.upsert_market_bar_1m(
  p_symbol text,
  p_price double precision,
  p_ts timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  b_ts timestamptz := date_trunc('minute', p_ts);
BEGIN
  INSERT INTO market_bars_1m (symbol, bucket_ts, open, high, low, close, samples_n, first_seen_at, last_seen_at)
  VALUES (p_symbol, b_ts, p_price, p_price, p_price, p_price, 1, now(), now())
  ON CONFLICT (symbol, bucket_ts) DO UPDATE
    SET high = GREATEST(market_bars_1m.high, EXCLUDED.high),
        low  = LEAST(market_bars_1m.low, EXCLUDED.low),
        close = EXCLUDED.close,
        samples_n = market_bars_1m.samples_n + 1,
        last_seen_at = now();
END;
$$;

-- Restrict to service_role only
REVOKE EXECUTE ON FUNCTION public.upsert_market_bar_1m(text, double precision, timestamptz) FROM PUBLIC;

-- 7) Rollup refresh (rv + atr + regime) from bars
CREATE OR REPLACE FUNCTION public.refresh_market_volatility_rollups(p_symbol text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rv1h double precision;
  rv4h double precision;
  rv24h double precision;
  atr1h double precision;
  atr4h double precision;
  regime text;
BEGIN
  WITH bars AS (
    SELECT bucket_ts, close, high, low
    FROM market_bars_1m
    WHERE symbol = p_symbol
    ORDER BY bucket_ts DESC
    LIMIT 1500
  ),
  ordered AS (
    SELECT * FROM bars ORDER BY bucket_ts ASC
  ),
  rets AS (
    SELECT
      bucket_ts,
      CASE
        WHEN lag(close) OVER (ORDER BY bucket_ts) > 0 AND close > 0
        THEN ln(close / lag(close) OVER (ORDER BY bucket_ts))
        ELSE NULL
      END AS r
    FROM ordered
  ),
  rv AS (
    SELECT
      (SELECT stddev_samp(r) FROM (SELECT r FROM rets WHERE r IS NOT NULL ORDER BY bucket_ts DESC LIMIT 60) x) AS rv_1h,
      (SELECT stddev_samp(r) FROM (SELECT r FROM rets WHERE r IS NOT NULL ORDER BY bucket_ts DESC LIMIT 240) x) AS rv_4h,
      (SELECT stddev_samp(r) FROM (SELECT r FROM rets WHERE r IS NOT NULL ORDER BY bucket_ts DESC LIMIT 1440) x) AS rv_24h
  ),
  tr AS (
    SELECT
      bucket_ts,
      GREATEST(
        high - low,
        abs(high - lag(close) OVER (ORDER BY bucket_ts)),
        abs(low  - lag(close) OVER (ORDER BY bucket_ts))
      ) AS true_range
    FROM ordered
  ),
  atr AS (
    SELECT
      (SELECT avg(true_range) FROM (SELECT true_range FROM tr WHERE true_range IS NOT NULL ORDER BY bucket_ts DESC LIMIT 60) a) AS atr_1h,
      (SELECT avg(true_range) FROM (SELECT true_range FROM tr WHERE true_range IS NOT NULL ORDER BY bucket_ts DESC LIMIT 240) a) AS atr_4h
  )
  SELECT rv.rv_1h, rv.rv_4h, rv.rv_24h, atr.atr_1h, atr.atr_4h
  INTO rv1h, rv4h, rv24h, atr1h, atr4h
  FROM rv, atr;

  IF rv1h IS NULL OR rv24h IS NULL OR rv24h <= 0 THEN
    regime := NULL;
  ELSE
    IF (rv1h / rv24h) >= 1.25 THEN regime := 'expansion';
    ELSIF (rv1h / rv24h) <= 0.80 THEN regime := 'compression';
    ELSE regime := 'normal';
    END IF;
  END IF;

  INSERT INTO market_volatility_rollups(symbol, updated_at, rv_1h, rv_4h, rv_24h, atr_1h, atr_4h, vol_regime)
  VALUES (p_symbol, now(), rv1h, rv4h, rv24h, atr1h, atr4h, regime)
  ON CONFLICT (symbol) DO UPDATE
    SET updated_at = EXCLUDED.updated_at,
        rv_1h = EXCLUDED.rv_1h,
        rv_4h = EXCLUDED.rv_4h,
        rv_24h = EXCLUDED.rv_24h,
        atr_1h = EXCLUDED.atr_1h,
        atr_4h = EXCLUDED.atr_4h,
        vol_regime = EXCLUDED.vol_regime;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_market_volatility_rollups(text) FROM PUBLIC;

-- 8) Garbage collection
CREATE OR REPLACE FUNCTION public.prune_market_bars_1m(p_keep_days integer DEFAULT 7)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  n integer;
BEGIN
  DELETE FROM market_bars_1m
  WHERE bucket_ts < now() - make_interval(days => p_keep_days);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prune_market_bars_1m(integer) FROM PUBLIC;
