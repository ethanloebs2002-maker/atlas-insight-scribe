import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function PendingApproval() {
  const { signOut, profile } = useAuth();

  return (
    <div className="min-h-screen bg-background grid-bg scanline flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="pt-8 pb-6 space-y-4">
          <ShieldAlert className="h-12 w-12 text-neutral-signal mx-auto" />
          <h2 className="text-sm font-mono font-bold text-foreground">ACCESS PENDING APPROVAL</h2>
          <p className="text-xs font-mono text-muted-foreground leading-relaxed">
            Your account ({profile?.email}) has been created but is not yet active.
            An administrator must approve your access before you can use ATLAS.
          </p>
          <Button variant="outline" size="sm" className="font-mono text-xs gap-1.5" onClick={signOut}>
            <LogOut className="h-3 w-3" />
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
