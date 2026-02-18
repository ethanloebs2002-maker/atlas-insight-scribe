import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  Activity, Search, BarChart3, Anchor, FlaskConical,
  Newspaper, Brain, Globe, Dna, LogOut,
  ChevronDown, PanelLeftClose, PanelLeft, Archive,
} from 'lucide-react';
import SystemStatusBanner from '@/components/SystemStatusBanner';
import PortfolioBar from '@/components/PortfolioBar';
import CohortSelector from '@/components/CohortSelector';
import { useAuth } from '@/hooks/use-auth';
import { isLegacyUnlocked } from '@/lib/legacyGate';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useState } from 'react';

/* ── Pillar-grouped navigation ─────────────────────── */

type NavGroup = {
  label: string;
  pillar?: 'backbone' | 'memory' | 'brain';
  items: { to: string; label: string; icon: typeof Activity }[];
};

function buildNavGroups(): NavGroup[] {
  const legacyVisible = isLegacyUnlocked();

  const memoryItems: NavGroup['items'] = [
    { to: '/paper-trades', label: 'Trade Memory', icon: FlaskConical },
  ];
  if (legacyVisible) {
    memoryItems.push({ to: '/archive', label: 'Archive', icon: Archive });
  }

  return [
    {
      label: 'Backbone',
      pillar: 'backbone',
      items: [
        { to: '/', label: 'Search', icon: Search },
        { to: '/dashboard', label: 'Market Health', icon: BarChart3 },
        { to: '/whale-watch', label: 'Whale Watch', icon: Anchor },
        { to: '/news', label: 'News Intel', icon: Newspaper },
        { to: '/gpr', label: 'Global Patterns', icon: Globe },
      ],
    },
    {
      label: 'Memory',
      pillar: 'memory',
      items: memoryItems,
    },
    {
      label: 'Brain',
      pillar: 'brain',
      items: [
        { to: '/meta', label: 'Meta-Cognition', icon: Brain },
        { to: '/strategy-lab', label: 'Strategy Lab', icon: Dna },
      ],
    },
  ];
}

const PILLAR_COLORS: Record<string, string> = {
  backbone: 'text-pillar-backbone',
  memory: 'text-pillar-memory',
  brain: 'text-pillar-brain',
};

const PILLAR_ACTIVE_BG: Record<string, string> = {
  backbone: 'bg-pillar-backbone/10',
  memory: 'bg-pillar-memory/10',
  brain: 'bg-pillar-brain/10',
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const navGroups = buildNavGroups();

  return (
    <div className="min-h-screen bg-background grid-bg scanline flex">
      {/* ── Sidebar ────────────────────────────────── */}
      <aside
        className={cn(
          'sticky top-0 h-screen flex flex-col border-r border-border bg-background/80 backdrop-blur-xl transition-[width] duration-200 z-50',
          collapsed ? 'w-14' : 'w-56',
        )}
      >
        {/* Brand */}
        <div className="flex h-14 items-center gap-2 px-3 border-b border-border shrink-0">
          <Activity className="h-5 w-5 text-primary animate-pulse-glow shrink-0" />
          {!collapsed && (
            <span className="font-mono text-sm font-bold tracking-widest text-primary">ATLAS</span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 w-7 p-0"
            onClick={() => setCollapsed(c => !c)}
          >
            {collapsed ? <PanelLeft className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {/* Nav groups */}
        <ScrollArea className="flex-1 py-2">
          <nav className="space-y-1 px-2">
            {navGroups.map(group => {
              const pillarColor = group.pillar ? PILLAR_COLORS[group.pillar] : 'text-muted-foreground';
              const activeBg = group.pillar ? PILLAR_ACTIVE_BG[group.pillar] : 'bg-primary/10';
              const hasActive = group.items.some(i => location.pathname === i.to);

              if (collapsed) {
                // Mini mode: just icons
                return (
                  <div key={group.label} className="space-y-0.5">
                    {group.items.map(({ to, icon: Icon }) => {
                      const active = location.pathname === to;
                      return (
                        <Link
                          key={to}
                          to={to}
                          className={cn(
                            'flex items-center justify-center h-8 w-full rounded-md transition-colors',
                            active ? cn(activeBg, pillarColor) : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </Link>
                      );
                    })}
                    <div className="my-1 border-b border-border/40" />
                  </div>
                );
              }

              // Expanded mode: collapsible groups
              return (
                <Collapsible key={group.label} defaultOpen={hasActive}>
                  <CollapsibleTrigger className="flex w-full items-center gap-2 px-2 py-1.5 rounded-md text-[10px] font-mono font-semibold uppercase tracking-widest hover:bg-secondary transition-colors">
                    <span className={pillarColor}>{group.label}</span>
                    <ChevronDown className="h-3 w-3 ml-auto text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-1 space-y-0.5 mt-0.5">
                      {group.items.map(({ to, label, icon: Icon }) => {
                        const active = location.pathname === to;
                        return (
                          <Link
                            key={to}
                            to={to}
                            className={cn(
                              'flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-mono transition-colors',
                              active
                                ? cn(activeBg, pillarColor)
                                : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
                            )}
                          >
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </nav>
        </ScrollArea>

        {/* User footer */}
        <div className="border-t border-border p-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-bullish animate-pulse-glow shrink-0" />
            {!collapsed && profile && (
              <span className="text-[10px] font-mono text-muted-foreground truncate flex-1">
                {profile.email}
              </span>
            )}
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={signOut}>
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar: status + portfolio */}
        <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
          <div className="flex h-10 items-center px-4 gap-3">
            <SystemStatusBanner compact />
            <div className="flex-1" />
            <CohortSelector />
          </div>
          <div className="px-4 border-t border-border/50 py-1.5">
            <PortfolioBar />
          </div>
        </header>

        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
