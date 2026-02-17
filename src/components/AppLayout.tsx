import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Activity, Search, BarChart3, Anchor, FlaskConical, Newspaper, Brain, Globe, LogOut } from 'lucide-react';
import SystemStatusBanner from '@/components/SystemStatusBanner';
import PortfolioBar from '@/components/PortfolioBar';
import HelpTooltip from '@/components/HelpTooltip';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';

const navItems = [
  { to: '/', label: 'Search', icon: Search, tooltipId: 'nav-search' },
  { to: '/dashboard', label: 'Dashboard', icon: BarChart3, tooltipId: 'nav-dashboard' },
  { to: '/whale-watch', label: 'Whale Watch', icon: Anchor, tooltipId: 'nav-whale-watch' },
  { to: '/paper-trades', label: 'Paper Trades', icon: FlaskConical, tooltipId: 'nav-paper-trades' },
  { to: '/news', label: 'News Intel', icon: Newspaper, tooltipId: 'nav-news-intel' },
  { to: '/meta', label: 'Meta', icon: Brain, tooltipId: 'nav-meta' },
  { to: '/gpr', label: 'GPR', icon: Globe, tooltipId: 'nav-gpr' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { profile, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background grid-bg scanline">
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-primary animate-pulse-glow" />
            <span className="font-mono text-sm font-bold tracking-widest text-primary">ATLAS</span>
            <span className="hidden sm:inline text-xs text-muted-foreground font-mono ml-1">v2.0</span>
            <SystemStatusBanner compact />
          </div>

          <nav className="flex items-center gap-1">
            {navItems.map(({ to, label, icon: Icon, tooltipId }) => {
              const active = location.pathname === to;
              return (
                <HelpTooltip key={to} id={tooltipId} side="bottom">
                  <Link
                    to={to}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-colors',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{label}</span>
                  </Link>
                </HelpTooltip>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            {profile && (
              <span className="hidden md:inline truncate max-w-[120px]">{profile.email}</span>
            )}
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={signOut}>
              <LogOut className="h-3.5 w-3.5" />
            </Button>
            <span className="h-2 w-2 rounded-full bg-bullish animate-pulse-glow" />
          </div>
        </div>

        {/* Portfolio Bar — persistent, visible on all pages */}
        <div className="container border-t border-border/50 py-1.5">
          <PortfolioBar />
        </div>
      </header>

      <main className="container py-6">
        {children}
      </main>
    </div>
  );
}
