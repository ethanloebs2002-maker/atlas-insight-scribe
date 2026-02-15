import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const FAVORABLE_THRESHOLD = 65;
const MAX_PATTERNS_PER_CONTEXT = 10;
const MIN_PATTERN_DECISIONS = 300;
const MIN_PATTERN_UPLIFT = 0.03;

// GPR Publication Gates
const M_ASSETS_MIN = 5;
const GPR_MIN_DECISIONS = 300;
const GPR_MIN_TRADES = 100;
const DIRACC_UPLIFT_MIN = 0.04;
const EV_UPLIFT_MIN = 0.12;
const STABILITY_MIN = 0.60;

const INDICATOR_NAMES = [
  "EMA_20", "EMA_50", "RSI_14", "MACD", "ADX", "ATR",
  "BB", "VWAP", "OBV", "RVOL", "FibCluster", "MTF_Similarity", "WhaleBias",
];

// ─── CANONICALIZATION ─────────────────────────────────────────────
function canonicalizeConditions(conditions: any[]): any[] {
  return conditions
    .map(c => ({
      field: c.field,
      indicator: c.indicator,
      op: c.op,
      value: binThreshold(c.value),
    }))
    .sort((a, b) => {
      const k = `${a.indicator}.${a.field}`;
      const k2 = `${b.indicator}.${b.field}`;
      return k.localeCompare(k2);
    });
}

function binThreshold(v: number): number {
  if (v >= 90) return 90;
  if (v >= 75) return 75;
  if (v >= 65) return 65;
  if (v >= 60) return 60;
  if (v >= 50) return 50;
  if (v > 0) return 25;
  return 0;
}

function classifyTimeframe(tf: string): string {
  if (["1m", "5m", "15m"].includes(tf)) return "intraday";
  if (["1h", "4h"].includes(tf)) return "swing";
  return "HTF";
}

function buildContextTags(regime: string, tf: string): Record<string, string> {
  return {
    regime_label: regime || "Unknown",
    timeframe_class: classifyTimeframe(tf),
    vol_band: "mid",
    liquidity_tier: "med",
  };
}

function computeSignatureHash(canonical: any[], tags: Record<string, string>): string {
  const payload = JSON.stringify({ c: canonical, t: tags });
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const chr = payload.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return "sig_" + Math.abs(hash).toString(36);
}

function buildDescription(canonical: any[]): string {
  return canonical
    .map(c => `${c.indicator}.${c.field} ${c.op} ${c.value}`)
    .join(" AND ");
}

// ─── RECORD SNAPSHOT ──────────────────────────────────────────────
async function recordSnapshot(body: any) {
  const {
    decision_id, asset_id, timeframe_primary, timeframe_confirm,
    regime_label, ts, indicators_json, role_scores_json,
    integrity_json, engine_outputs_json,
  } = body;

  const { data, error } = await supabase.from("indicator_snapshots").insert({
    decision_id, asset_id,
    timeframe_primary: timeframe_primary || "4h",
    timeframe_confirm: timeframe_confirm || null,
    regime_label: regime_label || "Unknown",
    ts: ts || new Date().toISOString(),
    indicators_json: indicators_json || {},
    role_scores_json: role_scores_json || {},
    integrity_json: integrity_json || {},
    engine_outputs_json: engine_outputs_json || {},
  }).select().single();

  if (error) throw error;
  return data;
}

// ─── LINK OUTCOMES ────────────────────────────────────────────────
async function linkOutcomes(asset_id?: string) {
  let query = supabase
    .from("paper_decisions")
    .select("id, asset_id, direction_pred, realized_dir, correct, realized_move_pct, horizon")
    .not("evaluated_at", "is", null);
  if (asset_id) query = query.eq("asset_id", asset_id);
  const { data: decisions, error } = await query.limit(500);
  if (error) throw error;
  if (!decisions?.length) return { linked: 0 };

  const decisionIds = decisions.map(d => d.id);
  const { data: existing } = await supabase
    .from("indicator_outcome_links").select("decision_id").in("decision_id", decisionIds);
  const existingSet = new Set((existing || []).map(e => e.decision_id));
  const toLink = decisions.filter(d => !existingSet.has(d.id));
  if (!toLink.length) return { linked: 0, message: "All evaluated decisions already linked" };

  let linked = 0;
  for (const d of toLink) {
    const { data: trade } = await supabase
      .from("paper_trades")
      .select("id, return_r, mae_r, mfe_r, outcome_label, status")
      .eq("decision_id", d.id).eq("status", "CLOSED").limit(1).maybeSingle();

    const { error: insertErr } = await supabase.from("indicator_outcome_links").insert({
      decision_id: d.id, trade_id: trade?.id || null,
      direction_correct: d.correct ? 1 : 0, return_r: trade?.return_r ?? null,
      mae_r: trade?.mae_r ?? null, mfe_r: trade?.mfe_r ?? null,
      outcome_label: trade?.outcome_label ?? null, horizon_realized_dir: d.realized_dir,
    });
    if (!insertErr) linked++;
  }
  return { linked };
}

// ─── COMPUTE INDICATOR RELIABILITY ────────────────────────────────
async function computeReliability(asset_id: string, timeframe = "4h") {
  const { data: snapshots, error: snapErr } = await supabase
    .from("indicator_snapshots")
    .select("id, decision_id, regime_label, indicators_json")
    .eq("asset_id", asset_id).eq("timeframe_primary", timeframe).limit(1000);
  if (snapErr) throw snapErr;
  if (!snapshots?.length) return { computed: 0 };

  const decisionIds = snapshots.map(s => s.decision_id);
  const { data: outcomes } = await supabase
    .from("indicator_outcome_links").select("decision_id, direction_correct, return_r").in("decision_id", decisionIds);
  if (!outcomes?.length) return { computed: 0, message: "No outcomes linked" };
  const outcomeMap = new Map(outcomes.map(o => [o.decision_id, o]));

  const regimeGroups: Record<string, typeof snapshots> = {};
  for (const s of snapshots) {
    const key = s.regime_label || "Unknown";
    if (!regimeGroups[key]) regimeGroups[key] = [];
    regimeGroups[key].push(s);
  }

  let computed = 0;
  for (const [regime, group] of Object.entries(regimeGroups)) {
    const groupOutcomes = group.map(s => outcomeMap.get(s.decision_id)).filter(Boolean) as typeof outcomes;
    if (groupOutcomes.length < 10) continue;
    const baselineDirAcc = groupOutcomes.filter(o => o.direction_correct === 1).length / groupOutcomes.length;
    const tradesWithR = groupOutcomes.filter(o => o.return_r !== null);
    const baselineEv = tradesWithR.length > 0 ? tradesWithR.reduce((s, o) => s + Number(o.return_r), 0) / tradesWithR.length : 0;

    for (const indicatorName of INDICATOR_NAMES) {
      const favorable: typeof outcomes = [];
      const unfavorable: typeof outcomes = [];
      for (const s of group) {
        const outcome = outcomeMap.get(s.decision_id);
        if (!outcome) continue;
        const ind = (s.indicators_json as any)?.[indicatorName];
        if (!ind || ind.score_0_100 === undefined) continue;
        if (ind.score_0_100 >= FAVORABLE_THRESHOLD) favorable.push(outcome);
        else unfavorable.push(outcome);
      }
      const sampleN = favorable.length + unfavorable.length;
      if (sampleN < 10) continue;

      const favDirAcc = favorable.length > 0 ? favorable.filter(o => o.direction_correct === 1).length / favorable.length : baselineDirAcc;
      const diraccLift = favDirAcc - baselineDirAcc;
      const favTradesR = favorable.filter(o => o.return_r !== null);
      const favEv = favTradesR.length > 0 ? favTradesR.reduce((s, o) => s + Number(o.return_r), 0) / favTradesR.length : baselineEv;
      const evLift = favEv - baselineEv;
      const falsePositives = favorable.filter(o => o.direction_correct === 0).length;
      const fpRate = favorable.length > 0 ? falsePositives / favorable.length : 0;

      await supabase.from("indicator_reliability").upsert({
        asset_id, timeframe, regime_label: regime, indicator_name: indicatorName,
        sample_n: sampleN, diracc_lift: diraccLift, ev_lift: evLift,
        false_positive_rate: fpRate, last_updated_ts: new Date().toISOString(),
      }, { onConflict: "asset_id,timeframe,regime_label,indicator_name" });
      computed++;
    }
  }
  return { computed };
}

// ─── PATTERN MINER ────────────────────────────────────────────────
async function minePatterns(asset_id: string, timeframe = "4h") {
  const { data: snapshots } = await supabase
    .from("indicator_snapshots")
    .select("id, decision_id, regime_label, indicators_json, integrity_json, role_scores_json")
    .eq("asset_id", asset_id).eq("timeframe_primary", timeframe).limit(1000);
  if (!snapshots?.length) return { patterns: 0 };

  const decisionIds = snapshots.map(s => s.decision_id);
  const { data: outcomes } = await supabase
    .from("indicator_outcome_links").select("decision_id, direction_correct, return_r, trade_id").in("decision_id", decisionIds);
  if (!outcomes?.length) return { patterns: 0 };
  const outcomeMap = new Map(outcomes.map(o => [o.decision_id, o]));

  const allOutcomes = snapshots.map(s => outcomeMap.get(s.decision_id)).filter(Boolean) as typeof outcomes;
  if (allOutcomes.length < MIN_PATTERN_DECISIONS) {
    return { patterns: 0, message: `Need ${MIN_PATTERN_DECISIONS} decisions, have ${allOutcomes.length}` };
  }

  const baselineDirAcc = allOutcomes.filter(o => o.direction_correct === 1).length / allOutcomes.length;
  const baselineTradesR = allOutcomes.filter(o => o.return_r !== null);
  const baselineEv = baselineTradesR.length > 0 ? baselineTradesR.reduce((s, o) => s + Number(o.return_r), 0) / baselineTradesR.length : 0;

  const candidatePatterns: Array<{ conditions: any[]; matching: typeof outcomes; regime: string }> = [];
  const regimes = [...new Set(snapshots.map(s => s.regime_label || "Unknown"))];

  for (const regime of regimes) {
    const regimeSnapshots = snapshots.filter(s => (s.regime_label || "Unknown") === regime);
    for (const indName of INDICATOR_NAMES) {
      // High score pattern
      const highScoreMatching: typeof outcomes = [];
      for (const s of regimeSnapshots) {
        const ind = (s.indicators_json as any)?.[indName];
        if (!ind || ind.score_0_100 === undefined) continue;
        if (ind.score_0_100 >= 75) { const o = outcomeMap.get(s.decision_id); if (o) highScoreMatching.push(o); }
      }
      if (highScoreMatching.length >= 30) {
        candidatePatterns.push({ conditions: [{ indicator: indName, field: "score_0_100", op: ">=", value: 75 }], matching: highScoreMatching, regime });
      }
      // Positive slope pattern
      const slopeMatching: typeof outcomes = [];
      for (const s of regimeSnapshots) {
        const ind = (s.indicators_json as any)?.[indName];
        if (!ind || ind.slope === undefined) continue;
        if (ind.slope > 0 && ind.score_0_100 >= 60) { const o = outcomeMap.get(s.decision_id); if (o) slopeMatching.push(o); }
      }
      if (slopeMatching.length >= 30) {
        candidatePatterns.push({
          conditions: [
            { indicator: indName, field: "slope", op: ">", value: 0 },
            { indicator: indName, field: "score_0_100", op: ">=", value: 60 },
          ], matching: slopeMatching, regime,
        });
      }
    }
    // Two-indicator combo
    const { data: reliability } = await supabase
      .from("indicator_reliability").select("indicator_name, diracc_lift")
      .eq("asset_id", asset_id).eq("timeframe", timeframe).eq("regime_label", regime)
      .order("diracc_lift", { ascending: false }).limit(3);
    if (reliability && reliability.length >= 2) {
      const [ind1, ind2] = reliability;
      const comboMatching: typeof outcomes = [];
      for (const s of regimeSnapshots) {
        const indicators = s.indicators_json as any;
        const i1 = indicators?.[ind1.indicator_name]; const i2 = indicators?.[ind2.indicator_name];
        if (!i1 || !i2) continue;
        if ((i1.score_0_100 ?? 0) >= 65 && (i2.score_0_100 ?? 0) >= 65) {
          const o = outcomeMap.get(s.decision_id); if (o) comboMatching.push(o);
        }
      }
      if (comboMatching.length >= 30) {
        candidatePatterns.push({
          conditions: [
            { indicator: ind1.indicator_name, field: "score_0_100", op: ">=", value: 65 },
            { indicator: ind2.indicator_name, field: "score_0_100", op: ">=", value: 65 },
          ], matching: comboMatching, regime,
        });
      }
    }
  }

  let stored = 0;
  const patternsByRegime: Record<string, Array<{ uplift: number; conditions: any[] }>> = {};

  for (const candidate of candidatePatterns) {
    const dirAcc = candidate.matching.filter(o => o.direction_correct === 1).length / candidate.matching.length;
    const diraccUplift = dirAcc - baselineDirAcc;
    const tradesR = candidate.matching.filter(o => o.return_r !== null);
    const ev = tradesR.length > 0 ? tradesR.reduce((s, o) => s + Number(o.return_r), 0) / tradesR.length : 0;
    const evUplift = ev - baselineEv;
    if (diraccUplift < MIN_PATTERN_UPLIFT && evUplift < MIN_PATTERN_UPLIFT) continue;

    const key = candidate.regime;
    if (!patternsByRegime[key]) patternsByRegime[key] = [];
    if (patternsByRegime[key].length >= MAX_PATTERNS_PER_CONTEXT) continue;

    const half = Math.floor(candidate.matching.length / 2);
    const firstHalf = candidate.matching.slice(0, half);
    const secondHalf = candidate.matching.slice(half);
    const firstDirAcc = firstHalf.filter(o => o.direction_correct === 1).length / firstHalf.length;
    const secondDirAcc = secondHalf.filter(o => o.direction_correct === 1).length / secondHalf.length;
    const stability = 1 - Math.abs(firstDirAcc - secondDirAcc);
    const confidenceTier = diraccUplift > 0.08 && stability > 0.85 ? "high" : diraccUplift > 0.05 && stability > 0.7 ? "medium" : "low";
    const nTrades = candidate.matching.filter(o => o.return_r !== null).length;

    await supabase.from("indicator_patterns").upsert({
      asset_id, timeframe, regime_label: candidate.regime,
      conditions_json: candidate.conditions, support_n_decisions: candidate.matching.length,
      support_n_trades: nTrades, diracc_uplift: diraccUplift, ev_uplift: evUplift,
      stability_score: stability, confidence_tier: confidenceTier,
      is_active: true, last_validated_ts: new Date().toISOString(),
    }, { onConflict: "asset_id,timeframe,regime_label,conditions_json" });

    patternsByRegime[key].push({ uplift: diraccUplift, conditions: candidate.conditions });
    stored++;
  }

  // After mining, canonicalize and register signatures for GPR
  await canonicalizeAndRegister(asset_id, timeframe);

  return { patterns: stored };
}

// ─── GPR: CANONICALIZE + REGISTER ─────────────────────────────────
async function canonicalizeAndRegister(asset_id: string, timeframe = "4h") {
  const { data: patterns } = await supabase
    .from("indicator_patterns")
    .select("id, conditions_json, regime_label, support_n_decisions, support_n_trades, diracc_uplift, ev_uplift, stability_score, is_active")
    .eq("asset_id", asset_id).eq("timeframe", timeframe).eq("is_active", true);

  if (!patterns?.length) return { registered: 0 };

  let registered = 0;
  for (const p of patterns) {
    const canonical = canonicalizeConditions(p.conditions_json as any[]);
    const tags = buildContextTags(p.regime_label, timeframe);
    const sigHash = computeSignatureHash(canonical, tags);

    // Upsert signature
    await supabase.from("pattern_signatures").upsert({
      pattern_id: p.id, signature_hash: sigHash,
      canonical_conditions_json: canonical, context_tags_json: tags,
    }, { onConflict: "signature_hash,pattern_id" });

    // Ensure global_patterns row exists
    const { data: existing } = await supabase.from("global_patterns").select("signature_hash").eq("signature_hash", sigHash).maybeSingle();
    if (!existing) {
      await supabase.from("global_patterns").insert({
        signature_hash: sigHash, description_snippet: buildDescription(canonical),
        canonical_conditions_json: canonical, context_tags_json: tags,
        publish_status: "LOCAL_ONLY",
      });
    }

    // Upsert evidence
    const contextBucketId = `${tags.regime_label}:${tags.timeframe_class}:${tags.vol_band}:${tags.liquidity_tier}`;
    await supabase.from("global_pattern_evidence").upsert({
      signature_hash: sigHash, asset_id, timeframe_class: tags.timeframe_class,
      context_bucket_id: contextBucketId,
      support_n_decisions: p.support_n_decisions, support_n_trades: p.support_n_trades,
      diracc_uplift: p.diracc_uplift, ev_uplift: p.ev_uplift,
      stability_score: p.stability_score, last_validated_ts: new Date().toISOString(),
    }, { onConflict: "signature_hash,asset_id,context_bucket_id" });

    registered++;
  }

  return { registered };
}

// ─── GPR: VALIDATE & PUBLISH ──────────────────────────────────────
async function validateAndPublish() {
  const { data: allSigs } = await supabase.from("global_patterns").select("signature_hash, publish_status");
  if (!allSigs?.length) return { validated: 0, published: 0, deprecated: 0 };

  let validated = 0, published = 0, deprecated = 0;

  for (const gp of allSigs) {
    const { data: evidence } = await supabase
      .from("global_pattern_evidence").select("*").eq("signature_hash", gp.signature_hash);

    if (!evidence?.length) continue;
    validated++;

    // GATE A: Multi-asset support
    const qualifiedAssets = evidence.filter(
      e => e.support_n_decisions >= GPR_MIN_DECISIONS && e.support_n_trades >= GPR_MIN_TRADES
    );
    const assetsTestedN = evidence.length;
    const assetsSuccessN = qualifiedAssets.length;
    const gateA = assetsSuccessN >= M_ASSETS_MIN;

    // GATE B: Directional consistency (no sign flips)
    const positiveDir = qualifiedAssets.filter(e => e.diracc_uplift > 0).length;
    const negativeDir = qualifiedAssets.filter(e => e.diracc_uplift < 0).length;
    const gateB = qualifiedAssets.length > 0 && (positiveDir === 0 || negativeDir === 0);

    // GATE D: Uplift threshold
    const meanDiraccUplift = qualifiedAssets.length > 0
      ? qualifiedAssets.reduce((s, e) => s + Number(e.diracc_uplift), 0) / qualifiedAssets.length : 0;
    const meanEvUplift = qualifiedAssets.length > 0
      ? qualifiedAssets.reduce((s, e) => s + Number(e.ev_uplift), 0) / qualifiedAssets.length : 0;
    const gateD = meanDiraccUplift >= DIRACC_UPLIFT_MIN || meanEvUplift >= EV_UPLIFT_MIN;

    // GATE E: Stability
    const meanStability = qualifiedAssets.length > 0
      ? qualifiedAssets.reduce((s, e) => s + Number(e.stability_score), 0) / qualifiedAssets.length : 0;
    const gateE = meanStability >= STABILITY_MIN;

    // Portability score
    const portability = assetsTestedN > 0
      ? (assetsSuccessN / assetsTestedN) * meanStability * Math.min(1, Math.log(assetsTestedN + 1) / Math.log(M_ASSETS_MIN))
      : 0;

    // Contexts supported
    const contextBuckets = [...new Set(evidence.map(e => e.context_bucket_id))];

    let newStatus = gp.publish_status;
    if (gateA && gateB && gateD && gateE) {
      newStatus = "PUBLISHED";
      published++;
    } else if (assetsSuccessN >= 2) {
      newStatus = gp.publish_status === "PUBLISHED" ? "DEPRECATED" : "CANDIDATE";
      if (gp.publish_status === "PUBLISHED") deprecated++;
    } else {
      if (gp.publish_status === "PUBLISHED") { newStatus = "DEPRECATED"; deprecated++; }
      else newStatus = "LOCAL_ONLY";
    }

    await supabase.from("global_patterns").update({
      assets_tested_n: assetsTestedN, assets_success_n: assetsSuccessN,
      mean_diracc_uplift: meanDiraccUplift, mean_ev_uplift: meanEvUplift,
      portability_score: portability, stability_score: meanStability,
      contexts_supported_json: contextBuckets,
      publish_status: newStatus, last_validated_ts: new Date().toISOString(),
      first_published_ts: newStatus === "PUBLISHED" && !gp.publish_status?.includes("PUBLISHED") ? new Date().toISOString() : undefined,
      updated_at: new Date().toISOString(),
    }).eq("signature_hash", gp.signature_hash);
  }

  return { validated, published, deprecated };
}

// ─── GPR: FETCH REGISTRY ──────────────────────────────────────────
async function fetchGlobalPatterns(filters: Record<string, string>) {
  let query = supabase.from("global_patterns").select("*").order("mean_diracc_uplift", { ascending: false });
  if (filters.publish_status) query = query.eq("publish_status", filters.publish_status);
  if (filters.timeframe_class) query = query.contains("context_tags_json", { timeframe_class: filters.timeframe_class });
  if (filters.regime_label) query = query.contains("context_tags_json", { regime_label: filters.regime_label });
  const { data, error } = await query.limit(200);
  if (error) throw error;
  return data || [];
}

async function fetchPatternEvidence(signature_hash: string) {
  const { data, error } = await supabase.from("global_pattern_evidence").select("*").eq("signature_hash", signature_hash);
  if (error) throw error;
  return data || [];
}

async function fetchAuditLog(signature_hash: string) {
  const { data, error } = await supabase.from("pattern_audit_log").select("*").eq("signature_hash", signature_hash).order("created_ts", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function addAuditNote(body: any) {
  const { signature_hash, reviewer_note, action_type } = body;
  const { data, error } = await supabase.from("pattern_audit_log").insert({
    signature_hash, reviewer_note: reviewer_note || "", action_type: action_type || "NOTE_ONLY",
  }).select().single();
  if (error) throw error;
  return data;
}

// ─── FETCH SNAPSHOT FOR TRADE ─────────────────────────────────────
async function fetchTradeSnapshot(decisionId: string) {
  const { data: snapshot } = await supabase.from("indicator_snapshots").select("*").eq("decision_id", decisionId).maybeSingle();
  const { data: outcome } = await supabase.from("indicator_outcome_links").select("*").eq("decision_id", decisionId).maybeSingle();
  if (snapshot) {
    const { data: reliability } = await supabase.from("indicator_reliability").select("*")
      .eq("asset_id", snapshot.asset_id).eq("timeframe", snapshot.timeframe_primary).eq("regime_label", snapshot.regime_label);
    return { snapshot, outcome, reliability: reliability || [] };
  }
  return { snapshot: null, outcome, reliability: [] };
}

async function fetchReliability(asset_id?: string, timeframe = "4h") {
  let query = supabase.from("indicator_reliability").select("*").order("diracc_lift", { ascending: false });
  if (asset_id) query = query.eq("asset_id", asset_id);
  query = query.eq("timeframe", timeframe);
  const { data, error } = await query.limit(200);
  if (error) throw error;
  return data || [];
}

async function fetchPatterns(asset_id?: string, timeframe = "4h", activeOnly = true) {
  let query = supabase.from("indicator_patterns").select("*").order("diracc_uplift", { ascending: false });
  if (asset_id) query = query.eq("asset_id", asset_id);
  query = query.eq("timeframe", timeframe);
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query.limit(100);
  if (error) throw error;
  return data || [];
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "reliability";
    const asset = url.searchParams.get("asset");
    const timeframe = url.searchParams.get("timeframe") || "4h";

    const json = (d: any) => new Response(JSON.stringify({ data: d }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    switch (action) {
      case "record-snapshot": return json(await recordSnapshot(await req.json()));
      case "link-outcomes": return json(await linkOutcomes(asset || undefined));
      case "compute-reliability": {
        if (!asset) throw new Error("asset parameter required");
        return json(await computeReliability(asset, timeframe));
      }
      case "mine-patterns": {
        if (!asset) throw new Error("asset parameter required");
        return json(await minePatterns(asset, timeframe));
      }
      case "trade-snapshot": {
        const did = url.searchParams.get("decision_id");
        if (!did) throw new Error("decision_id parameter required");
        return json(await fetchTradeSnapshot(did));
      }
      case "reliability": return json(await fetchReliability(asset || undefined, timeframe));
      case "patterns": {
        const activeOnly = url.searchParams.get("active") !== "false";
        return json(await fetchPatterns(asset || undefined, timeframe, activeOnly));
      }
      // GPR actions
      case "gpr-validate": return json(await validateAndPublish());
      case "gpr-registry": return json(await fetchGlobalPatterns({
        publish_status: url.searchParams.get("publish_status") || "",
        timeframe_class: url.searchParams.get("timeframe_class") || "",
        regime_label: url.searchParams.get("regime_label") || "",
      }));
      case "gpr-evidence": {
        const sig = url.searchParams.get("signature_hash");
        if (!sig) throw new Error("signature_hash required");
        return json(await fetchPatternEvidence(sig));
      }
      case "gpr-audit-log": {
        const sig = url.searchParams.get("signature_hash");
        if (!sig) throw new Error("signature_hash required");
        return json(await fetchAuditLog(sig));
      }
      case "gpr-add-note": return json(await addAuditNote(await req.json()));
      default:
        return new Response(JSON.stringify({ error: "Unknown action: " + action }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (err) {
    console.error("Indicator engine error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
