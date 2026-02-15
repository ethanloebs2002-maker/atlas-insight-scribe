import { usePatternTiers, usePromotePatterns } from "@/hooks/use-safety-engine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowUpCircle, CheckCircle2, XCircle, Clock, Sparkles } from "lucide-react";

const TIER_CONFIG: Record<string, { label: string; className: string; icon: any }> = {
  candidate: { label: "CANDIDATE", className: "bg-muted text-muted-foreground", icon: Clock },
  validated: { label: "VALIDATED", className: "bg-neutral-signal/10 text-neutral-signal border-neutral-signal/30", icon: CheckCircle2 },
  promoted: { label: "PROMOTED", className: "bg-bullish/10 text-bullish border-bullish/30", icon: ArrowUpCircle },
  expired: { label: "EXPIRED", className: "bg-bearish/10 text-bearish border-bearish/30", icon: XCircle },
};

interface PatternTierPanelProps {
  selectedAsset?: string;
}

export default function PatternTierPanel({ selectedAsset }: PatternTierPanelProps) {
  const { data: tiersRes, isLoading } = usePatternTiers(selectedAsset);
  const promote = usePromotePatterns();
  const tiers = tiersRes?.data || [];

  const tierCounts = {
    candidate: tiers.filter((t: any) => t.tier === "candidate").length,
    validated: tiers.filter((t: any) => t.tier === "validated").length,
    promoted: tiers.filter((t: any) => t.tier === "promoted").length,
    expired: tiers.filter((t: any) => t.tier === "expired").length,
  };

  return (
    <Card>
      <CardHeader className="py-3 px-4 flex-row items-center justify-between">
        <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Pattern Tiers — Promotion Lifecycle
        </CardTitle>
        {selectedAsset && (
          <Button
            variant="outline" size="sm"
            className="h-7 text-[10px] font-mono gap-1"
            onClick={() => promote.mutate({ asset: selectedAsset })}
            disabled={promote.isPending}
          >
            <ArrowUpCircle className="h-3 w-3" />
            Run Promotion
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Tier summary */}
        <div className="grid grid-cols-4 gap-2">
          {(["candidate", "validated", "promoted", "expired"] as const).map(tier => {
            const cfg = TIER_CONFIG[tier];
            const TierIcon = cfg.icon;
            return (
              <div key={tier} className={`rounded-lg border p-2 text-center ${cfg.className}`}>
                <TierIcon className="h-4 w-4 mx-auto mb-1" />
                <div className="text-lg font-mono font-bold">{tierCounts[tier]}</div>
                <div className="text-[9px] font-mono">{cfg.label}</div>
              </div>
            );
          })}
        </div>

        {/* Tier table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px] font-mono">TIER</TableHead>
              <TableHead className="text-[10px] font-mono">ASSET</TableHead>
              <TableHead className="text-[10px] font-mono">REGIME</TableHead>
              <TableHead className="text-[10px] font-mono">UPLIFT</TableHead>
              <TableHead className="text-[10px] font-mono">PASSES / FAILS</TableHead>
              <TableHead className="text-[10px] font-mono">LAST CHECK</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8 font-mono">
                  Loading pattern tiers…
                </TableCell>
              </TableRow>
            ) : tiers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8 font-mono">
                  No patterns tracked yet. Mine patterns first via the Patterns tab.
                </TableCell>
              </TableRow>
            ) : tiers.map((t: any) => {
              const cfg = TIER_CONFIG[t.tier] || TIER_CONFIG.candidate;
              return (
                <TableRow key={t.id}>
                  <TableCell>
                    <Badge variant="outline" className={`text-[9px] font-mono ${cfg.className}`}>
                      {cfg.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[10px] font-mono font-bold">{t.asset_id}</TableCell>
                  <TableCell className="text-[10px] font-mono text-muted-foreground">{t.regime_context}</TableCell>
                  <TableCell className="text-[10px] font-mono text-bullish">
                    {t.indicator_patterns ? `+${(Number(t.indicator_patterns.diracc_uplift) * 100).toFixed(1)}%` : "—"}
                  </TableCell>
                  <TableCell className="text-[10px] font-mono">
                    <span className="text-bullish">{t.validation_passes}</span>
                    {" / "}
                    <span className="text-bearish">{t.validation_failures}</span>
                  </TableCell>
                  <TableCell className="text-[10px] font-mono text-muted-foreground">
                    {new Date(t.last_check_ts).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
