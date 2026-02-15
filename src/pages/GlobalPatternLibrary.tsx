import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Globe, RefreshCw, Flag, FlagOff, MessageSquare, ChevronRight } from "lucide-react";
import {
  useGlobalPatterns,
  usePatternEvidence,
  usePatternAuditLog,
  useValidateGPR,
  useAddAuditNote,
  type GlobalPattern,
} from "@/hooks/use-gpr";

const STATUS_COLORS: Record<string, string> = {
  LOCAL_ONLY: "bg-muted text-muted-foreground",
  CANDIDATE: "bg-neutral-signal/10 text-neutral-signal border-neutral-signal",
  PUBLISHED: "bg-bullish/10 text-bullish border-bullish",
  DEPRECATED: "bg-bearish/10 text-bearish border-bearish",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`font-mono text-[10px] ${STATUS_COLORS[status] || ""}`}>
      {status}
    </Badge>
  );
}

function PatternDetail({ pattern }: { pattern: GlobalPattern }) {
  const { data: evidence } = usePatternEvidence(pattern.signature_hash);
  const { data: auditLog } = usePatternAuditLog(pattern.signature_hash);
  const addNote = useAddAuditNote();
  const [note, setNote] = useState("");
  const [actionType, setActionType] = useState("NOTE_ONLY");

  const handleSubmitNote = () => {
    if (!note.trim()) return;
    addNote.mutate({ signature_hash: pattern.signature_hash, reviewer_note: note, action_type: actionType });
    setNote("");
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <StatusBadge status={pattern.publish_status} />
          <span className="font-mono text-xs text-muted-foreground">{pattern.signature_hash}</span>
        </div>
        <p className="font-mono text-sm text-foreground">{pattern.description_snippet}</p>
        <div className="grid grid-cols-2 gap-3 text-xs font-mono">
          <div>
            <span className="text-muted-foreground">Assets tested:</span>{" "}
            <span className="text-foreground">{pattern.assets_tested_n}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Assets success:</span>{" "}
            <span className="text-bullish">{pattern.assets_success_n}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Mean DirAcc↑:</span>{" "}
            <span className={Number(pattern.mean_diracc_uplift) > 0 ? "text-bullish" : "text-bearish"}>
              {(Number(pattern.mean_diracc_uplift) * 100).toFixed(2)}%
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Mean EV↑:</span>{" "}
            <span className={Number(pattern.mean_ev_uplift) > 0 ? "text-bullish" : "text-bearish"}>
              {Number(pattern.mean_ev_uplift).toFixed(3)}R
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Portability:</span>{" "}
            <span className="text-foreground">{(Number(pattern.portability_score) * 100).toFixed(1)}%</span>
          </div>
          <div>
            <span className="text-muted-foreground">Stability:</span>{" "}
            <span className="text-foreground">{(Number(pattern.stability_score) * 100).toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Evidence Table */}
      <div>
        <h4 className="font-mono text-xs text-muted-foreground mb-2">Evidence by Asset</h4>
        {evidence?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-mono text-xs">Asset</TableHead>
                <TableHead className="font-mono text-xs">Decisions</TableHead>
                <TableHead className="font-mono text-xs">Trades</TableHead>
                <TableHead className="font-mono text-xs">DirAcc↑</TableHead>
                <TableHead className="font-mono text-xs">EV↑</TableHead>
                <TableHead className="font-mono text-xs">Stability</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {evidence.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">{e.asset_id}</TableCell>
                  <TableCell className="font-mono text-xs">{e.support_n_decisions}</TableCell>
                  <TableCell className="font-mono text-xs">{e.support_n_trades}</TableCell>
                  <TableCell className={`font-mono text-xs ${Number(e.diracc_uplift) > 0 ? "text-bullish" : "text-bearish"}`}>
                    {(Number(e.diracc_uplift) * 100).toFixed(2)}%
                  </TableCell>
                  <TableCell className={`font-mono text-xs ${Number(e.ev_uplift) > 0 ? "text-bullish" : "text-bearish"}`}>
                    {Number(e.ev_uplift).toFixed(3)}R
                  </TableCell>
                  <TableCell className="font-mono text-xs">{(Number(e.stability_score) * 100).toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-xs text-muted-foreground font-mono">No evidence yet</p>
        )}
      </div>

      {/* Audit Log */}
      <div>
        <h4 className="font-mono text-xs text-muted-foreground mb-2">Audit Notes</h4>
        {auditLog?.length ? (
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {auditLog.map((a) => (
              <div key={a.id} className="rounded border border-border p-2 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{a.action_type}</Badge>
                  <span className="text-muted-foreground">{new Date(a.created_ts).toLocaleDateString()}</span>
                </div>
                <p className="mt-1 text-foreground">{a.reviewer_note}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground font-mono">No audit notes</p>
        )}
      </div>

      {/* Add Note */}
      <div className="space-y-2 border-t border-border pt-4">
        <h4 className="font-mono text-xs text-muted-foreground">Add Audit Note</h4>
        <div className="flex gap-2">
          <Select value={actionType} onValueChange={setActionType}>
            <SelectTrigger className="w-32 h-8 text-xs font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NOTE_ONLY"><MessageSquare className="inline h-3 w-3 mr-1" />Note</SelectItem>
              <SelectItem value="FLAG"><Flag className="inline h-3 w-3 mr-1" />Flag</SelectItem>
              <SelectItem value="UNFLAG"><FlagOff className="inline h-3 w-3 mr-1" />Unflag</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Enter audit note..."
          className="font-mono text-xs min-h-[60px]"
        />
        <Button size="sm" onClick={handleSubmitNote} disabled={!note.trim() || addNote.isPending}>
          {addNote.isPending ? "Saving..." : "Submit Note"}
        </Button>
      </div>
    </div>
  );
}

export default function GlobalPatternLibrary() {
  const [statusFilter, setStatusFilter] = useState("");
  const [tfFilter, setTfFilter] = useState("");
  const [regimeFilter, setRegimeFilter] = useState("");
  const [selectedPattern, setSelectedPattern] = useState<GlobalPattern | null>(null);

  const { data: patterns, isLoading } = useGlobalPatterns({
    publish_status: statusFilter || undefined,
    timeframe_class: tfFilter || undefined,
    regime_label: regimeFilter || undefined,
  });

  const validate = useValidateGPR();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Globe className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold font-mono tracking-tight">Global Pattern Library</h1>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => validate.mutate()}
          disabled={validate.isPending}
          className="font-mono text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${validate.isPending ? "animate-spin" : ""}`} />
          Validate & Publish
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-8 text-xs font-mono">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All statuses</SelectItem>
            <SelectItem value="LOCAL_ONLY">LOCAL_ONLY</SelectItem>
            <SelectItem value="CANDIDATE">CANDIDATE</SelectItem>
            <SelectItem value="PUBLISHED">PUBLISHED</SelectItem>
            <SelectItem value="DEPRECATED">DEPRECATED</SelectItem>
          </SelectContent>
        </Select>

        <Select value={tfFilter} onValueChange={setTfFilter}>
          <SelectTrigger className="w-36 h-8 text-xs font-mono">
            <SelectValue placeholder="All timeframes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All timeframes</SelectItem>
            <SelectItem value="intraday">Intraday</SelectItem>
            <SelectItem value="swing">Swing</SelectItem>
            <SelectItem value="HTF">HTF</SelectItem>
          </SelectContent>
        </Select>

        <Select value={regimeFilter} onValueChange={setRegimeFilter}>
          <SelectTrigger className="w-32 h-8 text-xs font-mono">
            <SelectValue placeholder="All regimes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All regimes</SelectItem>
            <SelectItem value="trend">Trend</SelectItem>
            <SelectItem value="range">Range</SelectItem>
            <SelectItem value="chop">Chop</SelectItem>
            <SelectItem value="Unknown">Unknown</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="font-mono text-sm">
            {isLoading ? "Loading..." : `${patterns?.length ?? 0} patterns`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-mono text-xs">Signature</TableHead>
                <TableHead className="font-mono text-xs">Status</TableHead>
                <TableHead className="font-mono text-xs">Description</TableHead>
                <TableHead className="font-mono text-xs text-right">Assets</TableHead>
                <TableHead className="font-mono text-xs text-right">DirAcc↑</TableHead>
                <TableHead className="font-mono text-xs text-right">EV↑</TableHead>
                <TableHead className="font-mono text-xs text-right">Stability</TableHead>
                <TableHead className="font-mono text-xs text-right">Portability</TableHead>
                <TableHead className="font-mono text-xs" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {patterns?.map((p) => (
                <Sheet key={p.signature_hash}>
                  <SheetTrigger asChild>
                    <TableRow
                      className="cursor-pointer hover:bg-secondary/50"
                      onClick={() => setSelectedPattern(p)}
                    >
                      <TableCell className="font-mono text-xs text-primary">{p.signature_hash.slice(0, 12)}</TableCell>
                      <TableCell><StatusBadge status={p.publish_status} /></TableCell>
                      <TableCell className="font-mono text-xs max-w-[200px] truncate">{p.description_snippet}</TableCell>
                      <TableCell className="font-mono text-xs text-right">
                        {p.assets_success_n}/{p.assets_tested_n}
                      </TableCell>
                      <TableCell className={`font-mono text-xs text-right ${Number(p.mean_diracc_uplift) > 0 ? "text-bullish" : "text-bearish"}`}>
                        {(Number(p.mean_diracc_uplift) * 100).toFixed(2)}%
                      </TableCell>
                      <TableCell className={`font-mono text-xs text-right ${Number(p.mean_ev_uplift) > 0 ? "text-bullish" : "text-bearish"}`}>
                        {Number(p.mean_ev_uplift).toFixed(3)}R
                      </TableCell>
                      <TableCell className="font-mono text-xs text-right">{(Number(p.stability_score) * 100).toFixed(1)}%</TableCell>
                      <TableCell className="font-mono text-xs text-right">{(Number(p.portability_score) * 100).toFixed(1)}%</TableCell>
                      <TableCell><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></TableCell>
                    </TableRow>
                  </SheetTrigger>
                  <SheetContent className="w-[500px] sm:w-[600px] overflow-y-auto">
                    <SheetHeader>
                      <SheetTitle className="font-mono text-sm">Pattern Detail</SheetTitle>
                    </SheetHeader>
                    {selectedPattern?.signature_hash === p.signature_hash && (
                      <PatternDetail pattern={p} />
                    )}
                  </SheetContent>
                </Sheet>
              ))}
              {!isLoading && !patterns?.length && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-xs font-mono text-muted-foreground py-8">
                    No patterns in the global registry yet. Run pattern mining across multiple assets to populate.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
