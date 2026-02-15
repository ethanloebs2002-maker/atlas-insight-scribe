import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, ShieldAlert, ShieldCheck, ShieldOff } from "lucide-react";

interface GraduationRow {
  id: string;
  asset_id: string;
  timeframe_class: string;
  regime_label: string;
  graduation_level: number;
  n_linked_events: number;
  n_trades_in_news_state: number;
  dir_acc_uplift: number;
  ev_uplift: number;
  stability_recent: number;
  agenda_penalty_applied: boolean;
  influence_mode: string;
  integrity_pass: boolean;
}

const LEVEL_CONFIG: Record<number, { label: string; icon: typeof Shield; color: string; desc: string }> = {
  0: { label: "N0", icon: ShieldOff, color: "text-muted-foreground", desc: "OFF — Log only" },
  1: { label: "N1", icon: ShieldAlert, color: "text-neutral-signal", desc: "Risk-only escalation triggers" },
  2: { label: "N2", icon: Shield, color: "text-primary", desc: "Bounded confidence modifiers" },
  3: { label: "N3", icon: ShieldCheck, color: "text-bullish", desc: "Bounded risk overlays" },
};

export default function NewsGraduationPanel({ rows, showAll = false }: { rows: GraduationRow[]; showAll?: boolean }) {
  if (!rows || rows.length === 0) {
    return (
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            News Graduation — N0 (OFF)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <p className="text-[10px] font-mono text-muted-foreground">
            No graduation data. News influence is disabled. Requires ≥300 linked events + ≥120 trades in news-state.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          News Graduation Status
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 space-y-2">
        {rows.map((r) => {
          const cfg = LEVEL_CONFIG[r.graduation_level] || LEVEL_CONFIG[0];
          const Icon = cfg.icon;
          return (
            <div key={r.id} className="rounded border border-border p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${cfg.color}`} />
                  <span className={`text-xs font-mono font-bold ${cfg.color}`}>{cfg.label}</span>
                  <Badge variant="outline" className="text-[9px] h-4 px-1">{r.asset_id}</Badge>
                  <span className="text-[10px] font-mono text-muted-foreground">{r.timeframe_class} · {r.regime_label}</span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">{r.influence_mode}</span>
              </div>
              <p className="text-[10px] font-mono text-muted-foreground">{cfg.desc}</p>
              {showAll && (
                <div className="grid grid-cols-4 gap-2 text-[10px] font-mono text-muted-foreground">
                  <span>Events: {r.n_linked_events}/300</span>
                  <span>Trades: {r.n_trades_in_news_state}/120</span>
                  <span>DirAcc↑: {(r.dir_acc_uplift * 100).toFixed(1)}%</span>
                  <span>EV↑: {(r.ev_uplift * 100).toFixed(1)}%</span>
                </div>
              )}
              {r.agenda_penalty_applied && (
                <span className="text-[9px] font-mono text-bearish">⚠ Agenda penalty active</span>
              )}
              {!r.integrity_pass && (
                <span className="text-[9px] font-mono text-bearish">✗ Integrity gate failed</span>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
