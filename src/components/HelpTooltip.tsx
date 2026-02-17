import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import { getTooltip } from "@/lib/tooltip-registry";

interface HelpTooltipProps {
  id: string;
  /** Override registry text */
  text?: string;
  className?: string;
  iconSize?: string;
  side?: "top" | "bottom" | "left" | "right";
  children?: React.ReactNode;
}

/**
 * Renders a small help icon with tooltip text from the global registry.
 * If `children` are provided, wraps them as the trigger instead of the icon.
 */
export default function HelpTooltip({ id, text, className, iconSize = "h-3 w-3", side = "top", children }: HelpTooltipProps) {
  const tooltipText = text ?? getTooltip(id);
  if (!tooltipText) return children ?? null;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {children ?? (
            <span className={`inline-flex items-center cursor-help ${className ?? ""}`}>
              <HelpCircle className={`${iconSize} text-muted-foreground/50 hover:text-muted-foreground transition-colors`} />
            </span>
          )}
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-[280px] text-[10px] font-mono leading-relaxed">
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
