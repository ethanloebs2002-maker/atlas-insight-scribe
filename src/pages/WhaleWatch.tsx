import { mockWhales } from '@/data/mockData';
import WhaleTable from '@/components/WhaleTable';
import { Anchor } from 'lucide-react';

export default function WhaleWatch() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Anchor className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-lg font-bold text-foreground">Whale Watch</h1>
          <p className="text-xs text-muted-foreground font-mono">Track historically successful large participants</p>
        </div>
      </div>
      <WhaleTable whales={mockWhales} />
      <div className="rounded-lg border border-border bg-card/50 p-3">
        <p className="text-[10px] font-mono text-muted-foreground">
          Whale tracking uses on-chain inference. Wallet labels are community-sourced and may be incorrect.
          Trade attribution has inherent uncertainty — always verify independently.
        </p>
      </div>
    </div>
  );
}
