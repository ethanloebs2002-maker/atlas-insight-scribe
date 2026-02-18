# ATLAS Canonical Memory Pillar

## Contract

**No cross-layer experiential writes outside the Memory Bank.**

All lifecycle events (decisions, fills, closes, learning updates) must be recorded in:
- DB table: `atlas_memory_events`
- Via the `memoryWrite()` helper in `supabase/functions/_shared/memory.ts`
- Or via the `memory-write` edge function (HTTP endpoint)

## Relationship to Market Data Backbone

| Pillar | Purpose | Tables |
|--------|---------|--------|
| **Market Backbone** | Price/orderbook reads/writes | `latest_prices`, `latest_orderbook`, `market_data_config` |
| **Memory** | Experiential events: decision → context → execution → outcome | `atlas_memory_events`, `atlas_memory_sources` |

Both pillars have equal enforcement via guards.

## Memory Events Schema

| Field | Description |
|-------|-------------|
| `trace_id` | Groups related events in the same lifecycle moment |
| `position_id` | Links to paper_positions (nullable) |
| `decision_id` | Links to paper_decisions (nullable) |
| `symbol` | Asset symbol |
| `phase` | Lifecycle phase (see below) |
| `source` | Registered source (see below) |
| `payload` | Compact JSONB summary (<10KB) |

## Allowed Phases

| Phase | When |
|-------|------|
| `DECISION_EMIT` | Consensus report / decision created |
| `ENTRY_FILLED` | Position filled / opened |
| `EXIT_CLOSED` | Position closed |
| `CADENCE_OBSERVE` | Periodic observation (sensor summary) |
| `POLICY_UPDATE` | Policy or configuration change |
| `LEARNING_UPDATE` | Scenario reputation, risk lab, etc. |

## Registered Sources

Managed in `atlas_memory_sources` table. Current sources:

| Source | Owner Module |
|--------|-------------|
| `market` | market-data-pump |
| `orderbook` | market-data-pump |
| `derivatives` | derivatives-context-snap |
| `consensus` | paper-engine |
| `execution` | paper-engine-tick |
| `risk_lab` | paper-engine-tick |
| `policy` | paper-engine |
| `whale` | whale-signal |
| `news` | news-engine |
| `strategy` | strategy-evolve |

## How to Add a New Probe

1. Register the source in `atlas_memory_sources`:
   ```sql
   INSERT INTO atlas_memory_sources (source, owner_module, description)
   VALUES ('my_probe', 'supabase/functions/my-probe', 'Description');
   ```

2. Import and use `memoryWrite()` in your edge function:
   ```typescript
   import { memoryWrite, newTraceId } from "../_shared/memory.ts";
   await memoryWrite({
     trace_id: newTraceId(),
     symbol: "BTC",
     phase: "CADENCE_OBSERVE",
     source: "my_probe",
     payload: { key: "value" },
   });
   ```

3. Add your module path to `scripts/memory_guard.ts` whitelist if needed.

## Enforcement

Run `npx tsx scripts/memory_guard.ts` to check for violations.

Any write to `atlas_memory_events` from non-approved modules will fail with:

> **THIS BREAKS THE MEMORY, PLEASE ADJUST**

## Sensor Tables

Existing sensor/snapshot tables (`market_context_snapshots`, `derivatives_context_snapshots`, etc.) continue to exist for high-frequency capture. However:

- They are written **only** by their dedicated snapshotters
- Key summaries are **also** written into Memory at lifecycle choke points
- Learning and cross-layer reads should prefer Memory over raw sensor tables

## Violation Response

If any proposed change writes experience data outside Memory:

> **THIS BREAKS THE MEMORY, PLEASE ADJUST**
> Route this write through Memory (atlas_memory_events) via memoryWrite() helper.
