import { useState } from "react";
import { useTransferStatus, useComputeFingerprints, useApplyTransfer, useDecayTransfers, useCheckContradictions } from "@/hooks/use-transfer-engine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, ArrowRightLeft, Fingerprint, RefreshCw, Shield, TrendingDown, XCircle } from "lucide-react";

interface LearningSourcesPanelProps {
  selectedAsset?: string;
}

export default function LearningSourcesPanel({ selectedAsset }: LearningSourcesPanelProps) {
  const { data: statusRes, isLoading } = useTransferStatus(selectedAsset);
  const computeFingerprints = useComputeFingerprints();
  const applyTransfer = useApplyTransfer();
  const decayTransfers = useDecayTransfers();
  const checkContradictions = useCheckContradictions();

  const status = statusRes?.data;
  const priors = status?.priors || [];
  const fingerprints = status?.fingerprints || [];
  const influenceMap = status?.influenceMap || {};

  const activePriors = priors.filter((p: any) => !p.discarded);
  const discardedPriors = priors.filter((p: any) => p.discarded);

  return (
    <div className="space-y-4">
      {/* Actions Bar */}
      <Card>
        <CardContent className="py-3 px-4 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-primary" />
            <span className="text-xs font-mono font-bold">Transfer Learning Engine</span>
            <Badge variant="secondary" className="text-[9px] font-mono">
              {activePriors.length} active / {discardedPriors.length} discarded
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline" size="sm" className="h-7 text-[10px] font-mono gap-1"
              onClick={() => computeFingerprints.mutate(undefined)}
              disabled={computeFingerprints.isPending}
            >
              <Fingerprint className="h-3 w-3" />
              Compute Fingerprints
            </Button>
            <Button
              variant="outline" size="sm" className="h-7 text-[10px] font-mono gap-1"
              onClick={() => selectedAsset && applyTransfer.mutate(selectedAsset)}
              disabled={!selectedAsset || applyTransfer.isPending}
            >
              <ArrowRightLeft className="h-3 w-3" />
              Apply Transfer
            </Button>
            <Button
              variant="outline" size="sm" className="h-7 text-[10px] font-mono gap-1"
              onClick={() => decayTransfers.mutate(selectedAsset)}
              disabled={decayTransfers.isPending}
            >
              <TrendingDown className="h-3 w-3" />
              Decay
            </Button>
            <Button
              variant="outline" size="sm" className="h-7 text-[10px] font-mono gap-1"
              onClick={() => selectedAsset && checkContradictions.mutate(selectedAsset)}
              disabled={!selectedAsset || checkContradictions.isPending}
            >
              <Shield className="h-3 w-3" />
              Check
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Influence Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(influenceMap).map(([asset, info]: [string, any]) => (
          <Card key={asset} className="overflow-hidden">
            <CardHeader className="py-2.5 px-4">
              <CardTitle className="text-xs font-mono flex items-center justify-between">
                <span className="font-bold">{asset}</span>
                <Badge variant="outline" className="text-[9px] font-mono">
                  {info.donors.length} donor{info.donors.length !== 1 ? "s" : ""}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Local vs Transfer bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[9px] font-mono text-muted-foreground">
                  <span>Local: {info.localPct.toFixed(1)}%</span>
                  <span>Transfer: {info.transferPct.toFixed(1)}%</span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden flex">
                  <div
                    className="h-full bg-primary rounded-l-full transition-all"
                    style={{ width: `${info.localPct}%` }}
                  />
                  <div
                    className="h-full bg-neutral-signal rounded-r-full transition-all"
                    style={{ width: `${info.transferPct}%` }}
                  />
                </div>
              </div>

              {/* Donors list */}
              {info.donors.map((donor: any) => (
                <div key={donor.donor} className="rounded border border-border bg-secondary/30 p-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold">{donor.donor}</span>
                    <span className="text-[9px] font-mono text-muted-foreground">
                      sim: {(donor.similarity * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[9px] font-mono text-muted-foreground">
                    <span>w: {donor.weight.toFixed(3)}</span>
                    <span>decay: {(donor.decay * 100).toFixed(0)}%</span>
                    {donor.contradictions > 0 && (
                      <span className="text-bearish flex items-center gap-0.5">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {donor.contradictions}
                      </span>
                    )}
                  </div>
                  {/* Decay progress */}
                  <Progress value={donor.decay * 100} className="h-1" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        {Object.keys(influenceMap).length === 0 && (
          <Card className="col-span-full">
            <CardContent className="py-8 text-center">
              <ArrowRightLeft className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs font-mono text-muted-foreground">
                No transfer priors active. Compute fingerprints and apply transfers to populate.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Fingerprints Table */}
      {fingerprints.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Fingerprint className="h-3.5 w-3.5" />
              Asset Fingerprints
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] font-mono">ASSET</TableHead>
                  <TableHead className="text-[10px] font-mono">REGIME</TableHead>
                  <TableHead className="text-[10px] font-mono">VOL</TableHead>
                  <TableHead className="text-[10px] font-mono">MOM</TableHead>
                  <TableHead className="text-[10px] font-mono">TREND</TableHead>
                  <TableHead className="text-[10px] font-mono">RSI</TableHead>
                  <TableHead className="text-[10px] font-mono">COMPUTED</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fingerprints.map((fp: any) => (
                  <TableRow key={fp.id}>
                    <TableCell className="text-[10px] font-mono font-bold">{fp.asset_id}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[9px] font-mono">{fp.regime_label}</Badge>
                    </TableCell>
                    <TableCell className="text-[10px] font-mono">{Number(fp.volatility_rank).toFixed(2)}</TableCell>
                    <TableCell className="text-[10px] font-mono">{Number(fp.momentum_score).toFixed(2)}</TableCell>
                    <TableCell className="text-[10px] font-mono">{Number(fp.trend_strength).toFixed(2)}</TableCell>
                    <TableCell className="text-[10px] font-mono">{Number(fp.rsi_avg).toFixed(1)}</TableCell>
                    <TableCell className="text-[10px] font-mono text-muted-foreground">
                      {new Date(fp.computed_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Discarded Transfers */}
      {discardedPriors.length > 0 && (
        <Card className="border-bearish/20">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-bearish flex items-center gap-2">
              <XCircle className="h-3.5 w-3.5" />
              Discarded Transfers
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] font-mono">TARGET</TableHead>
                  <TableHead className="text-[10px] font-mono">DONOR</TableHead>
                  <TableHead className="text-[10px] font-mono">REASON</TableHead>
                  <TableHead className="text-[10px] font-mono">CONTRADICTIONS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {discardedPriors.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-[10px] font-mono font-bold">{p.target_asset}</TableCell>
                    <TableCell className="text-[10px] font-mono">{p.donor_asset}</TableCell>
                    <TableCell className="text-[10px] font-mono text-muted-foreground max-w-[200px] truncate">{p.discard_reason}</TableCell>
                    <TableCell className="text-[10px] font-mono text-bearish">{p.contradiction_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Safety Notice */}
      <Card className="border-border">
        <CardContent className="py-3 px-4">
          <div className="text-[9px] font-mono text-muted-foreground space-y-1">
            <p><strong className="text-foreground">SAFETY RULES:</strong></p>
            <p>• Transfer cannot unlock graduation levels — only local performance gates</p>
            <p>• Transfer disabled if integrity gating fails for target asset</p>
            <p>• Transfer discarded after {3} contradictions with local outcomes</p>
            <p>• Confidence cap: {85}% — transfer weight cannot exceed this</p>
            <p>• Exponential decay: transfer weight halves every 50 local decisions</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
