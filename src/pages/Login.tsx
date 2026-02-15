import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(error.message);
    }
    setLoading(false);
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Check your email for a confirmation link.");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-background grid-bg scanline flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Activity className="h-6 w-6 text-primary animate-pulse-glow" />
            <span className="font-mono text-lg font-bold tracking-widest text-primary">ATLAS</span>
          </div>
          <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Authentication Required
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="space-y-4">
            <TabsList className="w-full font-mono text-xs">
              <TabsTrigger value="login" className="flex-1 text-xs">Sign In</TabsTrigger>
              <TabsTrigger value="signup" className="flex-1 text-xs">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-mono">Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="operator@atlas.dev"
                    className="font-mono text-sm"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-mono">Password</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="font-mono text-sm"
                    required
                  />
                </div>
                <Button type="submit" className="w-full font-mono text-xs" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-mono">Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="operator@atlas.dev"
                    className="font-mono text-sm"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-mono">Password</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="font-mono text-sm"
                    minLength={6}
                    required
                  />
                </div>
                <Button type="submit" className="w-full font-mono text-xs" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Account"}
                </Button>
                <p className="text-[10px] font-mono text-muted-foreground text-center">
                  After signup, an admin must activate your account before you can access the system.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
