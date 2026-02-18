import { useCohort, COHORTS } from "@/hooks/use-cohort";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export default function CohortSelector() {
  const { cohortId, setCohortId, mode, setMode, includeLegacy, setIncludeLegacy } = useCohort();

  const selectorValue = mode === "all" ? "__all__" : (cohortId ?? COHORTS.brain);
  const isBrain = mode !== "all" && cohortId === COHORTS.brain;

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

      {isBrain && (
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-mono text-muted-foreground">+Legacy</span>
          <Switch
            checked={includeLegacy}
            onCheckedChange={setIncludeLegacy}
            className="scale-75"
          />
        </div>
      )}
    </div>
  );
}
