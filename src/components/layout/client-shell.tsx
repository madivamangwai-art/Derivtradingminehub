import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Home, Wallet, TrendingUp, Users, User, LogOut, Sun, Moon } from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import logoAsset from "@/assets/minehub-logo.png.asset.json";
import { useTheme } from "@/lib/theme";

const tabs = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/wallet", label: "Wallet", icon: Wallet },
  { to: "/trade", label: "Trade", icon: TrendingUp },
  { to: "/team", label: "Team", icon: Users },
  { to: "/my", label: "My", icon: User },
] as const;

export function ClientShell({ children, title, onLogoClick }: { children: ReactNode; title?: string; onLogoClick?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { theme, toggle } = useTheme();

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight">{title ?? "Deriv Trading MineHub"}</h1>
          <div className="flex items-center gap-2">
            {onLogoClick && (
              <button onClick={onLogoClick} aria-label="Deriv Trading MineHub" className="grid h-9 w-9 place-items-center overflow-hidden rounded-lg bg-slate-900 ring-1 ring-primary/40">
                <img
                  src={logoAsset.url}
                  alt="MineHub"
                  className="h-7 w-7 object-contain"
                  onError={(e) => {
                    const img = e.currentTarget as HTMLImageElement;
                    img.onerror = null;
                    img.src = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'><rect width='100%' height='100%' fill='%23111' rx='16'/><text x='50%' y='55%' font-size='36' fill='%23ffd54a' font-family='Arial,Helvetica,sans-serif' font-weight='700' text-anchor='middle' alignment-baseline='middle'>MH</text></svg>`)}`;
                  }}
                />
              </button>
            )}
            <button onClick={toggle} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button onClick={signOut} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 py-4">{children}</main>
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {tabs.map((t) => {
            const active = path === t.to || path.startsWith(t.to + "/");
            return (
              <Link key={t.to} to={t.to} className={`flex flex-col items-center gap-1 py-3 text-xs transition ${active ? "text-primary" : "text-muted-foreground"}`}>
                <t.icon className={`h-5 w-5 ${active ? "scale-110" : ""}`} />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
