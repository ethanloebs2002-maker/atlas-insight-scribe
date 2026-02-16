import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, ShieldCheck, BarChart3, Layers, GitBranch } from "lucide-react";

// ─── Data fetching ───────────────────────────────────────────────────────

function useDiagnostics() {
  return useQuery({
    queryKey: ["engine-diagnostics"],
    queryFn: async () => {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [eventsRes, gateRes, posRes, statusRes, consensusRes, policyRes] = await Promise.all([
        supabase
          .from("paper_engine_events")
          .select("*")
          .order("ts", { ascending: false })
          .limit(30),
        supabase
          .from("paper_engine_events")
          .select("payload")
          .eq("event_type", "DECISION_POLICY_EVALUATED")
          .gte("ts", since24h),
        supabase
          .from("paper_positions")
          .select("status, side")
          .in("status", ["PENDING_ENTRY", "OPEN"]),
        // Decision status breakdown
        supabase
          .from("paper_decisions")
          .select("engine_status, consensus_score, probability_pred, probability_source, decision_type")
          .order("ts", { ascending: false })
          .limit(200),
        // Last 50 decisions consensus avg
        supabase
          .from("paper_decisions")
          .select("consensus_score, probability_pred, probability_source")
          .order("ts", { ascending: false })
          .limit(50),
        // Active policy
        supabase
          .from("paper_policy")
          .select("*")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

      // Gate stats
      const evals = (gateRes.data || []) as { payload: any }[];
      const gateStats = {
        total: evals.length,
        approved: evals.filter((e) => e.payload?.approved).length,
        rejected: evals.filter((e) => !e.payload?.approved).length,
        consensusAuthorityUsed: evals.filter((e) => e.payload?.consensusAuthorityUsed).length,
        blocked_by: {
          min_prob: evals.filter((e) => !e.payload?.min_prob_pass).length,
          min_rr: evals.filter((e) => !e.payload?.min_rr_pass).length,
          ev: evals.filter((e) => !e.payload?.ev_pass).length,
          shorts: evals.filter((e) => !e.payload?.shorts_pass).length,
          max_open: evals.filter((e) => !e.payload?.max_open_pass).length,
          max_pending: evals.filter((e) => !e.payload?.max_pending_pass).length,
        },
      };

      // Exposure
      const positions = (posRes.data || []) as { status: string; side: string }[];
      const exposure = {
        open: positions.filter((p) => p.status === "OPEN").length,
        pending: positions.filter((p) => p.status === "PENDING_ENTRY").length,
        long: positions.filter((p) => p.side === "LONG").length,
        short: positions.filter((p) => p.side === "SHORT").length,
      };

      // Decision status breakdown
      const allDecisions = (statusRes.data || []) as any[];
      const statusCounts: Record<string, number> = {};
      const typeCounts: Record<string, number> = {};
      for (const d of allDecisions) {
        statusCounts[d.engine_status] = (statusCounts[d.engine_status] || 0) + 1;
        typeCounts[d.decision_type || "unknown"] = (typeCounts[d.decision_type || "unknown"] || 0) + 1;
      }

      // Consensus stats from last 50
      const recent50 = (consensusRes.data || []) as any[];
      const consensusScores = recent50.map((d) => Number(d.consensus_score || 0));
      const avgConsensus = consensusScores.length > 0 ? consensusScores.reduce((a, b) => a + b, 0) / consensusScores.length : 0;
      const consensusAuthorityCount = recent50.filter((d) => d.probability_source === "consensus_authority").length;

      const policy = (policyRes.data || [])[0] || null;

      return {
        events: (eventsRes.data || []) as any[],
        gateStats,
        exposure,
        statusCounts,
        typeCounts,
        avgConsensus,
        consensusAuthorityCount,
        recent50Count: recent50.length,
        policy,
      };
    },
    refetchInterval: 5_000,
  });
}

// ─── Event badge color ───────────────────────────────────────────────────

function eventVariant(
  t: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (t.includes("APPROVED") || t.includes("FILLED") || t.includes("OPENED")) return "default";
  if (t.includes("REJECTED") || t.includes("CANCELED") || t.includes("CLOSED")) return "secondary";
  if (t.includes("VIOLATION") || t.includes("ERROR") || t.includes("BLOCKED")) return "destructive";
  return "outline";
}

// ─── Sub-components ──────────────────────────────────────────────────────

function StatBox({ label, value, accent }: { label: string; value: number | string; accent?: "bullish" | "bearish" | "primary" }) {
  const cls = accent === "bullish" ? "text-bullish" : accent === "bearish" ? "text-bearish" : accent === "primary" ? "text-primary" : "";
  return (
    <div className="rounded border border-border bg-secondary/40 p-2 text-center">
      <div className={`text-sm font-mono font-bold ${cls}`}>{typeof value === "number" && !Number.isInteger(value) ? value.toFixed(3) : value}</div>
      <div className="text-[9px] font-mono text-muted-foreground uppercase">{label}</div>
    </div>
  );
}

function ExposureCard({ exposure }: { exposure: { open: number; pending: number; long: number; short: number } }) {
  const items = [
    { label: "Open", value: exposure.open },
    { label: "Pending", value: exposure.pending },
    { label: "Long", value: exposure.long },
    { label: "Short", value: exposure.short },
  ];
  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Layers className="h-3 w-3" /> Current Exposure
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="grid grid-cols-4 gap-2">
          {items.map((i) => <StatBox key={i.label} label={i.label} value={i.value} />)}
        </div>
      </CardContent>
    </Card>
  );
}

function DecisionFlowCard({ statusCounts, typeCounts, avgConsensus, consensusAuthorityCount, recent50Count }: {
  statusCounts: Record<string, number>; typeCounts: Record<string, number>;
  avgConsensus: number; consensusAuthorityCount: number; recent50Count: number;
}) {
  const statusOrder = ["PROPOSED", "APPROVED", "EXECUTING", "REJECTED", "COMPLETE", "EXPIRED"];
  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <GitBranch className="h-3 w-3" /> Decision Flow
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-2">
        <div className="grid grid-cols-3 gap-1.5">
          {statusOrder.map((s) => {
            const count = statusCounts[s] || 0;
            if (count === 0 && !["PROPOSED", "APPROVED", "REJECTED"].includes(s)) return null;
            const accent = s === "APPROVED" || s === "EXECUTING" || s === "COMPLETE" ? "bullish" as const : s === "REJECTED" ? "bearish" as const : undefined;
            return <StatBox key={s} label={s} value={count} accent={accent} />;
          })}
        </div>
        <div className="grid grid-cols-3 gap-1.5 pt-1">
          <StatBox label="Avg Consensus (50)" value={avgConsensus} accent="primary" />
          <StatBox label="Consensus Auth" value={`${consensusAuthorityCount}/${recent50Count}`} accent="primary" />
          <StatBox label="Trade Cand." value={typeCounts["TRADE_CANDIDATE"] || 0} />
        </div>
      </CardContent>
    </Card>
  );
}

function PolicyCard({ policy }: { policy: any }) {
  if (!policy) return null;
  const items = [
    { label: "min_prob", value: policy.min_prob },
    { label: "min_rr", value: policy.min_rr },
    { label: "max_open", value: policy.max_open },
    { label: "max_pending", value: policy.max_pending },
    { label: "fee_bps", value: policy.fee_bps },
    { label: "slippage_bps", value: policy.slippage_bps },
  ];
  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <ShieldCheck className="h-3 w-3" /> Active Policy ({policy.version_tag})
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="grid grid-cols-3 gap-1.5">
          {items.map((i) => <StatBox key={i.label} label={i.label} value={i.value} />)}
        </div>
      </CardContent>
    </Card>
  );
}

function GateStatsCard({ stats }: { stats: { total: number; approved: number; rejected: number; consensusAuthorityUsed: number; blocked_by: Record<string, number> } }) {
  const blockers = [
    { label: "Min Probability", key: "min_prob" },
    { label: "Min RR", key: "min_rr" },
    { label: "Negative EV", key: "ev" },
    { label: "Shorts Disabled", key: "shorts" },
    { label: "Max Open Cap", key: "max_open" },
    { label: "Max Pending Cap", key: "max_pending" },
  ];
  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <BarChart3 className="h-3 w-3" /> Decision Gating (24h)
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-2">
        <div className="grid grid-cols-4 gap-2">
          <StatBox label="Evaluated" value={stats.total} />
          <StatBox label="Approved" value={stats.approved} accent="bullish" />
          <StatBox label="Rejected" value={stats.rejected} accent="bearish" />
          <StatBox label="Consensus Auth" value={stats.consensusAuthorityUsed} accent="primary" />
        </div>
        {stats.rejected > 0 && (
          <div className="space-y-1 pt-1">
            <div className="text-[9px] font-mono text-muted-foreground uppercase">Blocked By</div>
            <div className="grid grid-cols-2 gap-1.5">
              {blockers.map((b) => {
                const count = stats.blocked_by[b.key] || 0;
                if (count === 0) return null;
                return (
                  <div key={b.key} className="flex items-center justify-between rounded border border-border px-2 py-1">
                    <span className="text-[9px] font-mono text-muted-foreground truncate">{b.label}</span>
                    <span className="text-[9px] font-mono font-bold text-bearish">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EventStream({ events }: { events: any[] }) {
  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Activity className="h-3 w-3" /> Recent Events
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <ScrollArea className="max-h-[calc(100vh-500px)]">
          <div className="space-y-1.5 pr-2">
            {events.length === 0 && (
              <div className="text-center text-[10px] font-mono text-muted-foreground py-6">No engine events yet</div>
            )}
            {events.map((e: any) => (
              <div key={e.id} className="rounded-md border border-border p-2 text-[10px] font-mono space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={eventVariant(e.event_type)} className="text-[8px] py-0 h-4">{e.event_type}</Badge>
                  <Badge variant="secondary" className="text-[8px] py-0 h-4">{e.entity_type}</Badge>
                  <span className="text-muted-foreground ml-auto">
                    {new Date(e.ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                </div>
                {e.payload && typeof e.payload === "object" && Object.keys(e.payload).length > 0 && (
                  <div className="text-[9px] text-muted-foreground break-all">
                    {Object.entries(e.payload as Record<string, unknown>).slice(0, 6).map(([k, v]) => (
                      <span key={k} className="mr-3">
                        <span className="text-foreground/70">{k}:</span>{" "}
                        {typeof v === "number" ? (Number.isInteger(v) ? v : Number(v).toFixed(4)) : String(v)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────

export default function EngineDiagnostics() {
  const { data, isLoading } = useDiagnostics();

  if (isLoading || !data) {
    return (
      <div className="text-center text-xs text-muted-foreground py-12 font-mono">Loading diagnostics…</div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ExposureCard exposure={data.exposure} />
        <DecisionFlowCard
          statusCounts={data.statusCounts}
          typeCounts={data.typeCounts}
          avgConsensus={data.avgConsensus}
          consensusAuthorityCount={data.consensusAuthorityCount}
          recent50Count={data.recent50Count}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <GateStatsCard stats={data.gateStats} />
        <PolicyCard policy={data.policy} />
      </div>
      <EventStream events={data.events} />
    </div>
  );
}
