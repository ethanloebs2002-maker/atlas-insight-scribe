import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, BarChart3, PieChart } from "lucide-react";

function NotWiredMessage({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-xs font-mono text-muted-foreground">{message}</p>
    </div>
  );
}

export default function PortfolioDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 overflow-y-auto">
        <SheetHeader className="px-4 pt-4 pb-2 border-b border-border">
          <SheetTitle className="text-sm font-mono">Portfolio Overview</SheetTitle>
        </SheetHeader>

        <div className="p-4 space-y-4">
          {/* Summary strip */}
          <Card>
            <CardContent className="py-3 px-4 space-y-2">
              <div className="grid grid-cols-2 gap-3 text-[10px] font-mono">
                <div>
                  <span className="text-muted-foreground">Starting Capital</span>
                  <div className="text-sm font-bold">$100,000.00</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Available Cash</span>
                  <div className="text-sm font-bold text-muted-foreground/60 italic">DATA NOT AVAILABLE</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Capital Locked in Trades</span>
                  <div className="text-sm font-bold text-muted-foreground/60 italic">DATA NOT AVAILABLE</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Equity</span>
                  <div className="text-sm font-bold text-muted-foreground/60 italic">DATA NOT AVAILABLE</div>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Total Profit / Loss</span>
                  <div className="text-sm font-bold text-muted-foreground/60 italic">DATA NOT AVAILABLE</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Equity Curve */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3" />
                Equity Curve
              </CardTitle>
            </CardHeader>
            <CardContent>
              <NotWiredMessage message="Portfolio equity tracking is not wired yet." />
            </CardContent>
          </Card>

          {/* Exposure by Asset */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <PieChart className="h-3 w-3" />
                Exposure by Asset
              </CardTitle>
            </CardHeader>
            <CardContent>
              <NotWiredMessage message="Portfolio exposure tracking is not wired yet." />
            </CardContent>
          </Card>

          {/* Realized vs Unrealized */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <BarChart3 className="h-3 w-3" />
                Realized vs Unrealized Profit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <NotWiredMessage message="Realized vs unrealized profit tracking is not wired yet." />
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
}
