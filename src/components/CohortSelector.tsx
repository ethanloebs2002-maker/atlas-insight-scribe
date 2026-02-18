import { useCohort, COHORTS, type CohortMode } from "@/hooks/use-cohort";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { GitCompareArrows } from "lucide-react";

export default function CohortSelector() {
  const { cohortId, setCohortId, mode, setMode } = useCohort();

  const selectorValue = mode === "all" ? "__all__" : (cohortId ?? "__all__");

  return (
    <div className="flex items-center gap-2">
      <Select
        value={selectorValue}
        onValueChange={(v) => {
          if (v === "__all__") {
            setMode("all");
          } else {
            setMode("single");
            setCohortId(v);
          }
        }}
        disabled={mode === "compare"}
      >
        <SelectTrigger className="w-28 h-7 text-[10px] font-mono">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={COHORTS.brain}>Brain Online</SelectItem>
          <SelectItem value={COHORTS.legacy}>Legacy</SelectItem>
          <SelectItem value="__all__">All Cohorts</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1">
        <GitCompareArrows className="h-3 w-3 text-muted-foreground" />
        <span className="text-[9px] font-mono text-muted-foreground">Compare</span>
        <Switch
          checked={mode === "compare"}
          onCheckedChange={(checked) => setMode(checked ? "compare" : "single")}
          className="scale-75"
        />
      </div>
    </div>
  );
}
