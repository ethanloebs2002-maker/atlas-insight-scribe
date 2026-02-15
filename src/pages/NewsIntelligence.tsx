import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useNewsFeed,
  useNewsNarratives,
  useNewsGraduation,
  useNewsReactions,
  usePsychAggregates,
  useIngestNews,
} from "@/hooks/use-news-engine";
import NewsFeedPanel from "@/components/NewsFeedPanel";
import NewsPsychDials from "@/components/NewsPsychDials";
import NewsAgendaPanel from "@/components/NewsAgendaPanel";
import NewsNarrativesPanel from "@/components/NewsNarrativesPanel";
import NewsGraduationPanel from "@/components/NewsGraduationPanel";
import NewsReactionsPanel from "@/components/NewsReactionsPanel";
import { Skeleton } from "@/components/ui/skeleton";

const ASSETS = ["ALL", "BTC", "ETH", "SOL", "DOGE", "AVAX", "LINK", "ADA", "DOT", "XRP"];

export default function NewsIntelligence() {
  const [searchParams] = useSearchParams();
  const initialAsset = searchParams.get("asset") || "ALL";
  const [asset, setAsset] = useState(initialAsset);

  const assetParam = asset === "ALL" ? undefined : asset;

  const { data: feed, isLoading: feedLoading } = useNewsFeed(assetParam);
  const { data: narratives } = useNewsNarratives(assetParam);
  const { data: graduation } = useNewsGraduation(assetParam);
  const { data: reactions } = useNewsReactions(assetParam);
  const { data: psychAgg } = usePsychAggregates(asset === "ALL" ? "BTC" : asset);
  const ingestMutation = useIngestNews();

  // Compute aggregate agenda from feed items
  const avgAgenda = feed && feed.length > 0
    ? (() => {
        const items = feed.filter((f: any) => f.news_agenda_signals?.length > 0);
        if (items.length === 0) return null;
        const avg = (key: string) => Math.round(items.reduce((s: number, f: any) => s + (f.news_agenda_signals[0][key] || 0), 0) / items.length);
        return {
          speculation_level: avg("speculation_level"),
          framing_asymmetry: avg("framing_asymmetry"),
          clickbait_intensity: avg("clickbait_intensity"),
          source_disagreement: avg("source_disagreement"),
          agenda_uncertainty: avg("agenda_uncertainty"),
        };
      })()
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-mono font-bold tracking-wider">NEWS INTELLIGENCE</h1>
          <p className="text-xs font-mono text-muted-foreground">
            NLE v1.8 — Psych Impact · Agenda Analysis · Graduation Gates
          </p>
        </div>
        <Select value={asset} onValueChange={setAsset}>
          <SelectTrigger className="w-[100px] h-8 text-xs font-mono">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASSETS.map(a => (
              <SelectItem key={a} value={a} className="text-xs font-mono">{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="feed" className="space-y-4">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="feed" className="text-[10px] font-mono">Feed</TabsTrigger>
          <TabsTrigger value="psych" className="text-[10px] font-mono">Psych Impact</TabsTrigger>
          <TabsTrigger value="narratives" className="text-[10px] font-mono">Narratives</TabsTrigger>
          <TabsTrigger value="reactions" className="text-[10px] font-mono">Reactions</TabsTrigger>
          <TabsTrigger value="learning" className="text-[10px] font-mono">Learning</TabsTrigger>
        </TabsList>

        <TabsContent value="feed">
          <NewsFeedPanel
            items={feed || []}
            isLoading={feedLoading}
            onRefresh={() => ingestMutation.mutate(assetParam)}
            isRefreshing={ingestMutation.isPending}
          />
        </TabsContent>

        <TabsContent value="psych">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <NewsPsychDials data={psychAgg} />
            <NewsAgendaPanel data={avgAgenda} />
          </div>
        </TabsContent>

        <TabsContent value="narratives">
          <NewsNarrativesPanel narratives={narratives || []} />
        </TabsContent>

        <TabsContent value="reactions">
          <NewsReactionsPanel reactions={reactions || []} />
        </TabsContent>

        <TabsContent value="learning">
          <NewsGraduationPanel rows={graduation || []} showAll />
        </TabsContent>
      </Tabs>
    </div>
  );
}
