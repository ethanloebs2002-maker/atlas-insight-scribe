import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Bot, User, Eye, MessageSquare } from "lucide-react";
import { useAdminMessages, useSendAdminMessage, useMarkMessageRead, useAtlasRespond } from "@/hooks/use-meta-engine";

const SEVERITY_COLORS: Record<string, string> = {
  info: "bg-primary/10 text-primary",
  watch: "bg-neutral-signal/10 text-neutral-signal",
  important: "bg-bearish/10 text-bearish",
};

const CATEGORY_ICONS: Record<string, string> = {
  maturity: "🧠",
  warning: "⚠️",
  audit: "📊",
  manual: "💬",
};

export default function AdminChat() {
  const { data: messages, isLoading } = useAdminMessages();
  const sendMutation = useSendAdminMessage();
  const markReadMutation = useMarkMessageRead();
  const respondMutation = useAtlasRespond();

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    sendMutation.mutate({ title: "Admin Message", body: input });
    setInput("");
  };

  const handleAskAtlas = (msgId: string) => {
    respondMutation.mutate({ messageId: msgId, assetId: "BTC" });
  };

  const sortedMessages = [...(messages || [])].sort(
    (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const unreadCount = (messages || []).filter((m: any) => !m.read && m.sender_type === "atlas").length;

  return (
    <Card className="border-border/50 bg-card/50 flex flex-col h-[600px]">
      <CardHeader className="pb-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-mono flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5 text-primary" />
            ADMIN ↔ ATLAS CHANNEL
          </CardTitle>
          {unreadCount > 0 && (
            <Badge className="bg-bearish/20 text-bearish text-[9px]">{unreadCount} unread</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden p-3">
        <ScrollArea className="flex-1 pr-2" ref={scrollRef}>
          <div className="space-y-3">
            {isLoading && <p className="text-[10px] font-mono text-muted-foreground text-center">Loading messages...</p>}
            {sortedMessages.map((msg: any) => (
              <div
                key={msg.id}
                className={`flex gap-2 ${msg.sender_type === "admin" ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[85%] ${msg.sender_type === "admin" ? "order-1" : ""}`}>
                  <div className={`rounded-lg p-2.5 text-[11px] font-mono ${
                    msg.sender_type === "atlas"
                      ? "bg-secondary/50 border border-border/30"
                      : "bg-primary/10 border border-primary/20"
                  }`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      {msg.sender_type === "atlas" ? (
                        <Bot className="h-3 w-3 text-primary" />
                      ) : (
                        <User className="h-3 w-3 text-muted-foreground" />
                      )}
                      <span className="text-[9px] text-muted-foreground">
                        {msg.sender_type === "atlas" ? "ATLAS" : "Admin"}
                      </span>
                      <span className="text-[8px] text-muted-foreground ml-auto">
                        {CATEGORY_ICONS[msg.category] || ""} 
                      </span>
                      <Badge className={`text-[8px] px-1 py-0 ${SEVERITY_COLORS[msg.severity] || ""}`}>
                        {msg.severity}
                      </Badge>
                    </div>
                    {msg.title !== "Admin Message" && (
                      <p className="font-bold text-[10px] mb-1">{msg.title}</p>
                    )}
                    <div className="text-foreground/80 whitespace-pre-wrap leading-relaxed">
                      {msg.body_markdown}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 px-1">
                    <span className="text-[8px] text-muted-foreground">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {msg.sender_type === "atlas" && !msg.read && (
                      <button
                        onClick={() => markReadMutation.mutate(msg.id)}
                        className="text-[8px] text-primary hover:underline ml-1"
                      >
                        <Eye className="h-2.5 w-2.5 inline" /> mark read
                      </button>
                    )}
                    {msg.sender_type === "admin" && (
                      <button
                        onClick={() => handleAskAtlas(msg.id)}
                        className="text-[8px] text-primary hover:underline ml-1"
                        disabled={respondMutation.isPending}
                      >
                        <Bot className="h-2.5 w-2.5 inline" /> ask ATLAS
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {respondMutation.isPending && (
              <div className="flex gap-2">
                <div className="bg-secondary/50 border border-border/30 rounded-lg p-2.5 text-[10px] font-mono text-muted-foreground animate-pulse">
                  <Bot className="h-3 w-3 text-primary inline mr-1" />
                  ATLAS is thinking...
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex gap-2 pt-2 mt-2 border-t border-border/30 flex-shrink-0">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Message ATLAS..."
            className="text-xs font-mono h-8 bg-secondary/30"
          />
          <Button
            size="sm"
            className="h-8 w-8 p-0"
            onClick={handleSend}
            disabled={sendMutation.isPending || !input.trim()}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
