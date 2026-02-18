# ATLAS Canonical Memory Pillar — Unified Experiential Store

## Contract

**No cross-layer experiential writes outside the Memory Bank.**
**No silent gaps. Every source reports at every choke point.**

Memory is the unified experiential store for all channels. Every registered source
must emit a fingerprint (data or explicit absence) at each lifecycle choke point.

If a signal exists but is not represented in Memory, it does not exist to ATLAS.

## The Three Statuses

| Status | Meaning |
|--------|---------|
| **OK** | Source had real data, included in payload |
| **MISSING** | Source had no data (disabled, unavailable, not applicable) |
| **FAILED** | Source attempted but errored (geo-block, timeout, etc.) |

Silence is forbidden. Absence is explicitly recorded.

## Relationship to Other Pillars

| Pillar | Purpose | Tables |
|--------|---------|--------|
| **Backbone** | Price/orderbook reads/writes | `latest_prices`, `latest_orderbook`, `market_data_config` |
| **Memory** | Experiential events: decision → context → execution → outcome | `atlas_memory_events`, `atlas_memory_sources` |
| **Brain** | Learning & adaptation from Memory | `atlas_brain_log`, `atlas_brain_sources` |

## Lifecycle Choke Points

| Phase | When | Sources Required |
|-------|------|-----------------|
| `DECISION_EMIT` | Consensus report / decision created | All 10 |
| `ENTRY_FILLED` | Position filled / opened | All 10 |
| `EXIT_CLOSED` | Position closed | All 10 |
| `CADENCE_OBSERVE` | Periodic observation | As applicable |
| `POLICY_UPDATE` | Policy or configuration change | As applicable |
| `LEARNING_UPDATE` | Brain updates | As applicable |

## Registered Sources (all 10)

| Source | Owner Module | Description |
|--------|-------------|-------------|
| `market` | market-data-pump | Price data from backbone |
| `orderbook` | market-data-pump | Bid/ask/spread/imbalance |
| `derivatives` | derivatives-context-snap | Funding rate, OI |
| `consensus` | paper-engine | Scenario probability + direction |
| `execution` | paper-engine-tick | Fill/exit details |
| `risk_lab` | paper-engine-tick | Risk profile + realized performance |
| `policy` | paper-engine | Active policy parameters |
| `whale` | whale-signal | Whale movement data |
| `news` | news-engine | News sentiment data |
| `strategy` | strategy-evolve | Strategy blueprint data |

## Fan-Out Architecture

At each choke point, `memoryFanOut()` is called with known source events.
Sources not explicitly provided receive an automatic MISSING event.

```typescript
import { memoryFanOut, type SourceEvent } from "../_shared/memory_fanout.ts";

const sources: SourceEvent[] = [
  { source: "execution", status: "OK", data: { entry_price: 100 } },
  { source: "market", status: "OK", data: { mid: 100.5 } },
  { source: "derivatives", status: "FAILED", reason: "451 geo-block" },
  // ... remaining sources auto-fill as MISSING
];

await memoryFanOut(sb, "ENTRY_FILLED", traceId, common, sources);
// Writes 10 events (one per source), all sharing the same trace_id
```

## Payload Structure

Every Memory event payload now follows:

```json
{
  "status": "OK | MISSING | FAILED",
  "data": { ... },      // present when status=OK
  "reason": "..."        // present when status=MISSING or FAILED
}
```

## How to Add a New Probe

1. Register in `atlas_memory_sources`:
   ```sql
   INSERT INTO atlas_memory_sources (source, owner_module, description, required_at_phases)
   VALUES ('my_probe', 'supabase/functions/my-probe', 'Description',
           ARRAY['DECISION_EMIT','ENTRY_FILLED','EXIT_CLOSED']);
   ```

2. Add the source to `ALL_SOURCES` in `_shared/memory_fanout.ts`

3. Wire data collection at choke points in paper-engine / paper-engine-tick

4. Add to `scripts/memory_guard.ts` enforcement

## Enforcement

Run `npx tsx scripts/memory_guard.ts` to check for violations.

Any write to `atlas_memory_events` from non-approved modules will fail with:

> **THIS BREAKS THE MEMORY, PLEASE ADJUST**

The guard also enforces:
- Fan-out usage at choke points (memoryFanOut, not memoryWrite directly)
- Source participation contract (all 10 sources must report)

## Audit Queries

### Coverage check
```sql
SELECT phase, source, payload->>'status' AS status, count(*)
FROM atlas_memory_events
WHERE ts > now() - interval '6 hours'
GROUP BY phase, source, payload->>'status'
ORDER BY phase, source;
```

### Per-trade completeness
```sql
SELECT source, payload->>'status' AS status, payload->>'reason' AS reason
FROM atlas_memory_events
WHERE position_id = :pid AND phase = 'ENTRY_FILLED'
ORDER BY source;
```

All 10 registered sources must appear for each phase.

## Why This Matters

- **Signal absent vs signal negative vs signal unavailable** — the Brain can now distinguish
- **True cross-channel learning** — no more guessing what was missing
- **Accurate attribution** — every channel's contribution (or absence) is recorded
- **Safe addition of new probes** — register, wire, enforce
