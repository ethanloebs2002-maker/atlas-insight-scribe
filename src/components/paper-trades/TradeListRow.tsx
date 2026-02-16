import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { TradeVM } from "@/types/trade-vm";

/** Formats a price as $X,XXX or — if null */
function fmtPrice(v: number | null | undefined): string {
  if (v == null) return "—";
  return `$${v.toLocaleString()}`;
}

function timeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

const STATUS_STYLE: Record<string, string> = {
  PROPOSED: "bg-secondary text-muted-foreground",
  PENDING_ENTRY: "bg-primary/20 text-primary",
  OPEN: "bg-bullish/10 text-bullish border-bullish",
  CLOSED: "bg-muted text-muted-foreground",
};

const SIDE_STYLE: Record<string, string> = {
  LONG: "bg-bullish/10 text-bullish border-bullish",
  SHORT: "bg-bearish/10 text-bearish border-bearish",
};

export default function TradeListRow({
  vm,
  selected,
  onClick,
}: {
  vm: TradeVM;
  selected: boolean;
  onClick: () => void;
}) {
  const entryLabel = vm.levels.entry.label;
  const entryVal = fmtPrice(vm.levels.entry.value);
  const tp = fmtPrice(vm.prices.tp);
  const sl = fmtPrice(vm.prices.sl);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-md border p-2.5 transition-colors cursor-pointer ${
        selected ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/50"
      }`}
    >
      {/* Row 1: Symbol, Side, Status, Probability */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[10px] font-mono font-bold shrink-0">{vm.symbol}</span>
        <Badge variant="outline" className={`text-[8px] font-mono py-0 h-4 ${SIDE_STYLE[vm.side]}`}>
          {vm.side}
        </Badge>
        <Badge variant="outline" className={`text-[8px] font-mono py-0 h-4 ${STATUS_STYLE[vm.status]}`}>
          {vm.status.replace("_", " ")}
        </Badge>
        <span className="text-[10px] font-mono font-bold">{vm.probability.displayPct}%</span>
        {vm.probability.source !== "model" && (
          <span className="text-[8px] font-mono text-muted-foreground">({vm.probability.source})</span>
        )}
        <div className="flex-1" />
        {vm.performance?.outcome && (
          <Badge
            variant="outline"
            className={`text-[8px] font-mono ${
              vm.performance.outcome === "TP" ? "text-bullish border-bullish" :
              vm.performance.outcome === "SL" ? "text-bearish border-bearish" : ""
            }`}
          >
            {vm.performance.outcome}
          </Badge>
        )}
        {vm.performance?.realizedR != null && (
          <span className={`text-[10px] font-mono font-bold ${vm.performance.realizedR >= 0 ? "text-bullish" : "text-bearish"}`}>
            {vm.performance.realizedR.toFixed(3)}R
          </span>
        )}
      </div>

      {/* Row 2: Key levels + time */}
      <div className="flex items-center gap-1.5 mt-1 text-[9px] font-mono text-muted-foreground flex-wrap">
        <Badge variant="secondary" className="text-[8px] font-mono py-0 h-4">{vm.timeframe}</Badge>
        <Badge variant="secondary" className="text-[8px] font-mono py-0 h-4">{vm.horizon}</Badge>
        {vm.resolutionWindow && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[8px] font-mono py-0 h-4 text-muted-foreground border-dashed">
                  ⏱ {vm.resolutionWindow.label}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-[9px] font-mono max-w-[200px]">
                <p className="font-bold">Resolution Window (derived)</p>
                <p className="text-muted-foreground">{vm.resolutionWindow.derivedFrom}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <span className="text-muted-foreground/40">•</span>
        <span>{entryLabel} {entryVal}</span>
        <span className="text-muted-foreground/40">•</span>
        <span className="text-bearish">SL {sl}</span>
        <span className="text-muted-foreground/40">•</span>
        <span className="text-bullish">TP {tp}</span>
        {vm.status === "CLOSED" && vm.prices.exit != null && (
          <>
            <span className="text-muted-foreground/40">→</span>
            <span>Exit {fmtPrice(vm.prices.exit)}</span>
          </>
        )}
        <span className="ml-auto text-muted-foreground/60 shrink-0">
          {timeSince(vm.timestamps.decidedAt)}
        </span>
      </div>
    </button>
  );
}
