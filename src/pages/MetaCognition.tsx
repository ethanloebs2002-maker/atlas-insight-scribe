import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MaturityDashboard from "@/components/MaturityDashboard";
import AdminChat from "@/components/AdminChat";
import { useAuth } from "@/hooks/use-auth";
import { Brain } from "lucide-react";

const ASSETS = ["ALL", "BTC", "ETH", "SOL", "DOGE", "AVAX", "LINK", "ADA", "DOT", "XRP"];

export default function MetaCognition() {
  const [asset, setAsset] = useState("ALL");
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const assetParam = asset === "ALL" ? undefined : asset;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-mono font-bold tracking-wider flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            META-COGNITION
          </h1>
          <p className="text-xs font-mono text-muted-foreground">
            v1.8.1 — Epistemic Awareness · Maturity · Authority · Self-Evaluation
          </p>
        </div>
        <Select value={asset} onValueChange={setAsset}>
          <SelectTrigger className="w-[100px] h-8 text-xs font-mono">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASSETS.map(a => (
              <SelectItem key={a} value={a} className="text-xs font-mono">{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="maturity" className="space-y-4">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="maturity" className="text-[10px] font-mono">Maturity</TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="admin" className="text-[10px] font-mono">Admin Channel</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="maturity">
          <MaturityDashboard asset={assetParam} />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="admin">
            <AdminChat />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
