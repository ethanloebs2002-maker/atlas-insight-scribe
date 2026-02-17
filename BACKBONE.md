# ATLAS Canonical Market Data Backbone

## Contract

**No direct market fetches outside the Market Data Layer.**

All execution (fills, closes), decisions, learning, and UI must read from:
- DB canonical tables: `latest_prices` and `latest_orderbook`
- The `market-data-read` edge function (for UI)
- The `src/lib/marketData.ts` client module (for frontend)

## Approved Modules (Whitelist)

Only these files may call external market APIs (Binance, CryptoCompare, etc.):

| File | Purpose |
|------|---------|
| `supabase/functions/market-data-pump/index.ts` | Fetches prices + order book, upserts to canonical tables |
| `supabase/functions/crypto-data/index.ts` | Legacy analysis endpoint (CryptoCompare for charting/analysis OHLCV) |

> **Note:** `crypto-data` is grandfathered for its analysis/charting OHLCV role but also persists to `latest_prices`.

## Canonical Tables

| Table | Key | Purpose |
|-------|-----|---------|
| `latest_prices` | `symbol` (PK) | Most recent mid price per symbol |
| `latest_orderbook` | `symbol` (PK) | Best bid/ask, spread, imbalance per symbol |
| `market_data_config` | Single row | Symbols list, staleness thresholds |

## Staleness Gating

- `stale_ms_exec` (default 1500ms): If canonical data is older, execution (fills/closes) is BLOCKED with `STALE_DATA_BLOCK` event.
- `stale_ms_ui` (default 5000ms): UI shows a freshness warning.

## Enforcement

Run `npm run backbone:guard` to scan for violations. Any direct fetch to known market endpoints outside whitelisted files will fail the check.

## Adding New Data Sources

1. Add the fetch logic **only** inside `market-data-pump`
2. Upsert into `latest_prices` and/or `latest_orderbook`
3. All consumers automatically get the new data via canonical reads

## Violation Response

If any proposed change bypasses canonical tables or adds another market feed outside the pump:

> **THIS WILL BREAK YOUR BACKBONE, PLEASE ADJUST**
