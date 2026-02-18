# ATLAS Canonical Brain Pillar

## Contract

**The Brain is the only place learning happens.**

All belief updates — scenario reputation, strategy reputation, confidence calibration,
indicator reliability, graduation, risk tuning — must flow through the Brain.

## The Three Pillars

| Pillar | Purpose | Guard |
|--------|---------|-------|
| **Backbone** | Perception — canonical market truth | `THIS WILL BREAK YOUR BACKBONE, PLEASE ADJUST` |
| **Memory** | Experience — canonical lived events | `THIS BREAKS THE MEMORY, PLEASE ADJUST` |
| **Brain** | Learning & adaptation — canonical belief updates | `THIS BYPASSES THE BRAIN. LEARNING MUST FLOW FROM MEMORY.` |

## The Canonical Loop

```
Market Backbone (prices/orderbook)
        ↓
Decision Engine (consults Brain)
        ↓
Execution Engine
        ↓
Memory (append-only experience)
        ↓
Brain (learning from Memory)
        ↓
Policy / Belief Updates
        ↓
Decision Engine
```

No shortcuts. No backchannels. No silent feedback loops.

## Brain Rules

1. **Memory is the ONLY input to learning**
   - The Brain reads ONLY from `atlas_memory_events`
   - If it didn't pass through Memory, it does not exist to learning

2. **The Brain does NOT act — it advises**
   - ❌ No trade placement
   - ❌ No price fetching
   - ❌ No execution
   - ❌ No Memory mutation
   - ✅ Updates belief state
   - ✅ Updates policy parameters
   - ✅ Updates confidence calibration
   - ✅ Updates reputational weights

3. **All updates are logged**
   - Every belief change is recorded in `atlas_brain_log`
   - Each log entry links back to the `memory_event_ids` that drove the update
   - Full provenance chain: Memory event → Brain log → Belief state

## Brain Output Tables

| Table | Updated By | What It Tracks |
|-------|-----------|----------------|
| `scenario_reputation` | brain-update | Bayesian + EMA scenario win-rates |
| `strategy_reputation` | brain-update | Blueprint reputation EMA blending |
| `indicator_reliability` | brain-update | Per-indicator directional accuracy |
| `graduation_status` | brain-update | Maturity level progression |
| `atlas_brain_log` | brain-update | Audit trail of all updates |

## Brain Sources Registry

Managed in `atlas_brain_sources` table. Current sources:

| Source | Owner Function | Target Tables |
|--------|---------------|---------------|
| `scenario_reputation` | brain-update | scenario_reputation |
| `strategy_reputation` | brain-update | strategy_reputation |
| `confidence_calibration` | confidence-recalc | paper_decisions, confidence_events |
| `indicator_reliability` | brain-update | indicator_reliability |
| `graduation` | brain-update | graduation_status |
| `risk_tuning` | brain-update | paper_policy |

## How to Add a New Learning Module

1. Register in `atlas_brain_sources`:
   ```sql
   INSERT INTO atlas_brain_sources (source, owner_function, target_tables, description)
   VALUES ('my_learner', 'brain-update', ARRAY['my_target_table'], 'Description');
   ```

2. Add learning logic to `brain-update/index.ts` (centralized)

3. Use `brainLog()` helper to record every update:
   ```typescript
   import { brainLog, newBrainTraceId } from "../_shared/brain.ts";
   await brainLog({
     trace_id: newBrainTraceId(),
     target_table: "my_target_table",
     target_key: "some_key",
     update_type: "BAYESIAN_UPDATE",
     prior_state: { ... },
     posterior_state: { ... },
     memory_event_ids: ["uuid-of-memory-event"],
     source_function: "brain-update",
   }, sb);
   ```

4. Add your module to `scripts/brain_guard.ts` whitelist if needed.

## Enforcement

Run `npx tsx scripts/brain_guard.ts` to check for violations.

Any write to brain output tables from non-approved modules will fail with:

> **THIS BYPASSES THE BRAIN. LEARNING MUST FLOW FROM MEMORY.**

## Audit Queries

Recent brain activity:
```sql
SELECT target_table, update_type, count(*)
FROM atlas_brain_log
WHERE ts > now() - interval '6 hours'
GROUP BY target_table, update_type
ORDER BY 1,2;
```

Provenance for a specific position:
```sql
SELECT bl.ts, bl.target_table, bl.target_key, bl.update_type,
       bl.prior_state, bl.posterior_state, bl.notes
FROM atlas_brain_log bl
WHERE bl.memory_event_ids && ARRAY(
  SELECT id FROM atlas_memory_events WHERE position_id = :pid
)
ORDER BY bl.ts ASC;
```
