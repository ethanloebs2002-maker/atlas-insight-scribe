import React, { useMemo, useState } from "react";
import { useWhaleSignals } from "@/hooks/useWhaleSignals";
import WhaleWatchRow from "./WhaleWatchRow";
import { supabase } from "@/integrations/supabase/client";
import { Anchor, RefreshCw, Play } from "lucide-react";

export default function WhaleWatchPanel() {
  const [hours, setHours] = useState(24);
  const [symbol, setSymbol] = useState<string | null>(null);
  const { rows, loading, error, refetch } = useWhaleSignals({ hours, limit: 50, symbol });

  const header = useMemo(() => {
    const sym = symbol ? ` · ${symbol}` : "";
    return `Coverage: last ${hours}h${sym} · Sources: Exchange + On-chain`;
  }, [hours, symbol]);

  async function runScanNow() {
    await supabase.functions.invoke("whale-exchange-scan", { body: {} });
    await supabase.functions.invoke("whale-onchain-scan", { body: {} });
    await refetch();
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <Anchor className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-bold text-foreground">Whale Watch</h1>
            <p className="text-xs text-muted-foreground font-mono">{header}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:ml-auto">
          <select
            className="rounded border border-border bg-card px-2 py-1 text-xs font-mono text-foreground"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          >
            <option value={1}>1h</option>
            <option value={6}>6h</option>
            <option value={24}>24h</option>
            <option value={72}>72h</option>
          </select>

          <select
            className="rounded border border-border bg-card px-2 py-1 text-xs font-mono text-foreground"
            value={symbol ?? ""}
            onChange={(e) => setSymbol(e.target.value ? e.target.value : null)}
          >
            <option value="">All assets</option>
            <option value="BTC">BTC</option>
            <option value="ETH">ETH</option>
            <option value="SOL">SOL</option>
            <option value="DOGE">DOGE</option>
            <option value="AVAX">AVAX</option>
            <option value="LINK">LINK</option>
          </select>

          <button
            onClick={runScanNow}
            className="flex items-center gap-1.5 rounded border border-border bg-secondary/50 px-2.5 py-1 text-xs font-mono text-foreground hover:bg-secondary transition-colors"
          >
            <Play className="h-3 w-3" />
            Run scan now
          </button>

          <button
            onClick={() => refetch()}
            disabled={loading}
            className="p-1.5 rounded hover:bg-secondary/50 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-3">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-xs font-mono text-destructive">Whale Watch error: {error}</p>
          </div>
        )}

        {loading && (
          <div className="rounded-lg border border-border bg-card/50 p-6 text-center">
            <p className="text-xs font-mono text-muted-foreground">Loading whale signals…</p>
          </div>
        )}

        {!loading && rows.length === 0 && (
          <div className="rounded-lg border border-border bg-card/50 p-6 text-center space-y-2">
            <p className="text-sm font-mono text-muted-foreground">No whale signals yet.</p>
            <p className="text-[10px] font-mono text-muted-foreground">
              Waiting for the first detection. If this stays empty, the Whale Watch engine is not emitting data.
            </p>
          </div>
        )}

        {rows.length > 0 && (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-mono">When</th>
                    <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-mono">Type</th>
                    <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-mono hidden sm:table-cell">Source</th>
                    <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-mono">Asset</th>
                    <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-mono hidden md:table-cell">Size</th>
                    <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-mono hidden lg:table-cell">Entity</th>
                    <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-mono">Severity</th>
                    <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-mono hidden xl:table-cell">Chain</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <WhaleWatchRow key={s.id} signal={s} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <div className="rounded-lg border border-border bg-card/50 p-3">
        <p className="text-[10px] font-mono text-muted-foreground">
          ⚠ Whale signals are derived from exchange order-flow and on-chain inference.
          Entity labels are community-sourced and may be incorrect. Always verify independently.
        </p>
      </div>
    </div>
  );
}
