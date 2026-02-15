import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Narrative {
  id: string;
  asset_id: string;
  topic_label: string;
  momentum_24h: number;
  momentum_7d: number;
  article_count: number;
  first_seen_ts: string;
  last_seen_ts: string;
  is_active: boolean;
  news_corroboration: {
    corroboration_score: number;
    disagreement_score: number;
    sources_count: number;
    tier_a_sources_count: number;
  }[] | null;
}

function MomentumIcon({ value }: { value: number }) {
  if (value > 10) return <TrendingUp className="h-3 w-3 text-bullish" />;
  if (value < -10) return <TrendingDown className="h-3 w-3 text-bearish" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

export default function NewsNarrativesPanel({ narratives }: { narratives: Narrative[] }) {
  if (!narratives || narratives.length === 0) {
    return (
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Narrative Clusters — No Data
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          Active Narrative Clusters
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 space-y-2">
        {narratives.map((n) => {
          const corr = n.news_corroboration?.[0];
          return (
            <div key={n.id} className="rounded border border-border p-2.5 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MomentumIcon value={n.momentum_24h} />
                  <span className="text-xs font-medium">{n.topic_label}</span>
                  <Badge variant="outline" className="text-[9px] h-4 px-1">{n.asset_id}</Badge>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">{n.article_count} articles</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
                <span>24h: <span className={n.momentum_24h > 0 ? "text-bullish" : "text-bearish"}>{n.momentum_24h > 0 ? "+" : ""}{n.momentum_24h.toFixed(0)}</span></span>
                <span>7d: <span className={n.momentum_7d > 0 ? "text-bullish" : "text-bearish"}>{n.momentum_7d > 0 ? "+" : ""}{n.momentum_7d.toFixed(0)}</span></span>
                {corr && (
                  <>
                    <span>Corr: {corr.corroboration_score}</span>
                    <span>Disagree: {corr.disagreement_score}</span>
                    <span>Sources: {corr.sources_count} ({corr.tier_a_sources_count}A)</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
