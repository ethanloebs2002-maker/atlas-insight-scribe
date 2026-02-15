import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Zap } from "lucide-react";
import { useBestTimeframe } from "@/hooks/use-auto-eval";

interface BestTimeframeBadgeProps {
  asset?: string;
}

export default function BestTimeframeBadge({ asset }: BestTimeframeBadgeProps) {
  const { data: bestTfRes } = useBestTimeframe(asset);
  const bestTf = bestTfRes?.data;

  if (!bestTf || !asset) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="text-[10px] font-mono gap-1 border-primary/30 text-primary">
            <Zap className="h-3 w-3" />
            Best TF: {bestTf.timeframe}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="text-xs font-mono">
          <p>Selected by win-rate policy ({bestTf.mode})</p>
          <p className="text-muted-foreground">Score: {(bestTf.score || 0).toFixed(3)}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
