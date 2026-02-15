import type { EvidenceRow } from '@/types/atlas';

export default function EvidenceTable({ evidence }: { evidence: EvidenceRow[] }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-slide-up">
      <div className="px-4 py-3 border-b border-border">
        <span className="text-xs font-mono font-bold uppercase tracking-wider text-foreground">Evidence Table</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px]">Signal</th>
              <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px]">Value</th>
              <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] hidden md:table-cell">Interpretation</th>
              <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px]">TF</th>
              <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px]">Weight</th>
              <th className="px-3 py-2 text-left text-muted-foreground uppercase tracking-wider text-[10px] hidden sm:table-cell">Source</th>
            </tr>
          </thead>
          <tbody>
            {evidence.map((row, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                <td className="px-3 py-2 text-foreground">{row.signal}</td>
                <td className="px-3 py-2 text-primary">{row.value}</td>
                <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{row.interpretation}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.timeframe}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <div className="h-1 w-8 rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${row.weight * 100}%` }} />
                    </div>
                    <span className="text-muted-foreground">{row.weight}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">{row.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
