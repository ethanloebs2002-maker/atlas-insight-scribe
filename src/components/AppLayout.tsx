import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Activity, Search, BarChart3, Anchor, Users, FlaskConical } from 'lucide-react';

const navItems = [
  { to: '/', label: 'Search', icon: Search },
  { to: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { to: '/whale-watch', label: 'Whale Watch', icon: Anchor },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background grid-bg scanline">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-primary animate-pulse-glow" />
            <span className="font-mono text-sm font-bold tracking-widest text-primary">ATLAS</span>
            <span className="hidden sm:inline text-xs text-muted-foreground font-mono ml-1">v0.1</span>
          </div>

          <nav className="flex items-center gap-1">
            {navItems.map(({ to, label, icon: Icon }) => {
              const active = location.pathname === to;
              return (
                <Link
                  key={to}
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
              );
            })}
          </nav>

          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <span className="hidden md:inline">NOT FINANCIAL ADVICE</span>
            <span className="h-2 w-2 rounded-full bg-bullish animate-pulse-glow" />
          </div>
        </div>
      </header>

      <main className="container py-6">
        {children}
      </main>
    </div>
  );
}
