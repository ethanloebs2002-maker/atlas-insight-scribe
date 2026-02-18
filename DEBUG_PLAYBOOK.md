# ATLAS DEBUG PLAYBOOK (NO VIBES, ONLY PROOFS)

> Goal: Find the real root cause fast, without getting tricked by "code looks right."

---

## RULE 0 — Never declare "code is correct" until all 3 proofs are true

You need all three:

1. **DB proof** — the event/state exists or doesn't
2. **Path proof** — the code path can be forced
3. **Deploy proof** — the running artifact contains the code you think it does

If any one is missing, you're guessing.

---

## 1) TRIAGE: WHICH PILLAR IS BROKEN?

Pick ONE symptom and classify it:

### A) Engine → Memory broken
Position state changes (OPEN/CLOSED) exist, but `atlas_memory_events` missing.

### B) Memory → Brain broken
Memory events exist (ENTRY_FILLED / EXIT_CLOSED / DECISION_EMIT), but no brain outputs (brain_log / reputation updates), or `no_consensus`.

### C) Engine itself broken
No fills/closes happening (stuck PENDING_ENTRY / OPEN) despite prices moving.

**Don't jump to fixes until you run the minimal probes below.**

---

## 2) MINIMAL QUERIES (COPY/PASTE)

### 2.1 Coverage check for a single position
```sql
select phase, source, count(*) as n, min(ts) as first_ts, max(ts) as last_ts
from atlas_memory_events
where position_id = '<POSITION_ID>'
group by 1,2
order by phase, source;
```

### 2.2 Coverage check for decision bundle (DECISION_EMIT lives on decision_id)
```sql
select phase, source, count(*) as n, min(ts) as first_ts, max(ts) as last_ts
from atlas_memory_events
where decision_id = (select decision_id from paper_positions where id = '<POSITION_ID>')
group by 1,2
order by phase, source;
```

### 2.3 "Is Brain caught up?" (cursor vs pending EXIT_CLOSED)
```sql
select
  (select last_ts from atlas_brain_cursor where id=1) as cursor,
  count(*) as pending
from atlas_memory_events
where phase='EXIT_CLOSED'
  and ts > (select last_ts from atlas_brain_cursor where id=1)
  and cohort_id like 'brain_online_%';
```

---

## 3) THE THREE PROOFS CHECKLIST (DO THIS IN ORDER)

### PROOF 1 — DB TRUTH (What actually happened?)

```sql
select id, status, decision_id, cohort_id, opened_at, closed_at, updated_at, meta
from paper_positions
where id = '<POSITION_ID>';
```

If the DB doesn't show the state change, stop. Your issue is upstream.

### PROOF 2 — PATH REACHABILITY (Can we force the code path?)

Force an ENTRY fill (test order):
- Insert a ridiculous limit and `eligible_fill_at` in the past on a known position_id.
- Then trigger tick.
- Then verify ENTRY_FILLED exists.

Required proof query:
```sql
select phase, source, count(*) as n, max(ts) as last_ts
from atlas_memory_events
where phase='ENTRY_FILLED'
  and position_id = '<POSITION_ID>'
group by 1,2
order by source;
```

If you can't force it, you don't know if the code works.

### PROOF 3 — DEPLOYED ARTIFACT MATCH (No more "repo says so")

Every time you change behavior, require:
- a `[DEPLOY] <function>:<tag>` marker log
- a `[PROBE] entering <path>` log at the critical branch

If deploy marker exists but probe never appears after forcing the event:
- either the path isn't reached
- or the deployed code doesn't contain the probes
- or the invocation is hitting a different function/environment

**Never proceed until you know which.**

---

## 4) COMMON FAILURE MODES (DON'T GET BAITED)

### 4.1 Artifact drift (repo ≠ deployed)
**Symptom:** Code "looks wired," but logs show no probes.
**Fix:** redeploy + deploy marker + force test again.

### 4.2 Trigger gap (no fills/closes yet)
**Symptom:** no probes, but also no lifecycle events.
**Fix:** force a test fill/close.

### 4.3 Hidden filters (the silent killers)
Always check these when something "should have happened":
- `eligible_fill_at <= candle.ts` (timeframe alignment)
- cohort gates (`brain_online_%` only)
- cursor gating (events behind cursor won't be seen)
- source gating (`source='execution'` assumptions)
- decision bundle join keys (DECISION_EMIT requires `decision_id` join)

### 4.4 Concurrency / double-learning risk
Cron is not safe unless BOTH exist:
- cursor idempotency (`maxHandledTs` + don't advance on missing consensus)
- lease lock (acquire/renew/release RPC) so overlapping runs can't double-write

You already have this — just keep it as a non-negotiable invariant.

---

## 5) CANARY HEALTHCHECKS

### 5.1 CLOSED positions must have EXIT_CLOSED within X
```sql
select p.id, p.updated_at
from paper_positions p
left join atlas_memory_events e
  on e.position_id=p.id and e.phase='EXIT_CLOSED' and e.source='execution'
where p.status='CLOSED'
  and p.cohort_id like 'brain_online_%'
  and p.updated_at > now() - interval '24 hours'
  and e.id is null
order by p.updated_at desc
limit 50;
```

### 5.2 EXIT_CLOSED must be learn-consumable (DECISION_EMIT consensus exists)
```sql
with closed as (
  select distinct position_id, decision_id
  from atlas_memory_events
  where phase='EXIT_CLOSED'
    and ts > now() - interval '24 hours'
    and cohort_id like 'brain_online_%'
)
select
  count(*) as closed_positions,
  count(*) filter (where exists (
    select 1 from atlas_memory_events d
    where d.decision_id = closed.decision_id
      and d.phase='DECISION_EMIT'
      and d.source='consensus'
  )) as with_consensus
from closed;
```

---

## 6) LABEL TEST TRADES

When you force anything, tag it:
```sql
update paper_positions
set meta = coalesce(meta,'{}'::jsonb)
  || jsonb_build_object('is_test_trade', true, 'note','forced pipeline test'),
    updated_at = now()
where id = '<POSITION_ID>';
```

---

## OUTPUT FORMAT (Required)

When reporting back, answer in this exact structure:

1. **Classification:** Engine→Memory / Memory→Brain / Engine
2. **DB Proof:** (paste query result)
3. **Path Proof:** (forced test? yes/no + result)
4. **Deploy Proof:** (deploy marker + probe logs present? yes/no)
5. **Root cause:** single sentence
6. **Fix:** single diff or SQL statement
7. **Verification:** the exact query that proves it's fixed

No extra narrative.
