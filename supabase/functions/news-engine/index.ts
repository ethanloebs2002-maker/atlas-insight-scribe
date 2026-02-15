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

// CryptoCompare News API
const CC_NEWS_URL = "https://min-api.cryptocompare.com/data/v2/news/";

// Known crypto symbols for asset linking
const KNOWN_SYMBOLS: Record<string, string[]> = {
  BTC: ["bitcoin", "btc", "₿"],
  ETH: ["ethereum", "eth", "ether"],
  SOL: ["solana", "sol"],
  DOGE: ["dogecoin", "doge"],
  AVAX: ["avalanche", "avax"],
  LINK: ["chainlink", "link"],
  ADA: ["cardano", "ada"],
  DOT: ["polkadot", "dot"],
  XRP: ["xrp", "ripple"],
};

// --- HEURISTIC EXTRACTION ---

function heuristicPsychImpact(title: string, snippet: string): Record<string, number> {
  const text = `${title} ${snippet}`.toLowerCase();
  const count = (words: string[]) => words.filter(w => text.includes(w)).length;

  const fear = Math.min(100, count(["crash", "plunge", "dump", "panic", "fear", "collapse", "liquidat", "wipeout", "plummet", "tank"]) * 18);
  const greed = Math.min(100, count(["surge", "moon", "pump", "rally", "soar", "fomo", "all-time high", "ath", "bull run", "skyrocket"]) * 18);
  const uncertainty = Math.min(100, count(["rumor", "alleged", "unconfirmed", "sources say", "reportedly", "might", "could", "uncertain", "unclear"]) * 20);
  const urgency = Math.min(100, count(["breaking", "just in", "immediately", "urgent", "alert", "emergency", "now", "live"]) * 22);
  const authority = Math.min(100, count(["sec", "fed", "official", "regulator", "court", "government", "central bank", "audit", "filing"]) * 20);
  const outrage = Math.min(100, count(["scam", "fraud", "hack", "exploit", "rug pull", "ponzi", "theft", "criminal", "lawsuit"]) * 18);
  const contagion = Math.min(100, count(["spreading", "systemic", "contagion", "cascade", "domino", "spill", "sector-wide", "market-wide"]) * 22);
  const narrative = Math.min(100, count(["game-changer", "inevitable", "everyone", "paradigm", "revolution", "unprecedented", "historic"]) * 20);

  return { fear, greed_fomo: greed, uncertainty, urgency, authority, outrage_conflict: outrage, contagion, narrative_pressure: narrative };
}

function heuristicAgendaSignals(title: string, snippet: string, sourceReliability: number): Record<string, number> {
  const text = `${title} ${snippet}`.toLowerCase();
  const count = (words: string[]) => words.filter(w => text.includes(w)).length;

  const speculation = Math.min(100, count(["rumor", "alleged", "sources say", "unconfirmed", "reportedly", "speculation", "may"]) * 20);
  const framing = Math.min(100, count(["must", "should", "obvious", "clearly", "undeniably", "without doubt"]) * 22);
  const clickbait = Math.min(100, count(["you won't believe", "shocking", "insane", "crazy", "incredible", "🚀", "💎", "🔥", "!!!"]) * 25);

  const reliabilityPenalty = Math.max(0, (1 - sourceReliability) * 40);
  const agenda = Math.min(100, Math.round((speculation * 0.3 + framing * 0.2 + clickbait * 0.25 + reliabilityPenalty) * 1.2));

  return { speculation, framing_asymmetry: framing, clickbait_intensity: clickbait, source_disagreement: 0, agenda_uncertainty: agenda };
}

function linkAssets(title: string, snippet: string, categories: string): { asset: string; confidence: number }[] {
  const text = `${title} ${snippet} ${categories}`.toLowerCase();
  const results: { asset: string; confidence: number }[] = [];

  for (const [symbol, keywords] of Object.entries(KNOWN_SYMBOLS)) {
    const matches = keywords.filter(k => text.includes(k)).length;
    if (matches > 0) {
      results.push({ asset: symbol, confidence: Math.min(1, matches * 0.4) });
    }
  }
  return results;
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

// --- AI EXTRACTION ---

async function aiExtractPsychAndAgenda(title: string, snippet: string): Promise<{
  psych: Record<string, number>;
  agenda: Record<string, number>;
} | null> {
  if (!LOVABLE_API_KEY) return null;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `You are a crypto news psychological impact analyzer. Given a headline and snippet, extract psychological impact scores (0-100) and agenda/bias signals (0-100). Return ONLY a JSON object with these exact keys:
fear, greed_fomo, uncertainty, urgency, authority, outrage_conflict, contagion, narrative_pressure, extraction_confidence,
speculation, framing_asymmetry, clickbait_intensity, source_disagreement, agenda_uncertainty.
All values must be integers 0-100. No explanation.`,
          },
          { role: "user", content: `Title: ${title}\nSnippet: ${snippet || "N/A"}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_scores",
            description: "Extract psychological impact and agenda signal scores from news",
            parameters: {
              type: "object",
              properties: {
                fear: { type: "number" },
                greed_fomo: { type: "number" },
                uncertainty: { type: "number" },
                urgency: { type: "number" },
                authority: { type: "number" },
                outrage_conflict: { type: "number" },
                contagion: { type: "number" },
                narrative_pressure: { type: "number" },
                extraction_confidence: { type: "number" },
                speculation: { type: "number" },
                framing_asymmetry: { type: "number" },
                clickbait_intensity: { type: "number" },
                source_disagreement: { type: "number" },
                agenda_uncertainty: { type: "number" },
              },
              required: ["fear", "greed_fomo", "uncertainty", "urgency", "authority", "outrage_conflict", "contagion", "narrative_pressure", "extraction_confidence", "speculation", "framing_asymmetry", "clickbait_intensity", "source_disagreement", "agenda_uncertainty"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_scores" } },
      }),
    });

    if (!response.ok) {
      console.error("AI extraction failed:", response.status);
      return null;
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) return null;

    const scores = JSON.parse(toolCall.function.arguments);
    return {
      psych: {
        fear: scores.fear || 0,
        greed_fomo: scores.greed_fomo || 0,
        uncertainty: scores.uncertainty || 0,
        urgency: scores.urgency || 0,
        authority: scores.authority || 0,
        outrage_conflict: scores.outrage_conflict || 0,
        contagion: scores.contagion || 0,
        narrative_pressure: scores.narrative_pressure || 0,
        extraction_confidence: scores.extraction_confidence || 50,
      },
      agenda: {
        speculation: scores.speculation || 0,
        framing_asymmetry: scores.framing_asymmetry || 0,
        clickbait_intensity: scores.clickbait_intensity || 0,
        source_disagreement: scores.source_disagreement || 0,
        agenda_uncertainty: scores.agenda_uncertainty || 0,
      },
    };
  } catch (e) {
    console.error("AI extraction error:", e);
    return null;
  }
}

// --- INGESTION ---

async function ingestNews(asset?: string) {
  const params = new URLSearchParams({ lang: "EN" });
  if (asset) params.set("categories", asset);

  const res = await fetch(`${CC_NEWS_URL}?${params}`);
  if (!res.ok) throw new Error(`CryptoCompare news fetch failed: ${res.status}`);
  const json = await res.json();
  const articles = json.Data || [];

  let ingested = 0;
  let skipped = 0;

  for (const article of articles.slice(0, 50)) {
    const dedupeHash = hashString(`${article.title}${article.published_on}`);

    // Check dedup
    const { data: existing } = await supabase
      .from("news_items")
      .select("id")
      .eq("dedupe_hash", dedupeHash)
      .maybeSingle();

    if (existing) { skipped++; continue; }

    // Upsert source
    const sourceName = article.source || "Unknown";
    const { data: sourceRow } = await supabase
      .from("news_sources")
      .upsert({ name: sourceName, domain: article.source_info?.link || null }, { onConflict: "name" })
      .select("id, reliability_weight")
      .single();

    const sourceReliability = sourceRow?.reliability_weight || 0.5;

    // Insert news item
    const { data: newsItem, error: insertError } = await supabase
      .from("news_items")
      .insert({
        external_id: article.id?.toString(),
        title: article.title,
        snippet: (article.body || "").slice(0, 500),
        canonical_url: article.url,
        publisher: sourceName,
        source_id: sourceRow?.id,
        published_at: new Date(article.published_on * 1000).toISOString(),
        dedupe_hash: dedupeHash,
        categories_json: (article.categories || "").split("|"),
        raw_metadata_json: { tags: article.tags, imageurl: article.imageurl },
      })
      .select("id")
      .single();

    if (insertError || !newsItem) {
      console.error("Insert error:", insertError);
      continue;
    }

    // Link assets
    const assetLinks = linkAssets(article.title, article.body || "", article.categories || "");
    if (assetLinks.length > 0) {
      await supabase.from("news_asset_links").insert(
        assetLinks.map(l => ({ news_id: newsItem.id, asset_id: l.asset, link_confidence: l.confidence }))
      );
    }

    // Extract psych impact + agenda (combined heuristic + AI)
    const hPsych = heuristicPsychImpact(article.title, article.body || "");
    const hAgenda = heuristicAgendaSignals(article.title, article.body || "", sourceReliability);

    const aiResult = await aiExtractPsychAndAgenda(article.title, (article.body || "").slice(0, 300));

    // Blend: if AI available, weight 60/40 AI/heuristic
    const psych = aiResult
      ? Object.fromEntries(Object.keys(hPsych).map(k => [k, Math.round(hPsych[k] * 0.4 + (aiResult.psych[k] || 0) * 0.6)]))
      : hPsych;
    const agenda = aiResult
      ? Object.fromEntries(Object.keys(hAgenda).map(k => [k, Math.round(hAgenda[k] * 0.4 + (aiResult.agenda[k] || 0) * 0.6)]))
      : hAgenda;

    await supabase.from("news_psych_impact").insert({
      news_id: newsItem.id,
      fear_score: psych.fear || 0,
      greed_fomo_score: psych.greed_fomo || 0,
      uncertainty_score: psych.uncertainty || 0,
      urgency_score: psych.urgency || 0,
      authority_score: psych.authority || 0,
      outrage_conflict_score: psych.outrage_conflict || 0,
      contagion_score: psych.contagion || 0,
      narrative_pressure_score: psych.narrative_pressure || 0,
      extraction_confidence: aiResult ? (aiResult.psych.extraction_confidence || 70) : 40,
      extraction_method: aiResult ? "blended" : "heuristic",
    });

    await supabase.from("news_agenda_signals").insert({
      news_id: newsItem.id,
      speculation_level: agenda.speculation || 0,
      framing_asymmetry: agenda.framing_asymmetry || 0,
      clickbait_intensity: agenda.clickbait_intensity || 0,
      source_disagreement: agenda.source_disagreement || 0,
      agenda_uncertainty: agenda.agenda_uncertainty || 0,
    });

    ingested++;
  }

  return { ingested, skipped, total: articles.length };
}

// --- FEED ---

async function getNewsFeed(asset?: string, limit = 30) {
  let query = supabase
    .from("news_items")
    .select(`
      id, title, snippet, canonical_url, publisher, published_at, categories_json,
      news_psych_impact(fear_score, greed_fomo_score, uncertainty_score, urgency_score, authority_score, outrage_conflict_score, contagion_score, narrative_pressure_score, extraction_confidence, extraction_method),
      news_agenda_signals(speculation_level, framing_asymmetry, clickbait_intensity, source_disagreement, agenda_uncertainty),
      news_asset_links(asset_id, link_confidence)
    `)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (asset) {
    // Get news_ids linked to this asset
    const { data: links } = await supabase
      .from("news_asset_links")
      .select("news_id")
      .eq("asset_id", asset.toUpperCase());

    if (links && links.length > 0) {
      query = query.in("id", links.map(l => l.news_id));
    } else {
      return [];
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// --- NARRATIVES ---

async function getNarratives(asset?: string) {
  let query = supabase
    .from("news_narratives")
    .select(`
      id, asset_id, topic_label, momentum_24h, momentum_7d, article_count, first_seen_ts, last_seen_ts, is_active,
      news_corroboration(corroboration_score, disagreement_score, sources_count, tier_a_sources_count)
    `)
    .eq("is_active", true)
    .order("momentum_24h", { ascending: false })
    .limit(20);

  if (asset) {
    query = query.eq("asset_id", asset.toUpperCase());
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// --- GRADUATION STATUS ---

async function getGraduationStatus(asset?: string) {
  let query = supabase
    .from("news_graduation")
    .select("*")
    .order("graduation_level", { ascending: false });

  if (asset) query = query.eq("asset_id", asset.toUpperCase());

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// --- MARKET REACTIONS ---

async function getMarketReactions(asset?: string, limit = 20) {
  let query = supabase
    .from("news_market_reactions")
    .select(`
      id, news_id, asset_id, base_ts, regime_label, horizon_metrics_json, abnormality_score, reaction_confidence,
      news_items(title, publisher, published_at)
    `)
    .order("base_ts", { ascending: false })
    .limit(limit);

  if (asset) query = query.eq("asset_id", asset.toUpperCase());

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// --- PSYCH AGGREGATES ---

async function getPsychAggregates(asset: string) {
  const { data: links } = await supabase
    .from("news_asset_links")
    .select("news_id")
    .eq("asset_id", asset.toUpperCase());

  if (!links || links.length === 0) return null;

  const recentIds = links.slice(0, 20).map(l => l.news_id);
  const { data: impacts } = await supabase
    .from("news_psych_impact")
    .select("*")
    .in("news_id", recentIds);

  if (!impacts || impacts.length === 0) return null;

  const avg = (key: string) => Math.round(impacts.reduce((s, i) => s + (i[key] || 0), 0) / impacts.length);

  return {
    fear: avg("fear_score"),
    greed_fomo: avg("greed_fomo_score"),
    uncertainty: avg("uncertainty_score"),
    urgency: avg("urgency_score"),
    authority: avg("authority_score"),
    outrage_conflict: avg("outrage_conflict_score"),
    contagion: avg("contagion_score"),
    narrative_pressure: avg("narrative_pressure_score"),
    sample_size: impacts.length,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "feed";
    const asset = url.searchParams.get("asset") || undefined;

    let result: unknown;

    switch (action) {
      case "ingest":
        result = await ingestNews(asset);
        break;
      case "feed":
        result = await getNewsFeed(asset, parseInt(url.searchParams.get("limit") || "30"));
        break;
      case "narratives":
        result = await getNarratives(asset);
        break;
      case "graduation":
        result = await getGraduationStatus(asset);
        break;
      case "reactions":
        result = await getMarketReactions(asset, parseInt(url.searchParams.get("limit") || "20"));
        break;
      case "psych-aggregates":
        if (!asset) throw new Error("asset parameter required for psych-aggregates");
        result = await getPsychAggregates(asset);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({ data: result, timestamp: Date.now() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("news-engine error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
