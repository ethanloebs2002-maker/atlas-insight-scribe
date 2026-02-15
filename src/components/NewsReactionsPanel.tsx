import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Reaction {
  id: string;
  news_id: string;
  asset_id: string;
  base_ts: string;
  regime_label: string;
  horizon_metrics_json: Record<string, any>;
  abnormality_score: number;
  reaction_confidence: number;
  news_items: { title: string; publisher: string; published_at: string } | null;
}

export default function NewsReactionsPanel({ reactions }: { reactions: Reaction[] }) {
  if (!reactions || reactions.length === 0) {
    return (
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Market Reactions — No Data
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          News → Market Reaction Replay
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] font-mono">Article</TableHead>
                <TableHead className="text-[10px] font-mono">Asset</TableHead>
                <TableHead className="text-[10px] font-mono">Regime</TableHead>
                <TableHead className="text-[10px] font-mono">Abnormality</TableHead>
                <TableHead className="text-[10px] font-mono">Confidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reactions.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-[10px] font-mono max-w-[200px] truncate">
                    {r.news_items?.title || "—"}
                  </TableCell>
                  <TableCell className="text-[10px] font-mono">{r.asset_id}</TableCell>
                  <TableCell className="text-[10px] font-mono">{r.regime_label}</TableCell>
                  <TableCell className="text-[10px] font-mono">
                    <span className={r.abnormality_score > 60 ? "text-bearish" : r.abnormality_score > 30 ? "text-neutral-signal" : "text-bullish"}>
                      {r.abnormality_score}
                    </span>
                  </TableCell>
                  <TableCell className="text-[10px] font-mono">{r.reaction_confidence}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
