import { useState } from "react";
import { Wallet, ChevronDown } from "lucide-react";
import HelpTooltip from "@/components/HelpTooltip";
import PortfolioDrawer from "@/components/PortfolioDrawer";

const STARTING_CAPITAL = 100_000;

function PortfolioField({ label, value, tooltipId }: { label: string; value: string; tooltipId: string }) {
  const isUnavailable = value === "DATA NOT AVAILABLE";
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{label}:</span>
      <span className={isUnavailable ? "text-muted-foreground/60 italic" : "text-foreground font-bold"}>
        {value}
      </span>
      <HelpTooltip id={tooltipId} iconSize="h-2.5 w-2.5" />
    </div>
  );
}

export default function PortfolioBar() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // All portfolio values are DATA NOT AVAILABLE until backend wires them
  // Starting capital is a known constant
  const availableCash = "DATA NOT AVAILABLE";
  const capitalLocked = "DATA NOT AVAILABLE";
  const equity = "DATA NOT AVAILABLE";
  const totalPnl = "DATA NOT AVAILABLE";

  return (
    <>
      <div className="flex items-center gap-3 text-[10px] font-mono flex-wrap">
        <HelpTooltip id="portfolio-bar">
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-1 text-primary hover:text-primary/80 transition-colors cursor-pointer"
          >
            <Wallet className="h-3.5 w-3.5" />
            <span className="font-bold">Portfolio</span>
            <ChevronDown className="h-2.5 w-2.5" />
          </button>
        </HelpTooltip>

        <div className="h-3 w-px bg-border" />

        <PortfolioField
          label="Starting Capital"
          value={`$${STARTING_CAPITAL.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          tooltipId="portfolio-starting-capital"
        />

        <div className="hidden md:contents">
          <div className="h-3 w-px bg-border" />
          <PortfolioField label="Available Cash" value={availableCash} tooltipId="portfolio-available-cash" />
          <div className="h-3 w-px bg-border" />
          <PortfolioField label="Capital Locked in Trades" value={capitalLocked} tooltipId="portfolio-capital-locked" />
          <div className="h-3 w-px bg-border" />
          <PortfolioField label="Equity" value={equity} tooltipId="portfolio-equity" />
          <div className="h-3 w-px bg-border" />
          <PortfolioField label="Total Profit / Loss" value={totalPnl} tooltipId="portfolio-total-pnl" />
        </div>
      </div>

      <PortfolioDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </>
  );
}
