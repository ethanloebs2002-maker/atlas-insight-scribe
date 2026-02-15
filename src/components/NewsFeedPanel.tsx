import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

interface NewsItemRow {
  id: string;
  title: string;
  snippet: string | null;
  canonical_url: string | null;
  publisher: string | null;
  published_at: string;
  categories_json: string[];
  news_psych_impact: {
    fear_score: number;
    greed_fomo_score: number;
    urgency_score: number;
    extraction_method: string;
  }[] | null;
  news_agenda_signals: {
    agenda_uncertainty: number;
  }[] | null;
  news_asset_links: { asset_id: string; link_confidence: number }[] | null;
}

function PsychBadge({ item }: { item: NewsItemRow }) {
  const psych = item.news_psych_impact?.[0];
  if (!psych) return null;

  const dominant = [
    { key: "fear", val: psych.fear_score, color: "border-bearish text-bearish" },
    { key: "fomo", val: psych.greed_fomo_score, color: "border-bullish text-bullish" },
    { key: "urgent", val: psych.urgency_score, color: "border-primary text-primary" },
  ]
    .filter(d => d.val > 30)
    .sort((a, b) => b.val - a.val)
    .slice(0, 2);

  return (
    <div className="flex gap-1">
      {dominant.map(d => (
        <span key={d.key} className={`text-[9px] font-mono border rounded px-1 ${d.color}`}>
          {d.key} {d.val}
        </span>
      ))}
    </div>
  );
}

export default function NewsFeedPanel({
  items,
  isLoading,
  onRefresh,
  isRefreshing,
}: {
  items: NewsItemRow[];
  isLoading: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  return (
    <Card>
      <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
        <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          Live News Feed
        </CardTitle>
        <Button variant="ghost" size="sm" className="h-6 px-2" onClick={onRefresh} disabled={isRefreshing}>
          <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
          <span className="text-[10px] ml-1">Ingest</span>
        </Button>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-xs font-mono text-muted-foreground text-center py-8">
            No news yet. Click "Ingest" to fetch latest articles.
          </p>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {items.map((item) => {
              const agendaUncertainty = item.news_agenda_signals?.[0]?.agenda_uncertainty || 0;
              return (
                <div
                  key={item.id}
                  className={`rounded border border-border p-2.5 space-y-1 ${agendaUncertainty > 60 ? "border-l-2 border-l-bearish/50" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-xs font-medium leading-tight line-clamp-2">{item.title}</h4>
                    {item.canonical_url && (
                      <a href={item.canonical_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                        <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-primary" />
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {item.publisher} · {formatDistanceToNow(new Date(item.published_at), { addSuffix: true })}
                    </span>
                    {item.news_asset_links?.map(l => (
                      <Badge key={l.asset_id} variant="outline" className="text-[9px] h-4 px-1">
                        {l.asset_id}
                      </Badge>
                    ))}
                    <PsychBadge item={item} />
                    {agendaUncertainty > 50 && (
                      <span className="text-[9px] font-mono text-bearish">⚠ agenda {agendaUncertainty}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
