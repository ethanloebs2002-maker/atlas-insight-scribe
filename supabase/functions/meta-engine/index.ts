import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const ML_LABELS = ["Reactive", "Uncertainty-Aware", "Epistemically-Aware", "Self-Evaluative", "Counterfactual-Aware", "Self-Reframing"];
const AL_LABELS = ["Observe", "Notify", "Light-Regulation", "Learning-Regulation"];
const W_UP = 3;
const W_DOWN = 1;
const COOLDOWN_DAYS = 7;

// ─── EPISTEMIC ATTRIBUTION ───

async function computeEpistemicAttribution(assetId: string, tf: string) {
  // Gather signals to diagnose WHY uncertainty exists
  const [{ data: decisions }, { data: fingerprints }, { data: anomalies }] = await Promise.all([
    supabase.from("paper_decisions").select("*").eq("asset_id", assetId).eq("timeframe", tf).order("ts", { ascending: false }).limit(50),
    supabase.from("asset_fingerprints").select("*").eq("asset_id", assetId).eq("timeframe", tf).limit(1),
    supabase.from("anomaly_events").select("*").eq("asset_id", assetId).eq("resolved", false).limit(10),
  ]);

  const n = decisions?.length || 0;
  const hasFingerprint = fingerprints && fingerprints.length > 0;
  const activeAnomalies = anomalies?.length || 0;

  // Data insufficiency: few decisions, no fingerprint
  const dataInsuff = Math.min(1, Math.max(0, (n < 20 ? 0.6 : n < 50 ? 0.3 : 0.05) + (!hasFingerprint ? 0.2 : 0)));

  // Data integrity failure: active anomalies
  const integrityFail = Math.min(1, activeAnomalies * 0.15);

  // Model miscalibration: check recent accuracy
  const evaluated = (decisions || []).filter(d => d.correct !== null);
  const accuracy = evaluated.length > 0 ? evaluated.filter(d => d.correct).length / evaluated.length : 0.5;
  const miscalib = evaluated.length >= 10 ? Math.max(0, 0.5 - accuracy) * 2 : 0.1;

  // Structural change: regime changes
  const regimes = new Set((decisions || []).slice(0, 20).map(d => {
    const snap = d.evidence_snapshot_json as any;
    return snap?.regime || "Unknown";
  }));
  const structChange = Math.min(1, Math.max(0, (regimes.size - 1) * 0.25));

  // Normalize to sum to 1
  const total = dataInsuff + miscalib + structChange + integrityFail || 1;

  const attribution = {
    asset_id: assetId,
    timeframe_class: tf,
    data_insufficiency_p: +(dataInsuff / total).toFixed(3),
    model_miscalibration_p: +(miscalib / total).toFixed(3),
    structural_change_p: +(structChange / total).toFixed(3),
    data_integrity_failure_p: +(integrityFail / total).toFixed(3),
  };

  await supabase.from("epistemic_attributions").insert(attribution);
  return attribution;
}

// ─── INTROSPECTION SNAPSHOT ───

async function captureIntrospection(assetId: string, tf: string) {
  const [{ data: patterns }, { data: reliability }, { data: decisions }, { data: trades }, { data: status }] = await Promise.all([
    supabase.from("indicator_patterns").select("*").eq("asset_id", assetId).eq("timeframe", tf).eq("is_active", true),
    supabase.from("indicator_reliability").select("*").eq("asset_id", assetId).eq("timeframe", tf),
    supabase.from("paper_decisions").select("*").eq("asset_id", assetId).eq("timeframe", tf).order("ts", { ascending: false }).limit(30),
    supabase.from("paper_trades").select("*").eq("asset_id", assetId).eq("timeframe", tf).order("ts_created", { ascending: false }).limit(30),
    supabase.from("system_status").select("*").eq("asset_id", assetId).limit(1),
  ]);

  // Pattern tier entropy
  const tiers = (patterns || []).map(p => p.confidence_tier);
  const tierCounts: Record<string, number> = {};
  tiers.forEach(t => { tierCounts[t] = (tierCounts[t] || 0) + 1; });
  const tierTotal = tiers.length || 1;
  const tierEntropy = -Object.values(tierCounts).reduce((s, c) => {
    const p = c / tierTotal;
    return s + (p > 0 ? p * Math.log2(p) : 0);
  }, 0);

  // Indicator concentration (top indicator dominance)
  const relSorted = [...(reliability || [])].sort((a, b) => b.diracc_lift - a.diracc_lift);
  const topLift = relSorted[0]?.diracc_lift || 0;
  const avgLift = relSorted.length > 0 ? relSorted.reduce((s, r) => s + r.diracc_lift, 0) / relSorted.length : 0;
  const indicatorConcentration = avgLift > 0 ? Math.min(1, topLift / (avgLift * 3)) : 0;

  // Confidence stats
  const probs = (decisions || []).map(d => d.probability_pred);
  const confMean = probs.length > 0 ? probs.reduce((s, p) => s + p, 0) / probs.length : 0;
  const confVar = probs.length > 1 ? probs.reduce((s, p) => s + (p - confMean) ** 2, 0) / probs.length : 0;

  // Trade accuracy
  const closedTrades = (trades || []).filter(t => t.outcome_label);
  const wins = closedTrades.filter(t => t.return_r && t.return_r > 0).length;
  const tradeAcc = closedTrades.length > 0 ? wins / closedTrades.length : 0;

  // News influence
  const { data: newsGrad } = await supabase.from("news_graduation").select("graduation_level").eq("asset_id", assetId).limit(1);
  const newsInfluence = (newsGrad && newsGrad[0]?.graduation_level > 0) ? 0.3 : 0;

  // Transfer weight
  const { data: transfers } = await supabase.from("transfer_priors").select("transfer_weight").eq("target_asset", assetId).eq("discarded", false);
  const transferWeight = (transfers || []).reduce((s, t) => s + t.transfer_weight, 0);

  const sysStatus = status?.[0];

  const snapshot = {
    asset_id: assetId,
    timeframe_class: tf,
    reasoning_composition: {
      indicator_concentration: +indicatorConcentration.toFixed(3),
      pattern_tier_entropy: +tierEntropy.toFixed(3),
      news_influence_ratio: +newsInfluence.toFixed(3),
      transfer_learning_weight: +transferWeight.toFixed(3),
      confidence_mean: +confMean.toFixed(3),
      confidence_variance: +confVar.toFixed(3),
    },
    learning_state: {
      learning_rate: 0,
      weight_volatility: +confVar.toFixed(3),
      pattern_churn_rate: 0,
      paper_trade_accuracy: +tradeAcc.toFixed(3),
    },
    integrity_state: {
      agreement_score: (decisions?.[0] as any)?.agreement_score || 0,
      consensus_score: (decisions?.[0] as any)?.consensus_score || 0,
      anomaly_state: sysStatus?.anomaly_halt ? "HALT" : "OK",
      output_mode: sysStatus?.output_mode || "NORMAL",
    },
  };

  await supabase.from("introspection_snapshots").insert(snapshot);
  return snapshot;
}

// ─── META-EVALUATION ───

async function computeMetaEvaluation(assetId: string, tf: string) {
  const { data: decisions } = await supabase.from("paper_decisions").select("*").eq("asset_id", assetId).eq("timeframe", tf).order("ts", { ascending: false }).limit(100);

  const evaluated = (decisions || []).filter(d => d.correct !== null);
  const n = evaluated.length;

  // Calibration error: |predicted_prob - actual_outcome| averaged
  let calibError = 0;
  if (n >= 10) {
    const bins: Record<string, { total: number; correct: number }> = {};
    evaluated.forEach(d => {
      const bin = Math.round(d.probability_pred * 10) / 10;
      const key = bin.toFixed(1);
      if (!bins[key]) bins[key] = { total: 0, correct: 0 };
      bins[key].total++;
      if (d.correct) bins[key].correct++;
    });
    let sumError = 0;
    let count = 0;
    Object.entries(bins).forEach(([binStr, { total, correct }]) => {
      const predicted = parseFloat(binStr);
      const actual = correct / total;
      sumError += Math.abs(predicted - actual) * total;
      count += total;
    });
    calibError = count > 0 ? sumError / count : 0;
  }

  // Overconfidence risk: high probability predictions that fail
  const highConf = evaluated.filter(d => d.probability_pred >= 0.7);
  const highConfFails = highConf.filter(d => !d.correct).length;
  const overconfidence = highConf.length >= 5 ? highConfFails / highConf.length : 0;

  // Learning instability: variance of recent consensus scores
  const scores = (decisions || []).slice(0, 20).map(d => d.consensus_score);
  const scoreMean = scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : 0;
  const scoreVar = scores.length > 1 ? scores.reduce((s, v) => s + (v - scoreMean) ** 2, 0) / scores.length : 0;
  const instability = Math.min(1, Math.sqrt(scoreVar) / 50);

  // Hypothesis diversity: unique direction predictions recently
  const dirs = new Set((decisions || []).slice(0, 20).map(d => d.direction_pred));
  const diversity = Math.min(1, dirs.size / 3);

  // False alarm rate from anomalies
  const { data: anomalies } = await supabase.from("anomaly_events").select("*").eq("asset_id", assetId).order("created_at", { ascending: false }).limit(20);
  const resolvedQuickly = (anomalies || []).filter(a => a.resolved).length;
  const falseAlarmRate = (anomalies?.length || 0) > 3 ? resolvedQuickly / (anomalies?.length || 1) : 0;

  const evaluation = {
    asset_id: assetId,
    timeframe_class: tf,
    calibration_error: +calibError.toFixed(4),
    abstention_quality: 0,
    learning_instability: +instability.toFixed(4),
    overconfidence_risk: +overconfidence.toFixed(4),
    hypothesis_diversity: +diversity.toFixed(4),
    early_warning_lead_time: 0,
    false_alarm_rate: +falseAlarmRate.toFixed(4),
  };

  await supabase.from("meta_evaluations").insert(evaluation);
  return evaluation;
}

// ─── MATURITY PROGRESSION ───

async function evaluateMaturity(assetId: string, tf: string) {
  const [{ data: evalRows }, { data: attrRows }, { data: currentState }] = await Promise.all([
    supabase.from("meta_evaluations").select("*").eq("asset_id", assetId).eq("timeframe_class", tf).order("ts", { ascending: false }).limit(10),
    supabase.from("epistemic_attributions").select("*").eq("asset_id", assetId).eq("timeframe_class", tf).order("ts", { ascending: false }).limit(5),
    supabase.from("maturity_states").select("*").eq("asset_id", assetId).eq("timeframe_class", tf).limit(1),
  ]);

  const state = currentState?.[0] || {
    asset_id: assetId,
    timeframe_class: tf,
    maturity_level: 0,
    confidence: 0,
    promotion_streak: 0,
    demotion_streak: 0,
    cooldown_until: null,
    reasons_json: [],
  };

  const evals = evalRows || [];
  const attrs = attrRows || [];
  if (evals.length < 2) return state;

  // Check cooldown
  if (state.cooldown_until && new Date(state.cooldown_until) > new Date()) {
    return state;
  }

  const latest = evals[0];
  const reasons: string[] = [];

  // Promotion signals
  const calibOk = latest.calibration_error < 0.15;
  const instabilityOk = latest.learning_instability < 0.3;
  const overconfOk = latest.overconfidence_risk < 0.25;
  const diverseOk = latest.hypothesis_diversity >= 0.3;

  let shouldPromote = false;
  let shouldDemote = false;

  if (state.maturity_level === 0 && evals.length >= 3) {
    shouldPromote = true;
    reasons.push("Sufficient evaluation history accumulated");
  } else if (state.maturity_level === 1 && calibOk && attrs.length >= 2) {
    shouldPromote = true;
    reasons.push(`Calibration error ${(latest.calibration_error * 100).toFixed(1)}% < 15%`);
    reasons.push("Epistemic attribution data available");
  } else if (state.maturity_level === 2 && calibOk && instabilityOk && overconfOk) {
    shouldPromote = true;
    reasons.push(`Learning instability ${(latest.learning_instability * 100).toFixed(1)}% < 30%`);
    reasons.push(`Overconfidence risk ${(latest.overconfidence_risk * 100).toFixed(1)}% < 25%`);
  } else if (state.maturity_level >= 3 && calibOk && instabilityOk && overconfOk && diverseOk) {
    shouldPromote = true;
    reasons.push("All meta-metrics within target ranges");
  }

  // Demotion signals
  if (latest.overconfidence_risk > 0.4) {
    shouldDemote = true;
    shouldPromote = false;
    reasons.push(`Overconfidence spike: ${(latest.overconfidence_risk * 100).toFixed(1)}%`);
  }
  if (latest.learning_instability > 0.5) {
    shouldDemote = true;
    shouldPromote = false;
    reasons.push(`Learning volatility exploded: ${(latest.learning_instability * 100).toFixed(1)}%`);
  }
  if (latest.false_alarm_rate > 0.5 && evals.length >= 5) {
    shouldDemote = true;
    shouldPromote = false;
    reasons.push(`False alarm rate ${(latest.false_alarm_rate * 100).toFixed(1)}% > 50%`);
  }

  let newLevel = state.maturity_level;
  let promoStreak = state.promotion_streak;
  let demoStreak = state.demotion_streak;
  let cooldownUntil = state.cooldown_until;

  if (shouldPromote) {
    promoStreak++;
    demoStreak = 0;
    if (promoStreak >= W_UP) {
      newLevel = Math.min(5, state.maturity_level + 1);
      promoStreak = 0;
      cooldownUntil = new Date(Date.now() + COOLDOWN_DAYS * 86400000).toISOString();
    }
  } else if (shouldDemote) {
    demoStreak++;
    promoStreak = 0;
    if (demoStreak >= W_DOWN) {
      newLevel = Math.max(0, state.maturity_level - 1);
      demoStreak = 0;
      cooldownUntil = new Date(Date.now() + COOLDOWN_DAYS * 86400000).toISOString();
    }
  } else {
    promoStreak = 0;
    demoStreak = 0;
  }

  const confidence = Math.min(100, Math.round(
    (calibOk ? 25 : 0) + (instabilityOk ? 25 : 0) + (overconfOk ? 25 : 0) + (diverseOk ? 25 : 0)
  ));

  const newState = {
    asset_id: assetId,
    timeframe_class: tf,
    maturity_level: newLevel,
    confidence,
    last_change_ts: newLevel !== state.maturity_level ? new Date().toISOString() : state.last_change_ts,
    reasons_json: reasons,
    promotion_streak: promoStreak,
    demotion_streak: demoStreak,
    cooldown_until: cooldownUntil,
    updated_at: new Date().toISOString(),
  };

  await supabase.from("maturity_states").upsert(newState, { onConflict: "asset_id,timeframe_class" });

  // Auto-generate admin message on level change
  if (newLevel !== state.maturity_level) {
    const direction = newLevel > state.maturity_level ? "promoted" : "regressed";
    await supabase.from("admin_messages").insert({
      sender_type: "atlas",
      category: "maturity",
      severity: direction === "promoted" ? "info" : "watch",
      asset_id: assetId,
      title: `${assetId} ${direction} to ML${newLevel} (${ML_LABELS[newLevel]})`,
      body_markdown: `### Maturity ${direction === "promoted" ? "Promotion" : "Regression"}\n\n` +
        `**Asset:** ${assetId} / ${tf}\n` +
        `**Level:** ML${state.maturity_level} → ML${newLevel} (${ML_LABELS[newLevel]})\n` +
        `**Confidence:** ${confidence}%\n\n` +
        `**Evidence:**\n${reasons.map(r => `- ${r}`).join("\n")}\n\n` +
        `**Could be invalidated if:**\n` +
        `- Calibration error rises above 15%\n` +
        `- Overconfidence spikes above 40%\n` +
        `- Learning instability exceeds 50%`,
      evidence_json: { latest_eval: latest, reasons, prev_level: state.maturity_level, new_level: newLevel },
    });
  }

  return newState;
}

// ─── AUTHORITY STATE ───

async function getAuthorityState(assetId: string, tf: string) {
  const { data } = await supabase.from("authority_states").select("*").eq("asset_id", assetId).eq("timeframe_class", tf).limit(1);

  if (data && data.length > 0) return data[0];

  // Initialize at AL0
  const initial = { asset_id: assetId, timeframe_class: tf, authority_level: 0, rationale_json: ["Initial: observe only"] };
  await supabase.from("authority_states").upsert(initial, { onConflict: "asset_id,timeframe_class" });
  return initial;
}

// ─── ADMIN MESSAGES ───

async function getAdminMessages(limit = 50) {
  const { data, error } = await supabase
    .from("admin_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function sendAdminMessage(title: string, body: string, category = "manual", severity = "info") {
  const { data, error } = await supabase.from("admin_messages").insert({
    sender_type: "admin",
    category,
    severity,
    title,
    body_markdown: body,
  }).select().single();
  if (error) throw error;
  return data;
}

async function markMessageRead(messageId: string) {
  const { error } = await supabase.from("admin_messages").update({ read: true }).eq("id", messageId);
  if (error) throw error;
}

// ─── ATLAS RESPONDS TO ADMIN ───

async function atlasRespond(messageId: string, assetId?: string) {
  if (!LOVABLE_API_KEY) return { response: "AI gateway not available" };

  // Gather context
  const [{ data: maturity }, { data: authority }, { data: recentEvals }, { data: msg }] = await Promise.all([
    supabase.from("maturity_states").select("*").eq("asset_id", assetId || "BTC").limit(1),
    supabase.from("authority_states").select("*").eq("asset_id", assetId || "BTC").limit(1),
    supabase.from("meta_evaluations").select("*").eq("asset_id", assetId || "BTC").order("ts", { ascending: false }).limit(3),
    supabase.from("admin_messages").select("*").eq("id", messageId).single(),
  ]);

  const context = {
    maturity: maturity?.[0],
    authority: authority?.[0],
    recentEvals,
    adminMessage: msg,
  };

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `You are ATLAS, an autonomous crypto market analysis system. An admin is asking you a question. Respond with:
1. Current maturity level (ML${context.maturity?.maturity_level || 0}) and authority level (AL${context.authority?.authority_level || 0})
2. What mistakes you're learning from (based on meta-evaluation data)
3. Which assumptions recently failed
4. What you plan to explore next
Be concise, data-driven, and honest about limitations. Use markdown formatting.`,
        },
        { role: "user", content: `Context: ${JSON.stringify(context)}\n\nAdmin message: ${msg?.body_markdown || msg?.title || "Status update requested"}` },
      ],
    }),
  });

  if (!response.ok) return { response: "AI response failed" };
  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content || "Unable to generate response.";

  await supabase.from("admin_messages").insert({
    sender_type: "atlas",
    category: "manual",
    severity: "info",
    title: `Re: ${msg?.title || "Admin query"}`,
    body_markdown: reply,
    asset_id: assetId,
    evidence_json: { in_reply_to: messageId, context_summary: { ml: context.maturity?.maturity_level, al: context.authority?.authority_level } },
  });

  return { response: reply };
}

// ─── FULL CYCLE ───

async function runFullCycle(assetId: string, tf: string) {
  const attribution = await computeEpistemicAttribution(assetId, tf);
  const introspection = await captureIntrospection(assetId, tf);
  const evaluation = await computeMetaEvaluation(assetId, tf);
  const maturity = await evaluateMaturity(assetId, tf);
  const authority = await getAuthorityState(assetId, tf);

  return { attribution, introspection, evaluation, maturity, authority };
}

// ─── DASHBOARD DATA ───

async function getDashboard(assetId?: string) {
  let matQ = supabase.from("maturity_states").select("*");
  let authQ = supabase.from("authority_states").select("*");
  if (assetId) {
    matQ = matQ.eq("asset_id", assetId);
    authQ = authQ.eq("asset_id", assetId);
  }

  const [{ data: maturity }, { data: authority }, { data: recentEvals }, { data: recentAttrs }, { data: recentIntrospections }] = await Promise.all([
    matQ,
    authQ,
    supabase.from("meta_evaluations").select("*").order("ts", { ascending: false }).limit(assetId ? 10 : 30),
    supabase.from("epistemic_attributions").select("*").order("ts", { ascending: false }).limit(assetId ? 5 : 20),
    supabase.from("introspection_snapshots").select("*").order("ts", { ascending: false }).limit(assetId ? 5 : 20),
  ]);

  return { maturity, authority, recentEvals, recentAttrs, recentIntrospections };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let action = url.searchParams.get("action");
    let asset = url.searchParams.get("asset") || undefined;
    let tf = url.searchParams.get("timeframe") || "4h";
    let bodyData: any = null;

    // Support both query params and body-based action routing
    if (!action) {
      try {
        const cloned = req.clone();
        bodyData = await cloned.json();
        action = bodyData.action || "dashboard";
        asset = bodyData.asset || asset;
        tf = bodyData.timeframe || tf;
      } catch { action = "dashboard"; }
    }
    action = action || "dashboard";

    let result: unknown;

    switch (action) {
      case "cycle":
        if (!asset) throw new Error("asset required for cycle");
        result = await runFullCycle(asset, tf);
        break;
      case "dashboard":
        result = await getDashboard(asset);
        break;
      case "messages":
        result = await getAdminMessages(parseInt(url.searchParams.get("limit") || bodyData?.limit || "50"));
        break;
      case "send-message": {
        const body = bodyData || await req.json();
        result = await sendAdminMessage(body.title, body.body, body.category, body.severity);
        break;
      }
      case "mark-read": {
        const body = bodyData || await req.json();
        await markMessageRead(body.id);
        result = { ok: true };
        break;
      }
      case "atlas-respond": {
        const body = bodyData || await req.json();
        result = await atlasRespond(body.message_id, body.asset_id);
        break;
      }
      case "attribution":
        if (!asset) throw new Error("asset required");
        result = await computeEpistemicAttribution(asset, tf);
        break;
      case "introspection":
        if (!asset) throw new Error("asset required");
        result = await captureIntrospection(asset, tf);
        break;
      case "meta-eval":
        if (!asset) throw new Error("asset required");
        result = await computeMetaEvaluation(asset, tf);
        break;
      case "maturity":
        if (!asset) throw new Error("asset required");
        result = await evaluateMaturity(asset, tf);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({ data: result, timestamp: Date.now() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("meta-engine error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
